# World AgentKit integration

Yareon grants procurement execution rights only to the dedicated EVM agent
wallet configured by `WORLD_AGENT_PRIVATE_KEY` and registered in the canonical
World AgentBook.

## Request flow

1. The agent reads the Mirror-derived eligible-offer context.
2. It selects the lowest-priced offer within its program, category, allocation,
   per-order, and total-spend limits.
3. It posts an identifier-only intent to the protected procurement resource.
4. The resource returns a five-minute AgentKit `402` challenge.
5. `createAgentkitClient` signs the challenge with the dedicated EVM wallet and
   retries the same request.
6. Yareon validates URI binding, freshness, signature, configured address, and
   live AgentBook registration.
7. Yareon writes only a SHA-256 verification reference, the public agent
   address, and expiry to HCS.
8. Yareon derives all financial fields from Mirror state and applies the
   existing deterministic procurement policy before touching Hedera payment
   infrastructure.

The raw AgentBook human identifier never crosses the verification boundary.
The challenge nonce is represented by its verification reference in HCS and
cannot be reused.

## Troubleshooting

- `Missing WORLD_AGENT_PRIVATE_KEY`: configure a dedicated 32-byte hex key.
- `not registered in World AgentBook`: run the AgentKit CLI registration flow
  for the address printed by `npm run agentkit:address`.
- `delegation predates AgentKit`: create a new program after AgentKit is
  configured so its delegation is bound to the World agent address.
- `intent hash does not match`: regenerate the URL from the canonical request;
  do not edit the body after the challenge is issued.
- `challenge was already used`: start a new AgentKit request so the server
  issues a fresh nonce.
