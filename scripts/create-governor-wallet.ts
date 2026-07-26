import { chmod, writeFile } from "node:fs/promises";
import {
  AccountCreateTransaction,
  Hbar,
  PrivateKey,
} from "@hashgraph/sdk";
import {
  createHederaClient,
  hederaConfigFromEnv,
} from "../src/adapters/hedera";

for (const path of [".env", ".env.local", ".env.governor.local"]) {
  try {
    process.loadEnvFile?.(path);
  } catch {
    // Hosted environments may provide variables directly.
  }
}

const existingId = process.env.HEDERA_GOVERNOR_ID;
const existingKey = process.env.HEDERA_GOVERNOR_KEY;
if (existingId && existingKey) {
  console.log(
    JSON.stringify(
      {
        created: false,
        network: "testnet",
        governorAccountId: existingId,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const config = hederaConfigFromEnv();
if ((process.env.HEDERA_NETWORK ?? "testnet") !== "testnet") {
  throw new Error("Governor wallet creation is restricted to Hedera testnet.");
}

const client = createHederaClient(config);
try {
  const privateKey = PrivateKey.generateED25519();
  const response = await new AccountCreateTransaction()
    .setKey(privateKey.publicKey)
    .setInitialBalance(new Hbar(0))
    .execute(client);
  const receipt = await response.getReceipt(client);
  const accountId = receipt.accountId?.toString();
  if (!accountId) throw new Error("Hedera did not return the new account ID.");

  const path = ".env.governor.local";
  await writeFile(
    path,
    [
      `HEDERA_GOVERNOR_ID=${accountId}`,
      `HEDERA_GOVERNOR_KEY=${privateKey.toStringDer()}`,
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o600 },
  );
  await chmod(path, 0o600);

  console.log(
    JSON.stringify(
      {
        created: true,
        network: "testnet",
        governorAccountId: accountId,
        creationTransactionId: response.transactionId.toString(),
      },
      null,
      2,
    ),
  );
} finally {
  client.close();
}
