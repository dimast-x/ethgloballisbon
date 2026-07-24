import { runProgramCommand } from "@/src/application/runtime";
import type { DemoAction } from "@/src/demo/simulator";

export async function POST(
  request: Request,
  context: { params: Promise<{ programId: string }> },
) {
  const { programId } = await context.params;
  const body = (await request.json()) as { action?: DemoAction };
  if (!body.action) {
    return Response.json({ error: "Action is required" }, { status: 400 });
  }
  try {
    return Response.json(runProgramCommand(programId, body.action));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Command failed" },
      { status: 409 },
    );
  }
}
