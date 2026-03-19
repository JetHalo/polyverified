import { resolveRuntimeConfig } from "@/server/config";
import { resolveSignalStore, type SignalStore } from "@/server/repository/store";
import type { RuntimeConfig } from "@/server/types";
import { normalizeStoredPaymentAmount } from "@/server/x402/access";

const fallbackConfig: RuntimeConfig = {
  databaseUrl: "postgres://demo",
  payment: {
    mode: "single-signal",
    network: "unset",
    token: "USDZ",
    displayAmount: "$1.00",
    tokenAmountAtomic: "1000000",
    tokenAddress: null,
    tokenDecimals: 6,
    eip712Name: null,
    eip712Version: null,
    facilitatorUrl: "https://facilitator.x402.org",
    treasuryAddress: "0xtreasury",
  },
  timing: {
    hourlyOffsetMinutes: 2,
    dailyOffsetMinutes: 5,
  },
  trade: {
    minEntryPriceCents: 10,
    maxEntryPriceCents: 90,
    maxSpreadBps: 500,
    minLiquidityUsd: 1000,
  },
  strategy: {
    binance: {
      baseUrl: "https://api.binance.com",
      backgroundInterval: "5m",
      backgroundKlineLimit: 150,
      triggerInterval: "1m",
      triggerKlineLimit: 60,
    },
    hourly: {
      maxRecentQqeCrossBars: 3,
      triggerLookbackMinutes: 5,
      minExecutionMinutes: 2,
      maxExecutionMinutes: 20,
      minPricingEdgeCents: 8,
      maxContractPriceCents: 72,
      atrPercentIdealMin: 0.002,
      atrPercentIdealMax: 0.018,
      atrPercentAllowedMin: 0.0015,
      atrPercentAllowedMax: 0.022,
      volumeConfirmationRatio: 1.1,
    },
    daily: {
      backgroundLookbackHours: 2,
      backgroundBucketMinutes: 5,
      triggerBucketMinutes: 1,
      triggerLookbackMinutes: 5,
      minBackgroundCandles: 24,
      maxRecentQqeCrossBars: 4,
      minExecutionMinutes: 5,
      maxExecutionMinutes: 45,
      minPricingEdgeCents: 4,
      maxContractPriceCents: 80,
      atrPercentIdealMin: 0.01,
      atrPercentIdealMax: 0.15,
      atrPercentAllowedMin: 0.005,
      atrPercentAllowedMax: 0.22,
      volumeConfirmationRatio: 1.05,
      goldMinLiquidityUsd: 500,
      silverMinLiquidityUsd: 300,
      goldMaxSpreadBps: 900,
      silverMaxSpreadBps: 1200,
    },
    deepseek: {
      enabled: false,
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      timeoutMs: 15000,
    },
  },
  anchor: {
    enabled: false,
    network: "base-sepolia",
    chainId: 84532,
    contractAddress: null,
    explorerBaseUrl: "https://sepolia.basescan.org/tx/",
    rpcUrl: undefined,
    signerPrivateKey: undefined,
  },
  zk: {
    commitmentVersion: 1,
    circuitName: "polymarket_commit_reveal",
    commitmentCircuitName: "polymarket_commitment_hash",
    proofSystem: "ultrahonk",
    verificationMode: "zkverifyjs-non-aggregation",
  },
};

function resolveLibraryConfig(config?: RuntimeConfig) {
  if (config) {
    return config;
  }

  try {
    return resolveRuntimeConfig(process.env);
  } catch {
    return fallbackConfig;
  }
}

export async function getLibraryView(
  walletAddress: string | null,
  options: { store?: SignalStore; config?: RuntimeConfig } = {},
) {
  const store = options.store ?? resolveSignalStore();
  const config = resolveLibraryConfig(options.config);

  if (!walletAddress) {
    return {
      walletAddress: null,
      unlocks: [],
      purchases: [],
      savedProofs: [],
      activity: [],
    };
  }

  const [unlocks, purchases, accessGrants] = await Promise.all([
    store.listLibrarySignals(walletAddress),
    store.listPurchases(walletAddress),
    store.listAccessGrants(walletAddress),
  ]);
  const normalizedPurchases = purchases.map((purchase) => ({
    ...purchase,
    paymentAmount: normalizeStoredPaymentAmount(purchase.paymentAmount, purchase.paymentToken, config.payment),
  }));
  const savedProofs = unlocks.filter((signal) => signal.proofState === "verified" || signal.proofUrl);
  const storedActivity = await store.listUserActivity(walletAddress);
  const activity =
    storedActivity.length > 0
      ? storedActivity.map((item) => ({
          type: item.eventType,
          time: item.createdAt,
          signalId: item.signalId ?? "",
          label: item.signalId ? `${item.eventType}:${item.signalId}` : item.eventType,
        }))
      : [
          ...unlocks.slice(0, 3).map((signal, index) => ({
            type: "opened",
            time: new Date(Date.parse(signal.committedAt) + index * 5 * 60_000).toISOString(),
            signalId: signal.id,
            label: `Opened ${signal.market} signal`,
          })),
          ...normalizedPurchases.slice(0, 3).map((purchase) => ({
            type: "purchased",
            time: purchase.createdAt,
            signalId: purchase.signalId,
            label: `Purchased ${purchase.signalId}`,
          })),
          ...accessGrants.slice(0, 2).map((grant) => ({
            type: "unlocked",
            time: grant.createdAt,
            signalId: grant.signalId,
            label: `Unlocked ${grant.signalId}`,
          })),
        ].sort((left, right) => Date.parse(right.time) - Date.parse(left.time));

  return {
    walletAddress,
    unlocks,
    purchases: normalizedPurchases,
    savedProofs,
    activity,
  };
}
