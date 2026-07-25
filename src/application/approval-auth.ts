import type { ProtocolCommand } from "./commands";
import type { ProtocolProjection } from "../protocol/reducer";
import {
  verifyWalletApproval,
  type WalletApprovalPayload,
} from "../wallet/approval";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import type { ExecutionMode } from "./commands";

export type WalletApprovalProof = {
  payload: WalletApprovalPayload;
  signatureHex: Hex;
};

export async function authenticateApprovalCommand(input: {
  command: ProtocolCommand;
  projection: ProtocolProjection;
  mode: ExecutionMode;
  proof?: WalletApprovalProof;
}): Promise<ProtocolCommand> {
  const { command, projection, proof, mode } = input;
  if (
    command.type !== "APPROVE_DELIVERY" &&
    command.type !== "APPROVE_FINANCE"
  ) {
    return command;
  }
  if (mode === "simulation" && !proof) return command;
  if (!proof) throw new Error("A MetaMask approval signature is required.");
  const order = projection.orders[command.orderId];
  const program = projection.program;
  if (!program || !order || !order.scheduleId) {
    throw new Error("The approval target is not ready.");
  }

  const isDelivery = command.type === "APPROVE_DELIVERY";
  const expectedRole = isDelivery ? "DELIVERY_VERIFIER" : "FINANCE";
  const expectedAction = isDelivery ? "APPROVE_DELIVERY" : "APPROVE_PAYMENT";
  const configuredAddress = isDelivery
    ? process.env.NEXT_PUBLIC_METAMASK_VERIFIER_ADDRESS
    : process.env.NEXT_PUBLIC_METAMASK_FINANCE_ADDRESS;
  const claimedAddress = proof.payload.walletAccountId;
  if (!isAddress(claimedAddress)) {
    throw new Error("The signed approval contains an invalid wallet address.");
  }
  if (mode === "testnet" && !configuredAddress) {
    throw new Error(`The ${expectedRole} MetaMask address is not configured.`);
  }
  const expectedAddress = getAddress(
    mode === "testnet" ? configuredAddress! : claimedAddress,
  ) as Address;

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
    payload.walletAccountId.toLowerCase() === expectedAddress.toLowerCase() &&
    payload.chainId === 296 &&
    payload.idempotencyKey === command.idempotencyKey;
  if (!exactMatch) {
    throw new Error("The signed approval does not match the current order.");
  }
  const verified = await verifyWalletApproval({
    payload,
    signatureHex: proof.signatureHex,
    expectedAddress,
  });
  if (!verified) throw new Error("MetaMask approval signature is invalid.");
  const priorSigner = order.approvals[0]?.actorId;
  if (
    !isDelivery &&
    priorSigner?.toLowerCase() === `wallet:${expectedAddress}`.toLowerCase()
  ) {
    throw new Error("Verifier and Finance approvals require different wallets.");
  }

  return {
    ...command,
    actor: {
      actorId: `wallet:${expectedAddress}`,
      role: expectedRole,
      actorType: "HUMAN",
    },
    approvalReference: `metamask-authenticated:${expectedAddress}:${command.idempotencyKey}`,
  };
}
