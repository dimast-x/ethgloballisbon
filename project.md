# Yareon — Implemented System Reference

- Status: working hackathon implementation
- Network: Hedera testnet
- Identity environment: World AgentKit staging simulator with AgentBook on
  Base Sepolia
- Last verified: 2026-07-26

This document describes only the system currently implemented in this
repository. Submission evidence is recorded separately in
[`docs/qualification-e2e-log.md`](docs/qualification-e2e-log.md).

## Product

Yareon is a policy-controlled organizational procurement system. A governor
funds a program treasury, approves suppliers and offers, and grants a buyer or
AI agent bounded purchasing authority. A buyer chooses only among eligible
offers. Yareon records authorization and order events on Hedera Consensus
Service and settles approved purchases in HBAR.

World AgentKit is used specifically for the AI-agent path. Before Yareon grants
an agent procurement execution rights, the agent must sign a short-lived,
intent-bound challenge and resolve as registered in the configured World
AgentBook. Human backing does not bypass organizational policy; it enables
Yareon to evaluate the agent's program, action, category, per-order,
total-spend, validity, and execution-account delegation.

## Submission targets

The implemented system targets:

1. World — AgentKit New Use Cases
2. Hedera — AI & Agentic Payments
3. Hedera — “No Solidity Allowed” — Build with Hedera SDKs

The system does not implement or claim Selfie Check, Identity Check, HTS
tokenization, x402, OpenClaw ACP, A2A, HCS-14, UCP, cross-chain automation, or
Solidity contracts.

## Implemented actors and boundaries

### Governor

- Authenticates with the Hedera account that owns the program.
- Creates programs and dedicated treasuries.
- Configures policy and settlement accounts.
- Deposits and reconciles program funds.
- Creates human or agent buyer allocations.
- Grants bounded agent delegations.
- Registers and suspends suppliers and offers.
- Reads program-wide orders and HCS activity.
- Cannot purchase with a member allocation or approve supplier delivery or
  finance.

### Human member

- Authenticates with the Hedera account assigned to its allocation.
- Reads its remaining budget, eligible offers, and orders.
- Creates an order from an eligible offer.
- Cannot administer the program, manage suppliers, or approve settlement.

### Procurement agent

- Uses the `@yareon/cli` package or local built CLI.
- Reads program context, balance, and policy-eligible offers.
- Previews an order.
- Signs a World AgentKit challenge for an explicitly authorized purchase.
- Creates one order within its delegation.
- Reads order and HCS audit state.
- Cannot mutate program policy, suppliers, allocations, evidence, or human
  approvals.

### Supplier

- Uses its own Hedera identity.
- Accepts an order.
- Submits a SHA-256 delivery-evidence reference.
- Receives the final HBAR payment in its independent settlement account.

### Delivery verifier and finance

- Use different Hedera accounts and private keys.
- Sign the exact Hedera payment schedule assigned to their role.
- Are accepted by Yareon only after Mirror Node and Hedera confirm the
  schedule-sign transaction and signer key.

## Implemented policies

A program contains:

- status;
- confirmed HBAR budget;
- allowed categories;
- delivery-evidence requirement;
- required approval roles;
- approved suppliers and fixed-price offers;
- buyer allocations; and
- optional agent delegations.

An allocation contains:

- program and buyer identifiers;
- participant type (`HUMAN` or `AGENT`);
- Hedera execution account;
- active/disabled purchasing state;
- total, committed, and paid amounts; and
- allowed categories.

An agent delegation contains:

- principal and agent identifiers;
- public World agent address;
- allowed programs, actions, and categories;
- maximum per-order amount;
- maximum total spend;
- validity interval; and
- integrity hash binding the authority record.

The authorization engine evaluates program state, buyer state, category,
supplier approval, allocation capacity, resolved agent identity, execution
account, World human backing, delegation integrity, scope, time, per-order
limit, and total-spend limit. Rejections are first-class HCS events with stable
decision codes.

## World AgentKit implementation

The protected resource is:

```text
POST /api/agents/agentkit/procure?intent=<sha256>
```

Implemented request sequence:

1. The agent reads a Mirror-derived program context.
2. It submits an identifier-only procurement intent.
3. The resource returns an AgentKit `402` challenge valid for five minutes.
4. The agent signs the challenge with its dedicated EVM key and retries.
5. The server validates:
   - exact URI and intent binding;
   - challenge freshness and expiry;
   - EIP-191 signature;
   - configured public agent address;
   - AgentBook registration; and
   - one-time verification reference.
6. Yareon stores only the public agent address, verification method, expiry,
   and SHA-256 verification reference.
7. Deterministic delegation and procurement policy run before order creation.

The raw World human identifier is not persisted, returned to the client, or
written to HCS.

The qualification run registered:

```text
Agent address:
0x97679cc5ED6BcEF8Ea807676AAE8E6178e4C88E0

AgentBook:
Base Sepolia
0xA23aB2712eA7BBa896930544C7d6636a96b944dA
```

Registration proof:
[BaseScan transaction](https://sepolia.basescan.org/tx/0x6c65bf2db225655d2ac24ed017a79bb6747b4c58d6c08d5c8a0aacbaac6ce6a9).

## Hedera implementation

### Hedera Consensus Service

One shared HCS topic stores the append-only protocol event stream:

```text
0.0.9751463
```

Recorded events include program creation, settlement configuration, funding,
allocations, agent identity and delegation, AgentKit access, authorization
decisions, supplier configuration, order state transitions, evidence,
approvals, and payment execution.

Events contain stable identifiers, actors, correlations, application
timestamps, and event-specific data. Mirror Node consensus timestamps and
sequence numbers provide the public ledger reference.

### Native HBAR transfers

The simplified policy path executes a direct
`TransferTransaction` from the program treasury to the supplier after the
AgentKit-authenticated order passes policy. The completed test moved
`10,000,000` tinybar exactly once.

### Hedera Scheduled Transactions

The approval-gated path creates a treasury controlled by a Hedera `KeyList`
whose threshold requires both the configured delivery-verifier and finance
keys.

After supplier acceptance, Yareon creates a scheduled HBAR transfer. The
supplier submits evidence, the verifier signs, and finance adds the second
signature. Hedera executes the scheduled transfer automatically when the
required signature set is complete.

Completed schedule:

```text
0.0.9763828
```

Public proof:
[Hashscan schedule](https://hashscan.io/testnet/schedule/0.0.9763828).

### Mirror Node

Mirror Node is used to:

- reconstruct program state from HCS;
- confirm deposits before crediting budget;
- find schedules and executed transactions;
- validate schedule-sign transactions;
- verify exact treasury debits and supplier credits; and
- expose public audit views.

The public application has no simulated fallback. In-memory adapters are
limited to automated tests.

## Tested end-to-end flows

### Direct AgentKit payment

```text
Program: program_ad3ae3409d0b
Order: order_b482feba5457
Treasury: 0.0.9763647
Supplier: 0.0.9763642
Amount: 0.1 HBAR
Payment: 0.0.9708339@1785045836.532109133
Final state: PAYMENT_EXECUTED
```

The run also contains:

- unsigned bot rejection with HTTP `402`;
- verified-agent rejection above the `0.2 HBAR` per-order limit; and
- an HCS-backed World verification reference.

Payment proof:
[Hashscan transaction](https://hashscan.io/testnet/transaction/0.0.9708339%401785045836.532109133).

### Approval-gated scheduled payment

```text
Program: program_28f2637a58be
Order: order_2f7baf8eec46
Treasury: 0.0.9763798
Supplier: 0.0.9763642
Verifier: 0.0.9763643
Finance: 0.0.9763644
Amount: 0.1 HBAR
Schedule: 0.0.9763828
Payment: 0.0.9708339@1785046307.224950527?scheduled
Final state: PAYMENT_EXECUTED
```

The run proves independent supplier acceptance, hashed delivery evidence,
distinct verifier and finance signatures, automatic execution after the
second signature, exact treasury debit, exact supplier credit, and Mirror
reconstruction.

The complete public record is in
[`docs/qualification-e2e-log.md`](docs/qualification-e2e-log.md).

## Order lifecycle

The approval-gated lifecycle is:

```text
CREATED
  → VENDOR_ACCEPTED
  → PAYMENT_SCHEDULED
  → DELIVERY_SUBMITTED
  → DELIVERY_APPROVED
  → PAYMENT_EXECUTED
```

The direct policy path creates the order and records the direct transfer and
`PAYMENT_EXECUTED` events in the same authorized command.

All monetary values use integer atomic units. Commands use stable idempotency
keys, and reducers ignore duplicate event IDs.

## Security implementation

- Dedicated program treasury accounts isolate funds from the platform
  operator.
- The operator pays platform transaction fees but is not treated as program
  budget.
- Governor ownership is enforced with Hedera-wallet authentication and an
  HTTP-only server session.
- Agent and human member APIs have separate authority boundaries.
- Agent private keys and role private keys are read from secret environments
  and are never accepted as CLI arguments.
- Funding is credited only after exact Mirror Node transaction verification.
- Role approvals require the configured Hedera account, successful
  `SCHEDULESIGN` transaction, matching schedule, and signer key.
- AgentKit challenges are intent-bound, short-lived, and replay-protected.
- Evidence stores a SHA-256 digest and metadata, not document contents.
- HCS excludes private keys, raw World identity material, cookies, and wallet
  session data.

## User interfaces and automation

Implemented application entries:

- `/governor` — program creation, funding, members, agents, suppliers, orders,
  and activity
- `/member?programId=<id>` — member balance, eligible catalog, and orders
- `/api/agents/agentkit/*` — AgentKit context, manifest, and protected
  procurement

Implemented automation:

- `@yareon/cli` — agent readiness, context, balance, offers, preview,
  execution, order state, and audit
- `scripts/governor-cli.ts` — dedicated testnet governor wallet and program
  setup
- `scripts/role-cli.ts` — separately credentialed supplier, verifier, and
  finance actions
- `scripts/verify-live-run.ts` — independent HCS, schedule, signer, World
  reference, and exact-transfer checks
- `scripts/audit-cli.ts` — Mirror-backed public program reconstruction
- `agent-skills/yareon-agent` and `agent-skills/yareon-governor` — safe
  operating instructions for agentic use

## Source map

```text
app/
  Next.js user interfaces and API routes

src/protocol/
  Types, money, policy, events, and reducer

src/application/
  Commands, authorization, funding, identity, roles, and orchestration

src/adapters/
  World AgentKit, Hedera SDK, HCS, schedules, transfers, and Mirror Node

packages/cli/
  Headless procurement-agent CLI

agent-skills/
  Governor and procurement-agent skills

scripts/
  Testnet provisioning, governor/role automation, audit, and verification

test/ and tests/
  Protocol, application, integration, live testnet, CLI, security, and
  rendered-site checks
```

## Configuration

The committed template is [`.env.example`](.env.example). It documents:

- Hedera testnet network;
- server authentication secret;
- operator account and key;
- HCS topic;
- Mirror Node;
- WalletConnect project;
- public World agent address;
- AgentBook RPC, contract, and network; and
- public application URL.

Private local files are excluded by `.gitignore`.

## Verification status

Completed checks:

- `54` unit/integration tests passed;
- live Hedera golden-run test passed;
- both live programs passed `verify:live`;
- AgentBook validation passed;
- TypeScript passed;
- ESLint passed;
- CLI build passed;
- Next.js production build passed; and
- `3` rendered-site checks passed.

Reproduction commands and exact public artifacts:
[`docs/qualification-e2e-log.md`](docs/qualification-e2e-log.md).
