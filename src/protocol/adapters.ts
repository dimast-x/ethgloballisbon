import type { ProtocolEvent, RecordedEvent } from "./events";
import type {
  Approval,
  HumanBackingAttestation,
  HumanBackingRequest,
  LedgerReference,
  PaymentStatus,
  PublicIdentity,
  ResolvedAgentIdentity,
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

export interface PublicIdentityResolver {
  resolve(identity: PublicIdentity): Promise<ResolvedAgentIdentity>;
}

export interface HumanBackingVerifier {
  verify(request: HumanBackingRequest): Promise<HumanBackingAttestation>;
}
