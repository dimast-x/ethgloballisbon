import { hashSignal } from "@worldcoin/idkit/hashing";
import type { PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  EnsPublicIdentityResolver,
  WorldHumanBackingVerifier,
} from "../src/adapters/identity";

describe("ENS public identity adapter", () => {
  it("normalizes and validates the required agent and organization records", async () => {
    const records: Record<string, string> = {
      "com.openprocure.agent-id": "agent_1",
      "com.openprocure.role": "PROCUREMENT_AGENT",
      "com.openprocure.organization": "lisbon-university.eth",
      "com.openprocure.hedera-account": "0.0.4859221",
      "com.openprocure.delegation": "sha256:delegation",
      "com.openprocure.world-reference": "world:proof-of-human",
      "com.openprocure.protocol-version": "0.2",
      url: "https://example.test/agents/1",
      "com.openprocure.organization-id": "org_lisbon_university",
    };
    const client = {
      getEnsText: vi.fn(async ({ key }: { key: string }) => records[key] ?? null),
    } as unknown as PublicClient;
    const resolver = new EnsPublicIdentityResolver(
      { expectedOrganizationName: "lisbon-university.eth" },
      client,
    );
    const identity = await resolver.resolve({
      scheme: "ens",
      name: "buyer.robotics-lab.eth",
    });
    expect(identity).toMatchObject({
      agentId: "agent_1",
      organizationReference: "org_lisbon_university",
      executionAccountId: "0.0.4859221",
      delegationHash: "sha256:delegation",
    });
    expect(identity.resolutionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("fails closed when a required record is missing", async () => {
    const client = {
      getEnsText: vi.fn(async () => null),
    } as unknown as PublicClient;
    await expect(
      new EnsPublicIdentityResolver({}, client).resolve({
        scheme: "ens",
        name: "missing.eth",
      }),
    ).rejects.toThrow("is required");
  });
});

describe("World human-backing adapter", () => {
  const config = {
    appId: "app_test",
    rpId: "rp_test",
    signingKey: "0x01",
    action: "authorize-openprocure-agent",
    environment: "staging" as const,
  };

  it("binds the proof to action, environment, and signal", async () => {
    const signal = "sha256:program-agent-delegation";
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    const verifier = new WorldHumanBackingVerifier(config, fetchMock);
    const attestation = await verifier.verify({
      subjectReference: "agent_1",
      action: config.action,
      environment: config.environment,
      signal,
      proof: {
        protocol_version: "4.0",
        action: config.action,
        environment: config.environment,
        responses: [
          {
            identifier: "proof_of_human",
            nullifier: "0x1234",
            signal_hash: hashSignal(signal),
          },
        ],
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(attestation.verificationReference).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
    expect(JSON.stringify(attestation)).not.toContain("0x1234");
  });

  it("rejects a changed action before contacting World", async () => {
    const fetchMock = vi.fn();
    const verifier = new WorldHumanBackingVerifier(config, fetchMock);
    await expect(
      verifier.verify({
        subjectReference: "agent_1",
        action: config.action,
        environment: config.environment,
        signal: "signal",
        proof: {
          action: "different-action",
          environment: config.environment,
          responses: [{ nullifier: "0x1234" }],
        },
      }),
    ).rejects.toThrow("action");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
