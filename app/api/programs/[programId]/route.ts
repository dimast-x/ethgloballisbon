import { getProgramSession } from "@/src/application/runtime";
import { parseExecutionMode } from "@/src/application/http";

export async function GET(
  request: Request,
  context: { params: Promise<{ programId: string }> },
) {
  const { programId } = await context.params;
  const mode = parseExecutionMode(new URL(request.url).searchParams.get("mode"));
  const session = await getProgramSession(programId, mode);
  if (!session) return Response.json({ error: "Program not found" }, { status: 404 });
  return Response.json(session.projection);
}
