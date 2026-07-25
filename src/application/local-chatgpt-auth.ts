const LOCAL_AUTH_COOKIE = "charter_local_chatgpt_user";
const AUTHENTICATED_EMAIL_HEADER = "oai-authenticated-user-email";
const AUTHENTICATED_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const AUTHENTICATED_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const LOCAL_USER_EMAIL = "developer@localhost";
const LOCAL_USER_FULL_NAME = "Local Developer";

export function withLocalChatGPTAuth(request: Request): Request | Response {
  const url = new URL(request.url);
  if (!isLocalHostname(url.hostname)) return request;

  if (url.pathname === "/signin-with-chatgpt") {
    return redirectWithCookie(
      new URL(safeReturnTo(url.searchParams.get("return_to")), url.origin),
      `${LOCAL_AUTH_COOKIE}=1; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`,
    );
  }

  if (url.pathname === "/signout-with-chatgpt") {
    return redirectWithCookie(
      new URL(safeReturnTo(url.searchParams.get("return_to")), url.origin),
      `${LOCAL_AUTH_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    );
  }

  if (!hasCookie(request.headers.get("cookie"), LOCAL_AUTH_COOKIE, "1")) {
    return request;
  }

  const headers = new Headers(request.headers);
  headers.set(AUTHENTICATED_EMAIL_HEADER, LOCAL_USER_EMAIL);
  headers.set(
    AUTHENTICATED_FULL_NAME_HEADER,
    encodeURIComponent(LOCAL_USER_FULL_NAME),
  );
  headers.set(
    AUTHENTICATED_FULL_NAME_ENCODING_HEADER,
    "percent-encoded-utf-8",
  );
  return new Request(request, { headers });
}

function redirectWithCookie(location: URL, cookie: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      location: location.toString(),
      "set-cookie": cookie,
    },
  });
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

function safeReturnTo(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";

  try {
    const url = new URL(value, "http://localhost");
    if (url.origin !== "http://localhost") return "/";
    if (
      url.pathname === "/signin-with-chatgpt" ||
      url.pathname === "/signout-with-chatgpt" ||
      url.pathname === "/callback"
    ) {
      return "/";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function hasCookie(
  cookieHeader: string | null,
  name: string,
  expectedValue: string,
): boolean {
  return Boolean(
    cookieHeader
      ?.split(";")
      .map((cookie) => cookie.trim().split("="))
      .some(
        ([cookieName, ...value]) =>
          cookieName === name && value.join("=") === expectedValue,
      ),
  );
}
