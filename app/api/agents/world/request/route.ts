import { createAgentWorldRequest } from "@/src/application/runtime";
import { requireLiveMutationAdmin } from "@/src/application/admin-access";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      programId?: string;
      agentId?: string;
      mode?: unknown;
    };
    if (!body.programId || !body.agentId) {
      return Response.json(
        { error: "Program and agent are required." },
        { status: 400 },
      );
    }
    const denied = requireLiveMutationAdmin(request);
    if (denied) return denied;
    return Response.json(
      await createAgentWorldRequest(
        body.programId,
        "testnet",
        body.agentId,
      ),
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Request failed." },
      { status: 409 },
    );
  }
}
