"use client";

import {
  ArrowRight,
  Check,
  CircleDollarSign,
  CloudUpload,
  FileCheck2,
  Fingerprint,
  Landmark,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  TimerReset,
  WalletCards,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { universityGpuFixture } from "@/src/demo/fixtures";
import {
  advanceDemo,
  createDemoSession,
  type DemoAction,
} from "@/src/demo/simulator";
import { subtract, toDisplay } from "@/src/protocol/money";
import type { EvidenceReference } from "@/src/protocol/types";
import type { Offer, Order } from "@/src/protocol/types";

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
  const [session, setSession] = useState(() =>
    createDemoSession(universityGpuFixture, {
      stableRunId: "run_reference",
      stableOccurredAt: "2026-07-24T18:30:00.000Z",
    }),
  );
  const [activeTab, setActiveTab] = useState<Tab>("Buyer");
  const [notice, setNotice] = useState(
    "Protocol initialized from the university GPU reference fixture.",
  );
  const [walletRole, setWalletRole] = useState<"VERIFIER" | "FINANCE" | null>(
    null,
  );
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

  const projection = session.projection;
  const program = projection.program!;
  const allocation = projection.allocations[session.fixture.buyerId];
  const order = Object.values(projection.orders)[0];
  const offers = Object.values(projection.offers);
  const available = subtract(
    subtract(allocation.totalLimit, allocation.committed),
    allocation.paid,
  );

  const completed = order?.status === "PAYMENT_EXECUTED";
  const progress = useMemo(() => {
    const states = [
      "CREATED",
      "VENDOR_ACCEPTED",
      "PAYMENT_SCHEDULED",
      "DELIVERY_SUBMITTED",
      "DELIVERY_APPROVED",
      "PAYMENT_EXECUTED",
    ];
    return order ? Math.max(1, states.indexOf(order.status) + 1) : 0;
  }, [order]);

  function run(action: DemoAction, message: string, evidence?: EvidenceReference) {
    try {
      setSession((current) => advanceDemo(current, action, evidence));
      setNotice(message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Action could not complete.");
    }
  }

  function reset() {
    setSession(createDemoSession(universityGpuFixture));
    setWalletRole(null);
    setEvidenceFile(null);
    setActiveTab("Buyer");
    setNotice("Fresh protocol run created on the reusable demo topic.");
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
    run("SUBMIT_DELIVERY", "Evidence hashed; only its reference entered the protocol.", {
      hash: `sha256:${hash}`,
      mimeType: evidenceFile.type || "application/octet-stream",
      size: evidenceFile.size,
      submittedBy: "vendor_horizon",
      submittedAt: new Date().toISOString(),
    });
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="OpenProcure home">
          <span className="brand-mark">OP</span>
          <span>OpenProcure</span>
          <small>Protocol v0.1</small>
        </a>
        <div className="network-state">
          <span className="network-dot" />
          Hedera testnet simulation
        </div>
        <button className="reset-button" onClick={reset}>
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
          <code>{session.runId}</code>
        </div>
      </section>

      <div className="notice" role="status">
        <span>{notice}</span>
        <span className="mirror-status">
          <TimerReset size={14} />
          Mirror projection current
        </span>
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
              orderExists={Boolean(order)}
              rejected={projection.rejectedDecisions.length > 0}
              onReject={() =>
                run(
                  "REJECT_OVER_LIMIT",
                  "5.5 HBAR rejected: buyer allocation is limited to 5 HBAR.",
                )
              }
              onCreate={() =>
                run(
                  "CREATE_ORDER",
                  "3.5 HBAR order authorized under deterministic policy.",
                )
              }
            />
          )}
          {activeTab === "Vendor" && (
            <VendorPanel
              order={order}
              file={evidenceFile}
              onFile={setEvidenceFile}
              onAccept={() =>
                run("ACCEPT_ORDER", "Horizon Cloud accepted the order.")
              }
              onSchedule={() =>
                run(
                  "CREATE_SCHEDULE",
                  "Payment scheduled. It cannot execute without both approvals.",
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
              connected={walletRole === "VERIFIER"}
              order={order}
              onConnect={() => {
                setWalletRole("VERIFIER");
                setNotice("Verifier testnet wallet authenticated for this demo run.");
              }}
              onApprove={() =>
                run(
                  "APPROVE_DELIVERY",
                  "Delivery verified. One of two treasury signatures is now present.",
                )
              }
            />
          )}
          {activeTab === "Finance" && (
            <ApprovalPanel
              role="FINANCE"
              title="Treasury release"
              description="Confirm the approved evidence and add the second threshold signature to release settlement."
              connected={walletRole === "FINANCE"}
              order={order}
              onConnect={() => {
                setWalletRole("FINANCE");
                setNotice("Finance testnet wallet authenticated for this demo run.");
              }}
              onApprove={() =>
                run(
                  "APPROVE_FINANCE",
                  "Threshold satisfied. Hedera payment executed exactly once.",
                )
              }
            />
          )}
          {activeTab === "Audit" && (
            <AuditPanel events={projection.timeline} />
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
  orderExists,
  rejected,
  onReject,
  onCreate,
}: {
  offers: Offer[];
  orderExists: boolean;
  rejected: boolean;
  onReject: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="panel-grid">
      <div>
        <PanelHeading
          kicker="Buyer authority"
          title="Choose within policy"
          description="The protocol delegates vendor choice, not the ability to change spending rules."
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
      </div>
      <div className="offers">
        <div className="section-label">Approved offers</div>
        {offers.map((offer) => {
          const selected = offer.id === "offer_horizon";
          return (
            <div className={`offer ${selected ? "recommended" : ""}`} key={offer.id}>
              <div>
                <span>{offer.description}</span>
                <strong>
                  {offer.vendorId === "vendor_atlas"
                    ? "Atlas Compute"
                    : offer.vendorId === "vendor_nova"
                      ? "Nova GPU"
                      : "Horizon Cloud"}
                </strong>
              </div>
              <div className="offer-price">
                <strong>{toDisplay(offer.amount)}</strong>
                <span>HBAR</span>
              </div>
              {selected && <span className="recommendation">Best fit</span>}
            </div>
          );
        })}
        <button className="primary-action" onClick={onCreate} disabled={orderExists}>
          <CircleDollarSign size={18} />
          {orderExists ? "Compliant order created" : "Authorize 3.5 HBAR order"}
          {!orderExists && <ArrowRight size={17} />}
        </button>
      </div>
    </div>
  );
}

function VendorPanel({
  order,
  file,
  onFile,
  onAccept,
  onSchedule,
  onSubmit,
}: {
  order: Order | undefined;
  file: File | null;
  onFile: (file: File | null) => void;
  onAccept: () => void;
  onSchedule: () => void;
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
            <strong>Horizon Cloud · 3.5 HBAR</strong>
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
          <button className="primary-action" onClick={onSchedule}>
            <LockKeyhole size={18} /> Create approval-gated payment
          </button>
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
  order,
  onConnect,
  onApprove,
}: {
  role: "VERIFIER" | "FINANCE";
  title: string;
  description: string;
  connected: boolean;
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
              {connected
                ? role === "VERIFIER"
                  ? "0.0.73101"
                  : "0.0.73102"
                : "Role wallet not connected"}
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
          <div><dt>Order</dt><dd>{order?.id ?? "—"}</dd></div>
          <div><dt>Amount</dt><dd>{order ? `${toDisplay(order.amount)} HBAR` : "—"}</dd></div>
          <div><dt>Evidence</dt><dd>{order?.evidence ? "Digest verified" : "Not submitted"}</dd></div>
          <div><dt>Schedule</dt><dd>{order?.scheduleId ?? "—"}</dd></div>
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
}: {
  events: import("@/src/protocol/events").RecordedEvent[];
}) {
  return (
    <div>
      <PanelHeading
        kicker="Mirror Node projection"
        title="One lifecycle, independently reconstructable"
        description="Application state is derived from the ordered protocol event stream. Rejections remain as visible as successful actions."
      />
      <div className="audit-table">
        <div className="audit-head">
          <span>Seq.</span><span>Event</span><span>Actor</span><span>Consensus</span><span>Ledger</span>
        </div>
        {[...events].reverse().map((event) => (
          <div className={`audit-row ${event.eventType.includes("REJECTED") ? "rejected" : ""}`} key={event.eventId}>
            <code>#{event.ledgerReference?.sequenceNumber}</code>
            <div>
              <span className="event-icon">
                {event.eventType.includes("REJECTED") ? <X size={13} /> : <Check size={13} />}
              </span>
              <strong>{eventLabels[event.eventType]}</strong>
              <small>{event.eventType}</small>
            </div>
            <span>{event.actor.role.replaceAll("_", " ")}</span>
            <code>{formatTime(event.ledgerReference?.consensusTimestamp)}</code>
            <a href="https://hashscan.io/testnet" target="_blank" rel="noreferrer">HashScan ↗</a>
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
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
