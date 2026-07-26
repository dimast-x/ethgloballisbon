#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createAgentkitClient } from "@worldcoin/agentkit";
import { getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

try {
  process.loadEnvFile?.(".env.local");
} catch {
  // Hosted environments may provide variables directly.
}

type JsonObject = Record<string, unknown>;

type Offer = {
  id: string;
  vendorId: string;
  vendorName?: string;
  category: string;
  description: string;
  amount: {
    asset: string;
    atomicAmount: string;
    decimals: number;
  };
  deliveryDays?: number;
};

type ProcurementContext = {
  program: {
    id: string;
    name: string;
    status: string;
  };
  agent: {
    id: string;
    hederaAccountId?: string;
    worldAgentAddress?: string;
  };
  remaining: {
    delegationAtomic: string;
    allocationAtomic: string;
    programFundsAtomic: string;
  };
  offers: Offer[];
  recommendedOfferId?: string;
};

const HELP = `Yareon agent CLI

Usage:
  yareon.ts context --program-id <id> [--base-url <url>]
  yareon.ts buy --program-id <id> [--offer-id <id>] [--execute] [--base-url <url>]
  yareon.ts order --program-id <id> --order-id <id> [--base-url <url>]
  yareon.ts audit --program-id <id> [--base-url <url>]

Environment:
  YAREON_PUBLIC_URL        Default base URL
  WORLD_AGENT_PRIVATE_KEY  Required only for buy --execute
`;

try {
  await main();
} catch (error) {
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : "Yareon request failed.",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (
    !command ||
    command === "help" ||
    command === "--help" ||
    options.has("help")
  ) {
    console.log(HELP);
    return;
  }

  const baseUrl = normalizeBaseUrl(
    option(options, "base-url") ??
      process.env.YAREON_PUBLIC_URL ??
      "http://127.0.0.1:3000",
  );
  const programId = requiredOption(options, "program-id");

  if (command === "context") {
    print(await getContext(baseUrl, programId));
  } else if (command === "buy") {
    await buy(baseUrl, programId, options);
  } else if (command === "order") {
    const orderId = requiredOption(options, "order-id");
    print(
      await requestJson(
        new URL(
          `/api/orders/${encodeURIComponent(orderId)}?programId=${encodeURIComponent(programId)}`,
          baseUrl,
        ),
      ),
    );
  } else if (command === "audit") {
    print(
      await requestJson(
        new URL(`/api/programs/${encodeURIComponent(programId)}/audit`, baseUrl),
      ),
    );
  } else {
    throw new Error(`Unknown command "${command}".\n\n${HELP}`);
  }
}

async function buy(
  serviceUrl: string,
  selectedProgramId: string,
  parsedOptions: Map<string, string | boolean>,
) {
  const context = await getContext(serviceUrl, selectedProgramId);
  const offerId =
    option(parsedOptions, "offer-id") ?? context.recommendedOfferId;
  if (!offerId) {
    throw new Error("No policy-eligible offer is available.");
  }
  const offer = context.offers.find((candidate) => candidate.id === offerId);
  if (!offer) {
    throw new Error(
      `Offer "${offerId}" is not in the current policy-eligible context.`,
    );
  }

  const intent = {
    programId: context.program.id,
    agentId: context.agent.id,
    offerId: offer.id,
    action: "CREATE_ORDER" as const,
  };
  const preview = {
    status: "PREVIEW",
    program: context.program,
    agent: context.agent,
    offer,
    remaining: context.remaining,
  };

  if (!flag(parsedOptions, "execute")) {
    print(preview);
    return;
  }

  const account = configuredAccount();
  if (
    context.agent.worldAgentAddress &&
    getAddress(context.agent.worldAgentAddress) !== getAddress(account.address)
  ) {
    throw new Error(
      "WORLD_AGENT_PRIVATE_KEY does not match the address bound to this delegation.",
    );
  }

  const client = createAgentkitClient({
    signer: {
      address: getAddress(account.address),
      chainId: "eip155:480",
      type: "eip191",
      signMessage: (message) => account.signMessage({ message }),
    },
  });
  const target = new URL("/api/agents/agentkit/procure", serviceUrl);
  target.searchParams.set("intent", intentHash(intent));
  const response = await client.fetch(target, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(intent),
    cache: "no-store",
  });
  const result = await parseResponse(response);
  if (!response.ok) {
    throw new Error(
      `Yareon returned HTTP ${response.status}: ${errorMessage(result)}`,
    );
  }
  const confirmed = result as {
    status?: string;
    agentkit?: { verified?: boolean };
  };
  if (
    confirmed.status !== "CONFIRMED" ||
    confirmed.agentkit?.verified !== true
  ) {
    throw new Error(
      "Yareon did not return a confirmed, AgentKit-verified order.",
    );
  }
  print({ preview, result });
}

async function getContext(
  serviceUrl: string,
  selectedProgramId: string,
): Promise<ProcurementContext> {
  return (await requestJson(
    new URL(
      `/api/agents/agentkit/context?programId=${encodeURIComponent(selectedProgramId)}`,
      serviceUrl,
    ),
  )) as ProcurementContext;
}

function intentHash(intent: {
  action: string;
  agentId: string;
  offerId: string;
  programId: string;
}) {
  const canonical = JSON.stringify({
    action: intent.action,
    agentId: intent.agentId,
    offerId: intent.offerId,
    programId: intent.programId,
  });
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

function configuredAccount() {
  const raw = process.env.WORLD_AGENT_PRIVATE_KEY;
  if (!raw) throw new Error("Missing WORLD_AGENT_PRIVATE_KEY.");
  const normalized = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("WORLD_AGENT_PRIVATE_KEY must be a 32-byte hex key.");
  }
  return privateKeyToAccount(normalized as Hex);
}

async function requestJson(url: URL): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const body = await parseResponse(response);
  if (!response.ok) {
    throw new Error(
      `Yareon returned HTTP ${response.status}: ${errorMessage(body)}`,
    );
  }
  return body;
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
}

function errorMessage(body: unknown): string {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as JsonObject).error === "string"
  ) {
    return (body as JsonObject).error as string;
  }
  return JSON.stringify(body);
}

function parseArguments(args: string[]) {
  const command = args[0];
  const parsed = new Map<string, string | boolean>();
  for (let index = 1; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument "${token}".`);
    }
    const key = token.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      parsed.set(key, true);
    } else {
      parsed.set(key, next);
      index += 1;
    }
  }
  return { command, options: parsed };
}

function option(
  parsedOptions: Map<string, string | boolean>,
  name: string,
): string | undefined {
  const value = parsedOptions.get(name);
  return typeof value === "string" ? value : undefined;
}

function requiredOption(
  parsedOptions: Map<string, string | boolean>,
  name: string,
): string {
  const value = option(parsedOptions, name);
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

function flag(
  parsedOptions: Map<string, string | boolean>,
  name: string,
): boolean {
  return parsedOptions.get(name) === true;
}

function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("The Yareon base URL must use http or https.");
  }
  return parsed.toString().replace(/\/$/, "");
}

function print(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}
