"use client";

import {
  createWalletClient,
  custom,
  defineChain,
  getAddress,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";

const HEDERA_TESTNET_CHAIN_ID = "0x128";

const hederaTestnet = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: {
    name: "HBAR",
    symbol: "HBAR",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["https://testnet.hashio.io/api"] },
  },
  blockExplorers: {
    default: {
      name: "HashScan",
      url: "https://hashscan.io/testnet",
    },
  },
  testnet: true,
});

type MetaMaskProvider = EIP1193Provider & {
  isMetaMask?: boolean;
};

function provider(): MetaMaskProvider {
  if (typeof window === "undefined") {
    throw new Error("MetaMask can only be used in the browser.");
  }
  const ethereum = (
    window as Window & { ethereum?: MetaMaskProvider }
  ).ethereum;
  if (!ethereum?.isMetaMask) {
    throw new Error("Install or enable the MetaMask browser extension first.");
  }
  return ethereum;
}

async function ensureHederaTestnet(instance: MetaMaskProvider) {
  const chainId = await instance.request({ method: "eth_chainId" });
  if (chainId === HEDERA_TESTNET_CHAIN_ID) return;
  try {
    await instance.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: HEDERA_TESTNET_CHAIN_ID }],
    });
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? Number(error.code)
        : undefined;
    if (code !== 4902) throw error;
    await instance.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: HEDERA_TESTNET_CHAIN_ID,
          chainName: hederaTestnet.name,
          nativeCurrency: hederaTestnet.nativeCurrency,
          rpcUrls: hederaTestnet.rpcUrls.default.http,
          blockExplorerUrls: [hederaTestnet.blockExplorers!.default.url],
        },
      ],
    });
  }
}

export async function connectMetaMask(): Promise<Address> {
  const instance = provider();
  const accounts = (await instance.request({
    method: "eth_requestAccounts",
  })) as string[];
  if (!accounts[0]) throw new Error("MetaMask did not return an account.");
  await ensureHederaTestnet(instance);
  return getAddress(accounts[0]);
}

export async function signMetaMaskMessage(
  address: Address,
  message: string,
): Promise<Hex> {
  const instance = provider();
  await ensureHederaTestnet(instance);
  const wallet = createWalletClient({
    account: address,
    chain: hederaTestnet,
    transport: custom(instance),
  });
  const [activeAddress] = await wallet.getAddresses();
  if (!activeAddress || getAddress(activeAddress) !== getAddress(address)) {
    throw new Error(
      `Switch MetaMask to ${shortAddress(address)} before approving.`,
    );
  }
  return wallet.signMessage({ account: address, message });
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
