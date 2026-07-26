import {
  authenticatedWalletAccountId,
  verifyMemberIdentity,
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
    const body = (await request.json()) as { programId?: string };
    if (!body.programId) {
      return Response.json(
        { code: "PROGRAM_ID_REQUIRED", error: "programId is required." },
        { status: 400 },
      );
    }
    return Response.json({
      context: await verifyMemberIdentity({
        programId: body.programId,
        accountId,
      }),
    });
  } catch (error) {
    return Response.json(
      {
        code: "MEMBER_VERIFICATION_FAILED",
        error:
          error instanceof Error
            ? error.message
            : "Member identity verification failed.",
      },
      { status: 409 },
    );
  }
}
