import {
  Client,
  TopicCreateTransaction,
  TopicInfoQuery,
} from "@hashgraph/sdk";
import { parseHederaPrivateKey } from "../src/adapters/hedera";

for (const path of [".env.local", ".env"]) {
  try {
    process.loadEnvFile?.(path);
    break;
  } catch {
    // Continue to the next local environment file.
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const operatorId = required("HEDERA_OPERATOR_ID");
const operatorKey = parseHederaPrivateKey(required("HEDERA_OPERATOR_KEY"));
const client = Client.forTestnet().setOperator(operatorId, operatorKey);

try {
  const existingTopicId = process.env.HEDERA_TOPIC_ID;
  if (existingTopicId) {
    const topic = await new TopicInfoQuery()
      .setTopicId(existingTopicId)
      .execute(client);
    if (!topic.topicId) {
      throw new Error("The configured shared event topic could not be read.");
    }
    console.log(
      JSON.stringify({
        reused: true,
        network: "testnet",
        topicId: topic.topicId.toString(),
      }),
    );
  } else {
    const response = await new TopicCreateTransaction()
      .setTopicMemo("yareon:shared-program-events:v0.2")
      .execute(client);
    const receipt = await response.getReceipt(client);
    if (!receipt.topicId) {
      throw new Error("Hedera did not return a topic ID.");
    }
    console.log(
      JSON.stringify({
        reused: false,
        network: "testnet",
        topicId: receipt.topicId.toString(),
      }),
    );
  }
} finally {
  client.close();
}
