import { describe, expect, it } from "vitest";
import { withLocalChatGPTAuth } from "../src/application/local-chatgpt-auth";

describe("local ChatGPT authentication", () => {
  it("starts a local session and redirects to a safe return path", () => {
    const result = withLocalChatGPTAuth(
      new Request(
        "http://localhost:3000/signin-with-chatgpt?return_to=%2Fprograms%3Ftab%3Daudit",
      ),
    );

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/programs?tab=audit",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "charter_local_chatgpt_user=1",
    );
  });

  it("adds the development identity only after the local session is set", () => {
    const anonymous = withLocalChatGPTAuth(
      new Request("http://localhost:3000/api/config/testnet"),
    );
    expect(anonymous).toBeInstanceOf(Request);
    expect((anonymous as Request).headers.get("oai-authenticated-user-email")).toBe(
      null,
    );

    const authenticated = withLocalChatGPTAuth(
      new Request("http://localhost:3000/api/config/testnet", {
        headers: { cookie: "charter_local_chatgpt_user=1" },
      }),
    );
    expect(authenticated).toBeInstanceOf(Request);
    expect(
      (authenticated as Request).headers.get("oai-authenticated-user-email"),
    ).toBe("developer@localhost");
  });

  it("does not handle or modify hosted requests", () => {
    const request = new Request(
      "https://charter.example/signin-with-chatgpt?return_to=%2F",
    );

    expect(withLocalChatGPTAuth(request)).toBe(request);
  });

  it("prevents local open redirects and auth-route loops", () => {
    for (const returnTo of [
      "https://evil.example",
      "//evil.example",
      "/signin-with-chatgpt",
      "/signout-with-chatgpt",
      "/callback",
    ]) {
      const result = withLocalChatGPTAuth(
        new Request(
          `http://localhost:3000/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`,
        ),
      ) as Response;

      expect(result.headers.get("location")).toBe("http://localhost:3000/");
    }
  });
});
