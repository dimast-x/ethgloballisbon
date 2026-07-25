import { findOrder } from "@/src/application/runtime";

export async function GET(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await context.params;
  const programId = new URL(request.url).searchParams.get("programId");
  if (!programId) {
    return Response.json({ error: "programId is required" }, { status: 400 });
  }
  const order = await findOrder(programId, orderId, "testnet");
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  return Response.json(order);
}
