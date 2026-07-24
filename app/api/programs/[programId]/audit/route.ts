import { getProgramSession } from "@/src/application/runtime";

export async function GET(
  _request: Request,
  context: { params: Promise<{ programId: string }> },
) {
  const { programId } = await context.params;
  const session = getProgramSession(programId);
  if (!session) return Response.json({ error: "Program not found" }, { status: 404 });
  return Response.json({
    source: "protocol-event-projection",
    events: session.projection.timeline,
  });
}
