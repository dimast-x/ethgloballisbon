"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { BrandLogo } from "./brand-logo";

export function AppLoadingPage({
  message = "Restoring your workspace…",
}: {
  message?: string;
}) {
  return (
    <main className="shell loading-shell" aria-busy="true" aria-live="polite">
      <div className="loading-card">
        <RefreshCw className="spin" size={24} aria-hidden="true" />
        <strong>Loading Yareon</strong>
        <span>{message}</span>
      </div>
    </main>
  );
}

export function LandingPage({
  creating = false,
  createError,
  onCreate,
  onControlPanel,
}: {
  creating?: boolean;
  createError?: string | null;
  onCreate?: () => void;
  onControlPanel?: () => void;
}) {
  return (
    <main className="shell op-app landing-center-shell">
      <section className="landing-center-content">
        <div className="op-brand" aria-label="Yareon">
          <BrandLogo className="op-brand-mark" />
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
          Create a procurement program, fund bounded member authority, and let
          members buy from approved suppliers within their available budget.
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
          {onControlPanel && (
            <button
              className="op-secondary"
              type="button"
              disabled={creating}
              onClick={onControlPanel}
            >
              Open control panel
            </button>
          )}
        </div>
        <div className="op-trust-line">
          <span>Creator-owned administration</span>
          <span>Append-only member funding</span>
          <span>Policy-authorized payments</span>
        </div>
        {createError && <small role="alert">{createError}</small>}
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
            <BrandLogo className="op-brand-mark" />
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
              Yareon will create the program now. Activate its treasury when
              you&apos;re ready, then add suppliers at any time.
            </p>
          </div>
          <div className="program-create-form">
            <label htmlFor="program-name">Program name</label>
            <input
              id="program-name"
              autoFocus
              autoComplete="off"
              value={name}
              placeholder="Program name"
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
                : "The dedicated treasury starts empty; fund it from your wallet in the workspace."}
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
  open,
  saving,
  error,
  onOpenChange,
  onSave,
}: {
  programName: string;
  open: boolean;
  saving: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}) {
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
            Explore the workspace now. You can activate the program before
            adding suppliers.
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
            Activate <b>{programName}</b> now. Suppliers can be added later,
            and each settlement account is validated when added.
          </p>
        </div>
        <button
          className="op-primary"
          type="button"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? "Activating program…" : "Activate program"}
          {!saving && <ArrowRight size={15} />}
        </button>
      </div>
      <div className="program-role-grid">
        <div className="program-role-field">
          <span className="program-role-copy">
            <strong>Per-supplier settlement</strong>
            <small>
              Each supplier has its own validated settlement account. Accounts
              are never shared across the program.
            </small>
          </span>
        </div>
      </div>
      <div className="program-setup-actions">
        <span>
          The program can be active without suppliers. Purchases become
          available after an approved supplier and offer are added.
        </span>
        <button
          className="program-settings-close"
          type="button"
          disabled={saving}
          onClick={() => onOpenChange(false)}
        >
          Do this later
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
