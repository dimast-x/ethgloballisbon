import { authenticatedAdministratorAccountId } from "./wallet-auth";

export function authenticatedAdministratorId(request: Request): string | null {
  const accountId = authenticatedAdministratorAccountId(request);
  return accountId ? `hedera:${accountId}` : null;
}

export function isLiveMutationAdmin(request: Request): boolean {
  return Boolean(authenticatedAdministratorAccountId(request));
}

export function requireLiveMutationAdmin(request: Request): Response | null {
  if (isLiveMutationAdmin(request)) return null;

  return Response.json(
    {
      error:
        "Connect and authenticate a Hedera wallet to create or administer a live Charter program.",
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
