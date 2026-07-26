import { createHash } from "node:crypto";
import type {
  PublicIdentityResolver,
} from "../protocol/adapters";
import type {
  PublicIdentity,
  ResolvedAgentIdentity,
} from "../protocol/types";

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
