import { getAgentkitProcurementContext } from "@/src/application/agentkit";

export async function GET(request: Request) {
  const programId = new URL(request.url).searchParams.get("programId");
  if (!programId) {
    return Response.json({ error: "programId is required." }, { status: 400 });
  }
  try {
    return Response.json(await getAgentkitProcurementContext(programId));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Agent context could not be loaded.",
      },
      { status: 404 },
    );
  }
}
