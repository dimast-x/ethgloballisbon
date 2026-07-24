import { z } from "zod";
import type { Actor, LedgerReference } from "./types";

export const protocolEventTypes = [
  "PROGRAM_CREATED",
  "BUYER_ALLOCATED",
  "VENDOR_APPROVED",
  "OFFER_REGISTERED",
  "ORDER_REJECTED_BY_POLICY",
  "ORDER_CREATED",
  "ORDER_ACCEPTED_BY_VENDOR",
  "PAYMENT_SCHEDULE_CREATED",
  "DELIVERY_SUBMITTED",
  "DELIVERY_APPROVED",
  "PAYMENT_SIGNATURE_ADDED",
  "PAYMENT_EXECUTED",
] as const;

export type ProtocolEventType = (typeof protocolEventTypes)[number];

export type ProtocolEvent<T = unknown> = {
  schemaVersion: "0.1";
  eventId: string;
  eventType: ProtocolEventType;
  runId: string;
  organizationId: string;
  programId: string;
  orderId?: string;
  actor: Actor;
  correlationId: string;
  occurredAt: string;
  data: T;
};

export type RecordedEvent<T = unknown> = ProtocolEvent<T> & {
  ledgerReference?: LedgerReference;
};

export const protocolEventSchema = z.object({
  schemaVersion: z.literal("0.1"),
  eventId: z.string().min(1),
  eventType: z.enum(protocolEventTypes),
  runId: z.string().min(1),
  organizationId: z.string().min(1),
  programId: z.string().min(1),
  orderId: z.string().optional(),
  actor: z.object({
    actorId: z.string().min(1),
    role: z.string().min(1),
    actorType: z.enum(["HUMAN", "AGENT", "SYSTEM"]),
    hederaAccountId: z.string().optional(),
  }),
  correlationId: z.string().min(1),
  occurredAt: z.string().datetime(),
  data: z.unknown(),
});

export function parseProtocolEvent(value: unknown): ProtocolEvent {
  return protocolEventSchema.parse(value) as ProtocolEvent;
}

export function createEvent<T>(
  input: Omit<ProtocolEvent<T>, "schemaVersion" | "eventId" | "occurredAt"> & {
    eventId?: string;
    occurredAt?: string;
  },
): ProtocolEvent<T> {
  const event = {
    ...input,
    schemaVersion: "0.1" as const,
    eventId: input.eventId ?? crypto.randomUUID(),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  };
  return parseProtocolEvent(event) as ProtocolEvent<T>;
}
