import { proto } from "@hiero-ledger/proto";
import { PrivateKey } from "@hiero-ledger/sdk";
import { describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_COOKIE,
  authenticatedAdministratorAccountId,
  createAdministratorSessionCookie,
  issueAdministratorChallenge,
  verifyAdministratorChallenge,
  verifyAdministratorHcsChallenge,
} from "../src/application/wallet-auth";

describe("Hedera wallet authentication", () => {
  const secret = "test-only-secret-with-at-least-32-characters";

  it("creates and validates an administrator session cookie", () => {
    const request = new Request("https://charter.example/api/auth/session");
    const cookie = createAdministratorSessionCookie(
      request,
      "0.0.12345",
      { secret },
    );
    const authenticated = new Request("https://charter.example/api", {
      headers: { cookie },
    });

    expect(
      authenticatedAdministratorAccountId(authenticated, { secret }),
    ).toBe("0.0.12345");
    expect(
      authenticatedAdministratorAccountId(
        new Request("https://charter.example/api", {
          headers: {
            cookie: cookie.replace(
              `${ADMIN_SESSION_COOKIE}=`,
              `${ADMIN_SESSION_COOKIE}=tampered`,
            ),
          },
        }),
        { secret },
      ),
    ).toBeNull();
  });

  it("verifies a wallet challenge against its Mirror Node public key", async () => {
    const privateKey = PrivateKey.generateED25519();
    const request = new Request(
      "https://charter.example/api/auth/challenge",
    );
    const challenge = issueAdministratorChallenge(
      request,
      "0.0.12345",
      { secret },
    );
    const signature = privateKey.sign(
      Buffer.from(
        `\x19Hedera Signed Message:\n${challenge.message.length}${challenge.message}`,
      ),
    );
    const signatureMap = Buffer.from(
      proto.SignatureMap.encode(
        proto.SignatureMap.create({
          sigPair: [
            {
              pubKeyPrefix: privateKey.publicKey.toBytesRaw(),
              ed25519: signature,
            },
          ],
        }),
      ).finish(),
    ).toString("base64");

    expect(
      await verifyAdministratorChallenge({
        request: new Request(
          "https://charter.example/api/auth/session",
        ),
        accountId: "0.0.12345",
        token: challenge.token,
        signatureMap,
        secret,
        mirrorFetch: async () =>
          Response.json({
            key: {
              _type: "ED25519",
              key: privateKey.publicKey.toStringRaw(),
            },
          }),
      }),
    ).toBe(true);
  });

  it("binds challenges to the requesting origin and account", async () => {
    const request = new Request(
      "https://charter.example/api/auth/challenge",
    );
    const challenge = issueAdministratorChallenge(
      request,
      "0.0.12345",
      { secret },
    );

    expect(
      await verifyAdministratorChallenge({
        request: new Request("https://preview.example/api/auth/session"),
        accountId: "0.0.99999",
        token: challenge.token,
        signatureMap: "not-used",
        secret,
        mirrorFetch: async () => {
          throw new Error("Mirror Node should not be called.");
        },
      }),
    ).toBe(false);
  });

  it("verifies an HCS authentication challenge from the wallet payer", async () => {
    process.env.HEDERA_TOPIC_ID = "0.0.90001";
    const request = new Request(
      "https://charter.example/api/auth/challenge",
    );
    const challenge = issueAdministratorChallenge(
      request,
      "0.0.12345",
      { secret },
    );
    const mirrorFetch = async (url: string | URL | Request) => {
      const value = url.toString();
      if (value.includes("/api/v1/transactions/")) {
        return Response.json({
          transactions: [
            {
              consensus_timestamp: "1785000000.123456789",
              entity_id: "0.0.90001",
              name: "CONSENSUSSUBMITMESSAGE",
              payer_account_id: "0.0.12345",
              result: "SUCCESS",
            },
          ],
        });
      }
      return Response.json({
        message: Buffer.from(challenge.message).toString("base64"),
        payer_account_id: "0.0.12345",
        topic_id: "0.0.90001",
      });
    };

    expect(
      await verifyAdministratorHcsChallenge({
        request: new Request(
          "https://charter.example/api/auth/session",
        ),
        accountId: "0.0.12345",
        token: challenge.token,
        transactionId: "0.0.12345@1785000000.123456789",
        secret,
        mirrorFetch,
      }),
    ).toBe(true);
  });
});
