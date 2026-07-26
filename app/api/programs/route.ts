import {
  authenticatedAdministratorId,
  requireLiveMutationAdmin,
} from "@/src/application/admin-access";
import {
  createProgramRun,
  getProgramTreasuryBalance,
  listAdministratorPrograms,
  type CreateProgramInput,
} from "@/src/application/runtime";

export async function GET(request: Request) {
  try {
    const denied = requireLiveMutationAdmin(request);
    if (denied) return denied;
    const creatorId = authenticatedAdministratorId(request);
    if (!creatorId) return requireLiveMutationAdmin(request)!;

    return Response.json({
      programs: await listAdministratorPrograms(creatorId),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Programs could not load.",
      },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const denied = requireLiveMutationAdmin(request);
    if (denied) return denied;
    const creatorId = authenticatedAdministratorId(request);
    if (!creatorId) return requireLiveMutationAdmin(request)!;
    const input = (await request.json()) as CreateProgramInput;
    const session = await createProgramRun(input, "testnet", creatorId);
    return Response.json(
      {
        ...session,
        treasuryBalance: session.projection.program
          ? await getProgramTreasuryBalance(session.projection.program)
          : undefined,
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Program creation failed.",
      },
      { status: 503 },
    );
  }
}
