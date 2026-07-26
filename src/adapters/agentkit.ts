import { createHash, randomBytes } from "node:crypto";
import {
  AGENTKIT,
  buildAgentkitSchema,
  createAgentBookVerifier,
  createAgentkitClient,
  parseAgentkitHeader,
  validateAgentkitMessage,
  verifyAgentkitSignature,
} from "@worldcoin/agentkit";
import { getAddress, isAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const WORLD_AGENT_CHAIN_ID = "eip155:480";
export const AGENTKIT_CHALLENGE_SECONDS = 300;

export type AgentkitTraceEvent = {
  type:
    | "challenge_received"
    | "request_signed"
    | "agentbook_verified"
    | "policy_evaluated"
    | "hcs_recorded"
    | "hedera_submitted";
  detail: string;
};

export type VerifiedAgentkitAccess = {
  agentAddress: string;
  humanId: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
};

export type AgentkitConfig = {
  privateKey: Hex;
  agentAddress: string;
  worldChainRpcUrl?: string;
};

type AgentBookLookup = {
  lookupHuman(address: string): Promise<string | null>;
};

export function agentkitConfigFromEnv(): AgentkitConfig {
  const raw = process.env.WORLD_AGENT_PRIVATE_KEY;
  if (!raw) throw new Error("Missing WORLD_AGENT_PRIVATE_KEY.");
  const privateKey = normalizePrivateKey(raw);
  const account = privateKeyToAccount(privateKey);
  return {
    privateKey,
    agentAddress: getAddress(account.address),
    worldChainRpcUrl: process.env.WORLD_CHAIN_RPC_URL,
  };
}

export function configuredAgentkitAddress(): string | undefined {
  try {
    return agentkitConfigFromEnv().agentAddress;
  } catch {
    return undefined;
  }
}

export async function lookupConfiguredAgentHuman(): Promise<boolean> {
  const config = agentkitConfigFromEnv();
  const agentBook = createAgentBookVerifier(
    config.worldChainRpcUrl
      ? { rpcUrl: config.worldChainRpcUrl }
      : undefined,
  );
  return Boolean(await agentBook.lookupHuman(config.agentAddress));
}

export function createAgentkitChallenge(resourceUrl: string) {
  const url = new URL(resourceUrl);
  const issuedAt = new Date();
  const expirationTime = new Date(
    issuedAt.getTime() + AGENTKIT_CHALLENGE_SECONDS * 1_000,
  );
  return {
    x402Version: 2,
    error: "A registered human-backed agent is required.",
    resource: {
      url: resourceUrl,
      description:
        "Authorize a policy-controlled procurement action on Hedera.",
      mimeType: "application/json",
    },
    accepts: [],
    extensions: {
      [AGENTKIT]: {
        info: {
          domain: url.hostname,
          uri: resourceUrl,
          version: "1",
          nonce: randomBytes(16).toString("hex"),
          issuedAt: issuedAt.toISOString(),
          expirationTime: expirationTime.toISOString(),
          statement:
            "Prove this procurement agent is backed by a real, unique human.",
          resources: [resourceUrl],
        },
        supportedChains: [
          { chainId: WORLD_AGENT_CHAIN_ID, type: "eip191" as const },
          { chainId: WORLD_AGENT_CHAIN_ID, type: "eip1271" as const },
        ],
        schema: buildAgentkitSchema(),
        mode: { type: "free" as const },
      },
    },
  };
}

export function createConfiguredAgentkitClient(
  onTrace?: (event: AgentkitTraceEvent) => void,
) {
  const config = agentkitConfigFromEnv();
  const account = privateKeyToAccount(config.privateKey);
  return createAgentkitClient({
    signer: {
      address: config.agentAddress,
      chainId: WORLD_AGENT_CHAIN_ID,
      type: "eip191",
      signMessage: (message) => account.signMessage({ message }),
    },
    onEvent: (event) => {
      if (event.type === "agentkit_detected") {
        onTrace?.({
          type: "challenge_received",
          detail: "The resource returned an AgentKit 402 challenge.",
        });
      } else if (event.type === "agentkit_signed") {
        onTrace?.({
          type: "request_signed",
          detail: `${event.chainId} ${event.signatureType} intent signed by ${shortAddress(config.agentAddress)}.`,
        });
      }
    },
  });
}

export async function verifyAgentkitRequest(
  request: Request,
  options: {
    expectedAddress?: string;
    worldChainRpcUrl?: string;
    agentBook?: AgentBookLookup;
  } = {},
): Promise<VerifiedAgentkitAccess> {
  const header = request.headers.get(AGENTKIT);
  if (!header) throw new Error("The AgentKit header is required.");

  const payload = parseAgentkitHeader(header);
  if (
    payload.uri !== request.url ||
    (payload.resources && !payload.resources.includes(request.url))
  ) {
    throw new Error(
      "AgentKit challenge validation failed: the signed resource URI changed.",
    );
  }
  const validation = await validateAgentkitMessage(payload, request.url);
  if (!validation.valid) {
    throw new Error(`AgentKit challenge validation failed: ${validation.error}`);
  }
  const verification = await verifyAgentkitSignature(
    payload,
    options.worldChainRpcUrl,
  );
  if (!verification.valid || !verification.address) {
    throw new Error(
      `AgentKit signature verification failed: ${verification.error ?? "unknown error"}`,
    );
  }
  const recovered = getAddress(verification.address);
  if (
    options.expectedAddress &&
    recovered !== getAddress(options.expectedAddress)
  ) {
    throw new Error("The AgentKit signer is not bound to this Yareon agent.");
  }
  const agentBook =
    options.agentBook ??
    createAgentBookVerifier(
      options.worldChainRpcUrl
        ? { rpcUrl: options.worldChainRpcUrl }
        : undefined,
    );
  const humanId = await agentBook.lookupHuman(recovered);
  if (!humanId) {
    throw new Error("The signing agent is not registered in World AgentBook.");
  }
  const expiresAt =
    payload.expirationTime ??
    new Date(
      new Date(payload.issuedAt).getTime() +
        AGENTKIT_CHALLENGE_SECONDS * 1_000,
    ).toISOString();
  return {
    agentAddress: recovered,
    humanId,
    nonce: payload.nonce,
    issuedAt: payload.issuedAt,
    expiresAt,
  };
}

export function agentkitVerificationReference(
  access: VerifiedAgentkitAccess,
): string {
  return `sha256:${createHash("sha256")
    .update(
      `world-agentkit:${access.humanId}:${access.agentAddress.toLowerCase()}:${access.nonce}`,
    )
    .digest("hex")}`;
}

export function normalizePrivateKey(value: string): Hex {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("WORLD_AGENT_PRIVATE_KEY must be a 32-byte hex key.");
  }
  return normalized as Hex;
}

export function validateAgentAddress(value: string): string {
  if (!isAddress(value)) throw new Error("The World agent address is invalid.");
  return getAddress(value);
}

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
