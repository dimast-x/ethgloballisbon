import { AGENTKIT, createAgentkitClient } from "@worldcoin/agentkit";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import {
  agentkitVerificationReference,
  agentkitSignerConfigFromEnv,
  agentkitVerifierConfigFromEnv,
  createAgentkitChallenge,
  verifyAgentkitRequest,
  WORLD_AGENT_CHAIN_ID,
} from "../src/adapters/agentkit";

describe("World AgentKit adapter", () => {
  const privateKey =
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
  const account = privateKeyToAccount(privateKey);
  const resource =
    "https://yareon.example/api/agents/agentkit/procure?intent=sha256%3Atest";

  it("keeps server verification independent from the signing key", () => {
    const previousAddress = process.env.WORLD_AGENT_ADDRESS;
    const previousKey = process.env.WORLD_AGENT_PRIVATE_KEY;
    process.env.WORLD_AGENT_ADDRESS = account.address;
    delete process.env.WORLD_AGENT_PRIVATE_KEY;
    try {
      expect(agentkitVerifierConfigFromEnv().agentAddress).toBe(account.address);
      expect(() => agentkitSignerConfigFromEnv()).toThrow(
        "Missing WORLD_AGENT_PRIVATE_KEY",
      );
    } finally {
      if (previousAddress === undefined) {
        delete process.env.WORLD_AGENT_ADDRESS;
      } else {
        process.env.WORLD_AGENT_ADDRESS = previousAddress;
      }
      if (previousKey === undefined) {
        delete process.env.WORLD_AGENT_PRIVATE_KEY;
      } else {
        process.env.WORLD_AGENT_PRIVATE_KEY = previousKey;
      }
    }
  });

  async function signedRequest(
    url = resource,
    expirationTime?: string,
  ) {
    const challenge = createAgentkitChallenge(resource);
    const extension = challenge.extensions[AGENTKIT];
    if (expirationTime) {
      extension.info.expirationTime = expirationTime;
      extension.info.issuedAt = new Date(
        new Date(expirationTime).getTime() - 5 * 60 * 1_000,
      ).toISOString();
    }
    const client = createAgentkitClient({
      signer: {
        address: account.address,
        chainId: WORLD_AGENT_CHAIN_ID,
        type: "eip191",
        signMessage: (message) => account.signMessage({ message }),
      },
    });
    const header = await client.createHeader(extension);
    return new Request(url, { headers: { [AGENTKIT]: header } });
  }

  it("verifies a signed intent against the configured wallet and AgentBook", async () => {
    const access = await verifyAgentkitRequest(await signedRequest(), {
      expectedAddress: account.address,
      agentBook: {
        lookupHuman: vi.fn(async () => "private-human-id"),
      },
    });
    expect(access.agentAddress).toBe(account.address);
    expect(access.humanId).toBe("private-human-id");
    const reference = agentkitVerificationReference(access);
    expect(reference).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(reference).not.toContain(access.humanId);
  });

  it("rejects URI tampering and an unexpected configured signer", async () => {
    await expect(
      verifyAgentkitRequest(
        await signedRequest(`${resource}&changed=true`),
        {
          expectedAddress: account.address,
          agentBook: { lookupHuman: vi.fn(async () => "human") },
        },
      ),
    ).rejects.toThrow("validation");
    await expect(
      verifyAgentkitRequest(await signedRequest(), {
        expectedAddress: "0x0000000000000000000000000000000000000001",
        agentBook: { lookupHuman: vi.fn(async () => "human") },
      }),
    ).rejects.toThrow("not bound");
  });

  it("rejects a valid signer that is absent from AgentBook", async () => {
    await expect(
      verifyAgentkitRequest(await signedRequest(), {
        expectedAddress: account.address,
        agentBook: { lookupHuman: vi.fn(async () => null) },
      }),
    ).rejects.toThrow("not registered");
  });

  it("rejects malformed headers and expired signed challenges", async () => {
    await expect(
      verifyAgentkitRequest(
        new Request(resource, {
          headers: { [AGENTKIT]: "not-an-agentkit-header" },
        }),
        {
          expectedAddress: account.address,
          agentBook: { lookupHuman: vi.fn(async () => "human") },
        },
      ),
    ).rejects.toThrow();

    await expect(
      verifyAgentkitRequest(
        await signedRequest(
          resource,
          new Date(Date.now() - 60_000).toISOString(),
        ),
        {
          expectedAddress: account.address,
          agentBook: { lookupHuman: vi.fn(async () => "human") },
        },
      ),
    ).rejects.toThrow("validation");
  });
});
