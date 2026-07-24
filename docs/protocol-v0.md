# OpenProcure Protocol v0

OpenProcure defines a network-independent event protocol for policy-controlled
organizational purchasing. A program delegates bounded buying authority while
preserving vendor eligibility, evidence, independent approval, settlement, and
auditability.

## Authority and state

Programs define an asset-denominated budget, allowed category identifiers,
maximum order value, evidence requirement, and approval roles. Categories and
roles are extensible strings. Amounts use integer atomic units and never
floating-point arithmetic.

The order lifecycle is:

`CREATED → VENDOR_ACCEPTED → PAYMENT_SCHEDULED → DELIVERY_SUBMITTED → DELIVERY_APPROVED → PAYMENT_EXECUTED`

Every command validates its expected state and uses a stable correlation ID.
Consumers ignore duplicate event IDs.

## Event envelope

All events use schema version `0.1` and contain an event ID, run ID,
organization ID, program ID, optional order ID, actor, correlation ID,
application timestamp, and event-specific data. Ledger adapters may attach
sequence, consensus timestamp, topic, and transaction references after
recording.

The normative JSON shape is in `docs/protocol-event.schema.json`.

## Policy decisions

Authorization is deterministic. A decision contains `allowed`, a stable code,
human-readable reasons, and every evaluated rule. Rejections are first-class
audit events.

## Evidence and privacy

Evidence events record only a SHA-256 digest, MIME type, byte size, submitter,
and timestamp. Documents, credentials, personal information, bids, and secrets
remain off ledger.

## Settlement

The protocol requests a scheduled payment through an adapter. It does not
mandate HBAR or Hedera. The first adapter uses Hedera HCS as the event store,
Scheduled Transactions for approval collection, and Mirror Node for replay.

## Conformance

An implementation conforms to v0 when the same policy engine and reducer can
process different organization, category, role, vendor, and asset identifiers
without source changes. The university GPU and NGO medical-supply fixtures are
the initial conformance examples.
