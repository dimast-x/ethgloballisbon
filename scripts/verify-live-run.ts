import assert from "node:assert/strict";
import { ScheduleInfoQuery } from "@hashgraph/sdk";
import {
  createHederaClient,
  HederaEventStore,
  hederaConfigFromEnv,
} from "../src/adapters/hedera";
import { reduceProtocolEvents } from "../src/protocol/reducer";

try {
  process.loadEnvFile?.(".env.local");
} catch {
  // Hosted or invoking environments may provide the same variables directly.
}

const programId =
  process.argv[2] ?? process.env.YAREON_SHOWCASE_PROGRAM_ID;
if (!programId) {
  throw new Error(
    "Pass a program ID or configure YAREON_SHOWCASE_PROGRAM_ID.",
  );
}

const config = hederaConfigFromEnv();
const events = await new HederaEventStore(config).read(programId);
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
const treasuryAccountId = projection.program?.hedera?.treasuryAccountId;
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
  projection.timeline.filter((event) => event.eventType === "PAYMENT_EXECUTED")
    .length,
  1,
  "Settlement must be recorded exactly once.",
);
assert(
  projection.agentAuthorizationDecisions.some(
    (decision) => decision.code === "HUMAN_BACKING_REQUIRED",
  ),
  "The missing-human-backing rejection is absent.",
);
assert(
  projection.agentAuthorizationDecisions.some(
    (decision) => decision.code === "AGENT_ORDER_LIMIT_EXCEEDED",
  ),
  "The delegation-limit rejection is absent.",
);
const attestation = Object.values(projection.humanBacking)[0];
assert(attestation, "A World human-backing attestation is absent.");
assert.match(
  attestation.verificationReference,
  /^sha256:[a-f0-9]{64}$/,
  "World verification must be stored only as a SHA-256 reference.",
);
assert(
  !/nullifier|responses|merkle_root/i.test(JSON.stringify(projection.timeline)),
  "Raw World proof material must not be present in HCS events.",
);
for (const role of ["DELIVERY_VERIFIER", "FINANCE"]) {
  assert(
    order.approvals.some(
      (approval) =>
        approval.role === role &&
        approval.reference.startsWith("hedera-walletconnect:") &&
        /^\d+\.\d+\.\d+$/.test(approval.hederaAccountId ?? "") &&
        /^\d+\.\d+\.\d+@\d+\.\d+$/.test(approval.transactionId ?? ""),
    ),
    `${role} direct wallet approval receipt is absent.`,
  );
}

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

const mirrorNodeUrl =
  config.mirrorNodeUrl ?? "https://testnet.mirrornode.hedera.com";
const transactionResponse = await fetch(
  `${mirrorNodeUrl}/api/v1/transactions/${encodeURIComponent(order.paymentTransactionId)}`,
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
const successful = transactionBody.transactions?.find(
  (transaction) => transaction.result === "SUCCESS",
);
assert(successful, "Mirror Node did not return a successful payment transaction.");
assert(
  successful.consensus_timestamp,
  "The payment transaction has no Mirror consensus timestamp.",
);
const expectedAmount = Number(order.amount.atomicAmount);
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
  const url = new URL(
    `/api/v1/accounts/${encodeURIComponent(accountId)}`,
    mirrorNodeUrl,
  );
  url.searchParams.set("transactions", "false");
  if (timestamp) url.searchParams.set("timestamp", timestamp);
  const response = await fetch(url);
  assert(
    response.ok,
    `Mirror Node could not read ${accountId} at ${timestamp ?? "latest"}.`,
  );
  const body = (await response.json()) as {
    balance?: { balance?: number };
  };
  assert.equal(
    typeof body.balance?.balance,
    "number",
    `Mirror Node returned no HBAR balance for ${accountId}.`,
  );
  return body.balance!.balance!;
}

const [vendorBefore, vendorAfter, vendorCurrent, treasuryCurrent] =
  await Promise.all([
    mirrorBalance(
      vendorAccountId,
      `lt:${successful.consensus_timestamp}`,
    ),
    mirrorBalance(
      vendorAccountId,
      `lte:${successful.consensus_timestamp}`,
    ),
    mirrorBalance(vendorAccountId),
    mirrorBalance(treasuryAccountId),
  ]);
assert.equal(
  vendorAfter - vendorBefore,
  expectedAmount,
  "The vendor's historical Mirror balance did not increase by the exact order amount.",
);

console.log(
  JSON.stringify(
    {
      verified: true,
      programId,
      topicId: config.topicId,
      eventCount: events.length,
      scheduleId: order.scheduleId,
      paymentTransactionId: order.paymentTransactionId,
      amount: order.amount,
      worldReference: attestation.verificationReference,
      approvals: order.approvals,
      balances: {
        vendorBefore,
        vendorAfter,
        vendorIncrease: vendorAfter - vendorBefore,
        vendorCurrent,
        treasuryCurrent,
      },
    },
    null,
    2,
  ),
);
