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

  constructor(private config: HederaConfig) {
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
    const url = new URL(
      `/api/v1/topics/${this.config.topicId}/messages`,
      this.mirrorNodeUrl,
    );
    url.searchParams.set("limit", "100");
    url.searchParams.set("order", "asc");
    const response = await fetch(url);
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
    };
    return body.messages
      .map((message) => {
        const decoded = Buffer.from(message.message, "base64").toString("utf8");
        const event = parseProtocolEvent(JSON.parse(decoded));
        return {
          ...event,
          ledgerReference: {
            topicId: message.topic_id,
            sequenceNumber: message.sequence_number,
            consensusTimestamp: message.consensus_timestamp,
          },
        };
      })
      .filter((event) => event.programId === programId);
  }
}

export class HederaPaymentScheduler implements PaymentScheduler {
  private client: Client;
  private relayKeys: Record<string, string | undefined>;

  constructor(private config: HederaConfig) {
    this.client = createHederaClient(config);
    this.relayKeys = {
      DELIVERY_VERIFIER: config.verifierRelayPrivateKey,
      FINANCE: config.financeRelayPrivateKey,
    };
  }

  async create(request: ScheduledPaymentRequest): Promise<ScheduledPayment> {
    if (request.amount.asset !== "HBAR" || request.amount.decimals !== 8) {
      throw new Error("The Hedera adapter currently settles HBAR with 8 decimals");
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
    return {
      scheduleId: receipt.scheduleId.toString(),
      scheduledTransactionId: receipt.scheduledTransactionId?.toString(),
      status: "PENDING",
    };
  }

  async approve(scheduleId: string, approval: Approval): Promise<void> {
    const relayKey = this.relayKeys[approval.role];
    if (!relayKey) throw new Error(`No relay key configured for ${approval.role}`);
    const transaction = await new ScheduleSignTransaction()
      .setScheduleId(scheduleId)
      .freezeWith(this.client)
      .sign(PrivateKey.fromString(relayKey));
    const response = await transaction.execute(this.client);
    await response.getReceipt(this.client);
  }

  async getStatus(scheduleId: string): Promise<PaymentStatus> {
    const info = await new ScheduleInfoQuery()
      .setScheduleId(scheduleId)
      .execute(this.client);
    if (info.executed) return "EXECUTED";
    if (info.deleted) return "FAILED";
    if (info.expirationTime && info.expirationTime.toDate() < new Date()) {
      return "EXPIRED";
    }
    return "PENDING";
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
    verifierRelayPrivateKey: process.env.HEDERA_VERIFIER_RELAY_KEY,
    financeRelayPrivateKey: process.env.HEDERA_FINANCE_RELAY_KEY,
    mirrorNodeUrl: process.env.HEDERA_MIRROR_NODE_URL,
  };
}
