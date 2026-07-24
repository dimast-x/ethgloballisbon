# OpenProcure

OpenProcure is a reusable protocol for policy-controlled organizational
spending. It separates deterministic authority, vendor choice, delivery
evidence, independent approvals, settlement, and audit reconstruction.

The included university GPU workflow is a reference implementation. The
protocol core contains no university, GPU, vendor, currency, or fixed-role
assumptions. A second NGO medical-supply fixture exercises the same policy and
state modules.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The browser starts in a safe testnet simulation
so the complete workflow can be evaluated without keys.

Useful checks:

```bash
npm run typecheck
npm test
npm run demo:cli
npm run build
```

## Testnet configuration

Copy `.env.example` to `.env.local`, then provide a funded Hedera testnet
operator account:

```bash
npm run setup:testnet
```

The provisioning script creates:

- one reusable HCS topic;
- a 25 HBAR treasury controlled by a verifier/finance 2-of-2 threshold key;
- one vendor account;
- separate verifier and finance relay keys.

The script prints private setup material to the terminal. Keep it private and
copy the required values into `.env.local`. Never commit that file.

The testnet adapter supports:

- HCS event publication;
- Mirror Node event reconstruction;
- scheduled HBAR transfers;
- verifier and finance schedule signatures;
- schedule execution status.

## Protocol boundaries

- `src/protocol` — network-independent types, money, policy, events, reducer,
  and adapter contracts.
- `src/adapters` — Hedera implementation of the event store and payment
  scheduler.
- `src/demo` — replaceable reference fixtures and the browser-safe simulator.
- `docs/protocol-v0.md` — protocol semantics and conformance requirements.
- `docs/protocol-event.schema.json` — machine-readable event envelope.

The public application API exposes generic program, command, order, and audit
routes. Demo initialization is isolated under
`/api/demos/university-gpu/runs`.

## Current security boundary

Browser approval buttons model wallet-authenticated, demo-relayed signatures.
The real Hedera adapter keeps relay keys server-side and supports the 2-of-2
scheduled transaction flow. Direct browser schedule signing, production key
custody, ENS, World, and AI recommendation logic are intentionally deferred.
