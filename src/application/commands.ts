import type {
  Actor,
  BuyerAllocation,
  EvidenceReference,
  Money,
  Offer,
  Vendor,
} from "../protocol/types";

export type ExecutionMode = "simulation" | "testnet";

type CommandEnvelope = {
  idempotencyKey: string;
  actor: Actor;
};

export type ProtocolCommand =
  | (CommandEnvelope & {
      type: "ALLOCATE_BUYER";
      allocation: BuyerAllocation;
    })
  | (CommandEnvelope & {
      type: "APPROVE_VENDOR";
      vendor: Vendor;
    })
  | (CommandEnvelope & {
      type: "REGISTER_OFFER";
      offer: Offer;
    })
  | (CommandEnvelope & {
      type: "TEST_PURCHASE_POLICY";
      buyerId: string;
      vendorId: string;
      category: string;
      amount: Money;
    })
  | (CommandEnvelope & {
      type: "CREATE_ORDER";
      orderId: string;
      buyerId: string;
      vendorId: string;
      offerId?: string;
      category: string;
      amount: Money;
    })
  | (CommandEnvelope & {
      type: "ACCEPT_ORDER";
      orderId: string;
    })
  | (CommandEnvelope & {
      type: "SUBMIT_DELIVERY";
      orderId: string;
      evidence: EvidenceReference;
    })
  | (CommandEnvelope & {
      type: "APPROVE_DELIVERY";
      orderId: string;
      approvalReference: string;
    })
  | (CommandEnvelope & {
      type: "APPROVE_FINANCE";
      orderId: string;
      approvalReference: string;
    });

export type CommandStatus = "PENDING" | "CONFIRMED" | "FAILED";

export type CommandResult = {
  idempotencyKey: string;
  status: CommandStatus;
  programId: string;
  orderId?: string;
  eventIds: string[];
  ledgerReference?: import("../protocol/types").LedgerReference;
  projection?: import("../protocol/reducer").ProtocolProjection;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
};

