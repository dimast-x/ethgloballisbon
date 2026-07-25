import {
  AccountCreateTransaction,
  AccountBalanceQuery,
  AccountId,
  AccountInfoQuery,
  Hbar,
  KeyList,
  TopicInfoQuery,
} from "@hashgraph/sdk";
import {
  createHederaClient,
  HederaEventStore,
  HederaPaymentScheduler,
  hederaConfigFromEnv,
  parseHederaPrivateKey,
} from "../adapters/hedera";
import {
  createWorldRpRequest,
  EnsPublicIdentityResolver,
  sha256,
  StaticPublicIdentityResolver,
  WorldHumanBackingVerifier,
  worldConfigFromEnv,
} from "../adapters/identity";
import type { EventStore, PaymentScheduler } from "../protocol/adapters";
import { createEvent, type ProtocolEvent, type RecordedEvent } from "../protocol/events";
import type { ProtocolProjection } from "../protocol/reducer";
import { reduceProtocolEvents } from "../protocol/reducer";
import type {
  Approval,
  LedgerReference,
  PaymentStatus,
  Program,
  ProgramHederaConfig,
  ResolvedAgentIdentity,
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
  agentId: string;
  agentIdentity: import("../protocol/types").PublicIdentity;
  agentExecutionAccountId: string;
};

export type ProgramSession = RunMetadata & {
  projection: ProtocolProjection;
};

export type LiveProgramSetup = {
  verifierAccountId: string;
  financeAccountId: string;
  vendorAccountId: string;
};

type Runtime = {
  memoryEvents: InMemoryEventStore;
  memoryPayments: InMemoryPaymentScheduler;
  runs: Map<string, RunMetadata>;
  inFlight: Map<string, Promise<CommandResult>>;
  identities: Map<string, ResolvedAgentIdentity>;
  testnetEventStore?: HederaEventStore;
  testnetServices: Map<string, ProtocolApplicationService>;
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
    identities: new Map(),
    testnetServices: new Map(),
  };
  return root[runtimeKey];
}

export async function createUniversityRun(
  mode: ExecutionMode = "testnet",
  creatorActorId = "yareon",
  setup?: LiveProgramSetup,
): Promise<ProgramSession> {
  if (mode === "testnet") {
    const readiness = await getTestnetReadiness(true);
    if (!readiness.ready) {
      throw new Error(
        `Testnet is not ready: ${readiness.issues.join(" ")}`,
      );
    }
  }

  const hedera =
    mode === "testnet"
      ? await provisionProgramHedera(setup)
      : undefined;
  const runId = `run_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const fixture = materializeFixture(
    universityGpuFixture,
    runId,
    mode,
    setup,
    hedera,
  );
  const simulatedIdentity = resolvedFixtureIdentity(fixture);
  runtime().identities.set(
    `${simulatedIdentity.publicIdentity.scheme}:${simulatedIdentity.publicIdentity.name}`.toLowerCase(),
    simulatedIdentity,
  );
  const service = serviceFor(mode, fixture.program);
  const events = initialEvents(fixture, runId, creatorActorId);
  const projection = await service.appendInitialEvents(events);
  const selectedOfferId = fixture.selectedOfferId;
  const metadata: RunMetadata = {
    mode,
    runId,
    programId: fixture.program.id,
    buyerId: fixture.buyerId,
    selectedOfferId,
    orderId: `order_${runId.slice(-12)}`,
    agentId: fixture.agent.agentId,
    agentIdentity: fixture.agent.publicIdentity,
    agentExecutionAccountId: fixture.agent.executionAccountId,
  };
  runtime().runs.set(fixture.program.id, metadata);
  return { ...metadata, projection };
}

export async function createProgram(
  program: Program,
  mode: ExecutionMode = "testnet",
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
  const projection = await serviceFor(mode, program).appendInitialEvents([event]);
  const metadata: RunMetadata = {
    mode,
    runId,
    programId: program.id,
    buyerId: "",
    selectedOfferId: "",
    orderId: "",
    agentId: "",
    agentIdentity: { scheme: "", name: "" },
    agentExecutionAccountId: "",
  };
  runtime().runs.set(program.id, metadata);
  return { ...metadata, projection };
}

export async function getProgramSession(
  programId: string,
  mode: ExecutionMode = "testnet",
): Promise<ProgramSession | undefined> {
  const projection = await projectionFor(mode, programId);
  if (!projection.program) return undefined;
  const metadata = runtime().runs.get(programId) ?? {
    mode,
    runId: projection.runId ?? "",
    programId,
    buyerId: Object.keys(projection.allocations)[0] ?? "",
    selectedOfferId:
      Object.keys(projection.offers).find((offerId) =>
        offerId.includes("horizon"),
      ) ??
      Object.keys(projection.offers)[0] ??
      "",
    orderId:
      Object.keys(projection.orders)[0] ??
      (projection.runId ? `order_${projection.runId.slice(-12)}` : ""),
    agentId: Object.keys(projection.agentDelegations)[0] ?? "",
    agentIdentity:
      Object.values(projection.agentIdentities)[0]?.publicIdentity ?? {
        scheme: "",
        name: "",
      },
    agentExecutionAccountId:
      Object.values(projection.agentIdentities)[0]?.executionAccountId ?? "",
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
  const projection = await projectionFor(mode, programId);
  if (!projection.program) {
    throw new Error(`Program ${programId} was not found.`);
  }
  const pending = serviceFor(mode, projection.program)
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
  const projection = await projectionFor(mode, programId);
  return projection.orders[orderId];
}

export type TestnetReadiness = {
  ready: boolean;
  authorized?: boolean;
  network: "testnet";
  issues: string[];
  publicConfig: {
    topicId?: string;
    mirrorNodeUrl: string;
    walletConnectConfigured: boolean;
  };
};

export async function getTestnetReadiness(
  probeNetwork = false,
): Promise<TestnetReadiness> {
  const issues: string[] = [];
  const yareonAuthSecret =
    process.env.YAREON_AUTH_SECRET ?? process.env.CHARTER_AUTH_SECRET;
  const required = [
    "HEDERA_OPERATOR_ID",
    "HEDERA_OPERATOR_KEY",
    "HEDERA_TOPIC_ID",
    "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
  ] as const;
  if (!yareonAuthSecret) issues.push("Missing YAREON_AUTH_SECRET.");
  for (const name of required) {
    if (!process.env[name]) issues.push(`Missing ${name}.`);
  }
  if (yareonAuthSecret && yareonAuthSecret.length < 32) {
    issues.push("YAREON_AUTH_SECRET must contain at least 32 characters.");
  }
  if (
    process.env.HEDERA_NETWORK &&
    process.env.HEDERA_NETWORK !== "testnet"
  ) {
    issues.push("Iteration two supports HEDERA_NETWORK=testnet only.");
  }
  validateAccount("HEDERA_OPERATOR_ID", issues);
  validateAccount("HEDERA_TOPIC_ID", issues);
  validatePrivateKey("HEDERA_OPERATOR_KEY", issues);

  const mirrorNodeUrl =
    process.env.HEDERA_MIRROR_NODE_URL ??
    "https://testnet.mirrornode.hedera.com";
  if (probeNetwork && issues.length === 0) {
    await probeMirrorEntity(
      `${mirrorNodeUrl}/api/v1/topics/${process.env.HEDERA_TOPIC_ID}`,
      "Configured topic is not accessible through Mirror Node.",
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
      mirrorNodeUrl,
      walletConnectConfigured: Boolean(
        process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
      ),
    },
  };
}

export type IdentityReadiness = {
  ready: boolean;
  issues: string[];
  publicConfig: {
    agentEnsName?: string;
    organizationEnsName?: string;
    worldAppId?: string;
    worldAction: string;
    worldEnvironment: "staging" | "production";
    ensRpcConfigured: boolean;
    expectedDelegationHash: string;
  };
};

export async function getIdentityReadiness(
  probeNetwork = false,
): Promise<IdentityReadiness> {
  void probeNetwork;
  const issues: string[] = [];
  const required = [
    "WORLD_RP_ID",
    "WORLD_RP_SIGNING_KEY",
  ] as const;
  for (const name of required) {
    if (!process.env[name]) issues.push(`Missing ${name}.`);
  }
  const worldAppId =
    process.env.WORLD_APP_ID ?? process.env.NEXT_PUBLIC_WORLD_APP_ID;
  if (!worldAppId) issues.push("Missing WORLD_APP_ID or NEXT_PUBLIC_WORLD_APP_ID.");
  const environment =
    process.env.WORLD_ENVIRONMENT === "staging" ? "staging" : "production";
  if (environment !== "production") {
    issues.push("Live integration runs require WORLD_ENVIRONMENT=production.");
  }
  if (
    process.env.NEXT_PUBLIC_WORLD_ENVIRONMENT &&
    process.env.NEXT_PUBLIC_WORLD_ENVIRONMENT !== environment
  ) {
    issues.push("World server and browser environments do not match.");
  }
  return {
    ready: issues.length === 0,
    issues,
    publicConfig: {
      agentEnsName:
        process.env.YAREON_AGENT_ENS_NAME ?? process.env.CHARTER_AGENT_ENS_NAME,
      organizationEnsName:
        process.env.YAREON_ORGANIZATION_ENS_NAME ??
        process.env.CHARTER_ORGANIZATION_ENS_NAME,
      worldAppId,
      worldAction:
        process.env.WORLD_ACTION ?? "authorize-yareon-agent",
      worldEnvironment: environment,
      ensRpcConfigured: Boolean(process.env.ENS_RPC_URL),
      expectedDelegationHash: delegationIntegrityHash(
        universityGpuFixture.agent.delegation,
      ),
    },
  };
}

export async function createAgentWorldRequest(
  programId: string,
  mode: ExecutionMode,
  agentId: string,
) {
  const session = await getProgramSession(programId, mode);
  if (!session) throw new Error("Program not found.");
  const signal = agentAuthorizationSignal(session, agentId);
  if (mode === "simulation") {
    return {
      appId: "app_simulation",
      rpId: "rp_simulation",
      action: "authorize-yareon-agent",
      environment: "staging" as const,
      signal,
      rpContext: {
        rp_id: "rp_simulation",
        nonce: "simulation",
        created_at: Math.floor(Date.now() / 1000),
        expires_at: Math.floor(Date.now() / 1000) + 300,
        signature: "simulation",
      },
    };
  }
  return createWorldRpRequest(worldConfigFromEnv(), signal);
}

export async function verifyAgentHumanBacking(input: {
  programId: string;
  mode: ExecutionMode;
  agentId: string;
  idempotencyKey: string;
  proof: unknown;
}): Promise<CommandResult> {
  const session = await getProgramSession(input.programId, input.mode);
  if (!session) throw new Error("Program not found.");
  const signal = agentAuthorizationSignal(session, input.agentId);
  const attestation =
    input.mode === "simulation"
      ? {
          scheme: "world-id",
          verificationReference: sha256(
            `simulation:${input.programId}:${input.agentId}`,
          ),
          subjectReference: input.agentId,
          verifiedAt: new Date().toISOString(),
        }
      : await new WorldHumanBackingVerifier(worldConfigFromEnv()).verify({
          subjectReference: input.agentId,
          action:
            process.env.WORLD_ACTION ?? "authorize-yareon-agent",
          environment:
            process.env.WORLD_ENVIRONMENT === "staging"
              ? "staging"
              : "production",
          signal,
          proof: input.proof,
        });
  const duplicate = Object.values(session.projection.humanBacking).find(
    (candidate) =>
      candidate.verificationReference === attestation.verificationReference,
  );
  if (duplicate) throw new Error("This World verification was already used.");
  return runProgramCommand(input.programId, input.mode, {
    type: "RECORD_HUMAN_BACKING",
    idempotencyKey: input.idempotencyKey,
    actor: {
      actorId: "yareon",
      role: "SYSTEM",
      actorType: "SYSTEM",
    },
    attestation,
  });
}

export function agentAuthorizationBinding(
  session: ProgramSession,
  agentId: string,
) {
  const delegation = session.projection.agentDelegations[agentId];
  if (!delegation) throw new Error("The agent delegation was not found.");
  return {
    protocolVersion: "0.2",
    runId: session.runId,
    organizationId: session.projection.program?.organizationId,
    programId: session.programId,
    agentId,
    principalId: delegation.principalId,
    delegationHash: delegation.integrityHash,
  };
}

export function agentAuthorizationSignal(
  session: ProgramSession,
  agentId: string,
): string {
  return sha256(JSON.stringify(agentAuthorizationBinding(session, agentId)));
}

async function provisionProgramHedera(
  setup?: LiveProgramSetup,
): Promise<ProgramHederaConfig> {
  if (!setup) {
    throw new Error(
      "Verifier, finance, and vendor Hedera accounts are required.",
    );
  }
  for (const [name, accountId] of Object.entries(setup)) {
    try {
      AccountId.fromString(accountId);
    } catch {
      throw new Error(`${name} is not a valid Hedera account ID.`);
    }
  }
  if (setup.verifierAccountId === setup.financeAccountId) {
    throw new Error("Verifier and finance must use different Hedera accounts.");
  }

  const platform = hederaConfigFromEnv();
  const client = createHederaClient(platform);
  try {
    const [verifier, finance, vendor] = await Promise.all([
      new AccountInfoQuery()
        .setAccountId(setup.verifierAccountId)
        .execute(client),
      new AccountInfoQuery()
        .setAccountId(setup.financeAccountId)
        .execute(client),
      new AccountInfoQuery().setAccountId(setup.vendorAccountId).execute(client),
    ]);
    if (!verifier.key || !finance.key || !vendor.key) {
      throw new Error("One or more program accounts do not expose a usable key.");
    }
    const treasuryKey = new KeyList([verifier.key, finance.key], 2);
    const response = await new AccountCreateTransaction()
      .setKey(treasuryKey)
      .setInitialBalance(new Hbar(5))
      .execute(client);
    const receipt = await response.getReceipt(client);
    if (!receipt.accountId) {
      throw new Error("Hedera did not return a treasury account ID.");
    }
    return {
      treasuryAccountId: receipt.accountId.toString(),
      verifierAccountId: setup.verifierAccountId,
      financeAccountId: setup.financeAccountId,
    };
  } finally {
    client.close();
  }
}

function serviceFor(
  mode: ExecutionMode,
  program?: Program,
): ProtocolApplicationService {
  if (mode === "simulation") {
    return new ProtocolApplicationService({
      eventStore: runtime().memoryEvents,
      paymentScheduler: runtime().memoryPayments,
      identityResolver: new StaticPublicIdentityResolver(runtime().identities),
      settlement: { payerAccountId: "0.0.73000" },
      pollIntervalMs: 1,
      pollTimeoutMs: 100,
    });
  }
  if (!program?.hedera) {
    throw new Error("The program has no Hedera settlement configuration.");
  }
  const cached = runtime().testnetServices.get(program.id);
  if (cached) return cached;
  const config = {
    ...hederaConfigFromEnv(),
    ...program.hedera,
  };
  const service = new ProtocolApplicationService({
    eventStore: testnetEventStore(),
    paymentScheduler: new HederaPaymentScheduler(config),
    identityResolver: new EnsPublicIdentityResolver({
      rpcUrl: process.env.ENS_RPC_URL,
      expectedOrganizationName:
        process.env.YAREON_ORGANIZATION_ENS_NAME ??
        process.env.CHARTER_ORGANIZATION_ENS_NAME,
    }),
    requireResolvedAgentIdentity: false,
    settlement: { payerAccountId: config.treasuryAccountId },
  });
  runtime().testnetServices.set(program.id, service);
  return service;
}

function testnetEventStore(): HederaEventStore {
  runtime().testnetEventStore ??= new HederaEventStore(hederaConfigFromEnv());
  return runtime().testnetEventStore!;
}

async function projectionFor(
  mode: ExecutionMode,
  programId: string,
): Promise<ProtocolProjection> {
  if (mode === "simulation") {
    return serviceFor(mode).projection(programId);
  }
  return reduceProtocolEvents(await testnetEventStore().read(programId));
}

function materializeFixture(
  source: DemoFixture,
  runId: string,
  mode: ExecutionMode,
  setup?: LiveProgramSetup,
  hedera?: ProgramHederaConfig,
): DemoFixture {
  const agentEnsName =
    process.env.YAREON_AGENT_ENS_NAME ?? process.env.CHARTER_AGENT_ENS_NAME;
  const organizationEnsName =
    process.env.YAREON_ORGANIZATION_ENS_NAME ??
    process.env.CHARTER_ORGANIZATION_ENS_NAME;
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

  const delegation = {
    ...source.agent.delegation,
    integrityHash: "",
  };
  delegation.integrityHash = delegationIntegrityHash(delegation);

  return {
    ...source,
    buyerId,
    program: { ...source.program, id: programId, hedera },
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
          ? setup!.vendorAccountId
          : vendor.settlementAccountId,
    })),
    offers: source.offers.map((offer) => ({
      ...offer,
      id: offerIds.get(offer.id)!,
      programId,
      vendorId: vendorIds.get(offer.vendorId)!,
    })),
    selectedOfferId: offerIds.get(source.selectedOfferId)!,
    agent: {
      ...source.agent,
      publicIdentity:
        mode === "testnet" && agentEnsName
          ? {
              scheme: "ens",
              name: agentEnsName,
            }
          : source.agent.publicIdentity,
      organizationName:
        mode === "testnet" && organizationEnsName
          ? organizationEnsName
          : source.agent.organizationName,
      delegation,
    },
  };
}

function initialEvents(
  fixture: DemoFixture,
  runId: string,
  creatorActorId = "yareon",
): ProtocolEvent[] {
  const base = {
    runId,
    organizationId: fixture.organizationId,
    programId: fixture.program.id,
  };
  return [
    createEvent({
      ...base,
      actor: {
        actorId: creatorActorId,
        role: "ADMIN",
        actorType: "HUMAN",
      },
      eventId: `${runId}:PROGRAM_CREATED`,
      eventType: "PROGRAM_CREATED",
      correlationId: `${runId}:program`,
      data: { program: fixture.program },
    }),
    createEvent({
      ...base,
      actor: {
        actorId: creatorActorId,
        role: "ADMIN",
        actorType: "HUMAN",
      },
      eventId: `${runId}:BUYER_ALLOCATED`,
      eventType: "BUYER_ALLOCATED",
      correlationId: `${runId}:allocation`,
      data: { allocation: fixture.allocation },
    }),
    ...fixture.vendors.map((vendor) =>
      createEvent({
        ...base,
        actor: {
          actorId: creatorActorId,
          role: "ADMIN",
          actorType: "HUMAN",
        },
        eventId: `${runId}:VENDOR_APPROVED:${vendor.id}`,
        eventType: "VENDOR_APPROVED" as const,
        correlationId: `${runId}:vendor:${vendor.id}`,
        data: { vendor },
      }),
    ),
    ...fixture.offers.map((offer) =>
      createEvent({
        ...base,
        actor: {
          actorId: creatorActorId,
          role: "ADMIN",
          actorType: "HUMAN",
        },
        eventId: `${runId}:OFFER_REGISTERED:${offer.id}`,
        eventType: "OFFER_REGISTERED" as const,
        correlationId: `${runId}:offer:${offer.id}`,
        data: { offer },
      }),
    ),
    createEvent({
      ...base,
      actor: {
        actorId: creatorActorId,
        role: "ADMIN",
        actorType: "HUMAN",
      },
      eventId: `${runId}:AGENT_DELEGATION_GRANTED:${fixture.agent.agentId}`,
      eventType: "AGENT_DELEGATION_GRANTED",
      correlationId: `${runId}:agent-delegation:${fixture.agent.agentId}`,
      data: { delegation: fixture.agent.delegation },
    }),
  ];
}

function delegationIntegrityHash(
  delegation: import("../protocol/types").AgentDelegation,
): string {
  const canonical = {
    delegationId: delegation.delegationId,
    organizationId: delegation.organizationId,
    principalId: delegation.principalId,
    agentId: delegation.agentId,
    allowedPrograms: delegation.allowedPrograms,
    allowedActions: delegation.allowedActions,
    allowedCategories: delegation.allowedCategories,
    maxPerOrder: delegation.maxPerOrder,
    maxTotalSpend: delegation.maxTotalSpend,
    validFrom: delegation.validFrom,
    validUntil: delegation.validUntil,
    revokedAt: delegation.revokedAt,
  };
  return sha256(
    JSON.stringify({
      ...canonical,
      allowedPrograms: [...canonical.allowedPrograms].sort(),
      allowedActions: [...canonical.allowedActions].sort(),
      allowedCategories: [...canonical.allowedCategories].sort(),
    }),
  );
}

function resolvedFixtureIdentity(fixture: DemoFixture): ResolvedAgentIdentity {
  const snapshot = {
    agentId: fixture.agent.agentId,
    publicIdentity: fixture.agent.publicIdentity,
    organizationReference: fixture.organizationId,
    executionAccountId: fixture.agent.executionAccountId,
    role: fixture.agent.role,
    protocolVersion: "0.2",
    delegationHash: fixture.agent.delegation.integrityHash,
    endpoint: "https://yareon.com/agents/reference",
  };
  return {
    ...snapshot,
    resolutionHash: sha256(JSON.stringify(snapshot)),
    resolvedAt: new Date().toISOString(),
  };
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
        status: existing[1].roles.size >= 1 ? "EXECUTED" : "PENDING",
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

  async confirmApproval(scheduleId: string, approval: Approval): Promise<void> {
    const payment = this.payments.get(scheduleId);
    if (!payment) throw new Error(`Schedule ${scheduleId} was not found`);
    payment.roles.add(approval.role);
  }

  async getStatus(scheduleId: string): Promise<PaymentStatus> {
    const payment = this.payments.get(scheduleId);
    if (!payment) return { state: "FAILED" };
    const scheduledTransactionId = `simulated-payment@${payment.request.orderId}`;
    return payment.roles.size >= 1
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
    parseHederaPrivateKey(value);
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

async function probeHederaConfiguration(issues: string[]): Promise<void> {
  let client;
  try {
    const config = hederaConfigFromEnv();
    client = createHederaClient(config);
    const [topic, operatorBalance] = await Promise.all([
      new TopicInfoQuery().setTopicId(config.topicId).execute(client),
      new AccountBalanceQuery()
        .setAccountId(config.operatorAccountId)
        .execute(client),
    ]);
    if (!topic.topicId) issues.push("The configured topic could not be queried.");
    if (operatorBalance.hbars.toTinybars().isZero()) {
      issues.push("The operator account has no HBAR for network fees.");
    }
  } catch {
    issues.push(
      "Operator access or the shared event topic could not be validated.",
    );
  } finally {
    client?.close();
  }
}
