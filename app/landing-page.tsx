"use client";

import {
  ArrowRight,
  Check,
  FileCheck2,
  Fingerprint,
  Landmark,
  LockKeyhole,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

export function LandingPage({
  showcaseAvailable = false,
  showcaseLoading = false,
  onShowcase,
}: {
  showcaseAvailable?: boolean;
  showcaseLoading?: boolean;
  onShowcase?: () => void;
}) {
  return (
    <main className="shell charter-landing">
      <header className="topbar">
        <div className="brand live-brand" aria-label="Charter">
          <span className="brand-mark">CH</span>
          <span>Charter</span>
          <small>Programmable procurement</small>
        </div>
        <div className="landing-nav">
          {showcaseAvailable && onShowcase && (
            <button onClick={onShowcase}>View ledger proof</button>
          )}
          <a href="/signin-with-chatgpt?return_to=%2F">
            Sign in <ArrowRight size={14} />
          </a>
        </div>
      </header>

      <section className="hero landing-hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <ShieldCheck size={15} />
            Real programs on Hedera testnet
          </div>
          <h1>
            Let people buy.
            <br />
            <span>Keep the rules intact.</span>
          </h1>
          <p>
            Create a procurement program, delegate bounded buyer allocations,
            verify delivery, and release payment through independent wallets.
            Every important decision remains reconstructable from the ledger.
          </p>
          <div className="landing-actions">
            <a className="landing-primary" href="/signin-with-chatgpt?return_to=%2F">
              Create a live program <ArrowRight size={17} />
            </a>
            {showcaseAvailable && onShowcase ? (
              <button className="landing-secondary" onClick={onShowcase}>
                Inspect a completed program
              </button>
            ) : (
              <span className="landing-proof-status">
                {showcaseLoading ? "Checking public ledger proof…" : "No sample data substituted"}
              </span>
            )}
          </div>
        </div>

        <div className="landing-ledger" aria-label="Charter control sequence">
          <div className="landing-ledger-head">
            <span>Program lifecycle</span>
            <strong>Four enforceable boundaries</strong>
          </div>
          <LandingStep
            number="01"
            icon={<Fingerprint size={17} />}
            title="Delegate"
            detail="Buyer, category, and amount limits"
          />
          <LandingStep
            number="02"
            icon={<FileCheck2 size={17} />}
            title="Verify"
            detail="Delivery evidence by digest"
          />
          <LandingStep
            number="03"
            icon={<WalletCards size={17} />}
            title="Approve"
            detail="Distinct verifier and finance wallets"
          />
          <LandingStep
            number="04"
            icon={<Landmark size={17} />}
            title="Settle"
            detail="Scheduled HBAR payment"
            last
          />
        </div>
      </section>

      <section className="landing-trust">
        <div><Check size={15} /><span>Program creator becomes administrator</span></div>
        <div><Check size={15} /><span>Allocations append without rewriting history</span></div>
        <div><Check size={15} /><span>Mirror Node rebuilds current state</span></div>
        <div><Check size={15} /><span>Public proof links to HashScan</span></div>
      </section>

      <section className="landing-explainer">
        <div className="landing-explainer-copy">
          <span className="section-label">One system, clear authority</span>
          <h2>Administration belongs to the program creator.</h2>
          <p>
            Any signed-in user can create a real testnet program. Charter binds
            that creator to the program’s first ledger event. Buyers act within
            allocations; delivery and finance remain separate roles.
          </p>
        </div>
        <div className="landing-role-grid">
          <RoleCard label="Creator" detail="Defines the program and funds buyer authority." />
          <RoleCard label="Buyer" detail="Chooses approved offers within an explicit allocation." />
          <RoleCard label="Verifier" detail="Confirms delivery with an independent Hedera wallet." />
          <RoleCard label="Finance" detail="Adds the final signature that releases settlement." />
        </div>
      </section>

      <section className="landing-final">
        <LockKeyhole size={24} />
        <div>
          <span>Start with authority, not paperwork</span>
          <strong>Create your first live procurement program.</strong>
        </div>
        <a href="/signin-with-chatgpt?return_to=%2F">
          Sign in and create <ArrowRight size={16} />
        </a>
      </section>
    </main>
  );
}

function LandingStep({
  number,
  icon,
  title,
  detail,
  last = false,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  detail: string;
  last?: boolean;
}) {
  return (
    <div className="landing-ledger-step">
      <span>{number}</span>
      <i>{icon}</i>
      <div><strong>{title}</strong><small>{detail}</small></div>
      {!last && <ArrowRight size={14} />}
    </div>
  );
}

function RoleCard({ label, detail }: { label: string; detail: string }) {
  return (
    <article>
      <span>{label}</span>
      <p>{detail}</p>
    </article>
  );
}
