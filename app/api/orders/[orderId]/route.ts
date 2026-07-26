import { findOrder } from "@/src/application/runtime";

export async function GET(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await context.params;
  const programId = new URL(request.url).searchParams.get("programId");
  if (!programId) {
    return Response.json(
      { code: "PROGRAM_ID_REQUIRED", error: "programId is required" },
      { status: 400 },
    );
  }
  const order = await findOrder(programId, orderId, "testnet");
  if (!order) {
    return Response.json(
      { code: "ORDER_NOT_FOUND", error: "Order not found" },
      { status: 404 },
    );
  }
  return Response.json(order);
}
