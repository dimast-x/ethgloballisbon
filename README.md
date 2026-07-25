# OpenProcure

OpenProcure is a reusable protocol for policy-controlled organizational
spending. It separates deterministic authority, vendor choice, delivery
evidence, independent approvals, settlement, and audit reconstruction.

The included university GPU workflow is a reference implementation. The
protocol core contains no university, GPU, vendor, currency, or fixed-role
assumptions. A second NGO medical-supply fixture exercises the same policy and
state modules. Protocol v0.2 also separates public identity, human backing,
organizational delegation, and purchase authorization behind generic adapter
contracts.

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
npm run demo:agent
npm run identity:validate
npm run identity:resolve -- testnet
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
Never commit that file. Add the expected verifier and finance MetaMask EVM
addresses before running validation. MetaMask connects to Hedera Testnet through
the JSON-RPC relay using chain ID `296`.

The testnet adapter supports:

- HCS event publication;
- Mirror Node event reconstruction;
- scheduled HBAR transfers;
- verifier and finance schedule signatures;
- schedule execution status and scheduled payment transaction IDs;
- Mirror Node pagination, consensus ordering, and restart-safe reconstruction;
- memo-based schedule recovery when a command is retried.

In live mode, accepting an order creates its approval-gated payment schedule.
Delivery and finance approvals require MetaMask to sign a canonical,
five-minute EIP-191 approval message. The server verifies the signer against the
configured role address before using the corresponding testnet relay key.

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
MetaMask authenticates the exact role, program, order, schedule, amount,
address, chain, idempotency key, and expiry. Relay and operator private keys remain
server-side and are never returned by the readiness API or written to HCS.

MetaMask does not directly sign the native Hedera schedule in this iteration.
The verified role approval authorizes the server-side Hedera relay to add the
corresponding schedule signature. Hosted live credentials, production key
custody, and AI recommendation logic remain intentionally deferred.

## Agent identity and delegation

The Agent tab demonstrates that identity alone does not authorize spending:

1. Resolve the configured public agent identity.
2. Audit a purchase rejected because human backing is missing.
3. Verify the principal through World ID.
4. Audit a 4.2 HBAR request rejected by a 4 HBAR delegation.
5. Create the valid 3.5 HBAR order and continue through settlement.

Simulation uses the same `PublicIdentityResolver` and `HumanBackingVerifier`
boundaries as live mode. Live mode resolves ENSIP-5 records from Ethereum
mainnet and uses World IDKit v4 with server-signed relying-party context.

Required agent records:

```text
com.openprocure.agent-id
com.openprocure.role
com.openprocure.organization
com.openprocure.hedera-account
com.openprocure.delegation
com.openprocure.world-reference
com.openprocure.protocol-version
url
```

The linked organization name must expose
`com.openprocure.organization-id`. Run `npm run identity:validate` after
adding the ENS and World settings from `.env.example`.

World proof payloads and RP signing keys remain off ledger. HCS records only a
hashed verification reference. New identity events use schema version `0.2`;
the reducer remains compatible with existing `0.1` events.
