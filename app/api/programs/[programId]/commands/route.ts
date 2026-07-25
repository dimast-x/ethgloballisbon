import {
  getProgramSession,
  runProgramCommand,
} from "@/src/application/runtime";
import {
  isProtocolCommand,
  parseExecutionMode,
} from "@/src/application/http";
import {
  authenticateApprovalCommand,
  type WalletApprovalProof,
} from "@/src/application/approval-auth";

export async function POST(
  request: Request,
  context: { params: Promise<{ programId: string }> },
) {
  const { programId } = await context.params;
  const body = (await request.json()) as {
    mode?: unknown;
    command?: unknown;
    walletApproval?: WalletApprovalProof;
  };
  if (!isProtocolCommand(body.command)) {
    return Response.json(
      { error: "A valid protocol command is required" },
      { status: 400 },
    );
  }
  try {
    const mode = parseExecutionMode(body.mode);
    const session = await getProgramSession(programId, mode);
    if (!session) {
      return Response.json({ error: "Program not found" }, { status: 404 });
    }
    const command = await authenticateApprovalCommand({
      command: body.command,
      projection: session.projection,
      mode,
      proof: body.walletApproval,
    });
    const result = await runProgramCommand(programId, mode, command);
    return Response.json(result, {
      status: result.status === "FAILED" ? 409 : 200,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Command failed" },
      { status: 409 },
    );
  }
}
