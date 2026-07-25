import type { ProtocolCommand } from "./commands";
import type { ProtocolProjection } from "../protocol/reducer";
import type { ExecutionMode } from "./commands";

export type HederaWalletApprovalReceipt = {
  accountId: string;
  transactionId: string;
};

export async function authenticateApprovalCommand(input: {
  command: ProtocolCommand;
  projection: ProtocolProjection;
  mode: ExecutionMode;
  proof?: HederaWalletApprovalReceipt;
}): Promise<ProtocolCommand> {
  const { command, projection, proof, mode } = input;
  if (
    command.type !== "APPROVE_DELIVERY" &&
    command.type !== "APPROVE_FINANCE"
  ) {
    return command;
  }
  if (mode === "simulation" && !proof) return command;
  if (!proof) throw new Error("A Hedera wallet approval receipt is required.");
  const order = projection.orders[command.orderId];
  const program = projection.program;
  if (!program || !order || !order.scheduleId) {
    throw new Error("The approval target is not ready.");
  }

  const isDelivery = command.type === "APPROVE_DELIVERY";
  const expectedRole = isDelivery ? "DELIVERY_VERIFIER" : "FINANCE";
  const configuredAccountId = isDelivery
    ? program.hedera?.verifierAccountId
    : program.hedera?.financeAccountId;
  if (!configuredAccountId) {
    throw new Error(`The ${expectedRole} Hedera account is not configured.`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(proof.accountId)) {
    throw new Error("The wallet receipt contains an invalid Hedera account ID.");
  }
  if (proof.accountId !== configuredAccountId) {
    throw new Error(
      `${expectedRole} approval requires Hedera account ${configuredAccountId}.`,
    );
  }
  if (!/^\d+\.\d+\.\d+@\d+\.\d+$/.test(proof.transactionId)) {
    throw new Error("The wallet receipt contains an invalid transaction ID.");
  }
  const priorSigner = order.approvals[0]?.actorId;
  if (
    !isDelivery &&
    priorSigner === `hedera:${proof.accountId}`
  ) {
    throw new Error("Verifier and Finance approvals require different Hedera accounts.");
  }

  return {
    ...command,
    actor: {
      actorId: `hedera:${proof.accountId}`,
      role: expectedRole,
      actorType: "HUMAN",
      hederaAccountId: proof.accountId,
    },
    approvalReference: `hedera-walletconnect:${proof.accountId}:${proof.transactionId}`,
    approvalTransactionId: proof.transactionId,
  };
}
