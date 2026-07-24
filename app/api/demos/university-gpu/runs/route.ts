import { createUniversityRun } from "@/src/application/runtime";

export async function POST() {
  return Response.json(createUniversityRun(), { status: 201 });
}
