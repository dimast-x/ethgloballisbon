import { getIdentityReadiness } from "@/src/application/runtime";

export async function GET(request: Request) {
  const probe = new URL(request.url).searchParams.get("probe") === "true";
  return Response.json(await getIdentityReadiness(probe));
}
