import { parseExecutionMode } from "@/src/application/http";
import { getProgramSession } from "@/src/application/runtime";

export async function GET(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await context.params;
  const url = new URL(request.url);
  const programId = url.searchParams.get("programId");
  if (!programId) {
    return Response.json({ error: "programId is required." }, { status: 400 });
  }
  const session = await getProgramSession(
    programId,
    parseExecutionMode(url.searchParams.get("mode")),
  );
  if (!session) return Response.json({ error: "Program not found." }, { status: 404 });
  return Response.json({
    agentId,
    identity: session.projection.agentIdentities[agentId],
    humanBacking: session.projection.humanBacking[agentId],
    delegation: session.projection.agentDelegations[agentId],
    authorizationDecisions:
      session.projection.agentAuthorizationDecisions.filter(
        (decision) => decision.agentId === agentId,
      ),
  });
}
