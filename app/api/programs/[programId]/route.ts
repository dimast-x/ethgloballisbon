import {
  reconcileProgramTreasuryFunding,
  getProgramSession,
} from "@/src/application/runtime";
import {
  requireLiveMutationAdmin,
  requireProgramAdministrator,
} from "@/src/application/admin-access";

export async function GET(
  request: Request,
  context: { params: Promise<{ programId: string }> },
) {
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
  return Response.json(await reconcileProgramTreasuryFunding(session));
}
