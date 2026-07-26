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
              Create a live program, set policy, approve suppliers, fund member
              authority, and monitor the ledger.
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
            <strong>Delegated agent?</strong>
            <span>
              Agents use the same member purchasing boundary through the Yareon
              CLI and installed skill.
            </span>
          </div>
          <code>
            <TerminalSquare size={14} />
            yareon offers
          </code>
        </div>
      </section>
    </main>
  );
}
