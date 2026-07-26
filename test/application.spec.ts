import { describe, expect, it } from "vitest";
import {
  createProgramRun,
  runProgramCommand,
} from "../src/application/runtime";

describe("program creation", () => {
  it("creates an empty draft from submitted input", async () => {
    const session = await createProgramRun(
      {
        name: "Submitted program",
        description: "Submitted description",
      },
      "simulation",
      "administrator_account",
    );

    expect(session.projection.program).toMatchObject({
      name: "Submitted program",
      description: "Submitted description",
      organizationId: "administrator_account",
      status: "DRAFT",
      budget: { atomicAmount: "0" },
      policy: {
        allowedCategories: [],
        maxOrderAmount: { atomicAmount: "0" },
        requireDeliveryEvidence: false,
        approvalRequirements: [],
      },
    });
    expect(session.projection.allocations).toEqual({});
    expect(session.projection.vendors).toEqual({});
    expect(session.projection.offers).toEqual({});
    expect(session.projection.agentDelegations).toEqual({});
    expect(session.projection.orders).toEqual({});
    expect(session.buyerId).toBe("");
    expect(session.selectedOfferId).toBe("");
    expect(session.agentId).toBe("");
  });

  it("accepts user-created data after the empty program exists", async () => {
    const session = await createProgramRun(
      { name: "Submitted program" },
      "simulation",
      "administrator_account",
    );
    const program = session.projection.program!;
    const funded = await runProgramCommand(session.programId, "simulation", {
      type: "UPFUND_PROGRAM",
      idempotencyKey: crypto.randomUUID(),
      actor: {
        actorId: program.organizationId,
        role: "ADMIN",
        actorType: "HUMAN",
      },
      amount: { ...program.budget, atomicAmount: "100000000" },
    });
    expect(funded.status).toBe("CONFIRMED");
    const result = await runProgramCommand(session.programId, "simulation", {
      type: "ALLOCATE_BUYER",
      idempotencyKey: crypto.randomUUID(),
      actor: {
        actorId: program.organizationId,
        role: "ADMIN",
        actorType: "HUMAN",
      },
      allocation: {
        id: crypto.randomUUID(),
        programId: program.id,
        buyerId: "member_account",
        participantType: "HUMAN",
        humanVerificationRequired: false,
        totalLimit: { ...program.budget, atomicAmount: "100000000" },
        committed: { ...program.budget, atomicAmount: "0" },
        paid: { ...program.budget, atomicAmount: "0" },
        allowedCategories: [],
      },
    });

    expect(result.status).toBe("CONFIRMED");
    expect(result.projection?.allocations.member_account).toBeDefined();
  });
});
