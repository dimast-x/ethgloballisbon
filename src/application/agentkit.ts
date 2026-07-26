import { createHash } from "node:crypto";
import {
  agentkitVerificationReference,
  validateAgentAddress,
  type VerifiedAgentkitAccess,
} from "../adapters/agentkit";
import type { CommandResult } from "./commands";
import { getProgramSession, runProgramCommand } from "./runtime";

export type AgentkitProcurementAction =
  | "AUTHORIZE_AGENT_ACTION"
  | "CREATE_ORDER";

export type AgentkitProcurementIntent = {
  programId: string;
  agentId: string;
  offerId: string;
  action: AgentkitProcurementAction;
};

export async function getAgentkitProcurementContext(programId: string) {
  const session = await getProgramSession(programId, "testnet");
  const program = session?.projection.program;
  if (!session || !program) throw new Error("Program not found.");
  const delegation = session.projection.agentDelegations[session.agentId];
  if (!delegation) throw new Error("The program has no agent delegation.");
  const allocation = session.projection.allocations[session.buyerId];
  if (!allocation) throw new Error("The delegated buyer allocation was not found.");

  const delegatedSpend = session.projection.timeline
    .filter(
      (event) =>
        event.eventType === "ORDER_CREATED" &&
        event.actor.actorType === "AGENT" &&
        event.actor.actorId === session.agentId,
    )
    .reduce((total, event) => {
      const order = (
        event.data as {
          order?: { amount?: { atomicAmount?: string } };
        }
      ).order;
      return total + BigInt(order?.amount?.atomicAmount ?? "0");
    }, 0n);
  const remainingDelegation =
    BigInt(delegation.maxTotalSpend.atomicAmount) - delegatedSpend;
  const remainingAllocation =
    BigInt(allocation.totalLimit.atomicAmount) -
    BigInt(allocation.committed.atomicAmount) -
    BigInt(allocation.paid.atomicAmount);
  const remainingProgramFunds = BigInt(
    (session.treasuryBalance ?? program.budget).atomicAmount,
  );
  const delegationActive =
    (delegation.allowedPrograms.includes("*") ||
      delegation.allowedPrograms.includes(program.id)) &&
    new Date(delegation.validUntil).getTime() > Date.now();

  const offers = Object.values(session.projection.offers)
    .filter((offer) => {
      const vendor = session.projection.vendors[offer.vendorId];
      const amount = BigInt(offer.amount.atomicAmount);
      return (
        program.status === "ACTIVE" &&
        delegationActive &&
        offer.programId === program.id &&
        vendor?.status === "APPROVED" &&
        Boolean(vendor.settlementAccountId) &&
        vendor.approvedCategories.includes(offer.category) &&
        (program.policy.allowedCategories.length === 0 ||
          program.policy.allowedCategories.includes(offer.category)) &&
        delegation.allowedCategories.includes(offer.category) &&
        amount <= BigInt(delegation.maxPerOrder.atomicAmount) &&
        amount <= remainingDelegation &&
        amount <= remainingAllocation &&
        amount <= remainingProgramFunds
      );
    })
    .sort((left, right) => {
      const amountOrder =
        BigInt(left.amount.atomicAmount) - BigInt(right.amount.atomicAmount);
      return amountOrder === 0n
        ? left.id.localeCompare(right.id)
        : amountOrder < 0n
          ? -1
          : 1;
    })
    .map((offer) => ({
      id: offer.id,
      vendorId: offer.vendorId,
      vendorName: session.projection.vendors[offer.vendorId]?.name,
      category: offer.category,
      description: offer.description,
      amount: offer.amount,
      deliveryDays: offer.deliveryDays,
    }));

  return {
    program: {
      id: program.id,
      name: program.name,
      status: program.status,
      policy: program.policy,
    },
    buyerId: session.buyerId,
    agent: {
      id: session.agentId,
      hederaAccountId: session.agentExecutionAccountId,
      worldAgentAddress: delegation.worldAgentAddress,
    },
    delegation,
    remaining: {
      delegationAtomic: remainingDelegation.toString(),
      allocationAtomic: remainingAllocation.toString(),
      programFundsAtomic: remainingProgramFunds.toString(),
    },
    offers,
    recommendedOfferId: offers[0]?.id,
  };
}

export function canonicalAgentkitIntent(
  intent: AgentkitProcurementIntent,
): string {
  return JSON.stringify({
    action: intent.action,
    agentId: intent.agentId,
    offerId: intent.offerId,
    programId: intent.programId,
  });
}

export function agentkitIntentHash(intent: AgentkitProcurementIntent): string {
  return `sha256:${createHash("sha256")
    .update(canonicalAgentkitIntent(intent))
    .digest("hex")}`;
}

export function parseAgentkitProcurementIntent(
  value: unknown,
): AgentkitProcurementIntent {
  if (!value || typeof value !== "object") {
    throw new Error("A procurement intent is required.");
  }
  const input = value as Partial<AgentkitProcurementIntent>;
  if (
    !input.programId ||
    !input.agentId ||
    !input.offerId ||
    (input.action !== "AUTHORIZE_AGENT_ACTION" &&
      input.action !== "CREATE_ORDER")
  ) {
    throw new Error(
      "Program, agent, offer, and a supported procurement action are required.",
    );
  }
  return {
    programId: input.programId,
    agentId: input.agentId,
    offerId: input.offerId,
    action: input.action,
  };
}

export async function executeAgentkitProcurementIntent(
  intent: AgentkitProcurementIntent,
  access: VerifiedAgentkitAccess,
): Promise<{
  result: CommandResult;
  verificationReference: string;
  agentAddress: string;
}> {
  const session = await getProgramSession(intent.programId, "testnet");
  const program = session?.projection.program;
  if (!session || !program) throw new Error("Program not found.");
  if (intent.agentId !== session.agentId) {
    throw new Error("The procurement intent targets the wrong agent.");
  }
  const delegation = session.projection.agentDelegations[intent.agentId];
  if (!delegation?.worldAgentAddress) {
    throw new Error(
      "This delegation is not bound to a World AgentKit address. Create a new program after configuring AgentKit.",
    );
  }
  if (
    validateAgentAddress(delegation.worldAgentAddress) !==
    validateAgentAddress(access.agentAddress)
  ) {
    throw new Error("The AgentKit signer does not match the active delegation.");
  }
  const offer = session.projection.offers[intent.offerId];
  const vendor = offer && session.projection.vendors[offer.vendorId];
  if (
    !offer ||
    offer.programId !== program.id ||
    !vendor ||
    vendor.status !== "APPROVED" ||
    !vendor.settlementAccountId
  ) {
    throw new Error("The selected approved offer was not found.");
  }

  const verificationReference = agentkitVerificationReference(access);
  const replayed = session.projection.timeline.some(
    (event) =>
      event.eventType === "AGENTKIT_ACCESS_VERIFIED" &&
      (
        event.data as {
          attestation?: { verificationReference?: string };
        }
      ).attestation?.verificationReference === verificationReference,
  );
  if (replayed) throw new Error("This AgentKit challenge was already used.");

  const verified = await runProgramCommand(intent.programId, "testnet", {
    type: "RECORD_AGENTKIT_ACCESS",
    idempotencyKey: `${session.runId}:agentkit:${verificationReference}`,
    actor: {
      actorId: "yareon",
      role: "SYSTEM",
      actorType: "SYSTEM",
    },
    attestation: {
      scheme: "world-agentkit",
      verificationReference,
      subjectReference: intent.agentId,
      verifiedAt: new Date().toISOString(),
      expiresAt: access.expiresAt,
      agentAddress: access.agentAddress,
      verificationMethod: "agentbook",
    },
  });
  if (verified.status === "FAILED") return {
    result: verified,
    verificationReference,
    agentAddress: access.agentAddress,
  };

  const actor = {
    actorId: intent.agentId,
    role: "PROCUREMENT_AGENT",
    actorType: "AGENT" as const,
    hederaAccountId: session.agentExecutionAccountId,
  };
  const result =
    intent.action === "AUTHORIZE_AGENT_ACTION"
      ? await runProgramCommand(intent.programId, "testnet", {
          type: "AUTHORIZE_AGENT_ACTION",
          idempotencyKey: `${session.runId}:agentkit:over-limit:${intent.offerId}`,
          actor,
          action: "CREATE_ORDER",
          category: offer.category,
          amount: {
            ...delegation.maxPerOrder,
            atomicAmount: (
              BigInt(delegation.maxPerOrder.atomicAmount) +
              2n * 10n ** BigInt(Math.max(0, delegation.maxPerOrder.decimals - 1))
            ).toString(),
          },
        })
      : await runProgramCommand(intent.programId, "testnet", {
          type: "CREATE_ORDER",
          idempotencyKey: `${session.runId}:agentkit:create:${intent.offerId}`,
          actor,
          orderId: session.orderId,
          buyerId: session.buyerId,
          vendorId: offer.vendorId,
          offerId: offer.id,
          category: offer.category,
          amount: offer.amount,
        });
  return { result, verificationReference, agentAddress: access.agentAddress };
}
