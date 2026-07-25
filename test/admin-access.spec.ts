import { describe, expect, it } from "vitest";
import {
  authenticatedAdministratorId,
  isLiveMutationAdmin,
} from "../src/application/admin-access";
import { createAdministratorSessionCookie } from "../src/application/wallet-auth";

describe("live mutation access", () => {
  const secret = "test-only-secret-with-at-least-32-characters";

  it("lets an authenticated Hedera wallet create a program it administers", () => {
    const request = new Request("https://yareon.com/api");
    const cookie = createAdministratorSessionCookie(
      request,
      "0.0.12345",
      { secret },
    );
    process.env.YAREON_AUTH_SECRET = secret;

    expect(
      isLiveMutationAdmin(
        new Request("https://yareon.com/api", {
          headers: { cookie },
        }),
      ),
    ).toBe(true);
    expect(
      isLiveMutationAdmin(new Request("https://yareon.com/api")),
    ).toBe(false);
  });

  it("uses the authenticated Hedera account as the creator identifier", () => {
    process.env.YAREON_AUTH_SECRET = secret;
    const request = new Request("https://yareon.com/api");
    const cookie = createAdministratorSessionCookie(
      request,
      "0.0.12345",
      { secret },
    );
    const first = authenticatedAdministratorId(
      new Request("https://yareon.com/api", {
        headers: { cookie },
      }),
    );
    const second = authenticatedAdministratorId(
      new Request("https://yareon.com/api", {
        headers: { cookie },
      }),
    );
    expect(first).toBe(second);
    expect(first).toBe("hedera:0.0.12345");
  });
});
