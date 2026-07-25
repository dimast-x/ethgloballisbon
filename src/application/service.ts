import type { EventStore, PaymentScheduler } from "../protocol/adapters";
import { createEvent, type ProtocolEvent, type RecordedEvent } from "../protocol/events";
import { validatePurchase } from "../protocol/policy";
import { reduceProtocolEvents, type ProtocolProjection } from "../protocol/reducer";
import type {
  Order,
  PaymentStatus,
  Program,
} from "../protocol/types";
import type { CommandResult, ProtocolCommand } from "./commands";

type SettlementConfig = {
  payerAccountId: string;
};

type ServiceOptions = {
  eventStore: EventStore;
  paymentScheduler: PaymentScheduler;
  settlement: SettlementConfig;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
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

  async appendInitialEvents(events: ProtocolEvent[]): Promise<ProtocolProjection> {
    for (const event of events) {
      await this.appendOnce(event);
    }
    await this.waitForEvent(
      events[0]?.programId ?? "",
      events.at(-1)?.eventId ?? "",
    );
    return this.projection(events[0]?.programId ?? "");
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
      case "ALLOCATE_BUYER":
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
          offerId: command.offerId,
          category: command.category,
          amount: command.amount,
          status: "CREATED",
          approvals: [],
        };
        return [
          await this.appendOnce(
            createEvent({
              ...base,
              orderId: order.id,
              eventId: eventId(command.idempotencyKey, "ORDER_CREATED"),
              eventType: "ORDER_CREATED",
              data: { order, decision },
            }),
          ),
        ];
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
          if (!vendor) throw new CommandError("VENDOR_NOT_FOUND", "Vendor not found");
          const payment = await this.options.paymentScheduler.create({
            programId: program.id,
            orderId: acceptedOrder.id,
            payerAccountId: this.options.settlement.payerAccountId,
            payeeAccountId: vendor.settlementAccountId,
            amount: acceptedOrder.amount,
            memo: `openprocure:${program.id}:${acceptedOrder.id}`,
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
    await this.options.paymentScheduler.approve(order.scheduleId, {
      actorId: command.actor.actorId,
      role: command.actor.role,
      reference: command.approvalReference,
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
        },
      }),
    );
    return [approved, signature];
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
    await this.options.paymentScheduler.approve(order.scheduleId, {
      actorId: command.actor.actorId,
      role: command.actor.role,
      reference: command.approvalReference,
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
    const started = Date.now();
    while (Date.now() - started <= this.pollTimeoutMs) {
      const projection = await this.projection(programId);
      if (!eventId || projection.processedEventIds.includes(eventId)) {
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
  actorId: "openprocure",
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

function commandComplete(
  projection: ProtocolProjection,
  command: ProtocolCommand,
): boolean {
  if (!("orderId" in command)) return true;
  const order = projection.orders[command.orderId];
  if (!order) return false;
  switch (command.type) {
    case "CREATE_ORDER":
      return true;
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
