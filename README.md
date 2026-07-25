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

Open `http://localhost:3000`. The browser starts in Simulation mode and exposes
an explicit Hedera Testnet mode when the local configuration passes its
readiness checks. Both modes call the same generic application commands.

Useful checks:

```bash
npm run typecheck
npm test
npm run demo:cli
npm run build
```

The CLI also exposes:

```bash
npm run testnet:validate
npm run demo:live
npm run audit:cli -- <programId> testnet
```

## Testnet configuration

Copy `.env.example` to `.env.local`, then provide a funded Hedera testnet
operator account:

```bash
npm run setup:testnet
```

The provisioning script creates the following once, or validates and reuses
the identifiers already present in `.env.local`:

- one reusable HCS topic;
- a 25 HBAR treasury controlled by a verifier/finance 2-of-2 threshold key;
- one vendor account;
- separate verifier and finance relay keys.

The script prints private setup material to the terminal only on first
provisioning. Keep it private and copy the required values into `.env.local`.
Never commit that file. Add the expected verifier and finance HashPack testnet
account IDs plus a WalletConnect project ID before running validation.

The testnet adapter supports:

- HCS event publication;
- Mirror Node event reconstruction;
- scheduled HBAR transfers;
- verifier and finance schedule signatures;
- schedule execution status and scheduled payment transaction IDs;
- Mirror Node pagination, consensus ordering, and restart-safe reconstruction;
- memo-based schedule recovery when a command is retried.

In live mode, accepting an order creates its approval-gated payment schedule.
Delivery and finance approvals require HashPack to sign a canonical,
five-minute approval message. The server verifies that message against the
configured role account before using the corresponding testnet relay key.

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

## Approval security boundary

Testnet approvals are **wallet-authenticated, demo-relayed Hedera approvals**.
HashPack authenticates the exact role, program, order, schedule, amount,
account, idempotency key, and expiry. Relay and operator private keys remain
server-side and are never returned by the readiness API or written to HCS.

Direct browser schedule signing, hosted live credentials, production key
custody, ENS, World, and AI recommendation logic are intentionally deferred.
