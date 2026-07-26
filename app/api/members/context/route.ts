import {
  authenticatedWalletAccountId,
  getMemberProcurementContext,
} from "@/src/application/member-access";

export async function GET(request: Request) {
  const accountId = authenticatedWalletAccountId(request);
  if (!accountId) {
    return Response.json(
      { code: "MEMBER_WALLET_REQUIRED", error: "Connect your member wallet." },
      { status: 401 },
    );
  }
  const programId = new URL(request.url).searchParams.get("programId");
  if (!programId) {
    return Response.json(
      { code: "PROGRAM_ID_REQUIRED", error: "programId is required." },
      { status: 400 },
    );
  }
  try {
    return Response.json(
      await getMemberProcurementContext(programId, accountId),
    );
  } catch (error) {
    return Response.json(
      {
        code: "MEMBER_ACCESS_DENIED",
        error:
          error instanceof Error
            ? error.message
            : "Member access could not be loaded.",
      },
      { status: 403 },
    );
  }
}
