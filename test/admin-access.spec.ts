import { describe, expect, it } from "vitest";
import {
  authenticatedAdministratorId,
  isLiveMutationAdmin,
} from "../src/application/admin-access";

describe("live mutation access", () => {
  it("lets any authenticated user create a program they administer", () => {
    expect(
      isLiveMutationAdmin(
        new Request("https://charter.example/api", {
          headers: {
            "oai-authenticated-user-email": "OWNER@example.com",
          },
        }),
      ),
    ).toBe(true);
    expect(
      isLiveMutationAdmin(
        new Request("https://charter.example/api", {
          headers: {
            "oai-authenticated-user-email": "visitor@example.com",
          },
        }),
      ),
    ).toBe(true);
    expect(
      isLiveMutationAdmin(new Request("https://charter.example/api")),
    ).toBe(false);
  });

  it("derives a stable private creator identifier from the signed-in user", () => {
    const first = authenticatedAdministratorId(
      new Request("https://charter.example/api", {
        headers: { "oai-authenticated-user-email": "Owner@Example.com" },
      }),
    );
    const second = authenticatedAdministratorId(
      new Request("https://charter.example/api", {
        headers: { "oai-authenticated-user-email": "owner@example.com" },
      }),
    );
    expect(first).toBe(second);
    expect(first).toMatch(/^chatgpt:[a-f0-9]{64}$/);
    expect(first).not.toContain("owner@example.com");
  });
});
