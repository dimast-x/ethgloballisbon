import { PublicKey } from "@hashgraph/sdk";
import { proto } from "@hiero-ledger/proto";
import {
  canonicalApprovalMessage,
  type WalletApprovalPayload,
} from "./approval-message";

export { canonicalApprovalMessage };
export type { WalletApprovalPayload };

export async function verifyWalletApproval(input: {
  payload: WalletApprovalPayload;
  signatureMapBase64: string;
  expectedAccountId: string;
  mirrorNodeUrl?: string;
  now?: Date;
}): Promise<boolean> {
  if (input.payload.walletAccountId !== input.expectedAccountId) return false;
  const now = input.now ?? new Date();
  const issuedAt = new Date(input.payload.issuedAt);
  const expiresAt = new Date(input.payload.expiresAt);
  if (
    Number.isNaN(issuedAt.valueOf()) ||
    Number.isNaN(expiresAt.valueOf()) ||
    issuedAt > new Date(now.valueOf() + 60_000) ||
    expiresAt <= now ||
    expiresAt.valueOf() - issuedAt.valueOf() > 10 * 60_000
  ) {
    return false;
  }
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
  const signatureMap = proto.SignatureMap.decode(
    Buffer.from(input.signatureMapBase64, "base64"),
  );
  const pair = signatureMap.sigPair[0];
  const signature = pair?.ed25519 ?? pair?.ECDSASecp256k1;
  if (!signature) return false;
  const message = canonicalApprovalMessage(input.payload);
  const prefixed = `\x19Hedera Signed Message:\n${message.length}${message}`;
  return publicKey.verify(Buffer.from(prefixed), signature);
}
