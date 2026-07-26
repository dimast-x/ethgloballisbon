# @yareon/cli

Connect an agent to a Yareon procurement program without cloning the Yareon
application repository.

```bash
npm install --global @yareon/cli
yareon connect "https://yareon.example/?programId=<program-id>"
yareon skill install
```

`connect` stores only the public service URL and program ID. Keep
`WORLD_AGENT_PRIVATE_KEY` in the agent's secret manager or environment; Yareon
never writes it to its configuration file.

For a no-install trial, replace `yareon` with
`npx --yes @yareon/cli@latest`. Run `yareon doctor` before procurement,
`yareon context` to inspect eligible offers, and
`yareon buy --offer-id <id>` to preview. Add `--execute` only after the user
explicitly authorizes the purchase.
