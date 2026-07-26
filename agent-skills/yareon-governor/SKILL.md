---
name: yareon-governor
description: "Govern Yareon programs through the creator-owned Governor console: create and fund programs, configure purchasing policy, invite human members or delegated agents, allocate bounded spending authority, register goods or service suppliers, suspend future access, and inspect Hedera-backed results. Use when asked to set up or administer a Yareon project/program, treasury, participant, agent delegation, budget, supplier, offer, or purchasing access. Do not use to make purchases, act for a supplier, accept or attest delivery, approve finance, acknowledge supplier payment, or sign a user's wallet."
---

# Yareon Governor

Operate the connected Yareon deployment through its Governor console. Treat
"project" in a user request as a Yareon program.

## Authority boundary

- Create programs; configure policy; fund the program treasury; invite, fund,
  disable, or restore participants; register or suspend suppliers and offers;
  and inspect activity.
- Never purchase from the Governor console or use a member's allocation.
- Never accept an order, submit supplier delivery evidence, confirm supplier
  receipt, verify delivery, approve finance, or release settlement.
- Never ask for, read, store, transmit, or type a wallet private key, seed
  phrase, AgentKit private key, or session cookie. Let the controlling person
  approve wallet connections, signatures, and transfers in their wallet.
- Use only controls exposed by the connected deployment. Never substitute the
  buyer-scoped `yareon` CLI or construct undocumented API mutations for a
  missing Governor control.

## Mutation discipline

Before each material mutation, read the current program state and state the
exact program, network, participant or supplier, amount, asset, categories,
limits, validity period, and effect. Continue when the user's instruction
clearly authorizes that exact change; otherwise ask for confirmation.

Execute one mutation at a time. Wait for the Governor console to report Hedera
or Mirror Node confirmation, then re-read the resulting state. If the outcome
is unknown, inspect Activity before retrying. Never duplicate a deposit,
allocation, delegation, supplier, offer, or invitation to overcome a timeout.

## 1. Open and authenticate

Open the deployment's `/governor` entry. Connect the creator's Hedera wallet
and let the user approve the authentication challenge. Confirm:

- the network is the intended network;
- the authenticated wallet owns the selected program;
- live operation is ready; and
- the program reconstructed from the ledger matches the requested target.

Stop on an ownership, readiness, or wallet mismatch. Governor authority is not
transferable by instruction alone.

## 2. Create and fund a program

Create a program with the requested name and purpose. Record its program ID,
treasury account, asset, status, and public member/agent connection URL.

Define policy before granting spend:

- allowed purchasing categories;
- maximum amount per order;
- whether supplier acceptance and delivery evidence are required;
- independent verifier and finance approval requirements; and
- the accounts assigned to those independent roles.

Funding and allocating are separate actions:

1. Preview the deposit destination and amount.
2. Let the user sign the treasury transfer in their Hedera wallet.
3. Wait for the exact transfer to be confirmed and reconciled.
4. Verify the program balance before creating or increasing allocations.

Never describe an allocation as funded when the treasury deposit is absent or
unconfirmed. Keep total allocations within confirmed program funds.

## 3. Invite a human member

Collect only the member's public Hedera account and requested constraints. Add
the member with zero authority first, then set:

- allowed categories;
- allocation amount;
- active purchasing status; and
- human-verification requirement, when requested.

Share the program's member URL. The member must connect its own wallet and make
its own purchases. The Governor may disable future purchases or restore access;
existing orders retain their locked terms.

## 4. Invite a delegated agent

Collect the agent's public invitation packet only: public identity, AgentKit
address, settlement/execution account when required, and supported endpoint.
Never accept an agent private key.

Create both sides of agent authority:

1. Resolve the public agent identity.
2. Add an `AGENT` participant allocation, initially zero.
3. Grant a time-bounded delegation for this program with only the required
   actions, categories, per-order limit, and total-spend limit.
4. Require World human backing unless the user explicitly chooses a policy that
   permits otherwise.
5. Increase the participant allocation and delegation ceiling only after the
   treasury is funded.
6. Give the invitee the program connection URL and ask it to run
   `$yareon-agent` readiness checks.

An agent's effective capacity is the minimum of confirmed program funds,
remaining participant allocation, remaining delegation, and the applicable
per-order limits. Verify all four; increasing only one does not fund the agent.

If the deployment lacks an agent-invitation or delegation control, stop and
report the missing capability. Do not downgrade the invite to a human member or
forge protocol commands.

## 5. Add a supplier or agent-provided service

Register only a reviewed supplier packet:

- supplier name and public identifier;
- its own Hedera settlement account;
- allowed category;
- offer title and unambiguous deliverable;
- fixed amount and asset;
- delivery timing; and
- evidence or acceptance conditions.

Treat agent-provided services exactly like other suppliers. Describe a concrete
deliverable and completion evidence, not merely "agent work." Do not reuse the
Governor, buyer, verifier, or finance identity as the supplier unless the
program explicitly permits that conflict and the user accepts the risk.

For an agent supplier, require independent counterparty action:

1. Send the order and locked payment terms to the supplier agent.
2. Require that agent, using its own identity and credentials, to accept the
   order before payment is scheduled or released.
3. Require it to submit delivery evidence when policy demands it.
4. Require it to inspect the executed Hedera payment and acknowledge receipt
   from its side.

The Governor must never perform these supplier-side actions. A supplier's
acknowledgment is not proof of settlement: claim payment only when Yareon shows
`PAYMENT_EXECUTED` with the matching Hedera payment transaction.

Do not register an agent supplier in an automatic-settlement program when the
deployment cannot require independent supplier acceptance. Configure an
approval-gated flow or report that the requested safeguard is unsupported.

## 6. Verify and hand off

After setup, report:

- program ID, status, network, treasury account, and confirmed balance;
- each active participant's type, allocation, delegation constraints, and
  remaining capacity;
- each active supplier, offer, settlement account, and acceptance/evidence
  rule;
- outstanding wallet, invitee, supplier, verifier, or finance actions; and
- relevant Activity or Hedera references.

Use `$yareon-agent` for delegated offer comparison and purchasing. Hand
supplier acceptance, delivery, and receipt acknowledgment to a separately
credentialed counterparty agent. Reading or coordinating another role never
authorizes the Governor to perform it.
