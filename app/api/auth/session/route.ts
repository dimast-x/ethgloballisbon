import {
  authenticatedAdministratorAccountId,
  clearAdministratorSessionCookie,
  createAdministratorSessionCookie,
  verifyAdministratorChallenge,
} from "@/src/application/wallet-auth";

export async function GET(request: Request) {
  const accountId = authenticatedAdministratorAccountId(request);
  return Response.json({
    authenticated: Boolean(accountId),
    accountId,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      accountId?: string;
      token?: string;
      signatureMap?: string;
    };
    if (!body.accountId || !body.token || !body.signatureMap) {
      return Response.json(
        { error: "Wallet account, challenge, and signature are required." },
        { status: 400 },
      );
    }
    const verified = await verifyAdministratorChallenge({
      request,
      accountId: body.accountId,
      token: body.token,
      signatureMap: body.signatureMap,
    });
    if (!verified) {
      return Response.json(
        { error: "The Hedera wallet signature could not be verified." },
        { status: 401 },
      );
    }
    return Response.json(
      { authenticated: true, accountId: body.accountId },
      {
        headers: {
          "set-cookie": createAdministratorSessionCookie(
            request,
            body.accountId,
          ),
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Authentication failed.",
      },
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  return Response.json(
    { authenticated: false },
    {
      headers: {
        "set-cookie": clearAdministratorSessionCookie(request),
      },
    },
  );
}
