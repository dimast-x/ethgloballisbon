import type { Money } from "../protocol/types";

type MirrorTransfer = {
  account?: string;
  amount?: number | string;
};

type MirrorTransaction = {
  memo_base64?: string;
  name?: string;
  payer_account_id?: string;
  result?: string;
  transaction_id?: string;
  transfers?: MirrorTransfer[];
};

export async function verifyHederaProgramDeposit(input: {
  transactionId: string;
  depositorAccountId: string;
  treasuryAccountId: string;
  programId: string;
  amount: Money;
  mirrorNodeUrl?: string;
  mirrorFetch?: typeof fetch;
  attempts?: number;
  retryDelayMs?: number;
}): Promise<void> {
  if (
    input.amount.asset !== "HBAR" ||
    input.amount.decimals !== 8 ||
    !/^\d+$/.test(input.amount.atomicAmount) ||
    BigInt(input.amount.atomicAmount) <= 0n
  ) {
    throw new Error("A positive HBAR deposit amount is required.");
  }
  if (!/^\d+\.\d+\.\d+@\d+\.\d+$/.test(input.transactionId)) {
    throw new Error("A valid Hedera deposit transaction ID is required.");
  }

  const mirrorFetch = input.mirrorFetch ?? fetch;
  const mirrorNodeUrl =
    input.mirrorNodeUrl ??
    process.env.HEDERA_MIRROR_NODE_URL ??
    "https://testnet.mirrornode.hedera.com";
  const attempts = input.attempts ?? 12;
  const transactionUrl = new URL(
    `/api/v1/transactions/${encodeURIComponent(
      mirrorTransactionId(input.transactionId),
    )}`,
    mirrorNodeUrl,
  );

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await mirrorFetch(transactionUrl);
    if (response.ok) {
      const body = (await response.json()) as {
        transactions?: MirrorTransaction[];
      };
      const deposit = body.transactions?.find(
        (transaction) =>
          transaction.name === "CRYPTOTRANSFER" &&
          transaction.result === "SUCCESS" &&
          (transaction.payer_account_id === input.depositorAccountId ||
            transaction.transaction_id?.startsWith(
              `${input.depositorAccountId}-`,
            )) &&
          transaction.memo_base64 &&
          Buffer.from(transaction.memo_base64, "base64").toString("utf8") ===
            `yareon:deposit:${input.programId}` &&
          transaction.transfers?.some(
            (transfer) =>
              transfer.account === input.treasuryAccountId &&
              transferAmount(transfer.amount) ===
                BigInt(input.amount.atomicAmount),
          ),
      );
      if (deposit) return;
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, input.retryDelayMs ?? 750),
      );
    }
  }

  throw new Error(
    "Mirror Node could not confirm the exact wallet deposit into this program treasury.",
  );
}

function mirrorTransactionId(transactionId: string): string {
  const [accountId, timestamp] = transactionId.split("@");
  if (!accountId || !timestamp) return transactionId;
  const separator = timestamp.indexOf(".");
  if (separator < 0) return transactionId;
  return `${accountId}-${timestamp.slice(0, separator)}-${timestamp.slice(separator + 1)}`;
}

function transferAmount(value: number | string | undefined): bigint | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }
  return undefined;
}
