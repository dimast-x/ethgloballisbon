export type Money = {
  asset: string;
  atomicAmount: string;
  decimals: number;
};

export type ApprovalRequirement = {
  role: string;
  count: number;
};

export type ProgramPolicy = {
  allowedCategories: string[];
  maxOrderAmount: Money;
  requireDeliveryEvidence: boolean;
  approvalRequirements: ApprovalRequirement[];
};

export type Program = {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  budget: Money;
  policy: ProgramPolicy;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "CLOSED";
};

export type BuyerAllocation = {
  id: string;
  programId: string;
  buyerId: string;
  totalLimit: Money;
  committed: Money;
  paid: Money;
  allowedCategories: string[];
};

export type Vendor = {
  id: string;
  name: string;
  settlementAccountId: string;
  approvedCategories: string[];
  status: "APPROVED" | "SUSPENDED";
};

export type Offer = {
  id: string;
  programId: string;
  vendorId: string;
  category: string;
  title?: string;
  description: string;
  amount: Money;
  deliveryDays?: number;
  imageUrl?: string;
  location?: string;
  attributes?: Record<string, string>;
};

export type OrderStatus =
  | "CREATED"
  | "VENDOR_ACCEPTED"
  | "PAYMENT_SCHEDULED"
  | "DELIVERY_SUBMITTED"
  | "DELIVERY_APPROVED"
  | "PAYMENT_EXECUTED"
  | "CANCELLED";

export type EvidenceReference = {
  hash: string;
  mimeType: string;
  size: number;
  submittedBy: string;
  submittedAt: string;
};

export type Order = {
  id: string;
  programId: string;
  buyerId: string;
  vendorId: string;
  supplierName?: string;
  supplierSettlementAccountId?: string;
  offerId?: string;
  category: string;
  amount: Money;
  status: OrderStatus;
  scheduleId?: string;
  evidence?: EvidenceReference;
  approvals: Approval[];
  paymentTransactionId?: string;
};

export type PolicyDecision = {
  allowed: boolean;
  code: string;
  reasons: string[];
  evaluatedRules: string[];
};

export type PublicIdentity = {
  scheme: string;
  name: string;
};

export type ResolvedAgentIdentity = {
  agentId: string;
  publicIdentity: PublicIdentity;
  organizationReference: string;
  executionAccountId: string;
  role: string;
  protocolVersion: string;
  delegationHash: string;
  endpoint?: string;
  resolutionHash: string;
  resolvedAt: string;
};

export type HumanBackingAttestation = {
  scheme: string;
  verificationReference: string;
  subjectReference: string;
  verifiedAt: string;
  expiresAt?: string;
};

export type AgentDelegation = {
  delegationId: string;
  organizationId: string;
  principalId: string;
  agentId: string;
  allowedPrograms: string[];
  allowedActions: string[];
  allowedCategories: string[];
  maxPerOrder: Money;
  maxTotalSpend: Money;
  validFrom: string;
  validUntil: string;
  revokedAt?: string;
  integrityHash: string;
};

export type AgentAuthorizationDecision = PolicyDecision & {
  agentId: string;
  action: string;
  delegationId?: string;
};

export type HumanBackingRequest = {
  subjectReference: string;
  action: string;
  environment: string;
  signal: string;
  proof: unknown;
};

export type Actor = {
  actorId: string;
  role: string;
  actorType: "HUMAN" | "AGENT" | "SYSTEM";
  hederaAccountId?: string;
};

export type LedgerReference = {
  topicId?: string;
  sequenceNumber?: number;
  consensusTimestamp?: string;
  transactionId?: string;
};

export type PaymentState = "PENDING" | "EXECUTED" | "FAILED" | "EXPIRED";

export type PaymentStatus = {
  state: PaymentState;
  scheduledTransactionId?: string;
  paymentTransactionId?: string;
};

export type ScheduledPaymentRequest = {
  programId: string;
  orderId: string;
  payerAccountId: string;
  payeeAccountId: string;
  amount: Money;
  memo: string;
};

export type ScheduledPayment = {
  scheduleId: string;
  scheduledTransactionId?: string;
  status: PaymentState;
};

export type Approval = {
  actorId: string;
  role: string;
  reference: string;
  hederaAccountId?: string;
  transactionId?: string;
};
