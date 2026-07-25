"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Settings2,
  ShieldCheck,
} from "lucide-react";

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
        <div className="op-brand" aria-label="Yareon">
          <span className="op-brand-mark">YA</span>
          <span>
            <strong>Yareon</strong>
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
          Create a procurement program, fund bounded buyer authority, and let
          members buy from approved suppliers within policy.
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
          <span>Policy-authorized payments</span>
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

export function ProgramCreatePage({
  name,
  creating,
  error,
  onNameChange,
  onCreate,
  onBack,
}: {
  name: string;
  creating: boolean;
  error?: string | null;
  onNameChange: (value: string) => void;
  onCreate: () => void;
  onBack?: () => void;
}) {
  return (
    <main className="shell op-app landing-center-shell">
      <section className="program-create-card">
        <div className="program-create-topbar">
          <div className="op-brand" aria-label="Yareon">
            <span className="op-brand-mark">YA</span>
            <span>
              <strong>Yareon</strong>
              <small>New program</small>
            </span>
          </div>
          {onBack && (
            <button
              className="program-back-to-workspace"
              type="button"
              onClick={onBack}
              disabled={creating}
            >
              <ArrowLeft size={14} />
              Back to workspace
            </button>
          )}
        </div>
        <div className="program-create-layout">
          <div className="program-setup-heading">
            <span>One-minute setup</span>
            <h1>Start with a name.</h1>
            <p>
              That&apos;s enough to create your program and open the workspace.
              Supplier settlement details can be added later from its settings.
            </p>
          </div>
          <div className="program-create-form">
            <label htmlFor="program-name">Program name</label>
            <input
              id="program-name"
              autoFocus
              autoComplete="off"
              value={name}
              placeholder="e.g. AI Research Compute Fund"
              onChange={(event) => onNameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && name.trim() && !creating) {
                  onCreate();
                }
              }}
            />
            <button
              className="op-primary"
              type="button"
              disabled={!name.trim() || creating}
              onClick={onCreate}
            >
              {creating ? "Creating program…" : "Create program"}
              {!creating && <ArrowRight size={15} />}
            </button>
            <span className="program-create-later">
              <Check size={14} />
              {creating
                ? "Publishing the program to Hedera testnet and waiting for confirmation…"
                : "No supplier or treasury details are needed now."}
            </span>
            {error && (
              <small className="program-setup-error" role="alert">
                {error}
              </small>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export function ProgramSettlementSettings({
  programName,
  values,
  open,
  saving,
  error,
  onOpenChange,
  onChange,
  onSave,
}: {
  programName: string;
  values: {
    verifierAccountId: string;
    financeAccountId: string;
    vendorAccountId: string;
  };
  open: boolean;
  saving: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onChange: (
    field: "verifierAccountId" | "financeAccountId" | "vendorAccountId",
    value: string,
  ) => void;
  onSave: () => void;
}) {
  const complete = Boolean(values.vendorAccountId.trim());

  if (!open) {
    return (
      <section className="program-settings-callout">
        <div className="program-settings-callout-icon">
          <Settings2 size={18} />
        </div>
        <div>
          <span>Program draft</span>
          <strong>Configure payments when you&apos;re ready</strong>
          <p>
            Explore the workspace now. Add the receiving supplier wallet when
            you are ready to activate purchases for <b>{programName}</b>.
          </p>
        </div>
        <button type="button" onClick={() => onOpenChange(true)}>
          Configure payments
          <ChevronDown size={15} />
        </button>
      </section>
    );
  }

  return (
    <section className="program-settings-panel">
      <div className="program-settings-heading">
        <div>
          <span>Program settings</span>
          <h2>Set up supplier payments</h2>
          <p>
            These accounts apply only to <b>{programName}</b>. You can leave
            this unfinished and return later.
          </p>
        </div>
        <button
          className="program-settings-close"
          type="button"
          onClick={() => onOpenChange(false)}
        >
          Do this later
        </button>
      </div>
      <div className="program-role-grid">
        {(
          [[
            "vendorAccountId",
            "Supplier settlement",
            "Receives this program's demo purchase.",
          ]] as const
        ).map(([field, label, help]) => (
          <label className="program-role-field" key={field}>
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
          Purchases that pass policy settle without delivery confirmation or
          a separate finance approval.
        </span>
        <button
          className="op-primary"
          type="button"
          disabled={!complete || saving}
          onClick={onSave}
        >
          {saving ? "Activating program…" : "Save and activate"}
          {!saving && <ArrowRight size={15} />}
        </button>
      </div>
      {error && (
        <small className="program-setup-error" role="alert">
          {error}
        </small>
      )}
    </section>
  );
}
