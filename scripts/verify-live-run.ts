import assert from "node:assert/strict";
import { ScheduleInfoQuery } from "@hashgraph/sdk";
import {
  createHederaClient,
  HederaEventStore,
  hederaTransactionIdForMirror,
  hederaConfigFromEnv,
} from "../src/adapters/hedera";
import { reduceProtocolEvents } from "../src/protocol/reducer";

for (const path of [".env.local", ".env"]) {
  try {
    process.loadEnvFile?.(path);
  } catch {
    // Hosted environments may provide the same variables directly.
  }
}

const programId = process.argv[2];
if (!programId) {
  throw new Error("Pass a program ID.");
}

const config = hederaConfigFromEnv();
const eventStore = new HederaEventStore(config);
const events = await eventStore.read(programId);
eventStore.close();
assert(events.length > 0, "No HCS events were found for this program.");
assert(
  events.every(
    (event) =>
      event.ledgerReference?.topicId === config.topicId &&
      typeof event.ledgerReference.sequenceNumber === "number",
  ),
  "Every event must have a sequence number from the configured HCS topic.",
);
for (let index = 1; index < events.length; index += 1) {
  assert(
    events[index - 1].ledgerReference!.sequenceNumber! <
      events[index].ledgerReference!.sequenceNumber!,
    "HCS sequence numbers must be strictly increasing.",
  );
}

const projection = reduceProtocolEvents(events);
const program = projection.program;
assert(program, "The program projection is absent.");
const treasuryAccountId = program.hedera?.treasuryAccountId;
assert(treasuryAccountId, "The program has no Hedera treasury account.");
const order = Object.values(projection.orders).find(
  (candidate) => candidate.status === "PAYMENT_EXECUTED",
);
assert(order, "A completed order was not reconstructed.");
const vendorAccountId = order.supplierSettlementAccountId;
assert(vendorAccountId, "The completed order has no vendor settlement account.");
assert(order.scheduleId, "The completed order has no schedule ID.");
assert(order.paymentTransactionId, "The completed order has no payment transaction.");
assert.equal(
  projection.timeline.filter(
    (event) =>
      event.eventType === "PAYMENT_EXECUTED" &&
      event.orderId === order.id,
  )
    .length,
  1,
  "Settlement must be recorded exactly once for the selected order.",
);
assert(
  projection.timeline.some(
    (event) => event.eventType === "AGENTKIT_ACCESS_VERIFIED",
  ),
  "A World AgentKit access-verification event is absent.",
);
assert(
  projection.agentAuthorizationDecisions.some(
    (decision) => decision.code === "AGENT_ORDER_LIMIT_EXCEEDED",
  ),
  "The delegation-limit rejection is absent.",
);
const attestation = Object.values(projection.humanBacking).find(
  (candidate) => candidate.scheme === "world-agentkit",
);
assert(attestation, "A World human-backing attestation is absent.");
assert.equal(
  attestation.scheme,
  "world-agentkit",
  "The human-backing attestation was not produced by World AgentKit.",
);
assert.match(
  attestation.agentAddress ?? "",
  /^0x[a-fA-F0-9]{40}$/,
  "The AgentKit EVM address is absent.",
);
assert.match(
  attestation.verificationReference,
  /^sha256:[a-f0-9]{64}$/,
  "World verification must be stored only as a SHA-256 reference.",
);
assert(
  !/humanId|nullifier|responses|merkle_root/i.test(
    JSON.stringify(projection.timeline),
  ),
  "Private World identity material must not be present in HCS events.",
);
const requiredApprovalRoles = program.policy.approvalRequirements.map(
  (requirement) => requirement.role,
);
const expectedApprovalAccounts: Record<string, string | undefined> = {
  DELIVERY_VERIFIER: program.hedera?.verifierAccountId,
  FINANCE: program.hedera?.financeAccountId,
};
for (const role of requiredApprovalRoles) {
  const expectedAccountId = expectedApprovalAccounts[role];
  assert(expectedAccountId, `${role} has no configured Hedera account.`);
  assert(
    order.approvals.some(
      (approval) =>
        approval.role === role &&
        /^hedera-(?:walletconnect|cli):/.test(approval.reference) &&
        approval.hederaAccountId === expectedAccountId &&
        /^\d+\.\d+\.\d+@\d+\.\d+$/.test(approval.transactionId ?? ""),
    ),
    `${role} direct wallet approval receipt is absent.`,
  );
}
if (
  requiredApprovalRoles.includes("DELIVERY_VERIFIER") &&
  requiredApprovalRoles.includes("FINANCE")
) {
  assert.notEqual(
    expectedApprovalAccounts.DELIVERY_VERIFIER,
    expectedApprovalAccounts.FINANCE,
    "Delivery verifier and finance must be distinct Hedera accounts.",
  );
}

const isDirectPayment = order.scheduleId.startsWith("direct:");
if (isDirectPayment) {
  assert.equal(
    order.scheduleId,
    `direct:${order.paymentTransactionId}`,
    "The direct-payment reference does not match the executed transaction.",
  );
} else {
  const client = createHederaClient(config);
  try {
    const schedule = await new ScheduleInfoQuery()
      .setScheduleId(order.scheduleId)
      .execute(client);
    assert(schedule.executed, "The scheduled payment has not executed.");
    assert.equal(
      schedule.scheduledTransactionId?.toString(),
      order.paymentTransactionId,
      "The recorded payment transaction does not match the executed schedule.",
    );
  } finally {
    client.close();
  }
}

const mirrorNodeUrl =
  config.mirrorNodeUrl ?? "https://testnet.mirrornode.hedera.com";
const transactionResponse = await fetch(
  `${mirrorNodeUrl}/api/v1/transactions/${encodeURIComponent(
    hederaTransactionIdForMirror(order.paymentTransactionId),
  )}`,
);
assert(
  transactionResponse.ok,
  `Mirror Node could not read the payment transaction (${transactionResponse.status}).`,
);
const transactionBody = (await transactionResponse.json()) as {
  transactions?: Array<{
    result?: string;
    consensus_timestamp?: string;
    transfers?: Array<{ account: string; amount: number }>;
  }>;
};
const expectedAmount = Number(order.amount.atomicAmount);
const successful = transactionBody.transactions?.find(
  (transaction) =>
    transaction.result === "SUCCESS" &&
    transaction.transfers?.some(
      (transfer) =>
        transfer.account === vendorAccountId &&
        transfer.amount === expectedAmount,
    ),
);
assert(successful, "Mirror Node did not return a successful payment transaction.");
assert(
  successful.consensus_timestamp,
  "The payment transaction has no Mirror consensus timestamp.",
);
assert(
  successful.transfers?.some(
    (transfer) =>
      transfer.account === treasuryAccountId &&
      transfer.amount === -expectedAmount,
  ),
  "The exact treasury debit is absent from the payment transaction.",
);
assert(
  successful.transfers?.some(
    (transfer) =>
      transfer.account === vendorAccountId &&
      transfer.amount === expectedAmount,
  ),
  "The exact vendor credit is absent from the payment transaction.",
);

async function mirrorBalance(
  accountId: string,
  timestamp?: string,
): Promise<number> {
  const url = new URL("/api/v1/balances", mirrorNodeUrl);
  url.searchParams.set("account.id", accountId);
  if (timestamp) url.searchParams.set("timestamp", timestamp);
  const response = await fetch(url);
  assert(
    response.ok,
    `Mirror Node could not read ${accountId} at ${timestamp ?? "latest"}.`,
  );
  const body = (await response.json()) as {
    balances?: Array<{ account?: string; balance?: number }>;
  };
  const balance = body.balances?.find(
    (candidate) => candidate.account === accountId,
  )?.balance;
  assert.equal(
    typeof balance,
    "number",
    `Mirror Node returned no HBAR balance for ${accountId}.`,
  );
  return balance!;
}

const [vendorCurrent, treasuryCurrent] = await Promise.all([
  mirrorBalance(vendorAccountId),
  mirrorBalance(treasuryAccountId),
]);

console.log(
  JSON.stringify(
    {
      verified: true,
      programId,
      topicId: config.topicId,
      eventCount: events.length,
      scheduleId: order.scheduleId,
      paymentMode: isDirectPayment ? "DIRECT_AGENT_PAYMENT" : "SCHEDULED_PAYMENT",
      paymentTransactionId: order.paymentTransactionId,
      amount: order.amount,
      worldReference: attestation.verificationReference,
      approvals: order.approvals,
      exactTransferVerified: true,
      balances: {
        vendorCurrent,
        treasuryCurrent,
      },
      explorer: {
        topic: `https://hashscan.io/testnet/topic/${encodeURIComponent(config.topicId)}`,
        schedule: isDirectPayment
          ? undefined
          : `https://hashscan.io/testnet/schedule/${encodeURIComponent(order.scheduleId)}`,
        payment: `https://hashscan.io/testnet/transaction/${encodeURIComponent(order.paymentTransactionId)}`,
      },
    },
    null,
    2,
  ),
);
