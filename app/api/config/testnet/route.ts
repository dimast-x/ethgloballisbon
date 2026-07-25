import { getTestnetReadiness } from "@/src/application/runtime";
import { isLiveMutationAdmin } from "@/src/application/admin-access";

export async function GET(request: Request) {
  return Response.json({
    ...(await getTestnetReadiness(true)),
    authorized: isLiveMutationAdmin(request),
  });
}
