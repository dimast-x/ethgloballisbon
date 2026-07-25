import type { ProtocolCommand } from "./commands";
import type { ProtocolProjection } from "../protocol/reducer";
import {
  verifyWalletApproval,
  type WalletApprovalPayload,
} from "../wallet/approval";

export type WalletApprovalProof = {
  payload: WalletApprovalPayload;
  signatureMapBase64: string;
};

export async function authenticateApprovalCommand(input: {
  command: ProtocolCommand;
  projection: ProtocolProjection;
  proof?: WalletApprovalProof;
}): Promise<ProtocolCommand> {
  const { command, projection, proof } = input;
  if (
    command.type !== "APPROVE_DELIVERY" &&
    command.type !== "APPROVE_FINANCE"
  ) {
    return command;
  }
  if (!proof) throw new Error("A HashPack approval signature is required.");
  const order = projection.orders[command.orderId];
  const program = projection.program;
  if (!program || !order || !order.scheduleId) {
    throw new Error("The approval target is not ready.");
  }

  const isDelivery = command.type === "APPROVE_DELIVERY";
  const expectedRole = isDelivery ? "DELIVERY_VERIFIER" : "FINANCE";
  const expectedAction = isDelivery ? "APPROVE_DELIVERY" : "APPROVE_PAYMENT";
  const expectedAccountId = isDelivery
    ? process.env.NEXT_PUBLIC_VERIFIER_WALLET_ACCOUNT_ID
    : process.env.NEXT_PUBLIC_FINANCE_WALLET_ACCOUNT_ID;
  if (!expectedAccountId) {
    throw new Error(`The ${expectedRole} wallet is not configured.`);
  }

  const payload = proof.payload;
  const exactMatch =
    payload.protocolVersion === "0.1" &&
    payload.action === expectedAction &&
    payload.role === expectedRole &&
    payload.organizationId === program.organizationId &&
    payload.programId === program.id &&
    payload.orderId === order.id &&
    payload.scheduleId === order.scheduleId &&
    payload.asset === order.amount.asset &&
    payload.atomicAmount === order.amount.atomicAmount &&
    payload.walletAccountId === expectedAccountId &&
    payload.idempotencyKey === command.idempotencyKey;
  if (!exactMatch) {
    throw new Error("The signed approval does not match the current order.");
  }
  const verified = await verifyWalletApproval({
    payload,
    signatureMapBase64: proof.signatureMapBase64,
    expectedAccountId,
    mirrorNodeUrl: process.env.HEDERA_MIRROR_NODE_URL,
  });
  if (!verified) throw new Error("HashPack approval signature is invalid.");

  return {
    ...command,
    actor: {
      actorId: `wallet:${expectedAccountId}`,
      role: expectedRole,
      actorType: "HUMAN",
      hederaAccountId: expectedAccountId,
    },
    approvalReference: `wallet-authenticated:${expectedAccountId}:${command.idempotencyKey}`,
  };
}

