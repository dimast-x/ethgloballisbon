import { HederaEventStore, hederaConfigFromEnv } from "../src/adapters/hedera";
import { reduceProtocolEvents } from "../src/protocol/reducer";

for (const path of [".env.local", ".env"]) {
  try {
    process.loadEnvFile?.(path);
  } catch {
    // Hosted environments may provide the same variables directly.
  }
}

const programId = process.argv[2];
const network = process.argv[3] ?? "testnet";
if (!programId) {
  throw new Error("Usage: npm run audit:cli -- <programId> [testnet]");
}
if (network !== "testnet") {
  throw new Error("The public Yareon product supports Hedera testnet only.");
}

const config = hederaConfigFromEnv();
const eventStore = new HederaEventStore(config);
const events = await eventStore.read(programId);
eventStore.close();
if (events.length === 0) {
  throw new Error(`No HCS events were found for ${programId}.`);
}
const projection = reduceProtocolEvents(events);
const orders = Object.values(projection.orders).map((order) => ({
  id: order.id,
  status: order.status,
  amount: order.amount,
  supplierSettlementAccountId: order.supplierSettlementAccountId,
  scheduleId: order.scheduleId,
  paymentTransactionId: order.paymentTransactionId,
  approvals: order.approvals,
  explorer: {
    schedule:
      order.scheduleId && !order.scheduleId.startsWith("direct:")
        ? `https://hashscan.io/testnet/schedule/${encodeURIComponent(order.scheduleId)}`
        : undefined,
    payment: order.paymentTransactionId
      ? `https://hashscan.io/testnet/transaction/${encodeURIComponent(order.paymentTransactionId)}`
      : undefined,
  },
}));

console.log(
  JSON.stringify(
    {
      network,
      source: "hedera-mirror-node",
      programId,
      topicId: config.topicId,
      treasuryAccountId: projection.program?.hedera?.treasuryAccountId,
      eventCount: events.length,
      firstSequenceNumber: events.at(0)?.ledgerReference?.sequenceNumber,
      lastSequenceNumber: events.at(-1)?.ledgerReference?.sequenceNumber,
      topicExplorerUrl: `https://hashscan.io/testnet/topic/${encodeURIComponent(config.topicId)}`,
      orders,
      events,
    },
    null,
    2,
  ),
);
