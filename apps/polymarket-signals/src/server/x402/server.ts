import { x402Facilitator } from "@x402/core/facilitator";
import { x402HTTPResourceServer } from "@x402/core/http";
import { HTTPFacilitatorClient, type FacilitatorClient, x402ResourceServer } from "@x402/core/server";
import type { SupportedResponse } from "@x402/core/types";
import { registerExactEvmScheme } from "@x402/evm/exact/facilitator";
import { ExactEvmScheme as ExactEvmServerScheme } from "@x402/evm/exact/server";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import { resolveWalletAddressFromCookieHeader } from "@/server/auth/service";
import { createUserActivityEvent } from "@/server/auth/store";
import { resolveRuntimeConfig } from "@/server/config";
import { getPool } from "@/server/db/client";
import { resolveSignalStore, type SignalStore } from "@/server/repository/store";
import type { RuntimeConfig } from "@/server/types";
import { resolveConfiguredPaymentAmountLabel } from "@/server/x402/access";

function getSingleQueryValue(value: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] ?? null : value;
}

export function resolveX402CaipNetwork(config: RuntimeConfig): `${string}:${string}` {
  const configured = config.payment.network.trim().toLowerCase();

  if (configured.startsWith("eip155:")) {
    return configured as `${string}:${string}`;
  }

  if (configured === "base-sepolia") {
    return "eip155:84532";
  }

  if (configured === "base-mainnet" || configured === "base") {
    return "eip155:8453";
  }

  return configured as `${string}:${string}`;
}

export function buildProtectedSignalRouteConfig(config: RuntimeConfig) {
  if (!config.payment.tokenAmountAtomic || !config.payment.tokenAddress) {
    throw new Error("PAYMENT_TOKEN_AMOUNT_ATOMIC and PAYMENT_TOKEN_ADDRESS are required for x402");
  }

  return {
    accepts: {
      scheme: "exact" as const,
      network: resolveX402CaipNetwork(config),
      payTo: config.payment.treasuryAddress,
      price: {
        amount: config.payment.tokenAmountAtomic,
        asset: config.payment.tokenAddress,
        extra: {
          name: config.payment.eip712Name ?? config.payment.token,
          version: config.payment.eip712Version ?? "1",
        },
      },
    },
    description: "Unlock a premium Poly Verified signal",
  };
}

export function createProtectedSignalRequestHook(store: Pick<SignalStore, "hasSignalAccess">) {
  return async (context: any) => {
    const signalId = getSingleQueryValue(context.adapter.getQueryParam("signalId"));

    if (!signalId) {
      return {
        abort: true as const,
        reason: "signal-id-required",
      };
    }

    const walletAddress = await resolveWalletAddressFromCookieHeader(context.adapter.getHeader("cookie"));

    if (!walletAddress) {
      return {
        abort: true as const,
        reason: "wallet-session-required",
      };
    }

    const alreadyUnlocked = await store.hasSignalAccess(walletAddress, signalId);

    if (alreadyUnlocked) {
      return {
        grantAccess: true as const,
      };
    }

    return undefined;
  };
}

export function createAfterSettleHook(store: Pick<SignalStore, "createPurchaseAndGrant">) {
  return async (context: any) => {
    if (!context.result?.success) {
      return;
    }

    const signalId = getSingleQueryValue(context.transportContext?.request?.adapter.getQueryParam("signalId"));

    if (!signalId) {
      return;
    }

    const walletAddress = await resolveWalletAddressFromCookieHeader(
      context.transportContext?.request?.adapter.getHeader("cookie"),
    );

    if (!walletAddress) {
      return;
    }

    const config = resolveRuntimeConfig(process.env);
    const { purchase, grant } = await store.createPurchaseAndGrant({
      walletAddress,
      signalId,
      paymentAmount: resolveConfiguredPaymentAmountLabel(config.payment),
      paymentNetwork: context.result.network ?? resolveX402CaipNetwork(config),
      paymentToken: config.payment.token,
      treasuryAddress: config.payment.treasuryAddress,
      paymentTxHash: context.result.transaction ?? null,
      paymentPayer: context.result.payer ?? null,
      paymentScheme: "x402-exact-evm",
    });

    const pool = getPool(config);
    await createUserActivityEvent(pool, {
      walletAddress,
      signalId,
      eventType: "signal_unlocked",
      eventPayload: {
        paymentTxHash: context.result.transaction ?? null,
        purchaseId: purchase.purchaseId,
        grantId: grant.grantId,
      },
    });
  };
}

let cachedHttpServer: x402HTTPResourceServer | null = null;

function resolvePaymentChain(config: RuntimeConfig) {
  const network = config.payment.network.trim().toLowerCase();

  if (network === "base-sepolia" || network === "eip155:84532") {
    return baseSepolia;
  }

  throw new Error(`Unsupported payment network for local x402 facilitator: ${config.payment.network}`);
}

function shouldUseLocalFacilitator(config: RuntimeConfig) {
  return Boolean(config.anchor.rpcUrl && config.anchor.signerPrivateKey);
}

function createLocalFacilitator(config: RuntimeConfig): FacilitatorClient {
  const chain = resolvePaymentChain(config);
  const account = privateKeyToAccount(
    config.anchor.signerPrivateKey!.startsWith("0x")
      ? (config.anchor.signerPrivateKey as `0x${string}`)
      : (`0x${config.anchor.signerPrivateKey}` as `0x${string}`),
  );
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(config.anchor.rpcUrl),
  }).extend(publicActions);
  const facilitatorSigner = {
    address: account.address,
    readContract: (args: {
      address: `0x${string}`;
      abi: readonly unknown[];
      functionName: string;
      args?: readonly unknown[];
    }) => walletClient.readContract(args as any),
    verifyTypedData: (args: {
      address: `0x${string}`;
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
      signature: `0x${string}`;
    }) =>
      walletClient.verifyTypedData({
        address: args.address,
        domain: args.domain as any,
        types: args.types as any,
        primaryType: args.primaryType as any,
        message: args.message as any,
        signature: args.signature,
      }),
    writeContract: (args: {
      address: `0x${string}`;
      abi: readonly unknown[];
      functionName: string;
      args: readonly unknown[];
      gas?: bigint;
    }) => walletClient.writeContract(args as any),
    sendTransaction: (args: { to: `0x${string}`; data: `0x${string}` }) => walletClient.sendTransaction(args),
    waitForTransactionReceipt: (args: { hash: `0x${string}` }) => walletClient.waitForTransactionReceipt(args),
    getCode: (args: { address: `0x${string}` }) => walletClient.getCode(args),
    getAddresses: () => [account.address] as const,
  };

  const facilitator = new x402Facilitator();

  registerExactEvmScheme(facilitator, {
    signer: facilitatorSigner,
    networks: resolveX402CaipNetwork(config),
  });

  return {
    getSupported: async (): Promise<SupportedResponse> => {
      const supported = facilitator.getSupported();

      return {
        ...supported,
        kinds: supported.kinds.map((kind) => ({
          ...kind,
          network: kind.network as `${string}:${string}`,
        })),
      };
    },
    verify: facilitator.verify.bind(facilitator),
    settle: facilitator.settle.bind(facilitator),
  };
}

export function getProtectedSignalHttpServer(): x402HTTPResourceServer {
  if (cachedHttpServer) {
    return cachedHttpServer;
  }

  const config = resolveRuntimeConfig(process.env);
  const facilitator = shouldUseLocalFacilitator(config)
    ? createLocalFacilitator(config)
    : new HTTPFacilitatorClient({
        url: config.payment.facilitatorUrl,
      });

  const server = new x402ResourceServer(facilitator)
    .register(resolveX402CaipNetwork(config), new ExactEvmServerScheme())
    .onAfterSettle(createAfterSettleHook(resolveSignalStore()));

  cachedHttpServer = new x402HTTPResourceServer(server, buildProtectedSignalRouteConfig(config))
    .onProtectedRequest(createProtectedSignalRequestHook(resolveSignalStore()));

  return cachedHttpServer;
}
