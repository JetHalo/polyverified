import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme as ExactEvmClientScheme } from "@x402/evm/exact/client";
import { createWalletClient, custom } from "viem";
import { baseSepolia } from "viem/chains";
import { ensureBaseSepoliaChain, type EthereumProvider } from "@/lib/base-sepolia";

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

function requireEthereum(): EthereumProvider {
  if (!window.ethereum) {
    throw new Error("Wallet not found");
  }

  return window.ethereum;
}

function createClientSigner(provider: EthereumProvider, address: `0x${string}`) {
  const walletClient = createWalletClient({
    account: address,
    chain: baseSepolia,
    transport: custom(provider as any),
  });

  return {
    address,
    signTypedData: async (typedData: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
    }) =>
      walletClient.signTypedData({
        account: address,
        domain: typedData.domain as any,
        types: typedData.types as any,
        primaryType: typedData.primaryType as any,
        message: typedData.message as any,
      }),
  };
}

async function readResponsePayload(response: Response): Promise<Record<string, unknown>> {
  const contentType =
    typeof response.headers?.get === "function" ? response.headers.get("content-type")?.toLowerCase() ?? "" : "";

  if (contentType.includes("application/json") || typeof response.json === "function") {
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  const bodyText = typeof response.text === "function" ? await response.text() : "";
  return bodyText ? { error: bodyText } : {};
}

export async function unlockSignalWithX402(input: { signalId: string }) {
  const provider = requireEthereum();
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  const address = accounts[0] as `0x${string}` | undefined;

  if (!address) {
    throw new Error("Wallet account not available");
  }

  await ensureBaseSepoliaChain(provider);

  const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [
      {
        network: `eip155:${baseSepolia.id}`,
        client: new ExactEvmClientScheme(createClientSigner(provider, address)),
      },
    ],
  });

  const response = await fetchWithPayment(`/api/x402/premium?signalId=${encodeURIComponent(input.signalId)}`, {
    method: "GET",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
    },
  });

  const payload = await readResponsePayload(response);

  if (!response.ok) {
    throw new Error((payload as { error?: string })?.error ?? "x402 unlock failed");
  }

  return payload;
}
