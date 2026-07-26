import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { privateKeyToAccount } from "viem/accounts";

const outputPath = ".env.agent.local";
const privateKey = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
const account = privateKeyToAccount(privateKey);

try {
  await writeFile(
    outputPath,
    [
      "# Dedicated Yareon agent identity. Never commit or share this file.",
      `WORLD_AGENT_PRIVATE_KEY=${privateKey}`,
      `WORLD_AGENT_ADDRESS=${account.address}`,
      "",
    ].join("\n"),
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
} catch (error) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "EEXIST"
  ) {
    throw new Error(
      `${outputPath} already exists. Refusing to overwrite an agent identity.`,
    );
  }
  throw error;
}

console.log(
  JSON.stringify(
    {
      created: true,
      publicAddress: account.address,
      privateKeyFile: outputPath,
      privateKeyPrinted: false,
      next: `npx @worldcoin/agentkit-cli register ${account.address}`,
    },
    null,
    2,
  ),
);
