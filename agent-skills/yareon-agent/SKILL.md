---
name: yareon-agent
description: "Operate Yareon as a delegated procurement agent: inspect a program's policy-eligible offers, compare or recommend an offer, preview and create one World AgentKit-authenticated order, check order state, and read its Hedera audit trail. Use when asked to buy, procure, compare approved suppliers, check a Yareon order, or inspect procurement evidence. Do not use for program administration, funding, supplier management, delivery verification, finance approval, or wallet signing by human roles."
---

# Yareon Agent

Use the `yareon` CLI without bypassing policy, identity, or separation-of-duty controls.

## Boundaries

- Read eligible offers, preview and create one order, and inspect its state or evidence.
- Never create, fund, pause, or configure programs, suppliers, buyers, offers, or delegations.
- Never submit or approve delivery, sign verifier or finance approvals, or force settlement.
- Never invent offer IDs, amounts, identities, approvals, or ledger evidence.
- Keep `WORLD_AGENT_PRIVATE_KEY` in the agent's secret environment. Never print, transmit, or commit it.

## 1. Check readiness

Run:

```bash
yareon doctor
```

If the command is unavailable, use `npx --yes @yareon/cli@latest` in place of `yareon`.

- Continue with reads only when `readyToRead` is true.
- Execute only when `readyToExecute` is true.
- Report failed checks exactly; never work around them.

## 2. Inspect balance, offers, and select

```bash
yareon balance
yareon offers
```

Treat `offers` as the complete eligible set at that moment. This is the
headless agent equivalent of the human Member Purchasing workspace; it does not
expose governor controls. Apply the user's explicit criteria only to returned
fields. Otherwise use `recommendedOfferId`, the lowest-priced eligible offer
with offer ID as the stable tie-breaker.

Stop when no eligible offer exists. Never invent or recalculate amounts; the server derives all financial fields from Mirror Node-backed state.

## 3. Preview, then execute once

```bash
yareon buy --offer-id <offer-id>
```

Report the supplier, description, atomic and display amounts, and delivery estimate. Execute only when the user clearly authorizes this purchase:

```bash
yareon buy --offer-id <offer-id> --execute
```

Accept success only when `result.status` is `CONFIRMED` and `result.agentkit.verified` is true. Never submit multiple offers. On `MUTATION_OUTCOME_UNKNOWN`, inspect evidence before considering another execution.

## 4. Check state and evidence

```bash
yareon order --order-id <order-id>
yareon audit --order-id <order-id> --summary
```

Report the order, exact result or error code, current state, AgentKit and Hedera references, and returned `nextAction`. Reading state never authorizes acting as that independent role.

Never claim settlement until the order is `PAYMENT_EXECUTED` and the payment transaction is present.
