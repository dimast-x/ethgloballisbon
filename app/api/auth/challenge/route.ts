import { issueAdministratorChallenge } from "@/src/application/wallet-auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { accountId?: string };
    if (!body.accountId) {
      return Response.json(
        { error: "A Hedera account ID is required." },
        { status: 400 },
      );
    }
    return Response.json(
      issueAdministratorChallenge(request, body.accountId),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Authentication challenge failed.",
      },
      { status: 503 },
    );
  }
}
