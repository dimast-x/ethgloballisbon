import { describe, expect, it, vi } from "vitest";
import { verifyHederaProgramDeposit } from "../src/application/program-funding";
import { uncreditedTreasuryFunds } from "../src/application/runtime";
import { createEvent } from "../src/protocol/events";
import { reduceProtocolEvents } from "../src/protocol/reducer";
import type { Program } from "../src/protocol/types";

const amount = {
  asset: "HBAR",
  decimals: 8,
  atomicAmount: "250000000",
};

describe("user-funded programs", () => {
  it("detects real treasury funds missing from the event projection", () => {
    const projection = reduceProtocolEvents([
      createEvent({
        runId: "run_reconcile",
        organizationId: "org_test",
        programId: "program_reconcile",
        actor: {
          actorId: "admin",
          role: "ADMIN",
          actorType: "HUMAN",
        },
        eventType: "PROGRAM_CREATED",
        correlationId: "create",
        data: {
          program: {
            id: "program_reconcile",
            organizationId: "org_test",
            name: "Reconcile",
            description: "",
            budget: { ...amount, atomicAmount: "0" },
            status: "ACTIVE",
            policy: {
              allowedCategories: ["GPU_COMPUTE"],
              requireDeliveryEvidence: false,
              approvalRequirements: [],
            },
          },
        },
      }),
    ]);

    expect(
      uncreditedTreasuryFunds(projection, {
        ...amount,
        atomicAmount: "400000000",
      }),
    ).toBe(400000000n);
  });

  it("accepts only the exact successful wallet-to-treasury transfer", async () => {
    const mirrorFetch = vi.fn(async () =>
      Response.json({
        transactions: [
          {
            name: "CRYPTOTRANSFER",
            result: "SUCCESS",
            payer_account_id: "0.0.1001",
            memo_base64: Buffer.from(
              "yareon:deposit:program_deposit",
            ).toString("base64"),
            transfers: [
              { account: "0.0.1001", amount: -250100000 },
              { account: "0.0.9001", amount: 250000000 },
            ],
          },
        ],
      }),
    );

    await expect(
      verifyHederaProgramDeposit({
        transactionId: "0.0.1001@1750000000.123456789",
        depositorAccountId: "0.0.1001",
        treasuryAccountId: "0.0.9001",
        programId: "program_deposit",
        amount,
        mirrorFetch,
        attempts: 1,
      }),
    ).resolves.toBeUndefined();
    expect(mirrorFetch).toHaveBeenCalledWith(
      new URL(
        "https://testnet.mirrornode.hedera.com/api/v1/transactions/0.0.1001-1750000000-123456789",
      ),
    );
  });

  it("rejects a claimed amount that was not deposited", async () => {
    await expect(
      verifyHederaProgramDeposit({
        transactionId: "0.0.1001@1750000000.123456789",
        depositorAccountId: "0.0.1001",
        treasuryAccountId: "0.0.9001",
        programId: "program_deposit",
        amount,
        mirrorFetch: vi.fn(async () =>
          Response.json({
            transactions: [
              {
                name: "CRYPTOTRANSFER",
                result: "SUCCESS",
                payer_account_id: "0.0.1001",
                memo_base64: Buffer.from(
                  "yareon:deposit:program_deposit",
                ).toString("base64"),
                transfers: [
                  { account: "0.0.9001", amount: 100000000 },
                ],
              },
            ],
          }),
        ),
        attempts: 1,
      }),
    ).rejects.toThrow("exact wallet deposit");
  });

  it("activates and upfunds the program without silently changing an allocation", () => {
    const program: Program = {
      id: "program_deposit",
      organizationId: "org_test",
      name: "Deposit program",
      description: "",
      budget: { ...amount, atomicAmount: "0" },
      status: "DRAFT",
      policy: {
        allowedCategories: ["GPU_COMPUTE"],
        requireDeliveryEvidence: false,
        approvalRequirements: [],
      },
    };
    const base = {
      runId: "run_deposit",
      organizationId: program.organizationId,
      programId: program.id,
      actor: { actorId: "admin", role: "ADMIN", actorType: "HUMAN" as const },
    };
    const projection = reduceProtocolEvents([
      createEvent({
        ...base,
        eventType: "PROGRAM_CREATED",
        correlationId: "create",
        data: { program },
      }),
      createEvent({
        ...base,
        eventType: "BUYER_ALLOCATED",
        correlationId: "allocation",
        data: {
          allocation: {
            id: "allocation_default",
            programId: program.id,
            buyerId: "buyer_default",
            totalLimit: { ...amount, atomicAmount: "0" },
            committed: { ...amount, atomicAmount: "0" },
            paid: { ...amount, atomicAmount: "0" },
            allowedCategories: ["GPU_COMPUTE"],
          },
        },
      }),
      createEvent({
        ...base,
        eventType: "PROGRAM_SETTLEMENT_CONFIGURED",
        correlationId: "settlement",
        data: {
          hedera: {
            treasuryAccountId: "0.0.9001",
            fundingMode: "USER_DEPOSIT" as const,
          },
        },
      }),
    ]);
    expect(projection.program?.status).toBe("ACTIVE");

    const funded = reduceProtocolEvents([
      ...projection.timeline,
      createEvent({
        ...base,
        eventType: "PROGRAM_UPFUNDED",
        correlationId: "deposit",
        data: {
          amount,
          depositTransactionId: "0.0.1001@1750000000.123456789",
        },
      }),
    ]);
    expect(funded.program).toMatchObject({
      status: "ACTIVE",
      budget: amount,
    });
    expect(
      funded.allocations.buyer_default.totalLimit.atomicAmount,
    ).toBe("0");
  });
});
