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
  idempotencyKey: string;
  issuedAt: string;
  expiresAt: string;
};

export function canonicalApprovalMessage(
  payload: WalletApprovalPayload,
): string {
  return [
    "OpenProcure approval",
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
    `idempotencyKey=${payload.idempotencyKey}`,
    `issuedAt=${payload.issuedAt}`,
    `expiresAt=${payload.expiresAt}`,
  ].join("\n");
}

