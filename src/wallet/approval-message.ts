export type WalletApprovalPayload = {
  protocolVersion: "0.1";
  action: "APPROVE_DELIVERY" | "APPROVE_PAYMENT";
  role: string;
  organizationId: string;
  programId: string;
  orderId: string;
  scheduleId: string;
  asset: string;
  atomicAmount: string;
  walletAccountId: string;
  chainId: 296;
  idempotencyKey: string;
  issuedAt: string;
  expiresAt: string;
};

export function canonicalApprovalMessage(
  payload: WalletApprovalPayload,
): string {
  return [
    "Charter approval",
    `protocolVersion=${payload.protocolVersion}`,
    `action=${payload.action}`,
    `role=${payload.role}`,
    `organizationId=${payload.organizationId}`,
    `programId=${payload.programId}`,
    `orderId=${payload.orderId}`,
    `scheduleId=${payload.scheduleId}`,
    `asset=${payload.asset}`,
    `atomicAmount=${payload.atomicAmount}`,
    `walletAccountId=${payload.walletAccountId}`,
    `chainId=${payload.chainId}`,
    `idempotencyKey=${payload.idempotencyKey}`,
    `issuedAt=${payload.issuedAt}`,
    `expiresAt=${payload.expiresAt}`,
  ].join("\n");
}
