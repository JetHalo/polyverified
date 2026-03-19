export type MarketType = "BTC Hourly" | "ETH Hourly" | "Gold Daily" | "Silver Daily";
export type AgentSlug = "btc-hourly" | "eth-hourly" | "gold-daily" | "silver-daily";
export type Direction = "Up" | "Down";
export type SignalProofState = "committed" | "revealed" | "verified" | "failed";
export type CommitmentHashMode = "sha256-decimal-v1" | "poseidon2-field-v1";
export type CommitmentAnchorStatus = "pending" | "anchored" | "failed";

export interface PaymentConfig {
  mode: "single-signal";
  network: string;
  token: string;
  displayAmount: string;
  tokenAmountAtomic: string | null;
  tokenAddress: string | null;
  tokenDecimals: number | null;
  eip712Name: string | null;
  eip712Version: string | null;
  facilitatorUrl: string;
  treasuryAddress: string;
}

export interface SignalTimingPolicy {
  hourlyOffsetMinutes: number;
  dailyOffsetMinutes: number;
}

export interface SignalTradePolicy {
  minEntryPriceCents: number;
  maxEntryPriceCents: number;
  maxSpreadBps: number;
  minLiquidityUsd: number;
}

export interface BinanceConfig {
  baseUrl: string;
  backgroundInterval: "5m";
  backgroundKlineLimit: number;
  triggerInterval: "1m";
  triggerKlineLimit: number;
}

export interface HourlyStrategyPolicy {
  maxRecentQqeCrossBars: number;
  triggerLookbackMinutes: number;
  minExecutionMinutes: number;
  maxExecutionMinutes: number;
  minPricingEdgeCents: number;
  maxContractPriceCents: number;
  atrPercentIdealMin: number;
  atrPercentIdealMax: number;
  atrPercentAllowedMin: number;
  atrPercentAllowedMax: number;
  volumeConfirmationRatio: number;
}

export interface DailyPolymarketStrategyPolicy {
  backgroundLookbackHours: number;
  backgroundBucketMinutes: number;
  triggerBucketMinutes: number;
  triggerLookbackMinutes: number;
  minBackgroundCandles: number;
  maxRecentQqeCrossBars: number;
  minExecutionMinutes: number;
  maxExecutionMinutes: number;
  minPricingEdgeCents: number;
  maxContractPriceCents: number;
  atrPercentIdealMin: number;
  atrPercentIdealMax: number;
  atrPercentAllowedMin: number;
  atrPercentAllowedMax: number;
  volumeConfirmationRatio: number;
  goldMinLiquidityUsd: number;
  silverMinLiquidityUsd: number;
  goldMaxSpreadBps: number;
  silverMaxSpreadBps: number;
}

export interface DeepSeekReviewConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  model: string;
  timeoutMs: number;
}

export interface StrategyConfig {
  binance: BinanceConfig;
  hourly: HourlyStrategyPolicy;
  daily: DailyPolymarketStrategyPolicy;
  deepseek: DeepSeekReviewConfig;
}

export interface ZkConfig {
  commitmentVersion: number;
  circuitName: "polymarket_commit_reveal";
  commitmentCircuitName: "polymarket_commitment_hash";
  proofSystem: "ultrahonk";
  verificationMode: "zkverifyjs-non-aggregation";
  rpcUrl?: string;
  seedPhrase?: string;
  accountAddress?: string;
  explorerBaseUrl?: string;
}

export interface AnchorConfig {
  enabled: boolean;
  network: string;
  chainId: number;
  contractAddress: string | null;
  explorerBaseUrl: string;
  rpcUrl?: string;
  signerPrivateKey?: string;
}

export interface RuntimeConfig {
  databaseUrl: string;
  payment: PaymentConfig;
  timing: SignalTimingPolicy;
  trade: SignalTradePolicy;
  strategy: StrategyConfig;
  anchor: AnchorConfig;
  zk: ZkConfig;
}

export interface MarketSnapshot {
  marketId: string;
  marketType: MarketType;
  opensAt: string;
  resolvesAt: string;
  upPriceCents: number;
  downPriceCents: number;
  upAskPriceCents?: number | null;
  downAskPriceCents?: number | null;
  spreadBps: number;
  liquidityUsd: number;
  existingSignalId: string | null;
}

export interface MarketObservation {
  marketId: string;
  marketType: MarketType;
  observedAt: string;
  upPriceCents: number;
  downPriceCents: number;
  upAskPriceCents?: number | null;
  downAskPriceCents?: number | null;
  spreadBps: number;
  liquidityUsd: number;
}

export interface SignalRecord {
  signalId: string;
  agentSlug: AgentSlug;
  marketId: string;
  marketType: MarketType;
  direction: Direction;
  entryPriceCents: number;
  predictedAt: string;
  resolvesAt: string;
  commitment: string;
  commitmentHashMode: CommitmentHashMode;
  commitmentStatus: SignalProofState;
  isPremium: boolean;
}

export interface CommitmentAnchorRecord {
  signalId: string;
  commitment: string;
  anchorStatus: CommitmentAnchorStatus;
  anchorTxHash: string | null;
  anchorExplorerUrl: string | null;
  anchorChainId: number;
  anchorNetwork: string;
  anchorContractAddress: string | null;
  anchoredAt: string | null;
}

export interface CommitmentWitnessRecord {
  signalId: string;
  signalIdHash: string;
  agentSlugHash: string;
  marketIdHash: string;
  commitmentVersion: number;
  salt: string;
}

export interface SignalRevealRecord {
  signalId: string;
  revealedAt: string;
  outcome: "Hit" | "Miss";
  simulatedPnlCents: number;
  proofState: SignalProofState;
  proofId: string | null;
  txHash: string | null;
  proofUrl: string | null;
}

export interface WalletSessionRecord {
  sessionId: string;
  walletAddress: string;
  chainId: number;
  signature: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface WalletAuthNonceRecord {
  walletAddress: string;
  nonce: string;
  chainId: number;
  message: string;
  expiresAt: string;
  createdAt: string;
}

export interface UserActivityRecord {
  eventId: string;
  walletAddress: string | null;
  signalId: string | null;
  eventType: string;
  eventPayload: Record<string, unknown>;
  createdAt: string;
}
