import {
  ArrowRight,
  Bot,
  ShieldCheck,
  ShoppingBag,
  TerminalSquare,
} from "lucide-react";
import Link from "next/link";
import { BrandLogo } from "./brand-logo";

export function RoleSelection() {
  return (
    <main className="shell role-selection-shell">
      <section className="role-selection">
        <div className="op-brand" aria-label="Yareon">
          <BrandLogo className="op-brand-mark" />
          <span>
            <strong>Yareon</strong>
            <small>Policy-controlled spending</small>
          </span>
        </div>
        <div className="op-kicker">
          <ShieldCheck size={15} />
          Clear authority for every role
        </div>
        <h1>
          Control at the core.
          <br />
          <span>Choice at the edge.</span>
        </h1>
        <p>
          Governors define and fund the program. Members and delegated agents
          choose independently from the offers that pass those rules.
        </p>

        <div className="role-entry-grid">
          <Link className="role-entry-card governor" href="/governor">
            <span className="role-entry-icon">
              <ShieldCheck size={22} />
            </span>
            <span className="role-entry-kicker">For program owners</span>
            <strong>Governor console</strong>
            <p>
              Create a live program, approve suppliers, fund member budgets,
              and monitor the ledger.
            </p>
            <span className="role-entry-action">
              Open governor console
              <ArrowRight size={15} />
            </span>
          </Link>
          <Link className="role-entry-card member" href="/member">
            <span className="role-entry-icon">
              <ShoppingBag size={22} />
            </span>
            <span className="role-entry-kicker">For people with an allocation</span>
            <strong>Member purchasing</strong>
            <p>
              See your balance and eligible offers, make your own supplier
              choice, and track your orders.
            </p>
            <span className="role-entry-action">
              Open member workspace
              <ArrowRight size={15} />
            </span>
          </Link>
        </div>

        <div className="agent-entry-note">
          <span className="role-entry-icon">
            <Bot size={19} />
          </span>
          <div>
            <strong>Using an agent?</strong>
            <span>
              Purchasing agents use the member boundary through the Yareon CLI
              and $yareon-agent. Governor agents administer programs through
              the creator-owned console and $yareon-governor.
            </span>
            <a
              href="https://github.com/dimast-x/ethgloballisbon/blob/master/agent-skills/README.md"
              target="_blank"
              rel="noreferrer"
            >
              View and install Yareon agent skills
              <ArrowRight size={13} />
            </a>
          </div>
          <code>
            <TerminalSquare size={14} />
            yareon skill install
          </code>
        </div>
      </section>
    </main>
  );
}
