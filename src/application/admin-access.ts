const AUTHENTICATED_EMAIL_HEADER = "oai-authenticated-user-email";

export function configuredAdminEmails(
  value = process.env.CHARTER_ADMIN_EMAILS,
): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isLiveMutationAdmin(
  request: Request,
  allowlist = configuredAdminEmails(),
): boolean {
  const email = request.headers
    .get(AUTHENTICATED_EMAIL_HEADER)
    ?.trim()
    .toLowerCase();
  return Boolean(email && allowlist.has(email));
}

export function requireLiveMutationAdmin(request: Request): Response | null {
  if (isLiveMutationAdmin(request)) return null;

  return Response.json(
    {
      error:
        "Live testnet changes are restricted to authenticated Charter administrators.",
    },
    { status: 403 },
  );
}
