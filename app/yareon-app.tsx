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
  LayoutDashboard,
  LockKeyhole,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  TimerReset,
  Truck,
  UserMinus,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fromDisplay, toDisplay } from "@/src/protocol/money";
import type { EvidenceReference } from "@/src/protocol/types";
import type { Offer, Order } from "@/src/protocol/types";
import type {
  CommandResult,
  ExecutionMode,
  ProtocolCommand,
} from "@/src/application/commands";
import type {
  LiveProgramSetup,
  ProgramSession,
  TestnetReadiness,
} from "@/src/application/runtime";
import type { ProtocolProjection } from "@/src/protocol/reducer";
import {
  connectHederaWallet,
  depositHbarToProgram,
  shortHederaAccount,
  signHederaSchedule,
  submitHederaAuthenticationChallenge,
  disconnectHederaWallet,
} from "@/src/wallet/hedera-wallet-client";
import type { ProgramListItem } from "@/src/application/runtime";
import {
  LandingPage,
  ProgramCreatePage,
  ProgramSettlementSettings,
} from "./landing-page";
import { BrandLogo } from "./brand-logo";

const tabs = [
  "Overview",
  "Controls",
  "Purchasing",
  "Activity",
] as const;
type Tab = (typeof tabs)[number];
const controlSections = ["Members", "Suppliers"] as const;
type ControlSection = (typeof controlSections)[number];
const purchasingSections = ["Catalog", "Orders", "Settlement"] as const;
type PurchasingSection = (typeof purchasingSections)[number];
const activeLiveRunKey = "yareon_active_live_program";

export function restoredActiveOrderId(
  orders: ProtocolProjection["orders"],
  createOrderId: () => string = () =>
    `order_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
) {
  const ordered = Object.values(orders);
  const unfinishedOrder = [...ordered]
    .reverse()
    .find(
      (candidate) =>
        candidate.status !== "PAYMENT_EXECUTED" &&
        candidate.status !== "CANCELLED",
    );

  return unfinishedOrder?.id ?? ordered.at(-1)?.id ?? createOrderId();
}

const tabDetails: Record<Tab, { title: string; description: string }> = {
  Overview: {
    title: "Program overview",
    description:
      "See what is funded, what needs attention, and what happened most recently.",
  },
  Controls: {
    title: "Governor controls",
    description:
      "Manage member budgets and approved suppliers.",
  },
  Purchasing: {
    title: "Purchasing",
    description:
      "Shop the approved catalog and follow each order through settlement.",
  },
  Activity: {
    title: "Activity",
    description:
      "Review the complete ledger-backed history and open independent proof.",
  },
};

function TabIcon({ tab }: { tab: Tab }) {
  switch (tab) {
    case "Overview":
      return <LayoutDashboard />;
    case "Controls":
      return <ShieldCheck />;
    case "Purchasing":
      return <WalletCards />;
    case "Activity":
      return <FileCheck2 />;
  }
}

const eventLabels: Record<string, string> = {
  PROGRAM_CREATED: "Program created",
  PROGRAM_SETTLEMENT_CONFIGURED: "Program payments activated",
  PROGRAM_UPFUNDED: "Program deposit confirmed",
  BUYER_ALLOCATED: "Member allocation granted",
  BUYER_ALLOCATION_UPFUNDED: "Member allocation upfunded",
  BUYER_PURCHASING_UPDATED: "Member purchasing access updated",
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
  AGENTKIT_ACCESS_VERIFIED: "AgentKit access verified",
  AGENT_DELEGATION_GRANTED: "Agent delegation granted",
  AGENT_AUTHORIZATION_EVALUATED: "Agent authorization evaluated",
};

export function YareonApp() {
  const [session, setSession] = useState<ProgramSession | null>(null);
  const mode: ExecutionMode = "testnet";
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [controlSection, setControlSection] =
    useState<ControlSection>("Members");
  const [purchasingSection, setPurchasingSection] =
    useState<PurchasingSection>("Catalog");
  const [notice, setNotice] = useState(
    "Starting a fresh protocol run…",
  );
  const [operationState, setOperationState] = useState<
    "idle" | "pending" | "confirmed" | "failed"
  >("pending");
  const [readiness, setReadiness] = useState<TestnetReadiness | null>(null);
  const [roleWallets, setRoleWallets] = useState<
    Partial<Record<"VERIFIER" | "FINANCE", string>>
  >({});
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [retryCommand, setRetryCommand] = useState<ProtocolCommand | null>(null);
  const [chosenOfferId, setChosenOfferId] = useState<string | null>(null);
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({});
  const [programUpfundAmount, setProgramUpfundAmount] = useState("");
  const [newBuyerId, setNewBuyerId] = useState("");
  const [newBuyerRequiresVerification, setNewBuyerRequiresVerification] =
    useState(false);
  const [activeBuyerId, setActiveBuyerId] = useState("");
  const [activeOrderId, setActiveOrderId] = useState("");
  const [administratorSigningIn, setAdministratorSigningIn] = useState(false);
  const [administratorAuthenticated, setAdministratorAuthenticated] =
    useState(false);
  const authenticationAttemptStarted = useRef(false);
  const [administratorSignInError, setAdministratorSignInError] = useState<
    string | null
  >(null);
  const [programSetup, setProgramSetup] = useState<LiveProgramSetup>({
    verifierAccountId: "",
    financeAccountId: "",
  });
  const [programName, setProgramName] = useState("");
  const [showSettlementSettings, setShowSettlementSettings] = useState(false);
  const [settlementError, setSettlementError] = useState<string | null>(null);
  const [programs, setPrograms] = useState<ProgramListItem[]>([]);
  const [programsLoading, setProgramsLoading] = useState(false);
  const [programPickerOpen, setProgramPickerOpen] = useState(false);

  useEffect(() => {
    void refreshReadiness().then((next) => {
      if (!authenticationAttemptStarted.current) {
        setAdministratorAuthenticated(Boolean(next.authorized));
      }
      if (next.ready && next.authorized) {
        void loadPrograms();
        const programId = window.localStorage.getItem(activeLiveRunKey);
        if (programId) {
          void resumeRun(programId);
        } else {
          setOperationState("idle");
        }
      }
    });
    // Initialization intentionally runs once; subsequent state comes from Mirror.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPrograms(): Promise<ProgramListItem[]> {
    setProgramsLoading(true);
    try {
      const response = await fetch("/api/programs", { cache: "no-store" });
      const body = (await response.json()) as {
        programs?: ProgramListItem[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "Programs could not load.");
      }
      const nextPrograms = body.programs ?? [];
      setPrograms(nextPrograms);
      return nextPrograms;
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Programs could not load.",
      );
      return [];
    } finally {
      setProgramsLoading(false);
    }
  }

  async function refreshReadiness() {
    try {
      const hederaResponse = await fetch("/api/config/testnet", {
        cache: "no-store",
      });
      const nextReadiness = (await hederaResponse.json()) as TestnetReadiness;
      setReadiness(nextReadiness);
      return nextReadiness;
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
      return unavailable;
    }
  }

  async function authenticateAdministrator(
    destination: "create" | "control-panel",
  ) {
    authenticationAttemptStarted.current = true;
    setAdministratorAuthenticated(false);
    setAdministratorSigningIn(true);
    setAdministratorSignInError(null);
    try {
      const accountId = await connectHederaWallet();
      const challengeResponse = await fetch("/api/auth/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const challenge = (await challengeResponse.json()) as {
        message?: string;
        token?: string;
        error?: string;
      };
      if (!challengeResponse.ok || !challenge.message || !challenge.token) {
        throw new Error(
          challenge.error ?? "Wallet authentication challenge failed.",
        );
      }
      let topicId = readiness?.publicConfig.topicId;
      if (!topicId) {
        const configuration = await refreshReadiness();
        topicId = configuration.publicConfig.topicId;
      }
      if (!topicId) {
        throw new Error("The Yareon authentication topic is not configured.");
      }
      const transactionId = await submitHederaAuthenticationChallenge({
        accountId,
        topicId,
        message: challenge.message,
      });
      const sessionResponse = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          token: challenge.token,
          transactionId,
        }),
      });
      const authenticated = (await sessionResponse.json()) as {
        authenticated?: boolean;
        error?: string;
      };
      if (!sessionResponse.ok || !authenticated.authenticated) {
        throw new Error(
          authenticated.error ?? "Wallet authentication failed.",
        );
      }
      setAdministratorAuthenticated(true);

      const next = await refreshReadiness();
      if (next.ready && next.authorized) {
        const availablePrograms = await loadPrograms();
        if (destination === "control-panel") {
          const programId =
            window.localStorage.getItem(activeLiveRunKey) ??
            availablePrograms[0]?.programId;
          if (programId) {
            await resumeRun(programId);
          } else {
            beginNewProgram();
          }
        } else {
          beginNewProgram();
        }
      }
    } catch (error) {
      setAdministratorSignInError(
        error instanceof Error
          ? error.message
          : "Hedera wallet authentication failed.",
      );
    } finally {
      authenticationAttemptStarted.current = false;
      setAdministratorSigningIn(false);
    }
  }

  async function startRun(
    nextMode: ExecutionMode,
    name: string = programName,
  ) {
    setOperationState("pending");
    setNotice("Creating your program and confirming it through Mirror Node…");
    try {
      const response = await fetch("/api/programs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: nextMode,
          name: name.trim(),
        }),
      });
      const body = (await response.json()) as ProgramSession & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Run creation failed.");
      hydrateSession(body);
      window.localStorage.setItem(activeLiveRunKey, body.programId);
      void loadPrograms();
      setOperationState("confirmed");
      setNotice("Program treasury created. Deposit HBAR to activate it.");
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
        `/api/programs/${encodeURIComponent(programId)}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as ProgramSession & { error?: string };
      if (!response.ok) {
        window.localStorage.removeItem(activeLiveRunKey);
        setOperationState("idle");
        setNotice("Create a new program and choose its approval accounts.");
        return;
      }
      hydrateSession(body);
      window.localStorage.setItem(activeLiveRunKey, body.programId);
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
      setActiveBuyerId(
        body.buyerId || Object.keys(body.projection.allocations)[0] || "",
      );
      setActiveOrderId(restoredActiveOrderId(body.projection.orders));
      setActiveTab("Overview");
  }

  async function configureSettlement() {
    if (!session) return;
    setSettlementError(null);
    setOperationState("pending");
    setNotice("Activating supplier payments on Hedera testnet…");
    try {
      const response = await fetch(
        `/api/programs/${encodeURIComponent(session.programId)}/settlement`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(programSetup),
        },
      );
      const body = (await response.json()) as ProgramSession & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "Payment setup failed.");
      }
      hydrateSession(body);
      setShowSettlementSettings(false);
      setOperationState("confirmed");
      setNotice("Supplier payments activated. This program is now active.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Payment setup failed.";
      setSettlementError(message);
      setOperationState("failed");
      setNotice(message);
    }
  }

  function beginNewProgram() {
    setSession(null);
    setProgramUpfundAmount("");
    setAllocationAmounts({});
    setNewBuyerId("");
    setNewBuyerRequiresVerification(false);
    setActiveBuyerId("");
    setActiveOrderId("");
    setProgramSetup({
      verifierAccountId: "",
      financeAccountId: "",
    });
    setShowSettlementSettings(false);
    setSettlementError(null);
    setOperationState("idle");
    setNotice("Name your new program to begin.");
  }

  function returnToWorkspace() {
    const programId =
      window.localStorage.getItem(activeLiveRunKey) ?? programs[0]?.programId;
    if (programId) void resumeRun(programId);
  }

  async function disconnectAdministrator() {
    setOperationState("pending");
    try {
      const [walletResult, sessionResult] = await Promise.allSettled([
        disconnectHederaWallet(),
        fetch("/api/auth/session", { method: "DELETE" }),
      ]);
      if (
        sessionResult.status === "rejected" ||
        !sessionResult.value.ok
      ) {
        throw new Error("The authenticated session could not be disconnected.");
      }
      window.localStorage.removeItem(activeLiveRunKey);
      setSession(null);
      setPrograms([]);
      setAdministratorAuthenticated(false);
      setAdministratorSignInError(null);
      setRoleWallets({});
      setOperationState("idle");
      setNotice("Wallet disconnected.");
      setReadiness((current) =>
        current ? { ...current, authorized: false } : current,
      );
      if (walletResult.status === "rejected") {
        setAdministratorSignInError(
          "Yareon signed out, but the wallet app may still show its WalletConnect session.",
        );
      }
    } catch (error) {
      setOperationState("failed");
      setNotice(
        error instanceof Error ? error.message : "Wallet disconnect failed.",
      );
    }
  }

  if (!session?.projection.program) {
    const issues = readiness?.issues ?? [];
    if (!administratorAuthenticated || administratorSigningIn) {
      return (
        <LandingPage
          creating={administratorSigningIn}
          createError={administratorSignInError}
          onCreate={() => void authenticateAdministrator("create")}
          onControlPanel={() =>
            void authenticateAdministrator("control-panel")
          }
        />
      );
    }
    if (readiness?.ready) {
      return (
        <ProgramCreatePage
          name={programName}
          creating={operationState === "pending"}
          error={operationState === "failed" ? notice : null}
          onNameChange={setProgramName}
          onCreate={() => void startRun("testnet", programName)}
          onBack={programs.length ? returnToWorkspace : undefined}
        />
      );
    }
    return (
      <main className="shell loading-shell">
        <div className="loading-card">
          {issues.length ? <ShieldCheck size={24} /> : <RefreshCw className="spin" size={24} />}
          <strong>{issues.length ? "Live system is not ready" : "Creating your live program"}</strong>
          <span>{issues.join(" ") || notice}</span>
        </div>
      </main>
    );
  }

  const activeSession = session;
  const projection = activeSession.projection;
  const program = projection.program!;
  const programFunds = activeSession.treasuryBalance ?? program.budget;
  const activeAllocations = Object.values(projection.allocations).filter(
    (allocation) => allocation.purchasingStatus !== "DISABLED",
  );
  const buyerId =
    activeBuyerId &&
    projection.allocations[activeBuyerId] &&
    projection.allocations[activeBuyerId]?.purchasingStatus !== "DISABLED"
      ? activeBuyerId
      : activeAllocations[0]?.buyerId ?? "";
  const order = projection.orders[activeOrderId];
  const offers = Object.values(projection.offers).filter(
    (offer) => projection.vendors[offer.vendorId]?.status === "APPROVED",
  );
  const requestedOffer =
    projection.offers[chosenOfferId ?? activeSession.selectedOfferId];
  const selectedOffer =
    requestedOffer &&
    projection.vendors[requestedOffer.vendorId]?.status === "APPROVED"
      ? requestedOffer
      : offers[0] ?? requestedOffer ?? Object.values(projection.offers)[0];
  const visibleTabs = tabs.filter((tab) => tab !== "Purchasing");
  const advancedSettlement =
    program.policy.requireDeliveryEvidence ||
    program.policy.approvalRequirements.length > 0;
  const visiblePurchasingSections = purchasingSections.filter(
    (section) => section !== "Settlement" || advancedSettlement,
  );
  const otherPrograms = programs.filter(
    (item) => item.programId !== program.id,
  );

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
    const idempotencyKey =
      action === "REJECT_OVER_LIMIT"
        ? `${activeSession.runId}:${buyerId}:${action.toLowerCase()}:${crypto.randomUUID()}`
        : `${activeSession.runId}:${activeOrderId}:${action.toLowerCase()}`;
    if (action === "REJECT_OVER_LIMIT") {
      return {
        type: "TEST_PURCHASE_POLICY",
        idempotencyKey,
        actor: actor("BUYER", buyerId),
        buyerId,
        vendorId: selectedOffer.vendorId,
        category: selectedOffer.category,
        amount: { ...selectedOffer.amount, atomicAmount: "550000000" },
      };
    }
    if (action === "CREATE_ORDER") {
      return {
        type: "CREATE_ORDER",
        idempotencyKey,
        actor: actor("BUYER", buyerId),
        orderId: activeOrderId,
        buyerId,
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
        orderId: activeOrderId,
      };
    }
    if (action === "SUBMIT_DELIVERY") {
      if (!evidence) throw new Error("Delivery evidence is required.");
      return {
        type: "SUBMIT_DELIVERY",
        idempotencyKey,
        actor: actor("VENDOR", selectedOffer.vendorId),
        orderId: activeOrderId,
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
      orderId: activeOrderId,
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
    const result = (await response.json()) as CommandResult & {
      treasuryBalance?: import("@/src/protocol/types").Money;
      error?: string;
    };
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
        ? {
            ...current,
            projection: result.projection,
            treasuryBalance:
              result.treasuryBalance ?? current.treasuryBalance,
          }
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
          ? program.hedera?.verifierAccountId
          : program.hedera?.financeAccountId;
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
      setNotice("Enter a positive amount to append to this member.");
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

  async function setBuyerPurchasing(buyerId: string, active: boolean) {
    const continuing = Object.values(projection.orders).filter(
      (candidate) =>
        candidate.buyerId === buyerId &&
        candidate.status !== "PAYMENT_EXECUTED" &&
        candidate.status !== "CANCELLED",
    ).length;
    await submitCommand(
      {
        type: "SET_BUYER_PURCHASING",
        idempotencyKey: `${activeSession.runId}:buyer-purchasing:${buyerId}:${active}:${crypto.randomUUID()}`,
        actor: actor("ADMIN", "program-admin"),
        buyerId,
        active,
      },
      active
        ? `${buyerId} can create purchases again.`
        : `${buyerId} was removed from future purchasing.${continuing ? ` ${continuing} existing order${continuing === 1 ? "" : "s"} will continue unchanged.` : ""}`,
    );
    if (!active && activeBuyerId === buyerId) {
      setActiveBuyerId(
        activeAllocations.find((allocation) => allocation.buyerId !== buyerId)
          ?.buyerId ?? "",
      );
    }
  }

  async function upfundProgram() {
    const value = programUpfundAmount.trim();
    if (!value || Number(value) <= 0) {
      setOperationState("failed");
      setNotice("Enter a positive amount to deposit into this program.");
      return;
    }
    if (!program.hedera?.treasuryAccountId) {
      throw new Error("Configure the program treasury before depositing funds.");
    }
    const amount = fromDisplay(
      value,
      program.budget.asset,
      program.budget.decimals,
    );
    setOperationState("pending");
    setRetryCommand(null);
    setNotice("Review and confirm the program deposit in your Hedera wallet.");
    const authenticationResponse = await fetch("/api/auth/session", {
      cache: "no-store",
    });
    const authentication = (await authenticationResponse.json()) as {
      accountId?: string;
    };
    if (!authenticationResponse.ok || !authentication.accountId) {
      throw new Error("Reconnect the administrator wallet before depositing.");
    }
    const accountId = await connectHederaWallet(authentication.accountId);
    const receipt = await depositHbarToProgram({
      accountId,
      treasuryAccountId: program.hedera.treasuryAccountId,
      atomicAmount: amount.atomicAmount,
      programId: program.id,
    });
    setNotice("Deposit submitted; waiting for Mirror Node confirmation…");
    const response = await fetch(
      `/api/programs/${encodeURIComponent(program.id)}/funding`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transactionId: receipt.transactionId,
          amount,
        }),
      },
    );
    const result = (await response.json()) as CommandResult & {
      treasuryBalance?: import("@/src/protocol/types").Money;
      error?: string | { message?: string };
    };
    if (!response.ok || result.status === "FAILED") {
      const message =
        typeof result.error === "string"
          ? result.error
          : result.error?.message;
      throw new Error(message ?? "The program deposit could not be verified.");
    }
    setSession((current) =>
      current && result.projection
        ? {
            ...current,
            projection: result.projection,
            treasuryBalance: result.treasuryBalance,
          }
        : current,
    );
    setProgramUpfundAmount("");
    setOperationState("confirmed");
    setNotice(
      `${value} ${program.budget.asset} deposited from your wallet and confirmed on Hedera.`,
    );
  }

  async function addBuyerAllocation() {
    const buyerId = newBuyerId.trim();
    if (!buyerId) {
      setOperationState("failed");
      setNotice("Enter a member Hedera account.");
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
          purchasingStatus: "ACTIVE",
          participantType: "HUMAN",
          humanVerificationRequired: newBuyerRequiresVerification,
          totalLimit: zero,
          committed: zero,
          paid: zero,
          allowedCategories: [...program.policy.allowedCategories],
        },
      },
      `${buyerId} was added with zero purchasing authority.`,
    );
    setNewBuyerId("");
    setNewBuyerRequiresVerification(false);
    setActiveBuyerId(buyerId);
  }

  async function removeSupplier(vendorId: string) {
    const supplier = projection.vendors[vendorId];
    if (!supplier || supplier.status !== "APPROVED") return;
    const continuing = Object.values(projection.orders).filter(
      (candidate) =>
        candidate.vendorId === vendorId &&
        candidate.status !== "PAYMENT_EXECUTED" &&
        candidate.status !== "CANCELLED",
    ).length;
    await submitCommand(
      {
        type: "REMOVE_SUPPLIER",
        idempotencyKey: `${activeSession.runId}:remove-supplier:${vendorId}:${crypto.randomUUID()}`,
        actor: actor("ADMIN", "program-admin"),
        vendorId,
      },
      continuing
        ? `${supplier.name} was removed from future purchases. ${continuing} existing order${continuing === 1 ? "" : "s"} will continue with locked terms.`
        : `${supplier.name} was removed from future purchases.`,
    );
  }

  async function addSupplier(input: {
    name: string;
    title: string;
    amount: string;
    settlementAccountId: string;
  }) {
    const category =
      program.policy.allowedCategories[0] ??
      input.title
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    if (
      !category ||
      !input.name.trim() ||
      !input.title.trim() ||
      !input.settlementAccountId.trim() ||
      !input.amount.trim() ||
      Number(input.amount) <= 0
    ) {
      throw new Error(
        "Supplier name, offer title, settlement account, and a positive amount are required.",
      );
    }
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    await submitCommand(
      {
        type: "UPSERT_SUPPLIER",
        idempotencyKey: `${activeSession.runId}:add-supplier:${suffix}`,
        actor: actor("ADMIN", "program-admin"),
        vendor: {
          id: `vendor_${suffix}`,
          name: input.name.trim(),
          settlementAccountId: input.settlementAccountId.trim(),
          approvedCategories: [category],
          status: "APPROVED",
        },
        offer: {
          id: `offer_${suffix}`,
          programId: program.id,
          vendorId: `vendor_${suffix}`,
          category,
          title: input.title.trim(),
          description: input.title.trim(),
          amount: fromDisplay(
            input.amount,
            program.budget.asset,
            program.budget.decimals,
          ),
        },
      },
      `${input.name.trim()} was added as an approved supplier.`,
    );
  }

  return (
    <main className="program-cabinet">
      <aside className="op-program-sidebar">
        <div className="cabinet-brand" aria-label="Yareon">
          <BrandLogo className="brand-mark" />
          <span>
            <strong>Yareon</strong>
            <small>Governor console</small>
          </span>
        </div>

        <section className="cabinet-programs" aria-label="Program selector">
          <div className="cabinet-programs-heading">
            <strong>Current program</strong>
            <button
              className="cabinet-program-switch-trigger"
              type="button"
              aria-expanded={programPickerOpen}
              aria-controls="cabinet-program-options"
              onClick={() => setProgramPickerOpen((open) => !open)}
            >
              Switch
              <ChevronDown
                className={programPickerOpen ? "rotate" : ""}
                size={13}
              />
            </button>
          </div>
          <div className="cabinet-current-program">
            <span>{program.name.slice(0, 2).toUpperCase()}</span>
            <strong>{program.name}</strong>
            <small>{program.status === "ACTIVE" ? "Active" : "Draft"}</small>
          </div>
          {programPickerOpen && (
            <div
              className="cabinet-program-options"
              id="cabinet-program-options"
            >
              <div className="cabinet-program-options-heading">
                <span>Other programs</span>
                <span>{programsLoading ? "…" : otherPrograms.length}</span>
              </div>
              {otherPrograms.length ? (
                <div className="cabinet-program-list">
                  {otherPrograms.map((item) => (
                    <button
                      type="button"
                      key={item.programId}
                      onClick={() => {
                        setProgramPickerOpen(false);
                        void resumeRun(item.programId);
                      }}
                      disabled={operationState === "pending"}
                      title={item.name}
                    >
                      <span>{item.name.slice(0, 2).toUpperCase()}</span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.status === "ACTIVE" ? "Active" : "Draft"}
                      </small>
                    </button>
                  ))}
                </div>
              ) : (
                <p>No other programs yet.</p>
              )}
            </div>
          )}
        </section>

        <nav aria-label="Governor workspace">
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              className={activeTab === tab ? "active" : ""}
              onClick={() => setActiveTab(tab)}
            >
              <TabIcon tab={tab} />
              {tab}
              {tab === "Activity" && (
                <span className="tab-count">{projection.timeline.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="op-sidebar-foot">
          <ShieldCheck size={17} />
          <span>
            <strong>Ledger synced</strong>
            <small>Hedera Testnet · public consensus log</small>
          </span>
        </div>
      </aside>

      <div className="op-program-main">
        <header className="op-program-topbar">
          <div className="cabinet-topbar-actions">
            <Link
              className="cabinet-member-portal"
              href={`/member?programId=${encodeURIComponent(program.id)}`}
            >
              Open member portal
              <ArrowRight size={14} />
            </Link>
            <button
              className="cabinet-new-program"
              type="button"
              onClick={beginNewProgram}
              disabled={operationState === "pending"}
            >
              <Plus size={14} />
              New program
            </button>
            <button
              className="cabinet-disconnect"
              type="button"
              onClick={() => void disconnectAdministrator()}
              disabled={operationState === "pending"}
            >
              Disconnect wallet
            </button>
          </div>
        </header>

        <div className="op-program-content">
          <div className="cabinet-page-heading">
            <span>{program.name}</span>
            <h1>{tabDetails[activeTab].title}</h1>
            <p>{tabDetails[activeTab].description}</p>
          </div>

          {(operationState !== "confirmed" ||
            notice !== "Program state is current.") && (
            <div
              className={`notice cabinet-notice ${operationState}`}
              role="status"
            >
              <span>{notice}</span>
              <span className="mirror-status">
                <TimerReset size={14} />
                {operationState === "pending"
                  ? "Confirming on Hedera"
                  : operationState === "failed"
                    ? "Action needed"
                    : "Confirmed"}
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
                  Retry action
                </button>
              )}
            </div>
          )}

          {activeTab === "Overview" && (
            <>
              {!program.hedera && (
                <ProgramSettlementSettings
                  programName={program.name}
                  open={showSettlementSettings}
                  saving={operationState === "pending"}
                  error={settlementError}
                  onOpenChange={(open) => {
                    setShowSettlementSettings(open);
                    if (!open) setSettlementError(null);
                  }}
                  onSave={() => void configureSettlement()}
                />
              )}
              <ProgramOverviewPanel
                program={program}
                programFunds={programFunds}
                allocations={projection.allocations}
                vendors={projection.vendors}
                order={order}
                events={projection.timeline}
                depositAmount={programUpfundAmount}
                depositing={operationState === "pending"}
                onDepositAmount={setProgramUpfundAmount}
                onDeposit={() =>
                  void upfundProgram().catch((error) => {
                    setOperationState("failed");
                    setNotice(
                      error instanceof Error
                        ? error.message
                        : "The program deposit could not be completed.",
                    );
                  })
                }
                onControls={(section) => {
                  setControlSection(section);
                  setActiveTab("Controls");
                }}
                onActivity={() => setActiveTab("Activity")}
              />
            </>
          )}

          {activeTab !== "Overview" && (
            <section className="workspace cabinet-workspace">
              {activeTab === "Controls" && (
                <SecondaryNav
                  label="Control sections"
                  items={controlSections}
                  active={controlSection}
                  onChange={setControlSection}
                />
              )}
              {activeTab === "Purchasing" && (
                <SecondaryNav
                  label="Purchasing sections"
                  items={visiblePurchasingSections}
                  active={purchasingSection}
                  onChange={setPurchasingSection}
                />
              )}
              <div className="workspace-body">
          {activeTab === "Controls" && controlSection === "Members" && (
            <BuyerPanel
              view="buyers"
              offers={offers}
              vendors={projection.vendors}
              policy={program.policy}
              allocations={projection.allocations}
              orders={projection.orders}
              asset={program.budget.asset}
              allocationAmounts={allocationAmounts}
              newBuyerId={newBuyerId}
              newBuyerRequiresVerification={newBuyerRequiresVerification}
              activeBuyerId={buyerId}
              humanBacking={projection.humanBacking}
              selectedOfferId={selectedOffer?.id ?? ""}
              orderExists={Boolean(order)}
              orderCompleted={order?.status === "PAYMENT_EXECUTED"}
              onSelect={setChosenOfferId}
              onAllocationAmount={(buyerId, value) =>
                setAllocationAmounts((current) => ({
                  ...current,
                  [buyerId]: value,
                }))
              }
              onNewBuyerId={setNewBuyerId}
              onNewBuyerRequiresVerification={setNewBuyerRequiresVerification}
              onActiveBuyer={setActiveBuyerId}
              onVerifyBuyer={() => {
                setOperationState("failed");
                setNotice("Human-member verification is outside this AgentKit flow.");
              }}
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
              onSetPurchasing={(buyerId, active) =>
                void setBuyerPurchasing(buyerId, active).catch((error) => {
                  setOperationState("failed");
                  setNotice(
                    error instanceof Error
                      ? error.message
                      : "The member's purchasing access could not be updated.",
                  );
                })
              }
              onAddBuyer={() =>
                void addBuyerAllocation().catch((error) => {
                  setOperationState("failed");
                  setNotice(
                    error instanceof Error
                      ? error.message
                      : "The member could not be added.",
                  );
                })
              }
              onCreate={() =>
                run(
                  "CREATE_ORDER",
                  `${toDisplay(selectedOffer.amount)} ${selectedOffer.amount.asset} order authorized with ${projection.vendors[selectedOffer.vendorId]?.name ?? selectedOffer.vendorId}.`,
                )
              }
              onNextPurchase={() => {
                setActiveOrderId(
                  `order_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
                );
                setEvidenceFile(null);
                setNotice("Ready for another purchase.");
              }}
            />
          )}
          {activeTab === "Controls" && controlSection === "Suppliers" && (
            <SuppliersPanel
              vendors={projection.vendors}
              offers={projection.offers}
              orders={projection.orders}
              asset={program.budget.asset}
              onAdd={addSupplier}
              onRemove={(vendorId) =>
                void removeSupplier(vendorId).catch((error) => {
                  setOperationState("failed");
                  setNotice(
                    error instanceof Error
                      ? error.message
                      : "The supplier could not be removed.",
                  );
                })
              }
            />
          )}
          {activeTab === "Purchasing" && purchasingSection === "Catalog" && (
            <BuyerPanel
              view="marketplace"
              offers={offers}
              vendors={projection.vendors}
              policy={program.policy}
              allocations={projection.allocations}
              orders={projection.orders}
              asset={program.budget.asset}
              allocationAmounts={allocationAmounts}
              newBuyerId={newBuyerId}
              newBuyerRequiresVerification={newBuyerRequiresVerification}
              activeBuyerId={buyerId}
              humanBacking={projection.humanBacking}
              selectedOfferId={selectedOffer?.id ?? ""}
              orderExists={Boolean(order)}
              orderCompleted={order?.status === "PAYMENT_EXECUTED"}
              onSelect={setChosenOfferId}
              onAllocationAmount={(buyerId, value) =>
                setAllocationAmounts((current) => ({
                  ...current,
                  [buyerId]: value,
                }))
              }
              onNewBuyerId={setNewBuyerId}
              onNewBuyerRequiresVerification={setNewBuyerRequiresVerification}
              onActiveBuyer={setActiveBuyerId}
              onVerifyBuyer={() => {
                setOperationState("failed");
                setNotice("Human-member verification is outside this AgentKit flow.");
              }}
              onUpfund={(buyerId) => void upfundBuyer(buyerId)}
              onSetPurchasing={(buyerId, active) =>
                void setBuyerPurchasing(buyerId, active)
              }
              onAddBuyer={() => void addBuyerAllocation()}
              onCreate={() =>
                run(
                  "CREATE_ORDER",
                  `${toDisplay(selectedOffer.amount)} ${selectedOffer.amount.asset} order created with ${projection.vendors[selectedOffer.vendorId]?.name ?? selectedOffer.vendorId}.`,
                )
              }
              onNextPurchase={() => {
                setActiveOrderId(
                  `order_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
                );
                setEvidenceFile(null);
                setNotice("Ready for another purchase.");
              }}
            />
          )}
          {activeTab === "Purchasing" && purchasingSection === "Orders" && (
            <OrdersPanel order={order} vendors={projection.vendors} />
          )}
          {activeTab === "Purchasing" && purchasingSection === "Settlement" && (
            <div className="advanced-settlement-stack">
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
              <ApprovalPanel
                role="VERIFIER"
                title="Verify the delivery"
                description="The verifier confirms the submitted evidence before funds can move."
                connected={Boolean(roleWallets.VERIFIER)}
                accountId={roleWallets.VERIFIER}
                order={order}
                onConnect={() => void connectRoleWallet("VERIFIER")}
                onApprove={() => void approve("VERIFIER")}
              />
              <ApprovalPanel
                role="FINANCE"
                title="Treasury release"
                description="Finance adds the final wallet signature and releases payment."
                connected={Boolean(roleWallets.FINANCE)}
                accountId={roleWallets.FINANCE}
                order={order}
                onConnect={() => void connectRoleWallet("FINANCE")}
                onApprove={() => void approve("FINANCE")}
              />
            </div>
          )}
          {activeTab === "Activity" && (
            <AuditPanel
              events={projection.timeline}
              topicId={readiness?.publicConfig.topicId}
              order={order}
            />
          )}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

function SecondaryNav<T extends string>({
  label,
  items,
  active,
  onChange,
}: {
  label: string;
  items: readonly T[];
  active: T;
  onChange: (item: T) => void;
}) {
  return (
    <nav className="secondary-nav" aria-label={label}>
      {items.map((item) => (
        <button
          type="button"
          key={item}
          className={active === item ? "active" : ""}
          aria-current={active === item ? "page" : undefined}
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
    </nav>
  );
}

function ProgramOverviewPanel({
  program,
  programFunds,
  allocations,
  vendors,
  order,
  events,
  depositAmount,
  depositing,
  onDepositAmount,
  onDeposit,
  onControls,
  onActivity,
}: {
  program: NonNullable<ProtocolProjection["program"]>;
  programFunds: import("@/src/protocol/types").Money;
  allocations: ProtocolProjection["allocations"];
  vendors: ProtocolProjection["vendors"];
  order?: Order;
  events: import("@/src/protocol/events").RecordedEvent[];
  depositAmount: string;
  depositing: boolean;
  onDepositAmount: (value: string) => void;
  onDeposit: () => void;
  onControls: (section: ControlSection) => void;
  onActivity: () => void;
}) {
  const focusFunding = () =>
    document
      .getElementById("program-funding")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  const buyerAuthority = Object.values(allocations).reduce((total, allocation) => {
    if (allocation.purchasingStatus === "DISABLED") return total;
    const remaining =
      BigInt(allocation.totalLimit.atomicAmount) -
      BigInt(allocation.committed.atomicAmount) -
      BigInt(allocation.paid.atomicAmount);

    return total + (remaining > 0n ? remaining : 0n);
  }, 0n);
  const activeSuppliers = Object.values(vendors).filter(
    (vendor) => vendor.status === "APPROVED",
  ).length;
  const recentEvents = [...events].reverse().slice(0, 4);
  const needsSettlement =
    order &&
    order.status !== "PAYMENT_EXECUTED" &&
    order.status !== "CANCELLED" &&
    (program.policy.requireDeliveryEvidence ||
      program.policy.approvalRequirements.length > 0);
  const nextAction =
    BigInt(programFunds.atomicAmount) === 0n
      ? null
      : !order || order.status === "PAYMENT_EXECUTED"
        ? null
        : needsSettlement
          ? {
              eyebrow: "Order needs attention",
              title: "Complete the settlement checks",
              description:
                "Review delivery evidence and collect the required wallet approvals.",
              label: "Continue settlement",
              onClick: onActivity,
            }
          : {
              eyebrow: "Order in progress",
              title: "Track the current order",
              description:
                "Supplier terms are locked and the latest status is available now.",
              label: "View order",
              onClick: onActivity,
            };

  return (
    <div className="overview-dashboard">
      {nextAction && (
        <section className="next-action-rail" aria-label="Recommended next action">
          <div className="next-action-marker">
            <ArrowRight size={18} aria-hidden="true" />
          </div>
          <div>
            <span>{nextAction.eyebrow}</span>
            <strong>{nextAction.title}</strong>
            <p>{nextAction.description}</p>
          </div>
          <button type="button" onClick={nextAction.onClick}>
            {nextAction.label}
            <ArrowRight size={15} />
          </button>
        </section>
      )}

      <section
        className="overview-funding"
        id="program-funding"
        aria-labelledby="program-funding-title"
      >
        <div className="overview-funding-balance">
          <WalletCards size={20} aria-hidden="true" />
          <div>
            <span>Program treasury</span>
            <strong id="program-funding-title">
              {toDisplay(programFunds)} {programFunds.asset} available
            </strong>
            <small>
              {program.hedera?.treasuryAccountId
                ? `Hedera treasury ${shortHederaAccount(program.hedera.treasuryAccountId)}`
                : "Configure a treasury before depositing funds."}
            </small>
          </div>
        </div>
        <label>
          <span>Deposit amount</span>
          <div>
            <input
              inputMode="decimal"
              placeholder="0"
              value={depositAmount}
              onChange={(event) => onDepositAmount(event.target.value)}
            />
            <span>{program.budget.asset}</span>
          </div>
        </label>
        <button
          type="button"
          onClick={onDeposit}
          disabled={!program.hedera?.treasuryAccountId || depositing}
        >
          {depositing ? "Depositing…" : "Deposit funds"}
        </button>
      </section>

      <section className="overview-metrics" aria-label="Program summary">
        <article className="overview-metric balance">
          <CircleDollarSign size={18} />
          <span>Available program funds</span>
          <strong>{toDisplay(programFunds)} {programFunds.asset}</strong>
          <button type="button" onClick={focusFunding}>
            Deposit funds
          </button>
        </article>
        <article className="overview-metric">
          <Users size={18} />
          <span>Member authority available</span>
          <strong>
            {toDisplay({
              ...program.budget,
              atomicAmount: buyerAuthority.toString(),
            })} {program.budget.asset}
          </strong>
          <button type="button" onClick={() => onControls("Members")}>
            View members
          </button>
        </article>
        <article className="overview-metric">
          <Store size={18} />
          <span>Approved suppliers</span>
          <strong>{activeSuppliers}</strong>
          <button type="button" onClick={() => onControls("Suppliers")}>
            Manage suppliers
          </button>
        </article>
      </section>

      <div className="overview-detail-grid activity-only">
        <section className="overview-card">
          <div className="overview-card-heading">
            <div>
              <span>Ledger history</span>
              <h2>Recent activity</h2>
            </div>
            <button type="button" onClick={onActivity}>
              View all
            </button>
          </div>
          <ol className="recent-activity">
            {recentEvents.map((event) => (
              <li key={event.eventId}>
                <span
                  className={`activity-mark ${eventRejected(event) ? "rejected" : ""}`}
                >
                  {eventRejected(event) ? <X size={12} /> : <Check size={12} />}
                </span>
                <div>
                  <strong>{eventLabels[event.eventType] ?? event.eventType}</strong>
                  <small>{event.actor.role.replaceAll("_", " ").toLowerCase()}</small>
                </div>
                <time>{formatTime(event.ledgerReference?.consensusTimestamp)}</time>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function SuppliersPanel({
  vendors,
  offers,
  orders,
  asset,
  onAdd,
  onRemove,
}: {
  vendors: ProtocolProjection["vendors"];
  offers: ProtocolProjection["offers"];
  orders: ProtocolProjection["orders"];
  asset: string;
  onAdd: (input: {
    name: string;
    title: string;
    amount: string;
    settlementAccountId: string;
  }) => Promise<void>;
  onRemove: (vendorId: string) => void;
}) {
  const [draft, setDraft] = useState({
    name: "",
    title: "",
    amount: "",
    settlementAccountId: "",
  });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeSupplierCount = Object.values(vendors).filter(
    (vendor) => vendor.status === "APPROVED",
  ).length;
  return (
    <div className="marketplace-layout suppliers">
      <section className="supplier-brief">
        <PanelHeading
          kicker="Approved registry"
          title="Suppliers"
          description="Add suppliers and their first offer, or remove future purchasing access. Existing orders keep their locked supplier and settlement details."
        />
        <div className="allocation-manager supplier-manager">
          <div className="section-label allocation-section-label">
            Current suppliers
          </div>
          {Object.values(vendors).map((vendor) => {
            const vendorOffers = Object.values(offers).filter(
              (offer) => offer.vendorId === vendor.id,
            );
            const continuingOrders = Object.values(orders).filter(
              (order) =>
                order.vendorId === vendor.id &&
                order.status !== "PAYMENT_EXECUTED" &&
                order.status !== "CANCELLED",
            );
            return (
              <div
                className={`allocation-manager-row supplier-manager-row${
                  vendor.status === "APPROVED" ? "" : " disabled"
                }`}
                key={vendor.id}
              >
                <div className="supplier-manager-identity">
                  <strong>
                    {vendor.name}
                    <span className="buyer-access-status">
                      {vendor.status === "APPROVED" ? "Approved" : "Removed"}
                    </span>
                  </strong>
                  <span>
                    {vendor.settlementAccountId || "Settlement account pending"}
                  </span>
                  <small>
                    {vendorOffers.length} offer
                    {vendorOffers.length === 1 ? "" : "s"} ·{" "}
                    {continuingOrders.length} active order
                    {continuingOrders.length === 1 ? "" : "s"}
                  </small>
                </div>
                <dl className="supplier-manager-facts">
                  <div>
                    <dt>Categories</dt>
                    <dd>
                      {vendor.approvedCategories.join(", ") || "Not configured"}
                    </dd>
                  </div>
                  <div>
                    <dt>Catalog</dt>
                    <dd>
                      {vendorOffers.length
                        ? vendorOffers
                            .map((offer) => offer.title ?? offer.description)
                            .join(", ")
                        : "No active offers"}
                    </dd>
                  </div>
                </dl>
                {vendor.status === "APPROVED" ? (
                  <button
                    className="danger-action"
                    disabled={activeSupplierCount === 1}
                    title={
                      activeSupplierCount === 1
                        ? "Add a replacement supplier before removing the last active supplier."
                        : undefined
                    }
                    onClick={() => onRemove(vendor.id)}
                  >
                    <X size={13} aria-hidden="true" />
                    {activeSupplierCount === 1
                      ? "Last active supplier"
                      : "Remove access"}
                  </button>
                ) : (
                  <span className="supplier-removed-copy">
                    Existing orders continue
                  </span>
                )}
              </div>
            );
          })}
          <div className="allocation-manager-new supplier-manager-new">
            <label>
              <span>Supplier name</span>
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Offer title</span>
              <input
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Price ({asset})</span>
              <input
                value={draft.amount}
                inputMode="decimal"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    amount: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Settlement account</span>
              <input
                value={draft.settlementAccountId}
                placeholder="0.0.x"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    settlementAccountId: event.target.value,
                  }))
                }
              />
            </label>
            <button
              type="button"
              disabled={adding}
              onClick={() => {
                setError(null);
                setAdding(true);
                void onAdd(draft)
                  .then(() =>
                    setDraft({
                      name: "",
                      title: "",
                      amount: "",
                      settlementAccountId: "",
                    }),
                  )
                  .catch((cause) =>
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "The supplier could not be added.",
                    ),
                  )
                  .finally(() => setAdding(false));
              }}
            >
              {adding ? "Adding…" : "Add supplier"}
            </button>
          </div>
          {error && (
            <p className="supplier-form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function OrdersPanel({
  order,
  vendors,
}: {
  order?: Order;
  vendors: ProtocolProjection["vendors"];
}) {
  if (!order) {
    return <EmptyState text="No purchase has been created for this run." />;
  }
  const supplierName =
    order.supplierName ?? vendors[order.vendorId]?.name ?? order.vendorId;
  const journey = [
    { status: "CREATED", label: "Created" },
    { status: "VENDOR_ACCEPTED", label: "Accepted" },
    { status: "PAYMENT_SCHEDULED", label: "Payment prepared" },
    { status: "DELIVERY_SUBMITTED", label: "Delivery submitted" },
    { status: "DELIVERY_APPROVED", label: "Delivery approved" },
    { status: "PAYMENT_EXECUTED", label: "Paid" },
  ] as const;
  const currentStep = journey.findIndex((item) => item.status === order.status);
  return (
    <div className="orders-view">
      <div className="panel-grid">
        <div>
          <PanelHeading
            kicker="Current purchase"
            title="Order details"
            description="The supplier, price, and settlement account were locked when this order was created."
          />
          <div className="order-card">
            <span>Supplier</span>
            <strong>{supplierName}</strong>
            <code>{order.supplierSettlementAccountId ?? vendors[order.vendorId]?.settlementAccountId}</code>
            <div className="order-status">{order.status.replaceAll("_", " ")}</div>
          </div>
          <div className="order-reference">
            <span>Order ID</span>
            <code>{order.id}</code>
          </div>
        </div>
        <div className="approval-card">
          <div className="approval-top">
            <span>Settlement</span>
            <span className={order.status === "PAYMENT_EXECUTED" ? "ready" : "waiting"}>
              {order.status === "PAYMENT_EXECUTED" ? "Complete" : "In progress"}
            </span>
          </div>
          <dl>
            <div><dt>Amount</dt><dd>{toDisplay(order.amount)} {order.amount.asset}</dd></div>
            <div><dt>Category</dt><dd>{order.category}</dd></div>
            <div><dt>Schedule</dt><dd>{order.scheduleId ?? "Not created"}</dd></div>
            <div><dt>Payment</dt><dd>{order.paymentTransactionId ?? "Pending"}</dd></div>
          </dl>
        </div>
      </div>
      <section className="order-journey" aria-label="Order progress">
        {journey.map((item, index) => (
          <div
            key={item.status}
            className={
              index < currentStep
                ? "complete"
                : index === currentStep
                  ? "current"
                  : ""
            }
          >
            <span>{index < currentStep ? <Check size={12} /> : index + 1}</span>
            <strong>{item.label}</strong>
          </div>
        ))}
      </section>
    </div>
  );
}

function BuyerPanel({
  view,
  offers,
  vendors,
  policy,
  allocations,
  orders,
  asset,
  allocationAmounts,
  newBuyerId,
  newBuyerRequiresVerification,
  activeBuyerId,
  humanBacking,
  selectedOfferId,
  orderExists,
  orderCompleted,
  onSelect,
  onAllocationAmount,
  onNewBuyerId,
  onNewBuyerRequiresVerification,
  onActiveBuyer,
  onVerifyBuyer,
  onUpfund,
  onSetPurchasing,
  onAddBuyer,
  onCreate,
  onNextPurchase,
}: {
  view: "buyers" | "marketplace";
  offers: Offer[];
  vendors: Record<string, import("@/src/protocol/types").Vendor>;
  policy: import("@/src/protocol/types").ProgramPolicy;
  allocations: Record<string, import("@/src/protocol/types").BuyerAllocation>;
  orders: Record<string, Order>;
  asset: string;
  allocationAmounts: Record<string, string>;
  newBuyerId: string;
  newBuyerRequiresVerification: boolean;
  activeBuyerId: string;
  humanBacking: Record<
    string,
    import("@/src/protocol/types").HumanBackingAttestation
  >;
  selectedOfferId: string;
  orderExists: boolean;
  orderCompleted: boolean;
  onSelect: (offerId: string) => void;
  onAllocationAmount: (buyerId: string, value: string) => void;
  onNewBuyerId: (value: string) => void;
  onNewBuyerRequiresVerification: (value: boolean) => void;
  onActiveBuyer: (buyerId: string) => void;
  onVerifyBuyer: (buyerId: string) => void;
  onUpfund: (buyerId: string) => void;
  onSetPurchasing: (buyerId: string, active: boolean) => void;
  onAddBuyer: () => void;
  onCreate: () => void;
  onNextPurchase: () => void;
}) {
  const [query, setQuery] = useState("");
  const [deliveryFilter, setDeliveryFilter] = useState<"all" | "fast">("all");
  const [sort, setSort] = useState<"fit" | "price" | "delivery">("fit");
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);
  const activeAllocations = Object.values(allocations).filter(
    (allocation) => allocation.purchasingStatus !== "DISABLED",
  );

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
      return 0;
    });

  if (view === "marketplace" && activeAllocations.length === 0) {
    return (
      <EmptyState text="No members currently have purchasing access. Add a member or restore access from Controls." />
    );
  }

  if (view === "marketplace" && offers.length === 0) {
    return (
      <EmptyState text="No active suppliers are available. Add or reactivate a supplier before creating another purchase." />
    );
  }

  const selectedOffer = offers.find((offer) => offer.id === selectedOfferId)!;
  const selectedVendor =
    selectedOffer
      ? vendors[selectedOffer.vendorId]?.name ?? selectedOffer.vendorId
      : "";

  return (
    <div className={`marketplace-layout ${view}`}>
      {view === "buyers" && <section className="buyer-brief">
        <PanelHeading
          kicker="Program members"
          title="Members"
          description="Add people or teams, set their purchasing authority, and control who can create new orders."
        />
        <div className="allocation-manager">
          <div className="section-label allocation-section-label">
            Current members
          </div>
          {Object.values(allocations).map((item) => (
            <div
              className={`allocation-manager-row${item.purchasingStatus === "DISABLED" ? " disabled" : ""}`}
              key={item.buyerId}
            >
              <div>
                <strong>
                  {item.buyerId}
                  <span className="buyer-type-badge">
                    {item.participantType === "AGENT" ? "Agent" : "Human"}
                  </span>
                  <span className="buyer-access-status">
                    {item.purchasingStatus === "DISABLED" ? "Access removed" : "Active"}
                  </span>
                </strong>
                <span>{toDisplay(item.totalLimit)} {item.totalLimit.asset}</span>
                <small>
                  {item.walletAccountId
                    ? `Wallet ${shortHederaAccount(item.walletAccountId)} · `
                    : ""}
                  {item.purchasingStatus === "DISABLED"
                    ? `${Object.values(orders).filter((candidate) => candidate.buyerId === item.buyerId && candidate.status !== "PAYMENT_EXECUTED" && candidate.status !== "CANCELLED").length} existing orders continue unchanged`
                    : item.participantType === "AGENT"
                      ? humanBacking[item.buyerId]
                        ? "Agent identity verified"
                        : "Delegated agent allocation"
                    : item.humanVerificationRequired
                      ? humanBacking[item.buyerId]
                        ? "Identity verified"
                        : "Human verification required"
                      : "Human verification not required"}
                </small>
              </div>
              <label>
                <span className="sr-only">Increase allocation for {item.buyerId}</span>
                <input
                  inputMode="decimal"
                  placeholder={`Amount in ${asset}`}
                  value={allocationAmounts[item.buyerId] ?? ""}
                  onChange={(event) =>
                    onAllocationAmount(item.buyerId, event.target.value)
                  }
                  disabled={item.purchasingStatus === "DISABLED"}
                />
              </label>
              <button
                onClick={() => onUpfund(item.buyerId)}
                disabled={item.purchasingStatus === "DISABLED"}
              >
                Add budget
              </button>
              {item.humanVerificationRequired &&
                !humanBacking[item.buyerId] &&
                item.purchasingStatus !== "DISABLED" && (
                  <button onClick={() => onVerifyBuyer(item.buyerId)}>
                    Verify
                  </button>
                )}
              <button
                className={item.purchasingStatus === "DISABLED" ? "restore-action" : "danger-action"}
                onClick={() =>
                  onSetPurchasing(
                    item.buyerId,
                    item.purchasingStatus === "DISABLED",
                  )
                }
              >
                {item.purchasingStatus === "DISABLED" ? (
                  "Restore access"
                ) : (
                  <>
                    <UserMinus size={13} aria-hidden="true" />
                    Remove access
                  </>
                )}
              </button>
            </div>
          ))}
          <div className="allocation-manager-new">
            <label>
              <span>Member Hedera account</span>
              <input
                value={newBuyerId}
                onChange={(event) => onNewBuyerId(event.target.value)}
                placeholder="e.g. 0.0.12345"
              />
            </label>
            <label className="verification-requirement">
              <input
                type="checkbox"
                checked={newBuyerRequiresVerification}
                onChange={(event) =>
                  onNewBuyerRequiresVerification(event.target.checked)
                }
              />
              Require human verification
            </label>
            <button onClick={onAddBuyer}>Add member</button>
          </div>
        </div>
      </section>}

      {view === "marketplace" && <div className="marketplace">
        <div className="purchase-context-bar">
          <div>
            <span>Approved catalog</span>
            <strong>Choose from approved suppliers</strong>
          </div>
          <label className="marketplace-buyer">
            <span>Purchasing as</span>
            <select
              value={activeBuyerId}
              onChange={(event) => onActiveBuyer(event.target.value)}
              disabled={Boolean(orderExists)}
            >
              {activeAllocations.map((allocation) => (
                <option key={allocation.buyerId} value={allocation.buyerId}>
                  {allocation.buyerId} · {toDisplay({
                    ...allocation.totalLimit,
                    atomicAmount: (() => {
                      const remaining =
                      BigInt(allocation.totalLimit.atomicAmount) -
                      BigInt(allocation.committed.atomicAmount) -
                      BigInt(allocation.paid.atomicAmount);

                      return (remaining > 0n ? remaining : 0n).toString();
                    })(),
                  })} {allocation.totalLimit.asset} available
                </option>
              ))}
            </select>
          </label>
          <div className="purchase-policy-fact">
            <span>Settlement</span>
            <strong>
              {policy.approvalRequirements.length
                ? `${policy.approvalRequirements.length} approvals`
                : "Automatic"}
            </strong>
          </div>
        </div>
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
            const vendorName = vendors[offer.vendorId]?.name ?? offer.vendorId;
            const expanded = expandedOfferId === offer.id;
            const attributes = Object.entries(offer.attributes ?? {});
            return (
              <article
                className={`product-tile ${selected ? "selected" : ""}`}
                key={offer.id}
              >
                <div className="product-content">
                  <div className="product-card-header">
                    <div className="product-vendor">{vendorName}</div>
                    <span className="vendor-verified">
                      <BadgeCheck size={13} />
                      Verified vendor
                    </span>
                  </div>
                  <h4>{offer.title ?? offer.description}</h4>
                  {offer.title && <p>{offer.description}</p>}
                  <div className="product-facts">
                    {offer.deliveryDays !== undefined && (
                      <span><Truck size={14} /> {offer.deliveryDays}-day delivery</span>
                    )}
                    {offer.location && (
                      <span><MapPin size={14} /> {offer.location}</span>
                    )}
                  </div>
                  <div className="product-price">
                    <strong>{toDisplay(offer.amount)} {offer.amount.asset}</strong>
                    <span>fixed order total</span>
                  </div>
                  {expanded && (
                    <div className="product-specs">
                      <span><ShieldCheck size={14} /> Policy-approved supplier</span>
                      {attributes.map(([label, value]) => (
                        <span key={label}>
                          <Cpu size={14} /> {label}: {value}
                        </span>
                      ))}
                      {offer.deliveryDays !== undefined && (
                        <span>
                          <TimerReset size={14} /> Delivery estimate: {offer.deliveryDays} days
                        </span>
                      )}
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
            <strong>{toDisplay(selectedOffer.amount)} {selectedOffer.amount.asset}</strong>
            <small>Uses the member&apos;s available budget</small>
          </div>
          <button
            className="primary-action"
            onClick={orderCompleted ? onNextPurchase : onCreate}
            disabled={orderExists && !orderCompleted}
          >
            <CircleDollarSign size={18} />
            {orderCompleted
              ? "Start another purchase"
              : orderExists
                ? "Purchase in progress"
                : "Create order"}
            {!orderExists && <ArrowRight size={17} />}
          </button>
        </div>
      </div>}
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
          kicker="Order settlement"
          title="Delivery evidence"
          description="Review the locked order and submit evidence without exposing the original file."
        />
        {!typedOrder ? (
          <EmptyState text="No active order yet. Create one from the Catalog tab." />
        ) : (
          <div className="order-card">
            <span>Active order</span>
            <strong>
              {vendors[typedOrder.vendorId]?.name ?? typedOrder.vendorId} ·{" "}
              {toDisplay(typedOrder.amount)} {typedOrder.amount.asset}
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
          Your wallet signs the native Hedera schedule directly. Yareon
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
          <div>
            <dt>Amount</dt>
            <dd>
              {order
                ? `${toDisplay(order.amount)} ${order.amount.asset}`
                : "Not available"}
            </dd>
          </div>
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
}: {
  events: import("@/src/protocol/events").RecordedEvent[];
  topicId?: string;
  order?: Order;
}) {
  return (
    <div>
      <PanelHeading
        kicker="Hedera consensus log"
        title="Ledger activity"
        description="Every accepted and rejected action appears here in the order confirmed by Hedera."
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
