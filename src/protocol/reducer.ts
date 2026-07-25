import type { RecordedEvent } from "./events";
import { add } from "./money";
import type {
  AgentAuthorizationDecision,
  AgentDelegation,
  BuyerAllocation,
  HumanBackingAttestation,
  Offer,
  Order,
  PolicyDecision,
  Program,
  ProgramHederaConfig,
  ResolvedAgentIdentity,
  Vendor,
} from "./types";

export type ProtocolProjection = {
  runId?: string;
  program?: Program;
  allocations: Record<string, BuyerAllocation>;
  vendors: Record<string, Vendor>;
  offers: Record<string, Offer>;
  orders: Record<string, Order>;
  agentIdentities: Record<string, ResolvedAgentIdentity>;
  humanBacking: Record<string, HumanBackingAttestation>;
  agentDelegations: Record<string, AgentDelegation>;
  agentAuthorizationDecisions: AgentAuthorizationDecision[];
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
    agentIdentities: {},
    humanBacking: {},
    agentDelegations: {},
    agentAuthorizationDecisions: [],
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
    agentIdentities: { ...state.agentIdentities },
    humanBacking: { ...state.humanBacking },
    agentDelegations: { ...state.agentDelegations },
    agentAuthorizationDecisions: [...state.agentAuthorizationDecisions],
    rejectedDecisions: [...state.rejectedDecisions],
    processedEventIds: [...state.processedEventIds, event.eventId],
    timeline: [...state.timeline, event],
  };

  switch (event.eventType) {
    case "PROGRAM_CREATED":
      next.program = (event.data as { program: Program }).program;
      break;
    case "PROGRAM_UPFUNDED": {
      const { amount } = event.data as { amount: Program["budget"] };
      if (next.program) {
        next.program = {
          ...next.program,
          budget: add(next.program.budget, amount),
          status: next.program.hedera?.fundingMode === "USER_DEPOSIT"
            ? "ACTIVE"
            : next.program.status,
        };
      }
      break;
    }
    case "PROGRAM_SETTLEMENT_CONFIGURED": {
      const { hedera, vendorId, vendorSettlementAccountId, policy } = event.data as {
        hedera: ProgramHederaConfig;
        vendorId?: string;
        vendorSettlementAccountId?: string;
        policy?: Program["policy"];
      };
      if (next.program) {
        next.program = {
          ...next.program,
          hedera,
          policy: policy ?? next.program.policy,
          status: hedera.fundingMode === "USER_DEPOSIT"
            ? "DRAFT"
            : "ACTIVE",
        };
      }
      // Backward compatibility for older events that stored one program-level
      // supplier destination. New events keep settlement accounts on suppliers.
      const vendor = vendorId ? next.vendors[vendorId] : undefined;
      if (vendor && vendorSettlementAccountId) {
        next.vendors[vendor.id] = {
          ...vendor,
          settlementAccountId: vendorSettlementAccountId,
        };
      }
      break;
    }
    case "BUYER_ALLOCATED": {
      const allocation = (event.data as { allocation: BuyerAllocation }).allocation;
      next.allocations[allocation.buyerId] = allocation;
      break;
    }
    case "BUYER_ALLOCATION_UPFUNDED": {
      const { buyerId, amount } = event.data as {
        buyerId: string;
        amount: BuyerAllocation["totalLimit"];
      };
      const allocation = next.allocations[buyerId];
      if (allocation) {
        next.allocations[buyerId] = {
          ...allocation,
          totalLimit: add(allocation.totalLimit, amount),
        };
      }
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
    case "SUPPLIER_UPDATED": {
      const { vendor, offer } = event.data as { vendor: Vendor; offer: Offer };
      next.vendors[vendor.id] = vendor;
      next.offers[offer.id] = offer;
      break;
    }
    case "SUPPLIER_REMOVED": {
      const { vendorId } = event.data as { vendorId: string };
      const vendor = next.vendors[vendorId];
      if (vendor) {
        next.vendors[vendorId] = { ...vendor, status: "SUSPENDED" };
      }
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
        const approval = event.data as Order["approvals"][number];
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
    case "AGENT_IDENTITY_RESOLVED": {
      const identity = (
        event.data as { identity: ResolvedAgentIdentity }
      ).identity;
      next.agentIdentities[identity.agentId] = identity;
      break;
    }
    case "AGENT_HUMAN_BACKING_VERIFIED": {
      const attestation = (
        event.data as { attestation: HumanBackingAttestation }
      ).attestation;
      next.humanBacking[attestation.subjectReference] = attestation;
      break;
    }
    case "AGENT_DELEGATION_GRANTED": {
      const delegation = (
        event.data as { delegation: AgentDelegation }
      ).delegation;
      next.agentDelegations[delegation.agentId] = delegation;
      break;
    }
    case "AGENT_AUTHORIZATION_EVALUATED": {
      const decision = (
        event.data as { decision: AgentAuthorizationDecision }
      ).decision;
      next.agentAuthorizationDecisions.push(decision);
      if (!decision.allowed) next.rejectedDecisions.push(decision);
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
