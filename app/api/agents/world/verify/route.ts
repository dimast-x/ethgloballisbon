import { parseExecutionMode } from "@/src/application/http";
import { verifyAgentHumanBacking } from "@/src/application/runtime";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      programId?: string;
      agentId?: string;
      idempotencyKey?: string;
      mode?: unknown;
      proof?: unknown;
    };
    if (!body.programId || !body.agentId || !body.idempotencyKey) {
      return Response.json(
        { error: "Program, agent, and idempotency key are required." },
        { status: 400 },
      );
    }
    const result = await verifyAgentHumanBacking({
      programId: body.programId,
      agentId: body.agentId,
      idempotencyKey: body.idempotencyKey,
      mode: parseExecutionMode(body.mode),
      proof: body.proof,
    });
    return Response.json(result, {
      status: result.status === "FAILED" ? 409 : 200,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Verification failed." },
      { status: 409 },
    );
  }
}
