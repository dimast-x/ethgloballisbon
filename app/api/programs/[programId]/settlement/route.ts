import {
  configureProgramSettlement,
  getProgramTreasuryBalance,
  getProgramSession,
  type LiveProgramSetup,
} from "@/src/application/runtime";
import {
  authenticatedAdministratorId,
  requireLiveMutationAdmin,
  requireProgramAdministrator,
} from "@/src/application/admin-access";

export async function POST(
  request: Request,
  context: { params: Promise<{ programId: string }> },
) {
  try {
    const denied = requireLiveMutationAdmin(request);
    if (denied) return denied;

    const { programId } = await context.params;
    const session = await getProgramSession(programId, "testnet");
    if (!session) {
      return Response.json({ error: "Program not found." }, { status: 404 });
    }
    const ownershipDenied = requireProgramAdministrator(
      request,
      session.projection,
    );
    if (ownershipDenied) return ownershipDenied;

    const actorId = authenticatedAdministratorId(request);
    if (!actorId) return requireLiveMutationAdmin(request)!;
    const setup = (await request.json()) as LiveProgramSetup;
    const configured = await configureProgramSettlement(
      programId,
      setup,
      actorId,
    );
    return Response.json({
      ...configured,
      treasuryBalance: configured.projection.program
        ? await getProgramTreasuryBalance(configured.projection.program)
        : undefined,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Program settlement configuration failed.",
      },
      { status: 503 },
    );
  }
}
