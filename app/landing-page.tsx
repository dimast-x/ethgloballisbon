"use client";

import { ArrowRight, ShieldCheck } from "lucide-react";

export function LandingPage({
  showcaseAvailable = false,
  showcaseLoading = false,
  creating = false,
  createError,
  onCreate,
  onShowcase,
}: {
  showcaseAvailable?: boolean;
  showcaseLoading?: boolean;
  creating?: boolean;
  createError?: string | null;
  onCreate?: () => void;
  onShowcase?: () => void;
}) {
  return (
    <main className="shell op-app landing-center-shell">
      <section className="landing-center-content">
        <div className="op-brand" aria-label="Charter">
          <span className="op-brand-mark">CH</span>
          <span>
            <strong>Charter</strong>
            <small>Policy-controlled spending</small>
          </span>
        </div>
        <div className="op-kicker">
          <ShieldCheck size={15} />
          Real programs on Hedera testnet
        </div>
        <h1>
          Choice at the edge.
          <br />
          <span>Control at the core.</span>
        </h1>
        <p>
          Create a procurement program, fund bounded buyer authority, verify
          delivery, and release payment through one reconstructable workflow.
        </p>
        <div className="op-landing-actions">
          <button
            className="op-primary"
            type="button"
            disabled={creating || !onCreate}
            onClick={onCreate}
          >
            {creating ? "Authenticating wallet…" : "Create a live program"}
            {!creating && <ArrowRight size={15} />}
          </button>
          {showcaseAvailable && onShowcase && (
            <button className="op-secondary" onClick={onShowcase}>
              View live proof
            </button>
          )}
        </div>
        <div className="op-trust-line">
          <span>Creator-owned administration</span>
          <span>Append-only buyer funding</span>
          <span>Independent wallet approvals</span>
        </div>
        {createError ? (
          <small role="alert">{createError}</small>
        ) : (
          !showcaseAvailable && <small>
            {showcaseLoading
              ? "Checking public ledger proof…"
              : "No simulated data is shown publicly."}
          </small>
        )}
      </section>
    </main>
  );
}
