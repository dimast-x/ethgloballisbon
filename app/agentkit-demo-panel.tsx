"use client";

import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toDisplay } from "@/src/protocol/money";
import type {
  AgentAuthorizationDecision,
  AgentDelegation,
  Money,
} from "@/src/protocol/types";

export type AgentkitDemoTrace = {
  type: string;
  detail: string;
};

export function AgentkitDemoPanel({
  delegation,
  decisions,
  offerAmount,
  orderExists,
  liveReady,
  programId,
}: {
  delegation?: AgentDelegation;
  decisions: AgentAuthorizationDecision[];
  offerAmount: Money;
  orderExists: boolean;
  liveReady: boolean;
  programId: string;
}) {
  const [trace, setTrace] = useState<AgentkitDemoTrace[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [localLimitRejected, setLocalLimitRejected] = useState(false);
  const [localOrderCreated, setLocalOrderCreated] = useState(false);
  const offerAmountLabel = `${toDisplay(offerAmount)} ${offerAmount.asset}`;
  const challenged = trace.some(
    (event) => event.type === "challenge_received",
  );
  const limitRejected =
    localLimitRejected ||
    decisions.some(
      (decision) => decision.code === "AGENT_ORDER_LIMIT_EXCEEDED",
    );
  const validOrderCreated = orderExists || localOrderCreated;

  async function run(variant: "BOT_PROBE" | "OVER_LIMIT" | "VALID") {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/agents/agentkit/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ programId, variant }),
      });
      const body = (await response.json()) as {
        trace?: AgentkitDemoTrace[];
        error?: string;
        result?: { error?: string };
      };
      setTrace(body.trace ?? []);
      if (!response.ok) {
        throw new Error(
          body.error ?? body.result?.error ?? "The AgentKit demo failed.",
        );
      }
      if (variant === "OVER_LIMIT") setLocalLimitRejected(true);
      if (variant === "VALID") setLocalOrderCreated(true);
      setNotice(
        variant === "BOT_PROBE"
          ? "Unsigned automation received a 402 challenge."
          : variant === "OVER_LIMIT"
            ? "AgentBook passed; Yareon rejected the over-limit intent."
            : "AgentBook passed and the valid Hedera order was created.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "AgentKit demo failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="agent-layout">
      <section>
        <div className="panel-heading">
          <span>Qualification sequence</span>
          <h3>World AgentKit execution gate</h3>
          <p>
            Demonstrate that unsigned automation is challenged, a registered
            agent is verified, policy remains authoritative, and only a valid
            intent reaches Hedera execution.
          </p>
        </div>
        <div className="authority-sequence" aria-label="AgentKit qualification demo">
          <AuthorityStep
            number="1"
            title="Reject unsigned automation"
            description={`Request the ${offerAmountLabel} procurement resource without an AgentKit signature.`}
            state={challenged ? "complete" : "ready"}
            actionLabel={challenged ? "402 challenge confirmed" : "Test unsigned bot"}
            onAction={() => void run("BOT_PROBE")}
            disabled={busy}
            destructive
          />
          <AuthorityStep
            number="2"
            title="Verify AgentBook and enforce policy"
            description={`Sign an over-limit request and prove Yareon still enforces the ${
              delegation ? toDisplay(delegation.maxPerOrder) : "configured"
            } HBAR delegation limit.`}
            state={limitRejected ? "complete" : challenged ? "ready" : "locked"}
            actionLabel={
              limitRejected
                ? "Agent verified · limit enforced"
                : "Run signed over-limit intent"
            }
            onAction={() => void run("OVER_LIMIT")}
            disabled={busy || !liveReady || !challenged || limitRejected}
            destructive
          />
          <AuthorityStep
            number="3"
            title="Create the valid order"
            description="Let the verified agent deterministically select the lowest-priced eligible offer and submit it through the protected resource."
            state={
              validOrderCreated ? "complete" : limitRejected ? "ready" : "locked"
            }
            actionLabel={
              validOrderCreated
                ? "Order created"
                : `Authorize ${offerAmountLabel} order`
            }
            onAction={() => void run("VALID")}
            disabled={busy || !limitRejected || validOrderCreated}
          />
        </div>
        {notice && <p role="status">{notice}</p>}
      </section>

      <section className="agent-identity-card" aria-label="AgentKit trace">
        <div className="agent-name">
          <ShieldCheck size={21} />
          <div>
            <span>Latest AgentKit trace</span>
            <strong>
              {trace.length
                ? `${trace.length} reader-safe steps`
                : "Waiting for the unsigned probe"}
            </strong>
          </div>
        </div>
        {trace.length ? (
          <ol>
            {trace.map((event, index) => (
              <li key={`${event.type}:${index}`}>
                <strong>{event.type.replaceAll("_", " ")}</strong>{" "}
                <span>{event.detail}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p>
            The trace will show the challenge, EIP-191 signature, AgentBook
            result, policy decision, HCS reference, and Hedera transaction.
          </p>
        )}
      </section>
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
        type="button"
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
