import {
  Client,
  Hbar,
  PrivateKey,
  ScheduleCreateTransaction,
  ScheduleInfoQuery,
  ScheduleSignTransaction,
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
  treasuryAccountId: string;
  vendorAccountId: string;
  mirrorNodeUrl?: string;
  verifierRelayPrivateKey?: string;
  financeRelayPrivateKey?: string;
};

export function createHederaClient(config: HederaConfig): Client {
  return Client.forTestnet().setOperator(
    config.operatorAccountId,
    PrivateKey.fromString(config.operatorPrivateKey),
  );
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
    let url: URL | undefined = new URL(
      `/api/v1/topics/${this.config.topicId}/messages`,
      this.mirrorNodeUrl,
    );
    url.searchParams.set("limit", "100");
    url.searchParams.set("order", "asc");
    const events: RecordedEvent[] = [];
    let pages = 0;

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
        }>;
        links?: { next?: string | null };
      };
      for (const message of body.messages) {
        const decoded = Buffer.from(message.message, "base64").toString("utf8");
        const event = parseProtocolEvent(JSON.parse(decoded));
        if (event.programId !== programId) continue;
        events.push({
          ...event,
          ledgerReference: {
            topicId: message.topic_id,
            sequenceNumber: message.sequence_number,
            consensusTimestamp: message.consensus_timestamp,
          },
        });
      }
      pages += 1;
      url = body.links?.next
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
  private relayKeys: Record<string, string | undefined>;
  private createdByMemo = new Map<string, ScheduledPayment>();
  private mirrorNodeUrl: string;

  constructor(
    private config: HederaConfig,
    private mirrorFetch: typeof fetch = fetch,
  ) {
    this.client = createHederaClient(config);
    this.mirrorNodeUrl =
      config.mirrorNodeUrl ?? "https://testnet.mirrornode.hedera.com";
    this.relayKeys = {
      DELIVERY_VERIFIER: config.verifierRelayPrivateKey,
      FINANCE: config.financeRelayPrivateKey,
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

  async approve(scheduleId: string, approval: Approval): Promise<void> {
    const relayKey = this.relayKeys[approval.role];
    if (!relayKey) throw new Error(`No relay key configured for ${approval.role}`);
    const privateKey = PrivateKey.fromString(relayKey);
    try {
      const transaction = await new ScheduleSignTransaction()
        .setScheduleId(scheduleId)
        .freezeWith(this.client)
        .sign(privateKey);
      const response = await transaction.execute(this.client);
      await response.getReceipt(this.client);
    } catch (error) {
      const info = await new ScheduleInfoQuery()
        .setScheduleId(scheduleId)
        .execute(this.client);
      const alreadySigned =
        info.signers
          ?.toArray()
          .some((key) => key.toString() === privateKey.publicKey.toString()) ??
        false;
      if (!alreadySigned) throw error;
    }
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
    treasuryAccountId: required("HEDERA_TREASURY_ACCOUNT_ID"),
    vendorAccountId: required("HEDERA_VENDOR_ACCOUNT_ID"),
    verifierRelayPrivateKey: process.env.HEDERA_VERIFIER_RELAY_KEY,
    financeRelayPrivateKey: process.env.HEDERA_FINANCE_RELAY_KEY,
    mirrorNodeUrl: process.env.HEDERA_MIRROR_NODE_URL,
  };
}
