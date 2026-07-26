import {
  authenticatedWalletAccountId,
  createMemberOrder,
  getMemberProcurementContext,
} from "@/src/application/member-access";

export async function POST(request: Request) {
  const accountId = authenticatedWalletAccountId(request);
  if (!accountId) {
    return Response.json(
      { code: "MEMBER_WALLET_REQUIRED", error: "Connect your member wallet." },
      { status: 401 },
    );
  }
  try {
    const body = (await request.json()) as {
      programId?: string;
      offerId?: string;
    };
    if (!body.programId || !body.offerId) {
      return Response.json(
        {
          code: "PURCHASE_INPUT_REQUIRED",
          error: "Program and offer are required.",
        },
        { status: 400 },
      );
    }
    const result = await createMemberOrder({
      programId: body.programId,
      offerId: body.offerId,
      accountId,
    });
    if (result.status === "FAILED") {
      return Response.json(result, { status: 409 });
    }
    return Response.json({
      result,
      context: await getMemberProcurementContext(body.programId, accountId),
    });
  } catch (error) {
    return Response.json(
      {
        code: "MEMBER_PURCHASE_FAILED",
        error:
          error instanceof Error ? error.message : "The order could not be created.",
      },
      { status: 409 },
    );
  }
}
