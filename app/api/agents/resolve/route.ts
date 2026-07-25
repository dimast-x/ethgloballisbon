import { parseExecutionMode } from "@/src/application/http";
import { runProgramCommand } from "@/src/application/runtime";

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
  const result = await runProgramCommand(
    body.programId,
    parseExecutionMode(body.mode),
    {
      type: "RESOLVE_AGENT_IDENTITY",
      idempotencyKey: body.idempotencyKey,
      actor: {
        actorId: "openprocure",
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
