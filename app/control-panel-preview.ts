import { fromDisplay } from "@/src/protocol/money";
import type { ProgramSession } from "@/src/application/runtime";
import { advanceDemo, createDemoSession } from "@/src/demo/simulator";
import { universityGpuFixture } from "@/src/demo/fixtures";

export const controlPanelPreviewPrograms = [
  {
    programId: "program_ai_compute",
    name: "AI Research Compute Fund",
    description:
      "A policy-controlled budget for university research infrastructure.",
    status: "ACTIVE" as const,
  },
  {
    programId: "program_lab_equipment",
    name: "Lab Equipment Fund",
    description:
      "Approved purchasing for shared research equipment and infrastructure.",
    status: "ACTIVE" as const,
  },
  {
    programId: "program_field_research",
    name: "Field Research Fund",
    description:
      "Controlled supplier spending for field teams and research operations.",
    status: "ACTIVE" as const,
  },
];

export function createControlPanelPreviewSession(
  programId = controlPanelPreviewPrograms[0].programId,
): ProgramSession {
  const previewProgram =
    controlPanelPreviewPrograms.find(
      (candidate) => candidate.programId === programId,
    ) ?? controlPanelPreviewPrograms[0];
  const previewFixture = {
    ...universityGpuFixture,
    program: {
      ...universityGpuFixture.program,
      id: previewProgram.programId,
      name: previewProgram.name,
      description: previewProgram.description,
      status: previewProgram.status,
      hedera: {
        treasuryAccountId: "0.0.73000",
        fundingMode: "USER_DEPOSIT" as const,
        verifierAccountId: "0.0.73101",
        financeAccountId: "0.0.73102",
      },
    },
    allocation: {
      ...universityGpuFixture.allocation,
      id: `allocation_${previewProgram.programId}`,
      programId: previewProgram.programId,
    },
    offers: universityGpuFixture.offers.map((offer) => ({
      ...offer,
      programId: previewProgram.programId,
    })),
  };

  let demo = createDemoSession(previewFixture, {
    stableRunId: `run_control_panel_preview_${previewProgram.programId}`,
    stableOccurredAt: "2026-07-24T18:30:00.000Z",
  });

  demo = advanceDemo(demo, "REJECT_OVER_LIMIT");
  demo = advanceDemo(demo, "CREATE_ORDER");
  demo = advanceDemo(demo, "ACCEPT_ORDER");
  demo = advanceDemo(demo, "CREATE_SCHEDULE");
  demo = advanceDemo(demo, "SUBMIT_DELIVERY");

  const agentId = previewFixture.agent.agentId;
  const projection = {
    ...demo.projection,
    agentIdentities: {
      [agentId]: {
        agentId,
        publicIdentity: previewFixture.agent.publicIdentity,
        organizationReference: previewFixture.agent.organizationName,
        executionAccountId: previewFixture.agent.executionAccountId,
        role: previewFixture.agent.role,
        protocolVersion: "0.2",
        delegationHash: previewFixture.agent.delegation.integrityHash,
        resolutionHash: "sha256:preview-agent-identity",
        resolvedAt: "2026-07-24T18:30:09.000Z",
      },
    },
    humanBacking: {
      [agentId]: {
        scheme: "world-agentkit",
        verificationReference: "agentkit:preview-human-backing",
        subjectReference: agentId,
        verifiedAt: "2026-07-24T18:31:00.000Z",
      },
    },
    agentDelegations: {
      [agentId]: previewFixture.agent.delegation,
    },
    agentAuthorizationDecisions: [
      {
        agentId,
        action: "CREATE_ORDER",
        delegationId: previewFixture.agent.delegation.delegationId,
        allowed: false,
        code: "HUMAN_BACKING_REQUIRED",
        reasons: ["Human backing is required before the agent may spend."],
        evaluatedRules: ["humanBacking"],
      },
      {
        agentId,
        action: "CREATE_ORDER",
        delegationId: previewFixture.agent.delegation.delegationId,
        allowed: false,
        code: "AGENT_ORDER_LIMIT_EXCEEDED",
        reasons: ["The request exceeds the agent’s per-order limit."],
        evaluatedRules: ["maxPerOrder"],
      },
    ],
  };

  return {
    mode: "testnet",
    runId: demo.runId,
    programId: previewFixture.program.id,
    buyerId: previewFixture.buyerId,
    selectedOfferId: previewFixture.selectedOfferId,
    orderId: `order_${demo.runId.slice(-8)}`,
    agentId,
    agentIdentity: previewFixture.agent.publicIdentity,
    agentExecutionAccountId: previewFixture.agent.executionAccountId,
    projection,
    treasuryBalance: fromDisplay("11.5"),
  };
}
