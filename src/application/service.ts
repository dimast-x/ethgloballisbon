import type {
  EventStore,
  PaymentScheduler,
  PublicIdentityResolver,
} from "../protocol/adapters";
import { createEvent, type ProtocolEvent, type RecordedEvent } from "../protocol/events";
import { add, zeroLike } from "../protocol/money";
import {
  validateAgentAuthorization,
  validatePurchase,
} from "../protocol/policy";
import { reduceProtocolEvents, type ProtocolProjection } from "../protocol/reducer";
import type {
  Offer,
  Order,
  PaymentStatus,
  Program,
  Vendor,
} from "../protocol/types";
import type { CommandResult, ProtocolCommand } from "./commands";

type SettlementConfig = {
  payerAccountId: string;
};

type ServiceOptions = {
  eventStore: EventStore;
  paymentScheduler: PaymentScheduler;
  identityResolver?: PublicIdentityResolver;
  settlement: SettlementConfig;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  requireResolvedAgentIdentity?: boolean;
};

export class ProtocolApplicationService {
  private pollIntervalMs: number;
  private pollTimeoutMs: number;

  constructor(private options: ServiceOptions) {
    this.pollIntervalMs = options.pollIntervalMs ?? 2_000;
    this.pollTimeoutMs = options.pollTimeoutMs ?? 45_000;
  }

  async projection(programId: string): Promise<ProtocolProjection> {
    return reduceProtocolEvents(await this.options.eventStore.read(programId));
  }

  async appendInitialEvents(
    events: ProtocolEvent[],
    assumeNewProgram = false,
  ): Promise<ProtocolProjection> {
    const programId = events[0]?.programId ?? "";
    const existingIds = new Set(
      assumeNewProgram
        ? []
        : (await this.options.eventStore.read(programId)).map(
            (event) => event.eventId,
          ),
    );
    const missing = events.filter((event) => !existingIds.has(event.eventId));
    const programCreated = missing.find(
      (event) => event.eventType === "PROGRAM_CREATED",
    );
    if (programCreated) {
      await this.options.eventStore.append(programCreated);
    }
    await Promise.all(
      missing
        .filter((event) => event !== programCreated)
        .map((event) => this.options.eventStore.append(event)),
    );
    return this.waitForEvents(
      programId,
      events.map((event) => event.eventId),
    );
  }

  async execute(programId: string, command: ProtocolCommand): Promise<CommandResult> {
    try {
      const before = await this.projection(programId);
      const existing = before.timeline.filter(
        (event) => event.correlationId === command.idempotencyKey,
      );
      if (existing.length > 0 && commandComplete(before, command)) {
        return confirmedResult(command, programId, before, existing);
      }

      const appended = await this.executeCommand(before, command);
      const last = appended.at(-1);
      const projection = last
        ? await this.waitForEvent(programId, last.eventId)
        : await this.projection(programId);
      return {
        idempotencyKey: command.idempotencyKey,
        status: "CONFIRMED",
        programId,
        orderId: "orderId" in command ? command.orderId : undefined,
        eventIds: appended.map((event) => event.eventId),
        ledgerReference: last?.ledgerReference,
        projection,
      };
    } catch (error) {
      return {
        idempotencyKey: command.idempotencyKey,
        status: "FAILED",
        programId,
        orderId: "orderId" in command ? command.orderId : undefined,
        eventIds: [],
        error: {
          code: errorCode(error),
          message: error instanceof Error ? error.message : "Command failed",
          retryable: isRetryable(error),
        },
      };
    }
  }

  private async executeCommand(
    projection: ProtocolProjection,
    command: ProtocolCommand,
  ): Promise<RecordedEvent[]> {
    const program = requireProgram(projection);
    const base = {
      runId: projection.runId!,
      organizationId: program.organizationId,
      programId: program.id,
      actor: command.actor,
      correlationId: command.idempotencyKey,
    };

    switch (command.type) {
      case "RESOLVE_AGENT_IDENTITY": {
        if (!this.options.identityResolver) {
          throw new CommandError(
            "IDENTITY_RESOLVER_UNAVAILABLE",
            "No public identity resolver is configured.",
          );
        }
        const identity = await this.options.identityResolver.resolve(
          command.identity,
        );
        return [
          await this.appendOnce(
            createEvent({
              ...base,
              eventId: eventId(
                command.idempotencyKey,
                "AGENT_IDENTITY_RESOLVED",
              ),
              eventType: "AGENT_IDENTITY_RESOLVED",
              data: { identity },
            }),
          ),
        ];
      }
      case "GRANT_AGENT_DELEGATION":
        return [
          await this.appendOnce(
            createEvent({
              ...base,
              eventId: eventId(
                command.idempotencyKey,
                "AGENT_DELEGATION_GRANTED",
              ),
              eventType: "AGENT_DELEGATION_GRANTED",
              data: { delegation: command.delegation },
            }),
          ),
        ];
      case "UPFUND_AGENT_DELEGATION": {
        const delegation = projection.agentDelegations[command.agentId];
        if (!delegation) {
          throw new CommandError(
            "AGENT_DELEGATION_NOT_FOUND",
            "The selected agent does not have a delegation in this program.",
          );
        }
        if (!isPositiveProgramMoney(command.amount, program)) {
          throw new CommandError(
            "INVALID_UPFUND_AMOUNT",
            "The agent upfund amount must be positive and use the program asset.",
          );
        }
        return [
          await this.appendOnce(
            createEvent({
              ...base,
              eventId: eventId(
                command.idempotencyKey,
                "AGENT_DELEGATION_UPFUNDED",
              ),
              eventType: "AGENT_DELEGATION_UPFUNDED",
              data: { agentId: command.agentId, amount: command.amount },
            }),
          ),
        ];
      }
      case "RECORD_HUMAN_BACKING":
        return [
          await this.appendOnce(
            createEvent({
              ...base,
              eventId: eventId(
                command.idempotencyKey,
                "AGENT_HUMAN_BACKING_VERIFIED",
              ),
              eventType: "AGENT_HUMAN_BACKING_VERIFIED",
              data: { attestation: command.attestation },
            }),
          ),
        ];
      case "RECORD_AGENTKIT_ACCESS":
        return [
          await this.appendOnce(
            createEvent({
              ...base,
              eventId: eventId(
                command.idempotencyKey,
                "AGENTKIT_ACCESS_VERIFIED",
              ),
              eventType: "AGENTKIT_ACCESS_VERIFIED",
              data: { attestation: command.attestation },
            }),
          ),
        ];
      case "AUTHORIZE_AGENT_ACTION": {
        const decision = agentDecision(
          projection,
          command.actor,
          {
            action: command.action,
            category: command.category,
            amount: command.amount,
          },
          undefined,
          true,
          this.options.requireResolvedAgentIdentity !== false,
        );
        return [
          await this.appendOnce(
            createEvent({
              ...base,
              eventId: eventId(
                command.idempotencyKey,
                "AGENT_AUTHORIZATION_EVALUATED",
              ),
              eventType: "AGENT_AUTHORIZATION_EVALUATED",
              data: {
                decision,
                category: command.category,
                requestedAmount: command.amount,
              },
            }),
          ),
        ];
      }
      case "UPFUND_PROGRAM":
        validateProgramUpfund(program, command.amount);
        return [
          await this.appendOnce(
            createEvent({
              ...base,
              eventId: eventId(command.idempotencyKey, "PROGRAM_UPFUNDED"),
              eventType: "PROGRAM_UPFUNDED",
              data: {
                amount: command.amount,
                depositTransactionId: command.depositTransactionId,
              },
            }),
          ),
        ];
      case "ALLOCATE_BUYER":
        validateNewBuyerAllocation(projection, program, command.allocation);
        return [
          await this.appendOnce(
            createEvent({
              ...base,
              eventId: eventId(command.idempotencyKey, "BUYER_ALLOCATED"),
              eventType: "BUYER_ALLOCATED",
              data: { allocation: command.allocation },
            }),
          ),
        ];
      case "UPFUND_BUYER_ALLOCATION":
        validateBuyerUpfund(
          projection,
          program,
          command.buyerId,
          command.amount,
        );
        return [
          await this.appendOnce(
            createEvent({
              ...base,
              eventId: eventId(
                command.idempotencyKey,
                "BUYER_ALLOCATION_UPFUNDED",
              ),
              eventType: "BUYER_ALLOCATION_UPFUNDED",
              data: { buyerId: command.buyerId, amount: command.amount },
            }),
          ),
        ];
      case "APPROVE_VENDOR":
        return [
          await this.appendOnce(
            createEvent({
              ...base,
              eventId: eventId(command.idempotencyKey, "VENDOR_APPROVED"),
              eventType: "VENDOR_APPROVED",
              data: { vendor: command.vendor },
            }),
          ),
        ];
      case "REGISTER_OFFER":
        return [
          await this.appendOnce(
            createEvent({
              ...base,
              eventId: eventId(command.idempotencyKey, "OFFER_REGISTERED"),
              eventType: "OFFER_REGISTERED",
              data: { offer: command.offer },
            }),
          ),
        ];
      case "UPSERT_SUPPLIER": {
        validateSupplierUpdate(projection, program, command.vendor, command.offer);
        return [
          await this.appendOnce(
            createEvent({
              ...base,
              eventId: eventId(command.idempotencyKey, "SUPPLIER_UPDATED"),
              eventType: "SUPPLIER_UPDATED",
              data: { vendor: command.vendor, offer: command.offer },
            }),
          ),
        ];
      }
      case "REMOVE_SUPPLIER": {
        const vendor = projection.vendors[command.vendorId];
        if (!vendor) {
          throw new CommandError("SUPPLIER_NOT_FOUND", "Supplier was not found.");
        }
        if (vendor.status === "SUSPENDED") return [];
        return [
          await this.appendOnce(
            createEvent({
              ...base,
              eventId: eventId(command.idempotencyKey, "SUPPLIER_REMOVED"),
              eventType: "SUPPLIER_REMOVED",
              data: {
                vendorId: command.vendorId,
                continuingOrderIds: Object.values(projection.orders)
                  .filter(
                    (order) =>
                      order.vendorId === command.vendorId &&
                      order.status !== "PAYMENT_EXECUTED" &&
                      order.status !== "CANCELLED",
                  )
                  .map((order) => order.id),
                effect:
                  "Future purchases are blocked. Existing orders continue with their locked supplier, amount, and settlement destination.",
              },
            }),
          ),
        ];
      }
      case "TEST_PURCHASE_POLICY": {
        const decision = validatePurchase({
          program,
          allocation: projection.allocations[command.buyerId],
          vendor: projection.vendors[command.vendorId],
          category: command.category,
          amount: command.amount,
        });
        if (decision.allowed) {
          throw new CommandError(
            "POLICY_ALLOWED",
            "The test purchase is allowed; no rejection event was created.",
          );
        }
        return [
          await this.appendOnce(
            createEvent({
              ...base,
              eventId: eventId(
                command.idempotencyKey,
                "ORDER_REJECTED_BY_POLICY",
              ),
              eventType: "ORDER_REJECTED_BY_POLICY",
              data: { decision, requestedAmount: command.amount },
            }),
          ),
        ];
      }
      case "CREATE_ORDER": {
        if (projection.orders[command.orderId]) return [];
        const appended: RecordedEvent[] = [];
        const allocation = projection.allocations[command.buyerId];
        if (
          command.actor.actorType === "HUMAN" &&
          command.actor.actorId !== command.buyerId
        ) {
          throw new CommandError(
            "BUYER_ACTOR_MISMATCH",
            "A member can only purchase against their own allocation.",
          );
        }
        if (command.actor.actorType === "HUMAN" && allocation?.humanVerificationRequired) {
          const attestation = projection.humanBacking[command.buyerId];
          if (!attestation) {
            throw new CommandError(
              "HUMAN_BACKING_REQUIRED",
              "This member must complete World human verification before purchasing.",
            );
          }
          if (
            attestation.expiresAt &&
            new Date(attestation.expiresAt).getTime() <= Date.now()
          ) {
            throw new CommandError(
              "HUMAN_BACKING_EXPIRED",
              "This member's World human verification has expired.",
            );
          }
        }
        if (command.actor.actorType === "AGENT") {
          const storedIdentity =
            projection.agentIdentities[command.actor.actorId];
          const currentIdentity =
            storedIdentity && this.options.identityResolver
              ? await this.options.identityResolver.resolve(
                  storedIdentity.publicIdentity,
                )
              : storedIdentity;
          const authorization = agentDecision(
            projection,
            command.actor,
            {
              action: "CREATE_ORDER",
              category: command.category,
              amount: command.amount,
            },
            currentIdentity,
            !storedIdentity ||
              !currentIdentity ||
              storedIdentity.resolutionHash === currentIdentity.resolutionHash,
            this.options.requireResolvedAgentIdentity !== false,
          );
          appended.push(
            await this.appendOnce(
              createEvent({
                ...base,
                orderId: command.orderId,
                eventId: eventId(
                  command.idempotencyKey,
                  "AGENT_AUTHORIZATION_EVALUATED",
                ),
                eventType: "AGENT_AUTHORIZATION_EVALUATED",
                data: {
                  decision: authorization,
                  category: command.category,
                  requestedAmount: command.amount,
                  currentResolutionHash: currentIdentity?.resolutionHash,
                },
              }),
            ),
          );
          if (!authorization.allowed) return appended;
        }
        const decision = validatePurchase({
          program,
          allocation: projection.allocations[command.buyerId],
          vendor: projection.vendors[command.vendorId],
          category: command.category,
          amount: command.amount,
        });
        if (!decision.allowed) {
          throw new CommandError("POLICY_REJECTED", decision.reasons.join(" "));
        }
        const order: Order = {
          id: command.orderId,
          programId: program.id,
          buyerId: command.buyerId,
          vendorId: command.vendorId,
          supplierName: projection.vendors[command.vendorId].name,
          supplierSettlementAccountId:
            projection.vendors[command.vendorId].settlementAccountId,
          offerId: command.offerId,
          category: command.category,
          amount: command.amount,
          status: "CREATED",
          approvals: [],
        };
        appended.push(
          await this.appendOnce(
            createEvent({
              ...base,
              orderId: order.id,
              eventId: eventId(command.idempotencyKey, "ORDER_CREATED"),
              eventType: "ORDER_CREATED",
              data: { order, decision },
            }),
          ),
        );
        if (
          !program.policy.requireDeliveryEvidence &&
          program.policy.approvalRequirements.length === 0
        ) {
          const payment = await this.options.paymentScheduler.create({
            programId: program.id,
            orderId: order.id,
            payerAccountId: this.options.settlement.payerAccountId,
            payeeAccountId: order.supplierSettlementAccountId!,
            amount: order.amount,
            memo: `yareon:${program.id}:${order.id}`,
            executeImmediately: true,
          });
          appended.push(
            await this.appendOnce(
              createEvent({
                ...base,
                orderId: order.id,
                actor: systemActor,
                eventId: eventId(
                  command.idempotencyKey,
                  "PAYMENT_SCHEDULE_CREATED",
                ),
                eventType: "PAYMENT_SCHEDULE_CREATED",
                data: {
                  scheduleId: payment.scheduleId,
                  scheduledTransactionId: payment.scheduledTransactionId,
                },
              }),
            ),
          );
          const status = await this.waitForPayment(payment.scheduleId);
          if (status.state !== "EXECUTED" || !status.paymentTransactionId) {
            throw new CommandError(
              "PAYMENT_NOT_EXECUTED",
              `Policy-authorized payment is ${status.state.toLowerCase()}.`,
              status.state === "PENDING",
            );
          }
          appended.push(
            await this.appendOnce(
              createEvent({
                ...base,
                orderId: order.id,
                actor: systemActor,
                eventId: eventId(command.idempotencyKey, "PAYMENT_EXECUTED"),
                eventType: "PAYMENT_EXECUTED",
                data: {
                  paymentTransactionId: status.paymentTransactionId,
                  scheduledTransactionId: status.scheduledTransactionId,
                },
              }),
            ),
          );
        }
        return appended;
      }
      case "ACCEPT_ORDER": {
        const order = requireOrder(projection, command.orderId);
        const appended: RecordedEvent[] = [];
        if (order.status === "CREATED") {
          appended.push(
            await this.appendOnce(
              createEvent({
                ...base,
                orderId: order.id,
                eventId: eventId(
                  command.idempotencyKey,
                  "ORDER_ACCEPTED_BY_VENDOR",
                ),
                eventType: "ORDER_ACCEPTED_BY_VENDOR",
                data: {},
              }),
            ),
          );
        } else if (order.status !== "VENDOR_ACCEPTED") {
          if (order.scheduleId) return appended;
          throw invalidState(order, "CREATED");
        }

        const current = await this.projection(program.id);
        const acceptedOrder = requireOrder(current, command.orderId);
        if (!acceptedOrder.scheduleId) {
          const vendor = current.vendors[acceptedOrder.vendorId];
          const settlementAccountId =
            acceptedOrder.supplierSettlementAccountId ??
            vendor?.settlementAccountId;
          if (!settlementAccountId) {
            throw new CommandError("VENDOR_NOT_FOUND", "Vendor not found");
          }
          const payment = await this.options.paymentScheduler.create({
            programId: program.id,
            orderId: acceptedOrder.id,
            payerAccountId: this.options.settlement.payerAccountId,
            payeeAccountId: settlementAccountId,
            amount: acceptedOrder.amount,
            memo: `yareon:${program.id}:${acceptedOrder.id}`,
          });
          appended.push(
            await this.appendOnce(
              createEvent({
                ...base,
                orderId: acceptedOrder.id,
                eventId: eventId(
                  command.idempotencyKey,
                  "PAYMENT_SCHEDULE_CREATED",
                ),
                eventType: "PAYMENT_SCHEDULE_CREATED",
                actor: systemActor,
                data: {
                  scheduleId: payment.scheduleId,
                  scheduledTransactionId: payment.scheduledTransactionId,
                },
              }),
            ),
          );
        }
        return appended;
      }
      case "SUBMIT_DELIVERY": {
        const order = requireOrder(projection, command.orderId);
        if (order.evidence) return [];
        if (order.status !== "PAYMENT_SCHEDULED") {
          throw invalidState(order, "PAYMENT_SCHEDULED");
        }
        validateEvidence(program, command.evidence);
        return [
          await this.appendOnce(
            createEvent({
              ...base,
              orderId: order.id,
              eventId: eventId(command.idempotencyKey, "DELIVERY_SUBMITTED"),
              eventType: "DELIVERY_SUBMITTED",
              data: { evidence: command.evidence },
            }),
          ),
        ];
      }
      case "APPROVE_DELIVERY":
        return this.approveDelivery(program, projection, command);
      case "APPROVE_FINANCE":
        return this.approveFinance(program, projection, command);
    }
  }

  private async approveDelivery(
    program: Program,
    projection: ProtocolProjection,
    command: Extract<ProtocolCommand, { type: "APPROVE_DELIVERY" }>,
  ): Promise<RecordedEvent[]> {
    const order = requireOrder(projection, command.orderId);
    if (order.approvals.some((approval) => approval.role === command.actor.role)) {
      return [];
    }
    if (order.status !== "DELIVERY_SUBMITTED" || !order.scheduleId) {
      throw invalidState(order, "DELIVERY_SUBMITTED");
    }
    requireApprovalRole(program, command.actor.role);
    await this.options.paymentScheduler.confirmApproval(order.scheduleId, {
      actorId: command.actor.actorId,
      role: command.actor.role,
      reference: command.approvalReference,
      hederaAccountId: command.actor.hederaAccountId,
      transactionId: command.approvalTransactionId,
    });
    const base = {
      runId: projection.runId!,
      organizationId: program.organizationId,
      programId: program.id,
      orderId: order.id,
      actor: command.actor,
      correlationId: command.idempotencyKey,
    };
    const approved = await this.appendOnce(
      createEvent({
        ...base,
        eventId: eventId(command.idempotencyKey, "DELIVERY_APPROVED"),
        eventType: "DELIVERY_APPROVED",
        data: {},
      }),
    );
    const signature = await this.appendOnce(
      createEvent({
        ...base,
        eventId: eventId(command.idempotencyKey, "PAYMENT_SIGNATURE_ADDED"),
        eventType: "PAYMENT_SIGNATURE_ADDED",
        data: {
          role: command.actor.role,
          actorId: command.actor.actorId,
          reference: command.approvalReference,
          hederaAccountId: command.actor.hederaAccountId,
          transactionId: command.approvalTransactionId,
        },
      }),
    );
    const appended = [approved, signature];
    const financeRequired = program.policy.approvalRequirements.some(
      (requirement) => requirement.role === "FINANCE",
    );
    if (!financeRequired) {
      const status = await this.waitForPayment(order.scheduleId);
      if (status.state !== "EXECUTED" || !status.paymentTransactionId) {
        throw new CommandError(
          "PAYMENT_NOT_EXECUTED",
          `Scheduled payment is ${status.state.toLowerCase()}.`,
          status.state === "PENDING",
        );
      }
      appended.push(
        await this.appendOnce(
          createEvent({
            ...base,
            actor: systemActor,
            eventId: eventId(command.idempotencyKey, "PAYMENT_EXECUTED"),
            eventType: "PAYMENT_EXECUTED",
            data: {
              paymentTransactionId: status.paymentTransactionId,
              scheduledTransactionId: status.scheduledTransactionId,
            },
          }),
        ),
      );
    }
    return appended;
  }

  private async approveFinance(
    program: Program,
    projection: ProtocolProjection,
    command: Extract<ProtocolCommand, { type: "APPROVE_FINANCE" }>,
  ): Promise<RecordedEvent[]> {
    const order = requireOrder(projection, command.orderId);
    if (order.status === "PAYMENT_EXECUTED") return [];
    if (
      order.status !== "DELIVERY_APPROVED" ||
      !order.scheduleId ||
      !order.approvals.length
    ) {
      throw invalidState(order, "DELIVERY_APPROVED");
    }
    requireApprovalRole(program, command.actor.role);
    await this.options.paymentScheduler.confirmApproval(order.scheduleId, {
      actorId: command.actor.actorId,
      role: command.actor.role,
      reference: command.approvalReference,
      hederaAccountId: command.actor.hederaAccountId,
      transactionId: command.approvalTransactionId,
    });
    const status = await this.waitForPayment(order.scheduleId);
    const base = {
      runId: projection.runId!,
      organizationId: program.organizationId,
      programId: program.id,
      orderId: order.id,
      actor: command.actor,
      correlationId: command.idempotencyKey,
    };
    const signature = await this.appendOnce(
      createEvent({
        ...base,
        eventId: eventId(command.idempotencyKey, "PAYMENT_SIGNATURE_ADDED"),
        eventType: "PAYMENT_SIGNATURE_ADDED",
        data: {
          role: command.actor.role,
          actorId: command.actor.actorId,
          reference: command.approvalReference,
          hederaAccountId: command.actor.hederaAccountId,
          transactionId: command.approvalTransactionId,
        },
      }),
    );
    if (status.state !== "EXECUTED" || !status.paymentTransactionId) {
      throw new CommandError(
        "PAYMENT_NOT_EXECUTED",
        `Scheduled payment is ${status.state.toLowerCase()}.`,
        status.state === "PENDING",
      );
    }
    const executed = await this.appendOnce(
      createEvent({
        ...base,
        actor: systemActor,
        eventId: eventId(command.idempotencyKey, "PAYMENT_EXECUTED"),
        eventType: "PAYMENT_EXECUTED",
        data: {
          paymentTransactionId: status.paymentTransactionId,
          scheduledTransactionId: status.scheduledTransactionId,
        },
      }),
    );
    return [signature, executed];
  }

  private async appendOnce(event: ProtocolEvent): Promise<RecordedEvent> {
    const existing = (await this.options.eventStore.read(event.programId)).find(
      (candidate) => candidate.eventId === event.eventId,
    );
    if (existing) return existing;
    const ledgerReference = await this.options.eventStore.append(event);
    return { ...event, ledgerReference };
  }

  private async waitForEvent(
    programId: string,
    eventId: string,
  ): Promise<ProtocolProjection> {
    return this.waitForEvents(programId, eventId ? [eventId] : []);
  }

  private async waitForEvents(
    programId: string,
    eventIds: string[],
  ): Promise<ProtocolProjection> {
    const started = Date.now();
    while (Date.now() - started <= this.pollTimeoutMs) {
      const projection = await this.projection(programId);
      if (
        eventIds.every((eventId) =>
          projection.processedEventIds.includes(eventId),
        )
      ) {
        return projection;
      }
      await wait(this.pollIntervalMs);
    }
    throw new CommandError(
      "MIRROR_TIMEOUT",
      "The event was submitted but Mirror Node has not confirmed it yet.",
      true,
    );
  }

  private async waitForPayment(scheduleId: string): Promise<PaymentStatus> {
    const started = Date.now();
    let status = await this.options.paymentScheduler.getStatus(scheduleId);
    while (
      status.state === "PENDING" &&
      Date.now() - started <= this.pollTimeoutMs
    ) {
      await wait(this.pollIntervalMs);
      status = await this.options.paymentScheduler.getStatus(scheduleId);
    }
    return status;
  }
}

const systemActor = {
  actorId: "yareon",
  role: "SYSTEM",
  actorType: "SYSTEM" as const,
};

class CommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

function eventId(idempotencyKey: string, eventType: string): string {
  return `${idempotencyKey}:${eventType}`;
}

function requireProgram(projection: ProtocolProjection): Program {
  if (!projection.program) {
    throw new CommandError("PROGRAM_NOT_FOUND", "Program was not found");
  }
  return projection.program;
}

function requireOrder(projection: ProtocolProjection, orderId: string): Order {
  const order = projection.orders[orderId];
  if (!order) throw new CommandError("ORDER_NOT_FOUND", `Order ${orderId} was not found`);
  return order;
}

function invalidState(order: Order, expected: Order["status"]): CommandError {
  return new CommandError(
    "INVALID_STATE",
    `Order must be ${expected}; current state is ${order.status}.`,
  );
}

function requireApprovalRole(program: Program, role: string): void {
  if (!program.policy.approvalRequirements.some((item) => item.role === role)) {
    throw new CommandError(
      "ROLE_NOT_REQUIRED",
      `${role} is not an approval role for this program.`,
    );
  }
}

function validateEvidence(
  program: Program,
  evidence: import("../protocol/types").EvidenceReference,
): void {
  if (!program.policy.requireDeliveryEvidence) return;
  if (
    !/^sha256:[a-f0-9]{64}$/i.test(evidence.hash) ||
    !evidence.mimeType ||
    evidence.size < 1 ||
    !evidence.submittedBy
  ) {
    throw new CommandError(
      "INVALID_EVIDENCE",
      "Evidence requires a SHA-256 digest, MIME type, positive size, and submitter.",
    );
  }
}

function validateSupplierUpdate(
  projection: ProtocolProjection,
  program: Program,
  vendor: Vendor,
  offer: Offer,
): void {
  if (
    !vendor.id ||
    !vendor.name.trim() ||
    !vendor.settlementAccountId ||
    vendor.status !== "APPROVED"
  ) {
    throw new CommandError(
      "INVALID_SUPPLIER",
      "An active supplier requires an ID, name, and settlement account.",
    );
  }
  if (
    !offer.id ||
    offer.programId !== program.id ||
    offer.vendorId !== vendor.id ||
    !offer.title?.trim() ||
    !/^-?\d+$/.test(offer.amount.atomicAmount) ||
    BigInt(offer.amount.atomicAmount) <= 0n ||
    offer.amount.asset !== program.budget.asset ||
    offer.amount.decimals !== program.budget.decimals
  ) {
    throw new CommandError(
      "INVALID_SUPPLIER_OFFER",
      "The supplier offer must belong to this program and include a title and positive amount in the program asset.",
    );
  }
  if (
    !program.policy.allowedCategories.includes(offer.category) ||
    !vendor.approvedCategories.includes(offer.category)
  ) {
    throw new CommandError(
      "SUPPLIER_CATEGORY_NOT_ALLOWED",
      "The supplier must be approved for an allowed program category.",
    );
  }
  const existingOffer = projection.offers[offer.id];
  if (existingOffer && existingOffer.vendorId !== vendor.id) {
    throw new CommandError(
      "OFFER_SUPPLIER_MISMATCH",
      "An existing offer cannot be moved to another supplier.",
    );
  }
}

function validateNewBuyerAllocation(
  projection: ProtocolProjection,
  program: Program,
  allocation: import("../protocol/types").BuyerAllocation,
): void {
  if (projection.allocations[allocation.buyerId]) {
    throw new CommandError(
      "BUYER_ALREADY_ALLOCATED",
      "This buyer already has an allocation. Upfund the existing allocation instead.",
    );
  }
  if (
    !allocation.id ||
    !allocation.buyerId.trim() ||
    allocation.programId !== program.id ||
    !isPositiveProgramMoney(allocation.totalLimit, program)
  ) {
    throw new CommandError(
      "INVALID_BUYER_ALLOCATION",
      "A new buyer allocation requires a buyer, this program, and a positive amount in the program asset.",
    );
  }
  assertAllocationBudget(projection, program, allocation.totalLimit);
}

function validateProgramUpfund(
  program: Program,
  amount: import("../protocol/types").Money,
): void {
  if (!isPositiveProgramMoney(amount, program)) {
    throw new CommandError(
      "INVALID_PROGRAM_UPFUND_AMOUNT",
      "The program upfund amount must be positive and use the program asset.",
    );
  }
}

function validateBuyerUpfund(
  projection: ProtocolProjection,
  program: Program,
  buyerId: string,
  amount: import("../protocol/types").Money,
): void {
  if (!projection.allocations[buyerId]) {
    throw new CommandError(
      "BUYER_ALLOCATION_NOT_FOUND",
      "The selected buyer does not have an allocation in this program.",
    );
  }
  if (!isPositiveProgramMoney(amount, program)) {
    throw new CommandError(
      "INVALID_UPFUND_AMOUNT",
      "The upfund amount must be positive and use the program asset.",
    );
  }
  assertAllocationBudget(projection, program, amount);
}

function isPositiveProgramMoney(
  amount: import("../protocol/types").Money,
  program: Program,
): boolean {
  return (
    /^-?\d+$/.test(amount.atomicAmount) &&
    BigInt(amount.atomicAmount) > 0n &&
    amount.asset === program.budget.asset &&
    amount.decimals === program.budget.decimals
  );
}

function assertAllocationBudget(
  projection: ProtocolProjection,
  program: Program,
  increase: import("../protocol/types").Money,
): void {
  const allocated = Object.values(projection.allocations).reduce(
    (total, allocation) => total + BigInt(allocation.totalLimit.atomicAmount),
    0n,
  );
  if (allocated + BigInt(increase.atomicAmount) > BigInt(program.budget.atomicAmount)) {
    throw new CommandError(
      "PROGRAM_BUDGET_EXCEEDED",
      "Buyer allocations cannot exceed the program budget.",
    );
  }
}

function commandComplete(
  projection: ProtocolProjection,
  command: ProtocolCommand,
): boolean {
  switch (command.type) {
    case "RESOLVE_AGENT_IDENTITY":
      return Object.values(projection.agentIdentities).some(
        (identity) =>
          identity.publicIdentity.scheme === command.identity.scheme &&
          identity.publicIdentity.name === command.identity.name,
      );
    case "GRANT_AGENT_DELEGATION":
      return Boolean(
        projection.agentDelegations[command.delegation.agentId],
      );
    case "UPFUND_AGENT_DELEGATION":
      return projection.timeline.some(
        (event) =>
          event.correlationId === command.idempotencyKey &&
          event.eventType === "AGENT_DELEGATION_UPFUNDED",
      );
    case "RECORD_HUMAN_BACKING":
    case "RECORD_AGENTKIT_ACCESS":
      return projection.timeline.some(
        (event) =>
          event.correlationId === command.idempotencyKey &&
          (event.eventType === "AGENT_HUMAN_BACKING_VERIFIED" ||
            event.eventType === "AGENTKIT_ACCESS_VERIFIED"),
      );
    case "AUTHORIZE_AGENT_ACTION":
      return projection.timeline.some(
        (event) =>
          event.correlationId === command.idempotencyKey &&
          event.eventType === "AGENT_AUTHORIZATION_EVALUATED",
      );
  }
  if (!("orderId" in command)) return true;
  const order = projection.orders[command.orderId];
  if (!order && command.type === "CREATE_ORDER") {
    const authorization = projection.timeline.find(
      (event) =>
        event.correlationId === command.idempotencyKey &&
        event.eventType === "AGENT_AUTHORIZATION_EVALUATED",
    );
    return (
      authorization !== undefined &&
      (
        authorization.data as {
          decision?: { allowed?: boolean };
        }
      ).decision?.allowed === false
    );
  }
  if (!order) return false;
  switch (command.type) {
    case "CREATE_ORDER":
      return Boolean(order);
    case "ACCEPT_ORDER":
      return Boolean(order.scheduleId);
    case "SUBMIT_DELIVERY":
      return Boolean(order.evidence);
    case "APPROVE_DELIVERY":
      return order.approvals.some((approval) => approval.role === command.actor.role);
    case "APPROVE_FINANCE":
      return order.status === "PAYMENT_EXECUTED";
    default:
      return true;
  }
}

function agentDecision(
  projection: ProtocolProjection,
  actor: ProtocolCommand["actor"],
  request: { action: string; category: string; amount: import("../protocol/types").Money },
  identityOverride?: import("../protocol/types").ResolvedAgentIdentity,
  identityCurrent = true,
  requireResolvedIdentity = true,
) {
  const program = requireProgram(projection);
  const identity =
    identityOverride ?? projection.agentIdentities[actor.actorId];
  const delegation = projection.agentDelegations[actor.actorId];
  const attestation = projection.humanBacking[actor.actorId];
  const delegatedSpend = projection.timeline
    .filter(
      (event) =>
        event.eventType === "ORDER_CREATED" &&
        event.actor.actorType === "AGENT" &&
        event.actor.actorId === actor.actorId,
    )
    .reduce((total, event) => {
      const order = (event.data as { order: Order }).order;
      return add(total, order.amount);
    }, zeroLike(request.amount));
  return validateAgentAuthorization({
    agentId: actor.actorId,
    action: request.action,
    program,
    identity,
    requireResolvedIdentity,
    identityCurrent,
    attestation,
    requireHumanBacking: delegation?.humanVerificationRequired !== false,
    delegation,
    executionAccountId: actor.hederaAccountId,
    category: request.category,
    amount: request.amount,
    delegatedSpend,
  });
}

function confirmedResult(
  command: ProtocolCommand,
  programId: string,
  projection: ProtocolProjection,
  events: RecordedEvent[],
): CommandResult {
  return {
    idempotencyKey: command.idempotencyKey,
    status: "CONFIRMED",
    programId,
    orderId: "orderId" in command ? command.orderId : undefined,
    eventIds: events.map((event) => event.eventId),
    ledgerReference: events.at(-1)?.ledgerReference,
    projection,
  };
}

function errorCode(error: unknown): string {
  return error instanceof CommandError ? error.code : "COMMAND_FAILED";
}

function isRetryable(error: unknown): boolean {
  if (error instanceof CommandError) return error.retryable;
  const message = error instanceof Error ? error.message : "";
  return /timeout|network|mirror|busy|unavailable/i.test(message);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
