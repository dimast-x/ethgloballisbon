import { createUniversityRun } from "@/src/application/runtime";
import { parseExecutionMode } from "@/src/application/http";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { mode?: unknown };
    const session = await createUniversityRun(parseExecutionMode(body.mode));
    return Response.json(session, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Run creation failed" },
      { status: 503 },
    );
  }
}
