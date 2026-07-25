import { createProgram } from "@/src/application/runtime";
import { parseExecutionMode } from "@/src/application/http";
import type { Program } from "@/src/protocol/types";

export async function POST(request: Request) {
  const body = (await request.json()) as unknown;
  const envelope = body as { mode?: unknown; program?: Program };
  const program = envelope.program ?? (body as Program);
  const mode = envelope.program
    ? parseExecutionMode(envelope.mode)
    : "simulation";
  if (
    !program?.id ||
    !program.organizationId ||
    !program.name ||
    !program.budget ||
    !program.policy
  ) {
    return Response.json(
      { error: "A complete protocol program is required" },
      { status: 400 },
    );
  }
  return Response.json(await createProgram(program, mode), { status: 201 });
}
