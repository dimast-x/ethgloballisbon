import type { ProtocolEvent, RecordedEvent } from "./events";
import type {
  Approval,
  LedgerReference,
  PaymentStatus,
  ScheduledPayment,
  ScheduledPaymentRequest,
} from "./types";

export interface EventStore {
  append(event: ProtocolEvent): Promise<LedgerReference>;
  read(programId: string): Promise<RecordedEvent[]>;
}

export interface PaymentScheduler {
  create(request: ScheduledPaymentRequest): Promise<ScheduledPayment>;
  approve(scheduleId: string, approval: Approval): Promise<void>;
  getStatus(scheduleId: string): Promise<PaymentStatus>;
}
