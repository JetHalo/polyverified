import { base, baseSepolia } from "viem/chains";

export type EthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

export type SupportedBaseChainId = 8453 | 84532;

const SUPPORTED_BASE_CHAINS = {
  [base.id]: base,
  [baseSepolia.id]: baseSepolia,
} as const satisfies Record<SupportedBaseChainId, typeof base | typeof baseSepolia>;

function formatChainIdHex(chainId: number) {
  return `0x${chainId.toString(16)}`;
}

function getSupportedBaseChain(chainId: SupportedBaseChainId) {
  return SUPPORTED_BASE_CHAINS[chainId];
}

export function getBaseNetworkLabel(chainId: number | null | undefined) {
  if (chainId === baseSepolia.id) {
    return "Base Sepolia";
  }

  if (chainId === base.id) {
    return "Base Mainnet";
  }

  return "Unsupported network";
}

export async function readEthereumChainId(provider: EthereumProvider) {
  const chainIdHex = (await provider.request({
    method: "eth_chainId",
  })) as string;

  return Number.parseInt(chainIdHex, 16);
}

export async function ensureBaseChain(provider: EthereumProvider, chainId: SupportedBaseChainId) {
  const targetChain = getSupportedBaseChain(chainId);
  const requiredChainId = targetChain.id;
  const requiredChainHex = formatChainIdHex(requiredChainId);

  const activeChainId = await readEthereumChainId(provider);

  if (activeChainId === requiredChainId) {
    return;
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: requiredChainHex }],
    });
  } catch (error: any) {
    if (error?.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: requiredChainHex,
            chainName: targetChain.name,
            nativeCurrency: targetChain.nativeCurrency,
            rpcUrls: targetChain.rpcUrls.default.http,
            blockExplorerUrls: targetChain.blockExplorers?.default.url ? [targetChain.blockExplorers.default.url] : [],
          },
        ],
      });
    } else {
      throw error;
    }
  }

  const confirmedChainId = await readEthereumChainId(provider);

  if (confirmedChainId !== requiredChainId) {
    throw new Error(`Please switch to ${getBaseNetworkLabel(requiredChainId)} (current chainId: ${confirmedChainId})`);
  }
}

export async function ensureBaseSepoliaChain(provider: EthereumProvider) {
  await ensureBaseChain(provider, baseSepolia.id);
}
