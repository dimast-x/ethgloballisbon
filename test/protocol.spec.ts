import { describe, expect, it } from "vitest";
import { medicalSupplyFixture, universityGpuFixture } from "../src/demo/fixtures";
import { advanceDemo, createDemoSession, type DemoAction } from "../src/demo/simulator";
import { createEvent, parseProtocolEvent } from "../src/protocol/events";
import { fromDisplay, toDisplay } from "../src/protocol/money";
import {
  validateAgentAuthorization,
  validatePurchase,
} from "../src/protocol/policy";
import { reduceProtocolEvents } from "../src/protocol/reducer";
import { canonicalApprovalMessage } from "../src/wallet/approval";

describe("money", () => {
  it("uses exact atomic units", () => {
    const value = fromDisplay("3.5");
    expect(value.atomicAmount).toBe("350000000");
    expect(toDisplay(value)).toBe("3.5");
  });
});

describe("purchase policy", () => {
  it("authorizes the compliant reference order", () => {
    const offer = universityGpuFixture.offers.find(
      (item) => item.id === universityGpuFixture.selectedOfferId,
    )!;
    const vendor = universityGpuFixture.vendors.find(
      (item) => item.id === offer.vendorId,
    )!;
    const decision = validatePurchase({
      program: universityGpuFixture.program,
      allocation: universityGpuFixture.allocation,
      vendor,
      category: offer.category,
      amount: offer.amount,
    });
    expect(decision).toMatchObject({ allowed: true, code: "AUTHORIZED" });
  });

  it("rejects a request above the remaining allocation", () => {
    const decision = validatePurchase({
      program: universityGpuFixture.program,
      allocation: universityGpuFixture.allocation,
      vendor: universityGpuFixture.vendors[2],
      category: universityGpuFixture.offers[2].category,
      amount: universityGpuFixture.rejectedAmount,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain(
      "Order exceeds the buyer's remaining allocation.",
    );
  });

  it("runs a non-GPU fixture through the unchanged core", () => {
    const offer = medicalSupplyFixture.offers[0];
    const decision = validatePurchase({
      program: medicalSupplyFixture.program,
      allocation: medicalSupplyFixture.allocation,
      vendor: medicalSupplyFixture.vendors[0],
      category: offer.category,
      amount: offer.amount,
    });
    expect(decision).toMatchObject({ allowed: true, code: "AUTHORIZED" });
  });
});

describe("agent authorization policy", () => {
  it("keeps the non-GPU fixture provider-independent", () => {
    const fixture = medicalSupplyFixture;
    const delegation = {
      ...fixture.agent.delegation,
      integrityHash: "sha256:medical",
    };
    const decision = validateAgentAuthorization({
      agentId: fixture.agent.agentId,
      action: "CREATE_ORDER",
      program: fixture.program,
      identity: {
        agentId: fixture.agent.agentId,
        publicIdentity: fixture.agent.publicIdentity,
        organizationReference: fixture.organizationId,
        executionAccountId: fixture.agent.executionAccountId,
        role: fixture.agent.role,
        protocolVersion: "0.2",
        delegationHash: delegation.integrityHash,
        resolutionHash: "sha256:identity",
        resolvedAt: "2026-07-25T12:00:00.000Z",
      },
      attestation: {
        scheme: "test-humanity",
        verificationReference: "verification:1",
        subjectReference: fixture.agent.agentId,
        verifiedAt: "2026-07-25T12:00:00.000Z",
      },
      delegation,
      executionAccountId: fixture.agent.executionAccountId,
      category: fixture.offers[0].category,
      amount: fixture.offers[0].amount,
      now: "2026-07-25T12:00:00.000Z",
    });
    expect(decision).toMatchObject({
      allowed: true,
      code: "AGENT_AUTHORIZED",
    });
  });
});

describe("events and reducer", () => {
  it("validates the protocol event envelope", () => {
    const event = createEvent({
      eventType: "PROGRAM_CREATED",
      runId: "run_test",
      organizationId: "org_test",
      programId: "program_test",
      actor: { actorId: "system", role: "SYSTEM", actorType: "SYSTEM" },
      correlationId: "correlation_test",
      data: { program: universityGpuFixture.program },
    });
    expect(parseProtocolEvent(event)).toEqual(event);
    expect(event.schemaVersion).toBe("0.2");
  });

  it("replays legacy v0.1 envelopes", () => {
    const event = {
      ...createEvent({
        eventType: "PROGRAM_CREATED",
        runId: "run_legacy",
        organizationId: "org_legacy",
        programId: "program_legacy",
        actor: { actorId: "system", role: "SYSTEM", actorType: "SYSTEM" as const },
        correlationId: "legacy",
        data: { program: universityGpuFixture.program },
      }),
      schemaVersion: "0.1" as const,
    };
    expect(parseProtocolEvent(event).schemaVersion).toBe("0.1");
  });

  it("ignores duplicate event IDs", () => {
    const session = createDemoSession(universityGpuFixture);
    const projection = reduceProtocolEvents([
      ...session.events,
      session.events[0],
    ]);
    expect(projection.timeline).toHaveLength(session.events.length);
  });

  it("completes the lifecycle once despite duplicate commands", () => {
    let session = createDemoSession(universityGpuFixture);
    const actions: DemoAction[] = [
      "REJECT_OVER_LIMIT",
      "CREATE_ORDER",
      "CREATE_ORDER",
      "ACCEPT_ORDER",
      "CREATE_SCHEDULE",
      "SUBMIT_DELIVERY",
      "APPROVE_DELIVERY",
      "APPROVE_FINANCE",
      "APPROVE_FINANCE",
    ];
    for (const action of actions) session = advanceDemo(session, action);
    const order = Object.values(session.projection.orders)[0];
    expect(order.status).toBe("PAYMENT_EXECUTED");
    expect(order.approvals).toHaveLength(2);
    expect(
      session.events.filter((event) => event.eventType === "PAYMENT_EXECUTED"),
    ).toHaveLength(1);
    expect(session.projection.rejectedDecisions).toHaveLength(1);
  });
});

describe("wallet approval envelope", () => {
  it("binds consent to one exact role, order, schedule, amount, and account", () => {
    const message = canonicalApprovalMessage({
      protocolVersion: "0.1",
      action: "APPROVE_PAYMENT",
      role: "FINANCE",
      organizationId: "org_lisbon_university",
      programId: "program_ai_compute",
      orderId: "order_1",
      scheduleId: "0.0.70001",
      asset: "HBAR",
      atomicAmount: "350000000",
      walletAccountId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      chainId: 296,
      idempotencyKey: "run_test:approve-finance",
      issuedAt: "2026-07-24T18:30:00.000Z",
      expiresAt: "2026-07-24T18:35:00.000Z",
    });
    expect(message).toContain("role=FINANCE");
    expect(message).toContain("scheduleId=0.0.70001");
    expect(message).toContain("atomicAmount=350000000");
    expect(message).toContain(
      "walletAccountId=0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(message).toContain("chainId=296");
  });
});
