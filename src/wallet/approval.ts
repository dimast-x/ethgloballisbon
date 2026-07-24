import { PublicKey } from "@hashgraph/sdk";

export type WalletApprovalPayload = {
  protocolVersion: "0.1";
  action: "APPROVE_DELIVERY" | "APPROVE_PAYMENT";
  role: string;
  programId: string;
  orderId: string;
  scheduleId: string;
  asset: string;
  atomicAmount: string;
  walletAccountId: string;
};

export function canonicalApprovalMessage(
  payload: WalletApprovalPayload,
): string {
  return [
    "OpenProcure approval",
    `protocolVersion=${payload.protocolVersion}`,
    `action=${payload.action}`,
    `role=${payload.role}`,
    `programId=${payload.programId}`,
    `orderId=${payload.orderId}`,
    `scheduleId=${payload.scheduleId}`,
    `asset=${payload.asset}`,
    `atomicAmount=${payload.atomicAmount}`,
    `walletAccountId=${payload.walletAccountId}`,
  ].join("\n");
}

export async function verifyWalletApproval(input: {
  payload: WalletApprovalPayload;
  signatureHex: string;
  expectedAccountId: string;
  mirrorNodeUrl?: string;
}): Promise<boolean> {
  if (input.payload.walletAccountId !== input.expectedAccountId) return false;
  const base =
    input.mirrorNodeUrl ?? "https://testnet.mirrornode.hedera.com";
  const response = await fetch(
    `${base}/api/v1/accounts/${encodeURIComponent(input.expectedAccountId)}`,
  );
  if (!response.ok) return false;
  const account = (await response.json()) as {
    key?: { key?: string };
  };
  if (!account.key?.key) return false;
  const publicKey = PublicKey.fromString(account.key.key);
  const signature = Uint8Array.from(
    input.signatureHex.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ??
      [],
  );
  return publicKey.verify(
    new TextEncoder().encode(canonicalApprovalMessage(input.payload)),
    signature,
  );
}
