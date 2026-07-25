import { getTestnetReadiness } from "@/src/application/runtime";

export async function GET() {
  return Response.json(await getTestnetReadiness(true));
}
