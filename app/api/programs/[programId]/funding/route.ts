import {
  authenticatedAdministratorId,
  requireLiveMutationAdmin,
  requireProgramAdministrator,
} from "@/src/application/admin-access";
import { authenticatedAdministratorAccountId } from "@/src/application/wallet-auth";
import {
  getProgramSession,
  recordProgramDeposit,
} from "@/src/application/runtime";
import type { Money } from "@/src/protocol/types";

export async function POST(
  request: Request,
  context: { params: Promise<{ programId: string }> },
) {
  try {
    const denied = requireLiveMutationAdmin(request);
    if (denied) return denied;

    const { programId } = await context.params;
    const session = await getProgramSession(programId, "testnet");
    if (!session) {
      return Response.json({ error: "Program not found." }, { status: 404 });
    }
    const ownershipDenied = requireProgramAdministrator(
      request,
      session.projection,
    );
    if (ownershipDenied) return ownershipDenied;

    const depositorAccountId =
      authenticatedAdministratorAccountId(request);
    const actorId = authenticatedAdministratorId(request);
    if (!depositorAccountId || !actorId) {
      return requireLiveMutationAdmin(request)!;
    }
    const body = (await request.json()) as {
      transactionId?: string;
      amount?: Money;
    };
    if (
      !body.transactionId ||
      !body.amount ||
      typeof body.amount.atomicAmount !== "string" ||
      typeof body.amount.asset !== "string" ||
      typeof body.amount.decimals !== "number"
    ) {
      return Response.json(
        { error: "A Hedera deposit transaction and amount are required." },
        { status: 400 },
      );
    }

    const result = await recordProgramDeposit({
      programId,
      transactionId: body.transactionId,
      amount: body.amount,
      depositorAccountId,
      actorId,
    });
    return Response.json(result, {
      status: result.status === "FAILED" ? 409 : 200,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Program deposit failed.",
      },
      { status: 409 },
    );
  }
}
