import type { RuntimeConfig, SignalTimingPolicy, SignalTradePolicy } from "@/server/types";

const DEFAULT_SIGNAL_TIMING_POLICY: SignalTimingPolicy = {
  hourlyOffsetMinutes: 2,
  dailyOffsetMinutes: 5,
};

const DEFAULT_SIGNAL_TRADE_POLICY: SignalTradePolicy = {
  minEntryPriceCents: 10,
  maxEntryPriceCents: 90,
  maxSpreadBps: 500,
  minLiquidityUsd: 1000,
};

const DEFAULT_STRATEGY_CONFIG: RuntimeConfig["strategy"] = {
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
    timeoutMs: 15_000,
  },
};

const DEFAULT_RUNTIME_CONFIG: Omit<RuntimeConfig, "databaseUrl" | "payment"> = {
  timing: DEFAULT_SIGNAL_TIMING_POLICY,
  trade: DEFAULT_SIGNAL_TRADE_POLICY,
  strategy: DEFAULT_STRATEGY_CONFIG,
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

function requireEnv(value: string | undefined, name: string): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`${name} is required`);
  }

  return normalized;
}

export function resolveRuntimeConfig(env: Record<string, string | undefined> = process.env): RuntimeConfig {
  const databaseUrl = requireEnv(env.DATABASE_URL, "DATABASE_URL");
  const treasuryAddress = requireEnv(env.TREASURY_ADDRESS, "TREASURY_ADDRESS");

  return {
    databaseUrl,
    payment: {
      mode: "single-signal",
      network: env.PAYMENT_NETWORK?.trim() || "unset",
      token: env.PAYMENT_TOKEN?.trim() || "unset",
      displayAmount: env.PAYMENT_DISPLAY_AMOUNT?.trim() || "$1.00",
      tokenAmountAtomic: env.PAYMENT_TOKEN_AMOUNT_ATOMIC?.trim() || null,
      tokenAddress: env.PAYMENT_TOKEN_ADDRESS?.trim() || null,
      tokenDecimals: Number.parseInt(env.PAYMENT_TOKEN_DECIMALS?.trim() || "", 10) || null,
      eip712Name: env.PAYMENT_EIP712_NAME?.trim() || null,
      eip712Version: env.PAYMENT_EIP712_VERSION?.trim() || null,
      facilitatorUrl: env.X402_FACILITATOR_URL?.trim() || "https://facilitator.x402.org",
      treasuryAddress,
    },
    timing: DEFAULT_RUNTIME_CONFIG.timing,
    trade: DEFAULT_RUNTIME_CONFIG.trade,
    strategy: {
      binance: {
        baseUrl: env.BINANCE_API_BASE_URL?.trim() || DEFAULT_RUNTIME_CONFIG.strategy.binance.baseUrl,
        backgroundInterval: "5m",
        backgroundKlineLimit: Number.parseInt(env.BINANCE_BACKGROUND_KLINE_LIMIT?.trim() || env.BINANCE_KLINE_LIMIT?.trim() || "", 10)
          || DEFAULT_RUNTIME_CONFIG.strategy.binance.backgroundKlineLimit,
        triggerInterval: "1m",
        triggerKlineLimit: Number.parseInt(env.BINANCE_TRIGGER_KLINE_LIMIT?.trim() || "", 10)
          || DEFAULT_RUNTIME_CONFIG.strategy.binance.triggerKlineLimit,
      },
      hourly: DEFAULT_RUNTIME_CONFIG.strategy.hourly,
      daily: DEFAULT_RUNTIME_CONFIG.strategy.daily,
      deepseek: {
        enabled: env.DEEPSEEK_ENABLED?.trim().toLowerCase() === "true" || Boolean(env.DEEPSEEK_API_KEY?.trim()),
        baseUrl: env.DEEPSEEK_API_BASE_URL?.trim() || DEFAULT_RUNTIME_CONFIG.strategy.deepseek.baseUrl,
        apiKey: env.DEEPSEEK_API_KEY?.trim(),
        model: env.DEEPSEEK_MODEL?.trim() || DEFAULT_RUNTIME_CONFIG.strategy.deepseek.model,
        timeoutMs: Number.parseInt(env.DEEPSEEK_TIMEOUT_MS?.trim() || "", 10) || DEFAULT_RUNTIME_CONFIG.strategy.deepseek.timeoutMs,
      },
    },
    anchor: {
      enabled: env.ANCHOR_ENABLED?.trim().toLowerCase() === "true",
      network: env.ANCHOR_NETWORK?.trim() || DEFAULT_RUNTIME_CONFIG.anchor.network,
      chainId: Number.parseInt(env.ANCHOR_CHAIN_ID?.trim() || "", 10) || DEFAULT_RUNTIME_CONFIG.anchor.chainId,
      contractAddress: env.ANCHOR_CONTRACT_ADDRESS?.trim() || null,
      explorerBaseUrl: env.ANCHOR_EXPLORER_BASE_URL?.trim() || DEFAULT_RUNTIME_CONFIG.anchor.explorerBaseUrl,
      rpcUrl: env.ANCHOR_RPC_URL?.trim(),
      signerPrivateKey: env.ANCHOR_SIGNER_PRIVATE_KEY?.trim() || env.ANCHOR_DEPLOYER_PRIVATE_KEY?.trim(),
    },
    zk: {
      ...DEFAULT_RUNTIME_CONFIG.zk,
      rpcUrl: env.ZKVERIFY_RPC_URL?.trim(),
      seedPhrase: env.ZKVERIFY_SEED?.trim(),
      accountAddress: env.ZKVERIFY_ACCOUNT_ADDRESS?.trim(),
      explorerBaseUrl: env.ZKVERIFY_EXPLORER_BASE_URL?.trim(),
    },
  };
}

export function getSignalTimingPolicy(config: RuntimeConfig): SignalTimingPolicy {
  return config.timing;
}

export function getSignalTradePolicy(config: RuntimeConfig): SignalTradePolicy {
  return config.trade;
}
