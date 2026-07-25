import { describe, expect, it } from "vitest";
import {
  configuredAdminEmails,
  isLiveMutationAdmin,
} from "../src/application/admin-access";

describe("live mutation access", () => {
  it("normalizes the configured administrator allowlist", () => {
    expect(
      [...configuredAdminEmails(" Owner@Example.com, admin@example.com, ")],
    ).toEqual(["owner@example.com", "admin@example.com"]);
  });

  it("requires both hosted authentication and an allowlisted email", () => {
    const allowlist = configuredAdminEmails("owner@example.com");
    expect(
      isLiveMutationAdmin(
        new Request("https://charter.example/api", {
          headers: {
            "oai-authenticated-user-email": "OWNER@example.com",
          },
        }),
        allowlist,
      ),
    ).toBe(true);
    expect(
      isLiveMutationAdmin(
        new Request("https://charter.example/api", {
          headers: {
            "oai-authenticated-user-email": "visitor@example.com",
          },
        }),
        allowlist,
      ),
    ).toBe(false);
    expect(
      isLiveMutationAdmin(
        new Request("https://charter.example/api"),
        allowlist,
      ),
    ).toBe(false);
  });
});
