# Qualification end-to-end execution log

Date: 2026-07-26
Environment: Hedera testnet, Base Sepolia AgentBook

This log records public verification artifacts from the qualification run.
Private keys, authentication material, internal debugging, and implementation
changes are intentionally excluded.

## Setup and scope

Yareon was tested as a delegated procurement system spanning World and Hedera.
A dedicated governor account created and funded two Hedera testnet programs.
One World AgentBook-registered agent received a bounded allocation and
delegation, then purchased the same `0.1 HBAR` service through two settlement
policies:

1. **Direct agentic payment:** an AgentKit-authenticated order immediately
   executes a native HBAR transfer when policy requires no delivery or human
   approvals.
2. **Approval-gated payment:** the agent creates the order, an independent
   supplier accepts and submits hashed evidence, and distinct verifier and
   finance accounts sign a 2-of-2 Hedera Scheduled Transaction before payment.

Both flows also tested an unsigned bot rejection and a signed request above the
agent's per-order limit. State and policy events were written to Hedera
Consensus Service and reconstructed independently from Mirror Node.

Tools used:

- repository `yareon-governor` and `yareon-agent` skills;
- Yareon governor, agent, and role-scoped command-line tools;
- World AgentKit and the Base Sepolia AgentBook contract;
- Hedera JavaScript SDK, native HBAR transfers, Scheduled Transactions, and
  Hedera Consensus Service;
- Hedera Mirror Node and Hashscan for independent ledger verification; and
- Vitest, TypeScript, ESLint, and the Next.js production build for release
  validation.

## World AgentBook prerequisite

- Agent address: `0x97679cc5ED6BcEF8Ea807676AAE8E6178e4C88E0`
- Network: Base Sepolia (`84532`)
- AgentBook contract: `0xA23aB2712eA7BBa896930544C7d6636a96b944dA`
- Registration transaction:
  `0x6c65bf2db225655d2ac24ed017a79bb6747b4c58d6c08d5c8a0aacbaac6ce6a9`
- Explorer:
  https://sepolia.basescan.org/tx/0x6c65bf2db225655d2ac24ed017a79bb6747b4c58d6c08d5c8a0aacbaac6ce6a9
- SDK verification result: registered (`lookupHuman` returned a non-zero
  anonymous identifier)

## Governor setup

- Governor account: `0.0.9763587`
- Program: `program_ad3ae3409d0b`
- Run: `run_b482feba5457`
- HCS topic: `0.0.9751463`
- Program treasury: `0.0.9763647`
- Treasury deposit: `1 HBAR`
- Deposit transaction: `0.0.9763587@1785045336.890800035`
- Agent ID: `agent_ad3ae3409d0b`
- Agent Hedera execution account: `0.0.9763641`
- Agent participant allocation: `0.5 HBAR`
- Agent total delegation: `0.5 HBAR`
- Agent per-order limit: `0.2 HBAR`
- AgentKit address: `0x97679cc5ED6BcEF8Ea807676AAE8E6178e4C88E0`
- Supplier account: `0.0.9763642`
- Offer: `offer_ad3ae3409d0b`
- Offer amount: `0.1 HBAR`
- Program state after setup: `ACTIVE`

## Agent procurement

- Unsigned bot probe: rejected with HTTP `402`; no order or payment created.
- Signed over-limit probe: rejected with
  `AGENT_ORDER_LIMIT_EXCEEDED`.
- Over-limit decision: HCS sequence `227`.
- Successful direct-settlement order: `order_b482feba5457`
- AgentKit verification reference:
  `sha256:91809bc37e9e38213e8399adde4e61842087f116d52530c62819a3f5407350d8`
- Order result: `PAYMENT_EXECUTED`
- Payment: `0.1 HBAR`
- Payment transaction: `0.0.9708339@1785045836.532109133`
- Payment terminal event: HCS sequence `224`
- Payment explorer:
  https://hashscan.io/testnet/transaction/0.0.9708339%401785045836.532109133

## Approval-gated scheduled payment

- Program: `program_28f2637a58be`
- Run: `run_2f7baf8eec46`
- Program treasury: `0.0.9763798`
- Treasury deposit: `1 HBAR`
- Deposit transaction: `0.0.9763587@1785046115.955706172`
- Agent: `agent_28f2637a58be`
- Agent-created order: `order_2f7baf8eec46`
- AgentKit verification reference:
  `sha256:8aacfc70e3bfe6ed89b9fe92427a5ea3c8d02d8ed4195c048ccda9e82d5af9d3`
- Order-created event: HCS sequence `243`
- Supplier: `0.0.9763642`
- Delivery evidence:
  `sha256:f743ec724e34be5af26516f72cec67d062c950f7461e9ef774434922d6d1f6f1`
- Delivery event: HCS sequence `246`
- Schedule: `0.0.9763828`
- Schedule explorer:
  https://hashscan.io/testnet/schedule/0.0.9763828
- Delivery verifier: `0.0.9763643`
- Verifier schedule-sign transaction:
  `0.0.9763643@1785046353.199525010`
- Verifier signature event: HCS sequence `248`
- Finance approver: `0.0.9763644`
- Finance schedule-sign transaction:
  `0.0.9763644@1785046417.116011700`
- Finance signature event: HCS sequence `249`
- Executed payment: `0.1 HBAR`
- Scheduled payment transaction:
  `0.0.9708339@1785046307.224950527?scheduled`
- Payment terminal event: HCS sequence `250`
- Payment explorer:
  https://hashscan.io/testnet/transaction/0.0.9708339%401785046307.224950527%3Fscheduled
- Signed over-limit decision: `AGENT_ORDER_LIMIT_EXCEEDED`, HCS sequence
  `253`
- Final order state: `PAYMENT_EXECUTED`

## Hedera verification

- HCS topic:
  https://hashscan.io/testnet/topic/0.0.9751463
- Both programs reconstruct successfully from Mirror Node HCS messages.
- Direct payment verification: exact `10,000,000` tinybar treasury debit and
  supplier credit.
- Scheduled payment verification: exact `10,000,000` tinybar treasury debit
  and supplier credit.
- Schedule state: executed.
- Schedule signers: distinct verifier and finance account keys.
- Direct program verification: passed (`19` reconstructed events).
- Scheduled program verification: passed (`22` reconstructed events).
- No Solidity contracts are used; settlement uses Hedera SDK transfers,
  Scheduled Transactions, HCS, and Mirror Node.

## Commands executed

The following is the sanitized command record for the successful qualification
workflow. Secret-bearing environment files and internal diagnostic commands
are intentionally excluded.

```bash
# World and governor readiness
npm run agentkit:validate
npm run governor:cli -- doctor
npm run governor:cli -- roles:create

# Direct agentic program
npm run governor:cli -- bootstrap-agentic "Yareon Qualification Agentic"
node packages/cli/dist/cli.cjs doctor --base-url http://localhost:3000 --program-id program_ad3ae3409d0b
node packages/cli/dist/cli.cjs balance --base-url http://localhost:3000 --program-id program_ad3ae3409d0b
node packages/cli/dist/cli.cjs offers --base-url http://localhost:3000 --program-id program_ad3ae3409d0b
node packages/cli/dist/cli.cjs buy --base-url http://localhost:3000 --program-id program_ad3ae3409d0b --offer-id offer_ad3ae3409d0b
node packages/cli/dist/cli.cjs buy --base-url http://localhost:3000 --program-id program_ad3ae3409d0b --offer-id offer_ad3ae3409d0b --execute
npm run demo:agentkit -- program_ad3ae3409d0b
node packages/cli/dist/cli.cjs audit --base-url http://localhost:3000 --program-id program_ad3ae3409d0b --order-id order_b482feba5457 --summary

# Approval-gated program
npm run governor:cli -- bootstrap-advanced
npm run governor:cli -- resume-advanced program_28f2637a58be 0.0.9763587@1785046115.955706172
node packages/cli/dist/cli.cjs buy --base-url http://localhost:3000 --program-id program_28f2637a58be --offer-id offer_28f2637a58be --execute
npm run role:cli -- accept program_28f2637a58be order_2f7baf8eec46
npm run role:cli -- deliver program_28f2637a58be order_2f7baf8eec46
npm run role:cli -- verify program_28f2637a58be order_2f7baf8eec46 0.0.9763643@1785046353.199525010
npm run role:cli -- finance program_28f2637a58be order_2f7baf8eec46
npm run demo:agentkit -- program_28f2637a58be
node packages/cli/dist/cli.cjs order --base-url http://localhost:3000 --program-id program_28f2637a58be --order-id order_2f7baf8eec46
node packages/cli/dist/cli.cjs audit --base-url http://localhost:3000 --program-id program_28f2637a58be --order-id order_2f7baf8eec46 --summary

# Independent ledger verification
npm run verify:live -- program_ad3ae3409d0b
npm run verify:live -- program_28f2637a58be
npm run audit:cli -- program_28f2637a58be testnet

# Release checks
RUN_HEDERA_TESTNET=1 HEDERA_TEST_PROGRAM_ID=program_28f2637a58be npm run test:testnet
npm test
npm run typecheck
npm run lint
npm run build:cli
npm run test:site
```

## Final checks

- World AgentBook validation: passed; registered on configured Base Sepolia
  AgentBook contract.
- Unit/integration suite: `54` passed, `1` live test skipped by default.
- Live Hedera golden-run test: passed (`1/1`).
- Production build and rendered-site checks: passed (`3/3`).
- TypeScript and ESLint checks: passed.
