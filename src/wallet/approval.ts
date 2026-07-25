import { isAddress, verifyMessage, type Address, type Hex } from "viem";
import {
  canonicalApprovalMessage,
  type WalletApprovalPayload,
} from "./approval-message";

export { canonicalApprovalMessage };
export type { WalletApprovalPayload };

export async function verifyWalletApproval(input: {
  payload: WalletApprovalPayload;
  signatureHex: Hex;
  expectedAddress: Address;
  now?: Date;
}): Promise<boolean> {
  if (
    !isAddress(input.payload.walletAccountId) ||
    input.payload.walletAccountId.toLowerCase() !==
      input.expectedAddress.toLowerCase() ||
    input.payload.chainId !== 296
  ) {
    return false;
  }
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
  return verifyMessage({
    address: input.expectedAddress,
    message: canonicalApprovalMessage(input.payload),
    signature: input.signatureHex,
  });
}
