import { add, lte, subtract, zeroLike } from "./money";
import type {
  AgentAuthorizationDecision,
  AgentDelegation,
  BuyerAllocation,
  HumanBackingAttestation,
  Money,
  PolicyDecision,
  Program,
  ResolvedAgentIdentity,
  Vendor,
} from "./types";

export type PurchaseContext = {
  program: Program;
  allocation: BuyerAllocation;
  vendor: Vendor;
  category: string;
  amount: Money;
};

export function validatePurchase(context: PurchaseContext): PolicyDecision {
  const rules: string[] = [];
  const failures: Array<{ code: string; reason: string }> = [];

  rules.push("PROGRAM_ACTIVE");
  if (context.program.status !== "ACTIVE") {
    failures.push({ code: "PROGRAM_NOT_ACTIVE", reason: "Program is not active." });
  }

  rules.push("BUYER_ACTIVE");
  if (context.allocation.purchasingStatus === "DISABLED") {
    failures.push({
      code: "BUYER_PURCHASING_DISABLED",
      reason: "This buyer no longer has access to create purchases.",
    });
  }

  rules.push("CATEGORY_ALLOWED");
  if (
    !context.program.policy.allowedCategories.includes(context.category) ||
    !context.allocation.allowedCategories.includes(context.category)
  ) {
    failures.push({
      code: "CATEGORY_NOT_ALLOWED",
      reason: `Category ${context.category} is not permitted.`,
    });
  }

  rules.push("VENDOR_APPROVED");
  if (
    context.vendor.status !== "APPROVED" ||
    !context.vendor.approvedCategories.includes(context.category)
  ) {
    failures.push({
      code: "VENDOR_NOT_APPROVED",
      reason: `${context.vendor.name} is not approved for this category.`,
    });
  }

  rules.push("MAX_ORDER_AMOUNT");
  if (!lte(context.amount, context.program.policy.maxOrderAmount)) {
    failures.push({
      code: "MAX_ORDER_AMOUNT_EXCEEDED",
      reason: "Order exceeds the program per-order maximum.",
    });
  }

  rules.push("BUYER_ALLOCATION");
  const available = subtract(
    subtract(context.allocation.totalLimit, context.allocation.committed),
    context.allocation.paid,
  );
  if (!lte(context.amount, available)) {
    failures.push({
      code: "BUYER_LIMIT_EXCEEDED",
      reason: "Order exceeds the buyer's remaining allocation.",
    });
  }

  const first = failures[0];
  return {
    allowed: failures.length === 0,
    code: first?.code ?? "AUTHORIZED",
    reasons: failures.map((failure) => failure.reason),
    evaluatedRules: rules,
  };
}

export type AgentAuthorizationContext = {
  agentId: string;
  action: string;
  program: Program;
  identity?: ResolvedAgentIdentity;
  requireResolvedIdentity?: boolean;
  identityCurrent?: boolean;
  attestation?: HumanBackingAttestation;
  requireHumanBacking?: boolean;
  delegation?: AgentDelegation;
  executionAccountId?: string;
  category: string;
  amount: Money;
  delegatedSpend?: Money;
  now?: string;
};

export function validateAgentAuthorization(
  context: AgentAuthorizationContext,
): AgentAuthorizationDecision {
  const rules: string[] = [];
  const failures: Array<{ code: string; reason: string }> = [];
  const now = new Date(context.now ?? new Date().toISOString()).getTime();
  const delegation = context.delegation;

  if (context.requireResolvedIdentity !== false || context.identity) {
    rules.push("IDENTITY_RESOLVED");
    if (!context.identity || context.identity.agentId !== context.agentId) {
      failures.push({
        code: "AGENT_IDENTITY_REQUIRED",
        reason: "The agent identity has not been resolved.",
      });
    }

    rules.push("ORGANIZATION_MATCH");
    if (
      context.identity &&
      context.identity.organizationReference !== context.program.organizationId
    ) {
      failures.push({
        code: "AGENT_ORGANIZATION_MISMATCH",
        reason: "The resolved agent organization does not match the program.",
      });
    }

    rules.push("IDENTITY_CURRENT");
    if (context.identity && context.identityCurrent === false) {
      failures.push({
        code: "AGENT_IDENTITY_CHANGED",
        reason: "The public agent identity changed after it was authorized.",
      });
    }

    rules.push("EXECUTION_ACCOUNT_MATCH");
    if (
      context.identity &&
      (!context.executionAccountId ||
        context.identity.executionAccountId !== context.executionAccountId)
    ) {
      failures.push({
        code: "AGENT_ACCOUNT_MISMATCH",
        reason: "The agent execution account does not match its public identity.",
      });
    }
  }

  if (context.requireHumanBacking !== false) {
    rules.push("HUMAN_BACKING");
    if (!context.attestation) {
      failures.push({
        code: "HUMAN_BACKING_REQUIRED",
        reason: "The agent must be backed by a verified human.",
      });
    } else if (
      context.attestation.expiresAt &&
      new Date(context.attestation.expiresAt).getTime() <= now
    ) {
      failures.push({
        code: "HUMAN_BACKING_EXPIRED",
        reason: "The human-backing attestation has expired.",
      });
    }
  }

  rules.push("DELEGATION_ACTIVE");
  if (!delegation || delegation.agentId !== context.agentId) {
    failures.push({
      code: "AGENT_DELEGATION_REQUIRED",
      reason: "The agent has no active delegation.",
    });
  } else if (
    delegation.revokedAt ||
    new Date(delegation.validFrom).getTime() > now ||
    new Date(delegation.validUntil).getTime() <= now
  ) {
    failures.push({
      code: delegation.revokedAt
        ? "AGENT_DELEGATION_REVOKED"
        : "AGENT_DELEGATION_EXPIRED",
      reason: "The agent delegation is not active.",
    });
  }

  if (context.identity) {
    rules.push("DELEGATION_INTEGRITY");
    if (
      delegation &&
      context.identity.delegationHash !== delegation.integrityHash
    ) {
      failures.push({
        code: "AGENT_DELEGATION_MISMATCH",
        reason: "The public delegation reference does not match the active delegation.",
      });
    }
  }

  rules.push("PROGRAM_DELEGATED");
  if (
    delegation &&
    !delegation.allowedPrograms.includes("*") &&
    !delegation.allowedPrograms.includes(context.program.id)
  ) {
    failures.push({
      code: "AGENT_PROGRAM_NOT_DELEGATED",
      reason: "This program is not included in the agent delegation.",
    });
  }

  rules.push("ACTION_DELEGATED");
  if (delegation && !delegation.allowedActions.includes(context.action)) {
    failures.push({
      code: "AGENT_ACTION_NOT_DELEGATED",
      reason: `${context.action} is not delegated to this agent.`,
    });
  }

  rules.push("CATEGORY_DELEGATED");
  if (delegation && !delegation.allowedCategories.includes(context.category)) {
    failures.push({
      code: "AGENT_CATEGORY_NOT_DELEGATED",
      reason: `${context.category} is not delegated to this agent.`,
    });
  }

  rules.push("AGENT_ORDER_LIMIT");
  if (delegation && !lte(context.amount, delegation.maxPerOrder)) {
    failures.push({
      code: "AGENT_ORDER_LIMIT_EXCEEDED",
      reason: "The order exceeds the agent's per-order delegation.",
    });
  }

  rules.push("AGENT_TOTAL_SPEND");
  if (
    delegation &&
    !lte(
      add(context.delegatedSpend ?? zeroLike(context.amount), context.amount),
      delegation.maxTotalSpend,
    )
  ) {
    failures.push({
      code: "AGENT_TOTAL_SPEND_EXCEEDED",
      reason: "The order exceeds the agent's total delegated spend.",
    });
  }

  const first = failures[0];
  return {
    agentId: context.agentId,
    action: context.action,
    delegationId: delegation?.delegationId,
    allowed: failures.length === 0,
    code: first?.code ?? "AGENT_AUTHORIZED",
    reasons: failures.map((failure) => failure.reason),
    evaluatedRules: rules,
  };
}
