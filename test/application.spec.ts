import { PrivateKey } from "@hashgraph/sdk";
import { describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { HederaEventStore } from "../src/adapters/hedera";
import {
  agentAuthorizationBinding,
  agentAuthorizationSignal,
  createUniversityRun,
  runProgramCommand,
  verifyAgentHumanBacking,
} from "../src/application/runtime";
import type { ProtocolCommand } from "../src/application/commands";
import { createEvent } from "../src/protocol/events";
import {
  canonicalApprovalMessage,
  verifyWalletApproval,
  type WalletApprovalPayload,
} from "../src/wallet/approval";

describe("mode-aware application service", () => {
  it("binds World authority to the exact run, program, agent, principal, and delegation", async () => {
    const session = await createUniversityRun("simulation");
    const agentId = Object.keys(session.projection.agentDelegations)[0];
    const delegation = session.projection.agentDelegations[agentId];
    expect(agentAuthorizationBinding(session, agentId)).toEqual({
      protocolVersion: "0.2",
      runId: session.runId,
      organizationId: session.projection.program?.organizationId,
      programId: session.programId,
      agentId,
      principalId: delegation.principalId,
      delegationHash: delegation.integrityHash,
    });
    expect(agentAuthorizationSignal(session, agentId)).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
    expect(
      agentAuthorizationSignal(
        {
          ...session,
          runId: `${session.runId}:different`,
        },
        agentId,
      ),
    ).not.toBe(agentAuthorizationSignal(session, agentId));
  });

  it("appends allocations and upfunds one specific buyer without replacing prior funds", async () => {
    let session = await createUniversityRun("simulation");
    const original = session.projection.allocations[session.buyerId];
    const secondBuyer = "buyer_materials_lab";
    const zero = { ...original.totalLimit, atomicAmount: "0" };
    const added = await runProgramCommand(session.programId, "simulation", {
      type: "ALLOCATE_BUYER",
      idempotencyKey: `${session.runId}:allocate-second-buyer`,
      actor: human("program-admin", "ADMIN"),
      allocation: {
        id: "allocation_materials",
        programId: session.programId,
        buyerId: secondBuyer,
        totalLimit: { ...original.totalLimit, atomicAmount: "200000000" },
        committed: zero,
        paid: zero,
        allowedCategories: [...original.allowedCategories],
      },
    });
    expect(added.status).toBe("CONFIRMED");
    expect(added.projection?.allocations[session.buyerId].totalLimit).toEqual(
      original.totalLimit,
    );
    expect(
      added.projection?.allocations[secondBuyer].totalLimit.atomicAmount,
    ).toBe("200000000");

    session = { ...session, projection: added.projection! };
    const upfunded = await runProgramCommand(session.programId, "simulation", {
      type: "UPFUND_BUYER_ALLOCATION",
      idempotencyKey: `${session.runId}:upfund-second-buyer`,
      actor: human("program-admin", "ADMIN"),
      buyerId: secondBuyer,
      amount: { ...original.totalLimit, atomicAmount: "150000000" },
    });
    expect(
      upfunded.projection?.allocations[secondBuyer].totalLimit.atomicAmount,
    ).toBe("350000000");
    expect(
      upfunded.projection?.timeline.filter(
        (event) => event.eventType === "BUYER_ALLOCATION_UPFUNDED",
      ),
    ).toHaveLength(1);

    const duplicate = await runProgramCommand(
      session.programId,
      "simulation",
      {
        type: "UPFUND_BUYER_ALLOCATION",
        idempotencyKey: `${session.runId}:upfund-second-buyer`,
        actor: human("program-admin", "ADMIN"),
        buyerId: secondBuyer,
        amount: { ...original.totalLimit, atomicAmount: "150000000" },
      },
    );
    expect(
      duplicate.projection?.allocations[secondBuyer].totalLimit.atomicAmount,
    ).toBe("350000000");

    const overBudget = await runProgramCommand(session.programId, "simulation", {
      type: "UPFUND_BUYER_ALLOCATION",
      idempotencyKey: `${session.runId}:upfund-over-budget`,
      actor: human("program-admin", "ADMIN"),
      buyerId: secondBuyer,
      amount: { ...original.totalLimit, atomicAmount: "2000000000" },
    });
    expect(overBudget.status).toBe("FAILED");
    expect(overBudget.error?.code).toBe("PROGRAM_BUDGET_EXCEEDED");
  });

  it("runs the complete lifecycle and deduplicates commands", async () => {
    let session = await createUniversityRun("simulation");
    const offer = session.projection.offers[session.selectedOfferId];
    const commands: ProtocolCommand[] = [
      {
        type: "TEST_PURCHASE_POLICY",
        idempotencyKey: `${session.runId}:reject`,
        actor: human(session.buyerId, "BUYER"),
        buyerId: session.buyerId,
        vendorId: offer.vendorId,
        category: offer.category,
        amount: { ...offer.amount, atomicAmount: "550000000" },
      },
      {
        type: "CREATE_ORDER",
        idempotencyKey: `${session.runId}:create`,
        actor: human(session.buyerId, "BUYER"),
        orderId: session.orderId,
        buyerId: session.buyerId,
        vendorId: offer.vendorId,
        offerId: offer.id,
        category: offer.category,
        amount: offer.amount,
      },
      {
        type: "ACCEPT_ORDER",
        idempotencyKey: `${session.runId}:accept`,
        actor: human(offer.vendorId, "VENDOR"),
        orderId: session.orderId,
      },
      {
        type: "SUBMIT_DELIVERY",
        idempotencyKey: `${session.runId}:evidence`,
        actor: human(offer.vendorId, "VENDOR"),
        orderId: session.orderId,
        evidence: {
          hash: `sha256:${"f".repeat(64)}`,
          mimeType: "application/pdf",
          size: 42,
          submittedBy: offer.vendorId,
          submittedAt: new Date().toISOString(),
        },
      },
      {
        type: "APPROVE_DELIVERY",
        idempotencyKey: `${session.runId}:verify`,
        actor: human("verifier", "DELIVERY_VERIFIER"),
        orderId: session.orderId,
        approvalReference: "wallet-authenticated:test",
      },
      {
        type: "APPROVE_FINANCE",
        idempotencyKey: `${session.runId}:finance`,
        actor: human("finance", "FINANCE"),
        orderId: session.orderId,
        approvalReference: "wallet-authenticated:test",
      },
    ];

    for (const command of commands) {
      const result = await runProgramCommand(
        session.programId,
        "simulation",
        command,
      );
      expect(result.status).toBe("CONFIRMED");
      session = {
        ...session,
        projection: result.projection ?? session.projection,
      };
    }
    const duplicate = await runProgramCommand(
      session.programId,
      "simulation",
      commands.at(-1)!,
    );
    const order = duplicate.projection?.orders[session.orderId];
    expect(order?.status).toBe("PAYMENT_EXECUTED");
    expect(order?.approvals).toHaveLength(2);
    expect(
      duplicate.projection?.timeline.filter(
        (event) => event.eventType === "PAYMENT_EXECUTED",
      ),
    ).toHaveLength(1);
    expect(duplicate.projection?.rejectedDecisions).toHaveLength(1);
  });

  it("audits missing humanity and delegation limits before creating an agent order", async () => {
    let session = await createUniversityRun("simulation");
    const offer = session.projection.offers[session.selectedOfferId];
    const agent = {
      actorId: session.agentId,
      role: "PROCUREMENT_AGENT",
      actorType: "AGENT" as const,
      hederaAccountId: session.agentExecutionAccountId,
    };
    const resolve = await runProgramCommand(session.programId, "simulation", {
      type: "RESOLVE_AGENT_IDENTITY",
      idempotencyKey: `${session.runId}:resolve-agent`,
      actor: human("system", "SYSTEM"),
      identity: session.agentIdentity,
    });
    session = { ...session, projection: resolve.projection! };

    const unverified = await runProgramCommand(session.programId, "simulation", {
      type: "CREATE_ORDER",
      idempotencyKey: `${session.runId}:unverified`,
      actor: agent,
      orderId: session.orderId,
      buyerId: session.buyerId,
      vendorId: offer.vendorId,
      offerId: offer.id,
      category: offer.category,
      amount: offer.amount,
    });
    expect(unverified.projection?.orders[session.orderId]).toBeUndefined();
    expect(
      unverified.projection?.agentAuthorizationDecisions.at(-1)?.code,
    ).toBe("HUMAN_BACKING_REQUIRED");
    session = { ...session, projection: unverified.projection! };

    const verified = await verifyAgentHumanBacking({
      programId: session.programId,
      mode: "simulation",
      agentId: session.agentId,
      idempotencyKey: `${session.runId}:world`,
      proof: undefined,
    });
    session = { ...session, projection: verified.projection! };

    const overLimit = await runProgramCommand(session.programId, "simulation", {
      type: "CREATE_ORDER",
      idempotencyKey: `${session.runId}:over-limit`,
      actor: agent,
      orderId: session.orderId,
      buyerId: session.buyerId,
      vendorId: offer.vendorId,
      offerId: offer.id,
      category: offer.category,
      amount: { ...offer.amount, atomicAmount: "420000000" },
    });
    expect(overLimit.projection?.orders[session.orderId]).toBeUndefined();
    expect(
      overLimit.projection?.agentAuthorizationDecisions.at(-1)?.code,
    ).toBe("AGENT_ORDER_LIMIT_EXCEEDED");
    session = { ...session, projection: overLimit.projection! };

    const validCommand: ProtocolCommand = {
      type: "CREATE_ORDER",
      idempotencyKey: `${session.runId}:valid-agent-order`,
      actor: agent,
      orderId: session.orderId,
      buyerId: session.buyerId,
      vendorId: offer.vendorId,
      offerId: offer.id,
      category: offer.category,
      amount: offer.amount,
    };
    const valid = await runProgramCommand(
      session.programId,
      "simulation",
      validCommand,
    );
    expect(valid.projection?.orders[session.orderId]?.status).toBe("CREATED");
    expect(valid.projection?.agentAuthorizationDecisions.at(-1)?.code).toBe(
      "AGENT_AUTHORIZED",
    );
    const duplicate = await runProgramCommand(
      session.programId,
      "simulation",
      validCommand,
    );
    expect(
      duplicate.projection?.timeline.filter(
        (event) => event.eventType === "ORDER_CREATED",
      ),
    ).toHaveLength(1);
  });
});

describe("Hedera Mirror event store", () => {
  it("paginates, filters, and orders protocol events", async () => {
    const key = PrivateKey.generateECDSA();
    const first = event("program_target", "event_2");
    const ignored = event("program_other", "event_ignored");
    const second = event("program_target", "event_1");
    const pages = [
      {
        messages: [
          mirrorTextMessage(
            "Charter administrator authentication\nversion=1",
            1,
          ),
          mirrorMessage(first, 2),
          mirrorMessage(ignored, 3),
        ],
        links: { next: "/api/v1/topics/0.0.123/messages?sequence_number=gt:3" },
      },
      {
        messages: [mirrorMessage(second, 1)],
        links: { next: null },
      },
    ];
    const mirrorFetch = vi.fn(async () => {
      const page = pages.shift();
      return new Response(JSON.stringify(page), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const store = new HederaEventStore(
      {
        operatorAccountId: "0.0.1001",
        operatorPrivateKey: key.toString(),
        topicId: "0.0.123",
        treasuryAccountId: "0.0.1002",
        vendorAccountId: "0.0.1003",
      },
      mirrorFetch,
    );
    const events = await store.read("program_target");
    expect(mirrorFetch).toHaveBeenCalledTimes(2);
    expect(events.map((item) => item.eventId)).toEqual(["event_1", "event_2"]);
    expect(events[0].ledgerReference?.consensusTimestamp).toBe("1.000000001");
  });
});

describe("wallet approval verification", () => {
  it("accepts an exact unexpired signature and rejects an expired payload", async () => {
    const account = privateKeyToAccount(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    const now = new Date("2026-07-24T18:31:00.000Z");
    const payload: WalletApprovalPayload = {
      protocolVersion: "0.1",
      action: "APPROVE_PAYMENT",
      role: "FINANCE",
      organizationId: "org_1",
      programId: "program_1",
      orderId: "order_1",
      scheduleId: "0.0.7001",
      asset: "HBAR",
      atomicAmount: "350000000",
      walletAccountId: account.address,
      chainId: 296,
      idempotencyKey: "run_1:finance",
      issuedAt: "2026-07-24T18:30:00.000Z",
      expiresAt: "2026-07-24T18:35:00.000Z",
    };
    const message = canonicalApprovalMessage(payload);
    const signatureHex = await account.signMessage({ message });
    await expect(
      verifyWalletApproval({
        payload,
        signatureHex,
        expectedAddress: account.address,
        now,
      }),
    ).resolves.toBe(true);
    await expect(
      verifyWalletApproval({
        payload,
        signatureHex,
        expectedAddress: account.address,
        now: new Date("2026-07-24T18:36:00.000Z"),
      }),
    ).resolves.toBe(false);
    await expect(
      verifyWalletApproval({
        payload,
        signatureHex,
        expectedAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        now,
      }),
    ).resolves.toBe(false);
    await expect(
      verifyWalletApproval({
        payload: { ...payload, atomicAmount: "350000001" },
        signatureHex,
        expectedAddress: account.address,
        now,
      }),
    ).resolves.toBe(false);
  });
});

function human(actorId: string, role: string) {
  return { actorId, role, actorType: "HUMAN" as const };
}

function event(programId: string, eventId: string) {
  return createEvent({
    eventId,
    eventType: "PROGRAM_CREATED",
    runId: "run_1",
    organizationId: "org_1",
    programId,
    actor: { actorId: "system", role: "SYSTEM", actorType: "SYSTEM" },
    correlationId: eventId,
    occurredAt: "2026-07-24T18:30:00.000Z",
    data: { program: {} },
  });
}

function mirrorMessage(value: unknown, sequence: number) {
  return {
    message: Buffer.from(JSON.stringify(value)).toString("base64"),
    sequence_number: sequence,
    consensus_timestamp: `${sequence}.00000000${sequence}`,
    topic_id: "0.0.123",
  };
}

function mirrorTextMessage(value: string, sequence: number) {
  return {
    message: Buffer.from(value).toString("base64"),
    sequence_number: sequence,
    consensus_timestamp: `${sequence}.00000000${sequence}`,
    topic_id: "0.0.123",
  };
}
