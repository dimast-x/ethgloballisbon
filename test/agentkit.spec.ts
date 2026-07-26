import { describe, expect, it } from "vitest";
import {
  agentkitIntentHash,
  canonicalAgentkitIntent,
  type AgentkitProcurementIntent,
} from "../src/application/agentkit";
import { POST as protectedProcurement } from "../app/api/agents/agentkit/procure/route";
import { GET as agentManifest } from "../app/api/agents/agentkit/manifest/route";
import { POST as genericCommand } from "../app/api/programs/[programId]/commands/route";

const intent: AgentkitProcurementIntent = {
  programId: "program_1",
  agentId: "agent_1",
  offerId: "offer_1",
  action: "CREATE_ORDER",
};

describe("AgentKit procurement boundary", () => {
  it("advertises a stable agent API manifest", async () => {
    const response = await agentManifest();
    await expect(response.json()).resolves.toMatchObject({
      service: "yareon",
      apiVersion: "1",
      agentkit: { chainId: "eip155:480" },
    });
  });

  it("canonically binds the complete intent into the protected URI", () => {
    expect(canonicalAgentkitIntent(intent)).toBe(
      '{"action":"CREATE_ORDER","agentId":"agent_1","offerId":"offer_1","programId":"program_1"}',
    );
    expect(agentkitIntentHash(intent)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(
      agentkitIntentHash({ ...intent, offerId: "offer_changed" }),
    ).not.toBe(agentkitIntentHash(intent));
  });

  it("returns an AgentKit 402 challenge before any mutation", async () => {
    const url = new URL(
      "https://yareon.example/api/agents/agentkit/procure",
    );
    url.searchParams.set("intent", agentkitIntentHash(intent));
    const response = await protectedProcurement(
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(intent),
      }),
    );
    const body = (await response.json()) as {
      extensions?: { agentkit?: unknown };
    };
    expect(response.status).toBe(402);
    expect(body.extensions?.agentkit).toBeTruthy();
  });

  it("rejects a body that does not match the URI intent hash", async () => {
    const url = new URL(
      "https://yareon.example/api/agents/agentkit/procure",
    );
    url.searchParams.set("intent", agentkitIntentHash(intent));
    const response = await protectedProcurement(
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...intent, offerId: "tampered" }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects agent actors at the generic command API", async () => {
    const response = await genericCommand(
      new Request("https://yareon.example/api/programs/program_1/commands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          command: {
            type: "CREATE_ORDER",
            idempotencyKey: "agent-bypass",
            actor: {
              actorId: "agent_1",
              role: "PROCUREMENT_AGENT",
              actorType: "AGENT",
            },
            orderId: "order_1",
            buyerId: "buyer_1",
            vendorId: "vendor_1",
            offerId: "offer_1",
            category: "GPU_COMPUTE",
            amount: {
              asset: "HBAR",
              decimals: 8,
              atomicAmount: "100000000",
            },
          },
        }),
      }),
      { params: Promise.resolve({ programId: "program_1" }) },
    );
    const body = (await response.json()) as { code?: string };
    expect(response.status).toBe(403);
    expect(body.code).toBe("AGENTKIT_REQUIRED");
  });
});
