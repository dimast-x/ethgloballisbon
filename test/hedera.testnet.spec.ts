import {
  AccountInfoQuery,
  ScheduleInfoQuery,
} from "@hashgraph/sdk";
import { describe, expect, it } from "vitest";

for (const path of [".env.local", ".env"]) {
  try {
    process.loadEnvFile?.(path);
  } catch {
    // Continue to the next local environment file.
  }
}

const enabled = process.env.RUN_HEDERA_TESTNET === "1";

describe.skipIf(!enabled)("completed Hedera testnet lifecycle", () => {
  it(
    "detects both wallet signers, execution, idempotency, reconstruction, and exact HBAR movement",
    async () => {
      const programId = process.env.HEDERA_TEST_PROGRAM_ID;
      if (!programId) {
        throw new Error(
          "HEDERA_TEST_PROGRAM_ID must identify a completed golden run.",
        );
      }
      const runtime = await import("../src/application/runtime");
      const adapter = await import("../src/adapters/hedera");
      const { reduceProtocolEvents } = await import("../src/protocol/reducer");
      const config = adapter.hederaConfigFromEnv();
      const eventStore = new adapter.HederaEventStore(config);
      const events = await eventStore.read(programId);
      const rebuilt = reduceProtocolEvents(events);
      const program = rebuilt.program;
      const order = Object.values(rebuilt.orders).find(
        (candidate) => candidate.status === "PAYMENT_EXECUTED",
      );

      expect(program?.hedera?.treasuryAccountId).toBeTruthy();
      expect(program?.hedera?.verifierAccountId).toBeTruthy();
      expect(program?.hedera?.financeAccountId).toBeTruthy();
      expect(order?.scheduleId).toBeTruthy();
      expect(order?.supplierSettlementAccountId).toBeTruthy();
      expect(
        events.some((event) => event.eventType === "PAYMENT_SCHEDULE_CREATED"),
      ).toBe(true);
      expect(
        events.filter((event) => event.eventType === "PAYMENT_EXECUTED"),
      ).toHaveLength(1);

      const client = adapter.createHederaClient(config);
      const verifierAccountId = program!.hedera!.verifierAccountId!;
      const financeAccountId = program!.hedera!.financeAccountId!;
      const [schedule, verifier, finance] = await Promise.all([
        new ScheduleInfoQuery().setScheduleId(order!.scheduleId!).execute(client),
        new AccountInfoQuery()
          .setAccountId(verifierAccountId)
          .execute(client),
        new AccountInfoQuery()
          .setAccountId(financeAccountId)
          .execute(client),
      ]);
      expect(schedule.executed).toBeTruthy();
      const signerKeys =
        schedule.signers?.toArray().map((key) => key.toString()) ?? [];
      expect(signerKeys).toContain(verifier.key?.toString());
      expect(signerKeys).toContain(finance.key?.toString());

      const financeApproval = order!.approvals.find(
        (approval) => approval.role === "FINANCE",
      );
      expect(financeApproval?.transactionId).toBeTruthy();
      await runtime.runProgramCommand(programId, "testnet", {
        type: "APPROVE_FINANCE",
        idempotencyKey: `${rebuilt.runId}:golden-finance-idempotency`,
        actor: {
          actorId: financeApproval!.actorId,
          role: "FINANCE",
          actorType: "HUMAN",
          hederaAccountId: financeApproval!.hederaAccountId,
        },
        orderId: order!.id,
        approvalReference: financeApproval!.reference,
        approvalTransactionId: financeApproval!.transactionId,
      });
      const afterDuplicate = await eventStore.read(programId);
      expect(
        afterDuplicate.filter(
          (event) => event.eventType === "PAYMENT_EXECUTED",
        ),
      ).toHaveLength(1);

      const mirrorNodeUrl =
        config.mirrorNodeUrl ?? "https://testnet.mirrornode.hedera.com";
      const response = await fetch(
        `${mirrorNodeUrl}/api/v1/transactions/${encodeURIComponent(
          adapter.hederaTransactionIdForMirror(order!.paymentTransactionId!),
        )}`,
      );
      expect(response.ok).toBe(true);
      const body = (await response.json()) as {
        transactions?: Array<{
          result?: string;
          transfers?: Array<{ account: string; amount: number }>;
        }>;
      };
      const payment = body.transactions?.find(
        (transaction) =>
          transaction.result === "SUCCESS" &&
          transaction.transfers?.some(
            (transfer) =>
              transfer.account === order!.supplierSettlementAccountId &&
              transfer.amount === Number(order!.amount.atomicAmount),
          ),
      );
      expect(payment?.transfers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            account: program!.hedera!.treasuryAccountId,
            amount: -Number(order!.amount.atomicAmount),
          }),
          expect.objectContaining({
            account: order!.supplierSettlementAccountId,
            amount: Number(order!.amount.atomicAmount),
          }),
        ]),
      );
      client.close();
    },
    240_000,
  );
});
