import {
  Client,
  PrivateKey,
  ScheduleSignTransaction,
} from "@hashgraph/sdk";
import { createHash } from "node:crypto";
import {
  getProgramSession,
  runProgramCommand,
} from "../src/application/runtime";

for (const path of [".env", ".env.local", ".env.roles.local"]) {
  try {
    process.loadEnvFile?.(path);
  } catch {
    // Hosted and CI environments may provide variables directly.
  }
}

const action = process.argv[2];
const programId = process.argv[3];
const orderId = process.argv[4];
if (!action || !programId || !orderId) {
  throw new Error(
    "Usage: role:cli <accept|deliver|verify|finance|inspect> <program-id> <order-id>",
  );
}

const session = await getProgramSession(programId, "testnet");
if (!session) throw new Error(`Program ${programId} was not found.`);
const order = session.projection.orders[orderId];
if (!order) throw new Error(`Order ${orderId} was not found.`);

let result: unknown;
if (action === "accept") {
  result = await runProgramCommand(programId, "testnet", {
    type: "ACCEPT_ORDER",
    idempotencyKey: `${session.runId}:supplier:accept:${orderId}`,
    actor: roleActor("supplier"),
    orderId,
  });
} else if (action === "deliver") {
  const artifact = JSON.stringify({
    programId,
    orderId,
    result: "deterministic-compute-ok",
    supplierAccountId: required("HEDERA_SUPPLIER_ID"),
  });
  result = await runProgramCommand(programId, "testnet", {
    type: "SUBMIT_DELIVERY",
    idempotencyKey: `${session.runId}:supplier:deliver:${orderId}`,
    actor: roleActor("supplier"),
    orderId,
    evidence: {
      hash: `sha256:${createHash("sha256").update(artifact).digest("hex")}`,
      mimeType: "application/json",
      size: Buffer.byteLength(artifact),
      submittedBy: required("HEDERA_SUPPLIER_ID"),
      submittedAt: new Date().toISOString(),
    },
  });
} else if (action === "verify" || action === "finance") {
  if (!order.scheduleId) {
    throw new Error("The order does not have a Hedera schedule yet.");
  }
  const role = action === "verify" ? "verifier" : "finance";
  const accountId = required(
    role === "verifier" ? "HEDERA_VERIFIER_ID" : "HEDERA_FINANCE_ID",
  );
  const existingTransactionId = process.argv[5];
  const receipt = existingTransactionId
    ? { accountId, transactionId: existingTransactionId }
    : await signSchedule(
        order.scheduleId,
        accountId,
        required(
          role === "verifier" ? "HEDERA_VERIFIER_KEY" : "HEDERA_FINANCE_KEY",
        ),
      );
  result = await runProgramCommand(programId, "testnet", {
    type: role === "verifier" ? "APPROVE_DELIVERY" : "APPROVE_FINANCE",
    idempotencyKey: `${session.runId}:${role}:approve:${orderId}`,
    actor: roleActor(role),
    orderId,
    approvalReference: `hedera-cli:${receipt.accountId}:${receipt.transactionId}`,
    approvalTransactionId: receipt.transactionId,
  });
} else if (action === "inspect") {
  result = {
    programId,
    order: session.projection.orders[orderId],
    program: session.projection.program,
  };
} else {
  throw new Error(`Unknown role action: ${action}`);
}

console.log(JSON.stringify(result, null, 2));
setTimeout(() => process.exit(process.exitCode ?? 0), 0);

function roleActor(role: "supplier" | "verifier" | "finance") {
  const accountId = required(
    role === "supplier"
      ? "HEDERA_SUPPLIER_ID"
      : role === "verifier"
        ? "HEDERA_VERIFIER_ID"
        : "HEDERA_FINANCE_ID",
  );
  return {
    actorId: `hedera:${accountId}`,
    role:
      role === "supplier"
        ? "SUPPLIER"
        : role === "verifier"
          ? "DELIVERY_VERIFIER"
          : "FINANCE",
    actorType: "HUMAN" as const,
    hederaAccountId: accountId,
  };
}

async function signSchedule(
  scheduleId: string,
  accountId: string,
  privateKey: string,
): Promise<{ accountId: string; transactionId: string }> {
  const client = Client.forTestnet().setOperator(
    accountId,
    parsePrivateKey(privateKey),
  );
  try {
    const response = await new ScheduleSignTransaction()
      .setScheduleId(scheduleId)
      .execute(client);
    const receipt = await response.getReceipt(client);
    if (receipt.status.toString() !== "SUCCESS") {
      throw new Error(`Schedule signature failed with ${receipt.status}.`);
    }
    return { accountId, transactionId: response.transactionId.toString() };
  } finally {
    client.close();
  }
}

function parsePrivateKey(value: string): PrivateKey {
  const raw = value.startsWith("0x") ? value.slice(2) : value;
  return /^[0-9a-fA-F]{64}$/.test(raw)
    ? PrivateKey.fromStringECDSA(raw)
    : PrivateKey.fromString(value);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}
