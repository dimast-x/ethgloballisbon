import {
  AccountBalanceQuery,
  AccountId,
  AccountInfoQuery,
  KeyList,
  PrivateKey,
  TopicInfoQuery,
} from "@hashgraph/sdk";
import {
  createHederaClient,
  HederaEventStore,
  HederaPaymentScheduler,
  hederaConfigFromEnv,
} from "../adapters/hedera";
import type { EventStore, PaymentScheduler } from "../protocol/adapters";
import { createEvent, type ProtocolEvent, type RecordedEvent } from "../protocol/events";
import type { ProtocolProjection } from "../protocol/reducer";
import type {
  Approval,
  LedgerReference,
  PaymentStatus,
  Program,
  ScheduledPayment,
  ScheduledPaymentRequest,
} from "../protocol/types";
import { universityGpuFixture, type DemoFixture } from "../demo/fixtures";
import type {
  CommandResult,
  ExecutionMode,
  ProtocolCommand,
} from "./commands";
import { ProtocolApplicationService } from "./service";

const runtimeKey = "__openProcureRuntimeV2";

type RunMetadata = {
  mode: ExecutionMode;
  runId: string;
  programId: string;
  buyerId: string;
  selectedOfferId: string;
  orderId: string;
};

export type ProgramSession = RunMetadata & {
  projection: ProtocolProjection;
};

type Runtime = {
  memoryEvents: InMemoryEventStore;
  memoryPayments: InMemoryPaymentScheduler;
  runs: Map<string, RunMetadata>;
  inFlight: Map<string, Promise<CommandResult>>;
  testnetService?: ProtocolApplicationService;
};

function runtime(): Runtime {
  const root = globalThis as typeof globalThis & {
    [runtimeKey]?: Runtime;
  };
  root[runtimeKey] ??= {
    memoryEvents: new InMemoryEventStore(),
    memoryPayments: new InMemoryPaymentScheduler(),
    runs: new Map(),
    inFlight: new Map(),
  };
  return root[runtimeKey];
}

export async function createUniversityRun(
  mode: ExecutionMode = "simulation",
): Promise<ProgramSession> {
  if (mode === "testnet") {
    const readiness = await getTestnetReadiness(true);
    if (!readiness.ready) {
      throw new Error(
        `Testnet is not ready: ${readiness.issues.join(" ")}`,
      );
    }
  }

  const runId = `run_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const fixture = materializeFixture(universityGpuFixture, runId, mode);
  const service = serviceFor(mode);
  const events = initialEvents(fixture, runId);
  const projection = await service.appendInitialEvents(events);
  const selectedOfferId = fixture.selectedOfferId;
  const metadata: RunMetadata = {
    mode,
    runId,
    programId: fixture.program.id,
    buyerId: fixture.buyerId,
    selectedOfferId,
    orderId: `order_${runId.slice(-12)}`,
  };
  runtime().runs.set(fixture.program.id, metadata);
  return { ...metadata, projection };
}

export async function createProgram(
  program: Program,
  mode: ExecutionMode = "simulation",
): Promise<ProgramSession> {
  const runId = `run_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const event = createEvent({
    eventId: `${runId}:PROGRAM_CREATED`,
    eventType: "PROGRAM_CREATED",
    runId,
    organizationId: program.organizationId,
    programId: program.id,
    actor: { actorId: "api_client", role: "ADMIN", actorType: "HUMAN" },
    correlationId: `${runId}:program`,
    data: { program },
  });
  const projection = await serviceFor(mode).appendInitialEvents([event]);
  const metadata: RunMetadata = {
    mode,
    runId,
    programId: program.id,
    buyerId: "",
    selectedOfferId: "",
    orderId: "",
  };
  runtime().runs.set(program.id, metadata);
  return { ...metadata, projection };
}

export async function getProgramSession(
  programId: string,
  mode: ExecutionMode = "simulation",
): Promise<ProgramSession | undefined> {
  const projection = await serviceFor(mode).projection(programId);
  if (!projection.program) return undefined;
  const metadata = runtime().runs.get(programId) ?? {
    mode,
    runId: projection.runId ?? "",
    programId,
    buyerId: Object.keys(projection.allocations)[0] ?? "",
    selectedOfferId: Object.keys(projection.offers)[0] ?? "",
    orderId: Object.keys(projection.orders)[0] ?? "",
  };
  return { ...metadata, mode, projection };
}

export async function runProgramCommand(
  programId: string,
  mode: ExecutionMode,
  command: ProtocolCommand,
): Promise<CommandResult> {
  const key = `${mode}:${programId}:${command.idempotencyKey}`;
  const current = runtime().inFlight.get(key);
  if (current) return current;
  const pending = serviceFor(mode)
    .execute(programId, command)
    .finally(() => runtime().inFlight.delete(key));
  runtime().inFlight.set(key, pending);
  return pending;
}

export async function findOrder(
  programId: string,
  orderId: string,
  mode: ExecutionMode,
) {
  const projection = await serviceFor(mode).projection(programId);
  return projection.orders[orderId];
}

export type TestnetReadiness = {
  ready: boolean;
  network: "testnet";
  issues: string[];
  publicConfig: {
    topicId?: string;
    treasuryAccountId?: string;
    vendorAccountId?: string;
    verifierWalletAccountId?: string;
    financeWalletAccountId?: string;
    mirrorNodeUrl: string;
    walletConnectProjectIdConfigured: boolean;
  };
};

export async function getTestnetReadiness(
  probeNetwork = false,
): Promise<TestnetReadiness> {
  const issues: string[] = [];
  const required = [
    "HEDERA_OPERATOR_ID",
    "HEDERA_OPERATOR_KEY",
    "HEDERA_TOPIC_ID",
    "HEDERA_TREASURY_ACCOUNT_ID",
    "HEDERA_VENDOR_ACCOUNT_ID",
    "HEDERA_VERIFIER_RELAY_KEY",
    "HEDERA_FINANCE_RELAY_KEY",
    "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
    "NEXT_PUBLIC_VERIFIER_WALLET_ACCOUNT_ID",
    "NEXT_PUBLIC_FINANCE_WALLET_ACCOUNT_ID",
  ] as const;
  for (const name of required) {
    if (!process.env[name]) issues.push(`Missing ${name}.`);
  }
  if (
    process.env.HEDERA_NETWORK &&
    process.env.HEDERA_NETWORK !== "testnet"
  ) {
    issues.push("Iteration two supports HEDERA_NETWORK=testnet only.");
  }
  if (
    process.env.NEXT_PUBLIC_VERIFIER_WALLET_ACCOUNT_ID &&
    process.env.NEXT_PUBLIC_VERIFIER_WALLET_ACCOUNT_ID ===
      process.env.NEXT_PUBLIC_FINANCE_WALLET_ACCOUNT_ID
  ) {
    issues.push("Verifier and finance wallet accounts must be different.");
  }

  validateAccount("HEDERA_OPERATOR_ID", issues);
  validateAccount("HEDERA_TOPIC_ID", issues);
  validateAccount("HEDERA_TREASURY_ACCOUNT_ID", issues);
  validateAccount("HEDERA_VENDOR_ACCOUNT_ID", issues);
  validateAccount("NEXT_PUBLIC_VERIFIER_WALLET_ACCOUNT_ID", issues);
  validateAccount("NEXT_PUBLIC_FINANCE_WALLET_ACCOUNT_ID", issues);
  validatePrivateKey("HEDERA_OPERATOR_KEY", issues);
  validatePrivateKey("HEDERA_VERIFIER_RELAY_KEY", issues);
  validatePrivateKey("HEDERA_FINANCE_RELAY_KEY", issues);

  const mirrorNodeUrl =
    process.env.HEDERA_MIRROR_NODE_URL ??
    "https://testnet.mirrornode.hedera.com";
  if (probeNetwork && issues.length === 0) {
    await probeMirrorEntity(
      `${mirrorNodeUrl}/api/v1/topics/${process.env.HEDERA_TOPIC_ID}`,
      "Configured topic is not accessible through Mirror Node.",
      issues,
    );
    await probeTreasury(
      `${mirrorNodeUrl}/api/v1/accounts/${process.env.HEDERA_TREASURY_ACCOUNT_ID}`,
      issues,
    );
    await probeHederaConfiguration(issues);
  }

  return {
    ready: issues.length === 0,
    network: "testnet",
    issues,
    publicConfig: {
      topicId: process.env.HEDERA_TOPIC_ID,
      treasuryAccountId: process.env.HEDERA_TREASURY_ACCOUNT_ID,
      vendorAccountId: process.env.HEDERA_VENDOR_ACCOUNT_ID,
      verifierWalletAccountId:
        process.env.NEXT_PUBLIC_VERIFIER_WALLET_ACCOUNT_ID,
      financeWalletAccountId:
        process.env.NEXT_PUBLIC_FINANCE_WALLET_ACCOUNT_ID,
      mirrorNodeUrl,
      walletConnectProjectIdConfigured: Boolean(
        process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
      ),
    },
  };
}

function serviceFor(mode: ExecutionMode): ProtocolApplicationService {
  if (mode === "simulation") {
    return new ProtocolApplicationService({
      eventStore: runtime().memoryEvents,
      paymentScheduler: runtime().memoryPayments,
      settlement: { payerAccountId: "0.0.73000" },
      pollIntervalMs: 1,
      pollTimeoutMs: 100,
    });
  }
  const config = hederaConfigFromEnv();
  runtime().testnetService ??= new ProtocolApplicationService({
    eventStore: new HederaEventStore(config),
    paymentScheduler: new HederaPaymentScheduler(config),
    settlement: { payerAccountId: config.treasuryAccountId },
  });
  return runtime().testnetService!;
}

function materializeFixture(
  source: DemoFixture,
  runId: string,
  mode: ExecutionMode,
): DemoFixture {
  const suffix = runId.slice(-12);
  const programId = `${source.program.id}_${suffix}`;
  const buyerId = `${source.buyerId}_${suffix}`;
  const vendorIds = new Map(
    source.vendors.map((vendor) => [vendor.id, `${vendor.id}_${suffix}`]),
  );
  const offerIds = new Map(
    source.offers.map((offer) => [offer.id, `${offer.id}_${suffix}`]),
  );
  const selectedVendorId = source.offers.find(
    (offer) => offer.id === source.selectedOfferId,
  )?.vendorId;

  return {
    ...source,
    buyerId,
    program: { ...source.program, id: programId },
    allocation: {
      ...source.allocation,
      id: `${source.allocation.id}_${suffix}`,
      programId,
      buyerId,
    },
    vendors: source.vendors.map((vendor) => ({
      ...vendor,
      id: vendorIds.get(vendor.id)!,
      settlementAccountId:
        mode === "testnet" && vendor.id === selectedVendorId
          ? process.env.HEDERA_VENDOR_ACCOUNT_ID!
          : vendor.settlementAccountId,
    })),
    offers: source.offers.map((offer) => ({
      ...offer,
      id: offerIds.get(offer.id)!,
      programId,
      vendorId: vendorIds.get(offer.vendorId)!,
    })),
    selectedOfferId: offerIds.get(source.selectedOfferId)!,
  };
}

function initialEvents(fixture: DemoFixture, runId: string): ProtocolEvent[] {
  const base = {
    runId,
    organizationId: fixture.organizationId,
    programId: fixture.program.id,
    actor: {
      actorId: "openprocure",
      role: "SYSTEM",
      actorType: "SYSTEM" as const,
    },
  };
  return [
    createEvent({
      ...base,
      eventId: `${runId}:PROGRAM_CREATED`,
      eventType: "PROGRAM_CREATED",
      correlationId: `${runId}:program`,
      data: { program: fixture.program },
    }),
    createEvent({
      ...base,
      eventId: `${runId}:BUYER_ALLOCATED`,
      eventType: "BUYER_ALLOCATED",
      correlationId: `${runId}:allocation`,
      data: { allocation: fixture.allocation },
    }),
    ...fixture.vendors.map((vendor) =>
      createEvent({
        ...base,
        eventId: `${runId}:VENDOR_APPROVED:${vendor.id}`,
        eventType: "VENDOR_APPROVED" as const,
        correlationId: `${runId}:vendor:${vendor.id}`,
        data: { vendor },
      }),
    ),
    ...fixture.offers.map((offer) =>
      createEvent({
        ...base,
        eventId: `${runId}:OFFER_REGISTERED:${offer.id}`,
        eventType: "OFFER_REGISTERED" as const,
        correlationId: `${runId}:offer:${offer.id}`,
        data: { offer },
      }),
    ),
  ];
}

export class InMemoryEventStore implements EventStore {
  private events: RecordedEvent[] = [];

  async append(event: ProtocolEvent): Promise<LedgerReference> {
    const existing = this.events.find(
      (candidate) => candidate.eventId === event.eventId,
    );
    if (existing) return existing.ledgerReference ?? {};
    const ledgerReference = {
      topicId: "0.0.4926017",
      sequenceNumber: this.events.length + 1,
      consensusTimestamp: new Date().toISOString(),
      transactionId: `simulated@${this.events.length + 1}`,
    };
    this.events.push({ ...event, ledgerReference });
    return ledgerReference;
  }

  async read(programId: string): Promise<RecordedEvent[]> {
    return this.events.filter((event) => event.programId === programId);
  }
}

class InMemoryPaymentScheduler implements PaymentScheduler {
  private payments = new Map<
    string,
    { request: ScheduledPaymentRequest; roles: Set<string> }
  >();

  async create(request: ScheduledPaymentRequest): Promise<ScheduledPayment> {
    const existing = [...this.payments.entries()].find(
      ([, payment]) => payment.request.orderId === request.orderId,
    );
    if (existing) {
      return {
        scheduleId: existing[0],
        scheduledTransactionId: `simulated-payment@${request.orderId}`,
        status: existing[1].roles.size >= 2 ? "EXECUTED" : "PENDING",
      };
    }
    const scheduleId = `0.0.${7_400_000 + this.payments.size}`;
    this.payments.set(scheduleId, { request, roles: new Set() });
    return {
      scheduleId,
      scheduledTransactionId: `simulated-payment@${request.orderId}`,
      status: "PENDING",
    };
  }

  async approve(scheduleId: string, approval: Approval): Promise<void> {
    const payment = this.payments.get(scheduleId);
    if (!payment) throw new Error(`Schedule ${scheduleId} was not found`);
    payment.roles.add(approval.role);
  }

  async getStatus(scheduleId: string): Promise<PaymentStatus> {
    const payment = this.payments.get(scheduleId);
    if (!payment) return { state: "FAILED" };
    const scheduledTransactionId = `simulated-payment@${payment.request.orderId}`;
    return payment.roles.size >= 2
      ? {
          state: "EXECUTED",
          scheduledTransactionId,
          paymentTransactionId: scheduledTransactionId,
        }
      : { state: "PENDING", scheduledTransactionId };
  }
}

function validateAccount(name: string, issues: string[]): void {
  const value = process.env[name];
  if (!value) return;
  try {
    AccountId.fromString(value);
  } catch {
    issues.push(`${name} is not a valid Hedera ID.`);
  }
}

function validatePrivateKey(name: string, issues: string[]): void {
  const value = process.env[name];
  if (!value) return;
  try {
    PrivateKey.fromString(value);
  } catch {
    issues.push(`${name} is not a valid Hedera private key.`);
  }
}

async function probeMirrorEntity(
  url: string,
  message: string,
  issues: string[],
): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) issues.push(message);
  } catch {
    issues.push(message);
  }
}

async function probeTreasury(url: string, issues: string[]): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      issues.push("Configured treasury is not accessible through Mirror Node.");
      return;
    }
    const body = (await response.json()) as { balance?: { balance?: number } };
    if ((body.balance?.balance ?? 0) < 350_000_000) {
      issues.push("Treasury balance is below the required 3.5 HBAR.");
    }
  } catch {
    issues.push("Configured treasury is not accessible through Mirror Node.");
  }
}

async function probeHederaConfiguration(issues: string[]): Promise<void> {
  let client;
  try {
    const config = hederaConfigFromEnv();
    client = createHederaClient(config);
    const [topic, treasuryInfo, vendorBalance, operatorBalance] = await Promise.all([
      new TopicInfoQuery().setTopicId(config.topicId).execute(client),
      new AccountInfoQuery()
        .setAccountId(config.treasuryAccountId)
        .execute(client),
      new AccountBalanceQuery()
        .setAccountId(config.vendorAccountId)
        .execute(client),
      new AccountBalanceQuery()
        .setAccountId(config.operatorAccountId)
        .execute(client),
    ]);
    if (!topic.topicId) issues.push("The configured topic could not be queried.");
    if (!vendorBalance.hbars) {
      issues.push("The configured vendor account could not be queried.");
    }
    if (operatorBalance.hbars.toTinybars().isZero()) {
      issues.push("The operator account has no HBAR for network fees.");
    }
    const treasuryKey = treasuryInfo.key;
    const relayPublicKeys = [
      PrivateKey.fromString(config.verifierRelayPrivateKey!).publicKey.toString(),
      PrivateKey.fromString(config.financeRelayPrivateKey!).publicKey.toString(),
    ];
    if (
      !(treasuryKey instanceof KeyList) ||
      treasuryKey.threshold !== 2 ||
      !relayPublicKeys.every((relay) =>
        treasuryKey.toArray().some((key) => key.toString() === relay),
      )
    ) {
      issues.push(
        "Treasury key is not the configured verifier/finance 2-of-2 threshold.",
      );
    }
  } catch {
    issues.push(
      "Operator access, topic access, or configured account keys could not be validated.",
    );
  } finally {
    client?.close();
  }
}
