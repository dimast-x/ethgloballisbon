import { getProgramSession, getTestnetReadiness } from "@/src/application/runtime";

export async function GET() {
  const programId = process.env.CHARTER_SHOWCASE_PROGRAM_ID;
  const hedera = await getTestnetReadiness(false);
  if (!programId || !hedera.ready) {
    return Response.json({
      available: false,
      network: "Hedera testnet",
      integrations: {
        hedera: hedera.ready,
        ens: false,
        world: false,
        directWallets: false,
      },
    });
  }
  const session = await getProgramSession(programId, "testnet");
  if (!session?.projection.program) {
    return Response.json({ available: false, network: "Hedera testnet" });
  }
  const projection = session.projection;
  const order = Object.values(projection.orders).find(
    (candidate) => candidate.status === "PAYMENT_EXECUTED",
  );
  const attestation = Object.values(projection.humanBacking)[0];
  const missingBackingRejected = projection.agentAuthorizationDecisions.some(
    (decision) => decision.code === "HUMAN_BACKING_REQUIRED",
  );
  const delegationLimitRejected = projection.agentAuthorizationDecisions.some(
    (decision) => decision.code === "AGENT_ORDER_LIMIT_EXCEEDED",
  );
  const verifierAccountId = hedera.publicConfig.verifierAccountId;
  const financeAccountId = hedera.publicConfig.financeAccountId;
  const directWallets = Boolean(
    verifierAccountId &&
      financeAccountId &&
      verifierAccountId !== financeAccountId &&
    order?.approvals.some(
      (approval) =>
        approval.role === "DELIVERY_VERIFIER" &&
          approval.hederaAccountId === verifierAccountId &&
          /^\d+\.\d+\.\d+@\d+\.\d+$/.test(approval.transactionId ?? "") &&
          approval.reference.startsWith("hedera-walletconnect:"),
    ) &&
      order.approvals.some(
        (approval) =>
          approval.role === "FINANCE" &&
          approval.hederaAccountId === financeAccountId &&
          /^\d+\.\d+\.\d+@\d+\.\d+$/.test(approval.transactionId ?? "") &&
          approval.reference.startsWith("hedera-walletconnect:"),
      ),
  );
  const hederaRecorded = projection.timeline.every(
    (event) =>
      event.ledgerReference?.topicId === hedera.publicConfig.topicId &&
      typeof event.ledgerReference?.sequenceNumber === "number",
  );
  const ledgerSettled = order
    ? await verifySettlementProjection({
        mirrorNodeUrl: hedera.publicConfig.mirrorNodeUrl,
        scheduleId: order.scheduleId,
        paymentTransactionId: order.paymentTransactionId,
        treasuryAccountId: hedera.publicConfig.treasuryAccountId,
        vendorAccountId: hedera.publicConfig.vendorAccountId,
        amount: order.amount.atomicAmount,
      })
    : false;
  if (
    !order ||
    !attestation ||
    !missingBackingRejected ||
    !delegationLimitRejected ||
    !directWallets ||
    !hederaRecorded ||
    !ledgerSettled
  ) {
    return Response.json({
      available: false,
      network: "Hedera testnet",
      integrations: {
        hedera: hederaRecorded && ledgerSettled,
        ens: false,
        world: Boolean(attestation),
        directWallets,
      },
    });
  }
  return Response.json({
    available: true,
    network: "Hedera testnet",
    topicId: hedera.publicConfig.topicId,
    projection,
    integrations: {
      hedera: true,
      ens: false,
      world: true,
      directWallets: true,
    },
    proof: {
      world: {
        scheme: attestation.scheme,
        verificationReference: attestation.verificationReference,
        verifiedAt: attestation.verifiedAt,
      },
      rejections: {
        missingBacking: missingBackingRejected,
        delegationLimit: delegationLimitRejected,
      },
      order: {
        id: order.id,
        status: order.status,
        scheduleId: order.scheduleId,
        paymentTransactionId: order.paymentTransactionId,
        approvals: order.approvals,
      },
      accounts: {
        treasury: hedera.publicConfig.treasuryAccountId,
        vendor: hedera.publicConfig.vendorAccountId,
        verifier: hedera.publicConfig.verifierAccountId,
        finance: hedera.publicConfig.financeAccountId,
      },
    },
  });
}

async function verifySettlementProjection(input: {
  mirrorNodeUrl: string;
  scheduleId?: string;
  paymentTransactionId?: string;
  treasuryAccountId?: string;
  vendorAccountId?: string;
  amount: string;
}): Promise<boolean> {
  if (
    !input.scheduleId ||
    !input.paymentTransactionId ||
    !input.treasuryAccountId ||
    !input.vendorAccountId
  ) {
    return false;
  }
  try {
    const [scheduleResponse, transactionResponse] = await Promise.all([
      fetch(
        `${input.mirrorNodeUrl}/api/v1/schedules/${encodeURIComponent(input.scheduleId)}`,
      ),
      fetch(
        `${input.mirrorNodeUrl}/api/v1/transactions/${encodeURIComponent(input.paymentTransactionId)}`,
      ),
    ]);
    if (!scheduleResponse.ok || !transactionResponse.ok) return false;
    const schedule = (await scheduleResponse.json()) as {
      schedule_id?: string;
      executed_timestamp?: string | null;
    };
    const transactions = (await transactionResponse.json()) as {
      transactions?: Array<{
        result?: string;
        transfers?: Array<{ account: string; amount: number }>;
      }>;
    };
    const amount = Number(input.amount);
    const settlement = transactions.transactions?.find(
      (transaction) =>
        transaction.result === "SUCCESS" &&
        transaction.transfers?.some(
          (transfer) =>
            transfer.account === input.treasuryAccountId &&
            transfer.amount === -amount,
        ) &&
        transaction.transfers.some(
          (transfer) =>
            transfer.account === input.vendorAccountId &&
            transfer.amount === amount,
        ),
    );
    return Boolean(
      schedule.schedule_id === input.scheduleId &&
        schedule.executed_timestamp &&
        settlement,
    );
  } catch {
    return false;
  }
}
