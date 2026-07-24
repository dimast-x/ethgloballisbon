import { createEvent, type ProtocolEvent, type RecordedEvent } from "../protocol/events";
import { reduceProtocolEvents, type ProtocolProjection } from "../protocol/reducer";
import { validatePurchase } from "../protocol/policy";
import type { DemoFixture } from "./fixtures";
import type { EvidenceReference, Order } from "../protocol/types";

const systemActor = {
  actorId: "openprocure_demo",
  role: "SYSTEM",
  actorType: "SYSTEM" as const,
};

export type DemoAction =
  | "REJECT_OVER_LIMIT"
  | "CREATE_ORDER"
  | "ACCEPT_ORDER"
  | "CREATE_SCHEDULE"
  | "SUBMIT_DELIVERY"
  | "APPROVE_DELIVERY"
  | "APPROVE_FINANCE"
  | "RESET";

export type DemoSession = {
  fixture: DemoFixture;
  runId: string;
  events: RecordedEvent[];
  projection: ProtocolProjection;
};

function recorded<T>(
  event: ReturnType<typeof createEvent<T>>,
  index: number,
): RecordedEvent<T> {
  return {
    ...event,
    ledgerReference: {
      topicId: "0.0.4926017",
      sequenceNumber: index + 1,
      consensusTimestamp: new Date(
        Date.parse(event.occurredAt) + index * 850,
      ).toISOString(),
    },
  };
}

export function createDemoSession(
  fixture: DemoFixture,
  options?: { stableRunId?: string; stableOccurredAt?: string },
): DemoSession {
  const runId =
    options?.stableRunId ?? `run_${crypto.randomUUID().slice(0, 8)}`;
  const base = {
    runId,
    organizationId: fixture.organizationId,
    programId: fixture.program.id,
    actor: systemActor,
  };

  const raw = [
    createEvent({
      ...base,
      eventType: "PROGRAM_CREATED",
      correlationId: `${runId}:program`,
      data: { program: fixture.program },
    }),
    createEvent({
      ...base,
      eventType: "BUYER_ALLOCATED",
      correlationId: `${runId}:allocation`,
      data: { allocation: fixture.allocation },
    }),
    ...fixture.vendors.map((vendor) =>
      createEvent({
        ...base,
        eventType: "VENDOR_APPROVED" as const,
        correlationId: `${runId}:vendor:${vendor.id}`,
        data: { vendor },
      }),
    ),
    ...fixture.offers.map((offer) =>
      createEvent({
        ...base,
        eventType: "OFFER_REGISTERED" as const,
        correlationId: `${runId}:offer:${offer.id}`,
        data: { offer },
      }),
    ),
  ];
  const stableStart = Date.parse(
    options?.stableOccurredAt ?? "2026-07-24T18:30:00.000Z",
  );
  const events = raw.map((event, index) => {
    const normalized = options?.stableRunId
      ? {
          ...event,
          eventId: `${runId}:event:${index + 1}`,
          occurredAt: new Date(stableStart + index * 1_000).toISOString(),
        }
      : event;
    return recorded(normalized as ProtocolEvent, index);
  });
  return { fixture, runId, events, projection: reduceProtocolEvents(events) };
}

export function advanceDemo(
  session: DemoSession,
  action: DemoAction,
  evidence?: EvidenceReference,
): DemoSession {
  if (action === "RESET") return createDemoSession(session.fixture);
  const { fixture, runId } = session;
  const orderId = `order_${runId.slice(-8)}`;
  const offer = fixture.offers.find((item) => item.id === fixture.selectedOfferId)!;
  const vendor = fixture.vendors.find((item) => item.id === offer.vendorId)!;
  const order = session.projection.orders[orderId];
  if (action === "CREATE_ORDER" && order) return session;
  if (action === "ACCEPT_ORDER" && order && order.status !== "CREATED") return session;
  if (action === "CREATE_SCHEDULE" && order?.scheduleId) return session;
  if (action === "SUBMIT_DELIVERY" && order?.evidence) return session;
  if (
    action === "APPROVE_DELIVERY" &&
    order?.approvals.some((approval) => approval.role === "DELIVERY_VERIFIER")
  ) {
    return session;
  }
  if (
    action === "APPROVE_FINANCE" &&
    (order?.status === "PAYMENT_EXECUTED" ||
      order?.approvals.some((approval) => approval.role === "FINANCE"))
  ) {
    return session;
  }
  const base = {
    runId,
    organizationId: fixture.organizationId,
    programId: fixture.program.id,
    orderId,
  };

  let event;
  if (action === "REJECT_OVER_LIMIT") {
    const decision = validatePurchase({
      program: fixture.program,
      allocation: session.projection.allocations[fixture.buyerId],
      vendor,
      category: offer.category,
      amount: fixture.rejectedAmount,
    });
    event = createEvent({
      ...base,
      eventType: "ORDER_REJECTED_BY_POLICY",
      actor: { actorId: fixture.buyerId, role: "BUYER", actorType: "HUMAN" },
      correlationId: `${runId}:reject-over-limit`,
      data: { decision, requestedAmount: fixture.rejectedAmount },
    });
  } else if (action === "CREATE_ORDER") {
    const decision = validatePurchase({
      program: fixture.program,
      allocation: session.projection.allocations[fixture.buyerId],
      vendor,
      category: offer.category,
      amount: offer.amount,
    });
    if (!decision.allowed) throw new Error(decision.reasons.join(" "));
    const nextOrder: Order = {
      id: orderId,
      programId: fixture.program.id,
      buyerId: fixture.buyerId,
      vendorId: vendor.id,
      offerId: offer.id,
      category: offer.category,
      amount: offer.amount,
      status: "CREATED",
      approvals: [],
    };
    event = createEvent({
      ...base,
      eventType: "ORDER_CREATED",
      actor: { actorId: fixture.buyerId, role: "BUYER", actorType: "HUMAN" },
      correlationId: `${runId}:create-order`,
      data: { order: nextOrder, decision },
    });
  } else if (action === "ACCEPT_ORDER") {
    requireStatus(order, "CREATED");
    event = createEvent({
      ...base,
      eventType: "ORDER_ACCEPTED_BY_VENDOR",
      actor: { actorId: vendor.id, role: "VENDOR", actorType: "HUMAN" },
      correlationId: `${runId}:accept-order`,
      data: {},
    });
  } else if (action === "CREATE_SCHEDULE") {
    requireStatus(order, "VENDOR_ACCEPTED");
    event = createEvent({
      ...base,
      eventType: "PAYMENT_SCHEDULE_CREATED",
      actor: systemActor,
      correlationId: `${runId}:schedule`,
      data: { scheduleId: `0.0.${7400000 + session.events.length}` },
    });
  } else if (action === "SUBMIT_DELIVERY") {
    requireStatus(order, "PAYMENT_SCHEDULED");
    event = createEvent({
      ...base,
      eventType: "DELIVERY_SUBMITTED",
      actor: { actorId: vendor.id, role: "VENDOR", actorType: "HUMAN" },
      correlationId: `${runId}:delivery`,
      data: {
        evidence: evidence ?? {
          hash: "sha256:8dd913d641ab7b22ef7b17d88b20ca88",
          mimeType: "application/pdf",
          size: 248120,
          submittedBy: vendor.id,
          submittedAt: new Date().toISOString(),
        },
      },
    });
  } else if (action === "APPROVE_DELIVERY") {
    requireStatus(order, "DELIVERY_SUBMITTED");
    const approvalEvents = [
      createEvent({
        ...base,
        eventType: "DELIVERY_APPROVED" as const,
        actor: {
          actorId: "verifier_university",
          role: "DELIVERY_VERIFIER",
          actorType: "HUMAN" as const,
          hederaAccountId: "0.0.73101",
        },
        correlationId: `${runId}:delivery-approved`,
        data: {},
      }),
      createEvent({
        ...base,
        eventType: "PAYMENT_SIGNATURE_ADDED" as const,
        actor: {
          actorId: "verifier_university",
          role: "DELIVERY_VERIFIER",
          actorType: "HUMAN" as const,
          hederaAccountId: "0.0.73101",
        },
        correlationId: `${runId}:verifier-signature`,
        data: {
          role: "DELIVERY_VERIFIER",
          actorId: "verifier_university",
          reference: "wallet-authenticated:demo-relay",
        },
      }),
    ];
    return appendEvents(session, approvalEvents);
  } else if (action === "APPROVE_FINANCE") {
    requireStatus(order, "DELIVERY_APPROVED");
    const finance = createEvent({
      ...base,
      eventType: "PAYMENT_SIGNATURE_ADDED",
      actor: {
        actorId: "finance_university",
        role: "FINANCE",
        actorType: "HUMAN",
        hederaAccountId: "0.0.73102",
      },
      correlationId: `${runId}:finance-signature`,
      data: {
        role: "FINANCE",
        actorId: "finance_university",
        reference: "wallet-authenticated:demo-relay",
      },
    });
    const executed = createEvent({
      ...base,
      eventType: "PAYMENT_EXECUTED",
      actor: systemActor,
      correlationId: `${runId}:payment-executed`,
      data: {
        paymentTransactionId: `0.0.73000@${Math.floor(Date.now() / 1000)}.000000000`,
      },
    });
    return appendEvents(session, [finance, executed]);
  } else {
    return session;
  }

  return appendEvents(session, [event]);
}

function appendEvents(
  session: DemoSession,
  events: Array<ReturnType<typeof createEvent>>,
): DemoSession {
  const recordedEvents = events.map((event, index) =>
    recorded(event, session.events.length + index),
  );
  const nextEvents = [...session.events, ...recordedEvents];
  return { ...session, events: nextEvents, projection: reduceProtocolEvents(nextEvents) };
}

function requireStatus(order: Order | undefined, expected: Order["status"]): void {
  if (!order || order.status !== expected) {
    throw new Error(`Order must be ${expected}`);
  }
}
