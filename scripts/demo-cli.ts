import type { ExecutionMode, ProtocolCommand } from "../src/application/commands";

try {
  process.loadEnvFile?.(".env.local");
} catch {
  // Simulation does not require a local environment file.
}

const {
  createUniversityRun,
  getProgramSession,
  getTestnetReadiness,
  runProgramCommand,
} = await import("../src/application/runtime");

const [operation = "run", argument, modeArgument] = process.argv.slice(2);

if (operation === "validate") {
  const readiness = await getTestnetReadiness(true);
  console.log(JSON.stringify(readiness, null, 2));
  process.exitCode = readiness.ready ? 0 : 1;
} else if (operation === "audit") {
  if (!argument) throw new Error("Usage: demo:cli audit <programId> [mode]");
  const mode = parseMode(modeArgument);
  const session = await getProgramSession(argument, mode);
  if (!session) throw new Error(`Program ${argument} was not found`);
  printSession(session);
} else {
  const mode = parseMode(argument);
  let session = await createUniversityRun(mode);
  const selectedOffer = session.projection.offers[session.selectedOfferId];
  const commands: ProtocolCommand[] = [
    {
      type: "TEST_PURCHASE_POLICY",
      idempotencyKey: `${session.runId}:reject-over-limit`,
      actor: human(session.buyerId, "BUYER"),
      buyerId: session.buyerId,
      vendorId: selectedOffer.vendorId,
      category: selectedOffer.category,
      amount: { ...selectedOffer.amount, atomicAmount: "550000000" },
    },
    {
      type: "CREATE_ORDER",
      idempotencyKey: `${session.runId}:create-order`,
      actor: human(session.buyerId, "BUYER"),
      orderId: session.orderId,
      buyerId: session.buyerId,
      vendorId: selectedOffer.vendorId,
      offerId: selectedOffer.id,
      category: selectedOffer.category,
      amount: selectedOffer.amount,
    },
    {
      type: "ACCEPT_ORDER",
      idempotencyKey: `${session.runId}:accept-order`,
      actor: human(selectedOffer.vendorId, "VENDOR"),
      orderId: session.orderId,
    },
    {
      type: "SUBMIT_DELIVERY",
      idempotencyKey: `${session.runId}:submit-delivery`,
      actor: human(selectedOffer.vendorId, "VENDOR"),
      orderId: session.orderId,
      evidence: {
        hash: `sha256:${"a".repeat(64)}`,
        mimeType: "application/pdf",
        size: 1024,
        submittedBy: selectedOffer.vendorId,
        submittedAt: new Date().toISOString(),
      },
    },
    {
      type: "APPROVE_DELIVERY",
      idempotencyKey: `${session.runId}:approve-delivery`,
      actor: human("cli_verifier", "DELIVERY_VERIFIER"),
      orderId: session.orderId,
      approvalReference: "trusted-cli:demo-relay",
    },
    {
      type: "APPROVE_FINANCE",
      idempotencyKey: `${session.runId}:approve-finance`,
      actor: human("cli_finance", "FINANCE"),
      orderId: session.orderId,
      approvalReference: "trusted-cli:demo-relay",
    },
  ];

  for (const command of commands) {
    const result = await runProgramCommand(
      session.programId,
      mode,
      command,
    );
    if (result.status === "FAILED") {
      throw new Error(`${result.error?.code}: ${result.error?.message}`);
    }
    session = {
      ...session,
      projection: result.projection ?? session.projection,
    };
    console.log(`${command.type}: ${result.status}`);
  }
  printSession(session);
}

function parseMode(value?: string): ExecutionMode {
  return value === "testnet" ? "testnet" : "simulation";
}

function human(actorId: string, role: string) {
  return { actorId, role, actorType: "HUMAN" as const };
}

function printSession(
  session: Awaited<ReturnType<typeof createUniversityRun>>,
): void {
  console.table(
    session.projection.timeline.map((event) => ({
      sequence: event.ledgerReference?.sequenceNumber,
      type: event.eventType,
      actor: event.actor.role,
      submitted: event.occurredAt,
      consensus: event.ledgerReference?.consensusTimestamp,
    })),
  );
  console.log(
    JSON.stringify(
      {
        mode: session.mode,
        runId: session.runId,
        programId: session.programId,
        program: session.projection.program?.name,
        order: Object.values(session.projection.orders)[0],
        rejectedDecisions: session.projection.rejectedDecisions,
      },
      null,
      2,
    ),
  );
}
