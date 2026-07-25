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

export function ProgramSetupPage({
  values,
  creating,
  error,
  onChange,
  onCreate,
}: {
  values: {
    verifierAccountId: string;
    financeAccountId: string;
    vendorAccountId: string;
  };
  creating: boolean;
  error?: string | null;
  onChange: (
    field: "verifierAccountId" | "financeAccountId" | "vendorAccountId",
    value: string,
  ) => void;
  onCreate: () => void;
}) {
  const complete = Object.values(values).every((value) => value.trim());
  return (
    <main className="shell op-app landing-center-shell">
      <section className="program-setup-card">
        <div className="op-brand" aria-label="Charter">
          <span className="op-brand-mark">CH</span>
          <span>
            <strong>Charter</strong>
            <small>New live program</small>
          </span>
        </div>
        <div className="program-setup-heading">
          <span>Approval circuit</span>
          <h1>Choose who controls release.</h1>
          <p>
            Charter creates a dedicated 2-of-2 treasury for this program. The
            verifier confirms delivery; finance authorizes payment; the vendor
            receives settlement.
          </p>
        </div>
        <div className="program-role-grid">
          {(
            [
              [
                "verifierAccountId",
                "01",
                "Delivery verifier",
                "The Hedera wallet that confirms delivery evidence.",
              ],
              [
                "financeAccountId",
                "02",
                "Finance approver",
                "A different Hedera wallet that releases payment.",
              ],
              [
                "vendorAccountId",
                "03",
                "Vendor settlement",
                "The Hedera account that receives the demo purchase.",
              ],
            ] as const
          ).map(([field, number, label, help]) => (
            <label className="program-role-field" key={field}>
              <span className="program-role-number">{number}</span>
              <span className="program-role-copy">
                <strong>{label}</strong>
                <small>{help}</small>
              </span>
              <input
                autoComplete="off"
                inputMode="text"
                placeholder="0.0.123456"
                value={values[field]}
                onChange={(event) => onChange(field, event.target.value)}
              />
            </label>
          ))}
        </div>
        <div className="program-setup-actions">
          <span>
            Testnet provisioning funds the program treasury with 5 HBAR.
          </span>
          <button
            className="op-primary"
            type="button"
            disabled={!complete || creating}
            onClick={onCreate}
          >
            {creating ? "Provisioning on Hedera…" : "Create program treasury"}
            {!creating && <ArrowRight size={15} />}
          </button>
        </div>
        {error && <small className="program-setup-error" role="alert">{error}</small>}
      </section>
    </main>
  );
}
