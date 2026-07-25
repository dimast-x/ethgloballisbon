import {
  AccountInfoQuery,
  Client,
  Hbar,
  PrivateKey,
  ScheduleCreateTransaction,
  ScheduleInfoQuery,
  TopicMessageSubmitTransaction,
  TransferTransaction,
} from "@hashgraph/sdk";
import type { EventStore, PaymentScheduler } from "../protocol/adapters";
import { parseProtocolEvent, type ProtocolEvent, type RecordedEvent } from "../protocol/events";
import type {
  Approval,
  LedgerReference,
  PaymentStatus,
  ScheduledPayment,
  ScheduledPaymentRequest,
} from "../protocol/types";

export type HederaConfig = {
  operatorAccountId: string;
  operatorPrivateKey: string;
  topicId: string;
  treasuryAccountId?: string;
  vendorAccountId?: string;
  mirrorNodeUrl?: string;
  verifierAccountId?: string;
  financeAccountId?: string;
};

export function createHederaClient(config: HederaConfig): Client {
  return Client.forTestnet().setOperator(
    config.operatorAccountId,
    parseHederaPrivateKey(config.operatorPrivateKey),
  );
}

export function parseHederaPrivateKey(value: string): PrivateKey {
  const raw = value.startsWith("0x") ? value.slice(2) : value;
  return /^[0-9a-fA-F]{64}$/.test(raw)
    ? PrivateKey.fromStringECDSA(raw)
    : PrivateKey.fromString(value);
}

export class HederaEventStore implements EventStore {
  private client: Client;
  private mirrorNodeUrl: string;

  constructor(
    private config: HederaConfig,
    private mirrorFetch: typeof fetch = fetch,
  ) {
    this.client = createHederaClient(config);
    this.mirrorNodeUrl =
      config.mirrorNodeUrl ?? "https://testnet.mirrornode.hedera.com";
  }

  async append(event: ProtocolEvent): Promise<LedgerReference> {
    const response = await new TopicMessageSubmitTransaction()
      .setTopicId(this.config.topicId)
      .setMessage(JSON.stringify(event))
      .execute(this.client);
    const receipt = await response.getReceipt(this.client);
    return {
      topicId: this.config.topicId,
      sequenceNumber: receipt.topicSequenceNumber?.toNumber(),
      transactionId: response.transactionId.toString(),
    };
  }

  async read(programId: string): Promise<RecordedEvent[]> {
    return this.readEvents(programId);
  }

  async readAll(): Promise<RecordedEvent[]> {
    return this.readEvents();
  }

  private async readEvents(programId?: string): Promise<RecordedEvent[]> {
    let url: URL | undefined = new URL(
      `/api/v1/topics/${this.config.topicId}/messages`,
      this.mirrorNodeUrl,
    );
    url.searchParams.set("limit", "100");
    url.searchParams.set("order", "desc");
    const events: RecordedEvent[] = [];
    let pages = 0;
    let reachedProgramStart = false;
    const chunkGroups = new Map<
      string,
      {
        total: number;
        parts: Map<number, Buffer>;
        messages: Array<{
          sequence_number: number;
          consensus_timestamp: string;
          topic_id: string;
        }>;
      }
    >();

    while (url && pages < 100) {
      const response = await this.mirrorFetch(url);
      if (!response.ok) {
        throw new Error(`Mirror Node returned ${response.status}`);
      }
      const body = (await response.json()) as {
        messages: Array<{
          message: string;
          sequence_number: number;
          consensus_timestamp: string;
          topic_id: string;
          chunk_info?: {
            initial_transaction_id?: {
              account_id?: string;
              nonce?: number;
              scheduled?: boolean;
              transaction_valid_start?: string;
            };
            number: number;
            total: number;
          };
        }>;
        links?: { next?: string | null };
      };
      for (const message of body.messages) {
        let payload = Buffer.from(message.message, "base64");
        let reference: {
          sequence_number: number;
          consensus_timestamp: string;
          topic_id: string;
        } = message;
        const chunk = message.chunk_info;
        if (chunk && chunk.total > 1) {
          const chunkKey = JSON.stringify(
            chunk.initial_transaction_id ?? {
              topicId: message.topic_id,
              firstSequence: message.sequence_number - chunk.number + 1,
            },
          );
          const group = chunkGroups.get(chunkKey) ?? {
            total: chunk.total,
            parts: new Map<number, Buffer>(),
            messages: [],
          };
          group.parts.set(chunk.number, payload);
          group.messages.push(message);
          chunkGroups.set(chunkKey, group);
          if (group.parts.size < group.total) continue;

          const orderedParts = Array.from(
            { length: group.total },
            (_, index) => group.parts.get(index + 1),
          );
          if (orderedParts.some((part) => !part)) continue;
          payload = Buffer.concat(orderedParts as Buffer[]);
          reference = group.messages.reduce((latest, candidate) =>
            candidate.sequence_number > latest.sequence_number
              ? candidate
              : latest,
          );
          chunkGroups.delete(chunkKey);
        }

        const decoded = payload.toString("utf8");
        let event: ProtocolEvent;
        try {
          event = parseProtocolEvent(JSON.parse(decoded));
        } catch {
          // The shared topic also contains plain-text wallet authentication
          // challenges. Only valid protocol envelopes belong in projections.
          continue;
        }
        if (programId && event.programId !== programId) continue;
        events.push({
          ...event,
          ledgerReference: {
            topicId: reference.topic_id,
            sequenceNumber: reference.sequence_number,
            consensusTimestamp: reference.consensus_timestamp,
          },
        });
        if (programId && event.eventType === "PROGRAM_CREATED") {
          reachedProgramStart = true;
        }
      }
      pages += 1;
      url = !reachedProgramStart && body.links?.next
        ? new URL(body.links.next, this.mirrorNodeUrl)
        : undefined;
    }
    if (url) {
      throw new Error("Mirror Node event pagination exceeded its safety limit");
    }

    return events.sort(
      (a, b) =>
        (a.ledgerReference?.sequenceNumber ?? 0) -
        (b.ledgerReference?.sequenceNumber ?? 0),
    );
  }
}

export class HederaPaymentScheduler implements PaymentScheduler {
  private client: Client;
  private roleAccounts: Record<string, string | undefined>;
  private createdByMemo = new Map<string, ScheduledPayment>();
  private mirrorNodeUrl: string;
  private approvalQueries: {
    accountKey(accountId: string): Promise<string>;
    scheduleSignerKeys(scheduleId: string): Promise<string[]>;
    walletTransaction(transactionId: string): Promise<{
      payerAccountId: string;
      scheduleId: string;
      name: string;
      result: string;
    }>;
  };

  constructor(
    private config: HederaConfig,
    private mirrorFetch: typeof fetch = fetch,
    approvalQueries?: {
      accountKey(accountId: string): Promise<string>;
      scheduleSignerKeys(scheduleId: string): Promise<string[]>;
      walletTransaction(transactionId: string): Promise<{
        payerAccountId: string;
        scheduleId: string;
        name: string;
        result: string;
      }>;
    },
  ) {
    this.client = createHederaClient(config);
    this.mirrorNodeUrl =
      config.mirrorNodeUrl ?? "https://testnet.mirrornode.hedera.com";
    this.roleAccounts = {
      DELIVERY_VERIFIER: config.verifierAccountId,
      FINANCE: config.financeAccountId,
    };
    this.approvalQueries = approvalQueries ?? {
      accountKey: async (accountId) => {
        const info = await new AccountInfoQuery()
          .setAccountId(accountId)
          .execute(this.client);
        if (!info.key) throw new Error(`Hedera account ${accountId} has no key.`);
        return info.key.toString();
      },
      scheduleSignerKeys: async (scheduleId) => {
        const info = await new ScheduleInfoQuery()
          .setScheduleId(scheduleId)
          .execute(this.client);
        return info.signers?.toArray().map((key) => key.toString()) ?? [];
      },
      walletTransaction: async (transactionId) =>
        this.findWalletApprovalTransaction(transactionId),
    };
  }

  async create(request: ScheduledPaymentRequest): Promise<ScheduledPayment> {
    if (request.amount.asset !== "HBAR" || request.amount.decimals !== 8) {
      throw new Error("The Hedera adapter currently settles HBAR with 8 decimals");
    }
    const cached = this.createdByMemo.get(request.memo);
    if (cached) return cached;
    const recovered = await this.findScheduleByMemo(request.memo);
    if (recovered) {
      this.createdByMemo.set(request.memo, recovered);
      return recovered;
    }
    const transfer = new TransferTransaction()
      .addHbarTransfer(
        request.payerAccountId,
        Hbar.fromTinybars(`-${request.amount.atomicAmount}`),
      )
      .addHbarTransfer(
        request.payeeAccountId,
        Hbar.fromTinybars(request.amount.atomicAmount),
      )
      .setTransactionMemo(request.memo)
      .freezeWith(this.client);
    const response = await new ScheduleCreateTransaction()
      .setScheduledTransaction(transfer)
      .setScheduleMemo(request.memo)
      .execute(this.client);
    const receipt = await response.getReceipt(this.client);
    if (!receipt.scheduleId) throw new Error("Hedera did not return a schedule ID");
    const payment = {
      scheduleId: receipt.scheduleId.toString(),
      scheduledTransactionId: receipt.scheduledTransactionId?.toString(),
      status: "PENDING" as const,
    };
    this.createdByMemo.set(request.memo, payment);
    return payment;
  }

  async confirmApproval(scheduleId: string, approval: Approval): Promise<void> {
    const expectedAccountId = this.roleAccounts[approval.role];
    if (!expectedAccountId) {
      throw new Error(`No Hedera account is configured for ${approval.role}.`);
    }
    if (approval.hederaAccountId !== expectedAccountId) {
      throw new Error(
        `${approval.role} approval must come from Hedera account ${expectedAccountId}.`,
      );
    }
    if (
      !approval.transactionId ||
      !/^\d+\.\d+\.\d+@\d+\.\d+$/.test(approval.transactionId)
    ) {
      throw new Error("A valid Hedera wallet transaction ID is required.");
    }
    const [accountKey, signerKeys, walletTransaction] = await Promise.all([
      this.approvalQueries.accountKey(expectedAccountId),
      this.approvalQueries.scheduleSignerKeys(scheduleId),
      this.approvalQueries.walletTransaction(approval.transactionId),
    ]);
    if (
      walletTransaction.result !== "SUCCESS" ||
      walletTransaction.name !== "SCHEDULESIGN" ||
      walletTransaction.payerAccountId !== expectedAccountId ||
      walletTransaction.scheduleId !== scheduleId
    ) {
      throw new Error(
        "The Hedera wallet transaction does not confirm this account's signature on this schedule.",
      );
    }
    if (!signerKeys.includes(accountKey)) {
      throw new Error(
        `Hedera has not recorded the ${approval.role} wallet signature for this schedule.`,
      );
    }
  }

  private async findWalletApprovalTransaction(transactionId: string): Promise<{
    payerAccountId: string;
    scheduleId: string;
    name: string;
    result: string;
  }> {
    const url = new URL(
      `/api/v1/transactions/${encodeURIComponent(transactionId)}`,
      this.mirrorNodeUrl,
    );
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await this.mirrorFetch(url);
      if (response.ok) {
        const body = (await response.json()) as {
          transactions?: Array<{
            payer_account_id?: string;
            entity_id?: string;
            name?: string;
            result?: string;
          }>;
        };
        const transaction = body.transactions?.find(
          (candidate) =>
            candidate.name === "SCHEDULESIGN" &&
            candidate.result === "SUCCESS",
        );
        if (transaction) {
          return {
            payerAccountId: transaction.payer_account_id ?? "",
            scheduleId: transaction.entity_id ?? "",
            name: transaction.name ?? "",
            result: transaction.result ?? "",
          };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    throw new Error(
      "Mirror Node has not confirmed the Hedera wallet schedule-sign transaction yet.",
    );
  }

  async getStatus(scheduleId: string): Promise<PaymentStatus> {
    const info = await new ScheduleInfoQuery()
      .setScheduleId(scheduleId)
      .execute(this.client);
    const scheduledTransactionId = info.scheduledTransactionId?.toString();
    if (info.executed) {
      return {
        state: "EXECUTED",
        scheduledTransactionId,
        paymentTransactionId: scheduledTransactionId,
      };
    }
    if (info.deleted) return { state: "FAILED", scheduledTransactionId };
    if (info.expirationTime && info.expirationTime.toDate() < new Date()) {
      return { state: "EXPIRED", scheduledTransactionId };
    }
    return { state: "PENDING", scheduledTransactionId };
  }

  private async findScheduleByMemo(
    memo: string,
  ): Promise<ScheduledPayment | undefined> {
    let url: URL | undefined = new URL("/api/v1/schedules", this.mirrorNodeUrl);
    url.searchParams.set("limit", "100");
    url.searchParams.set("order", "desc");
    url.searchParams.set("account.id", this.config.operatorAccountId);
    let pages = 0;
    while (url && pages < 100) {
      const response = await this.mirrorFetch(url);
      if (!response.ok) return undefined;
      const body = (await response.json()) as {
        schedules?: Array<{
          schedule_id: string;
          memo?: string;
          executed_timestamp?: string | null;
          deleted?: boolean;
          scheduled_transaction_id?: string | null;
        }>;
        links?: { next?: string | null };
      };
      const match = body.schedules?.find((schedule) => schedule.memo === memo);
      if (match) {
        return {
          scheduleId: match.schedule_id,
          scheduledTransactionId:
            match.scheduled_transaction_id ?? undefined,
          status: match.executed_timestamp
            ? "EXECUTED"
            : match.deleted
              ? "FAILED"
              : "PENDING",
        };
      }
      pages += 1;
      url = body.links?.next
        ? new URL(body.links.next, this.mirrorNodeUrl)
        : undefined;
    }
    if (url) {
      throw new Error(
        "Mirror Node schedule pagination exceeded its safety limit",
      );
    }
    return undefined;
  }
}

export function hederaConfigFromEnv(): HederaConfig {
  const required = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable ${name}`);
    return value;
  };
  return {
    operatorAccountId: required("HEDERA_OPERATOR_ID"),
    operatorPrivateKey: required("HEDERA_OPERATOR_KEY"),
    topicId: required("HEDERA_TOPIC_ID"),
    mirrorNodeUrl: process.env.HEDERA_MIRROR_NODE_URL,
  };
}
