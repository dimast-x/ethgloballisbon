import {
  AccountCreateTransaction,
  AccountInfoQuery,
  Client,
  Hbar,
  KeyList,
  PrivateKey,
  TopicCreateTransaction,
  TopicInfoQuery,
} from "@hashgraph/sdk";

try {
  process.loadEnvFile?.(".env.local");
} catch {
  // The operator variables may be supplied by the invoking environment.
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const operatorId = required("HEDERA_OPERATOR_ID");
const operatorKey = PrivateKey.fromString(required("HEDERA_OPERATOR_KEY"));
const client = Client.forTestnet().setOperator(operatorId, operatorKey);

const existing = {
  topicId: process.env.HEDERA_TOPIC_ID,
  treasuryAccountId: process.env.HEDERA_TREASURY_ACCOUNT_ID,
  vendorAccountId: process.env.HEDERA_VENDOR_ACCOUNT_ID,
  verifierRelayPrivateKey: process.env.HEDERA_VERIFIER_RELAY_KEY,
  financeRelayPrivateKey: process.env.HEDERA_FINANCE_RELAY_KEY,
};

if (Object.values(existing).every(Boolean)) {
  const verifier = PrivateKey.fromString(existing.verifierRelayPrivateKey!);
  const finance = PrivateKey.fromString(existing.financeRelayPrivateKey!);
  const [topic, treasury] = await Promise.all([
    new TopicInfoQuery().setTopicId(existing.topicId!).execute(client),
    new AccountInfoQuery()
      .setAccountId(existing.treasuryAccountId!)
      .execute(client),
  ]);
  const key = treasury.key;
  const validThreshold =
    key instanceof KeyList &&
    key.threshold === 2 &&
    [verifier.publicKey, finance.publicKey].every((relay) =>
      key.toArray().some((item) => item.toString() === relay.toString()),
    );
  if (!topic.topicId || !validThreshold) {
    throw new Error(
      "Existing infrastructure failed topic or treasury threshold validation.",
    );
  }
  console.log(
    JSON.stringify(
      {
        reused: true,
        network: "testnet",
        topicId: existing.topicId,
        treasuryAccountId: existing.treasuryAccountId,
        vendorAccountId: existing.vendorAccountId,
      },
      null,
      2,
    ),
  );
  client.close();
  process.exit(0);
}

const verifierRelay = PrivateKey.generateECDSA();
const financeRelay = PrivateKey.generateECDSA();
const treasuryKey = new KeyList(
  [verifierRelay.publicKey, financeRelay.publicKey],
  2,
);
const vendorKey = PrivateKey.generateECDSA();

async function createAccount(key: KeyList | PrivateKey, balance: Hbar) {
  const response = await new AccountCreateTransaction()
    .setKey(key instanceof PrivateKey ? key.publicKey : key)
    .setInitialBalance(balance)
    .execute(client);
  const receipt = await response.getReceipt(client);
  if (!receipt.accountId) throw new Error("Account creation returned no ID");
  return receipt.accountId.toString();
}

const treasuryAccountId = await createAccount(treasuryKey, new Hbar(25));
const vendorAccountId = await createAccount(vendorKey, new Hbar(1));
const topicResponse = await new TopicCreateTransaction()
  .setTopicMemo("openprocure:protocol-v0")
  .execute(client);
const topicReceipt = await topicResponse.getReceipt(client);
if (!topicReceipt.topicId) throw new Error("Topic creation returned no ID");

console.log(
  JSON.stringify(
    {
      network: "testnet",
      topicId: topicReceipt.topicId.toString(),
      treasuryAccountId,
      vendorAccountId,
      vendorPrivateKey: vendorKey.toString(),
      verifierRelayPrivateKey: verifierRelay.toString(),
      financeRelayPrivateKey: financeRelay.toString(),
    },
    null,
    2,
  ),
);
console.log(
  "Provisioned once. Keep this output private and copy the values into .env.local.",
);
client.close();
