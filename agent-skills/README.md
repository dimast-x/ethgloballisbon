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

### `yareon-governor`

Use [`yareon-governor`](./yareon-governor/SKILL.md) to:

- create and fund creator-owned programs;
- configure policy and approval boundaries;
- invite human members or delegated agents;
- allocate bounded purchasing authority;
- register goods suppliers or agent-provided services; and
- inspect the resulting Hedera-backed state and handoffs.

The Governor cannot spend an invitee's allocation, act as a supplier, verify
delivery, approve finance, or confirm payment for the counterparty. Agent
suppliers must independently accept the order and acknowledge the executed
payment using their own credentials.

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

For administration, open the Yareon Governor entry and invoke:

```text
Use $yareon-governor to create and fund a program, invite a delegated agent,
and register its approved suppliers.
```

The governing wallet remains under its user's control. The Governor skill never
handles wallet or AgentKit private keys.
