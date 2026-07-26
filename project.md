# Yareon — Hackathon Master Context

**Working title:** Yareon
**Event:** ETHGlobal Lisbon, July 2026  
**Document purpose:** Canonical context for future product, engineering, design, pitch, and implementation conversations  
**Status:** Hackathon execution brief — three-partner strategy committed  
**Last updated:** 24 July 2026

> **Implementation update — 26 July 2026:** The agent-facing World integration
> now uses `@worldcoin/agentkit` and the canonical AgentBook, not IDKit. A
> dedicated EVM agent wallet signs each intent, is verified against AgentBook,
> and is bound to the agent's Hedera account and Yareon delegation before
> procurement execution. Historical IDKit-oriented design notes below are
> superseded by `docs/world-agentkit.md`.

---

# 1. Executive Summary

Yareon is a programmable procurement and organizational spending system inspired by the operating model behind Ukraine’s outcome-linked military procurement reforms.

The core idea is simple:

> Centralize policy, accountability, and auditability while decentralizing supplier choice to the people closest to the actual need.

Most organizations currently choose between two imperfect models:

1. **Centralized procurement**, which offers control but often becomes slow, opaque, politically influenced, and disconnected from end users.
2. **Decentralized budgets**, which give teams autonomy but make it difficult to enforce policy, prevent abuse, verify delivery, and maintain a trustworthy audit trail.

Yareon proposes a third model:

1. An organization creates a funded procurement program.
2. It defines who may buy, what they may buy, how much they may spend, and which vendors are eligible.
3. A buyer or human-backed AI agent chooses among competing approved vendors.
4. The payment is prepared but not released immediately.
5. A separate verifier confirms delivery or completion.
6. The organization’s required approvers sign the payment.
7. Hedera executes the payment.
8. Every important action is written to a tamper-evident audit log.
9. An auditor interface reconstructs the full procurement lifecycle.

The hackathon implementation will be **Hedera-native and no-Solidity**. Hedera Consensus Service will provide the append-only procurement event log. Hedera Scheduled Transactions will implement approval-gated supplier payments. Mirror Node will reconstruct the current state and public audit timeline. World AgentKit will prove that an AI procurement agent acts on behalf of a real, unique human before it receives purchasing authority.

The primary demo will use **university research procurement**, specifically the purchase of GPU compute by a robotics laboratory. The system is designed as a general organizational primitive that could later support governments, universities, NGOs, healthcare systems, corporations, grant programs, humanitarian programs, and DAOs.

For sponsor selection, the project uses all **three partner slots**: **Hedera, World, and ENS**. Within Hedera, it targets two tracks; within World, it targets one track; and within ENS, it targets the AI-agent identity track. The integrations form one coherent trust stack: ENS identifies and exposes the agent, World proves that the agent is backed by a unique human, and Hedera enforces and records procurement execution.

---

# 2. Partner Selection and Track Strategy

## 2.1 Selection model

The project may select **up to three partner ecosystems**. A partner consumes one partner slot. After selecting a partner, the project may enter any of that partner’s tracks for which the implementation satisfies the qualification requirements.

The submission therefore distinguishes between:

- **Partner selection:** which external ecosystems are integrated into the product.
- **Track selection:** which prize categories are entered within each selected ecosystem.

Entering two Hedera tracks consumes only one partner slot because both tracks belong to Hedera.

## 2.2 Committed partner and track matrix

| Partner slot | Partner | Product responsibility | Targeted tracks |
|---|---|---|---|
| 1 | Hedera | Procurement execution, consensus audit history, approval-gated payment, agentic settlement | “No Solidity Allowed” and “AI & Agentic Payments on Hedera” |
| 2 | World | Proof that an executing procurement agent is backed by a real, unique human | “AgentKit New Use Cases” |
| 3 | ENS | Persistent human-readable identities and discovery metadata for agents and participating entities | “Best ENS Integration for AI Agents” |

The project is committing to all three partner slots.

The three integrations answer different questions:

| Question | Partner |
|---|---|
| Which persistent agent or organization is this, and where can its public metadata be discovered? | ENS |
| Is the agent backed by a real, unique human? | World |
| Is the action permitted, what happened, and did value move? | Hedera and Yareon policy logic |

The combined trust chain is:

```text
Resolve persistent agent identity through ENS
        ↓
Verify that the agent is human-backed through World
        ↓
Evaluate deterministic organizational delegation and policy
        ↓
Create and record the procurement action on Hedera
        ↓
Verify delivery through an independent role
        ↓
Execute the approval-gated supplier payment on Hedera
```

No partner is used only for branding:

- Without ENS, the system falls back to opaque account identifiers and loses portable agent discovery.
- Without World, an ENS-named bot could still be controlled by no accountable human.
- Without Hedera, identity and authorization would not produce independently auditable execution or settlement.

---

## 2.3 Partner 1 — Hedera

Hedera is the core execution, payment, and audit infrastructure.

### Hedera track A — “No Solidity Allowed” — Build with Hedera SDKs

**Priority:** Primary technical track  
**Role:** Native procurement infrastructure  
**Implementation constraint:** No Solidity and no smart contracts

Yareon will use the Hedera TypeScript SDK and at least these native services:

- **Hedera Consensus Service**
  - Append-only procurement event history
  - Program creation
  - Buyer allocation records
  - Vendor approval records
  - Agent authorization outcomes
  - Order state transitions
  - Delivery evidence references
  - Approval records
  - Settlement receipts

- **Hedera Scheduled Transactions**
  - Approval-gated supplier payments
  - Collection of delivery-verifier and finance signatures
  - Execution after the required signatures are present

- **Hedera Mirror Node**
  - Reading HCS messages
  - Reading schedule and transaction status
  - Reconstructing program and order state
  - Powering the audit timeline

Potential extension:

- **Hedera Token Service**
  - Non-transferable credentials
  - Program-specific restricted credits
  - Supplier qualification artifacts
  - Not required for the first vertical slice

#### Qualification demonstration

The final demo must visibly show:

1. A working user-facing procurement workflow.
2. At least two native Hedera services.
3. No Solidity or smart-contract dependency.
4. A real Hedera testnet payment.
5. State reconstruction through Mirror Node.
6. A coherent security and access-control approach.
7. A public repository with setup and architecture documentation.

---

### Hedera track B — AI & Agentic Payments on Hedera

**Priority:** Secondary Hedera track  
**Role:** Policy-aware agentic purchasing and settlement initiation

The procurement agent performs a bounded organizational workflow:

1. Resolves its own public identity through ENS.
2. Proves human backing through World.
3. Reads the procurement program.
4. Checks the buyer’s remaining allocation.
5. Confirms that vendors are approved for the requested category.
6. Compares eligible offers.
7. Explains the recommendation.
8. Creates the order after deterministic policy authorization.
9. Initiates the scheduled supplier payment.
10. Monitors delivery verification and signatures.
11. Confirms final settlement.

The agent must perform a real financial action on Hedera testnet. The preferred demo action is creation or initiation of the scheduled supplier payment.

#### Qualification demonstration

- Agent performs a real procurement task rather than generic chat.
- Agent action leads to a Hedera financial operation.
- The payment is visible on testnet.
- The action is constrained by deterministic policy.
- The complete workflow is visible in the audit trail.
- An unauthorized or over-limit action is rejected.

---

## 2.4 Partner 2 — World

### World track — AgentKit New Use Cases

**Role:** Human-backed agent authorization and anti-Sybil accountability

World answers:

> Is this agent actually backed by a real, unique human before organizational execution rights are granted?

World does not determine the organization’s procurement policy. Human backing is necessary but not sufficient. Yareon must still validate:

- Organization membership
- Delegation validity
- Program access
- Allowed actions
- Category restrictions
- Per-order limit
- Total-spend limit
- Expiration
- Revocation
- Separation of duties

Example delegation:

```text
Principal:
Alice

Agent identity:
buyer.robotics-lab.eth

Organization:
lisbon-university.eth

Allowed:
- View GPU_COMPUTE offers
- Compare approved vendors
- Create orders
- Initiate a scheduled payment
- Spend up to 5,000 units

Forbidden:
- Approve delivery
- Approve finance
- Add vendors
- Change program rules
- Exceed the delegated limit
```

#### Qualification demonstration

Show three cases:

1. **ENS-resolved and World-verified authorized agent:** succeeds.
2. **ENS-resolved agent without human backing:** rejected.
3. **World-verified agent exceeding its delegation:** rejected.

The World proof must therefore change an execution or authorization decision. It is not generic login.

The project will not target World Selfie Check or Identity Check unless those signals become necessary and the required beta-testing documentation can be completed properly.

---

## 2.5 Partner 3 — ENS

### ENS track — Best ENS Integration for AI Agents

**Role:** Persistent, human-readable identity and discovery for procurement agents and participating organizations

ENS answers:

> Which agent or organization is this, how can its execution endpoint and public metadata be discovered, and which accounts or external trust references belong to it?

The key agent identity in the demo is:

```text
buyer.robotics-lab.eth
```

Other possible names:

```text
lisbon-university.eth
horizon-cloud.eth
verifier.lisbon-university.eth
treasury.lisbon-university.eth
```

The ENS integration must improve the product beyond replacing a hexadecimal address with a name.

### Public agent metadata

The project may resolve public metadata such as:

```text
agent.role
agent.organization
agent.endpoint
agent.hederaAccount
agent.worldVerificationReference
agent.delegationHash
agent.allowedCategorySummary
agent.version
```

Example conceptual record set:

```text
Name:
buyer.robotics-lab.eth

agent.role:
procurement-buyer

agent.organization:
lisbon-university.eth

agent.endpoint:
https://yareon.com/agents/robotics-lab

agent.hederaAccount:
0.0.4859221

agent.worldVerificationReference:
world:proof:...

agent.delegationHash:
sha256:...

agent.allowedCategorySummary:
GPU_COMPUTE
```

Sensitive authorization details are not stored publicly. ENS stores or resolves only public identity metadata and integrity references. The current active authority is still decided by Yareon’s policy engine.

### Why ENS and World are not redundant

ENS provides:

- Persistent naming
- Public discovery
- Agent metadata
- Organization linkage
- Address and endpoint resolution

World provides:

- Proof that the agent is backed by a real, unique human

An ENS name alone does not prove unique-human control. A World proof alone does not provide a stable, readable, portable agent identity.

### Qualification demonstration

The demo should show:

1. The user enters or selects `buyer.robotics-lab.eth`.
2. The application resolves the agent’s public metadata dynamically.
3. The application resolves the linked organization and Hedera account.
4. World verifies the agent’s human backing.
5. Yareon applies the organization-specific delegation.
6. The audit trail displays the ENS name alongside the underlying identifiers.

The values must not be hard-coded in the interface.

---

## 2.6 Exact submission target

```text
Partner 1: Hedera
  ├── Track: “No Solidity Allowed” — Build with Hedera SDKs
  └── Track: AI & Agentic Payments on Hedera

Partner 2: World
  └── Track: AgentKit New Use Cases

Partner 3: ENS
  └── Track: Best ENS Integration for AI Agents
```

This means:

- **Three selected partners**
- **Four targeted tracks**
- **One coherent end-to-end product**

The integration story in one sentence is:

> ENS identifies the procurement agent, World proves that it is human-backed, and Hedera records and settles its policy-controlled actions.

---

# 3. Product Thesis

## 3.1 The underlying organizational problem

Procurement systems usually separate the people with money from the people with knowledge.

A central procurement department controls the budget and supplier relationships, while a researcher, field worker, clinician, engineer, or local administrator understands the actual need.

This creates recurring failure modes:

- Slow purchasing cycles
- Supplier favoritism
- Specifications designed around a preferred vendor
- Low competition
- Weak delivery verification
- Buyers circumventing formal systems
- Large, opaque framework agreements
- Poor feedback from actual users
- Inability to compare supplier performance
- Lack of real-time program visibility
- Unclear separation of duties
- Payment before confirmed delivery
- Fragmented evidence and documentation

Yareon is based on the belief that organizations should delegate **choice** without delegating away **control**.

---

## 3.2 Core operating principle

> Centralize rules, identity, funding controls, and auditability. Decentralize supplier selection and purchasing decisions.

The organization defines:

- Who qualifies to participate
- Which buyers are authorized
- Which categories may be purchased
- Which vendors are eligible
- Maximum order values
- Total buyer allocations
- Approval thresholds
- Required delivery evidence
- Required separation of duties
- Expiration rules
- Dispute procedures
- Public and private visibility rules

The frontline buyer decides:

- What product or service best matches the need
- Which qualified supplier to select
- Whether price, delivery speed, quality, or reliability matters most
- Whether delivery is acceptable
- Whether the vendor should be used again

---

## 3.3 The core lifecycle

```text
Program created and funded
        ↓
Buyer receives restricted allocation
        ↓
Vendors are approved by category
        ↓
Buyer or authorized agent requests purchase
        ↓
Policy engine validates request
        ↓
Vendor is selected
        ↓
Payment is scheduled but not yet executed
        ↓
Vendor delivers
        ↓
Independent verifier approves delivery
        ↓
Finance or treasury approval is added
        ↓
Hedera executes payment
        ↓
Audit log and dashboard update
```

---

# 4. Product Positioning

## 4.1 One-sentence description

> Yareon is a programmable procurement platform that lets organizations delegate purchasing decisions without losing policy control, delivery verification, or auditability.

## 4.2 Technical description

> Yareon is a Hedera-native, event-sourced procurement and agent authorization system using HCS for tamper-evident operational records, Scheduled Transactions for approval-gated payments, Mirror Node for state reconstruction, World AgentKit for human-backed delegated authority, and ENS for persistent agent and organization identity.

## 4.3 Pitch-friendly description

> Yareon lets the people closest to a problem choose the right supplier, while the organization retains control of the rules, approvals, money, and audit trail.

## 4.4 Long-term category

Possible category descriptions:

- Programmable organizational spending
- Policy-controlled procurement
- Outcome-linked purchasing infrastructure
- Verifiable agentic procurement
- Procurement operating system
- Open procurement protocol

For the hackathon, use **programmable procurement** or **policy-controlled organizational spending**. These are easier to understand than “procurement protocol.”

---

# 5. Primary Demo Scenario

## 5.1 University research procurement

A university creates an AI Research Compute Fund. The robotics laboratory needs GPU compute to train a model.

### Participants

- **University administrator**
  - Creates the procurement program
  - Defines policies
  - Approves buyers and vendors

- **University treasury**
  - Holds the funds
  - Participates in payment approval

- **Laboratory manager**
  - Receives a restricted purchasing allocation
  - Delegates limited authority to an AI agent

- **Procurement agent — `buyer.robotics-lab.eth`**
  - Resolves public identity and endpoint through ENS
  - Proves human backing through World
  - Compares approved offers
  - Creates a compliant order
  - Cannot approve its own order or verify delivery

- **GPU providers**
  - Offer compute capacity
  - Accept and fulfil orders

- **Delivery verifier**
  - Confirms that access credentials or compute capacity were delivered
  - Cannot be the buyer or vendor

- **Auditor**
  - Reviews the complete program history
  - Investigates anomalies and conflicts

---

## 5.2 Demo data

```text
Program:
AI Research Compute Fund

Total program budget:
20,000 test units

Buyer:
Robotics Laboratory

Buyer allocation:
5,000 test units

Category:
GPU_COMPUTE

Approved vendors:
- Atlas Compute
- Nova GPU
- Horizon Cloud

Offers:
- Atlas Compute: 3,700, delivery in 1 day
- Nova GPU: 3,300, delivery in 5 days
- Horizon Cloud: 3,500, delivery in 2 days

Selected vendor:
Horizon Cloud

Selection reason:
Second-lowest price and fastest offer satisfying the required deadline

Order value:
3,500 test units
```

---

## 5.3 Demo narrative

1. The university administrator creates the AI Research Compute Fund.
2. The program creation event is submitted to HCS.
3. The Robotics Laboratory receives a 5,000-unit allocation.
4. Three GPU providers are approved for the GPU_COMPUTE category.
5. Yareon resolves `buyer.robotics-lab.eth`, including its organization linkage, endpoint, and Hedera account.
6. The laboratory manager authorizes the ENS-identified agent, and World confirms that it is backed by a unique human.
7. The agent evaluates the three offers.
8. The agent proposes Horizon Cloud.
9. The policy engine checks:
   - human-backed agent status;
   - valid delegation;
   - buyer allocation;
   - vendor eligibility;
   - category match;
   - order limit;
   - expiration.
10. The order is created.
11. A supplier payment is represented as a Hedera Scheduled Transaction.
12. Horizon Cloud delivers credentials.
13. The vendor submits a delivery evidence hash or reference.
14. The independent verifier approves delivery.
15. The university finance signer adds the final required signature.
16. Hedera executes the payment.
17. Yareon detects the completed transaction.
18. A PAYMENT_EXECUTED event is submitted to HCS.
19. The audit dashboard shows the entire lifecycle.

---
# 6. Product Scope

## 6.1 Hackathon MVP

The MVP must support:

- Create one procurement program
- Define total program budget
- Register program participants
- Allocate a restricted buyer limit
- Approve vendors by category
- Register vendor offers
- Resolve a procurement agent and organization through ENS
- Authorize a human-backed agent through World
- Validate a purchase against deterministic policy
- Create an order
- Create a scheduled supplier payment
- Submit delivery evidence
- Approve delivery with a separate role
- Collect required payment signatures
- Execute a real Hedera testnet transfer
- Read events and transactions through Mirror Node
- Display a complete audit timeline
- Show at least one rejected unauthorized action
- Display ENS names alongside underlying Hedera and internal identifiers

---

## 6.2 Strong additions

After the vertical slice works:

- Vendor quotation comparison
- Agent-generated selection explanation
- Dispute state
- Cancellation flow
- Schedule expiration handling
- Multiple approval thresholds
- Supplier performance metrics
- Vendor concentration alert
- Price anomaly alert
- Downloadable audit report
- Human-readable policy builder
- World-backed delegation revocation
- Multiple procurement categories

---

## 6.3 Explicitly out of scope

Do not build during the hackathon:

- Full government tendering compliance
- Production-grade identity and KYC
- Fiat bank settlement
- Tax calculation
- Sophisticated accounting integration
- Cross-chain settlement
- Procurement law engine
- ZK private bidding
- Complete ERP replacement
- Mobile application
- Multi-tenant enterprise billing
- Production dispute arbitration
- On-chain storage of confidential documents
- Open token economy
- Transferable “procurement points”
- General decentralized marketplace

---

# 7. Functional Requirements

## 7.1 Program management

An administrator can:

- Create a program
- Set the program name and description
- Define the budget
- Define the settlement account
- Define allowed categories
- Define order limits
- Add buyers
- Allocate buyer limits
- Add vendors
- Approve vendors for specific categories
- Add verifiers
- Add finance signers
- Pause the program
- Close the program

---

## 7.2 Buyer and agent actions

A buyer or authorized agent can:

- Resolve its public identity and organization through ENS

- View remaining allocation
- View allowed categories
- View approved vendors
- View offers
- Request a purchase
- Explain supplier selection
- Cancel an unaccepted order
- View order status
- Raise a dispute

A buyer or buyer agent cannot:

- Approve its own delivery
- Add vendors
- Modify its allocation
- Change program rules
- Release funds without required approval
- Spend after delegation expiration
- Spend beyond the category or amount limit

---

## 7.3 Vendor actions

A vendor can:

- View relevant program opportunities
- Register or update an offer
- Accept an order
- Reject an order
- Submit delivery evidence
- View payment status
- Respond to a dispute

A vendor cannot:

- Verify its own delivery
- Modify buyer allocations
- Add itself to an approved category
- Change payment conditions after acceptance

---

## 7.4 Verifier actions

A verifier can:

- Review delivery evidence
- Approve delivery
- Reject delivery
- Request additional evidence
- Raise a dispute

The system must prevent a verifier from approving when the verifier is also:

- The buyer
- The vendor
- The agent principal for the order
- An unauthorized account

---

## 7.5 Auditor actions

An auditor can:

- Resolve human-readable ENS identities for recorded actors

- View program history
- View allocations
- View approved vendors
- View orders
- View delivery and payment status
- View authorization decisions
- View transaction identifiers
- View supplier concentration
- View rejected actions
- View potential conflicts

---

# 8. Core Policy Model

## 8.1 Deterministic policy first

AI may recommend or initiate actions, but authorization must be deterministic.

The policy engine should answer:

```text
Is this actor allowed to perform this action
for this organization,
under this program,
for this amount,
in this category,
using this vendor,
at this time?
```

The model should return:

```typescript
type PolicyDecision = {
  allowed: boolean;
  code: string;
  reasons: string[];
  evaluatedRules: string[];
};
```

Example:

```json
{
  "allowed": false,
  "code": "BUYER_LIMIT_EXCEEDED",
  "reasons": [
    "Requested amount is 5,500",
    "Remaining buyer allocation is 5,000"
  ],
  "evaluatedRules": [
    "PROGRAM_ACTIVE",
    "ACTOR_AUTHORIZED",
    "DELEGATION_VALID",
    "CATEGORY_ALLOWED",
    "VENDOR_APPROVED",
    "BUYER_LIMIT"
  ]
}
```

---

## 8.2 Initial policy rules

Required rules:

- Program is active
- ENS identity resolves successfully when an ENS-named agent is used
- Resolved ENS metadata matches the expected agent and organization references
- Actor is authenticated
- Actor has the required role
- Agent is human-backed when agent execution is used
- Delegation is valid and not revoked
- Delegation has not expired
- Requested action is included in delegation
- Buyer has enough remaining allocation
- Category is allowed
- Vendor is approved for category
- Amount is below per-order limit
- Vendor is not the buyer
- Verifier is not buyer or vendor
- Order is in the expected state
- Payment has not already executed

---

# 9. Hedera-Native Architecture

## 9.1 Why no Solidity

The architecture intentionally uses Hedera’s native services because:

- It directly targets the Hedera SDK track.
- Scheduled Transactions provide a natural approval and payment primitive.
- HCS provides consensus timestamps and ordering for audit records.
- Mirror Node provides a standard read and reconstruction layer.
- The project can demonstrate a meaningful native-Hedera workflow.
- It avoids creating a smart contract merely to imitate services already available at the network level.

---

## 9.2 High-level architecture

```text
┌────────────────────────────────────────────────────────────┐
│                      Web Application                       │
│ Admin | Buyer/Agent | Vendor | Verifier | Auditor         │
└─────────────────────────────┬──────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────┐
│                     Yareon API                        │
│                                                            │
│ ENS Resolver                                               │
│ World Human-Backing Verifier                               │
│ Delegation and Policy Engine                               │
│ Event Builder and Reducer                                  │
│ Schedule Manager                                           │
│ Mirror Node Client                                         │
└──────────────┬────────────────┬────────────────────────────┘
               │                │
               ▼                ▼
┌──────────────────────┐  ┌─────────────────────────────────┐
│ ENS                  │  │ Hedera Native Services          │
│                      │  │                                 │
│ Agent names          │  │ HCS event history               │
│ Organization names   │  │ Scheduled Transactions          │
│ Public metadata      │  │ Crypto transfers                │
│ Address resolution   │  │ Mirror Node                     │
└──────────┬───────────┘  └─────────────────────────────────┘
           │
           ▼
┌──────────────────────┐
│ World AgentKit       │
│                      │
│ Human-backed proof   │
│ Principal assurance  │
│ Anti-Sybil signal    │
└──────────────────────┘
```

### Responsibility boundaries

```text
ENS:
Persistent identity, discovery, endpoint and public-account metadata

World:
Evidence that the agent is backed by a unique human

Yareon:
Organizational membership, delegation, policy and state-machine logic

Hedera:
Consensus event history, approval collection and final settlement
```

---

## 9.3 HCS as the canonical operational log

Each program has an HCS topic, or the MVP uses one shared topic with `organizationId` and `programId`.

Every state transition produces a versioned event.

Example:

```json
{
  "schemaVersion": "1.0",
  "eventId": "evt_01J39...",
  "eventType": "ORDER_CREATED",
  "organizationId": "org_lisbon_technical_university",
  "programId": "program_ai_compute_2026",
  "orderId": "order_0001",
  "actor": {
    "hederaAccountId": "0.0.1234",
    "actorType": "HUMAN_BACKED_AGENT",
    "principalId": "user_alice",
    "ensName": "buyer.robotics-lab.eth"
  },
  "occurredAt": "2026-07-24T18:30:00Z",
  "data": {
    "buyerId": "robotics_lab",
    "vendorId": "horizon_cloud",
    "category": "GPU_COMPUTE",
    "amount": "3500",
    "currency": "HBAR_TEST_UNITS",
    "selectionReasonHash": "sha256:..."
  }
}
```

HCS contains:

- Event type
- Identifiers
- Actor
- Policy decision reference
- Evidence hash or encrypted reference
- Timestamp
- State-transition data

HCS should not contain:

- Personal data
- Full legal names unless necessary
- Confidential bids
- Raw invoices
- Research data
- Private delivery credentials
- Secrets
- API keys
- Authentication tokens

---

## 9.4 Event sourcing

Current application state is derived from the ordered event stream.

```text
HCS topic messages
        ↓
Decode and validate events
        ↓
Sort by consensus sequence
        ↓
Apply reducer
        ↓
Current organization and program state
        ↓
API and user interface
```

A local database may cache projections for speed, but it is not the sole source of truth for the demo.

Core reducer:

```typescript
function reduceProcurementEvents(
  events: ProcurementEvent[]
): ProcurementState {
  return events.reduce(applyProcurementEvent, initialState());
}
```

Benefits:

- Full state history
- Deterministic reconstruction
- Easy audit timeline
- Explicit state transitions
- Tamper evidence
- Easier anomaly analysis
- Strong visual demo

---

## 9.5 Hedera Scheduled Transactions

Each accepted order creates a scheduled transfer from the treasury account to the vendor account.

Example payment:

```text
From:
University Treasury

To:
Horizon Cloud

Amount:
3,500 test units

Memo:
yareon:program_ai_compute_2026:order_0001
```

The schedule remains pending until the required signatures are collected.

Initial approval policy:

- Delivery verifier signature
- Finance officer signature

Optional later policy:

```text
Order below 1,000:
- Verifier only

Order from 1,000 to 10,000:
- Verifier
- Finance officer

Order above 10,000:
- Verifier
- Finance officer
- Program administrator
```

The hackathon version should implement one stable approval configuration rather than a generalized policy compiler.

---

## 9.6 Mirror Node

Mirror Node is used to:

- Fetch HCS topic messages
- Decode procurement events
- Fetch transaction results
- Fetch schedule status
- Confirm payment execution
- Display consensus timestamps
- Reconstruct audit history

The dashboard should visibly label Mirror Node-derived information to demonstrate that it is load-bearing.

---

# 10. World AgentKit Architecture

## 10.1 Human-backed agent model

An agent is not treated as an independent anonymous actor.

The authorization chain is:

```text
Unique human
    ↓
Organization membership
    ↓
Organizational role
    ↓
Delegation to agent
    ↓
Action request
    ↓
Deterministic policy decision
```

A successful World proof does not automatically authorize spending. It proves the agent is backed by a human. Yareon then checks the organization-specific delegation.

---

## 10.2 Delegation model

```typescript
type AgentDelegation = {
  delegationId: string;
  organizationId: string;
  principalId: string;
  agentId: string;
  allowedPrograms: string[];
  allowedActions: ProcurementAction[];
  allowedCategories: string[];
  maxPerOrder: bigint;
  maxTotalSpend: bigint;
  validFrom: string;
  validUntil: string;
  revokedAt?: string;
};
```

Potential actions:

```typescript
type ProcurementAction =
  | "VIEW_PROGRAM"
  | "VIEW_OFFERS"
  | "REQUEST_QUOTES"
  | "CREATE_ORDER"
  | "CANCEL_ORDER"
  | "RAISE_DISPUTE"
  | "CREATE_SCHEDULED_PAYMENT";
```

Never delegate these to the buyer agent in the MVP:

- `APPROVE_DELIVERY`
- `APPROVE_FINANCE`
- `APPROVE_VENDOR`
- `CHANGE_PROGRAM_POLICY`

---

## 10.3 Authorization record

Each agent action should produce an audit record:

```json
{
  "eventType": "AGENT_AUTHORIZATION_EVALUATED",
  "agentId": "procurement-agent-01",
  "principalId": "user_alice",
  "action": "CREATE_ORDER",
  "resource": "program_ai_compute_2026",
  "humanBacked": true,
  "delegationValid": true,
  "policyAllowed": true,
  "decisionCode": "AUTHORIZED"
}
```

Rejected actions are as important as successful actions.

---

# 11. ENS Agent and Organization Identity Architecture

## 11.1 Identity model

Yareon uses ENS as the public identity and discovery layer for agents and participating entities.

The application maintains a distinction between:

- **Human-readable public identity:** ENS name
- **Execution identity:** Hedera account or service identity
- **Human principal assurance:** World proof
- **Organizational authority:** Yareon delegation
- **Internal immutable identifiers:** organization, program, actor, and order IDs

Example:

```text
Public agent identity:
buyer.robotics-lab.eth

Execution account:
0.0.4859221

Human principal:
Alice, proven through World

Organization:
lisbon-university.eth

Internal actor ID:
actor_01J...
```

## 11.2 Resolution flow

```text
User or system receives ENS name
        ↓
Resolve owner, addresses and public agent metadata
        ↓
Validate required fields and organization reference
        ↓
Resolve World human-backing reference
        ↓
Load current Yareon delegation
        ↓
Evaluate requested action
```

A successful ENS resolution does not authorize an action by itself.

## 11.3 Public metadata and minimization

Suitable public records include:

- Agent role summary
- Organization name
- Agent API or discovery endpoint
- Hedera account identifier
- World verification-reference identifier
- Delegation hash
- Supported protocol version
- Broad allowed category summary

Do not publish:

- Private keys
- Personal information
- Exact spending limits when confidential
- Full delegation documents
- Supplier bids
- Evidence documents
- Authentication tokens
- Internal security configuration

## 11.4 Dynamic resolution requirement

The UI must resolve ENS names dynamically. It should not display a hard-coded name that is unrelated to the actual action.

The resolved metadata should be used to:

- Determine the agent endpoint
- Bind the agent to its Hedera execution account
- Bind the agent to an organization
- Display a readable actor identity in the audit timeline
- Discover verification and delegation references

## 11.5 Failure handling

The system must reject or step up the action when:

- The ENS name does not resolve
- Required records are missing
- The resolved account differs from the signing account
- The organization reference conflicts with the requested program
- The delegation hash differs from the active delegation
- The ENS identity has changed since the authorization was created

The authorization event should preserve both:

- The ENS name and resolution result
- The concrete account and internal identifiers used for execution

---

# 12. Domain Model

## 12.1 Organization

```typescript
type Organization = {
  id: string;
  name: string;
  treasuryAccountId: string;
  status: "ACTIVE" | "PAUSED" | "CLOSED";
  createdAt: string;
};
```

## 12.2 Agent identity

```typescript
type AgentIdentity = {
  id: string;
  ensName: string;
  organizationEnsName: string;
  hederaAccountId: string;
  endpoint?: string;
  worldVerificationReference?: string;
  delegationHash?: string;
  resolvedAt: string;
};
```

The ENS name is the readable public identifier. The Hedera account is the concrete execution identity. The World reference and active Yareon delegation determine whether the agent may act.

## 12.3 Program


```typescript
type Program = {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  budget: bigint;
  committed: bigint;
  paid: bigint;
  currency: string;
  allowedCategories: string[];
  maxOrderAmount: bigint;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "CLOSED";
  topicId: string;
  createdAt: string;
};
```

## 12.4 Buyer allocation

```typescript
type BuyerAllocation = {
  id: string;
  programId: string;
  buyerId: string;
  totalLimit: bigint;
  committed: bigint;
  paid: bigint;
  allowedCategories: string[];
  validUntil: string;
};
```

Available balance:

```text
available =
totalLimit
- committed pending orders
- completed payments
```

## 12.5 Vendor

```typescript
type Vendor = {
  id: string;
  organizationId: string;
  name: string;
  hederaAccountId: string;
  approvedCategories: string[];
  status: "PENDING" | "APPROVED" | "SUSPENDED" | "REMOVED";
};
```

## 12.6 Offer

```typescript
type VendorOffer = {
  id: string;
  programId: string;
  vendorId: string;
  category: string;
  description: string;
  amount: bigint;
  deliveryDays: number;
  capacity?: string;
  validUntil: string;
};
```

## 12.7 Order

```typescript
type OrderStatus =
  | "CREATED"
  | "VENDOR_ACCEPTED"
  | "PAYMENT_SCHEDULED"
  | "DELIVERY_SUBMITTED"
  | "DELIVERY_APPROVED"
  | "PAYMENT_EXECUTED"
  | "CANCELLED"
  | "DISPUTED"
  | "REFUNDED";

type Order = {
  id: string;
  programId: string;
  buyerId: string;
  createdByActorId: string;
  vendorId: string;
  offerId?: string;
  category: string;
  amount: bigint;
  status: OrderStatus;
  scheduleId?: string;
  evidenceHash?: string;
  paymentTransactionId?: string;
  createdAt: string;
  updatedAt: string;
};
```

---

# 13. Event Model

## 13.1 Core events

```text
ORGANIZATION_CREATED
PROGRAM_CREATED
PROGRAM_ACTIVATED
PROGRAM_PAUSED

MEMBER_ADDED
ROLE_ASSIGNED

BUYER_ALLOCATED
BUYER_ALLOCATION_UPDATED

VENDOR_APPROVED
VENDOR_SUSPENDED
VENDOR_REMOVED
OFFER_REGISTERED

AGENT_IDENTITY_RESOLVED
AGENT_IDENTITY_RESOLUTION_FAILED
AGENT_DELEGATED
AGENT_DELEGATION_REVOKED
AGENT_AUTHORIZATION_EVALUATED

ORDER_CREATED
ORDER_REJECTED_BY_POLICY
ORDER_ACCEPTED_BY_VENDOR
ORDER_CANCELLED

PAYMENT_SCHEDULE_CREATED
PAYMENT_SIGNATURE_ADDED

DELIVERY_SUBMITTED
DELIVERY_APPROVED
DELIVERY_REJECTED

PAYMENT_EXECUTED
PAYMENT_FAILED

DISPUTE_OPENED
DISPUTE_RESOLVED
```

## 13.2 Event envelope

```typescript
type EventEnvelope<T> = {
  schemaVersion: "1.0";
  eventId: string;
  eventType: string;
  organizationId: string;
  programId?: string;
  orderId?: string;
  actor: {
    actorId: string;
    hederaAccountId?: string;
    actorType: "HUMAN" | "HUMAN_BACKED_AGENT" | "SYSTEM";
    principalId?: string;
    ensName?: string;
  };
  occurredAt: string;
  correlationId: string;
  data: T;
};
```

## 13.3 Idempotency

Every command should include an idempotency or correlation identifier.

Before publishing a new event, the application should check whether the command was already processed.

This is important for:

- Network retries
- Browser refreshes
- Agent retries
- Schedule polling
- Payment confirmation
- Mirror Node latency

---

# 14. Order State Machine

```text
CREATED
   ↓
VENDOR_ACCEPTED
   ↓
PAYMENT_SCHEDULED
   ↓
DELIVERY_SUBMITTED
   ↓
DELIVERY_APPROVED
   ↓
PAYMENT_EXECUTED
```

Alternative transitions:

```text
CREATED → CANCELLED
CREATED → REJECTED

VENDOR_ACCEPTED → CANCELLED

PAYMENT_SCHEDULED → CANCELLED
PAYMENT_SCHEDULED → EXPIRED

DELIVERY_SUBMITTED → DELIVERY_REJECTED
DELIVERY_SUBMITTED → DISPUTED

DELIVERY_APPROVED → PAYMENT_FAILED
PAYMENT_FAILED → PAYMENT_EXECUTED
```

Every transition must validate:

- Current order state
- Actor role
- Conflict-of-interest rule
- Required evidence
- Program status
- Schedule status

---

# 15. Security and Trust Model

## 15.1 What ENS contributes

ENS can provide:

- Persistent, human-readable names
- Resolution from names to accounts and endpoints
- Public agent and organization metadata
- Portable identity across applications
- A discoverable link between an agent and its declared organization

ENS does not prove:

- That the agent is backed by a unique human
- That its metadata is truthful
- That the named organization currently authorizes it
- That a procurement action is valid

Those questions are handled by World verification and Yareon policy.

## 15.2 What World contributes

World can provide evidence that an agent is backed by a real, unique human.

World does not prove:

- That the human is a member of the named organization
- That the human has a current procurement delegation
- That the requested purchase is compliant
- That a supplier delivered the promised result

Those questions remain in Yareon’s organizational policy and verification workflow.

## 15.3 What Hedera contributes

Hedera can help guarantee:

- Ordering of HCS events
- Consensus timestamps
- Tamper-evident event history
- Network-level transaction execution
- Valid account signatures
- Scheduled transaction approval state
- Payment receipt visibility

## 15.4 What Hedera does not guarantee

Hedera does not prove:

- That the physical delivery really happened
- That evidence is truthful
- That the selected vendor is honest
- That the buyer’s need is genuine
- That the price is fair
- That an off-chain document is accurate
- That an authorized human is not corrupt

Those risks are handled through:

- Separation of duties
- Multiple actors
- Evidence hashes
- Verifier accountability
- Audits
- Policy constraints
- Disputes
- Supplier performance history
- Anomaly alerts

## 15.5 Separation of duties

The MVP must enforce:

```text
Buyer ≠ Vendor
Buyer ≠ Delivery verifier
Vendor ≠ Delivery verifier
Agent principal ≠ Delivery verifier
```

The actor who creates the order cannot be the only actor who causes payment.

## 15.6 Key handling

Hackathon implementation:

- Use testnet accounts
- Keep keys in environment variables
- Never commit keys
- Use separate accounts for:
  - admin;
  - treasury;
  - buyer;
  - vendor;
  - verifier;
  - finance.
- Provide an `.env.example`
- Document account setup

Production direction:

- Managed signing
- Hardware-backed keys
- Threshold control
- Rotatable organizational credentials
- Fine-grained service accounts
- Explicit recovery process

## 15.7 Threats to demonstrate or test

- ENS identity fails to resolve
- ENS account does not match the signing account
- ENS organization record conflicts with the requested program
- Agent acts without World human backing
- Agent exceeds its delegation
- Buyer exceeds allocation
- Buyer selects an unapproved vendor
- Vendor is approved in the wrong category
- Buyer attempts to approve delivery
- Vendor attempts to approve delivery
- Payment is triggered before delivery approval
- Duplicate payment attempt
- Event replay
- Schedule expiration
- Evidence hash mismatch
- Unauthorized program modification

---

# 16. Privacy and Data Handling

## 16.1 On-ledger information

Suitable for HCS:

- Pseudonymous organization and participant IDs
- Program identifiers
- Category codes
- Order amount
- Order status
- Evidence hash
- Approval actor identifiers
- Schedule ID
- Transaction ID
- Policy decision code
- Consensus timestamp

## 16.2 Off-ledger information

Keep off-ledger:

- Personal information
- Full contracts
- Supplier banking information
- Confidential proposal details
- Delivery credentials
- Research data
- Private invoices
- Trade secrets
- Government-sensitive specifications

## 16.3 Evidence model

```typescript
type EvidenceReference = {
  hash: string;
  storageProvider: string;
  encryptedLocation?: string;
  mimeType: string;
  submittedBy: string;
  submittedAt: string;
};
```

The demo may use a mock file store or local object storage, but the hash committed to HCS must be calculated from the actual uploaded file.

---

# 17. Agent Design

## 17.1 Agent responsibilities

The procurement agent may:

- Resolve its ENS identity, organization, endpoint, and execution account

- Read program rules
- Read remaining allocation
- Read approved vendors
- Compare offers
- Recommend a vendor
- Explain the recommendation
- Create an order after deterministic validation
- Create a scheduled payment request
- Monitor order status
- Notify the human principal

## 17.2 Agent non-responsibilities

The agent must not:

- Modify program rules
- Add vendors
- Increase its own spending authority
- Verify delivery
- Approve its own payment
- Override deterministic policy
- Hide rejected attempts
- create new authority from natural-language instructions

## 17.3 Recommendation model

Example weighted selection:

```text
Price score: 50%
Delivery score: 30%
Supplier reliability: 20%
```

For the hackathon, scores may be calculated deterministically.

The AI agent can generate the natural-language explanation:

> Horizon Cloud was selected because it met the two-day deadline, remained within the laboratory’s allocation, and had a lower price than the only other vendor meeting the deadline.

The final authorization remains rule-based.

---

# 18. User Interface

## 18.1 Admin view

Show:

- Program name
- Total budget
- Committed amount
- Paid amount
- Buyers
- Allocations
- Approved vendors
- Categories
- Required approvers
- Program status
- HCS topic ID

Actions:

- Create program
- Allocate buyer limit
- Approve vendor
- Pause program

## 18.2 Buyer or agent view

Show:

- Available allocation
- Allowed categories
- Vendor offers
- Comparison
- ENS identity and organization resolution status
- World human-backing status
- Delegation status
- Proposed selection
- Policy decision
- Order status

Actions:

- Request purchase
- Accept recommendation
- Create order
- Cancel order
- Raise dispute

## 18.3 Vendor view

Show:

- Active order
- Required delivery
- Payment amount
- Schedule status
- Evidence submission status
- Payment transaction

Actions:

- Accept order
- Submit evidence
- View payment

## 18.4 Verifier view

Show:

- Pending deliveries
- Buyer identity
- Vendor identity
- Evidence hash
- Conflict check
- Order details
- Schedule status

Actions:

- Approve
- Reject
- Request more evidence

## 18.5 Auditor view

Show:

- Human-readable ENS actor names and underlying identifiers
- Complete timeline
- HCS sequence numbers
- Consensus timestamps
- Schedule ID
- Transaction ID
- Policy decisions
- Rejected attempts
- Vendor concentration
- Spend by category
- Orders awaiting verification
- Failed payments

---

# 19. Audit and Analytics

## 19.1 Core metrics

- Total budget
- Committed amount
- Paid amount
- Remaining budget
- Number of buyers
- Number of approved vendors
- Number of completed orders
- Average order value
- Average delivery time
- Payment time after delivery
- Rejected policy actions
- Supplier concentration
- Disputed order rate

## 19.2 Initial anomaly rules

- One vendor receives more than 60% of program spend
- Buyer repeatedly selects the most expensive offer
- Delivery verifier approves unusually quickly
- Same verifier approves all orders
- Order amount is close to the maximum limit
- Multiple failed authorization attempts
- Repeated order cancellation
- Duplicate evidence hash
- Payment schedule created before vendor acceptance

These may be calculated by application code. They do not need machine learning.

---

# 20. API Design

Possible endpoints:

```text
POST   /organizations
POST   /programs
GET    /programs/:programId
POST   /programs/:programId/allocations
POST   /programs/:programId/vendors
POST   /programs/:programId/offers

POST   /delegations
DELETE /delegations/:delegationId

POST   /orders/validate
POST   /orders
GET    /orders/:orderId
POST   /orders/:orderId/accept
POST   /orders/:orderId/delivery
POST   /orders/:orderId/verify
POST   /orders/:orderId/dispute

POST   /orders/:orderId/schedule
POST   /orders/:orderId/sign
GET    /orders/:orderId/payment

GET    /audit/programs/:programId
GET    /audit/orders/:orderId
```

The API should return both domain state and source references:

```json
{
  "order": {
    "id": "order_0001",
    "status": "PAYMENT_EXECUTED"
  },
  "ledgerReferences": {
    "topicId": "0.0.10001",
    "scheduleId": "0.0.10002",
    "paymentTransactionId": "..."
  }
}
```

---

# 21. Repository Structure

```text
yareon/
├── app/
│   ├── admin/
│   ├── buyer/
│   ├── vendor/
│   ├── verifier/
│   └── audit/
│
├── src/
│   ├── domain/
│   │   ├── organization.ts
│   │   ├── program.ts
│   │   ├── order.ts
│   │   ├── delegation.ts
│   │   └── events.ts
│   │
│   ├── policy/
│   │   ├── validate-purchase.ts
│   │   ├── validate-approval.ts
│   │   ├── separation-of-duties.ts
│   │   └── decisions.ts
│   │
│   ├── hedera/
│   │   ├── client.ts
│   │   ├── hcs.ts
│   │   ├── schedules.ts
│   │   ├── payments.ts
│   │   ├── mirror-node.ts
│   │   └── accounts.ts
│   │
│   ├── ens/
│   │   ├── resolver.ts
│   │   ├── records.ts
│   │   └── identity.ts
│   │
│   ├── world/
│   │   ├── agentkit.ts
│   │   ├── verification.ts
│   │   └── delegation.ts
│   │
│   ├── state/
│   │   ├── reducer.ts
│   │   ├── projections.ts
│   │   └── repository.ts
│   │
│   └── agents/
│       ├── procurement-agent.ts
│       ├── vendor-ranking.ts
│       └── explanation.ts
│
├── scripts/
│   ├── setup-testnet.ts
│   ├── create-topic.ts
│   ├── seed-demo.ts
│   └── demo-procurement.ts
│
├── test/
│   ├── policy/
│   ├── state/
│   ├── hedera/
│   └── e2e/
│
├── docs/
│   ├── architecture.md
│   ├── event-schema.md
│   ├── threat-model.md
│   ├── demo-script.md
│   └── sponsor-integrations.md
│
├── .env.example
├── README.md
└── package.json
```

---

# 22. Implementation Order

## Phase 1 — Hedera vertical slice

Build one TypeScript script that:

1. Creates or uses an HCS topic.
2. Publishes `PROGRAM_CREATED`.
3. Publishes `BUYER_ALLOCATED`.
4. Publishes `VENDOR_APPROVED`.
5. Validates a purchase request.
6. Publishes `ORDER_CREATED`.
7. Creates a scheduled payment.
8. Submits required signatures.
9. Executes or confirms the transfer.
10. Publishes `PAYMENT_EXECUTED`.
11. Reads the events through Mirror Node.
12. Prints the audit timeline.

This is the first non-negotiable milestone.

## Phase 2 — State reconstruction

Build:

- Event decoder
- Reducer
- Program projection
- Order projection
- Mirror Node polling
- Idempotent synchronization

## Phase 3 — Minimal web interface

Build:

- Role selector
- Program summary
- Order form
- Vendor comparison
- Delivery approval page
- Audit timeline

## Phase 4 — ENS identity and discovery

Add:

- Dynamic ENS name resolution
- Agent metadata records
- Organization linkage
- Hedera account binding
- Audit display using ENS names
- Failure handling for missing or mismatched records

## Phase 5 — World AgentKit

Add:

- Human-backed agent proof
- Principal mapping
- Delegation record
- Authorization checks
- Rejected unverified agent demo

## Phase 6 — Agentic payment workflow

Add:

- Procurement agent
- Offer ranking
- Selection explanation
- Scheduled transaction initiation
- Payment monitoring

## Phase 7 — Polish

Add:

- Analytics
- Rejected-action timeline
- Sponsor integration documentation
- Demo reset script
- Seeded scenario
- Failure-state handling
- README
- Demo video

---

# 23. Testing Strategy

## 23.1 Unit tests

Policy tests:

- Valid purchase
- Allocation exceeded
- Invalid vendor
- Invalid category
- Expired delegation
- Revoked delegation
- Unverified agent
- Buyer tries to verify delivery
- Vendor tries to verify delivery
- Payment before verification

Reducer tests:

- Program reconstruction
- Allocation updates
- Order state transitions
- Duplicate event handling
- Unknown event version
- Invalid transition rejection

## 23.2 Integration tests

Hedera tests:

- Publish and read HCS message
- Create schedule
- Add signature
- Confirm execution
- Fetch Mirror Node result
- Detect failed payment
- Handle schedule expiration

ENS tests:

- Resolve agent name and required metadata
- Reject unresolved name
- Reject account mismatch
- Reject organization mismatch
- Detect changed delegation hash

World tests:

- Verified human-backed agent
- Unverified agent
- Delegation limit exceeded
- Revoked delegation

## 23.3 End-to-end test

Test name:

```text
completes a human-backed, policy-controlled procurement lifecycle
```

Expected flow:

```text
program
→ allocation
→ vendor approval
→ ENS identity resolution
→ World-backed agent authorization
→ order
→ scheduled payment
→ delivery
→ independent verification
→ finance approval
→ payment
→ audit timeline
```

---

# 24. Demo Script

## 24.1 Opening

> Organizations face a trade-off. Centralized procurement gives control but is slow and vulnerable to favoritism. Decentralized budgets give teams autonomy but make spending difficult to govern and audit.

> Yareon lets organizations decentralize supplier choice while keeping policy, approvals, payment, and accountability centrally enforceable.

## 24.2 Create program

Show:

- AI Research Compute Fund
- 20,000-unit budget
- GPU_COMPUTE category
- Robotics Lab allocation of 5,000
- Three approved vendors

Mention that the program and approvals are written to HCS.

## 24.3 Agent identity and human backing

Resolve `buyer.robotics-lab.eth` dynamically.

Show the resolved:

- Agent role
- Organization name
- Agent endpoint
- Hedera execution account
- Delegation-integrity reference

Then show the laboratory manager delegating limited purchasing authority.

Attempt with an ENS-resolved but World-unverified agent:

> Rejected: the named agent has no valid human-backed authorization.

Finally, use the ENS-resolved, World-backed agent.

## 24.4 Vendor selection

Show three offers.

The agent selects Horizon Cloud and explains why.

Show the deterministic policy result:

```text
Human-backed: yes
Delegation valid: yes
Program active: yes
Vendor approved: yes
Category allowed: yes
Remaining allocation: 5,000
Order value: 3,500
Decision: approved
```

## 24.5 Scheduled payment

Show the order and Hedera schedule.

Explain:

> The payment exists, but it cannot execute until delivery is verified and finance approves it.

## 24.6 Delivery and signatures

Switch to vendor:

- Submit delivery evidence

Switch to verifier:

- Approve delivery

Switch to finance:

- Add final signature

Show Hedera executing the payment.

## 24.7 Audit view

Show:

- ENS agent and organization names
- Resolved Hedera execution account
- World-backed authorization
- Policy evaluation
- Order event
- Delivery evidence hash
- Verifier approval
- Scheduled transaction
- Final payment transaction
- HCS consensus timestamps

## 24.8 Closing

> Yareon turns procurement into a verifiable workflow: persistent agent identity, human-backed authority, deterministic policy, competitive choice, independent delivery verification, approval-gated payment, and a tamper-evident audit trail.

---

# 25. Judging Narrative by Partner and Track

## Hedera No Solidity Allowed

Emphasize:

- No Solidity
- Native Hedera SDK
- HCS event sourcing
- Scheduled Transactions
- Mirror Node audit reconstruction
- Real testnet payment
- User-facing end-to-end workflow

## Hedera AI & Agentic Payments

Emphasize:

- Agent performs a real organizational task
- Agent evaluates offers and policy
- Agent creates or initiates the scheduled payment
- Payment occurs on Hedera
- Agent is bounded by delegation and deterministic rules
- The agent’s actions are auditable

## World AgentKit

Emphasize:

- Agent receives execution rights only after human-backed verification
- World proof changes the authorization outcome
- Unverified bot is rejected
- Verified agent can still be rejected if it exceeds delegated authority
- The integration supports organizational accountability, not generic login

---

## ENS Best Integration for AI Agents

Emphasize:

- The agent identity is resolved dynamically, not hard-coded
- ENS improves agent discovery and audit readability
- Records bind the agent to its organization, endpoint, and Hedera execution account
- The system checks the resolved account against the signer
- ENS identity is used in the real procurement workflow
- The audit timeline displays both readable names and concrete execution identifiers
- ENS is not misrepresented as proof of human backing or organizational authorization

---

# 26. Risks and Mitigations

## Risk: Too many integrations

**Mitigation:** Hedera vertical slice first, followed by minimal ENS resolution and World authorization. Each partner must change a real execution decision.

## Risk: Agent appears cosmetic

**Mitigation:** The agent must create an order or scheduled payment and produce a visible authorization decision.

## Risk: ENS appears cosmetic

**Mitigation:** Resolve live records and use them to bind the agent endpoint, organization, and execution account. Reject a mismatched resolution.

## Risk: World appears cosmetic

**Mitigation:** Reject the same transaction when the agent is not human-backed.

## Risk: HCS is treated as arbitrary logging

**Mitigation:** Reconstruct the dashboard state from HCS events through Mirror Node.

## Risk: Payment executes too early

**Mitigation:** Require separate verifier and finance signatures.

## Risk: Demo depends on manual network timing

**Mitigation:** Seed accounts, create reusable topic IDs, provide a reset script, poll with visible status, and prepare fallback recorded transactions.

## Risk: Sensitive data is public

**Mitigation:** Store only hashes, identifiers, status, and references on HCS.

## Risk: “Blockchain solves truth” overclaim

**Mitigation:** Explicitly state that Hedera protects workflow integrity, not the truth of physical-world evidence.

---

# 27. Product Roadmap After the Hackathon

## Phase 1 — University pilots

- Research compute
- Laboratory services
- Equipment purchasing
- Training budgets
- Internal facility marketplaces

## Phase 2 — NGO and grant programs

- Milestone-based grants
- Restricted program budgets
- Approved local vendors
- Outcome-linked payment

## Phase 3 — Corporate procurement

- Team equipment budgets
- Software subscriptions
- Cloud budgets
- Contractor milestones
- Agentic purchasing controls

## Phase 4 — Public-sector procurement

- Municipal repairs
- Emergency purchasing
- Agricultural input vouchers
- Public healthcare equipment
- Education programs

## Phase 5 — Open standard

- Standard event schemas
- Procurement agent authorization standard
- Vendor credential standard
- Cross-organization audit tools
- ERP adapters
- Fiat settlement adapters

---

# 28. Future Technical Extensions

- HTS-based non-transferable program credits
- Privacy-preserving bidding
- Verifiable private AI evaluation
- Extended ENS and credential-based vendor identity
- External ERP integration
- Fiat payment instruction generation
- Multi-program treasury
- Threshold and role-based policies
- Real-world identity attestations
- Conflict-of-interest graph
- Statistical price anomaly detection
- Supplier reputation
- Procurement policy templates
- Cross-organization purchasing cooperatives
- Public transparency dashboards
- Encrypted evidence storage
- Independent audit APIs

---

# 29. Design Principles

1. **The ledger records authority and state transitions, not sensitive documents.**
2. **The agent proposes and executes only within deterministic constraints.**
3. **An ENS name identifies an actor but does not authorize it.**
4. **Human-backed status is necessary but not sufficient for authorization.**
5. **The buyer cannot verify its own purchase.**
6. **Payments follow verified delivery.**
7. **Rejected actions are auditable.**
8. **Credits are restricted purchasing authority, not speculative tokens.**
9. **The MVP must tell one complete story.**
10. **Every sponsor integration must be load-bearing.**
11. **The product remains useful without pretending blockchain verifies physical truth.**

---
# 30. Immediate Next Actions

1. Initialize the TypeScript repository.
2. Configure Hedera testnet accounts.
3. Implement `hedera/client.ts`.
4. Create one HCS topic.
5. Define the versioned event schema.
6. Implement `publishEvent`.
7. Implement Mirror Node topic reader.
8. Implement event reducer.
9. Implement purchase policy validation.
10. Create a scheduled supplier transfer.
11. Collect two signatures.
12. Confirm payment execution.
13. Build the one-page audit timeline.
14. Register or configure the demo ENS identities.
15. Resolve `buyer.robotics-lab.eth` and required metadata dynamically.
16. Bind the resolved ENS identity to the Hedera execution account.
17. Add World AgentKit proof and principal mapping.
18. Enforce the delegation and negative authorization cases.
19. Add the procurement agent.
20. Record the final demo.

---

# 31. Canonical Context for Future AI Conversations

Use the following condensed context when a future conversation cannot load this entire document:

> I am building Yareon for ETHGlobal Lisbon 2026. Yareon is a programmable procurement system that lets organizations decentralize supplier choice while retaining policy control, separation of duties, delivery verification, approval-gated payment, and auditability.
>
> The primary demo is university GPU procurement. A university creates a funded program, allocates a restricted limit to a robotics laboratory, approves several GPU vendors, and lets a procurement agent choose an eligible vendor. The payment is created as a Hedera Scheduled Transaction but executes only after an independent verifier confirms delivery and a finance signer approves it. Every important state transition is written to Hedera Consensus Service, and the application reconstructs state and the audit timeline through Mirror Node.
>
> The project selects three partners. Under Hedera, it targets “No Solidity Allowed — Build with Hedera SDKs” and “AI & Agentic Payments on Hedera.” Under World, it targets “AgentKit New Use Cases.” Under ENS, it targets “Best ENS Integration for AI Agents.”
>
> ENS provides persistent human-readable identity and discovery for the procurement agent and organization. World proves that the agent is backed by a real, unique human. Yareon’s deterministic policy engine then validates organization membership, delegation, amount, category, vendor approval, expiration, and separation of duties. Hedera provides HCS, Scheduled Transactions, payment execution, and Mirror Node.
>
> The trust flow is: resolve `buyer.robotics-lab.eth`; verify its World human backing; validate its organizational delegation; create the order; verify delivery independently; collect payment approvals; execute the Hedera testnet payment; and display the complete audit history.
>
> The first milestone remains a Hedera TypeScript vertical slice: create an HCS procurement history, validate one order, create a scheduled supplier payment, collect approvals, execute a real testnet transfer, read events through Mirror Node, and print the audit timeline. ENS and World are then attached to the authorization boundary.
>
> Do not introduce Solidity, transferable procurement tokens, cross-chain infrastructure, or complex privacy features until the vertical slice works.

---

# 32. Official Sponsor Resources

## Hedera

- Getting started: https://docs.hedera.com/hedera/getting-started
- JavaScript SDK: https://github.com/hashgraph/hedera-sdk-js
- Python SDK: https://github.com/hashgraph/hedera-sdk-python
- Consensus Service: https://docs.hedera.com/hedera/sdks-and-apis/sdks/consensus-service
- Scheduled Transactions: https://docs.hedera.com/hedera/sdks-and-apis/sdks/schedule-transaction
- Mirror Node REST API: https://docs.hedera.com/hedera/sdks-and-apis/rest-api
- Hedera Agent Kit: https://github.com/hashgraph/hedera-agent-kit
- Hedera Agent Kit Python: https://github.com/hashgraph/hedera-agent-kit-python

## World

- World developer documentation: https://docs.world.org/
- AgentKit integration: https://docs.world.org/agents/agent-kit/integrate

## ENS

- ENS developer documentation: https://docs.ens.domains/
- Agent identity verification: https://docs.ens.domains/ensip/25/
- Agent text records: https://docs.ens.domains/ensip/26/
- ENS CLI: https://github.com/ensdomains/ens-cli

---

# 33. Final Project Definition

Yareon is not a cryptocurrency marketplace and not a replacement for every procurement system.

It is a reusable trust and execution layer for organizational purchasing.

Its defining workflow is:

```text
Persistent ENS agent identity and discovery
        +
World-verified human backing
        +
Deterministic spending policy
        +
Restricted buyer allocation
        +
Approved vendor choice
        +
Independent delivery verification
        +
Approval-gated Hedera payment
        +
Tamper-evident HCS audit history
```

The hackathon succeeds when a judge can see one complete, real transaction and understand:

1. Which persistent agent and organization acted.
2. Whether the agent was backed by a unique human.
3. Why the purchase was permitted.
4. Which vendor was selected.
5. Whether delivery was independently verified.
6. Why payment could or could not execute.
7. Where the complete audit trail can be inspected.

That is the project’s core promise:

> Decentralize purchasing decisions without decentralizing accountability.
