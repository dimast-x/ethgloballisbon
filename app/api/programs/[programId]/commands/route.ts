import {
  getProgramTreasuryBalance,
  getProgramSession,
  runProgramCommand,
} from "@/src/application/runtime";
import {
  isProtocolCommand,
} from "@/src/application/http";
import {
  authenticateApprovalCommand,
  type HederaWalletApprovalReceipt,
} from "@/src/application/approval-auth";
import {
  requireLiveMutationAdmin,
  requireProgramAdministrator,
} from "@/src/application/admin-access";

export async function POST(
  request: Request,
  context: { params: Promise<{ programId: string }> },
) {
  const { programId } = await context.params;
  const body = (await request.json()) as {
    mode?: unknown;
    command?: unknown;
    walletApproval?: HederaWalletApprovalReceipt;
  };
  if (!isProtocolCommand(body.command)) {
    return Response.json(
      { error: "A valid protocol command is required" },
      { status: 400 },
    );
  }
  if (body.command.type === "UPFUND_PROGRAM") {
    return Response.json(
      {
        error:
          "Refresh Yareon and choose “Deposit HBAR” so the transfer can be confirmed in your wallet.",
        code: "WALLET_DEPOSIT_REQUIRED",
      },
      { status: 400 },
    );
  }
  try {
    const mode = "testnet" as const;
    const denied = requireLiveMutationAdmin(request);
    if (denied) return denied;

    const session = await getProgramSession(programId, mode);
    if (!session) {
      return Response.json({ error: "Program not found" }, { status: 404 });
    }
    const ownershipDenied = requireProgramAdministrator(
      request,
      session.projection,
    );
    if (ownershipDenied) return ownershipDenied;
    const command = await authenticateApprovalCommand({
      command: body.command,
      projection: session.projection,
      mode,
      proof: body.walletApproval,
    });
    const result = await runProgramCommand(programId, mode, command);
    if (result.status === "FAILED") {
      console.warn("Program command failed:", result.error);
    }
    return Response.json({
      ...result,
      treasuryBalance: result.projection?.program
        ? await getProgramTreasuryBalance(result.projection.program)
        : undefined,
    }, {
      status: result.status === "FAILED" ? 409 : 200,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Command failed" },
      { status: 409 },
    );
  }
}
