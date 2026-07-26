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

  it("creates a member with zero authority before it is funded", async () => {
    const session = await createProgramRun(
      { name: "Submitted program" },
      "simulation",
      "administrator_account",
    );
    const program = session.projection.program!;
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
        totalLimit: { ...program.budget, atomicAmount: "0" },
        committed: { ...program.budget, atomicAmount: "0" },
        paid: { ...program.budget, atomicAmount: "0" },
        allowedCategories: [],
      },
    });

    expect(result.status).toBe("CONFIRMED");
    expect(
      result.projection?.allocations.member_account?.totalLimit.atomicAmount,
    ).toBe("0");
  });
});
