# Governor and member journeys

Yareon has two product boundaries. They share a program and its ledger state, but
they do not share a workspace or authority model.

## Governor

Entry: `/governor`

1. Authenticate the governing wallet.
2. Create or resume a program.
3. Define policy, approve suppliers and offers, and configure settlement.
4. Fund the program treasury and allocate balances to member wallets.
5. Monitor activity and exceptions.

The governor console exposes only `Overview`, `Controls`, and `Activity`.
Purchasing is not a governor navigation destination. A governor can open the
member portal for a program, but the member wallet still has to authenticate and
resolve to its own allocation.

Governor Controls contains `Members`, `Suppliers`, and `Orders`. Human and agent
allocations are managed together in Members and carry an explicit participant
type. Orders provides program-wide purchase history, while ledger-level events
remain in Activity. There is no separate empty Agent setup surface.

## Human member

Entry: `/member?programId=<program-id>`

1. Authenticate the Hedera wallet assigned to a program allocation.
2. See only that wallet's balance, policy guardrails, eligible offers, and
   orders.
3. Choose an eligible offer and create an order.
4. Track that order without gaining supplier, policy, funding, approval, or
   settlement controls.

The member workspace exposes only `Home`, `Catalog`, and `Orders`. The server
derives the buyer, vendor, category, amount, and policy checks from the
authenticated member and selected offer; those values are not trusted from the
browser.

## Agent member

Entry: the `yareon` CLI and `agent-skills/yareon-agent`.

1. `yareon connect <service-url> --program-id <program-id>`
2. `yareon balance`
3. `yareon offers`
4. `yareon buy --offer-id <offer-id>` to preview
5. `yareon buy --offer-id <offer-id> --execute` after explicit authorization
6. `yareon order --order-id <order-id>`

The CLI is the headless version of the human member workspace. It uses the same
member authority boundary, authenticated through the delegated-agent path, and
does not expose governor controls. Execution keys are read only from the
agent's secret environment and are never accepted as command arguments.

## Authority invariant

Navigation is only the visible separation. Authorization is enforced at the
member API boundary:

- the authenticated wallet resolves to exactly one program allocation;
- context responses contain only that member's allocation and orders;
- offers are filtered by program status, approved supplier, category,
  per-order limit, remaining allocation, and treasury balance;
- procurement accepts an offer identifier, then derives and re-validates the
  transaction server-side.
