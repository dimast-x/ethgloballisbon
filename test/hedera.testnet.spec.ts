import { AccountBalanceQuery } from "@hashgraph/sdk";
import { describe, expect, it } from "vitest";
import type { ProtocolCommand } from "../src/application/commands";

try {
  process.loadEnvFile?.(".env.local");
} catch {
  // The opt-in test remains skipped without local credentials.
}

const enabled = process.env.RUN_HEDERA_TESTNET === "1";

describe.skipIf(!enabled)("Hedera testnet lifecycle", () => {
  it(
    "publishes, reconstructs, threshold-signs, settles once, and resumes",
    async () => {
      const runtime = await import("../src/application/runtime");
      const adapter = await import("../src/adapters/hedera");
      const { reduceProtocolEvents } = await import("../src/protocol/reducer");
      const config = adapter.hederaConfigFromEnv();
      const client = adapter.createHederaClient(config);
      const before = await new AccountBalanceQuery()
        .setAccountId(config.vendorAccountId)
        .execute(client);

      let session = await runtime.createUniversityRun("testnet");
      const offer = session.projection.offers[session.selectedOfferId];
      const commands: ProtocolCommand[] = [
        {
          type: "TEST_PURCHASE_POLICY",
          idempotencyKey: `${session.runId}:testnet-reject`,
          actor: human(session.buyerId, "BUYER"),
          buyerId: session.buyerId,
          vendorId: offer.vendorId,
          category: offer.category,
          amount: { ...offer.amount, atomicAmount: "550000000" },
        },
        {
          type: "CREATE_ORDER",
          idempotencyKey: `${session.runId}:testnet-create`,
          actor: human(session.buyerId, "BUYER"),
          orderId: session.orderId,
          buyerId: session.buyerId,
          vendorId: offer.vendorId,
          offerId: offer.id,
          category: offer.category,
          amount: offer.amount,
        },
        {
          type: "ACCEPT_ORDER",
          idempotencyKey: `${session.runId}:testnet-accept`,
          actor: human(offer.vendorId, "VENDOR"),
          orderId: session.orderId,
        },
        {
          type: "SUBMIT_DELIVERY",
          idempotencyKey: `${session.runId}:testnet-evidence`,
          actor: human(offer.vendorId, "VENDOR"),
          orderId: session.orderId,
          evidence: {
            hash: `sha256:${"e".repeat(64)}`,
            mimeType: "application/pdf",
            size: 512,
            submittedBy: offer.vendorId,
            submittedAt: new Date().toISOString(),
          },
        },
        {
          type: "APPROVE_DELIVERY",
          idempotencyKey: `${session.runId}:testnet-verifier`,
          actor: human("testnet_verifier", "DELIVERY_VERIFIER"),
          orderId: session.orderId,
          approvalReference: "opt-in-test:verifier-relay",
        },
      ];

      for (const command of commands) {
        const result = await runtime.runProgramCommand(
          session.programId,
          "testnet",
          command,
        );
        expect(result.status).toBe("CONFIRMED");
        session = {
          ...session,
          projection: result.projection ?? session.projection,
        };
      }

      expect(session.projection.rejectedDecisions).toHaveLength(1);
      const pendingOrder = session.projection.orders[session.orderId];
      expect(pendingOrder.scheduleId).toBeTruthy();
      const scheduler = new adapter.HederaPaymentScheduler(config);
      await expect(
        scheduler.getStatus(pendingOrder.scheduleId!),
      ).resolves.toMatchObject({ state: "PENDING" });

      const finance: ProtocolCommand = {
        type: "APPROVE_FINANCE",
        idempotencyKey: `${session.runId}:testnet-finance`,
        actor: human("testnet_finance", "FINANCE"),
        orderId: session.orderId,
        approvalReference: "opt-in-test:finance-relay",
      };
      const paid = await runtime.runProgramCommand(
        session.programId,
        "testnet",
        finance,
      );
      expect(paid.status).toBe("CONFIRMED");
      const duplicate = await runtime.runProgramCommand(
        session.programId,
        "testnet",
        finance,
      );
      expect(
        duplicate.projection?.timeline.filter(
          (event) => event.eventType === "PAYMENT_EXECUTED",
        ),
      ).toHaveLength(1);

      const events = await new adapter.HederaEventStore(config).read(
        session.programId,
      );
      const rebuilt = reduceProtocolEvents(events);
      expect(rebuilt.orders[session.orderId].status).toBe("PAYMENT_EXECUTED");

      const after = await new AccountBalanceQuery()
        .setAccountId(config.vendorAccountId)
        .execute(client);
      expect(
        after.hbars.toTinybars().subtract(before.hbars.toTinybars()).toString(),
      ).toBe("350000000");
      client.close();
    },
    240_000,
  );
});

function human(actorId: string, role: string) {
  return { actorId, role, actorType: "HUMAN" as const };
}

