# Yareon

Yareon is a policy-controlled procurement system running on Hedera testnet.
The public product exposes only network-backed behavior: HCS program events,
Mirror Node reconstruction, World human backing, native Hedera wallet
approvals, scheduled HBAR settlement, and public explorer evidence.

There is no guest sandbox, simulated workspace, or D1-backed product mode.
Public visitors can inspect a completed verified program when
`YAREON_SHOWCASE_PROGRAM_ID` is configured. Mutating a live program is limited
to the Hedera wallet that created it.

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

“Create a live program” connects a Hedera testnet wallet, asks it to sign a
short-lived challenge, verifies the signature against the account key from
Mirror Node, and stores an HTTP-only administrator session. Configure
`YAREON_AUTH_SECRET` with at least 32 random characters.

Release checks:

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run test:site
```

## Deploy to Vercel

This is a native Next.js application and can be imported directly into Vercel.
Use the default Next.js build settings and configure every value from
`.env.example` in Project Settings → Environment Variables. Keep
`HEDERA_OPERATOR_KEY`, `WORLD_RP_SIGNING_KEY`, `ENS_RPC_URL`, and
`YAREON_AUTH_SECRET` server-only.

Deploy from the project directory with:

```bash
npx vercel
npx vercel --prod
```

Alternatively, connect the Git repository in the Vercel dashboard. Commits to
the production branch will deploy automatically.

## Testnet configuration

Configure a funded Hedera testnet operator, one shared append-only event topic,
WalletConnect, and World:

```text
HEDERA_OPERATOR_ID
HEDERA_OPERATOR_KEY
HEDERA_TOPIC_ID
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
WORLD_APP_ID
WORLD_RP_ID
WORLD_RP_SIGNING_KEY
WORLD_ACTION
YAREON_SHOWCASE_PROGRAM_ID
```

Run `npm run setup:testnet` once to provision or validate the shared event
topic. An authenticated creator can create a draft program with only a name and
open its workspace immediately. Later, from that program's payment settings,
they supply distinct verifier and finance wallets plus a vendor settlement
account. Yareon then creates the dedicated 2-of-2 treasury and records the
program-specific configuration in a `PROGRAM_SETTLEMENT_CONFIGURED` event.

Only the platform operator key remains server-side. Verifier and finance role
keys remain inside their WalletConnect-compatible wallets. The browser submits native
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
- `app/yareon-app.tsx` — Hedera-wallet-authenticated live workflow.
- `app/api/showcase` — verified public read model.
- `docs/protocol-v0.md` — protocol semantics.
- `docs/protocol-event.schema.json` — event envelope schema.

In-memory simulation remains limited to automated protocol tests and local
developer tooling. It is not reachable from the public application or API.
