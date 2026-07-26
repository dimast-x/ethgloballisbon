import { authenticatedAdministratorAccountId } from "./wallet-auth";
import {
  getProgramSession,
  reconcileProgramTreasuryFunding,
  runProgramCommand,
} from "./runtime";
import type { ProtocolProjection } from "../protocol/reducer";

export function authenticatedWalletAccountId(request: Request): string | null {
  return authenticatedAdministratorAccountId(request);
}

export function memberAllocationForAccount(
  projection: ProtocolProjection,
  accountId: string,
) {
  return Object.values(projection.allocations).find(
    (allocation) =>
      allocation.walletAccountId === accountId ||
      allocation.buyerId === accountId ||
      allocation.buyerId === `hedera:${accountId}`,
  );
}

export async function getMemberProcurementContext(
  programId: string,
  accountId: string,
) {
  const stored = await getProgramSession(programId, "testnet");
  if (!stored?.projection.program) throw new Error("Program not found.");
  const session = await reconcileProgramTreasuryFunding(stored);
  const program = session.projection.program!;
  const allocation = memberAllocationForAccount(session.projection, accountId);
  if (!allocation) {
    throw new Error(
      "This wallet does not have member purchasing access to the program.",
    );
  }

  const remainingAtomic =
    BigInt(allocation.totalLimit.atomicAmount) -
    BigInt(allocation.committed.atomicAmount) -
    BigInt(allocation.paid.atomicAmount);
  const programFunds = session.treasuryBalance ?? program.budget;
  const spendableAtomic = [
    remainingAtomic,
    BigInt(programFunds.atomicAmount),
    BigInt(program.policy.maxOrderAmount.atomicAmount),
  ].reduce((lowest, value) => (value < lowest ? value : lowest));

  const offers = Object.values(session.projection.offers)
    .filter((offer) => {
      const vendor = session.projection.vendors[offer.vendorId];
      const amount = BigInt(offer.amount.atomicAmount);
      return (
        program.status === "ACTIVE" &&
        allocation.purchasingStatus !== "DISABLED" &&
        vendor?.status === "APPROVED" &&
        Boolean(vendor.settlementAccountId) &&
        vendor.approvedCategories.includes(offer.category) &&
        program.policy.allowedCategories.includes(offer.category) &&
        allocation.allowedCategories.includes(offer.category) &&
        amount <= spendableAtomic
      );
    })
    .sort((left, right) => {
      const difference =
        BigInt(left.amount.atomicAmount) - BigInt(right.amount.atomicAmount);
      return difference === 0n
        ? left.id.localeCompare(right.id)
        : difference < 0n
          ? -1
          : 1;
    })
    .map((offer) => ({
      ...offer,
      vendorName:
        session.projection.vendors[offer.vendorId]?.name ?? offer.vendorId,
    }));

  const orders = Object.values(session.projection.orders)
    .filter((order) => order.buyerId === allocation.buyerId)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((order) => ({
      ...order,
      vendorName:
        session.projection.vendors[order.vendorId]?.name ?? order.vendorId,
    }));

  return {
    program: {
      id: program.id,
      name: program.name,
      description: program.description,
      status: program.status,
      policy: program.policy,
    },
    member: {
      id: allocation.buyerId,
      walletAccountId: accountId,
      purchasingStatus: allocation.purchasingStatus ?? "ACTIVE",
      totalLimit: allocation.totalLimit,
      committed: allocation.committed,
      paid: allocation.paid,
      remaining: {
        ...allocation.totalLimit,
        atomicAmount: (remainingAtomic > 0n ? remainingAtomic : 0n).toString(),
      },
      allowedCategories: allocation.allowedCategories,
    },
    offers,
    recommendedOfferId: offers[0]?.id,
    orders,
  };
}

export async function createMemberOrder(input: {
  programId: string;
  offerId: string;
  accountId: string;
}) {
  const session = await getProgramSession(input.programId, "testnet");
  const program = session?.projection.program;
  if (!session || !program) throw new Error("Program not found.");
  const allocation = memberAllocationForAccount(
    session.projection,
    input.accountId,
  );
  if (!allocation) {
    throw new Error(
      "This wallet does not have member purchasing access to the program.",
    );
  }
  const offer = session.projection.offers[input.offerId];
  const vendor = offer && session.projection.vendors[offer.vendorId];
  if (
    !offer ||
    offer.programId !== program.id ||
    !vendor ||
    vendor.status !== "APPROVED" ||
    !vendor.settlementAccountId
  ) {
    throw new Error("The selected eligible offer was not found.");
  }
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  return runProgramCommand(input.programId, "testnet", {
    type: "CREATE_ORDER",
    idempotencyKey: `${session.runId}:member:${allocation.buyerId}:${suffix}`,
    actor: {
      actorId: allocation.buyerId,
      role: "BUYER",
      actorType: "HUMAN",
      hederaAccountId: input.accountId,
    },
    orderId: `order_${suffix}`,
    buyerId: allocation.buyerId,
    vendorId: offer.vendorId,
    offerId: offer.id,
    category: offer.category,
    amount: offer.amount,
  });
}
