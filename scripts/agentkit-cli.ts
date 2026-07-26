import {
  agentkitSignerConfigFromEnv,
  agentkitVerifierConfigFromEnv,
  createConfiguredAgentkitClient,
  lookupConfiguredAgentHuman,
  type AgentkitTraceEvent,
} from "../src/adapters/agentkit";
import {
  agentkitIntentHash,
  type AgentkitProcurementIntent,
} from "../src/application/agentkit";

for (const path of [".env", ".env.local", ".env.agent.local"]) {
  try {
    process.loadEnvFile?.(path);
  } catch {
    // Hosted and CI environments may provide variables directly.
  }
}

const command = process.argv[2] ?? "address";

if (command === "address") {
  console.log(agentkitSignerConfigFromEnv().agentAddress);
} else if (command === "validate") {
  const config = agentkitVerifierConfigFromEnv();
  const registered = await lookupConfiguredAgentHuman();
  console.log(
    JSON.stringify(
      {
        ready: registered,
        agentAddress: config.agentAddress,
        signerChain: "eip155:480",
        agentBookNetwork: process.env.AGENTBOOK_NETWORK ?? "world",
        agentBookContractAddress:
          config.agentBookContractAddress ??
          "0xA23aB2712eA7BBa896930544C7d6636a96b944dA",
        agentBookRegistered: registered,
      },
      null,
      2,
    ),
  );
  if (!registered) process.exitCode = 1;
} else if (command === "demo") {
  const programId = process.argv[3];
  if (!programId) {
    throw new Error("Pass a program ID.");
  }
  const baseUrl = (
    process.env.YAREON_PUBLIC_URL ?? "http://127.0.0.1:3000"
  ).replace(/\/$/, "");
  const contextResponse = await fetch(
    `${baseUrl}/api/agents/agentkit/context?programId=${encodeURIComponent(programId)}`,
  );
  const context = (await contextResponse.json()) as {
    agent?: { id?: string };
    recommendedOfferId?: string;
    error?: string;
  };
  if (!contextResponse.ok || !context.agent?.id || !context.recommendedOfferId) {
    throw new Error(context.error ?? "No eligible AgentKit offer was found.");
  }

  const run = async (
    action: AgentkitProcurementIntent["action"],
    signed: boolean,
  ) => {
    const intent: AgentkitProcurementIntent = {
      programId,
      agentId: context.agent!.id!,
      offerId: context.recommendedOfferId!,
      action,
    };
    const target = new URL("/api/agents/agentkit/procure", baseUrl);
    target.searchParams.set("intent", agentkitIntentHash(intent));
    const trace: AgentkitTraceEvent[] = [];
    const init: RequestInit = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(intent),
    };
    const response = signed
      ? await createConfiguredAgentkitClient((event) => trace.push(event)).fetch(
          target,
          init,
        )
      : await fetch(target, init);
    return {
      signed,
      action,
      status: response.status,
      trace,
      result: await response.json(),
    };
  };

  const botProbe = await run("CREATE_ORDER", false);
  const overLimit = await run("AUTHORIZE_AGENT_ACTION", true);
  const valid = await run("CREATE_ORDER", true);
  console.log(
    JSON.stringify(
      {
        programId,
        selectedOfferId: context.recommendedOfferId,
        botProbe,
        overLimit,
        valid,
      },
      null,
      2,
    ),
  );
  if (
    botProbe.status !== 402 ||
    overLimit.status >= 500 ||
    valid.status >= 400
  ) {
    process.exitCode = 1;
  }
} else {
  throw new Error(`Unknown AgentKit command: ${command}`);
}
