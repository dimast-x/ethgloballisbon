import {
  agentkitIntentHash,
  getAgentkitProcurementContext,
  type AgentkitProcurementIntent,
} from "@/src/application/agentkit";
import {
  createConfiguredAgentkitClient,
  type AgentkitTraceEvent,
} from "@/src/adapters/agentkit";
import {
  requireLiveMutationAdmin,
  requireProgramAdministrator,
} from "@/src/application/admin-access";
import { getProgramSession } from "@/src/application/runtime";

type DemoVariant = "BOT_PROBE" | "OVER_LIMIT" | "VALID";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      programId?: string;
      variant?: DemoVariant;
    };
    if (
      !body.programId ||
      !body.variant ||
      !["BOT_PROBE", "OVER_LIMIT", "VALID"].includes(body.variant)
    ) {
      return Response.json(
        { error: "Program and a supported AgentKit demo variant are required." },
        { status: 400 },
      );
    }
    const denied = requireLiveMutationAdmin(request);
    if (denied) return denied;
    const session = await getProgramSession(body.programId, "testnet");
    if (!session) {
      return Response.json({ error: "Program not found." }, { status: 404 });
    }
    const ownershipDenied = requireProgramAdministrator(
      request,
      session.projection,
    );
    if (ownershipDenied) return ownershipDenied;

    const context = await getAgentkitProcurementContext(body.programId);
    const offerId = context.recommendedOfferId ?? context.offers[0]?.id;
    if (!offerId) {
      return Response.json(
        { error: "No policy-eligible offer is available to the agent." },
        { status: 409 },
      );
    }
    const intent: AgentkitProcurementIntent = {
      programId: body.programId,
      agentId: context.agent.id,
      offerId,
      action:
        body.variant === "OVER_LIMIT"
          ? "AUTHORIZE_AGENT_ACTION"
          : "CREATE_ORDER",
    };
    const target = new URL("/api/agents/agentkit/procure", request.url);
    target.searchParams.set("intent", agentkitIntentHash(intent));
    const trace: AgentkitTraceEvent[] = [];
    const init: RequestInit = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(intent),
      cache: "no-store",
    };
    const response =
      body.variant === "BOT_PROBE"
        ? await fetch(target, init)
        : await createConfiguredAgentkitClient((event) => trace.push(event)).fetch(
            target,
            init,
          );
    const result = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (body.variant === "BOT_PROBE") {
      trace.push({
        type: "challenge_received",
        detail:
          response.status === 402
            ? "Unsigned automation was denied before procurement execution."
            : `Expected a 402 challenge but received ${response.status}.`,
      });
    } else if (result.agentkit) {
      const agentkit = result.agentkit as {
        verificationReference?: string;
      };
      const resultProjection = result.projection as
        | {
            timeline?: Array<{
              eventType?: string;
              ledgerReference?: {
                topicId?: string;
                sequenceNumber?: number;
                transactionId?: string;
              };
            }>;
            orders?: Record<
              string,
              {
                id?: string;
                scheduleId?: string;
                paymentTransactionId?: string;
              }
            >;
          }
        | undefined;
      trace.push({
        type: "agentbook_verified",
        detail: "World AgentBook resolved the signer to a human-backed agent.",
      });
      trace.push({
        type: "policy_evaluated",
        detail:
          body.variant === "OVER_LIMIT"
            ? "Yareon evaluated and rejected the over-limit intent."
            : "Yareon accepted the derived offer under the active delegation.",
      });
      const accessEvent = resultProjection?.timeline
        ?.filter((event) => event.eventType === "AGENTKIT_ACCESS_VERIFIED")
        .at(-1);
      trace.push({
        type: "hcs_recorded",
        detail: `HCS recorded ${
          agentkit.verificationReference ?? "the hashed AgentKit reference"
        }${
          accessEvent?.ledgerReference?.sequenceNumber
            ? ` at ${accessEvent.ledgerReference.topicId ?? "topic"}#${accessEvent.ledgerReference.sequenceNumber}`
            : ""
        }.`,
      });
      if (body.variant === "VALID") {
        const createdOrder = Object.values(resultProjection?.orders ?? {}).find(
          (candidate) => candidate.id === session.orderId,
        );
        const orderEvent = resultProjection?.timeline
          ?.filter((event) => event.eventType === "ORDER_CREATED")
          .at(-1);
        trace.push({
          type: "hedera_submitted",
          detail: `Hedera recorded order ${session.orderId} through ${
            createdOrder?.paymentTransactionId ??
            createdOrder?.scheduleId ??
            orderEvent?.ledgerReference?.transactionId ??
            "the program HCS transaction"
          }.`,
        });
      }
    }
    return Response.json(
      {
        variant: body.variant,
        selectedOfferId: offerId,
        trace,
        result,
      },
      { status: body.variant === "BOT_PROBE" ? 200 : response.status },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The AgentKit demo could not run.",
      },
      { status: 409 },
    );
  }
}
