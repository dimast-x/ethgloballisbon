import { createProgram } from "@/src/application/runtime";
import type { Program } from "@/src/protocol/types";

export async function POST(request: Request) {
  const program = (await request.json()) as Program;
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
  return Response.json(createProgram(program), { status: 201 });
}
