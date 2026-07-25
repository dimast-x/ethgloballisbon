import { createHash } from "node:crypto";
import { signRequest } from "@worldcoin/idkit/signing";
import { hashSignal } from "@worldcoin/idkit/hashing";
import {
  createPublicClient,
  http,
  type PublicClient,
} from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import type {
  HumanBackingVerifier,
  PublicIdentityResolver,
} from "../protocol/adapters";
import type {
  HumanBackingAttestation,
  HumanBackingRequest,
  PublicIdentity,
  ResolvedAgentIdentity,
} from "../protocol/types";

const agentRecordKeys = {
  agentId: "com.openprocure.agent-id",
  role: "com.openprocure.role",
  organization: "com.openprocure.organization",
  account: "com.openprocure.hedera-account",
  delegation: "com.openprocure.delegation",
  worldReference: "com.openprocure.world-reference",
  version: "com.openprocure.protocol-version",
  endpoint: "url",
} as const;

export type EnsIdentityConfig = {
  rpcUrl?: string;
  expectedOrganizationName?: string;
};

export class EnsPublicIdentityResolver implements PublicIdentityResolver {
  private client: PublicClient;

  constructor(
    private config: EnsIdentityConfig = {},
    client?: PublicClient,
  ) {
    this.client =
      client ??
      createPublicClient({
        chain: mainnet,
        transport: http(config.rpcUrl),
      });
  }

  async resolve(identity: PublicIdentity): Promise<ResolvedAgentIdentity> {
    if (identity.scheme.toLowerCase() !== "ens") {
      throw new Error(`Unsupported public identity scheme ${identity.scheme}.`);
    }
    const name = normalize(identity.name);
    const values = await Promise.all(
      Object.values(agentRecordKeys).map((key) =>
        this.client.getEnsText({ name, key }),
      ),
    );
    const records = Object.fromEntries(
      Object.keys(agentRecordKeys).map((key, index) => [key, values[index] ?? ""]),
    ) as Record<keyof typeof agentRecordKeys, string>;
    const required = [
      "agentId",
      "role",
      "organization",
      "account",
      "delegation",
      "worldReference",
      "version",
    ] as const;
    for (const key of required) {
      if (!records[key]) {
        throw new Error(`ENS record ${agentRecordKeys[key]} is required.`);
      }
    }
    if (
      this.config.expectedOrganizationName &&
      normalize(records.organization) !==
        normalize(this.config.expectedOrganizationName)
    ) {
      throw new Error("The ENS organization does not match the configured organization.");
    }
    const organizationId = await this.client.getEnsText({
      name: normalize(records.organization),
      key: "com.openprocure.organization-id",
    });
    if (!organizationId) {
      throw new Error(
        "ENS record com.openprocure.organization-id is required on the organization name.",
      );
    }
    const snapshot = {
      name,
      agentId: records.agentId,
      organizationId,
      organizationName: normalize(records.organization),
      role: records.role,
      executionAccountId: records.account,
      delegationHash: records.delegation,
      worldReference: records.worldReference,
      protocolVersion: records.version,
      endpoint: records.endpoint || undefined,
    };
    return {
      agentId: snapshot.agentId,
      publicIdentity: { scheme: "ens", name },
      organizationReference: snapshot.organizationId,
      executionAccountId: snapshot.executionAccountId,
      role: snapshot.role,
      protocolVersion: snapshot.protocolVersion,
      delegationHash: snapshot.delegationHash,
      endpoint: snapshot.endpoint,
      resolutionHash: sha256(JSON.stringify(snapshot)),
      resolvedAt: new Date().toISOString(),
    };
  }
}

export class StaticPublicIdentityResolver implements PublicIdentityResolver {
  constructor(private identities: Map<string, ResolvedAgentIdentity>) {}

  async resolve(identity: PublicIdentity): Promise<ResolvedAgentIdentity> {
    const resolved = this.identities.get(identityKey(identity));
    if (!resolved) throw new Error(`${identity.name} could not be resolved.`);
    return { ...resolved, resolvedAt: new Date().toISOString() };
  }
}

export type WorldIdentityConfig = {
  appId: string;
  rpId: string;
  signingKey: string;
  action: string;
  environment: "staging" | "production";
};

export type WorldRpRequest = {
  appId: string;
  rpId: string;
  action: string;
  environment: "staging" | "production";
  signal: string;
  rpContext: {
    rp_id: string;
    nonce: string;
    created_at: number;
    expires_at: number;
    signature: string;
  };
};

export function createWorldRpRequest(
  config: WorldIdentityConfig,
  signal: string,
): WorldRpRequest {
  const signature = signRequest({
    signingKeyHex: config.signingKey,
    action: config.action,
    ttl: 300,
  });
  return {
    appId: config.appId,
    rpId: config.rpId,
    action: config.action,
    environment: config.environment,
    signal,
    rpContext: {
      rp_id: config.rpId,
      nonce: signature.nonce,
      created_at: signature.createdAt,
      expires_at: signature.expiresAt,
      signature: signature.sig,
    },
  };
}

export class WorldHumanBackingVerifier implements HumanBackingVerifier {
  constructor(
    private config: WorldIdentityConfig,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async verify(
    request: HumanBackingRequest,
  ): Promise<HumanBackingAttestation> {
    const proof = requireWorldProof(request.proof);
    if (request.action !== this.config.action || proof.action !== request.action) {
      throw new Error("The World proof action does not match the request.");
    }
    if (
      request.environment !== this.config.environment ||
      proof.environment !== request.environment
    ) {
      throw new Error("The World proof environment does not match the request.");
    }
    const responseItem = proof.responses[0];
    if (!responseItem?.nullifier) {
      throw new Error("The World proof does not contain a nullifier.");
    }
    if (
      responseItem.signal_hash &&
      responseItem.signal_hash.toLowerCase() !==
        hashSignal(request.signal).toLowerCase()
    ) {
      throw new Error("The World proof signal does not match the authorization.");
    }
    const response = await this.fetchImpl(
      `https://developer.world.org/api/v4/verify/${this.config.rpId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(proof),
      },
    );
    if (!response.ok) {
      throw new Error(`World verification failed with status ${response.status}.`);
    }
    return {
      scheme: "world-id",
      verificationReference: sha256(
        `${request.action}:${responseItem.nullifier.toLowerCase()}`,
      ),
      subjectReference: request.subjectReference,
      verifiedAt: new Date().toISOString(),
      expiresAt: responseItem.expires_at_min
        ? new Date(responseItem.expires_at_min * 1000).toISOString()
        : undefined,
    };
  }
}

export function worldConfigFromEnv(): WorldIdentityConfig {
  const values = {
    appId: process.env.WORLD_APP_ID ?? process.env.NEXT_PUBLIC_WORLD_APP_ID,
    rpId: process.env.WORLD_RP_ID,
    signingKey: process.env.WORLD_RP_SIGNING_KEY,
    action: process.env.WORLD_ACTION ?? "authorize-openprocure-agent",
    environment:
      process.env.WORLD_ENVIRONMENT === "staging"
        ? ("staging" as const)
        : ("production" as const),
  };
  for (const [key, value] of Object.entries(values)) {
    if (!value) throw new Error(`Missing World configuration: ${key}.`);
  }
  return values as WorldIdentityConfig;
}

export function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function identityKey(identity: PublicIdentity): string {
  return `${identity.scheme.toLowerCase()}:${identity.name.toLowerCase()}`;
}

function requireWorldProof(value: unknown): {
  action: string;
  environment: string;
  responses: Array<{
    nullifier?: string;
    signal_hash?: string;
    expires_at_min?: number;
  }>;
} {
  if (!value || typeof value !== "object") {
    throw new Error("A World proof payload is required.");
  }
  const proof = value as {
    action?: unknown;
    environment?: unknown;
    responses?: unknown;
  };
  if (
    typeof proof.action !== "string" ||
    typeof proof.environment !== "string" ||
    !Array.isArray(proof.responses)
  ) {
    throw new Error("The World proof payload is malformed.");
  }
  return proof as {
    action: string;
    environment: string;
    responses: Array<{
      nullifier?: string;
      signal_hash?: string;
      expires_at_min?: number;
    }>;
  };
}
