const AUTHENTICATED_EMAIL_HEADER = "oai-authenticated-user-email";

export function authenticatedUserEmail(request: Request): string | null {
  return (
    request.headers
      .get(AUTHENTICATED_EMAIL_HEADER)
      ?.trim()
      .toLowerCase() || null
  );
}

export function authenticatedAdministratorId(request: Request): string | null {
  const email = authenticatedUserEmail(request);
  if (!email) return null;
  return `chatgpt:${createHash("sha256").update(email).digest("hex")}`;
}

export function isLiveMutationAdmin(request: Request): boolean {
  return Boolean(authenticatedUserEmail(request));
}

export function requireLiveMutationAdmin(request: Request): Response | null {
  if (isLiveMutationAdmin(request)) return null;

  return Response.json(
    {
      error:
        "Sign in with ChatGPT to create or administer a live Charter program.",
    },
    { status: 401 },
  );
}

export function requireProgramAdministrator(
  request: Request,
  projection: import("../protocol/reducer").ProtocolProjection,
): Response | null {
  const denied = requireLiveMutationAdmin(request);
  if (denied) return denied;
  const creator = projection.timeline.find(
    (event) => event.eventType === "PROGRAM_CREATED",
  )?.actor.actorId;
  if (creator === authenticatedAdministratorId(request)) return null;
  return Response.json(
    { error: "Only the creator can administer this program." },
    { status: 403 },
  );
}

import { createHash } from "node:crypto";
