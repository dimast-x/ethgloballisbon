import { chmod, writeFile } from "node:fs/promises";
import {
  AccountBalanceQuery,
  AccountCreateTransaction,
  Client,
  Hbar,
  PrivateKey,
  TransferTransaction,
} from "@hashgraph/sdk";
import {
  createHederaClient,
  hederaConfigFromEnv,
  parseHederaPrivateKey,
} from "../src/adapters/hedera";
import { sha256 } from "../src/adapters/identity";
import {
  configureProgramSettlement,
  createProgramRun,
  getProgramSession,
  getTestnetReadiness,
  recordProgramDeposit,
  registerRuntimeAgentIdentity,
  runProgramCommand,
} from "../src/application/runtime";
import { fromDisplay, zeroLike } from "../src/protocol/money";
import type {
  AgentDelegation,
  ResolvedAgentIdentity,
} from "../src/protocol/types";

for (const path of [
  ".env",
  ".env.local",
  ".env.governor.local",
  ".env.roles.local",
  ".env.agent.local",
]) {
  try {
    process.loadEnvFile?.(path);
  } catch {
    // Hosted and CI environments may provide variables directly.
  }
}

const command = process.argv[2] ?? "doctor";
const governorId = required("HEDERA_GOVERNOR_ID");
const governorKey = parseHederaPrivateKey(required("HEDERA_GOVERNOR_KEY"));

if (command === "doctor") {
  const readiness = await getTestnetReadiness(true);
  const client = governorClient();
  try {
    const balance = await new AccountBalanceQuery()
      .setAccountId(governorId)
      .execute(client);
    output({
      ready: readiness.ready,
      network: "testnet",
      governorAccountId: governorId,
      governorBalanceTinybar: balance.hbars.toTinybars().toString(),
      issues: readiness.issues,
    });
    if (!readiness.ready) process.exitCode = 1;
  } finally {
    client.close();
  }
} else if (command === "roles:create") {
  output(await ensureRoleAccounts());
} else if (
  command === "bootstrap-agentic" ||
  command === "bootstrap-advanced" ||
  command === "resume-agentic" ||
  command === "resume-advanced"
) {
  const advanced =
    command === "bootstrap-advanced" || command === "resume-advanced";
  const name =
    process.argv[3]?.trim() ||
    (advanced
      ? "Yareon Advanced Approval Qualification"
      : "Yareon Agentic Qualification");
  const roles = await ensureRoleAccounts();
  const worldAgentAddress = required("WORLD_AGENT_ADDRESS");
  const category = "AI_SERVICES";
  const offerAmount = fromDisplay("0.1");
  const allocationAmount = fromDisplay("0.5");
  const programDeposit = fromDisplay("1");

  let programId: string;
  let treasuryAccountId: string | undefined;
  let depositTransactionId: string;
  if (command === "resume-agentic" || command === "resume-advanced") {
    programId = requiredArgument(3, "program ID");
    depositTransactionId = requiredArgument(4, "deposit transaction ID");
    treasuryAccountId = (await requireSession(programId)).projection.program
      ?.hedera?.treasuryAccountId;
  } else {
    const created = await createProgramRun(
      {
        name,
        description:
          advanced
            ? "World AgentKit-authenticated autonomous procurement with verifier and finance controlled Hedera settlement."
            : "World AgentKit-authenticated autonomous procurement with direct Hedera settlement.",
        policy: advanced
          ? {
              allowedCategories: [category],
              requireDeliveryEvidence: true,
              approvalRequirements: [
                { role: "DELIVERY_VERIFIER", count: 1 },
                { role: "FINANCE", count: 1 },
              ],
            }
          : undefined,
      },
      "testnet",
      governorId,
    );
    programId = created.programId;
    const activated = await configureProgramSettlement(
      programId,
      advanced
        ? {
            verifierAccountId: roles.verifierAccountId,
            financeAccountId: roles.financeAccountId,
          }
        : { verifierAccountId: "", financeAccountId: "" },
      governorId,
    );
    treasuryAccountId =
      activated.projection.program?.hedera?.treasuryAccountId;
    if (!treasuryAccountId) {
      throw new Error("Program treasury activation did not return an account.");
    }
    depositTransactionId = await depositProgramFunds(
      programId,
      treasuryAccountId,
      programDeposit.atomicAmount,
    );
    if (advanced) {
      await fundApprovalAccounts(roles.verifierAccountId, roles.financeAccountId);
    }
  }
  if (!treasuryAccountId) {
    throw new Error("Program treasury activation did not return an account.");
  }

  const credited = await recordProgramDeposit({
    programId,
    transactionId: depositTransactionId,
    amount: programDeposit,
    depositorAccountId: governorId,
    actorId: governorId,
  });
  requireConfirmed("program deposit", credited);

  const session = await requireSession(programId);
  const agentId = `agent_${programId.slice(-12)}`;
  const buyerId = `buyer_${programId.slice(-12)}`;
  const publicIdentity = {
    scheme: "world-agentkit",
    name: worldAgentAddress,
  };
  const integrityHash = sha256(
    JSON.stringify({
      programId,
      agentId,
      principalId: buyerId,
      worldAgentAddress: worldAgentAddress.toLowerCase(),
    }),
  );
  const identity: ResolvedAgentIdentity = {
    agentId,
    publicIdentity,
    organizationReference: governorId,
    executionAccountId: roles.agentAccountId,
    role: "PROCUREMENT_AGENT",
    protocolVersion: "0.2",
    delegationHash: integrityHash,
    endpoint:
      process.env.YAREON_PUBLIC_URL ??
      "http://127.0.0.1:3000/api/agents/agentkit/procure",
    resolutionHash: sha256(
      `world-agentkit:${worldAgentAddress.toLowerCase()}:${roles.agentAccountId}`,
    ),
    resolvedAt: new Date().toISOString(),
  };
  registerRuntimeAgentIdentity(identity);
  requireConfirmed(
    "agent identity",
    await runProgramCommand(programId, "testnet", {
      type: "RESOLVE_AGENT_IDENTITY",
      idempotencyKey: `${session.runId}:resolve-agent`,
      actor: adminActor(),
      identity: publicIdentity,
    }),
  );

  const zero = zeroLike(allocationAmount);
  requireConfirmed(
    "agent allocation",
    await runProgramCommand(programId, "testnet", {
      type: "ALLOCATE_BUYER",
      idempotencyKey: `${session.runId}:allocate-agent`,
      actor: adminActor(),
      allocation: {
        id: `allocation_${programId.slice(-12)}`,
        programId,
        buyerId,
        walletAccountId: roles.agentAccountId,
        purchasingStatus: "ACTIVE",
        participantType: "AGENT",
        humanVerificationRequired: true,
        totalLimit: zero,
        committed: zero,
        paid: zero,
        allowedCategories: [category],
      },
    }),
  );

  const now = new Date();
  const delegation: AgentDelegation = {
    delegationId: `delegation_${programId.slice(-12)}`,
    organizationId: governorId,
    principalId: buyerId,
    agentId,
    worldAgentAddress,
    humanVerificationRequired: true,
    allowedPrograms: [programId],
    allowedActions: ["CREATE_ORDER"],
    allowedCategories: [category],
    maxPerOrder: fromDisplay("0.2"),
    maxTotalSpend: zero,
    validFrom: now.toISOString(),
    validUntil: new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString(),
    integrityHash,
  };
  requireConfirmed(
    "agent delegation",
    await runProgramCommand(programId, "testnet", {
      type: "GRANT_AGENT_DELEGATION",
      idempotencyKey: `${session.runId}:delegate-agent`,
      actor: adminActor(),
      delegation,
    }),
  );
  requireConfirmed(
    "agent allocation funding",
    await runProgramCommand(programId, "testnet", {
      type: "UPFUND_BUYER_ALLOCATION",
      idempotencyKey: `${session.runId}:fund-agent-allocation`,
      actor: adminActor(),
      buyerId,
      amount: allocationAmount,
    }),
  );
  requireConfirmed(
    "agent delegation funding",
    await runProgramCommand(programId, "testnet", {
      type: "UPFUND_AGENT_DELEGATION",
      idempotencyKey: `${session.runId}:fund-agent-delegation`,
      actor: adminActor(),
      agentId,
      amount: allocationAmount,
    }),
  );

  const suffix = programId.slice(-12);
  const vendorId = `vendor_${suffix}`;
  const offerId = `offer_${suffix}`;
  requireConfirmed(
    "supplier and offer",
    await runProgramCommand(programId, "testnet", {
      type: "UPSERT_SUPPLIER",
      idempotencyKey: `${session.runId}:supplier`,
      actor: adminActor(),
      vendor: {
        id: vendorId,
        name: "Qualification Compute Supplier",
        settlementAccountId: roles.supplierAccountId,
        approvedCategories: [category],
        status: "APPROVED",
      },
      offer: {
        id: offerId,
        programId,
        vendorId,
        category,
        title: "Agentic compute verification",
        description:
          "Execute and return a deterministic compute verification artifact.",
        amount: offerAmount,
        deliveryDays: 1,
      },
    }),
  );

  const finalSession = await requireSession(programId);
  output({
    ready: true,
    network: "testnet",
    programId,
    runId: session.runId,
    status: finalSession.projection.program?.status,
    topicId: process.env.HEDERA_TOPIC_ID,
    treasuryAccountId,
    depositTransactionId,
    depositedTinybar: programDeposit.atomicAmount,
    governorAccountId: governorId,
    agentId,
    buyerId,
    agentExecutionAccountId: roles.agentAccountId,
    worldAgentAddress,
    allocationTinybar: allocationAmount.atomicAmount,
    delegationTotalTinybar: allocationAmount.atomicAmount,
    delegationPerOrderTinybar: delegation.maxPerOrder.atomicAmount,
    supplierAccountId: roles.supplierAccountId,
    verifierAccountId: advanced ? roles.verifierAccountId : undefined,
    financeAccountId: advanced ? roles.financeAccountId : undefined,
    settlementMode: advanced ? "SCHEDULED_2_OF_2" : "DIRECT_POLICY",
    vendorId,
    offerId,
    offerAmountTinybar: offerAmount.atomicAmount,
    eventCount: finalSession.projection.timeline.length,
  });
} else if (command === "inspect") {
  const programId = process.argv[3];
  if (!programId) throw new Error("Pass a program ID.");
  const session = await requireSession(programId);
  output({
    programId,
    program: session.projection.program,
    allocations: session.projection.allocations,
    delegations: session.projection.agentDelegations,
    suppliers: session.projection.vendors,
    offers: session.projection.offers,
    eventCount: session.projection.timeline.length,
  });
} else {
  throw new Error(`Unknown governor command: ${command}`);
}

setTimeout(() => process.exit(process.exitCode ?? 0), 0);

function governorClient(): Client {
  return Client.forTestnet().setOperator(governorId, governorKey);
}

function adminActor() {
  return {
    actorId: governorId,
    role: "ADMIN",
    actorType: "HUMAN" as const,
    hederaAccountId: governorId,
  };
}

async function depositProgramFunds(
  programId: string,
  treasuryAccountId: string,
  atomicAmount: string,
): Promise<string> {
  const client = governorClient();
  try {
    const response = await new TransferTransaction()
      .addHbarTransfer(governorId, Hbar.fromTinybars(`-${atomicAmount}`))
      .addHbarTransfer(
        treasuryAccountId,
        Hbar.fromTinybars(atomicAmount),
      )
      .setTransactionMemo(`yareon:deposit:${programId}`)
      .execute(client);
    const receipt = await response.getReceipt(client);
    if (receipt.status.toString() !== "SUCCESS") {
      throw new Error(`Program deposit failed with ${receipt.status}.`);
    }
    return response.transactionId.toString();
  } finally {
    client.close();
  }
}

async function fundApprovalAccounts(
  verifierAccountId: string,
  financeAccountId: string,
): Promise<void> {
  const feeBalance = fromDisplay("0.2").atomicAmount;
  const client = governorClient();
  try {
    const response = await new TransferTransaction()
      .addHbarTransfer(
        governorId,
        Hbar.fromTinybars(`-${BigInt(feeBalance) * 2n}`),
      )
      .addHbarTransfer(verifierAccountId, Hbar.fromTinybars(feeBalance))
      .addHbarTransfer(financeAccountId, Hbar.fromTinybars(feeBalance))
      .setTransactionMemo("yareon:approval-fees")
      .execute(client);
    const receipt = await response.getReceipt(client);
    if (receipt.status.toString() !== "SUCCESS") {
      throw new Error(`Approver funding failed with ${receipt.status}.`);
    }
  } finally {
    client.close();
  }
}

async function ensureRoleAccounts(): Promise<{
  created: boolean;
  agentAccountId: string;
  supplierAccountId: string;
  verifierAccountId: string;
  financeAccountId: string;
  creationTransactions: string[];
}> {
  const existing = {
    agentAccountId: process.env.HEDERA_AGENT_EXECUTION_ID,
    agentKey: process.env.HEDERA_AGENT_EXECUTION_KEY,
    supplierAccountId: process.env.HEDERA_SUPPLIER_ID,
    supplierKey: process.env.HEDERA_SUPPLIER_KEY,
    verifierAccountId: process.env.HEDERA_VERIFIER_ID,
    verifierKey: process.env.HEDERA_VERIFIER_KEY,
    financeAccountId: process.env.HEDERA_FINANCE_ID,
    financeKey: process.env.HEDERA_FINANCE_KEY,
  };
  if (Object.values(existing).every(Boolean)) {
    return {
      created: false,
      agentAccountId: existing.agentAccountId!,
      supplierAccountId: existing.supplierAccountId!,
      verifierAccountId: existing.verifierAccountId!,
      financeAccountId: existing.financeAccountId!,
      creationTransactions: [],
    };
  }

  const client = createHederaClient(hederaConfigFromEnv());
  try {
    const created = [];
    for (const role of ["agent", "supplier", "verifier", "finance"] as const) {
      const privateKey = PrivateKey.generateED25519();
      const response = await new AccountCreateTransaction()
        .setKey(privateKey.publicKey)
        .setInitialBalance(new Hbar(0))
        .execute(client);
      const receipt = await response.getReceipt(client);
      const accountId = receipt.accountId?.toString();
      if (!accountId) throw new Error(`Hedera did not create ${role} account.`);
      created.push({
        role,
        accountId,
        privateKey: privateKey.toStringDer(),
        transactionId: response.transactionId.toString(),
      });
    }

    const byRole = Object.fromEntries(
      created.map((entry) => [entry.role, entry]),
    ) as Record<(typeof created)[number]["role"], (typeof created)[number]>;
    await writeFile(
      ".env.roles.local",
      [
        `HEDERA_AGENT_EXECUTION_ID=${byRole.agent.accountId}`,
        `HEDERA_AGENT_EXECUTION_KEY=${byRole.agent.privateKey}`,
        `HEDERA_SUPPLIER_ID=${byRole.supplier.accountId}`,
        `HEDERA_SUPPLIER_KEY=${byRole.supplier.privateKey}`,
        `HEDERA_VERIFIER_ID=${byRole.verifier.accountId}`,
        `HEDERA_VERIFIER_KEY=${byRole.verifier.privateKey}`,
        `HEDERA_FINANCE_ID=${byRole.finance.accountId}`,
        `HEDERA_FINANCE_KEY=${byRole.finance.privateKey}`,
        "",
      ].join("\n"),
      { encoding: "utf8", mode: 0o600 },
    );
    await chmod(".env.roles.local", 0o600);
    return {
      created: true,
      agentAccountId: byRole.agent.accountId,
      supplierAccountId: byRole.supplier.accountId,
      verifierAccountId: byRole.verifier.accountId,
      financeAccountId: byRole.finance.accountId,
      creationTransactions: created.map((entry) => entry.transactionId),
    };
  } finally {
    client.close();
  }
}

async function requireSession(programId: string) {
  const session = await getProgramSession(programId, "testnet");
  if (!session) throw new Error(`Program ${programId} was not found.`);
  return session;
}

function requireConfirmed(
  label: string,
  result: Awaited<ReturnType<typeof runProgramCommand>>,
): void {
  if (result.status === "FAILED") {
    throw new Error(
      `${label} failed: ${result.error?.code ?? "UNKNOWN"} ${result.error?.message ?? ""}`,
    );
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function requiredArgument(index: number, label: string): string {
  const value = process.argv[index];
  if (!value) throw new Error(`Pass the ${label}.`);
  return value;
}

function output(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}
