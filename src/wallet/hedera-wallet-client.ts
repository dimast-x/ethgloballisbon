"use client";

import {
  DAppConnector,
  HederaChainId,
  HederaJsonRpcMethod,
  HederaSessionEvent,
} from "@hashgraph/hedera-wallet-connect";
import {
  AccountId,
  LedgerId,
  ScheduleSignTransaction,
} from "@hiero-ledger/sdk";

let connectorPromise: Promise<DAppConnector> | undefined;

async function connector(): Promise<DAppConnector> {
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  if (!projectId) {
    throw new Error("WalletConnect is not configured for this deployment.");
  }
  connectorPromise ??= (async () => {
    const origin = window.location.origin;
    const instance = new DAppConnector(
      {
        name: "Charter",
        description: "Direct Hedera approval for Charter scheduled payments",
        url: origin,
        icons: [`${origin}/og.png`],
      },
      LedgerId.TESTNET,
      projectId,
      Object.values(HederaJsonRpcMethod),
      [
        HederaSessionEvent.AccountsChanged,
        HederaSessionEvent.ChainChanged,
      ],
      [HederaChainId.Testnet],
    );
    await instance.init({ logger: "error" });
    return instance;
  })();
  return connectorPromise;
}

export async function connectHederaWallet(
  expectedAccountId: string,
): Promise<string> {
  const instance = await connector();
  let signer = instance.signers.find(
    (candidate) => candidate.getAccountId().toString() === expectedAccountId,
  );
  if (!signer) {
    await instance.openModal(undefined, true);
    signer = instance.signers.find(
      (candidate) => candidate.getAccountId().toString() === expectedAccountId,
    );
  }
  if (!signer) {
    const connected = instance.signers
      .map((candidate) => candidate.getAccountId().toString())
      .join(", ");
    throw new Error(
      `Connect Hedera account ${expectedAccountId}. Connected: ${connected || "none"}.`,
    );
  }
  return signer.getAccountId().toString();
}

export async function signHederaSchedule(input: {
  accountId: string;
  scheduleId: string;
}): Promise<{ accountId: string; transactionId: string }> {
  const instance = await connector();
  const accountId = AccountId.fromString(input.accountId);
  const signer = instance.getSigner(accountId);
  const transaction = new ScheduleSignTransaction().setScheduleId(
    input.scheduleId,
  );
  await transaction.freezeWithSigner(signer);
  const response = await transaction.executeWithSigner(signer);
  await response.getReceiptWithSigner(signer);
  return {
    accountId: input.accountId,
    transactionId: response.transactionId.toString(),
  };
}

export function shortHederaAccount(accountId: string): string {
  return accountId.length > 14
    ? `${accountId.slice(0, 8)}…${accountId.slice(-4)}`
    : accountId;
}
