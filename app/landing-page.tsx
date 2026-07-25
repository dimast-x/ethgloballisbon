"use client";

import {
  ArrowRight,
  Check,
  ChevronDown,
  FolderOpen,
  LogOut,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { toDisplay } from "@/src/protocol/money";
import type { ProgramListItem } from "@/src/application/runtime";

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

export function ProgramCreatePage({
  name,
  creating,
  error,
  programs,
  programsLoading,
  onNameChange,
  onCreate,
  onOpenProgram,
  onDisconnect,
}: {
  name: string;
  creating: boolean;
  error?: string | null;
  programs: ProgramListItem[];
  programsLoading: boolean;
  onNameChange: (value: string) => void;
  onCreate: () => void;
  onOpenProgram: (programId: string) => void;
  onDisconnect: () => void;
}) {
  return (
    <main className="shell op-app landing-center-shell">
      <section className="program-create-card">
        <div className="program-create-topbar">
          <div className="op-brand" aria-label="Yareon">
            <span className="op-brand-mark">YA</span>
            <span>
              <strong>Yareon</strong>
              <small>Programs</small>
            </span>
          </div>
          <button
            className="program-disconnect"
            type="button"
            onClick={onDisconnect}
          >
            <LogOut size={14} />
            Disconnect wallet
          </button>
        </div>
        <div className="program-create-layout">
          <div className="program-setup-heading">
            <span>One-minute setup</span>
            <h1>Start with a name.</h1>
            <p>
              That&apos;s enough to create your program and open the workspace.
              Payment roles belong to each program and can be added later from
              its settings.
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
                : "No verifier, finance, vendor, or treasury details needed now."}
            </span>
            {error && (
              <small className="program-setup-error" role="alert">
                {error}
              </small>
            )}
          </div>
        </div>

        <section className="program-directory" aria-labelledby="existing-programs">
          <div className="program-directory-heading">
            <span>
              <FolderOpen size={15} />
              <strong id="existing-programs">Existing programs</strong>
            </span>
            <small>
              {programsLoading
                ? "Reading Hedera…"
                : `${programs.length} ${programs.length === 1 ? "program" : "programs"}`}
            </small>
          </div>
          {!programsLoading && programs.length === 0 ? (
            <p>Your wallet has not created any programs yet.</p>
          ) : (
            <div className="program-directory-list">
              {programs.map((program) => (
                <button
                  type="button"
                  key={program.programId}
                  onClick={() => onOpenProgram(program.programId)}
                  disabled={creating}
                >
                  <span className="program-directory-avatar">
                    {program.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span>
                    <strong>{program.name}</strong>
                    <small>
                      {toDisplay(program.budget)} {program.budget.asset} ·{" "}
                      {new Date(program.createdAt).toLocaleDateString()}
                    </small>
                  </span>
                  <span className={`program-directory-status ${program.status.toLowerCase()}`}>
                    {program.status === "ACTIVE" ? "Active" : "Draft"}
                  </span>
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          )}
        </section>
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
  const complete = Object.values(values).every((value) => value.trim());

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
            Explore the workspace now. Verifier, finance, and vendor wallets
            are saved only for <b>{programName}</b>.
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
          <h2>Set up payment release</h2>
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
          [
            [
              "verifierAccountId",
              "Delivery verifier",
              "Confirms the delivery evidence.",
            ],
            [
              "financeAccountId",
              "Finance approver",
              "Authorizes the payment release.",
            ],
            [
              "vendorAccountId",
              "Vendor settlement",
              "Receives this program's demo purchase.",
            ],
          ] as const
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
          Saving creates this program&apos;s 2-of-2 treasury and provisions it
          with 5 testnet HBAR.
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
