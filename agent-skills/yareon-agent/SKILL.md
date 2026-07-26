---
name: yareon-agent
description: "Operate Yareon as a delegated procurement agent: inspect a program's policy-eligible offers, compare or recommend an offer, preview and create one World AgentKit-authenticated order, check order state, and read its Hedera audit trail. Use when asked to buy, procure, compare approved suppliers, check a Yareon order, or inspect procurement evidence. Do not use for program administration, funding, supplier management, delivery verification, finance approval, or wallet signing by human roles."
---

# Yareon Agent

Use Yareon's agent API without bypassing its policy, identity, or separation-of-duty controls.

## Scope

The agent may:

- Read a program and its currently eligible offers.
- Compare those offers and select one that satisfies the user's stated criteria.
- Preview an order, then create it through World AgentKit.
- Read an order and the append-only Hedera audit trail.

The agent may not:

- Create, fund, pause, or reconfigure programs.
- Add suppliers, offers, buyers, or delegations.
- Submit or approve delivery, sign verifier or finance approvals, or force settlement.
- Invent offer IDs, amounts, identities, approvals, or ledger evidence.

Those actions belong to program administrators or independent human wallet roles.

## Prerequisites

Run from the Yareon repository after `npm install`. Obtain:

- A Yareon base URL, from `YAREON_PUBLIC_URL` or `http://127.0.0.1:3000`.
- A program ID.
- `WORLD_AGENT_PRIVATE_KEY` for the delegated agent when creating an order.

The key must be a dedicated 32-byte EVM key registered in World AgentBook and bound to the program delegation. Never print, log, transmit, or commit it.

Use the bundled CLI:

```bash
npx tsx agent-skills/yareon-agent/scripts/yareon.ts <command> [options]
```

Pass `--base-url https://…` when not using `YAREON_PUBLIC_URL`.

## Workflow

### 1. Inspect before acting

```bash
npx tsx agent-skills/yareon-agent/scripts/yareon.ts context \
  --program-id <program-id>
```

Treat `offers` as the complete eligible set at that moment. Yareon has already checked program status, supplier approval, category rules, delegation validity, per-order and total limits, buyer allocation, and available program funds.

If there are no offers, stop and report that no policy-eligible purchase is available. Do not work around the policy.

### 2. Select an offer

Use the user's explicit criteria when they match fields returned in the context. Otherwise use `recommendedOfferId`, which is the lowest-priced eligible offer with offer ID as the stable tie-breaker.

Do not send or recalculate an amount. The server derives all financial fields from its Mirror Node-backed state.

### 3. Preview the order

```bash
npx tsx agent-skills/yareon-agent/scripts/yareon.ts buy \
  --program-id <program-id> \
  --offer-id <offer-id>
```

Omit `--offer-id` to preview `recommendedOfferId`. Report the supplier, description, amount in atomic units, asset decimals, and delivery estimate when present.

### 4. Create exactly one order

Only execute when the user's request clearly authorizes a purchase:

```bash
npx tsx agent-skills/yareon-agent/scripts/yareon.ts buy \
  --program-id <program-id> \
  --offer-id <offer-id> \
  --execute
```

The CLI obtains the short-lived `402` challenge, signs the exact intent URI with World AgentKit, and submits the identifier-only intent. A successful response must have `status: "CONFIRMED"` and `agentkit.verified: true`.

Do not send multiple offers or retry a timed-out mutation blindly. On an uncertain result, inspect the audit trail for `AGENTKIT_ACCESS_VERIFIED` and `ORDER_CREATED` before trying again.

### 5. Check progress and evidence

```bash
npx tsx agent-skills/yareon-agent/scripts/yareon.ts order \
  --program-id <program-id> \
  --order-id <order-id>

npx tsx agent-skills/yareon-agent/scripts/yareon.ts audit \
  --program-id <program-id>
```

Order states progress as:

`CREATED → VENDOR_ACCEPTED → PAYMENT_SCHEDULED → DELIVERY_SUBMITTED → DELIVERY_APPROVED → PAYMENT_EXECUTED`

Report the current state and what independent role must act next. Reading state does not authorize the agent to perform that role.

## Failure handling

- `400`: Fix missing identifiers or a changed intent. Re-read context before rebuilding it.
- `402`: The request was unsigned. Use the bundled `buy --execute` command.
- `403`: AgentKit verification, configured address, or AgentBook registration failed. Stop and report the server error.
- `404`: The program, delegation, offer, or order does not exist. Re-check IDs.
- `409`: Policy or current state rejected the action. Report the stable error and do not circumvent it.
- `5xx` or network timeout after submission: Treat the outcome as unknown and inspect audit/order state.

## Reporting

After a mutation, return:

- Program, selected offer, supplier, and order ID.
- `CONFIRMED` or the exact rejection.
- Current order state.
- AgentKit verification reference and Hedera ledger reference when returned.
- The next required human or vendor action.

Never claim settlement until the order is `PAYMENT_EXECUTED` and the payment transaction is present.
