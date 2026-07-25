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
  TopicMessageSubmitTransaction,
} from "@hiero-ledger/sdk";

let connectorPromise: Promise<DAppConnector> | undefined;

function signerNodeAccountId(signer: {
  getNetwork(): Record<string, string | AccountId>;
}): AccountId {
  const nodeAccountId = Object.values(signer.getNetwork())[0];
  if (!nodeAccountId) {
    throw new Error("The Hedera wallet did not provide a network node.");
  }
  return typeof nodeAccountId === "string"
    ? AccountId.fromString(nodeAccountId)
    : nodeAccountId;
}

async function connector(): Promise<DAppConnector> {
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  if (!projectId) {
    throw new Error("WalletConnect is not configured for this deployment.");
  }
  connectorPromise ??= (async () => {
    const origin = window.location.origin;
    const instance = new DAppConnector(
      {
        name: "Yareon",
        description: "Direct Hedera approval for Yareon scheduled payments",
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
  expectedAccountId?: string,
): Promise<string> {
  const instance = await connector();
  let signer = expectedAccountId
    ? instance.signers.find(
        (candidate) =>
          candidate.getAccountId().toString() === expectedAccountId,
      )
    : instance.signers[0];
  if (!signer) {
    await instance.openModal(undefined, true);
    signer = expectedAccountId
      ? instance.signers.find(
          (candidate) =>
            candidate.getAccountId().toString() === expectedAccountId,
        )
      : instance.signers[0];
  }
  if (!signer) {
    const connected = instance.signers
      .map((candidate) => candidate.getAccountId().toString())
      .join(", ");
    throw new Error(
      expectedAccountId
        ? `Connect Hedera account ${expectedAccountId}. Connected: ${connected || "none"}.`
        : "Connect a Hedera testnet account to continue.",
    );
  }
  return signer.getAccountId().toString();
}

export async function signHederaMessage(input: {
  accountId: string;
  message: string;
}): Promise<string> {
  const instance = await connector();
  const result = await instance.signMessage({
    signerAccountId: `hedera:testnet:${input.accountId}`,
    message: input.message,
  });
  if (!result.result?.signatureMap) {
    throw new Error("The Hedera wallet did not return a message signature.");
  }
  return result.result.signatureMap;
}

export async function submitHederaAuthenticationChallenge(input: {
  accountId: string;
  topicId: string;
  message: string;
}): Promise<string> {
  const instance = await connector();
  const accountId = AccountId.fromString(input.accountId);
  const signer = instance.getSigner(accountId);
  const transaction = new TopicMessageSubmitTransaction()
    .setTopicId(input.topicId)
    .setMessage(input.message)
    .setNodeAccountIds([signerNodeAccountId(signer)]);
  await transaction.freezeWithSigner(signer);
  const response = await transaction.executeWithSigner(signer);
  await response.getReceiptWithSigner(signer);
  return response.transactionId.toString();
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
  ).setNodeAccountIds([signerNodeAccountId(signer)]);
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
