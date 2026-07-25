import { PrivateKey } from "@hashgraph/sdk";
import { describe, expect, it } from "vitest";
import { HederaPaymentScheduler } from "../src/adapters/hedera";
import { authenticateApprovalCommand } from "../src/application/approval-auth";
import { initialProjection } from "../src/protocol/reducer";
import type { Program, Order } from "../src/protocol/types";

const verifierAccountId = "0.0.71001";
const financeAccountId = "0.0.71002";
const scheduleId = "0.0.72001";
const transactionId = "0.0.71001@1785000000.123456789";

function scheduler(
  signerKeys: string[],
  walletTransaction: {
    payerAccountId: string;
    scheduleId: string;
    name: string;
    result: string;
  } = {
    payerAccountId: verifierAccountId,
    scheduleId,
    name: "SCHEDULESIGN",
    result: "SUCCESS",
  },
) {
  return new HederaPaymentScheduler(
    {
      operatorAccountId: "0.0.70001",
      operatorPrivateKey: PrivateKey.generateECDSA().toString(),
      topicId: "0.0.70002",
      treasuryAccountId: "0.0.70003",
      vendorAccountId: "0.0.70004",
      verifierAccountId,
      financeAccountId,
    },
    fetch,
    {
      accountKey: async (accountId) =>
        accountId === verifierAccountId ? "verifier-key" : "finance-key",
      scheduleSignerKeys: async () => signerKeys,
      walletTransaction: async () => walletTransaction,
    },
  );
}

describe("direct Hedera wallet approval confirmation", () => {
  it("confirms only after the configured role key appears on the schedule", async () => {
    await expect(
      scheduler(["verifier-key"]).confirmApproval(scheduleId, {
        actorId: `hedera:${verifierAccountId}`,
        role: "DELIVERY_VERIFIER",
        reference: `hedera-walletconnect:${verifierAccountId}:${transactionId}`,
        hederaAccountId: verifierAccountId,
        transactionId,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects a missing signer and the wrong role account", async () => {
    await expect(
      scheduler([]).confirmApproval(scheduleId, {
        actorId: `hedera:${verifierAccountId}`,
        role: "DELIVERY_VERIFIER",
        reference: "hedera-walletconnect:missing",
        hederaAccountId: verifierAccountId,
        transactionId,
      }),
    ).rejects.toThrow("has not recorded");
    await expect(
      scheduler(["finance-key"]).confirmApproval(scheduleId, {
        actorId: `hedera:${financeAccountId}`,
        role: "DELIVERY_VERIFIER",
        reference: "hedera-walletconnect:wrong-role",
        hederaAccountId: financeAccountId,
        transactionId,
      }),
    ).rejects.toThrow(verifierAccountId);
  });

  it("rejects a receipt for a different schedule or payer", async () => {
    await expect(
      scheduler(["verifier-key"], {
        payerAccountId: financeAccountId,
        scheduleId: "0.0.99999",
        name: "SCHEDULESIGN",
        result: "SUCCESS",
      }).confirmApproval(scheduleId, {
        actorId: `hedera:${verifierAccountId}`,
        role: "DELIVERY_VERIFIER",
        reference: `hedera-walletconnect:${verifierAccountId}:${transactionId}`,
        hederaAccountId: verifierAccountId,
        transactionId,
      }),
    ).rejects.toThrow("does not confirm");
  });
});

describe("wallet receipt authentication", () => {
  it("binds the configured Hedera account to the approval command", async () => {
    const projection = approvalProjection();
    const command = await authenticateApprovalCommand({
      mode: "testnet",
      projection,
      command: {
        type: "APPROVE_DELIVERY",
        idempotencyKey: "approval:verifier",
        actor: {
          actorId: "pending",
          role: "DELIVERY_VERIFIER",
          actorType: "HUMAN",
        },
        orderId: "order_1",
        approvalReference: "pending",
      },
      proof: { accountId: verifierAccountId, transactionId },
    });
    expect(command.actor).toMatchObject({
      actorId: `hedera:${verifierAccountId}`,
      hederaAccountId: verifierAccountId,
    });
    expect(
      "approvalTransactionId" in command
        ? command.approvalTransactionId
        : undefined,
    ).toBe(transactionId);
  });

  it("rejects a wallet account assigned to the wrong role", async () => {
    await expect(
      authenticateApprovalCommand({
        mode: "testnet",
        projection: approvalProjection(),
        command: {
          type: "APPROVE_DELIVERY",
          idempotencyKey: "approval:wrong",
          actor: {
            actorId: "pending",
            role: "DELIVERY_VERIFIER",
            actorType: "HUMAN",
          },
          orderId: "order_1",
          approvalReference: "pending",
        },
        proof: { accountId: financeAccountId, transactionId },
      }),
    ).rejects.toThrow(verifierAccountId);
  });

  it("enforces verifier/finance separation of duties", async () => {
    const projection = approvalProjection(verifierAccountId);
    projection.orders.order_1 = {
      ...projection.orders.order_1,
      status: "DELIVERY_APPROVED",
      approvals: [
        {
          actorId: `hedera:${verifierAccountId}`,
          role: "DELIVERY_VERIFIER",
          reference: "hedera-walletconnect:verifier",
          hederaAccountId: verifierAccountId,
        },
      ],
    };
    await expect(
      authenticateApprovalCommand({
        mode: "testnet",
        projection,
        command: {
          type: "APPROVE_FINANCE",
          idempotencyKey: "approval:same-account",
          actor: {
            actorId: "pending",
            role: "FINANCE",
            actorType: "HUMAN",
          },
          orderId: "order_1",
          approvalReference: "pending",
        },
        proof: { accountId: verifierAccountId, transactionId },
      }),
    ).rejects.toThrow("different Hedera accounts");
  });
});

function approvalProjection(configuredFinanceAccountId = financeAccountId) {
  const money = { asset: "HBAR", atomicAmount: "350000000", decimals: 8 };
  const program: Program = {
    id: "program_1",
    organizationId: "org_1",
    name: "Program",
    description: "",
    budget: money,
    policy: {
      allowedCategories: ["GPU_COMPUTE"],
      maxOrderAmount: money,
      requireDeliveryEvidence: true,
      approvalRequirements: [
        { role: "DELIVERY_VERIFIER", count: 1 },
        { role: "FINANCE", count: 1 },
      ],
    },
    hedera: {
      treasuryAccountId: "0.0.70003",
      verifierAccountId,
      financeAccountId: configuredFinanceAccountId,
    },
    status: "ACTIVE",
  };
  const order: Order = {
    id: "order_1",
    programId: program.id,
    buyerId: "buyer_1",
    vendorId: "vendor_1",
    category: "GPU_COMPUTE",
    amount: money,
    status: "DELIVERY_SUBMITTED",
    scheduleId,
    approvals: [],
  };
  return {
    ...initialProjection(),
    program,
    orders: { [order.id]: order },
  };
}
