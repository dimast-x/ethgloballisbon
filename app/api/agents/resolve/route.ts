import {
  getProgramSession,
  runProgramCommand,
} from "@/src/application/runtime";
import {
  requireLiveMutationAdmin,
  requireProgramAdministrator,
} from "@/src/application/admin-access";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    programId?: string;
    mode?: unknown;
    identity?: { scheme?: string; name?: string };
    idempotencyKey?: string;
  };
  if (
    !body.programId ||
    !body.idempotencyKey ||
    !body.identity?.scheme ||
    !body.identity.name
  ) {
    return Response.json(
      { error: "Program, identity, and idempotency key are required." },
      { status: 400 },
    );
  }
  const denied = requireLiveMutationAdmin(request);
  if (denied) return denied;
  const session = await getProgramSession(body.programId, "testnet");
  if (!session) {
    return Response.json({ error: "Program not found." }, { status: 404 });
  }
  const ownershipDenied = requireProgramAdministrator(
    request,
    session.projection,
  );
  if (ownershipDenied) return ownershipDenied;
  const result = await runProgramCommand(
    body.programId,
    "testnet",
    {
      type: "RESOLVE_AGENT_IDENTITY",
      idempotencyKey: body.idempotencyKey,
      actor: {
        actorId: "yareon",
        role: "SYSTEM",
        actorType: "SYSTEM",
      },
      identity: {
        scheme: body.identity.scheme,
        name: body.identity.name,
      },
    },
  );
  return Response.json(result, {
    status: result.status === "FAILED" ? 409 : 200,
  });
}
