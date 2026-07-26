import { createHash } from "node:crypto";
import {
  createPublicClient,
  http,
  type PublicClient,
} from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import type {
  PublicIdentityResolver,
} from "../protocol/adapters";
import type {
  PublicIdentity,
  ResolvedAgentIdentity,
} from "../protocol/types";

const agentRecordKeys = {
  agentId: "com.yareon.agent-id",
  role: "com.yareon.role",
  organization: "com.yareon.organization",
  account: "com.yareon.hedera-account",
  delegation: "com.yareon.delegation",
  version: "com.yareon.protocol-version",
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
      key: "com.yareon.organization-id",
    });
    if (!organizationId) {
      throw new Error(
        "ENS record com.yareon.organization-id is required on the organization name.",
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

export function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function identityKey(identity: PublicIdentity): string {
  return `${identity.scheme.toLowerCase()}:${identity.name.toLowerCase()}`;
}
