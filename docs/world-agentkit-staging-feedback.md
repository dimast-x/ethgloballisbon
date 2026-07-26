# AgentKit staging registration feedback

## Summary

We integrated `@worldcoin/agentkit` into Yareon for an ETHGlobal project. The
AgentKit request-signing and AgentBook lookup APIs worked well, but the
documented staging registration path was inconsistent across the published
CLI, repository documentation, simulator, relay, and deployed contracts.

We ultimately registered successfully on **Base Sepolia**, but only after
patching the verification request and submitting the transaction manually.

## What failed

Environment:

- `@worldcoin/agentkit-cli@0.2.0`
- `@worldcoin/idkit-core@2.1.0`, pinned by the CLI
- AgentBook address: `0xA23aB2712eA7BBa896930544C7d6636a96b944dA`

Observed issues:

1. The CLI's World ID request omitted `environment: "staging"`. World App
   rejected it with a message asking for the staging environment.
2. After adding `environment: "staging"`, the World ID simulator generated a
   valid staging proof.
3. The default hosted relay submitted that staging proof against production
   AgentBook, where it reverted with custom-error selector `0xddae3b71`.
4. Passing `network: "base-sepolia"` to the relay did not change the observed
   result.
5. World Chain Sepolia, chain ID `4801`, has no contract at the documented
   address (`eth_getCode` returned `0x`).
6. Base Sepolia, chain ID `84532`, does have AgentBook bytecode at that address.
7. The repository's `cli/REGISTRATION.md` documents `--network base-sepolia`,
   while both the published CLI and current CLI source we inspected still
   hardcode World Chain and expose no `--network` option.

## Successful workaround

1. Add `environment: "staging"` to the IDKit bridge request.
2. Complete Orb-level verification in the World ID simulator.
3. Use the returned proof with:

   ```text
   register(address agent, uint256 root, uint256 nonce,
            uint256 nullifierHash, uint256[8] proof)
   ```

4. Simulate the call against AgentBook on Base Sepolia.
5. Submit it manually using a wallet funded with Base Sepolia test ETH.
6. Confirm registration through `createAgentBookVerifier` configured with the
   Base Sepolia RPC and contract address.

Successful registration:

- Agent: `0x97679cc5ED6BcEF8Ea807676AAE8E6178e4C88E0`
- [Base Sepolia transaction](https://sepolia.basescan.org/tx/0x6c65bf2db225655d2ac24ed017a79bb6747b4c58d6c08d5c8a0aacbaac6ce6a9)
- SDK `lookupHuman` returned the registered anonymous human identifier.

## Suggested improvements

1. Publish a CLI version matching `cli/REGISTRATION.md`, including
   `--network base-sepolia` and `--manual`.
2. Make `environment` explicit and derive or validate it against the selected
   AgentBook network.
3. Make the hosted relay either route `base-sepolia` correctly or reject it
   immediately with a clear “unsupported network” response.
4. Expose first-class `network: "world" | "base" | "base-sepolia"` options in
   the verifier and CLI instead of requiring custom RPC/address wiring.
5. Publish an authoritative deployment table that distinguishes World Chain,
   World Chain Sepolia, Base, and Base Sepolia.
6. Decode AgentBook custom errors in CLI and relay responses.
7. Add an end-to-end test covering: staging payload → simulator proof → Base
   Sepolia registration → `lookupHuman`.

These changes would turn the current manual debugging process into a reliable
five-minute developer flow.
