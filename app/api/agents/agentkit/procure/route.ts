import { AGENTKIT } from "@worldcoin/agentkit";
import {
  agentkitIntentHash,
  executeAgentkitProcurementIntent,
  parseAgentkitProcurementIntent,
} from "@/src/application/agentkit";
import {
  agentkitConfigFromEnv,
  createAgentkitChallenge,
  verifyAgentkitRequest,
} from "@/src/adapters/agentkit";
import { getProgramSession } from "@/src/application/runtime";

export async function POST(request: Request) {
  try {
    const intent = parseAgentkitProcurementIntent(await request.json());
    const suppliedHash = new URL(request.url).searchParams.get("intent");
    if (!suppliedHash || suppliedHash !== agentkitIntentHash(intent)) {
      return Response.json(
        { error: "The AgentKit intent hash does not match the request body." },
        { status: 400 },
      );
    }
    if (!request.headers.get(AGENTKIT)) {
      return Response.json(createAgentkitChallenge(request.url), {
        status: 402,
        headers: { "cache-control": "no-store" },
      });
    }

    const session = await getProgramSession(intent.programId, "testnet");
    const delegation = session?.projection.agentDelegations[intent.agentId];
    if (!session || !delegation) {
      return Response.json(
        { error: "The delegated procurement agent was not found." },
        { status: 404 },
      );
    }
    const config = agentkitConfigFromEnv();
    if (!delegation.worldAgentAddress) {
      return Response.json(
        {
          error:
            "This delegation predates AgentKit. Create a new program with AgentKit configured.",
        },
        { status: 409 },
      );
    }
    const access = await verifyAgentkitRequest(request, {
      expectedAddress: config.agentAddress,
      worldChainRpcUrl: config.worldChainRpcUrl,
    });
    const execution = await executeAgentkitProcurementIntent(intent, access);
    return Response.json(
      {
        ...execution.result,
        agentkit: {
          verified: true,
          agentAddress: execution.agentAddress,
          verificationReference: execution.verificationReference,
          verificationMethod: "agentbook",
        },
      },
      { status: execution.result.status === "FAILED" ? 409 : 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AgentKit verification failed.";
    return Response.json({ error: message }, { status: 403 });
  }
}
