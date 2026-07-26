import { getProgramSession } from "@/src/application/runtime";

export async function GET(
  request: Request,
  context: { params: Promise<{ programId: string }> },
) {
  const { programId } = await context.params;
  const session = await getProgramSession(programId, "testnet");
  if (!session) {
    return Response.json(
      { code: "PROGRAM_NOT_FOUND", error: "Program not found" },
      { status: 404 },
    );
  }
  return Response.json({
    source: "hedera-mirror-node",
    events: session.projection.timeline,
  });
}
