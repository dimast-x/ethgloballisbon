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
import { useEffect, useState } from "react";
import { subtract, toDisplay } from "@/src/protocol/money";
import type { EvidenceReference } from "@/src/protocol/types";
import type { Offer, Order } from "@/src/protocol/types";
import type {
  CommandResult,
  ExecutionMode,
  ProtocolCommand,
} from "@/src/application/commands";
import type { ProgramSession, TestnetReadiness } from "@/src/application/runtime";
import {
  canonicalApprovalMessage,
  type WalletApprovalPayload,
} from "@/src/wallet/approval-message";
import {
  connectHashPack,
  signHashPackMessage,
} from "@/src/wallet/hashpack-client";

const tabs = ["Buyer", "Vendor", "Verifier", "Finance", "Audit"] as const;
type Tab = (typeof tabs)[number];

const eventLabels: Record<string, string> = {
  PROGRAM_CREATED: "Program activated",
  BUYER_ALLOCATED: "Buyer allocation granted",
  VENDOR_APPROVED: "Vendor approved",
  OFFER_REGISTERED: "Offer registered",
  ORDER_REJECTED_BY_POLICY: "Purchase rejected",
  ORDER_CREATED: "Order created",
  ORDER_ACCEPTED_BY_VENDOR: "Order accepted",
  PAYMENT_SCHEDULE_CREATED: "Payment scheduled",
  DELIVERY_SUBMITTED: "Delivery evidence submitted",
  DELIVERY_APPROVED: "Delivery independently verified",
  PAYMENT_SIGNATURE_ADDED: "Approval signature added",
  PAYMENT_EXECUTED: "Payment executed",
};

export function OpenProcureApp() {
  const [session, setSession] = useState<ProgramSession | null>(null);
  const [mode, setMode] = useState<ExecutionMode>("simulation");
  const [activeTab, setActiveTab] = useState<Tab>("Buyer");
  const [notice, setNotice] = useState(
    "Starting a fresh protocol run…",
  );
  const [operationState, setOperationState] = useState<
    "idle" | "pending" | "confirmed" | "failed"
  >("pending");
  const [readiness, setReadiness] = useState<TestnetReadiness | null>(null);
  const [walletAccounts, setWalletAccounts] = useState<string[]>([]);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [retryCommand, setRetryCommand] = useState<ProtocolCommand | null>(null);
  const [chosenOfferId, setChosenOfferId] = useState<string | null>(null);

  useEffect(() => {
    void refreshReadiness();
    void startRun("simulation");
  }, []);

  async function refreshReadiness() {
    try {
      const response = await fetch("/api/config/testnet", { cache: "no-store" });
      setReadiness((await response.json()) as TestnetReadiness);
    } catch {
      setReadiness({
        ready: false,
        network: "testnet",
        issues: ["Configuration status could not be loaded."],
        publicConfig: {
          mirrorNodeUrl: "",
          walletConnectProjectIdConfigured: false,
        },
      });
    }
  }

  async function startRun(nextMode: ExecutionMode) {
    setOperationState("pending");
    setNotice(
      nextMode === "testnet"
        ? "Creating a fresh run and confirming its initialization through Mirror Node…"
        : "Creating a fresh simulation run…",
    );
    try {
      const response = await fetch("/api/demos/university-gpu/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
      });
      const body = (await response.json()) as ProgramSession & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Run creation failed.");
      setMode(nextMode);
      setSession(body);
      setWalletAccounts([]);
      setEvidenceFile(null);
      setRetryCommand(null);
      setChosenOfferId(body.selectedOfferId);
      setActiveTab("Buyer");
      setOperationState("confirmed");
      setNotice(
        nextMode === "testnet"
          ? "Live run confirmed by Hedera Mirror Node."
          : "Simulation run ready. Every action still uses the protocol command API.",
      );
    } catch (error) {
      setOperationState("failed");
      setNotice(error instanceof Error ? error.message : "Run creation failed.");
    }
  }

  if (!session?.projection.program) {
    return (
      <main className="shell loading-shell">
        <div className="loading-card">
          <RefreshCw className="spin" size={24} />
          <strong>Preparing OpenProcure</strong>
          <span>{notice}</span>
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
      approvalReference:
        mode === "simulation"
          ? "wallet-authenticated:simulation-relay"
          : "wallet-authenticated:pending",
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
    walletApproval?: {
      payload: WalletApprovalPayload;
      signatureMapBase64: string;
    },
  ) {
    setOperationState("pending");
    setRetryCommand(command);
    setNotice(
      mode === "testnet"
        ? "Submitted to Hedera; waiting for Mirror Node confirmation…"
        : "Applying protocol command…",
    );
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
    if (mode === "simulation") {
      const simulated =
        role === "VERIFIER" ? "0.0.73101" : "0.0.73102";
      setWalletAccounts((current) => [...new Set([...current, simulated])]);
      setNotice(`${role} wallet authentication simulated.`);
      return;
    }
    setOperationState("pending");
    setNotice("Open HashPack and approve the WalletConnect session.");
    try {
      const accounts = await connectHashPack();
      setWalletAccounts(accounts);
      const expected =
        role === "VERIFIER"
          ? readiness?.publicConfig.verifierWalletAccountId
          : readiness?.publicConfig.financeWalletAccountId;
      if (!expected || !accounts.includes(expected)) {
        throw new Error(`HashPack must authorize the configured ${role} account.`);
      }
      setOperationState("confirmed");
      setNotice(`${role} HashPack account connected.`);
    } catch (error) {
      setOperationState("failed");
      setNotice(error instanceof Error ? error.message : "HashPack connection failed.");
    }
  }

  async function approve(role: "VERIFIER" | "FINANCE") {
    const action =
      role === "VERIFIER" ? "APPROVE_DELIVERY" : "APPROVE_FINANCE";
    const command = commandFor(action);
    if (mode === "simulation") {
      await submitCommand(
        command,
        role === "VERIFIER"
          ? "Delivery verified. One of two simulated signatures is present."
          : "Threshold satisfied. Simulated payment executed exactly once.",
      );
      return;
    }
    if (!order?.scheduleId) {
      setNotice("The payment schedule is not ready.");
      return;
    }
    const walletAccountId =
      role === "VERIFIER"
        ? readiness?.publicConfig.verifierWalletAccountId
        : readiness?.publicConfig.financeWalletAccountId;
    if (!walletAccountId) {
      setNotice(`${role} wallet account is not configured.`);
      return;
    }
    const issuedAt = new Date();
    const payload: WalletApprovalPayload = {
      protocolVersion: "0.1",
      action: role === "VERIFIER" ? "APPROVE_DELIVERY" : "APPROVE_PAYMENT",
      role: role === "VERIFIER" ? "DELIVERY_VERIFIER" : "FINANCE",
      organizationId: program.organizationId,
      programId: program.id,
      orderId: order.id,
      scheduleId: order.scheduleId,
      asset: order.amount.asset,
      atomicAmount: order.amount.atomicAmount,
      walletAccountId,
      idempotencyKey: command.idempotencyKey,
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(issuedAt.valueOf() + 5 * 60_000).toISOString(),
    };
    try {
      setOperationState("pending");
      setNotice("Approve the exact OpenProcure message in HashPack.");
      const signatureMapBase64 = await signHashPackMessage(
        walletAccountId,
        canonicalApprovalMessage(payload),
      );
      await submitCommand(
        command,
        role === "VERIFIER"
          ? "Delivery verified and the first Hedera schedule signature confirmed."
          : "Second signature confirmed; Hedera payment executed exactly once.",
        { payload, signatureMapBase64 },
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

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="OpenProcure home">
          <span className="brand-mark">OP</span>
          <span>OpenProcure</span>
          <small>Protocol v0.1</small>
        </a>
        <div className="mode-switch" aria-label="Execution mode">
          <button
            className={mode === "simulation" ? "active" : ""}
            onClick={() => void startRun("simulation")}
            disabled={operationState === "pending"}
          >
            Simulation
          </button>
          <button
            className={mode === "testnet" ? "active" : ""}
            onClick={() => void startRun("testnet")}
            disabled={!readiness?.ready || operationState === "pending"}
            title={readiness?.issues.join(" ")}
          >
            Hedera Testnet
          </button>
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
              : mode === "testnet"
                ? "Mirror projection current"
                : "Simulation projection current"}
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
          {activeTab === "Buyer" && (
            <BuyerPanel
              offers={offers}
              vendors={projection.vendors}
              selectedOfferId={selectedOffer.id}
              orderExists={Boolean(order)}
              rejected={projection.rejectedDecisions.length > 0}
              onSelect={setChosenOfferId}
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
                mode === "simulation"
                  ? walletAccounts.includes("0.0.73101")
                  : Boolean(
                      readiness?.publicConfig.verifierWalletAccountId &&
                        walletAccounts.includes(
                          readiness.publicConfig.verifierWalletAccountId,
                        ),
                    )
              }
              accountId={
                mode === "simulation"
                  ? "0.0.73101"
                  : readiness?.publicConfig.verifierWalletAccountId
              }
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
                mode === "simulation"
                  ? walletAccounts.includes("0.0.73102")
                  : Boolean(
                      readiness?.publicConfig.financeWalletAccountId &&
                        walletAccounts.includes(
                          readiness.publicConfig.financeWalletAccountId,
                        ),
                    )
              }
              accountId={
                mode === "simulation"
                  ? "0.0.73102"
                  : readiness?.publicConfig.financeWalletAccountId
              }
              order={order}
              onConnect={() => void connectRoleWallet("FINANCE")}
              onApprove={() => void approve("FINANCE")}
            />
          )}
          {activeTab === "Audit" && (
            <AuditPanel
              events={projection.timeline}
              mode={mode}
              topicId={readiness?.publicConfig.topicId}
              order={order}
            />
          )}
        </div>
      </section>

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

function BuyerPanel({
  offers,
  vendors,
  selectedOfferId,
  orderExists,
  rejected,
  onSelect,
  onReject,
  onCreate,
}: {
  offers: Offer[];
  vendors: Record<string, import("@/src/protocol/types").Vendor>;
  selectedOfferId: string;
  orderExists: boolean;
  rejected: boolean;
  onSelect: (offerId: string) => void;
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
    .filter((offer) => deliveryFilter === "all" || offer.deliveryDays <= 2)
    .sort((a, b) => {
      if (sort === "price") {
        return Number(a.amount.atomicAmount) - Number(b.amount.atomicAmount);
      }
      if (sort === "delivery") return a.deliveryDays - b.deliveryDays;
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
                  <img src={meta.image} alt={meta.alt} />
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
                    <span><Truck size={14} /> {offer.deliveryDays}-day delivery</span>
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
            <small>{selectedOffer.deliveryDays}-day delivery</small>
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
            <span>HashPack · Hedera testnet</span>
            <strong>
              {connected ? accountId : "Role wallet not connected"}
            </strong>
          </div>
          <button onClick={onConnect} disabled={connected}>
            {connected ? "Authenticated" : "Connect"}
          </button>
        </div>
        <p className="relay-note">
          <LockKeyhole size={14} />
          Wallet-authenticated, demo-relayed Hedera approval. No production keys
          are exposed to the browser.
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
  mode,
  topicId,
  order,
}: {
  events: import("@/src/protocol/events").RecordedEvent[];
  mode: ExecutionMode;
  topicId?: string;
  order?: Order;
}) {
  return (
    <div>
      <PanelHeading
        kicker={
          mode === "testnet"
            ? "Mirror Node projection"
            : "Simulation projection"
        }
        title="One lifecycle, independently reconstructable"
        description="Application state is derived from the ordered protocol event stream. Rejections remain as visible as successful actions."
      />
      <div className="audit-links">
        <span>Source: {mode === "testnet" ? "Hedera Mirror Node" : "simulation event store"}</span>
        {mode === "testnet" && topicId && (
          <a
            href={`https://hashscan.io/testnet/topic/${topicId}`}
            target="_blank"
            rel="noreferrer"
          >
            Topic {topicId} ↗
          </a>
        )}
        {mode === "testnet" && order?.scheduleId && (
          <a
            href={`https://hashscan.io/testnet/schedule/${order.scheduleId}`}
            target="_blank"
            rel="noreferrer"
          >
            Schedule {order.scheduleId} ↗
          </a>
        )}
        {mode === "testnet" && order?.paymentTransactionId && (
          <a
            href={`https://hashscan.io/testnet/transaction/${encodeURIComponent(order.paymentTransactionId)}`}
            target="_blank"
            rel="noreferrer"
          >
            Payment transaction ↗
          </a>
        )}
      </div>
      <div className="audit-table">
        <div className="audit-head">
          <span>Seq.</span><span>Event</span><span>Actor</span><span>Submitted</span><span>Consensus</span><span>Ledger</span>
        </div>
        {[...events].reverse().map((event) => (
          <div className={`audit-row ${event.eventType.includes("REJECTED") ? "rejected" : ""}`} key={event.eventId}>
            <code>#{event.ledgerReference?.sequenceNumber}</code>
            <div>
              <span className="event-icon">
                {event.eventType.includes("REJECTED") ? <X size={13} /> : <Check size={13} />}
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
            {mode === "testnet" && event.ledgerReference?.topicId ? (
              <a
                href={`https://hashscan.io/testnet/topic/${event.ledgerReference.topicId}`}
                target="_blank"
                rel="noreferrer"
              >
                HashScan ↗
              </a>
            ) : (
              <span>Local</span>
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
  if (event.eventType !== "ORDER_REJECTED_BY_POLICY") return undefined;
  return (
    event.data as {
      decision?: import("@/src/protocol/types").PolicyDecision;
    }
  ).decision?.code;
}

function policyReasons(
  event: import("@/src/protocol/events").RecordedEvent,
): string | undefined {
  if (event.eventType !== "ORDER_REJECTED_BY_POLICY") return undefined;
  return (
    event.data as {
      decision?: import("@/src/protocol/types").PolicyDecision;
    }
  ).decision?.reasons.join(" ");
}
