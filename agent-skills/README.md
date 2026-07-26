# Yareon agent skills

Yareon ships reusable agent instructions for safe, policy-controlled
procurement. Install them through the Yareon CLI so the skill and CLI versions
stay aligned:

```bash
npm install --global @yareon/cli
yareon skill install
```

For a no-install trial:

```bash
npx --yes @yareon/cli@latest skill install
```

## Available skills

### `yareon-agent`

Use [`yareon-agent`](./yareon-agent/SKILL.md) to:

- check whether a Yareon program is ready for agent use;
- inspect and compare policy-eligible offers;
- preview a purchase before taking action;
- create one explicitly authorized, World AgentKit-authenticated order; and
- check order state and Hedera audit evidence.

The skill cannot administer or fund programs, manage suppliers, approve
delivery or finance, or sign on behalf of independent human roles.

## Connect and invoke

Connect the CLI to a program once:

```bash
yareon connect "https://your-yareon.example/?programId=<program-id>"
yareon doctor
```

Then invoke the skill in Codex:

```text
Use $yareon-agent to compare the eligible offers and recommend the best option.
```

The agent must preview the selected order and obtain clear purchase
authorization before using `--execute`.
