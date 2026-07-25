# Charter

Charter is a policy-controlled procurement system running on Hedera testnet.
The public product exposes only network-backed behavior: HCS program events,
Mirror Node reconstruction, World human backing, native Hedera wallet
approvals, scheduled HBAR settlement, and public explorer evidence.

There is no guest sandbox, simulated workspace, or D1-backed product mode.
Public visitors can inspect a completed verified program when
`CHARTER_SHOWCASE_PROGRAM_ID` is configured. Mutating a live program is limited
to its authenticated creator.

## Real product flow

1. Create a funded procurement program on Hedera testnet.
2. Grant one or more buyer allocations and append funds to a specific buyer.
3. Register approved suppliers and offers.
4. Enforce buyer, category, program, and delegated-agent limits.
5. Record delivery evidence by SHA-256 reference.
6. Collect distinct verifier and finance wallet signatures.
7. Execute the scheduled HBAR payment.
8. Reconstruct the program and audit trail from Hedera Mirror Node.

## Run locally

```bash
npm install
npm run dev
```

The real application requires the testnet and identity values from
`.env.example`. Without them, the UI reports that live operation is unavailable;
it does not substitute simulated data.

Release checks:

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run test:site
```

## Testnet configuration

Configure a funded Hedera testnet operator, the existing topic and settlement
accounts, two distinct role accounts, WalletConnect, and World:

```text
HEDERA_OPERATOR_ID
HEDERA_OPERATOR_KEY
HEDERA_TOPIC_ID
HEDERA_TREASURY_ACCOUNT_ID
HEDERA_VENDOR_ACCOUNT_ID
HEDERA_VERIFIER_ACCOUNT_ID
HEDERA_FINANCE_ACCOUNT_ID
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
WORLD_APP_ID
WORLD_RP_ID
WORLD_RP_SIGNING_KEY
WORLD_ACTION
CHARTER_SHOWCASE_PROGRAM_ID
```

Run `npm run setup:testnet` to provision or validate the topic, treasury,
vendor, and 2-of-2 verifier/finance threshold arrangement.

Private keys remain server-side. Verifier and finance role keys remain inside
their WalletConnect-compatible wallets. The browser submits native
`ScheduleSignTransaction` requests, and the server accepts an approval only
after Hedera and Mirror Node confirm the configured signer and successful
transaction.

## Public proof

The read-only showcase is served only when the configured program contains a
complete, verifiable run:

- all protocol events have HCS topic and sequence references;
- World human backing is recorded;
- missing-backing and delegation-limit rejections are present;
- verifier and finance approvals come from distinct configured Hedera accounts;
- the schedule executed; and
- Mirror Node confirms the exact treasury-to-vendor transfer.

Use:

```bash
npm run verify:live -- <programId>
npm run audit:cli -- <programId> testnet
```

## Architecture

- `src/protocol` — network-independent types, policy, events, and reducer.
- `src/application` — commands, authorization, and live orchestration.
- `src/adapters` — Hedera, Mirror Node, World, and ENS integration boundaries.
- `app/charter-app.tsx` — authenticated live workflow.
- `app/api/showcase` — verified public read model.
- `docs/protocol-v0.md` — protocol semantics.
- `docs/protocol-event.schema.json` — event envelope schema.

In-memory simulation remains limited to automated protocol tests and local
developer tooling. It is not reachable from the public application or API.
