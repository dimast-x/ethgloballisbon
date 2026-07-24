import { lte, subtract } from "./money";
import type {
  BuyerAllocation,
  Money,
  PolicyDecision,
  Program,
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
