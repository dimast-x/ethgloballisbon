import {
  AccountCreateTransaction,
  AccountBalanceQuery,
  AccountId,
  AccountInfoQuery,
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
  sha256,
  StaticPublicIdentityResolver,
} from "../adapters/identity";
import {
  agentkitVerifierConfigFromEnv,
  lookupConfiguredAgentHuman,
} from "../adapters/agentkit";
import type { EventStore, PaymentScheduler } from "../protocol/adapters";
import { createEvent, type ProtocolEvent, type RecordedEvent } from "../protocol/events";
import type { ProtocolProjection } from "../protocol/reducer";
import { reduceProtocolEvents } from "../protocol/reducer";
import type {
  Approval,
  LedgerReference,
  Money,
  PaymentStatus,
  Program,
  ProgramHederaConfig,
  ResolvedAgentIdentity,
  ScheduledPayment,
  ScheduledPaymentRequest,
} from "../protocol/types";
import { atomic } from "../protocol/money";
import type {
  CommandResult,
  ExecutionMode,
  ProtocolCommand,
} from "./commands";
import { ProtocolApplicationService } from "./service";
import { verifyHederaProgramDeposit } from "./program-funding";

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
  treasuryBalance?: Money;
};

export type ProgramListItem = {
  programId: string;
  name: string;
  description: string;
  status: Program["status"];
  createdAt: string;
  budget: Program["budget"];
};

export type LiveProgramSetup = {
  verifierAccountId: string;
  financeAccountId: string;
};

type Runtime = {
  memoryEvents: InMemoryEventStore;
  memoryPayments: InMemoryPaymentScheduler;
  runs: Map<string, RunMetadata>;
  inFlight: Map<string, Promise<CommandResult>>;
  settlementSetups: Map<string, Promise<ProgramSession>>;
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
    settlementSetups: new Map(),
    identities: new Map(),
    testnetServices: new Map(),
  };
  root[runtimeKey]!.settlementSetups ??= new Map();
  return root[runtimeKey];
}

export type CreateProgramInput = {
  name: string;
  description?: string;
  asset?: string;
  decimals?: number;
  policy?: Program["policy"];
};

export async function createProgramRun(
  input: CreateProgramInput,
  mode: ExecutionMode = "testnet",
  creatorActorId: string,
): Promise<ProgramSession> {
  const name = input.name.trim();
  if (!name) throw new Error("Program name is required.");
  if (mode === "testnet") {
    const readiness = await getTestnetReadiness(true);
    if (!readiness.ready) {
      throw new Error(
        `Testnet is not ready: ${readiness.issues.join(" ")}`,
      );
    }
  }

  const runId = `run_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const asset = input.asset?.trim() || "HBAR";
  const decimals = input.decimals ?? 8;
  const program: Program = {
    id: `program_${suffix}`,
    organizationId: creatorActorId,
    name,
    description: input.description?.trim() ?? "",
    budget: atomic(0n, asset, decimals),
    status: "DRAFT",
    policy:
      input.policy ?? {
        allowedCategories: [],
        requireDeliveryEvidence: false,
        approvalRequirements: [],
      },
  };
  const service = serviceFor(mode, program);
  const projection = await service.appendInitialEvents([
    createEvent({
      eventId: `${runId}:PROGRAM_CREATED`,
      eventType: "PROGRAM_CREATED",
      runId,
      organizationId: program.organizationId,
      programId: program.id,
      actor: {
        actorId: creatorActorId,
        role: "ADMIN",
        actorType: "HUMAN",
      },
      correlationId: `${runId}:program`,
      data: { program },
    }),
  ], true);
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

export async function configureProgramSettlement(
  programId: string,
  setup: LiveProgramSetup,
  actorId: string,
): Promise<ProgramSession> {
  const existing = runtime().settlementSetups.get(programId);
  if (existing) return existing;
  const pending = configureProgramSettlementOnce(programId, setup, actorId)
    .finally(() => runtime().settlementSetups.delete(programId));
  runtime().settlementSetups.set(programId, pending);
  return pending;
}

async function configureProgramSettlementOnce(
  programId: string,
  setup: LiveProgramSetup,
  actorId: string,
): Promise<ProgramSession> {
  const current = await getProgramSession(programId, "testnet");
  if (!current?.projection.program) {
    throw new Error(`Program ${programId} was not found.`);
  }
  if (current.projection.program.hedera) {
    return current;
  }

  const approvedSuppliers = Object.values(current.projection.vendors).filter(
    (vendor) => vendor.status === "APPROVED",
  );
  const missingSettlement = approvedSuppliers.filter(
    (vendor) => !vendor.settlementAccountId,
  );
  if (missingSettlement.length > 0) {
    throw new Error(
      `Every approved supplier needs its own settlement account. Missing: ${missingSettlement
        .map((vendor) => vendor.name)
        .join(", ")}.`,
    );
  }
  const hedera = await provisionProgramHedera(
    setup,
    approvedSuppliers.map((vendor) => vendor.settlementAccountId!),
  );
  const event = createEvent({
    eventId: `${current.runId}:PROGRAM_SETTLEMENT_CONFIGURED`,
    eventType: "PROGRAM_SETTLEMENT_CONFIGURED",
    runId: current.runId,
    organizationId: current.projection.program.organizationId,
    programId,
    actor: { actorId, role: "ADMIN", actorType: "HUMAN" },
    correlationId: `${current.runId}:settlement`,
    data: {
      hedera,
      policy:
        setup.verifierAccountId && setup.financeAccountId
          ? current.projection.program.policy
          : {
              ...current.projection.program.policy,
              requireDeliveryEvidence: false,
              approvalRequirements: [],
            },
    },
  });
  const projection = await serviceFor(
    "testnet",
    current.projection.program,
  ).appendInitialEvents([event]);
  runtime().testnetServices.delete(programId);
  return { ...current, projection };
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

export function registerRuntimeAgentIdentity(
  identity: ResolvedAgentIdentity,
): void {
  runtime().identities.set(
    `${identity.publicIdentity.scheme.toLowerCase()}:${identity.publicIdentity.name.toLowerCase()}`,
    identity,
  );
  runtime().testnetServices.clear();
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

export async function listAdministratorPrograms(
  creatorActorId: string,
): Promise<ProgramListItem[]> {
  const events = await testnetEventStore().readAll();
  const created = events.filter(
    (event) =>
      event.eventType === "PROGRAM_CREATED" &&
      event.actor.actorId === creatorActorId,
  );
  const ownedProgramIds = new Set(created.map((event) => event.programId));
  const eventsByProgram = new Map<string, RecordedEvent[]>();
  for (const event of events) {
    if (!ownedProgramIds.has(event.programId)) continue;
    const current = eventsByProgram.get(event.programId) ?? [];
    current.push(event);
    eventsByProgram.set(event.programId, current);
  }

  return created
    .map((event) => {
      const projection = reduceProtocolEvents(
        eventsByProgram.get(event.programId) ?? [event],
      );
      const program =
        projection.program ?? (event.data as { program: Program }).program;
      return {
        programId: event.programId,
        name: program.name,
        description: program.description,
        status: program.status,
        createdAt: event.occurredAt,
        budget: program.budget,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
  if (mode === "testnet" && command.type === "UPSERT_SUPPLIER") {
    await validateSupplierSettlementAccount(
      command.vendor.settlementAccountId,
    );
  }
  const pending = serviceFor(mode, projection.program)
    .execute(programId, command)
    .finally(() => runtime().inFlight.delete(key));
  runtime().inFlight.set(key, pending);
  return pending;
}

export async function recordProgramDeposit(input: {
  programId: string;
  transactionId: string;
  amount: import("../protocol/types").Money;
  depositorAccountId: string;
  actorId: string;
}): Promise<CommandResult> {
  const session = await getProgramSession(input.programId, "testnet");
  const program = session?.projection.program;
  if (!session || !program?.hedera) {
    throw new Error("Configure the program treasury before depositing funds.");
  }
  if (program.hedera.fundingMode !== "USER_DEPOSIT") {
    throw new Error("This program does not support wallet deposits.");
  }

  const existingDeposit = (await testnetEventStore().readAll()).find(
    (event) =>
      event.eventType === "PROGRAM_UPFUNDED" &&
      (event.data as { depositTransactionId?: string }).depositTransactionId ===
        input.transactionId,
  );
  if (existingDeposit && existingDeposit.programId !== input.programId) {
    throw new Error(
      "This Hedera deposit transaction was already credited to another program.",
    );
  }

  await verifyHederaProgramDeposit({
    transactionId: input.transactionId,
    depositorAccountId: input.depositorAccountId,
    treasuryAccountId: program.hedera.treasuryAccountId,
    programId: input.programId,
    amount: input.amount,
  });

  return runProgramCommand(input.programId, "testnet", {
    type: "UPFUND_PROGRAM",
    idempotencyKey: `${session.runId}:deposit:${input.transactionId}`,
    actor: {
      actorId: input.actorId,
      role: "ADMIN",
      actorType: "HUMAN",
      hederaAccountId: input.depositorAccountId,
    },
    amount: input.amount,
    depositTransactionId: input.transactionId,
  });
}

export async function getProgramTreasuryBalance(
  program: Program,
): Promise<Money | undefined> {
  if (!program.hedera?.treasuryAccountId) return undefined;
  const client = createHederaClient(hederaConfigFromEnv());
  try {
    const balance = await new AccountBalanceQuery()
      .setAccountId(program.hedera.treasuryAccountId)
      .execute(client);
    return {
      asset: "HBAR",
      decimals: 8,
      atomicAmount: balance.hbars.toTinybars().toString(),
    };
  } finally {
    client.close();
  }
}

export async function reconcileProgramTreasuryFunding(
  session: ProgramSession,
): Promise<ProgramSession> {
  const program = session.projection.program;
  if (!program?.hedera) return session;
  const treasuryBalance = await getProgramTreasuryBalance(program);
  if (!treasuryBalance) return session;

  const paidAtomic = Object.values(session.projection.allocations).reduce(
    (total, allocation) => total + BigInt(allocation.paid.atomicAmount),
    0n,
  );
  const uncreditedFunds = uncreditedTreasuryFunds(
    session.projection,
    treasuryBalance,
  );
  if (uncreditedFunds <= 0n) {
    return { ...session, treasuryBalance };
  }

  const result = await runProgramCommand(session.programId, "testnet", {
    type: "UPFUND_PROGRAM",
    idempotencyKey: `${session.runId}:treasury-reconciliation:${treasuryBalance.atomicAmount}:${paidAtomic}`,
    actor: {
      actorId: "yareon",
      role: "SYSTEM",
      actorType: "SYSTEM",
    },
    amount: {
      ...program.budget,
      atomicAmount: uncreditedFunds.toString(),
    },
    depositTransactionId: `treasury-balance:${program.hedera.treasuryAccountId}:${treasuryBalance.atomicAmount}:${paidAtomic}`,
  });
  if (result.status === "FAILED" || !result.projection) {
    throw new Error(
      result.error?.message ??
        "The live treasury balance could not be reconciled with program funding.",
    );
  }
  return {
    ...session,
    projection: result.projection,
    treasuryBalance,
  };
}

export function uncreditedTreasuryFunds(
  projection: ProtocolProjection,
  treasuryBalance: Money,
): bigint {
  const program = projection.program;
  if (!program) return 0n;
  const paidAtomic = Object.values(projection.allocations).reduce(
    (total, allocation) => total + BigInt(allocation.paid.atomicAmount),
    0n,
  );
  const projectedUnspent =
    BigInt(program.budget.atomicAmount) - paidAtomic;
  return BigInt(treasuryBalance.atomicAmount) - projectedUnspent;
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
    agentAddress?: string;
    agentBookRegistered?: boolean;
    worldChain: "eip155:480";
    expectedDelegationHash: string;
  };
};

export async function getIdentityReadiness(
  probeNetwork = false,
): Promise<IdentityReadiness> {
  const issues: string[] = [];
  let agentAddress: string | undefined;
  let agentBookRegistered: boolean | undefined;
  try {
    agentAddress = agentkitVerifierConfigFromEnv().agentAddress;
    if (probeNetwork) {
      agentBookRegistered = await lookupConfiguredAgentHuman();
      if (!agentBookRegistered) {
        issues.push("The configured agent is not registered in World AgentBook.");
      }
    }
  } catch (error) {
    issues.push(
      error instanceof Error ? error.message : "AgentKit configuration is invalid.",
    );
  }
  return {
    ready: issues.length === 0,
    issues,
    publicConfig: {
      agentAddress,
      agentBookRegistered,
      worldChain: "eip155:480",
      expectedDelegationHash: "",
    },
  };
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
  if (input.mode !== "simulation") {
    throw new Error(
      "Live agent backing must be verified through the AgentKit procurement endpoint.",
    );
  }
  const attestation = {
    scheme: "simulation",
    verificationReference: sha256(
      `simulation:${input.programId}:${input.agentId}`,
    ),
    subjectReference: input.agentId,
    verifiedAt: new Date().toISOString(),
  };
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

export function humanVerificationSignal(
  session: ProgramSession,
  subjectId: string,
): string {
  const delegation = session.projection.agentDelegations[subjectId];
  if (delegation) return agentAuthorizationSignal(session, subjectId);
  const allocation = session.projection.allocations[subjectId];
  if (!allocation) {
    throw new Error("The member or agent was not found in this program.");
  }
  return sha256(
    JSON.stringify({
      protocolVersion: "0.2",
      runId: session.runId,
      organizationId: session.projection.program?.organizationId,
      programId: session.programId,
      subjectId,
      participantType: allocation.participantType ?? "HUMAN",
      allocationId: allocation.id,
    }),
  );
}

export function agentAuthorizationSignal(
  session: ProgramSession,
  agentId: string,
): string {
  return sha256(JSON.stringify(agentAuthorizationBinding(session, agentId)));
}

async function provisionProgramHedera(
  setup?: LiveProgramSetup,
  supplierSettlementAccountIds: string[] = [],
): Promise<ProgramHederaConfig> {
  if (!setup) {
    throw new Error("Program payment setup is required.");
  }
  for (const [name, accountId] of [
    ...Object.entries(setup),
    ...supplierSettlementAccountIds.map(
      (accountId, index) => [`supplierSettlementAccountId[${index}]`, accountId],
    ),
  ].filter(([, accountId]) => Boolean(accountId))) {
    try {
      AccountId.fromString(accountId);
    } catch {
      throw new Error(`${name} is not a valid Hedera account ID.`);
    }
  }
  if (
    setup.verifierAccountId &&
    setup.financeAccountId &&
    setup.verifierAccountId === setup.financeAccountId
  ) {
    throw new Error("Verifier and finance must use different Hedera accounts.");
  }

  const platform = hederaConfigFromEnv();
  if (!setup.verifierAccountId || !setup.financeAccountId) {
    if (setup.verifierAccountId || setup.financeAccountId) {
      throw new Error(
        "Provide both verifier and finance accounts for advanced approvals, or neither for policy-authorized payments.",
      );
    }
  }
  const client = createHederaClient(platform);
  try {
    const supplierAccounts = await Promise.all(
      supplierSettlementAccountIds.map((accountId) =>
        new AccountInfoQuery().setAccountId(accountId).execute(client),
      ),
    );
    if (supplierAccounts.some((account) => !account.key)) {
      throw new Error(
        "One or more supplier settlement accounts do not expose a usable key.",
      );
    }
    const approvalAccounts =
      setup.verifierAccountId && setup.financeAccountId
        ? await Promise.all([
            new AccountInfoQuery()
              .setAccountId(setup.verifierAccountId)
              .execute(client),
            new AccountInfoQuery()
              .setAccountId(setup.financeAccountId)
              .execute(client),
          ])
        : undefined;
    const operatorAccount = approvalAccounts
      ? undefined
      : await new AccountInfoQuery()
          .setAccountId(platform.operatorAccountId)
          .execute(client);
    if (
      approvalAccounts?.some((account) => !account.key) ||
      (!approvalAccounts && !operatorAccount?.key)
    ) {
      throw new Error(
        "One or more treasury control accounts do not expose a usable key.",
      );
    }
    const treasuryKey = approvalAccounts
      ? new KeyList(approvalAccounts.map((account) => account.key!), 2)
      : operatorAccount!.key!;
    const response = await new AccountCreateTransaction()
      .setKey(treasuryKey)
      .execute(client);
    const receipt = await response.getReceipt(client);
    if (!receipt.accountId) {
      throw new Error("Hedera did not return a treasury account ID.");
    }
    return {
      treasuryAccountId: receipt.accountId.toString(),
      fundingMode: "USER_DEPOSIT",
      verifierAccountId: setup.verifierAccountId,
      financeAccountId: setup.financeAccountId,
    };
  } finally {
    client.close();
  }
}

async function validateSupplierSettlementAccount(
  settlementAccountId: string,
): Promise<void> {
  try {
    AccountId.fromString(settlementAccountId);
  } catch {
    throw new Error("Supplier settlement account is not a valid Hedera account ID.");
  }

  const client = createHederaClient(hederaConfigFromEnv());
  try {
    const account = await new AccountInfoQuery()
      .setAccountId(settlementAccountId)
      .execute(client);
    if (!account.key) {
      throw new Error(
        "Supplier settlement account does not expose a usable key.",
      );
    }
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
      settlement: { payerAccountId: "simulation-treasury" },
      pollIntervalMs: 1,
      pollTimeoutMs: 100,
    });
  }
  if (!program?.hedera) {
    return new ProtocolApplicationService({
      eventStore: testnetEventStore(),
      paymentScheduler: runtime().memoryPayments,
      identityResolver:
        runtime().identities.size > 0
          ? new StaticPublicIdentityResolver(runtime().identities)
          : undefined,
      requireResolvedAgentIdentity: false,
      settlement: { payerAccountId: hederaConfigFromEnv().operatorAccountId },
    });
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
    identityResolver:
      runtime().identities.size > 0
        ? new StaticPublicIdentityResolver(runtime().identities)
        : undefined,
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

export class InMemoryEventStore implements EventStore {
  private events: RecordedEvent[] = [];

  async append(event: ProtocolEvent): Promise<LedgerReference> {
    const existing = this.events.find(
      (candidate) => candidate.eventId === event.eventId,
    );
    if (existing) return existing.ledgerReference ?? {};
    const ledgerReference = {
      topicId: `simulation:${event.programId}`,
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
    { request: ScheduledPaymentRequest; roles: Set<string>; immediate: boolean }
  >();

  async create(request: ScheduledPaymentRequest): Promise<ScheduledPayment> {
    const existing = [...this.payments.entries()].find(
      ([, payment]) => payment.request.orderId === request.orderId,
    );
    if (existing) {
      return {
        scheduleId: existing[0],
        scheduledTransactionId: `simulated-payment@${request.orderId}`,
        status:
          existing[1].immediate || existing[1].roles.size >= 1
            ? "EXECUTED"
            : "PENDING",
      };
    }
    const scheduleId = `simulation:${crypto.randomUUID()}`;
    this.payments.set(scheduleId, {
      request,
      roles: new Set(),
      immediate: request.executeImmediately === true,
    });
    return {
      scheduleId,
      scheduledTransactionId: `simulated-payment@${request.orderId}`,
      status: request.executeImmediately ? "EXECUTED" : "PENDING",
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
    return payment.immediate || payment.roles.size >= 1
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
