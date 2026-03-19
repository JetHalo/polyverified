import { resolveRuntimeConfig } from "@/server/config";
import type { RuntimeConfig } from "@/server/types";
import { resolveSignalStore, type SignalStore } from "@/server/repository/store";
import { buildSingleSignalUnlockQuote } from "@/server/x402/access";

const demoConfig: RuntimeConfig = {
  databaseUrl: "postgres://demo",
  payment: {
    mode: "single-signal",
    network: "unset",
    token: "unset",
    displayAmount: "$1.00",
    tokenAmountAtomic: null,
    tokenAddress: null,
    tokenDecimals: null,
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

export function buildUnlockedSignalDetailView(signal: NonNullable<Awaited<ReturnType<SignalStore["getSignalById"]>>>) {
  return {
    signal,
    unlocked: true,
    quote: null,
    premium: {
      direction: signal.direction,
      entryPriceCents: typeof signal.entryPrice === "number" ? Math.round(signal.entryPrice * 100) : null,
      confidence: signal.confidence,
      explanation: signal.explanation,
      outcome: signal.outcome ?? null,
      proofUrl: signal.proofUrl,
    },
  };
}

export async function getSignalDetailView(
  signalId: string,
  walletAddress?: string | null,
  options: { store?: SignalStore; config?: RuntimeConfig } = {},
) {
  const store = options.store ?? resolveSignalStore();
  const signal = await store.getSignalById(signalId);

  if (!signal) {
    return null;
  }

  const unlocked = !signal.isPremium || (await store.hasSignalAccess(walletAddress, signalId));
  const config = options.config ?? resolveReadModelConfig();

  return {
    signal,
    unlocked,
    quote: unlocked ? null : buildSingleSignalUnlockQuote(signalId, config),
    premium: unlocked ? buildUnlockedSignalDetailView(signal).premium : null,
  };
}

function resolveReadModelConfig(): RuntimeConfig {
  try {
    return resolveRuntimeConfig(process.env);
  } catch {
    return demoConfig;
  }
}
