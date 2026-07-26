import { createHash } from "node:crypto";
import {
  chmod,
  cp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import {
  createAgentBookVerifier,
  createAgentkitClient,
} from "@worldcoin/agentkit";
import { getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const CLI_VERSION = "0.2.0";
const API_VERSION = "1";
const READ_TIMEOUT_MS = 15_000;
const MUTATION_TIMEOUT_MS = 30_000;
const FLAG_OPTIONS = new Set(["execute", "force", "help", "summary"]);

try {
  process.loadEnvFile?.(".env.local");
} catch {
  // Published clients normally receive secrets from their environment.
}

type JsonObject = Record<string, unknown>;

type StoredConfig = {
  baseUrl: string;
  programId: string;
};

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

type ServiceManifest = {
  service?: string;
  apiVersion?: string;
  protocolVersion?: string;
  network?: string;
};

type ParsedArguments = {
  command?: string;
  subcommand?: string;
  positionals: string[];
  options: Map<string, string | boolean>;
};

type RequestOptions = {
  mutation?: boolean;
};

export class CliError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const HELP = `Yareon CLI ${CLI_VERSION}

Usage:
  yareon connect <url> --program-id <id>
  yareon doctor [--base-url <url>] [--program-id <id>]
  yareon balance [--base-url <url>] [--program-id <id>]
  yareon offers [--base-url <url>] [--program-id <id>]
  yareon context [--base-url <url>] [--program-id <id>]
  yareon buy [--offer-id <id>] [--execute]
  yareon order --order-id <id>
  yareon audit [--order-id <id>] [--summary]
  yareon skill install [--target codex] [--force]
  yareon schema
  yareon version

Environment:
  YAREON_PUBLIC_URL        Override the connected service URL
  YAREON_PROGRAM_ID        Override the connected program
  WORLD_AGENT_PRIVATE_KEY  Required only for execution
  WORLD_CHAIN_RPC_URL      Optional AgentBook RPC override
  YAREON_CONFIG_HOME       Override the public configuration directory

All results are JSON. Secrets are never accepted as command arguments.`;

export async function runCli(args: string[]): Promise<void> {
  const parsed = parseCliArguments(args);
  const command = parsed.command;
  if (!command || command === "help" || parsed.options.has("help")) {
    console.log(HELP);
    return;
  }

  validateOptions(parsed);

  if (command === "version") {
    printSuccess(command, { version: CLI_VERSION });
    return;
  }
  if (command === "schema") {
    printSuccess(command, commandSchema());
    return;
  }
  if (command === "skill") {
    await installSkill(parsed);
    return;
  }
  if (command === "connect") {
    await connect(parsed);
    return;
  }

  const connection = await resolveConnection(parsed.options);
  if (command === "doctor") {
    printSuccess(command, await doctor(connection));
  } else if (command === "balance") {
    const context = await getContext(connection);
    printSuccess(command, {
      program: context.program,
      agent: context.agent,
      remaining: context.remaining,
    });
  } else if (command === "offers") {
    const context = await getContext(connection);
    printSuccess(command, {
      program: context.program,
      offers: context.offers,
      recommendedOfferId: context.recommendedOfferId,
    });
  } else if (command === "context") {
    printSuccess(command, await getContext(connection));
  } else if (command === "buy") {
    await buy(connection, parsed.options);
  } else if (command === "order") {
    const orderId = requiredOption(parsed.options, "order-id");
    const order = await requestJson(
      new URL(
        `/api/orders/${encodeURIComponent(orderId)}?programId=${encodeURIComponent(connection.programId)}`,
        connection.baseUrl,
      ),
    );
    printSuccess(command, {
      order,
      nextAction: nextActionFor(order),
    });
  } else if (command === "audit") {
    await audit(connection, parsed.options);
  } else {
    throw new CliError(
      "UNKNOWN_COMMAND",
      `Unknown command "${command}". Run "yareon help".`,
    );
  }
}

export function parseCliArguments(args: string[]): ParsedArguments {
  const command = args[0];
  let index = 1;
  let subcommand: string | undefined;
  if (command === "skill" && args[1] && !args[1].startsWith("--")) {
    subcommand = args[1];
    index = 2;
  }
  const positionals: string[] = [];
  const options = new Map<string, string | boolean>();
  for (; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const equalsAt = token.indexOf("=");
    const key =
      equalsAt === -1 ? token.slice(2) : token.slice(2, equalsAt);
    if (!key) throw new CliError("INVALID_ARGUMENT", "An option name is empty.");
    if (options.has(key)) {
      throw new CliError("DUPLICATE_OPTION", `--${key} was provided twice.`);
    }
    if (FLAG_OPTIONS.has(key)) {
      if (equalsAt !== -1) {
        throw new CliError(
          "INVALID_ARGUMENT",
          `--${key} is a flag and does not accept a value.`,
        );
      }
      options.set(key, true);
      continue;
    }
    const value =
      equalsAt === -1 ? args[index + 1] : token.slice(equalsAt + 1);
    if (!value || value.startsWith("--")) {
      throw new CliError("MISSING_OPTION_VALUE", `--${key} requires a value.`);
    }
    options.set(key, value);
    if (equalsAt === -1) index += 1;
  }
  return { command, subcommand, positionals, options };
}

function validateOptions(parsed: ParsedArguments): void {
  const allowed = new Map<string, Set<string>>([
    ["connect", new Set(["base-url", "program-id", "help"])],
    ["doctor", new Set(["base-url", "program-id", "help"])],
    ["balance", new Set(["base-url", "program-id", "help"])],
    ["offers", new Set(["base-url", "program-id", "help"])],
    ["context", new Set(["base-url", "program-id", "help"])],
    ["buy", new Set(["base-url", "program-id", "offer-id", "execute", "help"])],
    ["order", new Set(["base-url", "program-id", "order-id", "help"])],
    [
      "audit",
      new Set(["base-url", "program-id", "order-id", "summary", "help"]),
    ],
    ["skill", new Set(["target", "force", "help"])],
    ["schema", new Set(["help"])],
    ["version", new Set(["help"])],
  ]);
  const accepted = parsed.command ? allowed.get(parsed.command) : undefined;
  if (!accepted) return;
  for (const key of parsed.options.keys()) {
    if (!accepted.has(key)) {
      throw new CliError(
        "UNKNOWN_OPTION",
        `--${key} is not valid for ${parsed.command}.`,
      );
    }
  }
  if (parsed.command !== "connect" && parsed.positionals.length > 0) {
    throw new CliError(
      "UNEXPECTED_ARGUMENT",
      `Unexpected argument "${parsed.positionals[0]}".`,
    );
  }
}

async function connect(parsed: ParsedArguments): Promise<void> {
  if (parsed.positionals.length > 1) {
    throw new CliError(
      "UNEXPECTED_ARGUMENT",
      `Unexpected argument "${parsed.positionals[1]}".`,
    );
  }
  const suppliedUrl =
    parsed.positionals[0] ?? option(parsed.options, "base-url");
  if (!suppliedUrl) {
    throw new CliError(
      "BASE_URL_REQUIRED",
      "Pass the Yareon URL to connect.",
    );
  }
  const parsedUrl = normalizeUrl(suppliedUrl);
  const programId =
    option(parsed.options, "program-id") ??
    parsedUrl.searchParams.get("programId") ??
    parsedUrl.searchParams.get("program");
  if (!programId) {
    throw new CliError(
      "PROGRAM_ID_REQUIRED",
      "Pass --program-id or use a Yareon URL containing ?programId=.",
    );
  }
  const connection = {
    baseUrl: parsedUrl.origin,
    programId,
  };
  const readiness = await doctor(connection);
  if (!readiness.readyToRead) {
    throw new CliError(
      "CONNECTION_VALIDATION_FAILED",
      "Yareon could not validate this service and program.",
      true,
      readiness,
    );
  }
  await saveConfig(connection);
  printSuccess("connect", {
    connected: true,
    configPath: configPath(),
    connection,
    readiness,
    next: [
      "yareon skill install",
      "yareon balance",
      "yareon offers",
      "yareon buy --offer-id <id>",
    ],
  });
}

async function doctor(connection: StoredConfig) {
  const checks: Array<{
    name: string;
    status: "pass" | "fail" | "warning";
    detail: string;
  }> = [];
  let manifest: ServiceManifest;
  let context: ProcurementContext;
  try {
    manifest = (await requestJson(
      new URL("/api/agents/agentkit/manifest", connection.baseUrl),
    )) as ServiceManifest;
    if (manifest.service !== "yareon") {
      throw new CliError(
        "SERVICE_MISMATCH",
        "The configured URL is not a Yareon service.",
      );
    }
    if (manifest.apiVersion !== API_VERSION) {
      throw new CliError(
        "API_VERSION_UNSUPPORTED",
        `CLI API v${API_VERSION} is incompatible with service API v${manifest.apiVersion ?? "unknown"}.`,
      );
    }
    context = await getContext(connection);
    checks.push({
      name: "service",
      status: "pass",
      detail: `${context.program.name} is reachable on Yareon API v${manifest.apiVersion}.`,
    });
  } catch (error) {
    checks.push({
      name: "service",
      status: "fail",
      detail: error instanceof Error ? error.message : "Service is unavailable.",
    });
    return {
      readyToRead: false,
      readyToExecute: false,
      connection,
      checks,
    };
  }

  checks.push({
    name: "eligibleOffers",
    status: context.offers.length > 0 ? "pass" : "warning",
    detail:
      context.offers.length > 0
        ? `${context.offers.length} policy-eligible offer(s) found.`
        : "No policy-eligible offers are currently available.",
  });

  const expectedAddress = context.agent.worldAgentAddress;
  if (!expectedAddress) {
    checks.push({
      name: "delegationAddress",
      status: "fail",
      detail: "The program delegation has no World agent address.",
    });
  } else {
    checks.push({
      name: "delegationAddress",
      status: "pass",
      detail: expectedAddress,
    });
  }

  let signerAddress: string | undefined;
  try {
    signerAddress = configuredAccount().address;
    checks.push({
      name: "signingKey",
      status:
        expectedAddress &&
        getAddress(expectedAddress) !== getAddress(signerAddress)
          ? "fail"
          : "pass",
      detail:
        expectedAddress &&
        getAddress(expectedAddress) !== getAddress(signerAddress)
          ? "The local signing key does not match the delegation."
          : signerAddress,
    });
  } catch (error) {
    checks.push({
      name: "signingKey",
      status: "warning",
      detail:
        error instanceof Error
          ? `${error.message} Read-only commands remain available.`
          : "The signing key is unavailable.",
    });
  }

  if (
    signerAddress &&
    expectedAddress &&
    getAddress(expectedAddress) === getAddress(signerAddress)
  ) {
    try {
      const verifier = createAgentBookVerifier(
        process.env.WORLD_CHAIN_RPC_URL
          ? { rpcUrl: process.env.WORLD_CHAIN_RPC_URL }
          : undefined,
      );
      const registered = Boolean(
        await withTimeout(
          verifier.lookupHuman(signerAddress),
          READ_TIMEOUT_MS,
          "AGENTBOOK_TIMEOUT",
          "World AgentBook lookup timed out.",
        ),
      );
      checks.push({
        name: "agentBook",
        status: registered ? "pass" : "fail",
        detail: registered
          ? "The signing address is registered in World AgentBook."
          : "Register the signing address in World AgentBook.",
      });
    } catch (error) {
      checks.push({
        name: "agentBook",
        status: "warning",
        detail:
          error instanceof Error
            ? error.message
            : "World AgentBook could not be checked.",
      });
    }
  }

  const readyToRead = !checks.some(
    (check) => check.name === "service" && check.status === "fail",
  );
  const requiredExecutionChecks = new Set([
    "service",
    "delegationAddress",
    "signingKey",
    "agentBook",
  ]);
  const readyToExecute = checks
    .filter((check) => requiredExecutionChecks.has(check.name))
    .every((check) => check.status === "pass");
  return {
    readyToRead,
    readyToExecute,
    connection,
    checks,
  };
}

async function buy(
  connection: StoredConfig,
  options: Map<string, string | boolean>,
): Promise<void> {
  const context = await getContext(connection);
  const offerId = option(options, "offer-id") ?? context.recommendedOfferId;
  if (!offerId) {
    throw new CliError(
      "NO_ELIGIBLE_OFFER",
      "No policy-eligible offer is available.",
    );
  }
  const offer = context.offers.find((candidate) => candidate.id === offerId);
  if (!offer) {
    throw new CliError(
      "OFFER_NOT_ELIGIBLE",
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
    offer: {
      ...offer,
      displayAmount: formatAtomic(offer.amount),
    },
    remaining: context.remaining,
  };
  if (!flag(options, "execute")) {
    printSuccess("buy", preview);
    return;
  }

  const account = configuredAccount();
  if (!context.agent.worldAgentAddress) {
    throw new CliError(
      "DELEGATION_ADDRESS_MISSING",
      "The delegation is not bound to a World agent address.",
    );
  }
  if (
    getAddress(context.agent.worldAgentAddress) !== getAddress(account.address)
  ) {
    throw new CliError(
      "DELEGATION_ADDRESS_MISMATCH",
      "The local signing key does not match the delegation.",
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
  const target = new URL("/api/agents/agentkit/procure", connection.baseUrl);
  target.searchParams.set("intent", intentHash(intent));
  let response: Response;
  try {
    response = await client.fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(intent),
      cache: "no-store",
      signal: AbortSignal.timeout(MUTATION_TIMEOUT_MS),
    });
  } catch (error) {
    throw new CliError(
      "MUTATION_OUTCOME_UNKNOWN",
      "The order submission did not return a conclusive result. Inspect the order or audit trail before retrying.",
      false,
      {
        cause: error instanceof Error ? error.message : "Network failure",
        programId: connection.programId,
        offerId,
      },
    );
  }
  const result = await parseResponse(response);
  if (!response.ok) throw httpError(response.status, result);
  const confirmed = result as {
    status?: string;
    agentkit?: { verified?: boolean };
    projection?: { orders?: Record<string, unknown> };
  };
  if (
    confirmed.status !== "CONFIRMED" ||
    confirmed.agentkit?.verified !== true
  ) {
    throw new CliError(
      "UNCONFIRMED_MUTATION",
      "Yareon did not return a confirmed, AgentKit-verified order.",
      false,
      result,
    );
  }
  const order = Object.values(confirmed.projection?.orders ?? {}).at(-1);
  printSuccess("buy", {
    preview,
    result,
    nextAction: nextActionFor(order),
  });
}

async function audit(
  connection: StoredConfig,
  options: Map<string, string | boolean>,
): Promise<void> {
  const result = (await requestJson(
    new URL(
      `/api/programs/${encodeURIComponent(connection.programId)}/audit`,
      connection.baseUrl,
    ),
  )) as { source?: string; events?: unknown[] };
  const orderId = option(options, "order-id");
  const events = (result.events ?? []).filter(
    (event) => !orderId || JSON.stringify(event).includes(orderId),
  );
  printSuccess("audit", {
    source: result.source,
    programId: connection.programId,
    orderId,
    eventCount: events.length,
    events: flag(options, "summary")
      ? events.map(summarizeEvent)
      : events,
  });
}

async function installSkill(parsed: ParsedArguments): Promise<void> {
  if (parsed.subcommand !== "install") {
    throw new CliError(
      "UNKNOWN_SUBCOMMAND",
      'Use "yareon skill install".',
    );
  }
  const target = option(parsed.options, "target") ?? "codex";
  if (target !== "codex") {
    throw new CliError(
      "UNSUPPORTED_SKILL_TARGET",
      `Unsupported skill target "${target}". Currently supported: codex.`,
    );
  }
  const source = path.resolve(
    __dirname,
    "../skill/yareon-agent",
  );
  const root =
    process.env.CODEX_HOME ?? path.join(homedir(), ".codex");
  const destination = path.join(root, "skills", "yareon-agent");
  const exists = await pathExists(destination);
  if (exists && !flag(parsed.options, "force")) {
    throw new CliError(
      "SKILL_ALREADY_INSTALLED",
      `The skill already exists at ${destination}. Pass --force to replace it.`,
    );
  }
  if (exists) {
    await rm(destination, { recursive: true, force: true });
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, {
    recursive: true,
    force: flag(parsed.options, "force"),
  });
  printSuccess("skill install", {
    installed: true,
    target,
    destination,
    next: "Restart or open a new agent session, then invoke $yareon-agent.",
  });
}

async function getContext(
  connection: StoredConfig,
): Promise<ProcurementContext> {
  return (await requestJson(
    new URL(
      `/api/agents/agentkit/context?programId=${encodeURIComponent(connection.programId)}`,
      connection.baseUrl,
    ),
  )) as ProcurementContext;
}

async function resolveConnection(
  options: Map<string, string | boolean>,
): Promise<StoredConfig> {
  const stored = await loadConfig();
  const baseUrl =
    option(options, "base-url") ??
    process.env.YAREON_PUBLIC_URL ??
    stored?.baseUrl;
  const programId =
    option(options, "program-id") ??
    process.env.YAREON_PROGRAM_ID ??
    stored?.programId;
  if (!baseUrl) {
    throw new CliError(
      "NOT_CONNECTED",
      'Run "yareon connect <url> --program-id <id>" or pass --base-url.',
    );
  }
  if (!programId) {
    throw new CliError(
      "PROGRAM_ID_REQUIRED",
      'Run "yareon connect <url> --program-id <id>" or pass --program-id.',
    );
  }
  return {
    baseUrl: normalizeUrl(baseUrl).toString().replace(/\/$/, ""),
    programId,
  };
}

function configDirectory(): string {
  if (process.env.YAREON_CONFIG_HOME) return process.env.YAREON_CONFIG_HOME;
  if (process.platform === "win32" && process.env.APPDATA) {
    return path.join(process.env.APPDATA, "yareon");
  }
  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"),
    "yareon",
  );
}

function configPath(): string {
  return path.join(configDirectory(), "config.json");
}

async function saveConfig(config: StoredConfig): Promise<void> {
  await mkdir(configDirectory(), { recursive: true });
  await writeFile(configPath(), `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(configPath(), 0o600);
}

async function loadConfig(): Promise<StoredConfig | undefined> {
  try {
    const value = JSON.parse(await readFile(configPath(), "utf8")) as StoredConfig;
    if (!value.baseUrl || !value.programId) {
      throw new Error("Required fields are missing.");
    }
    return value;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }
    throw new CliError(
      "INVALID_CONFIG",
      `Could not read ${configPath()}.`,
      false,
      error instanceof Error ? error.message : error,
    );
  }
}

async function requestJson(
  url: URL,
  options: RequestOptions = {},
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(
        options.mutation ? MUTATION_TIMEOUT_MS : READ_TIMEOUT_MS,
      ),
    });
  } catch (error) {
    throw new CliError(
      options.mutation ? "MUTATION_OUTCOME_UNKNOWN" : "NETWORK_ERROR",
      options.mutation
        ? "The request outcome is unknown. Inspect state before retrying."
        : `Could not reach ${url.origin}.`,
      !options.mutation,
      error instanceof Error ? error.message : error,
    );
  }
  const body = await parseResponse(response);
  if (!response.ok) throw httpError(response.status, body);
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

function httpError(status: number, body: unknown): CliError {
  const object =
    body && typeof body === "object" ? (body as JsonObject) : undefined;
  const message =
    typeof object?.error === "string"
      ? object.error
      : `Yareon returned HTTP ${status}.`;
  const code =
    typeof object?.code === "string" ? object.code : `HTTP_${status}`;
  return new CliError(code, message, status >= 500, { status, body });
}

function configuredAccount() {
  const raw = process.env.WORLD_AGENT_PRIVATE_KEY;
  if (!raw) {
    throw new CliError(
      "SIGNING_KEY_MISSING",
      "Missing WORLD_AGENT_PRIVATE_KEY.",
    );
  }
  const normalized = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new CliError(
      "SIGNING_KEY_INVALID",
      "WORLD_AGENT_PRIVATE_KEY must be a 32-byte hex key.",
    );
  }
  return privateKeyToAccount(normalized as Hex);
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

export function formatAtomic(amount: {
  asset: string;
  atomicAmount: string;
  decimals: number;
}): string {
  const negative = amount.atomicAmount.startsWith("-");
  const digits = negative ? amount.atomicAmount.slice(1) : amount.atomicAmount;
  const padded = digits.padStart(amount.decimals + 1, "0");
  const whole =
    amount.decimals === 0 ? padded : padded.slice(0, -amount.decimals);
  const fraction =
    amount.decimals === 0
      ? ""
      : padded.slice(-amount.decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""} ${amount.asset}`;
}

export function nextActionFor(order: unknown): string | undefined {
  if (!order || typeof order !== "object") return undefined;
  const status = (order as { status?: string }).status;
  const actions: Record<string, string> = {
    CREATED: "Vendor must accept the order.",
    VENDOR_ACCEPTED: "Yareon must create the payment schedule.",
    PAYMENT_SCHEDULED: "Vendor must submit delivery evidence.",
    DELIVERY_SUBMITTED: "Delivery verifier must approve the delivery.",
    DELIVERY_APPROVED: "Finance must approve the scheduled payment.",
    PAYMENT_EXECUTED: "No action required; settlement is complete.",
  };
  return status ? actions[status] : undefined;
}

function summarizeEvent(event: unknown): unknown {
  if (!event || typeof event !== "object") return event;
  const value = event as {
    eventType?: string;
    occurredAt?: string;
    actor?: { role?: string; actorId?: string };
    ledgerReference?: {
      topicId?: string;
      sequenceNumber?: number;
      transactionId?: string;
    };
  };
  return {
    eventType: value.eventType,
    occurredAt: value.occurredAt,
    actor: value.actor,
    ledgerReference: value.ledgerReference,
  };
}

function commandSchema() {
  return {
    apiVersion: API_VERSION,
    commands: {
      connect: ["url", "--program-id"],
      doctor: ["--base-url", "--program-id"],
      balance: ["--base-url", "--program-id"],
      offers: ["--base-url", "--program-id"],
      context: ["--base-url", "--program-id"],
      buy: ["--offer-id", "--execute"],
      order: ["--order-id"],
      audit: ["--order-id", "--summary"],
      skill: ["install", "--target", "--force"],
    },
    error: {
      code: "stable machine-readable string",
      message: "human-readable explanation",
      retryable: "boolean",
      details: "optional structured context",
    },
  };
}

function normalizeUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new CliError("INVALID_BASE_URL", `"${value}" is not a valid URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new CliError(
      "INVALID_BASE_URL",
      "The Yareon URL must use HTTP or HTTPS.",
    );
  }
  return parsed;
}

function option(
  options: Map<string, string | boolean>,
  name: string,
): string | undefined {
  const value = options.get(name);
  return typeof value === "string" ? value : undefined;
}

function requiredOption(
  options: Map<string, string | boolean>,
  name: string,
): string {
  const value = option(options, name);
  if (!value) {
    throw new CliError(
      "MISSING_REQUIRED_OPTION",
      `--${name} is required.`,
    );
  }
  return value;
}

function flag(
  options: Map<string, string | boolean>,
  name: string,
): boolean {
  return options.get(name) === true;
}

async function pathExists(value: string): Promise<boolean> {
  try {
    await stat(value);
    return true;
  } catch {
    return false;
  }
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  code: string,
  message: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new CliError(code, message, true)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function printSuccess(command: string, data: unknown): void {
  console.log(
    JSON.stringify(
      {
        ok: true,
        command,
        data,
        meta: {
          cliVersion: CLI_VERSION,
          apiVersion: API_VERSION,
        },
      },
      null,
      2,
    ),
  );
}

export function printFailure(error: unknown): void {
  const normalized =
    error instanceof CliError
      ? error
      : new CliError(
          "UNEXPECTED_ERROR",
          error instanceof Error ? error.message : "Yareon request failed.",
        );
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: {
          code: normalized.code,
          message: normalized.message,
          retryable: normalized.retryable,
          ...(normalized.details === undefined
            ? {}
            : { details: normalized.details }),
        },
        meta: {
          cliVersion: CLI_VERSION,
          apiVersion: API_VERSION,
        },
      },
      null,
      2,
    ),
  );
}
