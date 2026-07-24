import { getProgramSession } from "@/src/application/runtime";

export async function GET(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await context.params;
  const programId = new URL(request.url).searchParams.get("programId");
  if (!programId) {
    return Response.json({ error: "programId is required" }, { status: 400 });
  }
  const session = getProgramSession(programId);
  const order = session?.projection.orders[orderId];
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  return Response.json(order);
}
