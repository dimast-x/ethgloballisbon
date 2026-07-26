import { AGENTKIT } from "@worldcoin/agentkit";
import {
  agentkitIntentHash,
  executeAgentkitProcurementIntent,
  parseAgentkitProcurementIntent,
} from "@/src/application/agentkit";
import {
  createAgentkitChallenge,
  validateAgentAddress,
  verifyAgentkitRequest,
} from "@/src/adapters/agentkit";
import { getProgramSession } from "@/src/application/runtime";

export async function POST(request: Request) {
  try {
    const intent = parseAgentkitProcurementIntent(await request.json());
    const suppliedHash = new URL(request.url).searchParams.get("intent");
    if (!suppliedHash || suppliedHash !== agentkitIntentHash(intent)) {
      return Response.json(
        {
          code: "INTENT_HASH_MISMATCH",
          error: "The AgentKit intent hash does not match the request body.",
        },
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
        {
          code: "DELEGATED_AGENT_NOT_FOUND",
          error: "The delegated procurement agent was not found.",
        },
        { status: 404 },
      );
    }
    if (!delegation.worldAgentAddress) {
      return Response.json(
        {
          code: "DELEGATION_ADDRESS_MISSING",
          error:
            "This delegation predates AgentKit. Create a new program with AgentKit configured.",
        },
        { status: 409 },
      );
    }
    const access = await verifyAgentkitRequest(request, {
      expectedAddress: delegation.worldAgentAddress,
      worldChainRpcUrl: process.env.WORLD_CHAIN_RPC_URL,
      agentBookRpcUrl: process.env.AGENTBOOK_RPC_URL,
      agentBookContractAddress: process.env.AGENTBOOK_CONTRACT_ADDRESS
        ? (validateAgentAddress(
            process.env.AGENTBOOK_CONTRACT_ADDRESS,
          ) as `0x${string}`)
        : undefined,
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
    return Response.json(
      { code: "AGENTKIT_VERIFICATION_FAILED", error: message },
      { status: 403 },
    );
  }
}
