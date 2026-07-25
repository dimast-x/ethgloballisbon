"use client";

import {
  ArrowRight,
  Check,
  CircleDollarSign,
  Cpu,
  CloudUpload,
  BadgeCheck,
  ChevronDown,
  FileCheck2,
  Fingerprint,
  Landmark,
  LockKeyhole,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TimerReset,
  Truck,
  WalletCards,
  X,
} from "lucide-react";
import {
  IDKitRequestWidget,
  proofOfHuman,
  type IDKitResult,
  type RpContext,
} from "@worldcoin/idkit";
import Image from "next/image";
import { useEffect, useState } from "react";
import { fromDisplay, subtract, toDisplay } from "@/src/protocol/money";
import type { EvidenceReference } from "@/src/protocol/types";
import type { Offer, Order } from "@/src/protocol/types";
import type {
  CommandResult,
  ExecutionMode,
  ProtocolCommand,
} from "@/src/application/commands";
import type {
  IdentityReadiness,
  ProgramSession,
  TestnetReadiness,
} from "@/src/application/runtime";
import type { ProtocolProjection } from "@/src/protocol/reducer";
import {
  connectHederaWallet,
  shortHederaAccount,
  signHederaSchedule,
} from "@/src/wallet/hedera-wallet-client";

const tabs = ["Agent", "Buyer", "Vendor", "Verifier", "Finance", "Audit"] as const;
type Tab = (typeof tabs)[number];
const activeLiveRunKey = "charter_active_live_program";

const eventLabels: Record<string, string> = {
  PROGRAM_CREATED: "Program activated",
  BUYER_ALLOCATED: "Buyer allocation granted",
  BUYER_ALLOCATION_UPFUNDED: "Buyer allocation upfunded",
  VENDOR_APPROVED: "Vendor approved",
  OFFER_REGISTERED: "Offer registered",
  SUPPLIER_UPDATED: "Supplier updated",
  SUPPLIER_REMOVED: "Supplier removed",
  ORDER_REJECTED_BY_POLICY: "Purchase rejected",
  ORDER_CREATED: "Order created",
  ORDER_ACCEPTED_BY_VENDOR: "Order accepted",
  PAYMENT_SCHEDULE_CREATED: "Payment scheduled",
  DELIVERY_SUBMITTED: "Delivery evidence submitted",
  DELIVERY_APPROVED: "Delivery independently verified",
  PAYMENT_SIGNATURE_ADDED: "Approval signature added",
  PAYMENT_EXECUTED: "Payment executed",
  AGENT_IDENTITY_RESOLVED: "Agent identity resolved",
  AGENT_HUMAN_BACKING_VERIFIED: "Human backing verified",
  AGENT_DELEGATION_GRANTED: "Agent delegation granted",
  AGENT_AUTHORIZATION_EVALUATED: "Agent authorization evaluated",
};

type WorldRequest = {
  appId: string;
  action: string;
  environment: "staging" | "production";
  signal: string;
  rpContext: RpContext;
};

type PublicShowcase =
  | {
      available: false;
      network: string;
      integrations?: {
        hedera?: boolean;
        world?: boolean;
        directWallets?: boolean;
      };
    }
  | {
      available: true;
      network: string;
      topicId: string;
      projection: ProtocolProjection & {
        program: NonNullable<ProtocolProjection["program"]>;
      };
      integrations: {
        hedera: true;
        world: true;
        directWallets: true;
      };
      proof: {
        world: {
          scheme: string;
          verificationReference: string;
          verifiedAt: string;
        };
        rejections: {
          missingBacking: boolean;
          delegationLimit: boolean;
        };
        order: {
          id: string;
          status: Order["status"];
          scheduleId?: string;
          paymentTransactionId?: string;
          approvals: Order["approvals"];
        };
        accounts: Record<string, string | undefined>;
      };
    };

export function CharterApp() {
  const [session, setSession] = useState<ProgramSession | null>(null);
  const mode: ExecutionMode = "testnet";
  const [activeTab, setActiveTab] = useState<Tab>("Agent");
  const [notice, setNotice] = useState(
    "Starting a fresh protocol run…",
  );
  const [operationState, setOperationState] = useState<
    "idle" | "pending" | "confirmed" | "failed"
  >("pending");
  const [readiness, setReadiness] = useState<TestnetReadiness | null>(null);
  const [identityReadiness, setIdentityReadiness] =
    useState<IdentityReadiness | null>(null);
  const [worldRequest, setWorldRequest] = useState<WorldRequest | null>(null);
  const [worldOpen, setWorldOpen] = useState(false);
  const [roleWallets, setRoleWallets] = useState<
    Partial<Record<"VERIFIER" | "FINANCE", string>>
  >({});
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [retryCommand, setRetryCommand] = useState<ProtocolCommand | null>(null);
  const [chosenOfferId, setChosenOfferId] = useState<string | null>(null);
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({});
  const [newBuyerId, setNewBuyerId] = useState("");
  const [newBuyerAmount, setNewBuyerAmount] = useState("");
  const [publicShowcase, setPublicShowcase] = useState<PublicShowcase | null>(
    null,
  );
  const [publicShowcaseLoaded, setPublicShowcaseLoaded] = useState(false);

  useEffect(() => {
    void refreshReadiness().then((next) => {
      if (next.hedera.ready && next.hedera.authorized && next.identity.ready) {
        const programId = window.localStorage.getItem(activeLiveRunKey);
        if (programId) {
          void resumeRun(programId);
        } else {
          void startRun("testnet");
        }
      } else {
        void loadPublicShowcase();
      }
    });
    // Initialization intentionally runs once; subsequent state comes from Mirror.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPublicShowcase() {
    try {
      const response = await fetch("/api/showcase", { cache: "no-store" });
      const body = (await response.json()) as PublicShowcase;
      setPublicShowcase(body);
    } catch {
      setPublicShowcase({
        available: false,
        network: "Hedera testnet",
      });
    } finally {
      setPublicShowcaseLoaded(true);
    }
  }

  async function refreshReadiness() {
    try {
      const [hederaResponse, identityResponse] = await Promise.all([
        fetch("/api/config/testnet", { cache: "no-store" }),
        fetch("/api/config/identity", { cache: "no-store" }),
      ]);
      const nextReadiness = (await hederaResponse.json()) as TestnetReadiness;
      const nextIdentity = (await identityResponse.json()) as IdentityReadiness;
      setReadiness(nextReadiness);
      setIdentityReadiness(nextIdentity);
      return { hedera: nextReadiness, identity: nextIdentity };
    } catch {
      const unavailable: TestnetReadiness = {
        ready: false,
        network: "testnet",
        issues: ["Configuration status could not be loaded."],
        publicConfig: {
          mirrorNodeUrl: "",
          walletConnectConfigured: false,
        },
      };
      setReadiness(unavailable);
      setIdentityReadiness({
        ready: false,
        issues: ["Identity configuration status could not be loaded."],
        publicConfig: {
          worldAction: "authorize-charter-agent",
          worldEnvironment: "production",
          ensRpcConfigured: false,
          expectedDelegationHash: "",
        },
      });
      return {
        hedera: unavailable,
        identity: {
          ready: false,
          issues: ["Identity configuration status could not be loaded."],
          publicConfig: {
            worldAction: "authorize-charter-agent",
            worldEnvironment: "production" as const,
            ensRpcConfigured: false,
            expectedDelegationHash: "",
          },
        },
      };
    }
  }

  async function startRun(nextMode: ExecutionMode) {
    setOperationState("pending");
    setNotice("Creating a fresh run and confirming its initialization through Mirror Node…");
    try {
      const response = await fetch("/api/demos/university-gpu/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
      });
      const body = (await response.json()) as ProgramSession & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Run creation failed.");
      hydrateSession(body);
      window.localStorage.setItem(activeLiveRunKey, body.programId);
      setOperationState("confirmed");
      setNotice("Live run confirmed by Hedera Mirror Node.");
    } catch (error) {
      setOperationState("failed");
      setNotice(error instanceof Error ? error.message : "Run creation failed.");
    }
  }

  async function resumeRun(programId: string) {
    setOperationState("pending");
    setNotice("Reconstructing the active run through Mirror Node…");
    try {
      const response = await fetch(
        `/api/demos/university-gpu/runs?programId=${encodeURIComponent(programId)}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as ProgramSession & { error?: string };
      if (!response.ok) {
        window.localStorage.removeItem(activeLiveRunKey);
        await startRun("testnet");
        return;
      }
      hydrateSession(body);
      setOperationState("confirmed");
      setNotice("Active live run reconstructed from Hedera Mirror Node.");
    } catch (error) {
      setOperationState("failed");
      setNotice(error instanceof Error ? error.message : "Run recovery failed.");
    }
  }

  function hydrateSession(body: ProgramSession) {
      setSession(body);
      setRoleWallets({});
      setEvidenceFile(null);
      setRetryCommand(null);
      setChosenOfferId(body.selectedOfferId);
      setWorldRequest(null);
      setWorldOpen(false);
      setActiveTab("Agent");
  }

  if (!session?.projection.program) {
    if (publicShowcase?.available) {
      return <VerifiedPublicProgram data={publicShowcase} />;
    }
    const issues = [
      ...(readiness?.issues ?? []),
      ...(identityReadiness?.issues ?? []),
    ];
    const waitingForPublicProof =
      readiness && !readiness.authorized && !publicShowcaseLoaded;
    const unavailableForPublic =
      readiness && !readiness.authorized && publicShowcaseLoaded;
    return (
      <main className="shell loading-shell">
        <div className="loading-card">
          {waitingForPublicProof ? <RefreshCw className="spin" size={24} /> : <ShieldCheck size={24} />}
          <strong>
            {waitingForPublicProof
              ? "Loading verified public program"
              : unavailableForPublic
                ? "No verified live program is published"
                : issues.length
                  ? "Live system is not ready"
                  : "Preparing live Charter"}
          </strong>
          <span>
            {waitingForPublicProof
              ? "Reconstructing public state from Hedera Mirror Node…"
              : unavailableForPublic
                ? "Charter does not substitute simulated data. An administrator can publish a completed Hedera testnet program after its ledger evidence passes verification."
                : issues.join(" ") || notice}
          </span>
        </div>
      </main>
    );
  }

  const activeSession = session;
  const projection = activeSession.projection;
  const program = projection.program!;
  const allocation = projection.allocations[activeSession.buyerId];
  const order = projection.orders[activeSession.orderId];
  const offers = Object.values(projection.offers);
  const selectedOffer =
    projection.offers[chosenOfferId ?? activeSession.selectedOfferId] ??
    projection.offers[activeSession.selectedOfferId];
  const available = subtract(
    subtract(allocation.totalLimit, allocation.committed),
    allocation.paid,
  );

  const completed = order?.status === "PAYMENT_EXECUTED";
  const progress = (() => {
    const states = [
      "CREATED",
      "VENDOR_ACCEPTED",
      "PAYMENT_SCHEDULED",
      "DELIVERY_SUBMITTED",
      "DELIVERY_APPROVED",
      "PAYMENT_EXECUTED",
    ];
    return order ? Math.max(1, states.indexOf(order.status) + 1) : 0;
  })();

  function actor(role: string, actorId: string) {
    return { actorId, role, actorType: "HUMAN" as const };
  }

  function agentActor() {
    const resolvedIdentity =
      projection.agentIdentities[activeSession.agentId];
    return {
      actorId: activeSession.agentId,
      role: "PROCUREMENT_AGENT",
      actorType: "AGENT" as const,
      hederaAccountId:
        resolvedIdentity?.executionAccountId ??
        activeSession.agentExecutionAccountId,
    };
  }

  function commandFor(
    action:
      | "REJECT_OVER_LIMIT"
      | "CREATE_ORDER"
      | "ACCEPT_ORDER"
      | "SUBMIT_DELIVERY"
      | "APPROVE_DELIVERY"
      | "APPROVE_FINANCE",
    evidence?: EvidenceReference,
  ): ProtocolCommand {
    const idempotencyKey = `${activeSession.runId}:${action.toLowerCase()}`;
    if (action === "REJECT_OVER_LIMIT") {
      return {
        type: "TEST_PURCHASE_POLICY",
        idempotencyKey,
        actor: actor("BUYER", activeSession.buyerId),
        buyerId: activeSession.buyerId,
        vendorId: selectedOffer.vendorId,
        category: selectedOffer.category,
        amount: { ...selectedOffer.amount, atomicAmount: "550000000" },
      };
    }
    if (action === "CREATE_ORDER") {
      return {
        type: "CREATE_ORDER",
        idempotencyKey,
        actor: actor("BUYER", activeSession.buyerId),
        orderId: activeSession.orderId,
        buyerId: activeSession.buyerId,
        vendorId: selectedOffer.vendorId,
        offerId: selectedOffer.id,
        category: selectedOffer.category,
        amount: selectedOffer.amount,
      };
    }
    if (action === "ACCEPT_ORDER") {
      return {
        type: "ACCEPT_ORDER",
        idempotencyKey,
        actor: actor("VENDOR", selectedOffer.vendorId),
        orderId: activeSession.orderId,
      };
    }
    if (action === "SUBMIT_DELIVERY") {
      if (!evidence) throw new Error("Delivery evidence is required.");
      return {
        type: "SUBMIT_DELIVERY",
        idempotencyKey,
        actor: actor("VENDOR", selectedOffer.vendorId),
        orderId: activeSession.orderId,
        evidence,
      };
    }
    const delivery = action === "APPROVE_DELIVERY";
    return {
      type: delivery ? "APPROVE_DELIVERY" : "APPROVE_FINANCE",
      idempotencyKey,
      actor: actor(
        delivery ? "DELIVERY_VERIFIER" : "FINANCE",
        delivery ? "verifier" : "finance",
      ),
      orderId: activeSession.orderId,
      approvalReference: "hedera-walletconnect:pending",
    } as ProtocolCommand;
  }

  async function run(
    action:
      | "REJECT_OVER_LIMIT"
      | "CREATE_ORDER"
      | "ACCEPT_ORDER"
      | "SUBMIT_DELIVERY",
    message: string,
    evidence?: EvidenceReference,
  ) {
    try {
      await submitCommand(commandFor(action, evidence), message);
    } catch (error) {
      setOperationState("failed");
      setNotice(
        error instanceof Error ? error.message : "Action could not complete.",
      );
    }
  }

  async function submitCommand(
    command: ProtocolCommand,
    successMessage: string,
    walletApproval?: { accountId: string; transactionId: string },
  ) {
    setOperationState("pending");
    setRetryCommand(command);
    setNotice("Submitted to Hedera; waiting for Mirror Node confirmation…");
    const response = await fetch(
      `/api/programs/${encodeURIComponent(program.id)}/commands`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, command, walletApproval }),
      },
    );
    const result = (await response.json()) as CommandResult & { error?: string };
    if (!response.ok || result.status === "FAILED") {
      const retryable = result.error?.retryable;
      setOperationState("failed");
      if (!retryable) setRetryCommand(null);
      throw new Error(
        result.error?.message ?? result.error ?? "Command failed.",
      );
    }
    setSession((current) =>
      current && result.projection
        ? { ...current, projection: result.projection }
        : current,
    );
    setRetryCommand(null);
    setOperationState("confirmed");
    setNotice(successMessage);
  }

  async function connectRoleWallet(role: "VERIFIER" | "FINANCE") {
    setOperationState("pending");
    setNotice("Open a Hedera wallet and connect the configured testnet account.");
    try {
      const expectedAccountId =
        role === "VERIFIER"
          ? readiness?.publicConfig.verifierAccountId
          : readiness?.publicConfig.financeAccountId;
      if (!expectedAccountId) {
        throw new Error(`The ${role} Hedera account is not configured.`);
      }
      const accountId = await connectHederaWallet(expectedAccountId);
      const otherRole = role === "VERIFIER" ? "FINANCE" : "VERIFIER";
      if (roleWallets[otherRole] === accountId) {
        throw new Error("Verifier and Finance require different Hedera accounts.");
      }
      setRoleWallets((current) => ({ ...current, [role]: accountId }));
      setOperationState("confirmed");
      setNotice(
        `${role} Hedera account ${shortHederaAccount(accountId)} connected.`,
      );
    } catch (error) {
      setOperationState("failed");
      setNotice(
        error instanceof Error ? error.message : "Hedera wallet connection failed.",
      );
    }
  }

  async function approve(role: "VERIFIER" | "FINANCE") {
    const action =
      role === "VERIFIER" ? "APPROVE_DELIVERY" : "APPROVE_FINANCE";
    const command = commandFor(action);
    if (!order?.scheduleId) {
      setNotice("The payment schedule is not ready.");
      return;
    }
    const walletAccountId = roleWallets[role];
    if (!walletAccountId) {
      setNotice(`Connect the ${role} Hedera account first.`);
      return;
    }
    try {
      setOperationState("pending");
      setNotice("Review and execute the schedule signature in your Hedera wallet.");
      const receipt = await signHederaSchedule({
        accountId: walletAccountId,
        scheduleId: order.scheduleId,
      });
      await submitCommand(
        command,
        role === "VERIFIER"
          ? "Hedera confirmed the verifier wallet signature."
          : "Hedera confirmed the finance signature and released settlement.",
        receipt,
      );
    } catch (error) {
      setOperationState("failed");
      setNotice(error instanceof Error ? error.message : "Approval failed.");
    }
  }

  async function submitEvidence() {
    if (!evidenceFile) {
      setNotice("Choose a delivery evidence file first.");
      return;
    }
    const digest = await crypto.subtle.digest(
      "SHA-256",
      await evidenceFile.arrayBuffer(),
    );
    const hash = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    await run(
      "SUBMIT_DELIVERY",
      "Evidence hashed; only its reference entered the protocol.",
      {
        hash: `sha256:${hash}`,
        mimeType: evidenceFile.type || "application/octet-stream",
        size: evidenceFile.size,
        submittedBy: selectedOffer.vendorId,
        submittedAt: new Date().toISOString(),
      },
    );
  }

  async function upfundBuyer(buyerId: string) {
    const value = allocationAmounts[buyerId]?.trim();
    if (!value || Number(value) <= 0) {
      setOperationState("failed");
      setNotice("Enter a positive amount to append to this buyer.");
      return;
    }
    await submitCommand(
      {
        type: "UPFUND_BUYER_ALLOCATION",
        idempotencyKey: `${activeSession.runId}:upfund:${buyerId}:${crypto.randomUUID()}`,
        actor: actor("ADMIN", "program-admin"),
        buyerId,
        amount: fromDisplay(value, program.budget.asset, program.budget.decimals),
      },
      `${buyerId}'s allocation increased by ${value} ${program.budget.asset}.`,
    );
    setAllocationAmounts((current) => ({ ...current, [buyerId]: "" }));
  }

  async function addBuyerAllocation() {
    const buyerId = newBuyerId.trim();
    const value = newBuyerAmount.trim();
    if (!buyerId || !value || Number(value) <= 0) {
      setOperationState("failed");
      setNotice("Enter a buyer ID and a positive initial allocation.");
      return;
    }
    const zero = fromDisplay("0", program.budget.asset, program.budget.decimals);
    await submitCommand(
      {
        type: "ALLOCATE_BUYER",
        idempotencyKey: `${activeSession.runId}:allocate:${buyerId}:${crypto.randomUUID()}`,
        actor: actor("ADMIN", "program-admin"),
        allocation: {
          id: `allocation_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
          programId: program.id,
          buyerId,
          totalLimit: fromDisplay(
            value,
            program.budget.asset,
            program.budget.decimals,
          ),
          committed: zero,
          paid: zero,
          allowedCategories: [...program.policy.allowedCategories],
        },
      },
      `${buyerId} now has a live ${value} ${program.budget.asset} allocation.`,
    );
    setNewBuyerId("");
    setNewBuyerAmount("");
  }

  async function runAgentOrder(kind: "UNVERIFIED" | "OVER_LIMIT" | "VALID") {
    const amount =
      kind === "OVER_LIMIT"
        ? { ...selectedOffer.amount, atomicAmount: "420000000" }
        : selectedOffer.amount;
    const command: ProtocolCommand = {
      type: "CREATE_ORDER",
      idempotencyKey: `${activeSession.runId}:agent-order:${kind.toLowerCase()}`,
      actor: agentActor(),
      orderId: activeSession.orderId,
      buyerId: activeSession.buyerId,
      vendorId: selectedOffer.vendorId,
      offerId: selectedOffer.id,
      category: selectedOffer.category,
      amount,
    };
    await submitCommand(
      command,
      kind === "VALID"
        ? "Agent authorization passed. The 3.5 HBAR order was created."
        : kind === "OVER_LIMIT"
          ? "The 4.2 HBAR agent request was rejected by its 4 HBAR delegation."
          : "The agent request was rejected because human backing is missing.",
    );
  }

  async function beginWorldVerification() {
    if (mode === "testnet" && !identityReadiness?.ready) {
      setOperationState("failed");
      setNotice(identityReadiness?.issues.join(" ") || "Identity integrations are not ready.");
      return;
    }
    const response = await fetch("/api/agents/world/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode,
        programId: program.id,
        agentId: activeSession.agentId,
      }),
    });
    const request = (await response.json()) as WorldRequest & { error?: string };
    if (!response.ok) {
      setOperationState("failed");
      setNotice(request.error ?? "World verification request failed.");
      return;
    }
    setWorldRequest(request);
    setWorldOpen(true);
  }

  async function recordWorldVerification(proof: IDKitResult | undefined) {
    setOperationState("pending");
    setNotice("Verifying the World proof on the server...");
    const response = await fetch("/api/agents/world/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode,
        programId: program.id,
        agentId: activeSession.agentId,
        idempotencyKey: `${activeSession.runId}:world-verification`,
        proof,
      }),
    });
    const result = (await response.json()) as CommandResult & { error?: string };
    if (!response.ok || !result.projection) {
      setOperationState("failed");
      throw new Error(result.error?.toString() ?? result.error ?? "World verification failed.");
    }
    setSession({ ...activeSession, projection: result.projection });
    setOperationState("confirmed");
    setNotice("World verified a unique human backing this agent.");
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand live-brand" aria-label="Charter">
          <span className="brand-mark">CH</span>
          <span>Charter</span>
          <small>Guided live run</small>
        </div>
        <div className="network-state">
          <span className="network-dot" />
          Hedera Testnet · World production
        </div>
        <button
          className="reset-button"
          onClick={() => void startRun(mode)}
          disabled={operationState === "pending"}
        >
          <RefreshCw size={15} />
          New run
        </button>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <ShieldCheck size={15} />
            Policy-controlled organizational spending
          </div>
          <h1>
            Choice at the edge.
            <br />
            <span>Control at the core.</span>
          </h1>
          <p>
            A reusable procurement protocol for bounded buying authority,
            independent delivery verification, approval-gated settlement, and a
            tamper-evident operational history.
          </p>
        </div>
        <div className="protocol-flow" aria-label="Protocol trust flow">
          <FlowNode icon={<Fingerprint size={18} />} label="Authority" index="01" />
          <FlowNode icon={<FileCheck2 size={18} />} label="Evidence" index="02" />
          <FlowNode icon={<LockKeyhole size={18} />} label="Approvals" index="03" />
          <FlowNode icon={<Landmark size={18} />} label="Settlement" index="04" />
        </div>
      </section>

      <section className="program-strip">
        <div className="program-title">
          <span>Reference implementation</span>
          <h2>{program.name}</h2>
          <p>{program.description}</p>
        </div>
        <Metric label="Program budget" value={`${toDisplay(program.budget)} HBAR`} />
        <Metric label="Buyer allocation" value={`${toDisplay(allocation.totalLimit)} HBAR`} />
        <Metric
          label="Available now"
          value={`${toDisplay(available)} HBAR`}
          accent
        />
        <div className="run-id">
          <span>Run</span>
          <code>{activeSession.runId}</code>
        </div>
      </section>

      <div className="notice" role="status">
        <span>{notice}</span>
        <span className="mirror-status">
          <TimerReset size={14} />
          {operationState === "pending"
            ? "Pending confirmation"
            : operationState === "failed"
              ? "Action needs attention"
              : "Mirror projection current"}
        </span>
        {operationState === "failed" && retryCommand && (
          <button
            className="retry-button"
            onClick={() => {
              if (retryCommand.type === "APPROVE_DELIVERY") {
                void approve("VERIFIER");
              } else if (retryCommand.type === "APPROVE_FINANCE") {
                void approve("FINANCE");
              } else {
                void submitCommand(
                  retryCommand,
                  "Retry confirmed successfully.",
                );
              }
            }}
          >
            Retry
          </button>
        )}
      </div>

      <LiveRunGuide
        projection={projection}
        order={order}
        onNavigate={setActiveTab}
      />

      <section className="workspace">
        <nav className="tabs" aria-label="Protocol roles">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={activeTab === tab ? "active" : ""}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
              {tab === "Audit" && (
                <span className="tab-count">{projection.timeline.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="workspace-body">
          {activeTab === "Agent" && (
            <AgentPanel
              session={activeSession}
              attestation={projection.humanBacking[activeSession.agentId]}
              delegation={projection.agentDelegations[activeSession.agentId]}
              decisions={projection.agentAuthorizationDecisions.filter(
                (decision) => decision.agentId === activeSession.agentId,
              )}
              orderExists={Boolean(order)}
              liveReady={Boolean(identityReadiness?.ready)}
              liveIssues={identityReadiness?.issues ?? []}
              onUnverified={() => void runAgentOrder("UNVERIFIED")}
              onVerify={() => void beginWorldVerification()}
              onOverLimit={() => void runAgentOrder("OVER_LIMIT")}
              onValid={() => void runAgentOrder("VALID")}
            />
          )}
          {activeTab === "Buyer" && (
            <BuyerPanel
              offers={offers}
              vendors={projection.vendors}
              allocations={projection.allocations}
              asset={program.budget.asset}
              allocationAmounts={allocationAmounts}
              newBuyerId={newBuyerId}
              newBuyerAmount={newBuyerAmount}
              selectedOfferId={selectedOffer.id}
              orderExists={Boolean(order)}
              rejected={projection.timeline.some(
                (event) => event.eventType === "ORDER_REJECTED_BY_POLICY",
              )}
              onSelect={setChosenOfferId}
              onAllocationAmount={(buyerId, value) =>
                setAllocationAmounts((current) => ({
                  ...current,
                  [buyerId]: value,
                }))
              }
              onNewBuyerId={setNewBuyerId}
              onNewBuyerAmount={setNewBuyerAmount}
              onUpfund={(buyerId) =>
                void upfundBuyer(buyerId).catch((error) => {
                  setOperationState("failed");
                  setNotice(
                    error instanceof Error
                      ? error.message
                      : "The allocation could not be updated.",
                  );
                })
              }
              onAddBuyer={() =>
                void addBuyerAllocation().catch((error) => {
                  setOperationState("failed");
                  setNotice(
                    error instanceof Error
                      ? error.message
                      : "The buyer could not be added.",
                  );
                })
              }
              onReject={() =>
                run(
                  "REJECT_OVER_LIMIT",
                  "5.5 HBAR rejected: buyer allocation is limited to 5 HBAR.",
                )
              }
              onCreate={() =>
                run(
                  "CREATE_ORDER",
                  `${toDisplay(selectedOffer.amount)} HBAR order authorized with ${projection.vendors[selectedOffer.vendorId]?.name ?? selectedOffer.vendorId}.`,
                )
              }
            />
          )}
          {activeTab === "Vendor" && (
            <VendorPanel
              order={order}
              vendors={projection.vendors}
              file={evidenceFile}
              onFile={setEvidenceFile}
              onAccept={() =>
                run(
                  "ACCEPT_ORDER",
                  `${projection.vendors[selectedOffer.vendorId]?.name ?? selectedOffer.vendorId} accepted the order.`,
                )
              }
              onSubmit={submitEvidence}
            />
          )}
          {activeTab === "Verifier" && (
            <ApprovalPanel
              role="VERIFIER"
              title="Independent delivery verification"
              description="Review the delivery digest, authenticate the role wallet, then add the first required approval."
              connected={
                Boolean(roleWallets.VERIFIER)
              }
              accountId={roleWallets.VERIFIER}
              order={order}
              onConnect={() => void connectRoleWallet("VERIFIER")}
              onApprove={() => void approve("VERIFIER")}
            />
          )}
          {activeTab === "Finance" && (
            <ApprovalPanel
              role="FINANCE"
              title="Treasury release"
              description="Confirm the approved evidence and add the second threshold signature to release settlement."
              connected={
                Boolean(roleWallets.FINANCE)
              }
              accountId={roleWallets.FINANCE}
              order={order}
              onConnect={() => void connectRoleWallet("FINANCE")}
              onApprove={() => void approve("FINANCE")}
            />
          )}
          {activeTab === "Audit" && (
            <AuditPanel
              events={projection.timeline}
              topicId={readiness?.publicConfig.topicId}
              order={order}
              agentIdentity={projection.agentIdentities[activeSession.agentId]}
              agentAttestation={projection.humanBacking[activeSession.agentId]}
              delegation={projection.agentDelegations[activeSession.agentId]}
            />
          )}
        </div>
      </section>
      {worldRequest && (
        <IDKitRequestWidget
          open={worldOpen}
          onOpenChange={setWorldOpen}
          app_id={worldRequest.appId as `app_${string}`}
          action={worldRequest.action}
          rp_context={worldRequest.rpContext}
          environment={worldRequest.environment}
          allow_legacy_proofs={false}
          preset={proofOfHuman({ signal: worldRequest.signal })}
          handleVerify={recordWorldVerification}
          onSuccess={() => setWorldOpen(false)}
          onError={() => {
            setOperationState("failed");
            setNotice("World verification did not complete.");
          }}
        />
      )}

      <section className="settlement-rail">
        <div>
          <span>Settlement state</span>
          <strong>{completed ? "Payment executed" : order?.status?.replaceAll("_", " ") ?? "No order"}</strong>
        </div>
        <div className="progress-track" aria-label={`${progress} of 6 settlement steps`}>
          {Array.from({ length: 6 }).map((_, index) => (
            <span key={index} className={index < progress ? "complete" : ""} />
          ))}
        </div>
        <div className="threshold">
          <LockKeyhole size={18} />
          <span>
            Treasury threshold
            <strong>{order?.approvals.length ?? 0} / 2 signatures</strong>
          </span>
        </div>
        {completed && (
          <div className="paid-badge">
            <Check size={17} />
            3.5 HBAR settled
          </div>
        )}
      </section>
    </main>
  );
}

function VerifiedPublicProgram({
  data,
}: {
  data: Extract<PublicShowcase, { available: true }>;
}) {
  const program = data.projection.program;
  const order = Object.values(data.projection.orders).find(
    (candidate) => candidate.id === data.proof.order.id,
  );
  const allocations = Object.values(data.projection.allocations);
  const allocated = allocations.reduce(
    (total, item) => total + BigInt(item.totalLimit.atomicAmount),
    0n,
  );
  const allocatedMoney = {
    ...program.budget,
    atomicAmount: allocated.toString(),
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand live-brand" aria-label="Charter">
          <span className="brand-mark">CH</span>
          <span>Charter</span>
          <small>Verified public program</small>
        </div>
        <div className="network-state">
          <span className="network-dot" />
          Hedera Testnet · read only
        </div>
        <a
          className="reset-button"
          href={`https://hashscan.io/testnet/topic/${data.topicId}`}
          target="_blank"
          rel="noreferrer"
        >
          Inspect on HashScan <ArrowRight size={15} />
        </a>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><ShieldCheck size={15} /> Public ledger proof</div>
          <h1>Real procurement state.<br /><span>Independently verifiable.</span></h1>
          <p>
            This completed program is reconstructed from Hedera Mirror Node.
            Every displayed event, approval, and settlement reference belongs
            to the published testnet run.
          </p>
        </div>
        <div className="protocol-flow" aria-label="Verified integration status">
          <FlowNode icon={<Fingerprint size={18} />} label="World proof" index="01" />
          <FlowNode icon={<FileCheck2 size={18} />} label="HCS events" index="02" />
          <FlowNode icon={<WalletCards size={18} />} label="Wallets" index="03" />
          <FlowNode icon={<Landmark size={18} />} label="Settlement" index="04" />
        </div>
      </section>

      <section className="program-strip">
        <div className="program-title">
          <span>Published program</span>
          <h2>{program.name}</h2>
          <p>{program.description}</p>
        </div>
        <Metric label="Program budget" value={`${toDisplay(program.budget)} ${program.budget.asset}`} />
        <Metric label="Buyer allocations" value={`${toDisplay(allocatedMoney)} ${program.budget.asset}`} />
        <Metric label="Settlement" value={order ? `${toDisplay(order.amount)} ${order.amount.asset}` : "Verified"} accent />
        <div className="run-id"><span>Status</span><code>{data.proof.order.status}</code></div>
      </section>

      <div className="notice" role="status">
        <span>Mirror Node confirms the published program and settlement evidence.</span>
        <span className="mirror-status"><Check size={14} /> Public projection current</span>
      </div>

      <div className="audit-links public-account-links">
        <span>Verified Hedera accounts</span>
        {Object.entries(data.proof.accounts).map(([role, accountId]) =>
          accountId ? (
            <a
              href={`https://hashscan.io/testnet/account/${accountId}`}
              target="_blank"
              rel="noreferrer"
              key={role}
            >
              {role} ↗
            </a>
          ) : null,
        )}
      </div>

      <section className="workspace">
        <nav className="tabs" aria-label="Public proof sections">
          <button className="active">Audit <span className="tab-count">{data.projection.timeline.length}</span></button>
        </nav>
        <div className="workspace-body">
          <AuditPanel
            events={data.projection.timeline}
            topicId={data.topicId}
            order={order}
            agentIdentity={Object.values(data.projection.agentIdentities)[0]}
            agentAttestation={Object.values(data.projection.humanBacking)[0]}
            delegation={Object.values(data.projection.agentDelegations)[0]}
          />
        </div>
      </section>
    </main>
  );
}

function LiveRunGuide({
  projection,
  order,
  onNavigate,
}: {
  projection: import("@/src/protocol/reducer").ProtocolProjection;
  order?: Order;
  onNavigate: (tab: Tab) => void;
}) {
  const complete = [
    Boolean(
      projection.program &&
        projection.timeline.some(
          (event) =>
            event.eventType === "PROGRAM_CREATED" &&
            typeof event.ledgerReference?.sequenceNumber === "number",
        ),
    ),
    projection.agentAuthorizationDecisions.some(
      (decision) => decision.code === "HUMAN_BACKING_REQUIRED",
    ),
    Object.keys(projection.humanBacking).length > 0,
    projection.agentAuthorizationDecisions.some(
      (decision) => decision.code === "AGENT_ORDER_LIMIT_EXCEEDED",
    ),
    Boolean(order),
    Boolean(order?.scheduleId),
    Boolean(order?.evidence),
    Boolean(
      order?.approvals.some(
        (approval) => approval.role === "DELIVERY_VERIFIER",
      ),
    ),
    Boolean(order?.approvals.some((approval) => approval.role === "FINANCE")),
    order?.status === "PAYMENT_EXECUTED",
  ];
  const steps: Array<{ label: string; tab: Tab }> = [
    { label: "Program on HCS", tab: "Audit" },
    { label: "Backing rejection", tab: "Agent" },
    { label: "World proof", tab: "Agent" },
    { label: "Limit rejection", tab: "Agent" },
    { label: "Valid agent order", tab: "Agent" },
    { label: "Schedule created", tab: "Vendor" },
    { label: "Evidence hashed", tab: "Vendor" },
    { label: "Verifier wallet", tab: "Verifier" },
    { label: "Finance wallet", tab: "Finance" },
    { label: "Mirror proof", tab: "Audit" },
  ];
  const current = complete.findIndex((value) => !value);

  return (
    <section className="live-run-guide" aria-label="Guided live integration run">
      <div className="live-run-guide-heading">
        <span>Resumable live sequence</span>
        <strong>
          {complete.filter(Boolean).length} / {steps.length} ledger-backed steps
        </strong>
      </div>
      <ol>
        {steps.map((step, index) => {
          const state = complete[index]
            ? "complete"
            : index === current
              ? "current"
              : "locked";
          return (
            <li className={state} key={step.label}>
              <button onClick={() => onNavigate(step.tab)}>
                <span>{complete[index] ? <Check size={13} /> : index + 1}</span>
                {step.label}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function FlowNode({
  icon,
  label,
  index,
}: {
  icon: React.ReactNode;
  label: string;
  index: string;
}) {
  return (
    <div className="flow-node">
      <span className="flow-index">{index}</span>
      <span className="flow-icon">{icon}</span>
      <strong>{label}</strong>
      {index !== "04" && <ArrowRight className="flow-arrow" size={16} />}
    </div>
  );
}

function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={`metric ${accent ? "accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AgentPanel({
  session,
  attestation,
  delegation,
  decisions,
  orderExists,
  liveReady,
  liveIssues,
  onUnverified,
  onVerify,
  onOverLimit,
  onValid,
}: {
  session: ProgramSession;
  attestation?: import("@/src/protocol/types").HumanBackingAttestation;
  delegation?: import("@/src/protocol/types").AgentDelegation;
  decisions: import("@/src/protocol/types").AgentAuthorizationDecision[];
  orderExists: boolean;
  liveReady: boolean;
  liveIssues: string[];
  onUnverified: () => void;
  onVerify: () => void;
  onOverLimit: () => void;
  onValid: () => void;
}) {
  const missingHumanRejected = decisions.some(
    (decision) => decision.code === "HUMAN_BACKING_REQUIRED",
  );
  const limitRejected = decisions.some(
    (decision) => decision.code === "AGENT_ORDER_LIMIT_EXCEEDED",
  );
  const verified = Boolean(attestation);

  return (
    <div className="agent-layout">
      <div className="agent-intro">
        <PanelHeading
          kicker="Delegated agent authority"
          title="Prove human backing before execution"
          description="World proof and organizational delegation are independent checks. ENS portability is intentionally deferred to the next iteration."
        />
        <div className="agent-identity-card">
          <div className="agent-name">
            <Fingerprint size={21} />
            <div>
              <span>Organization-issued agent</span>
              <strong>{session.agentId}</strong>
            </div>
          </div>
          <dl>
            <div>
              <dt>Agent ID</dt>
              <dd>{session.agentId}</dd>
            </div>
            <div>
              <dt>Organization</dt>
              <dd>{delegation?.organizationId ?? "Not available"}</dd>
            </div>
            <div>
              <dt>Delegated principal</dt>
              <dd>{delegation?.principalId ?? "Not available"}</dd>
            </div>
            <div>
              <dt>Identity boundary</dt>
              <dd>Organization record · ENS deferred</dd>
            </div>
          </dl>
        </div>
        {!liveReady && (
          <p className="identity-readiness">
            World production configuration is incomplete. {liveIssues[0] ?? ""}
          </p>
        )}
      </div>

      <div className="authority-sequence">
        <AuthorityStep
          number="1"
          title="Reject unverified authority"
          description="Attempt the selected 3.5 HBAR order before World verification."
          state={missingHumanRejected ? "complete" : "ready"}
          actionLabel={
            missingHumanRejected ? "Rejection audited" : "Test without human backing"
          }
          onAction={onUnverified}
          disabled={missingHumanRejected}
          destructive
        />
        <AuthorityStep
          number="2"
          title="Verify human backing"
          description="Use World ID to prove a unique human stands behind this agent."
          state={verified ? "complete" : missingHumanRejected ? "ready" : "locked"}
          actionLabel={verified ? "Human verified" : "Verify with World"}
          onAction={onVerify}
          disabled={!missingHumanRejected || verified}
        />
        <AuthorityStep
          number="3"
          title="Enforce the delegation"
          description={`The active delegation permits ${delegation ? toDisplay(delegation.maxPerOrder) : "4"} HBAR per order.`}
          state={limitRejected ? "complete" : verified ? "ready" : "locked"}
          actionLabel={limitRejected ? "Limit rejection audited" : "Test 4.2 HBAR request"}
          onAction={onOverLimit}
          disabled={!verified || limitRejected}
          destructive
        />
        <AuthorityStep
          number="4"
          title="Create the valid order"
          description="Authorize the selected 3.5 HBAR offer through the same protocol service."
          state={orderExists ? "complete" : limitRejected ? "ready" : "locked"}
          actionLabel={orderExists ? "Order created" : "Authorize 3.5 HBAR order"}
          onAction={onValid}
          disabled={!limitRejected || orderExists}
        />
      </div>
    </div>
  );
}

function AuthorityStep({
  number,
  title,
  description,
  state,
  actionLabel,
  onAction,
  disabled,
  destructive = false,
}: {
  number: string;
  title: string;
  description: string;
  state: "locked" | "ready" | "complete";
  actionLabel: string;
  onAction: () => void;
  disabled: boolean;
  destructive?: boolean;
}) {
  return (
    <section className={`authority-step ${state}`}>
      <span className="authority-number">{number}</span>
      <div>
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
      <button
        className={destructive ? "danger-action" : "primary-action"}
        onClick={onAction}
        disabled={disabled}
      >
        {state === "complete" ? <Check size={16} /> : <ArrowRight size={16} />}
        {actionLabel}
      </button>
    </section>
  );
}

function BuyerPanel({
  offers,
  vendors,
  allocations,
  asset,
  allocationAmounts,
  newBuyerId,
  newBuyerAmount,
  selectedOfferId,
  orderExists,
  rejected,
  onSelect,
  onAllocationAmount,
  onNewBuyerId,
  onNewBuyerAmount,
  onUpfund,
  onAddBuyer,
  onReject,
  onCreate,
}: {
  offers: Offer[];
  vendors: Record<string, import("@/src/protocol/types").Vendor>;
  allocations: Record<string, import("@/src/protocol/types").BuyerAllocation>;
  asset: string;
  allocationAmounts: Record<string, string>;
  newBuyerId: string;
  newBuyerAmount: string;
  selectedOfferId: string;
  orderExists: boolean;
  rejected: boolean;
  onSelect: (offerId: string) => void;
  onAllocationAmount: (buyerId: string, value: string) => void;
  onNewBuyerId: (value: string) => void;
  onNewBuyerAmount: (value: string) => void;
  onUpfund: (buyerId: string) => void;
  onAddBuyer: () => void;
  onReject: () => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState("");
  const [deliveryFilter, setDeliveryFilter] = useState<"all" | "fast">("all");
  const [sort, setSort] = useState<"fit" | "price" | "delivery">("fit");
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);

  const marketplaceMeta: Record<
    string,
    {
      image: string;
      alt: string;
      location: string;
      availability: string;
      configuration: string;
      memory: string;
    }
  > = {
    offer_atlas: {
      image: "/marketplace/atlas-compute.jpg",
      alt: "Rack-mounted research compute hardware",
      location: "Frankfurt region",
      availability: "Next-day capacity",
      configuration: "4x A100",
      memory: "320 GB HBM2e",
    },
    offer_nova: {
      image: "/marketplace/nova-gpu.jpg",
      alt: "High-density server nodes in a compute rack",
      location: "Amsterdam region",
      availability: "Scheduled capacity",
      configuration: "4x A100",
      memory: "320 GB HBM2e",
    },
    offer_horizon: {
      image: "/marketplace/horizon-cloud.jpg",
      alt: "Modern data-center aisle with compute racks",
      location: "Lisbon region",
      availability: "Reserved capacity",
      configuration: "4x A100",
      memory: "320 GB HBM2e",
    },
  };

  const visibleOffers = offers
    .filter((offer) => {
      const haystack =
        `${offer.description} ${vendors[offer.vendorId]?.name ?? ""}`.toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    })
    .filter(
      (offer) =>
        deliveryFilter === "all" ||
        (offer.deliveryDays !== undefined && offer.deliveryDays <= 2),
    )
    .sort((a, b) => {
      if (sort === "price") {
        return Number(a.amount.atomicAmount) - Number(b.amount.atomicAmount);
      }
      if (sort === "delivery") {
        return (
          (a.deliveryDays ?? Number.MAX_SAFE_INTEGER) -
          (b.deliveryDays ?? Number.MAX_SAFE_INTEGER)
        );
      }
      return a.id === "offer_horizon" ? -1 : b.id === "offer_horizon" ? 1 : 0;
    });

  const selectedOffer = offers.find((offer) => offer.id === selectedOfferId)!;
  const selectedVendor =
    vendors[selectedOffer.vendorId]?.name ?? selectedOffer.vendorId;

  return (
    <div className="marketplace-layout">
      <aside className="buyer-brief">
        <PanelHeading
          kicker="Buyer authority"
          title="Shop approved compute"
          description="Compare verified vendors. Every listing already satisfies your category and evidence requirements."
        />
        <div className="policy-card">
          <div><span>Category</span><strong>GPU_COMPUTE</strong></div>
          <div><span>Maximum order</span><strong>5 HBAR</strong></div>
          <div><span>Evidence</span><strong>Required</strong></div>
          <div><span>Approvals</span><strong>Verifier + Finance</strong></div>
        </div>
        <div className="allocation-manager">
          <div className="section-label">Live buyer allocations</div>
          {Object.values(allocations).map((item) => (
            <div className="allocation-manager-row" key={item.buyerId}>
              <div>
                <strong>{item.buyerId}</strong>
                <span>{toDisplay(item.totalLimit)} {item.totalLimit.asset}</span>
              </div>
              <label>
                <span className="sr-only">Amount to append for {item.buyerId}</span>
                <input
                  inputMode="decimal"
                  placeholder={`Add ${asset}`}
                  value={allocationAmounts[item.buyerId] ?? ""}
                  onChange={(event) =>
                    onAllocationAmount(item.buyerId, event.target.value)
                  }
                />
              </label>
              <button onClick={() => onUpfund(item.buyerId)}>Append</button>
            </div>
          ))}
          <div className="allocation-manager-new">
            <input
              value={newBuyerId}
              onChange={(event) => onNewBuyerId(event.target.value)}
              placeholder="New buyer ID"
            />
            <input
              inputMode="decimal"
              value={newBuyerAmount}
              onChange={(event) => onNewBuyerAmount(event.target.value)}
              placeholder={`Initial ${asset}`}
            />
            <button onClick={onAddBuyer}>Add buyer</button>
          </div>
        </div>
        <button className="danger-action" onClick={onReject} disabled={rejected}>
          {rejected ? <Check size={17} /> : <X size={17} />}
          {rejected ? "Rejection recorded" : "Test 5.5 HBAR request"}
        </button>
      </aside>

      <div className="marketplace">
        <div className="marketplace-header">
          <div>
            <span className="section-label">Approved marketplace</span>
            <strong>{visibleOffers.length} verified offers</strong>
          </div>
          <div className="marketplace-tools">
            <label className="market-search">
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">Search approved offers</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search vendors"
              />
            </label>
            <label className="sort-control">
              <SlidersHorizontal size={14} aria-hidden="true" />
              <span className="sr-only">Sort offers</span>
              <select
                value={sort}
                onChange={(event) =>
                  setSort(event.target.value as "fit" | "price" | "delivery")
                }
              >
                <option value="fit">Best fit</option>
                <option value="price">Lowest price</option>
                <option value="delivery">Fastest delivery</option>
              </select>
            </label>
          </div>
        </div>

        <div className="filter-row" aria-label="Delivery filters">
          <button
            className={deliveryFilter === "all" ? "active" : ""}
            onClick={() => setDeliveryFilter("all")}
          >
            All capacity
          </button>
          <button
            className={deliveryFilter === "fast" ? "active" : ""}
            onClick={() => setDeliveryFilter("fast")}
          >
            Delivery in 48h
          </button>
        </div>

        <div className="offer-grid">
          {visibleOffers.map((offer) => {
            const selected = offer.id === selectedOfferId;
            const metaKey = Object.keys(marketplaceMeta).find(
              (key) => offer.id === key || offer.id.startsWith(`${key}_`),
            );
            const meta =
              marketplaceMeta[metaKey ?? "offer_horizon"];
            const vendorName = vendors[offer.vendorId]?.name ?? offer.vendorId;
            const expanded = expandedOfferId === offer.id;
            return (
              <article
                className={`product-tile ${selected ? "selected" : ""}`}
                key={offer.id}
              >
                <div className="product-image">
                  <Image
                    src={meta.image}
                    alt={meta.alt}
                    width={600}
                    height={360}
                    unoptimized
                  />
                  <span className="vendor-verified">
                    <BadgeCheck size={13} />
                    Verified vendor
                  </span>
                </div>
                <div className="product-content">
                  <div className="product-vendor">{vendorName}</div>
                  <h4>A100 research cluster</h4>
                  <p>{meta.configuration} with {meta.memory}</p>
                  <div className="product-facts">
                    {offer.deliveryDays !== undefined && (
                      <span><Truck size={14} /> {offer.deliveryDays}-day delivery</span>
                    )}
                    <span><MapPin size={14} /> {meta.location}</span>
                  </div>
                  <div className="product-price">
                    <strong>{toDisplay(offer.amount)} HBAR</strong>
                    <span>fixed order total</span>
                  </div>
                  {expanded && (
                    <div className="product-specs">
                      <span><Cpu size={14} /> Dedicated research allocation</span>
                      <span><ShieldCheck size={14} /> Delivery evidence required</span>
                      <span><TimerReset size={14} /> {meta.availability}</span>
                    </div>
                  )}
                  <div className="product-actions">
                    <button
                      className="details-button"
                      onClick={() =>
                        setExpandedOfferId(expanded ? null : offer.id)
                      }
                      aria-expanded={expanded}
                    >
                      Details
                      <ChevronDown className={expanded ? "rotate" : ""} size={15} />
                    </button>
                    <button
                      className="select-offer"
                      onClick={() => onSelect(offer.id)}
                      disabled={orderExists}
                    >
                      {selected ? <Check size={15} /> : null}
                      {selected ? "Selected" : "Select"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {visibleOffers.length === 0 && (
          <div className="market-empty">
            No approved capacity matches those filters.
            <button
              onClick={() => {
                setQuery("");
                setDeliveryFilter("all");
              }}
            >
              Clear filters
            </button>
          </div>
        )}

        <div className="order-summary">
          <div>
            <span>Selected supplier</span>
            <strong>{selectedVendor}</strong>
            {selectedOffer.deliveryDays !== undefined && (
              <small>{selectedOffer.deliveryDays}-day delivery</small>
            )}
          </div>
          <div className="summary-price">
            <span>Order total</span>
            <strong>{toDisplay(selectedOffer.amount)} HBAR</strong>
            <small>Within 5 HBAR limit</small>
          </div>
          <button className="primary-action" onClick={onCreate} disabled={orderExists}>
            <CircleDollarSign size={18} />
            {orderExists ? "Order authorized" : "Authorize order"}
            {!orderExists && <ArrowRight size={17} />}
          </button>
        </div>
        <p className="catalog-attribution">
          Catalog photography by Helpameout and Victor Grigas via Wikimedia Commons,
          licensed under CC BY-SA 3.0.
        </p>
      </div>
    </div>
  );
}

function VendorPanel({
  order,
  vendors,
  file,
  onFile,
  onAccept,
  onSubmit,
}: {
  order: Order | undefined;
  vendors: Record<string, import("@/src/protocol/types").Vendor>;
  file: File | null;
  onFile: (file: File | null) => void;
  onAccept: () => void;
  onSubmit: () => void;
}) {
  const typedOrder = order;
  return (
    <div className="panel-grid">
      <div>
        <PanelHeading
          kicker="Vendor workspace"
          title="Fulfil against a locked order"
          description="The amount and settlement destination cannot change after acceptance."
        />
        {!typedOrder ? (
          <EmptyState text="No active order yet. Create one from the Buyer tab." />
        ) : (
          <div className="order-card">
            <span>Active order</span>
            <strong>
              {vendors[typedOrder.vendorId]?.name ?? typedOrder.vendorId} ·{" "}
              {toDisplay(typedOrder.amount)} HBAR
            </strong>
            <code>{typedOrder.id}</code>
            <div className="order-status">{typedOrder.status.replaceAll("_", " ")}</div>
          </div>
        )}
        {typedOrder?.status === "CREATED" && (
          <button className="primary-action" onClick={onAccept}>
            <Check size={18} /> Accept order
          </button>
        )}
        {typedOrder?.status === "VENDOR_ACCEPTED" && (
          <div className="empty-state">Creating the approval-gated payment…</div>
        )}
      </div>
      <div>
        <div className="section-label">Delivery evidence</div>
        <label className={`upload-zone ${file ? "has-file" : ""}`}>
          <input
            type="file"
            onChange={(event) => onFile(event.target.files?.[0] ?? null)}
            disabled={typedOrder?.status !== "PAYMENT_SCHEDULED"}
          />
          <CloudUpload size={26} />
          <strong>{file ? file.name : "Choose delivery evidence"}</strong>
          <span>
            {file
              ? `${Math.max(1, Math.round(file.size / 1024))} KB · ready to hash`
              : "The file stays private; only its SHA-256 digest is recorded."}
          </span>
        </label>
        <button
          className="secondary-action"
          disabled={!file || typedOrder?.status !== "PAYMENT_SCHEDULED"}
          onClick={onSubmit}
        >
          <FileCheck2 size={18} />
          Hash and submit reference
        </button>
        {typedOrder?.evidence && (
          <div className="hash-readout">
            <span>Recorded digest</span>
            <code>{typedOrder.evidence.hash}</code>
          </div>
        )}
      </div>
    </div>
  );
}

function ApprovalPanel({
  role,
  title,
  description,
  connected,
  accountId,
  order,
  onConnect,
  onApprove,
}: {
  role: "VERIFIER" | "FINANCE";
  title: string;
  description: string;
  connected: boolean;
  accountId?: string;
  order: import("@/src/protocol/types").Order | undefined;
  onConnect: () => void;
  onApprove: () => void;
}) {
  const ready =
    role === "VERIFIER"
      ? order?.status === "DELIVERY_SUBMITTED"
      : order?.status === "DELIVERY_APPROVED";
  const alreadyApproved =
    role === "VERIFIER"
      ? order?.approvals.some((item) => item.role === "DELIVERY_VERIFIER")
      : order?.approvals.some((item) => item.role === "FINANCE");
  return (
    <div className="approval-layout">
      <div>
        <PanelHeading kicker={`${role} role`} title={title} description={description} />
        <div className="wallet-card">
          <div className="wallet-icon"><WalletCards size={24} /></div>
          <div>
            <span>
              Hedera WalletConnect · testnet
            </span>
            <strong>
              {connected && accountId
                ? shortHederaAccount(accountId)
                : "Role wallet not connected"}
            </strong>
          </div>
          <button onClick={onConnect} disabled={connected}>
            {connected ? "Connected" : "Connect"}
          </button>
        </div>
        <p className="relay-note">
          <LockKeyhole size={14} />
          Your wallet signs the native Hedera schedule directly. Charter
          records approval only after the signer appears on Hedera.
        </p>
      </div>
      <div className="approval-card">
        <div className="approval-top">
          <span>Approval request</span>
          <span className={ready ? "ready" : "waiting"}>
            {alreadyApproved ? "Approved" : ready ? "Ready" : "Waiting"}
          </span>
        </div>
        <dl>
          <div><dt>Order</dt><dd>{order?.id ?? "Not available"}</dd></div>
          <div><dt>Amount</dt><dd>{order ? `${toDisplay(order.amount)} HBAR` : "Not available"}</dd></div>
          <div><dt>Evidence</dt><dd>{order?.evidence ? "Digest verified" : "Not submitted"}</dd></div>
          <div><dt>Schedule</dt><dd>{order?.scheduleId ?? "Not available"}</dd></div>
        </dl>
        <button
          className="primary-action"
          disabled={!connected || !ready || alreadyApproved}
          onClick={onApprove}
        >
          <Fingerprint size={18} />
          {alreadyApproved
            ? "Approval recorded"
            : role === "VERIFIER"
              ? "Verify and add first signature"
              : "Approve and release payment"}
        </button>
      </div>
    </div>
  );
}

function AuditPanel({
  events,
  topicId,
  order,
  agentIdentity,
  agentAttestation,
  delegation,
}: {
  events: import("@/src/protocol/events").RecordedEvent[];
  topicId?: string;
  order?: Order;
  agentIdentity?: import("@/src/protocol/types").ResolvedAgentIdentity;
  agentAttestation?: import("@/src/protocol/types").HumanBackingAttestation;
  delegation?: import("@/src/protocol/types").AgentDelegation;
}) {
  return (
    <div>
      <PanelHeading
        kicker="Mirror Node projection"
        title="One lifecycle, independently reconstructable"
        description="Application state is derived from the ordered protocol event stream. Rejections remain as visible as successful actions."
      />
      <div className="audit-links">
        <span>Source: Hedera Mirror Node</span>
        {topicId && (
          <a
            href={`https://hashscan.io/testnet/topic/${topicId}`}
            target="_blank"
            rel="noreferrer"
          >
            Topic {topicId} ↗
          </a>
        )}
        {order?.scheduleId && (
          <a
            href={`https://hashscan.io/testnet/schedule/${order.scheduleId}`}
            target="_blank"
            rel="noreferrer"
          >
            Schedule {order.scheduleId} ↗
          </a>
        )}
        {order?.paymentTransactionId && (
          <a
            href={`https://hashscan.io/testnet/transaction/${encodeURIComponent(order.paymentTransactionId)}`}
            target="_blank"
            rel="noreferrer"
          >
            Payment transaction ↗
          </a>
        )}
      </div>
      {(agentIdentity || delegation) && (
        <div className="identity-audit-summary">
          <div>
            <span>Agent authority</span>
            <strong>{agentIdentity?.publicIdentity.name ?? "Organization-issued"}</strong>
            <code>{agentIdentity?.agentId ?? delegation?.agentId}</code>
          </div>
          <div>
            <span>External identity</span>
            <strong>{agentIdentity ? "Bound" : "ENS deferred"}</strong>
            <code>{agentIdentity?.resolutionHash ?? "Not required for this run"}</code>
          </div>
          <div>
            <span>Human backing</span>
            <strong>{agentAttestation ? "World verified" : "Not verified"}</strong>
            <code>
              {agentAttestation?.verificationReference ?? "No verification reference"}
            </code>
          </div>
          <div>
            <span>Delegation</span>
            <strong>{delegation?.delegationId ?? "Pending"}</strong>
            <code>{delegation?.integrityHash ?? "No delegation hash"}</code>
          </div>
        </div>
      )}
      <div className="audit-table">
        <div className="audit-head">
          <span>Seq.</span><span>Event</span><span>Actor</span><span>Submitted</span><span>Consensus</span><span>Ledger</span>
        </div>
        {[...events].reverse().map((event) => (
          <div className={`audit-row ${eventRejected(event) ? "rejected" : ""}`} key={event.eventId}>
            <code>#{event.ledgerReference?.sequenceNumber}</code>
            <div>
              <span className="event-icon">
                {eventRejected(event) ? <X size={13} /> : <Check size={13} />}
              </span>
              <strong>{eventLabels[event.eventType]}</strong>
              <small title={policyReasons(event)}>
                {event.eventType}
                {policyCode(event) ? ` · ${policyCode(event)}` : ""}
              </small>
            </div>
            <span>{event.actor.role.replaceAll("_", " ")}</span>
            <code>{formatTime(event.occurredAt)}</code>
            <code>{formatTime(event.ledgerReference?.consensusTimestamp)}</code>
            {event.ledgerReference?.topicId ? (
              <a
                href={`https://hashscan.io/testnet/topic/${event.ledgerReference.topicId}`}
                target="_blank"
                rel="noreferrer"
              >
                HashScan ↗
              </a>
            ) : (
              <span>Pending</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelHeading({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description: string;
}) {
  return (
    <div className="panel-heading">
      <span>{kicker}</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function formatTime(value?: string) {
  if (!value) return "pending";
  const hederaTimestamp = /^(\d+)\.(\d+)$/.exec(value);
  const date = hederaTimestamp
    ? new Date(
        Number(hederaTimestamp[1]) * 1_000 +
          Number(`0.${hederaTimestamp[2]}`) * 1_000,
      )
    : new Date(value);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function policyCode(
  event: import("@/src/protocol/events").RecordedEvent,
): string | undefined {
  if (
    event.eventType !== "ORDER_REJECTED_BY_POLICY" &&
    event.eventType !== "AGENT_AUTHORIZATION_EVALUATED"
  ) return undefined;
  return (
    event.data as {
      decision?: import("@/src/protocol/types").PolicyDecision;
    }
  ).decision?.code;
}

function policyReasons(
  event: import("@/src/protocol/events").RecordedEvent,
): string | undefined {
  if (
    event.eventType !== "ORDER_REJECTED_BY_POLICY" &&
    event.eventType !== "AGENT_AUTHORIZATION_EVALUATED"
  ) return undefined;
  return (
    event.data as {
      decision?: import("@/src/protocol/types").PolicyDecision;
    }
  ).decision?.reasons.join(" ");
}

function eventRejected(
  event: import("@/src/protocol/events").RecordedEvent,
): boolean {
  if (event.eventType.includes("REJECTED")) return true;
  if (event.eventType !== "AGENT_AUTHORIZATION_EVALUATED") return false;
  return !(
    event.data as {
      decision?: import("@/src/protocol/types").AgentAuthorizationDecision;
    }
  ).decision?.allowed;
}
