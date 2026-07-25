import {
  authenticatedAdministratorId,
  requireLiveMutationAdmin,
} from "@/src/application/admin-access";
import { listAdministratorPrograms } from "@/src/application/runtime";

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
