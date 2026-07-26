# Yareon

Yareon is a policy-controlled procurement system running on Hedera testnet.
The public product exposes only network-backed behavior: HCS program events,
Mirror Node reconstruction, World AgentKit human backing, native Hedera wallet
approvals, scheduled HBAR settlement, and public explorer evidence.

There is no guest sandbox, simulated workspace, or D1-backed product mode.
Mutating a live program is limited to the Hedera wallet that created it.

## Real product flow

1. Create a funded procurement program on Hedera testnet.
2. Append funds to the program, then grant or upfund one or more buyer allocations.
3. Register approved suppliers and offers.
4. Require a World AgentBook-registered agent signature, then enforce buyer,
   category, program, and delegated-agent limits.
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
`HEDERA_OPERATOR_KEY`, `ENS_RPC_URL`, and `YAREON_AUTH_SECRET` server-only.
Configure only the agent's public `WORLD_AGENT_ADDRESS` on the server.

Deploy from the project directory with:

```bash
npx vercel
npx vercel --prod
```

Alternatively, connect the Git repository in the Vercel dashboard. Commits to
the production branch will deploy automatically.

## Testnet configuration

Configure a Hedera testnet operator for platform transaction fees, one shared
append-only event topic, WalletConnect, and World:

```text
HEDERA_OPERATOR_ID
HEDERA_OPERATOR_KEY
HEDERA_TOPIC_ID
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
WORLD_AGENT_ADDRESS
WORLD_CHAIN_RPC_URL
YAREON_PUBLIC_URL
```

## World AgentKit setup

Yareon uses a dedicated EVM wallet as the procurement agent's World identity.
The private key stays in the agent environment. The server stores only its
public `WORLD_AGENT_ADDRESS`, verifies short-lived AgentKit signatures, checks
the canonical AgentBook on World Chain, and binds the address to the agent's
delegation before evaluating procurement policy.

Generate a dedicated 32-byte key outside the repository. Configure it as
`WORLD_AGENT_PRIVATE_KEY` only in the agent environment, then print its public
address:

```bash
openssl rand -hex 32
npm run agentkit:address
```

Configure the printed value as `WORLD_AGENT_ADDRESS` on the Yareon server and
register it once through World App:

```bash
npx @worldcoin/agentkit-cli register <agent-address>
npm run agentkit:validate
```

## Agent CLI

Agents and their users do not need to clone this repository. After publishing
`@yareon/cli`, connect once and install the skill:

```bash
npm install --global @yareon/cli
yareon connect "https://your-yareon.example/?programId=<program-id>"
yareon skill install
```

The connection file contains only the public URL and program ID. The agent then
uses `yareon doctor`, `yareon context`, and `yareon buy`. Add `--execute` only
after explicit purchase authorization. See
`packages/cli/README.md` for the compact user workflow.

The protected resource is
`POST /api/agents/agentkit/procure?intent=<sha256>`. An unsigned request
receives an AgentKit `402` challenge. A registered agent retries with an
EIP-191 signature bound to the exact intent URL. Raw AgentBook human
identifiers are never returned, logged, or written to HCS.

Run the complete bot-rejection, AgentBook-verification, delegation-rejection,
and valid-order sequence locally, with the agent key in your shell environment:

```bash
npm run demo:agentkit -- <programId>
```

The Yareon server never signs for the agent.

Run `npm run setup:testnet` once to provision or validate the shared event
topic. An authenticated creator can create a draft program with only a name and
open its workspace immediately. Yareon creates a dedicated empty treasury; it
does not seed the treasury or use the operator account as the program's funds.
The creator deposits HBAR from their connected wallet, and the program becomes
spendable after Mirror Node confirms the exact wallet-to-treasury transfer.
Programs are active from creation. For a new program with one default buyer,
each confirmed deposit also increases that buyer's available authority and is
recorded as a `PROGRAM_UPFUNDED` event.

Only the platform operator key remains server-side. Verifier and finance role
keys remain inside their WalletConnect-compatible wallets. The browser submits
native transfer and `ScheduleSignTransaction` requests, and the server accepts
funding or an approval only after Hedera and Mirror Node confirm the configured
wallet, destination, amount, and successful transaction.

## Verification evidence

The live verifier confirms that a selected program contains a complete,
verifiable run:

- all protocol events have HCS topic and sequence references;
- World AgentKit access verification is recorded;
- the AgentKit address is bound to the delegation and a limit rejection is present;
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
- `docs/protocol-v0.md` — protocol semantics.
- `docs/protocol-event.schema.json` — event envelope schema.

In-memory simulation remains limited to automated protocol tests and local
developer tooling. It is not reachable from the public application or API.

## Demo video

Add the final ≤5-minute submission video URL here after recording the completed
AgentKit and Hedera golden run.
