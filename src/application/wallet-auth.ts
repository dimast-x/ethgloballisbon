import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { proto } from "@hiero-ledger/proto";
import { PublicKey } from "@hiero-ledger/sdk";

export const ADMIN_SESSION_COOKIE = "charter_admin_session";

const CHALLENGE_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60_000;
const CLOCK_SKEW_MS = 60_000;

type ChallengePayload = {
  kind: "hedera-wallet-challenge";
  version: 1;
  accountId: string;
  network: "testnet";
  nonce: string;
  origin: string;
  issuedAt: string;
  expiresAt: string;
};

type SessionPayload = {
  kind: "hedera-wallet-session";
  version: 1;
  accountId: string;
  issuedAt: string;
  expiresAt: string;
};

type TokenOptions = {
  secret?: string;
  now?: Date;
};

export function isWalletAuthenticationConfigured(
  secret = process.env.CHARTER_AUTH_SECRET,
): boolean {
  return Boolean(secret && secret.length >= 32);
}

export function issueAdministratorChallenge(
  request: Request,
  accountId: string,
  options: TokenOptions = {},
): { message: string; token: string; expiresAt: string } {
  validateAccountId(accountId);
  const now = options.now ?? new Date();
  const payload: ChallengePayload = {
    kind: "hedera-wallet-challenge",
    version: 1,
    accountId,
    network: "testnet",
    nonce: randomUUID(),
    origin: new URL(request.url).origin,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.valueOf() + CHALLENGE_TTL_MS).toISOString(),
  };

  return {
    message: canonicalChallengeMessage(payload),
    token: signToken(payload, authenticationSecret(options.secret)),
    expiresAt: payload.expiresAt,
  };
}

export async function verifyAdministratorChallenge(input: {
  request: Request;
  accountId: string;
  token: string;
  signatureMap: string;
  secret?: string;
  now?: Date;
  mirrorFetch?: typeof fetch;
}): Promise<boolean> {
  validateAccountId(input.accountId);
  if (!input.signatureMap || input.signatureMap.length > 20_000) return false;

  const secret = authenticationSecret(input.secret);
  const payload = verifiedChallengePayload(input, secret);
  if (!payload) return false;

  const publicKey = await fetchAccountPublicKey(
    input.accountId,
    input.mirrorFetch ?? fetch,
  );
  if (!publicKey) return false;

  try {
    return verifyHederaMessageSignature(
      canonicalChallengeMessage(payload),
      input.signatureMap,
      publicKey,
    );
  } catch {
    return false;
  }
}

export async function verifyAdministratorHcsChallenge(input: {
  request: Request;
  accountId: string;
  token: string;
  transactionId: string;
  secret?: string;
  now?: Date;
  mirrorFetch?: typeof fetch;
}): Promise<boolean> {
  validateAccountId(input.accountId);
  if (!/^\d+\.\d+\.\d+@\d+\.\d+$/.test(input.transactionId)) return false;
  const secret = authenticationSecret(input.secret);
  const payload = verifiedChallengePayload(input, secret);
  if (!payload) return false;

  const mirrorFetch = input.mirrorFetch ?? fetch;
  const mirrorNodeUrl =
    process.env.HEDERA_MIRROR_NODE_URL ??
    "https://testnet.mirrornode.hedera.com";
  const topicId = process.env.HEDERA_TOPIC_ID;
  if (!topicId) return false;
  const transactionUrl = new URL(
    `/api/v1/transactions/${encodeURIComponent(input.transactionId)}`,
    mirrorNodeUrl,
  );

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const transactionResponse = await mirrorFetch(transactionUrl);
    if (transactionResponse.ok) {
      const body = (await transactionResponse.json()) as {
        transactions?: Array<{
          consensus_timestamp?: string;
          entity_id?: string;
          name?: string;
          payer_account_id?: string;
          result?: string;
        }>;
      };
      const transaction = body.transactions?.find(
        (candidate) =>
          candidate.name === "CONSENSUSSUBMITMESSAGE" &&
          candidate.result === "SUCCESS" &&
          candidate.payer_account_id === input.accountId &&
          candidate.entity_id === topicId &&
          candidate.consensus_timestamp,
      );
      if (transaction?.consensus_timestamp) {
        const messageResponse = await mirrorFetch(
          new URL(
            `/api/v1/topics/messages/${transaction.consensus_timestamp}`,
            mirrorNodeUrl,
          ),
        );
        if (messageResponse.ok) {
          const message = (await messageResponse.json()) as {
            message?: string;
            payer_account_id?: string;
            topic_id?: string;
          };
          return Boolean(
            message.payer_account_id === input.accountId &&
              message.topic_id === topicId &&
              message.message &&
              Buffer.from(message.message, "base64").toString("utf8") ===
                canonicalChallengeMessage(payload),
          );
        }
      }
    }
    if (attempt < 11) {
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
  return false;
}

export function createAdministratorSessionCookie(
  request: Request,
  accountId: string,
  options: TokenOptions = {},
): string {
  validateAccountId(accountId);
  const now = options.now ?? new Date();
  const payload: SessionPayload = {
    kind: "hedera-wallet-session",
    version: 1,
    accountId,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.valueOf() + SESSION_TTL_MS).toISOString(),
  };
  const token = signToken(payload, authenticationSecret(options.secret));
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`;
}

export function clearAdministratorSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

export function authenticatedAdministratorAccountId(
  request: Request,
  options: TokenOptions = {},
): string | null {
  if (!isWalletAuthenticationConfigured(options.secret)) return null;
  const token = readCookie(
    request.headers.get("cookie"),
    ADMIN_SESSION_COOKIE,
  );
  if (!token) return null;

  const payload = verifyToken<SessionPayload>(
    token,
    authenticationSecret(options.secret),
  );
  if (
    !payload ||
    payload.kind !== "hedera-wallet-session" ||
    payload.version !== 1 ||
    !isHederaAccountId(payload.accountId) ||
    !isFresh(
      payload.issuedAt,
      payload.expiresAt,
      options.now ?? new Date(),
      SESSION_TTL_MS,
    )
  ) {
    return null;
  }
  return payload.accountId;
}

function canonicalChallengeMessage(payload: ChallengePayload): string {
  return [
    "Charter administrator authentication",
    `version=${payload.version}`,
    `accountId=${payload.accountId}`,
    `network=${payload.network}`,
    `origin=${payload.origin}`,
    `nonce=${payload.nonce}`,
    `issuedAt=${payload.issuedAt}`,
    `expiresAt=${payload.expiresAt}`,
  ].join("\n");
}

function verifiedChallengePayload(
  input: {
    request: Request;
    accountId: string;
    token: string;
    now?: Date;
  },
  secret: string,
): ChallengePayload | null {
  const payload = verifyToken<ChallengePayload>(input.token, secret);
  if (
    !payload ||
    payload.kind !== "hedera-wallet-challenge" ||
    payload.version !== 1 ||
    payload.network !== "testnet" ||
    payload.accountId !== input.accountId ||
    payload.origin !== new URL(input.request.url).origin ||
    !isFresh(
      payload.issuedAt,
      payload.expiresAt,
      input.now ?? new Date(),
      CHALLENGE_TTL_MS,
    )
  ) {
    return null;
  }
  return payload;
}

async function fetchAccountPublicKey(
  accountId: string,
  mirrorFetch: typeof fetch,
): Promise<PublicKey | null> {
  const mirrorNodeUrl =
    process.env.HEDERA_MIRROR_NODE_URL ??
    "https://testnet.mirrornode.hedera.com";
  const response = await mirrorFetch(
    `${mirrorNodeUrl}/api/v1/accounts/${encodeURIComponent(accountId)}`,
    { headers: { accept: "application/json" } },
  );
  if (!response.ok) return null;
  const body = (await response.json()) as {
    key?: { _type?: string; key?: string } | null;
  };
  if (!body.key?.key) return null;

  try {
    if (body.key._type === "ED25519") {
      return PublicKey.fromStringED25519(body.key.key);
    }
    if (body.key._type === "ECDSA_SECP256K1") {
      return PublicKey.fromStringECDSA(body.key.key);
    }
  } catch {
    return null;
  }
  return null;
}

function verifyHederaMessageSignature(
  message: string,
  base64SignatureMap: string,
  publicKey: PublicKey,
): boolean {
  const signatureMap = proto.SignatureMap.decode(
    Buffer.from(base64SignatureMap, "base64"),
  );
  const pair = signatureMap.sigPair[0];
  const signature = pair?.ed25519 ?? pair?.ECDSASecp256k1;
  if (!signature) return false;
  const prefixedMessage = `\x19Hedera Signed Message:\n${message.length}${message}`;
  return publicKey.verify(Buffer.from(prefixedMessage), signature);
}

function authenticationSecret(value = process.env.CHARTER_AUTH_SECRET): string {
  if (!value || value.length < 32) {
    throw new Error(
      "CHARTER_AUTH_SECRET must be configured with at least 32 characters.",
    );
  }
  return value;
}

function signToken(payload: object, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyToken<T>(token: string, secret: string): T | null {
  const [encoded, signature, ...rest] = token.split(".");
  if (!encoded || !signature || rest.length) return null;
  const expected = createHmac("sha256", secret)
    .update(encoded)
    .digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function isFresh(
  issuedAtValue: string,
  expiresAtValue: string,
  now: Date,
  maxLifetimeMs: number,
): boolean {
  const issuedAt = new Date(issuedAtValue);
  const expiresAt = new Date(expiresAtValue);
  return (
    !Number.isNaN(issuedAt.valueOf()) &&
    !Number.isNaN(expiresAt.valueOf()) &&
    issuedAt.valueOf() <= now.valueOf() + CLOCK_SKEW_MS &&
    expiresAt.valueOf() > now.valueOf() &&
    expiresAt.valueOf() - issuedAt.valueOf() <= maxLifetimeMs
  );
}

function readCookie(header: string | null, name: string): string | null {
  for (const part of header?.split(";") ?? []) {
    const [cookieName, ...value] = part.trim().split("=");
    if (cookieName === name) return value.join("=") || null;
  }
  return null;
}

function validateAccountId(value: string): void {
  if (!isHederaAccountId(value)) {
    throw new Error("A valid Hedera account ID is required.");
  }
}

function isHederaAccountId(value: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(value);
}
