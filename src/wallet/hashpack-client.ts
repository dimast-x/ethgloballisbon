"use client";

let connectorPromise:
  | Promise<
      import("@hashgraph/hedera-wallet-connect").DAppConnector
    >
  | undefined;

async function connector() {
  if (typeof window === "undefined") {
    throw new Error("HashPack can only be used in the browser.");
  }
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  if (!projectId) {
    throw new Error("WalletConnect is not configured for this application.");
  }
  connectorPromise ??= (async () => {
    const [{ DAppConnector, HederaChainId, HederaJsonRpcMethod }, { LedgerId }] =
      await Promise.all([
        import("@hashgraph/hedera-wallet-connect"),
        import("@hiero-ledger/sdk"),
      ]);
    const instance = new DAppConnector(
      {
        name: "OpenProcure",
        description: "Protocol-controlled procurement approvals",
        url: window.location.origin,
        icons: [`${window.location.origin}/og.png`],
      },
      LedgerId.TESTNET,
      projectId,
      [HederaJsonRpcMethod.SignMessage],
      [],
      [HederaChainId.Testnet],
      "error",
    );
    await instance.init({ logger: "error" });
    return instance;
  })();
  return connectorPromise;
}

export async function connectHashPack(): Promise<string[]> {
  const instance = await connector();
  if (instance.signers.length === 0) {
    await instance.openModal(undefined, true);
  }
  return instance.signers.map((signer) => signer.getAccountId().toString());
}

export async function signHashPackMessage(
  accountId: string,
  message: string,
): Promise<string> {
  const instance = await connector();
  if (
    !instance.signers.some(
      (signer) => signer.getAccountId().toString() === accountId,
    )
  ) {
    await instance.openModal(undefined, true);
  }
  const signer = instance.signers.find(
    (candidate) => candidate.getAccountId().toString() === accountId,
  );
  if (!signer) {
    throw new Error(`HashPack did not authorize the expected account ${accountId}.`);
  }
  const result = await instance.signMessage({
    signerAccountId: `hedera:testnet:${accountId}`,
    message,
  });
  const signatureMap = result.result?.signatureMap;
  if (!signatureMap) throw new Error("HashPack returned no message signature.");
  return signatureMap;
}
