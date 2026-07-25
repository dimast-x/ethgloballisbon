import {
  createUniversityRun,
  getProgramSession,
  type LiveProgramSetup,
} from "@/src/application/runtime";
import {
  authenticatedAdministratorId,
  requireLiveMutationAdmin,
  requireProgramAdministrator,
} from "@/src/application/admin-access";

export async function GET(request: Request) {
  const denied = requireLiveMutationAdmin(request);
  if (denied) return denied;
  const programId = new URL(request.url).searchParams.get("programId");
  if (!programId) {
    return Response.json({ error: "Program is required." }, { status: 400 });
  }
  const session = await getProgramSession(programId, "testnet");
  if (!session) {
    return Response.json({ error: "Program not found." }, { status: 404 });
  }
  const ownershipDenied = requireProgramAdministrator(
    request,
    session.projection,
  );
  if (ownershipDenied) return ownershipDenied;
  return Response.json(session);
}

export async function POST(request: Request) {
  try {
    const denied = requireLiveMutationAdmin(request);
    if (denied) return denied;
    const creatorId = authenticatedAdministratorId(request);
    if (!creatorId) return requireLiveMutationAdmin(request)!;
    const body = (await request.json()) as { setup?: LiveProgramSetup };
    const session = await createUniversityRun(
      "testnet",
      creatorId,
      body.setup,
    );
    return Response.json(session, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Run creation failed" },
      { status: 503 },
    );
  }
}
