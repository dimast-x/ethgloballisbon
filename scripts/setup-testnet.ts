import {
  AccountCreateTransaction,
  Client,
  Hbar,
  KeyList,
  PrivateKey,
  TopicCreateTransaction,
} from "@hashgraph/sdk";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const operatorId = required("HEDERA_OPERATOR_ID");
const operatorKey = PrivateKey.fromString(required("HEDERA_OPERATOR_KEY"));
const client = Client.forTestnet().setOperator(operatorId, operatorKey);

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
console.log("Keep this output private and copy the values into .env.local.");
client.close();
