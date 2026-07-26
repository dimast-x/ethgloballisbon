"use client";

import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  CircleDollarSign,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  Search,
  ShieldCheck,
  Store,
  TimerReset,
  Truck,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandLogo } from "./brand-logo";
import { toDisplay } from "@/src/protocol/money";
import {
  connectHederaWallet,
  disconnectHederaWallet,
  submitHederaAuthenticationChallenge,
} from "@/src/wallet/hedera-wallet-client";
import type { Money, OrderStatus, ProgramPolicy } from "@/src/protocol/types";

type MemberOffer = {
  id: string;
  vendorId: string;
  vendorName: string;
  category: string;
  title?: string;
  description: string;
  amount: Money;
  deliveryDays?: number;
};

type MemberOrder = {
  id: string;
  vendorId: string;
  vendorName: string;
  amount: Money;
  status: OrderStatus;
};

type MemberContext = {
  program: {
    id: string;
    name: string;
    description: string;
    status: string;
    policy: ProgramPolicy;
  };
  member: {
    id: string;
    walletAccountId: string;
    purchasingStatus: "ACTIVE" | "DISABLED";
    totalLimit: Money;
    committed: Money;
    paid: Money;
    remaining: Money;
    allowedCategories: string[];
  };
  offers: MemberOffer[];
  recommendedOfferId?: string;
  orders: MemberOrder[];
};

const memberTabs = ["Home", "Catalog", "Orders"] as const;
type MemberTab = (typeof memberTabs)[number];

const memberTabDetails: Record<
  MemberTab,
  { title: string; description: string }
> = {
  Home: {
    title: "Your purchasing account",
    description:
      "See your available balance, active program rules, and current orders.",
  },
  Catalog: {
    title: "Approved offers",
    description:
      "Choose independently from suppliers your governor has already approved.",
  },
  Orders: {
    title: "Your orders",
    description:
      "Track purchases you created without taking on approval or settlement roles.",
  },
};

function MemberTabIcon({ tab }: { tab: MemberTab }) {
  if (tab === "Home") return <LayoutDashboard />;
  if (tab === "Catalog") return <Store />;
  return <ReceiptText />;
}

export function MemberApp() {
  const [context, setContext] = useState<MemberContext | null>(null);
  const [activeTab, setActiveTab] = useState<MemberTab>("Home");
  const [authenticated, setAuthenticated] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOfferId, setSelectedOfferId] = useState("");
  const [query, setQuery] = useState("");
  const [purchasing, setPurchasing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const programId =
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("programId") ?? "";

  useEffect(() => {
    void restoreMemberSession();
    // Initialization intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function restoreMemberSession() {
    if (!programId) {
      setLoading(false);
      return;
    }
    try {
      const sessionResponse = await fetch("/api/auth/session", {
        cache: "no-store",
      });
      const session = (await sessionResponse.json()) as {
        authenticated?: boolean;
      };
      if (!session.authenticated) {
        setLoading(false);
        return;
      }
      setAuthenticated(true);
      await loadContext();
    } catch {
      setError("Member access could not be restored.");
      setLoading(false);
    }
  }

  async function loadContext() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/members/context?programId=${encodeURIComponent(programId)}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as MemberContext & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Member access could not be loaded.");
      }
      setContext(body);
      setSelectedOfferId(
        (current) =>
          current || body.recommendedOfferId || body.offers[0]?.id || "",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Member access could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function authenticateMember() {
    if (!programId) return;
    setConnecting(true);
    setError(null);
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
      const configurationResponse = await fetch("/api/config/testnet", {
        cache: "no-store",
      });
      const configuration = (await configurationResponse.json()) as {
        publicConfig?: { topicId?: string };
      };
      const topicId = configuration.publicConfig?.topicId;
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
      const session = (await sessionResponse.json()) as {
        authenticated?: boolean;
        error?: string;
      };
      if (!sessionResponse.ok || !session.authenticated) {
        throw new Error(session.error ?? "Wallet authentication failed.");
      }
      setAuthenticated(true);
      await loadContext();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Member wallet authentication failed.",
      );
    } finally {
      setConnecting(false);
    }
  }

  async function disconnectMember() {
    await Promise.allSettled([
      disconnectHederaWallet(),
      fetch("/api/auth/session", { method: "DELETE" }),
    ]);
    setAuthenticated(false);
    setContext(null);
    setNotice(null);
  }

  async function createOrder() {
    if (!context || !selectedOfferId) return;
    const selected = context.offers.find(
      (offer) => offer.id === selectedOfferId,
    );
    if (!selected) return;
    setPurchasing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/members/procure", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            programId: context.program.id,
            offerId: selected.id,
          }),
      });
      const body = (await response.json()) as {
          context?: MemberContext;
          error?: string;
          result?: { error?: { message?: string } };
      };
      if (!response.ok || !body.context) {
        throw new Error(
          body.result?.error?.message ??
            body.error ??
            "The order could not be created.",
        );
      }
      setContext(body.context);
      setNotice(
        `Order created with ${selected.vendorName}. The supplier is the next actor.`,
      );
      setActiveTab("Orders");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The order could not be created.",
      );
    } finally {
      setPurchasing(false);
    }
  }

  if (loading) {
    return (
      <main className="shell loading-shell">
        <div className="loading-card">
          <TimerReset className="spin" size={24} />
          <strong>Loading your purchasing account</strong>
          <span>Checking your program membership and available balance.</span>
        </div>
      </main>
    );
  }

  if (!programId) {
    return (
      <MemberAccessCard
        title="Use your program invite"
        description="Open the member link shared by your governor. It includes the program you are allowed to purchase from."
        error={error}
      />
    );
  }

  if (!authenticated || !context) {
    return (
      <MemberAccessCard
        title="Open your purchasing account"
        description="Connect the Hedera wallet assigned to your member allocation. Yareon will show only your balance, eligible offers, and orders."
        action={authenticated ? "Retry member access" : "Connect member wallet"}
        busy={connecting || loading}
        onAction={authenticated ? loadContext : authenticateMember}
        error={error}
      />
    );
  }

  const selectedOffer =
    context.offers.find((offer) => offer.id === selectedOfferId) ??
    context.offers[0];
  const visibleOffers = context.offers.filter((offer) =>
    `${offer.vendorName} ${offer.title ?? ""} ${offer.description}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  return (
    <main className="program-cabinet member-portal">
      <aside className="op-program-sidebar">
        <Link className="cabinet-brand" aria-label="Yareon home" href="/">
          <BrandLogo className="brand-mark" />
          <span>
            <strong>Yareon</strong>
            <small>Member purchasing</small>
          </span>
        </Link>

        <section className="member-program-card" aria-label="Assigned program">
          <span>Assigned program</span>
          <strong>{context.program.name}</strong>
          <small>{context.member.id}</small>
        </section>

        <nav aria-label="Member workspace">
          {memberTabs.map((tab) => (
            <button
              key={tab}
              className={activeTab === tab ? "active" : ""}
              onClick={() => setActiveTab(tab)}
            >
              <MemberTabIcon tab={tab} />
              {tab}
              {tab === "Orders" && (
                <span className="tab-count">{context.orders.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="op-sidebar-foot">
          <ShieldCheck size={17} />
          <span>
            <strong>Policy enforced</strong>
            <small>Only eligible offers can be ordered</small>
          </span>
        </div>
      </aside>

      <div className="op-program-main">
        <header className="op-program-topbar">
          <div className="member-balance-chip">
            <WalletCards size={15} />
            <span>Available</span>
            <strong>
              {toDisplay(context.member.remaining)}{" "}
              {context.member.remaining.asset}
            </strong>
          </div>
          <div className="cabinet-topbar-actions">
            <Link className="member-back-link" href="/">
              <ArrowLeft size={14} />
              Change role
            </Link>
            <button
              className="cabinet-disconnect"
              type="button"
              onClick={() => void disconnectMember()}
            >
              <LogOut size={14} />
              Disconnect
            </button>
          </div>
        </header>

        <div className="op-program-content">
          <div className="cabinet-page-heading">
            <span>{context.program.name}</span>
            <h1>{memberTabDetails[activeTab].title}</h1>
            <p>{memberTabDetails[activeTab].description}</p>
          </div>

          {notice && (
            <div className="notice cabinet-notice confirmed" role="status">
              <span>{notice}</span>
              <span className="mirror-status">
                <Check size={14} />
                Confirmed
              </span>
            </div>
          )}
          {error && (
            <div className="notice cabinet-notice failed" role="alert">
              <span>{error}</span>
            </div>
          )}

          {activeTab === "Home" && (
            <MemberHome
              context={context}
              onCatalog={() => setActiveTab("Catalog")}
              onOrders={() => setActiveTab("Orders")}
            />
          )}
          {activeTab === "Catalog" && (
            <section className="member-catalog">
              <div className="member-context-rail">
                <div>
                  <span>Your available balance</span>
                  <strong>
                    {toDisplay(context.member.remaining)}{" "}
                    {context.member.remaining.asset}
                  </strong>
                </div>
                <div>
                  <span>Per-order limit</span>
                  <strong>
                    {toDisplay(context.program.policy.maxOrderAmount)}{" "}
                    {context.program.policy.maxOrderAmount.asset}
                  </strong>
                </div>
                <label className="market-search">
                  <Search size={15} aria-hidden="true" />
                  <span className="sr-only">Search eligible offers</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search eligible offers"
                  />
                </label>
              </div>

              <div className="offer-grid">
                {visibleOffers.map((offer) => {
                  const selected = offer.id === selectedOffer?.id;
                  return (
                    <article
                      className={`product-tile ${selected ? "selected" : ""}`}
                      key={offer.id}
                    >
                      <div className="product-content">
                        <div className="product-card-header">
                          <div className="product-vendor">
                            {offer.vendorName}
                          </div>
                          <span className="vendor-verified">
                            <BadgeCheck size={13} />
                            Approved
                          </span>
                        </div>
                        <h4>{offer.title ?? offer.description}</h4>
                        {offer.title && <p>{offer.description}</p>}
                        {offer.deliveryDays !== undefined && (
                          <div className="product-facts">
                            <span>
                              <Truck size={14} />
                              {offer.deliveryDays}-day delivery
                            </span>
                          </div>
                        )}
                        <div className="product-price">
                          <strong>
                            {toDisplay(offer.amount)} {offer.amount.asset}
                          </strong>
                          <span>fixed order total</span>
                        </div>
                        <button
                          className="select-offer"
                          type="button"
                          onClick={() => setSelectedOfferId(offer.id)}
                        >
                          {selected && <Check size={15} />}
                          {selected ? "Selected" : "Choose offer"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              {!visibleOffers.length && (
                <div className="market-empty">
                  No offers fit your policy and remaining balance.
                </div>
              )}

              {selectedOffer && (
                <div className="order-summary member-order-summary">
                  <div>
                    <span>Selected supplier</span>
                    <strong>{selectedOffer.vendorName}</strong>
                    <small>{selectedOffer.description}</small>
                  </div>
                  <div className="summary-price">
                    <span>Order total</span>
                    <strong>
                      {toDisplay(selectedOffer.amount)}{" "}
                      {selectedOffer.amount.asset}
                    </strong>
                    <small>Policy and balance checked</small>
                  </div>
                  <button
                    className="primary-action"
                    type="button"
                    onClick={() => void createOrder()}
                    disabled={purchasing}
                  >
                    <CircleDollarSign size={18} />
                    {purchasing ? "Creating order…" : "Create order"}
                    {!purchasing && <ArrowRight size={17} />}
                  </button>
                </div>
              )}
            </section>
          )}
          {activeTab === "Orders" && (
            <MemberOrders orders={context.orders} />
          )}
        </div>
      </div>
    </main>
  );
}

function MemberAccessCard({
  title,
  description,
  action,
  busy,
  onAction,
  error,
}: {
  title: string;
  description: string;
  action?: string;
  busy?: boolean;
  onAction?: () => void | Promise<void>;
  error?: string | null;
}) {
  return (
    <main className="shell op-app landing-center-shell">
      <section className="member-access-card">
        <Link className="op-brand" aria-label="Yareon home" href="/">
          <BrandLogo className="op-brand-mark" />
          <span>
            <strong>Yareon</strong>
            <small>Member purchasing</small>
          </span>
        </Link>
        <div className="member-access-icon">
          <WalletCards size={23} />
        </div>
        <span>Member workspace</span>
        <h1>{title}</h1>
        <p>{description}</p>
        {action && onAction && (
          <button
            className="op-primary"
            type="button"
            disabled={busy}
            onClick={() => void onAction()}
          >
            {busy ? "Connecting…" : action}
            {!busy && <ArrowRight size={15} />}
          </button>
        )}
        <Link className="member-access-back" href="/">
          <ArrowLeft size={14} />
          Back to role selection
        </Link>
        {error && <small role="alert">{error}</small>}
      </section>
    </main>
  );
}

function MemberHome({
  context,
  onCatalog,
  onOrders,
}: {
  context: MemberContext;
  onCatalog: () => void;
  onOrders: () => void;
}) {
  const latestOrder = context.orders.at(-1);
  return (
    <div className="member-home">
      <section className="member-hero-balance">
        <div>
          <span>Available to spend</span>
          <strong>
            {toDisplay(context.member.remaining)} {context.member.remaining.asset}
          </strong>
          <p>
            This is your allocation after committed and completed purchases.
          </p>
        </div>
        <button type="button" onClick={onCatalog}>
          Browse {context.offers.length} eligible offers
          <ArrowRight size={16} />
        </button>
      </section>

      <section className="member-home-grid">
        <article>
          <span>Total allocation</span>
          <strong>
            {toDisplay(context.member.totalLimit)}{" "}
            {context.member.totalLimit.asset}
          </strong>
          <small>Set by your governor</small>
        </article>
        <article>
          <span>Committed</span>
          <strong>
            {toDisplay(context.member.committed)}{" "}
            {context.member.committed.asset}
          </strong>
          <small>Reserved for active orders</small>
        </article>
        <article>
          <span>Completed spend</span>
          <strong>
            {toDisplay(context.member.paid)} {context.member.paid.asset}
          </strong>
          <small>Already settled</small>
        </article>
      </section>

      <div className="member-home-detail">
        <section className="overview-card">
          <div className="overview-card-heading">
            <div>
              <span>Your guardrails</span>
              <h2>Program rules</h2>
            </div>
          </div>
          <dl className="overview-policy-list">
            <div>
              <dt>Per-order limit</dt>
              <dd>
                {toDisplay(context.program.policy.maxOrderAmount)}{" "}
                {context.program.policy.maxOrderAmount.asset}
              </dd>
            </div>
            <div>
              <dt>Allowed category</dt>
              <dd>
                {context.member.allowedCategories
                  .map((category) => category.replaceAll("_", " "))
                  .join(", ")}
              </dd>
            </div>
            <div>
              <dt>Eligible suppliers</dt>
              <dd>{new Set(context.offers.map((offer) => offer.vendorId)).size}</dd>
            </div>
          </dl>
        </section>

        <section className="overview-card">
          <div className="overview-card-heading">
            <div>
              <span>Latest purchase</span>
              <h2>{latestOrder ? "Order in progress" : "No orders yet"}</h2>
            </div>
            {latestOrder && (
              <button type="button" onClick={onOrders}>
                View order
              </button>
            )}
          </div>
          {latestOrder ? (
            <div className="member-latest-order">
              <strong>{latestOrder.vendorName}</strong>
              <span>{humanOrderStatus(latestOrder.status)}</span>
              <small>
                {toDisplay(latestOrder.amount)} {latestOrder.amount.asset}
              </small>
            </div>
          ) : (
            <p className="member-empty-copy">
              Choose any eligible offer. Yareon checks policy before the order is
              created.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function MemberOrders({ orders }: { orders: MemberOrder[] }) {
  if (!orders.length) {
    return (
      <div className="member-orders-empty">
        <ReceiptText size={24} />
        <strong>No orders yet</strong>
        <span>Your purchases will appear here after you create an order.</span>
      </div>
    );
  }
  return (
    <section className="member-orders-list">
      {orders
        .slice()
        .reverse()
        .map((order) => (
          <article key={order.id}>
            <div className="member-order-mark">
              <ReceiptText size={18} />
            </div>
            <div>
              <span>{order.id}</span>
              <strong>{order.vendorName}</strong>
              <small>{humanOrderStatus(order.status)}</small>
            </div>
            <div className="member-order-amount">
              <strong>
                {toDisplay(order.amount)} {order.amount.asset}
              </strong>
              <span className={`member-order-status ${order.status.toLowerCase()}`}>
                {order.status === "PAYMENT_EXECUTED" ? "Complete" : "In progress"}
              </span>
            </div>
          </article>
        ))}
    </section>
  );
}

function humanOrderStatus(status: OrderStatus) {
  const labels: Record<OrderStatus, string> = {
    CREATED: "Waiting for supplier acceptance",
    VENDOR_ACCEPTED: "Supplier accepted",
    PAYMENT_SCHEDULED: "Payment scheduled",
    DELIVERY_SUBMITTED: "Delivery submitted for verification",
    DELIVERY_APPROVED: "Delivery approved; awaiting finance",
    PAYMENT_EXECUTED: "Payment complete",
    CANCELLED: "Order cancelled",
  };
  return labels[status];
}
