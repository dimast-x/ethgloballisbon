import type { RecordedEvent } from "./events";
import { add } from "./money";
import type {
  BuyerAllocation,
  Offer,
  Order,
  PolicyDecision,
  Program,
  Vendor,
} from "./types";

export type ProtocolProjection = {
  runId?: string;
  program?: Program;
  allocations: Record<string, BuyerAllocation>;
  vendors: Record<string, Vendor>;
  offers: Record<string, Offer>;
  orders: Record<string, Order>;
  rejectedDecisions: PolicyDecision[];
  processedEventIds: string[];
  timeline: RecordedEvent[];
};

export function initialProjection(): ProtocolProjection {
  return {
    allocations: {},
    vendors: {},
    offers: {},
    orders: {},
    rejectedDecisions: [],
    processedEventIds: [],
    timeline: [],
  };
}

export function applyProtocolEvent(
  state: ProtocolProjection,
  event: RecordedEvent,
): ProtocolProjection {
  if (state.processedEventIds.includes(event.eventId)) return state;

  const next: ProtocolProjection = {
    ...state,
    runId: event.runId,
    allocations: { ...state.allocations },
    vendors: { ...state.vendors },
    offers: { ...state.offers },
    orders: { ...state.orders },
    rejectedDecisions: [...state.rejectedDecisions],
    processedEventIds: [...state.processedEventIds, event.eventId],
    timeline: [...state.timeline, event],
  };

  switch (event.eventType) {
    case "PROGRAM_CREATED":
      next.program = (event.data as { program: Program }).program;
      break;
    case "BUYER_ALLOCATED": {
      const allocation = (event.data as { allocation: BuyerAllocation }).allocation;
      next.allocations[allocation.buyerId] = allocation;
      break;
    }
    case "VENDOR_APPROVED": {
      const vendor = (event.data as { vendor: Vendor }).vendor;
      next.vendors[vendor.id] = vendor;
      break;
    }
    case "OFFER_REGISTERED": {
      const offer = (event.data as { offer: Offer }).offer;
      next.offers[offer.id] = offer;
      break;
    }
    case "ORDER_REJECTED_BY_POLICY":
      next.rejectedDecisions.push(
        (event.data as { decision: PolicyDecision }).decision,
      );
      break;
    case "ORDER_CREATED": {
      const order = (event.data as { order: Order }).order;
      next.orders[order.id] = order;
      const allocation = next.allocations[order.buyerId];
      if (allocation) {
        next.allocations[order.buyerId] = {
          ...allocation,
          committed: add(allocation.committed, order.amount),
        };
      }
      break;
    }
    case "ORDER_ACCEPTED_BY_VENDOR":
      updateOrder(next, event.orderId, { status: "VENDOR_ACCEPTED" });
      break;
    case "PAYMENT_SCHEDULE_CREATED":
      updateOrder(next, event.orderId, {
        status: "PAYMENT_SCHEDULED",
        scheduleId: (event.data as { scheduleId: string }).scheduleId,
      });
      break;
    case "DELIVERY_SUBMITTED":
      updateOrder(next, event.orderId, {
        status: "DELIVERY_SUBMITTED",
        evidence: (event.data as { evidence: Order["evidence"] }).evidence,
      });
      break;
    case "DELIVERY_APPROVED":
      updateOrder(next, event.orderId, { status: "DELIVERY_APPROVED" });
      break;
    case "PAYMENT_SIGNATURE_ADDED": {
      const order = event.orderId ? next.orders[event.orderId] : undefined;
      if (order) {
        const approval = (
          event.data as { role: string; actorId: string; reference: string }
        );
        next.orders[order.id] = {
          ...order,
          approvals: [...order.approvals, approval],
        };
      }
      break;
    }
    case "PAYMENT_EXECUTED": {
      const order = event.orderId ? next.orders[event.orderId] : undefined;
      if (order) {
        next.orders[order.id] = {
          ...order,
          status: "PAYMENT_EXECUTED",
          paymentTransactionId: (
            event.data as { paymentTransactionId: string }
          ).paymentTransactionId,
        };
        const allocation = next.allocations[order.buyerId];
        if (allocation) {
          next.allocations[order.buyerId] = {
            ...allocation,
            committed: {
              ...allocation.committed,
              atomicAmount: (
                BigInt(allocation.committed.atomicAmount) -
                BigInt(order.amount.atomicAmount)
              ).toString(),
            },
            paid: add(allocation.paid, order.amount),
          };
        }
      }
      break;
    }
  }

  return next;
}

function updateOrder(
  state: ProtocolProjection,
  orderId: string | undefined,
  patch: Partial<Order>,
): void {
  if (!orderId || !state.orders[orderId]) {
    throw new Error(`Order ${orderId ?? "<missing>"} does not exist`);
  }
  state.orders[orderId] = { ...state.orders[orderId], ...patch };
}

export function reduceProtocolEvents(
  events: RecordedEvent[],
): ProtocolProjection {
  return events.reduce(applyProtocolEvent, initialProjection());
}
