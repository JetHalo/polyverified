import type { Pool } from "pg";

import { anchorSignalCommitment } from "@/server/anchor/client";
import { listAgents } from "@/server/agents";
import { fetchBinanceKlines } from "@/server/binance/client";
import { findExistingSignalIdForMarket, getSignalById, listDueSignalsNeedingReveal, listRunnableMarketSnapshots, listSignalsNeedingAnchor, listSignalsNeedingProof, listStoredBinanceCandles, upsertAgentsCatalog, upsertBinanceCandles, upsertMarketSnapshots } from "@/server/db/repository";
import { fetchGammaMarketById, fetchSupportedGammaMarkets } from "@/server/polymarket/client";
import { applyDbRevealPackage, applyDbSignalProofResult, getDbSignalCommitmentWitness, getDbSignalRevealRecord, insertDbSignalProposal, upsertDbSignalAnchor } from "@/server/repository/db-store";
import { runSignalAgent } from "@/server/signals/orchestrate";
import { buildRevealPackage } from "@/server/signals/finalize-signal";
import type { FinalizeSignalResult } from "@/server/signals/finalize-signal";
import type { SignalProposal } from "@/server/signals/create-signal";
import type { CommitmentPayload } from "@/server/zk/commitment";
import { proveAndSubmitSignalReveal } from "@/server/zk/prove-and-submit";
import type { Direction, BinanceCandleInterval, BinanceSymbol, MarketSnapshot, RuntimeConfig, SignalRecord } from "@/server/types";

type Queryable = Pick<Pool, "query">;
const ANCHOR_RETRY_ATTEMPTS = 3;
const ANCHOR_RETRY_DELAY_MS = 500;
const PENDING_ANCHOR_BATCH_SIZE = 2;
const PENDING_PROOF_BATCH_SIZE = 2;

interface SyncSupportedMarketsWorkflowDependencies {
  fetchSupportedMarkets?: typeof fetchSupportedGammaMarkets;
  upsertMarketSnapshots?: typeof upsertMarketSnapshots;
  findExistingSignalIdForMarket?: typeof findExistingSignalIdForMarket;
}

interface RunStoredMarketsWorkflowDependencies {
  listRunnableMarkets?: typeof listRunnableMarketSnapshots;
  upsertAgentsCatalog?: typeof upsertAgentsCatalog;
  insertSignalProposal?: typeof insertDbSignalProposal;
  persistSignalAnchor?: typeof upsertDbSignalAnchor;
  runSignalAgent?: typeof runSignalAgent;
  anchorSignalCommitment?: typeof anchorSignalCommitment;
}

interface RevealDueSignalsWorkflowDependencies {
  fetchSupportedMarkets?: typeof fetchSupportedGammaMarkets;
  fetchMarketById?: typeof fetchGammaMarketById;
  fetchBinanceKlines?: typeof fetchBinanceKlines;
  listStoredBinanceCandles?: typeof listStoredBinanceCandles;
  listDueSignals?: typeof listDueSignalsNeedingReveal;
  upsertMarketSnapshots?: typeof upsertMarketSnapshots;
  findExistingSignalIdForMarket?: typeof findExistingSignalIdForMarket;
  applyRevealPackage?: typeof applyDbRevealPackage;
  buildRevealPackage?: typeof buildRevealPackage;
  getSignalCommitmentWitness?: typeof getDbSignalCommitmentWitness;
  proveAndSubmitSignalReveal?: typeof proveAndSubmitSignalReveal;
}

interface RetryPendingAnchorsWorkflowDependencies {
  listSignalsNeedingAnchor?: typeof listSignalsNeedingAnchor;
  getSignalCommitmentWitness?: typeof getDbSignalCommitmentWitness;
  persistSignalAnchor?: typeof upsertDbSignalAnchor;
  anchorSignalCommitment?: typeof anchorSignalCommitment;
  retryPendingAnchorsWorkflow?: typeof retryPendingAnchorsWorkflow;
}

interface RetrySignalProofWorkflowDependencies {
  getSignalById?: typeof getSignalById;
  getSignalCommitmentWitness?: typeof getDbSignalCommitmentWitness;
  getSignalRevealRecord?: typeof getDbSignalRevealRecord;
  applyProofResult?: typeof applyDbSignalProofResult;
  proveAndSubmitSignalReveal?: typeof proveAndSubmitSignalReveal;
}

interface RetryPendingSignalProofsWorkflowDependencies extends RetrySignalProofWorkflowDependencies {
  listSignalsNeedingProof?: typeof listSignalsNeedingProof;
}

interface RunSignalLifecycleTickDependencies
  extends SyncSupportedMarketsWorkflowDependencies,
    RunStoredMarketsWorkflowDependencies,
    RevealDueSignalsWorkflowDependencies,
    RetryPendingAnchorsWorkflowDependencies,
    RetryPendingSignalProofsWorkflowDependencies {
  syncBinanceCandlesWorkflow?: typeof syncBinanceCandlesWorkflow;
  upsertBinanceCandles?: typeof upsertBinanceCandles;
  syncSupportedMarketsWorkflow?: typeof syncSupportedMarketsWorkflow;
  runStoredMarketsWorkflow?: typeof runStoredMarketsWorkflow;
  retryPendingAnchorsWorkflow?: typeof retryPendingAnchorsWorkflow;
  revealDueSignalsWorkflow?: typeof revealDueSignalsWorkflow;
  retryPendingSignalProofsWorkflow?: typeof retryPendingSignalProofsWorkflow;
}

const BINANCE_SETTLEMENT_KLINE_LIMIT = 48;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toCommitmentPayload(signal: SignalRecord, witness: NonNullable<Awaited<ReturnType<typeof getDbSignalCommitmentWitness>>>): CommitmentPayload {
  return {
    commitmentVersion: witness.commitmentVersion,
    signalIdHash: witness.signalIdHash,
    agentSlugHash: witness.agentSlugHash,
    marketIdHash: witness.marketIdHash,
    directionBit: signal.direction === "Up" ? 1 : 0,
    entryPriceCents: signal.entryPriceCents,
    predictedAtUnix: Math.floor(new Date(signal.predictedAt).getTime() / 1000),
    resolvesAtUnix: Math.floor(new Date(signal.resolvesAt).getTime() / 1000),
    salt: witness.salt,
  };
}

async function attemptAnchorWithRetries(input: {
  config: RuntimeConfig;
  signal: SignalRecord;
  payload: CommitmentPayload;
  anchorCommitment: typeof anchorSignalCommitment;
  existingAnchorTxHash?: string | null;
}) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < ANCHOR_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await input.anchorCommitment({
        config: input.config,
        signal: input.signal,
        payload: input.payload,
        existingAnchorTxHash: input.existingAnchorTxHash,
      });
    } catch (error) {
      lastError = error;

      if (attempt < ANCHOR_RETRY_ATTEMPTS - 1) {
        await sleep(ANCHOR_RETRY_DELAY_MS);
      }
    }
  }

  return {
    signalId: input.signal.signalId,
    commitment: input.signal.commitment,
    anchorStatus: "pending" as const,
    anchorTxHash: input.existingAnchorTxHash ?? null,
    anchorExplorerUrl: input.existingAnchorTxHash
      ? `${input.config.anchor.explorerBaseUrl}${input.existingAnchorTxHash}`
      : null,
    anchorChainId: input.config.anchor.chainId,
    anchorNetwork: input.config.anchor.network,
    anchorContractAddress: input.config.anchor.contractAddress,
    anchoredAt: null,
    error: lastError,
  };
}

export async function syncBinanceCandlesWorkflow(input: {
  db: Queryable;
  config: RuntimeConfig;
  now: Date;
  fetchBinanceKlines?: typeof fetchBinanceKlines;
  upsertBinanceCandles?: typeof upsertBinanceCandles;
}) {
  const fetchBinanceKlinesImpl = input.fetchBinanceKlines ?? fetchBinanceKlines;
  const persistCandles = input.upsertBinanceCandles ?? upsertBinanceCandles;
  const targets: Array<{ symbol: BinanceSymbol; interval: BinanceCandleInterval; limit: number }> = [
    {
      symbol: "BTCUSDT",
      interval: input.config.strategy.binance.backgroundInterval,
      limit: input.config.strategy.binance.backgroundKlineLimit,
    },
    {
      symbol: "BTCUSDT",
      interval: input.config.strategy.binance.triggerInterval,
      limit: input.config.strategy.binance.triggerKlineLimit,
    },
    {
      symbol: "BTCUSDT",
      interval: "1h",
      limit: BINANCE_SETTLEMENT_KLINE_LIMIT,
    },
    {
      symbol: "ETHUSDT",
      interval: input.config.strategy.binance.backgroundInterval,
      limit: input.config.strategy.binance.backgroundKlineLimit,
    },
    {
      symbol: "ETHUSDT",
      interval: input.config.strategy.binance.triggerInterval,
      limit: input.config.strategy.binance.triggerKlineLimit,
    },
    {
      symbol: "ETHUSDT",
      interval: "1h",
      limit: BINANCE_SETTLEMENT_KLINE_LIMIT,
    },
  ];
  const synced: Array<{ symbol: BinanceSymbol; interval: BinanceCandleInterval; candles: number }> = [];
  const errors: Array<{ symbol: BinanceSymbol; interval: BinanceCandleInterval; error: string }> = [];

  for (const target of targets) {
    try {
      const candles = await fetchBinanceKlinesImpl({
        baseUrl: input.config.strategy.binance.baseUrl,
        symbol: target.symbol,
        interval: target.interval,
        limit: target.limit,
        now: input.now,
      });

      await persistCandles(input.db, {
        symbol: target.symbol,
        interval: target.interval,
        candles,
      });

      synced.push({
        symbol: target.symbol,
        interval: target.interval,
        candles: candles.length,
      });
    } catch (error) {
      errors.push({
        symbol: target.symbol,
        interval: target.interval,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    synced,
    errors,
  };
}

export async function syncSupportedMarketsWorkflow(input: {
  db: Queryable;
  baseUrl: string;
} & SyncSupportedMarketsWorkflowDependencies): Promise<{ synced: number; markets: MarketSnapshot[] }> {
  const findExisting = input.findExistingSignalIdForMarket ?? findExistingSignalIdForMarket;
  const fetchMarkets = input.fetchSupportedMarkets ?? fetchSupportedGammaMarkets;
  const persistMarkets = input.upsertMarketSnapshots ?? upsertMarketSnapshots;

  const markets = await fetchMarkets({
    baseUrl: input.baseUrl,
    existingSignalResolver: async (marketId) => findExisting(input.db, marketId),
  });

  await persistMarkets(input.db, markets);

  return {
    synced: markets.length,
    markets,
  };
}

export async function runStoredMarketsWorkflow(input: {
  db: Queryable;
  config: RuntimeConfig;
  now: Date;
  markets?: MarketSnapshot[];
} & RunStoredMarketsWorkflowDependencies) {
  const loadMarkets = input.listRunnableMarkets ?? listRunnableMarketSnapshots;
  const persistAgents = input.upsertAgentsCatalog ?? upsertAgentsCatalog;
  const persistProposal = input.insertSignalProposal ?? insertDbSignalProposal;
  const persistSignalAnchor = input.persistSignalAnchor ?? upsertDbSignalAnchor;
  const runAgent = input.runSignalAgent ?? runSignalAgent;
  const anchorCommitment = input.anchorSignalCommitment ?? anchorSignalCommitment;

  await persistAgents(
    input.db,
    listAgents().map((agent) => ({
      slug: agent.slug,
      marketType: agent.marketType,
      displayName: agent.displayName,
    })),
  );

  const markets = input.markets ?? (await loadMarkets(input.db, input.now));
  const proposals: SignalProposal[] = [];

  for (const market of markets) {
    const proposal = await runAgent({
      db: input.db,
      market,
      config: input.config,
      now: input.now,
    });

    if (!proposal) {
      continue;
    }

    await persistProposal(input.db, proposal);

    if (input.config.anchor.enabled) {
      try {
        const anchorRecord = await anchorCommitment({
          config: input.config,
          signal: proposal.signal,
          payload: proposal.payload,
          existingAnchorTxHash: null,
        });

        await persistSignalAnchor(
          input.db,
          anchorRecord,
          proposal.signal.commitmentHashMode,
        );
      } catch {
        await persistSignalAnchor(
          input.db,
          {
            signalId: proposal.signal.signalId,
            commitment: proposal.signal.commitment,
            anchorStatus: "pending",
            anchorTxHash: null,
            anchorExplorerUrl: null,
            anchorChainId: input.config.anchor.chainId,
            anchorNetwork: input.config.anchor.network,
            anchorContractAddress: input.config.anchor.contractAddress,
            anchoredAt: null,
          },
          proposal.signal.commitmentHashMode,
        );
      }
    }

    proposals.push(proposal);
  }

  return {
    marketsEvaluated: markets.length,
    proposals,
  };
}

export async function retryPendingAnchorsWorkflow(input: {
  db: Queryable;
  config: RuntimeConfig;
  now: Date;
} & RetryPendingAnchorsWorkflowDependencies) {
  const loadSignals = input.listSignalsNeedingAnchor ?? listSignalsNeedingAnchor;
  const loadWitness = input.getSignalCommitmentWitness ?? getDbSignalCommitmentWitness;
  const persistSignalAnchor = input.persistSignalAnchor ?? upsertDbSignalAnchor;
  const anchorCommitment = input.anchorSignalCommitment ?? anchorSignalCommitment;

  if (!input.config.anchor.enabled) {
    return { checked: 0, anchored: 0, pending: 0 };
  }

  const signals = await loadSignals(input.db, input.now);
  const pendingSignals = signals.slice(0, PENDING_ANCHOR_BATCH_SIZE);
  let anchored = 0;
  let pending = 0;

  for (const signal of pendingSignals) {
    const witness = await loadWitness(input.db, signal.signalId);

    if (!witness) {
      pending += 1;
      await persistSignalAnchor(
        input.db,
        {
          signalId: signal.signalId,
          commitment: signal.commitment,
          anchorStatus: "pending",
          anchorTxHash: signal.anchorTxHash ?? null,
          anchorExplorerUrl: signal.anchorExplorerUrl ?? null,
          anchorChainId: input.config.anchor.chainId,
          anchorNetwork: input.config.anchor.network,
          anchorContractAddress: input.config.anchor.contractAddress,
          anchoredAt: null,
        },
        signal.commitmentHashMode,
      );
      continue;
    }

    const payload = toCommitmentPayload(signal, witness);
    const anchorRecord = await attemptAnchorWithRetries({
      config: input.config,
      signal,
      payload,
      anchorCommitment,
      existingAnchorTxHash: signal.anchorTxHash ?? null,
    });

    await persistSignalAnchor(input.db, anchorRecord, signal.commitmentHashMode);

    if (anchorRecord.anchorStatus === "anchored") {
      anchored += 1;
    } else {
      pending += 1;
    }
  }

  return {
    checked: pendingSignals.length,
    anchored,
    pending,
  };
}

export function deriveResolvedDirection(market: MarketSnapshot, now: Date): Direction | null {
  if (now.getTime() < new Date(market.resolvesAt).getTime()) {
    return null;
  }

  if (market.upPriceCents === 100 && market.downPriceCents === 0) {
    return "Up";
  }

  if (market.upPriceCents === 0 && market.downPriceCents === 100) {
    return "Down";
  }

  return null;
}

function resolveHourlyBinanceSymbol(marketType: MarketSnapshot["marketType"]): "BTCUSDT" | "ETHUSDT" | null {
  if (marketType === "BTC Hourly") {
    return "BTCUSDT";
  }

  if (marketType === "ETH Hourly") {
    return "ETHUSDT";
  }

  return null;
}

async function deriveResolvedDirectionFromOfficialSource(input: {
  db: Queryable;
  market: MarketSnapshot;
  now: Date;
  binanceBaseUrl: string;
  fetchBinanceKlinesImpl: typeof fetchBinanceKlines;
  loadStoredBinanceCandlesImpl: typeof listStoredBinanceCandles;
}): Promise<Direction | null> {
  const fallbackDirection = deriveResolvedDirection(input.market, input.now);

  if (fallbackDirection) {
    return fallbackDirection;
  }

  if (input.now.getTime() < new Date(input.market.resolvesAt).getTime()) {
    return null;
  }

  const symbol = resolveHourlyBinanceSymbol(input.market.marketType);

  if (!symbol) {
    return null;
  }

  const resolveMs = new Date(input.market.resolvesAt).getTime();
  const cycleStartMs = resolveMs - 60 * 60 * 1000;
  const storedCandles = await input.loadStoredBinanceCandlesImpl(input.db, {
    symbol,
    interval: "1h",
    from: new Date(cycleStartMs - (2 * 60 * 60 * 1000)),
    to: new Date(resolveMs + (60 * 60 * 1000)),
  });
  const candles = storedCandles.length > 0
    ? storedCandles
    : await input.fetchBinanceKlinesImpl({
        baseUrl: input.binanceBaseUrl,
        symbol,
        interval: "1h",
        limit: BINANCE_SETTLEMENT_KLINE_LIMIT,
        now: input.now,
      });

  const candle = candles.find((candidate) => candidate.openTime === cycleStartMs)
    ?? candles.find((candidate) => candidate.openTime <= cycleStartMs && candidate.closeTime >= resolveMs - 1);

  if (!candle) {
    return null;
  }

  return candle.close >= candle.open ? "Up" : "Down";
}

export async function revealDueSignalsWorkflow(input: {
  db: Queryable;
  config: RuntimeConfig;
  now: Date;
  baseUrl: string;
} & RevealDueSignalsWorkflowDependencies) {
  const findExisting = input.findExistingSignalIdForMarket ?? findExistingSignalIdForMarket;
  const fetchMarkets = input.fetchSupportedMarkets ?? fetchSupportedGammaMarkets;
  const fetchMarketById = input.fetchMarketById ?? fetchGammaMarketById;
  const fetchBinanceKlinesImpl = input.fetchBinanceKlines ?? fetchBinanceKlines;
  const loadStoredBinanceCandlesImpl = input.listStoredBinanceCandles ?? listStoredBinanceCandles;
  const loadDueSignals = input.listDueSignals ?? listDueSignalsNeedingReveal;
  const persistMarkets = input.upsertMarketSnapshots ?? upsertMarketSnapshots;
  const persistReveal = input.applyRevealPackage ?? applyDbRevealPackage;
  const toRevealPackage = input.buildRevealPackage ?? buildRevealPackage;

  const markets = await fetchMarkets({
    baseUrl: input.baseUrl,
    existingSignalResolver: async (marketId) => findExisting(input.db, marketId),
  });
  await persistMarkets(input.db, markets);

  const dueSignals = await loadDueSignals(input.db, input.now);
  const marketsById = new Map(markets.map((market) => [market.marketId, market]));
  const results: FinalizeSignalResult[] = [];
  const skipped: Array<{ signalId: string; reason: string }> = [];

  for (const signal of dueSignals) {
    let market: MarketSnapshot | null | undefined = marketsById.get(signal.marketId);

    if (!market) {
      market = await fetchMarketById({
        baseUrl: input.baseUrl,
        marketId: signal.marketId,
        existingSignalResolver: async (marketId) => findExisting(input.db, marketId),
      });

      if (market) {
        marketsById.set(market.marketId, market);
      }
    }

    if (!market) {
      skipped.push({ signalId: signal.signalId, reason: "market_not_found" });
      continue;
    }

    let finalDirection: Direction | null;

    try {
      finalDirection = await deriveResolvedDirectionFromOfficialSource({
        db: input.db,
        market,
        now: input.now,
        binanceBaseUrl: input.config.strategy.binance.baseUrl,
        fetchBinanceKlinesImpl,
        loadStoredBinanceCandlesImpl,
      });
    } catch (error) {
      skipped.push({
        signalId: signal.signalId,
        reason: `resolution_source_error:${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    if (!finalDirection) {
      skipped.push({ signalId: signal.signalId, reason: "market_not_resolved" });
      continue;
    }

    const result = toRevealPackage({
      signal,
      finalDirection,
      resolvedAt: input.now.toISOString(),
      proofStatus: "revealed",
    });

    await persistReveal(input.db, result);
    results.push(result);
  }

  return {
    syncedMarkets: markets.length,
    results,
    skipped,
  };
}

export async function retryPendingSignalProofsWorkflow(
  input: {
    db: Queryable;
    config: RuntimeConfig;
  } & RetryPendingSignalProofsWorkflowDependencies,
) {
  const loadSignals = input.listSignalsNeedingProof ?? listSignalsNeedingProof;
  const loadSignal = input.getSignalById ?? getSignalById;
  const loadWitness = input.getSignalCommitmentWitness ?? getDbSignalCommitmentWitness;
  const loadRevealRecord = input.getSignalRevealRecord ?? getDbSignalRevealRecord;
  const persistProofResult = input.applyProofResult ?? applyDbSignalProofResult;
  const submitProof = input.proveAndSubmitSignalReveal ?? proveAndSubmitSignalReveal;

  if (!input.config.zk.rpcUrl || !input.config.zk.seedPhrase) {
    return { checked: 0, verified: 0, failed: 0 };
  }

  const signals = await loadSignals(input.db);
  const pendingSignals = signals.slice(0, PENDING_PROOF_BATCH_SIZE);
  let verified = 0;
  let failed = 0;

  for (const candidate of pendingSignals) {
    const signal = await loadSignal(input.db, candidate.signalId);

    if (!signal) {
      continue;
    }

    if (signal.commitmentHashMode !== "poseidon2-field-v1") {
      await persistProofResult(input.db, {
        signalId: signal.signalId,
        proofStatus: "failed",
      });
      failed += 1;
      continue;
    }

    const revealRecord = await loadRevealRecord(input.db, signal.signalId);

    if (!revealRecord) {
      continue;
    }

    const witness = await loadWitness(input.db, signal.signalId);

    if (!witness) {
      await persistProofResult(input.db, {
        signalId: signal.signalId,
        proofStatus: "failed",
      });
      failed += 1;
      continue;
    }

    try {
      const proof = await submitProof({
        config: input.config,
        signal,
        witness,
      });

      await persistProofResult(input.db, {
        signalId: signal.signalId,
        proofId: proof.proofId,
        txHash: proof.txHash,
        proofUrl: proof.proofUrl,
        proofStatus: "verified",
      });
      verified += 1;
    } catch {
      await persistProofResult(input.db, {
        signalId: signal.signalId,
        proofStatus: "failed",
      });
      failed += 1;
    }
  }

  return {
    checked: pendingSignals.length,
    verified,
    failed,
  };
}

export async function retrySignalProofWorkflow(
  input: {
    db: Queryable;
    config: RuntimeConfig;
    signalId: string;
  } & RetrySignalProofWorkflowDependencies,
) {
  const loadSignal = input.getSignalById ?? getSignalById;
  const loadWitness = input.getSignalCommitmentWitness ?? getDbSignalCommitmentWitness;
  const loadRevealRecord = input.getSignalRevealRecord ?? getDbSignalRevealRecord;
  const persistProofResult = input.applyProofResult ?? applyDbSignalProofResult;
  const submitProof = input.proveAndSubmitSignalReveal ?? proveAndSubmitSignalReveal;

  const signal = await loadSignal(input.db, input.signalId);

  if (!signal) {
    throw new Error(`Signal ${input.signalId} was not found`);
  }

  if (signal.commitmentHashMode !== "poseidon2-field-v1") {
    throw new Error(`Signal ${input.signalId} uses unsupported commitment mode ${signal.commitmentHashMode}`);
  }

  const revealRecord = await loadRevealRecord(input.db, input.signalId);

  if (!revealRecord) {
    throw new Error(`Signal ${input.signalId} has not been revealed yet`);
  }

  const witness = await loadWitness(input.db, input.signalId);

  if (!witness) {
    throw new Error(`Signal ${input.signalId} is missing its commitment witness`);
  }

  try {
    const proof = await submitProof({
      config: input.config,
      signal,
      witness,
    });

    await persistProofResult(input.db, {
      signalId: input.signalId,
      proofId: proof.proofId,
      txHash: proof.txHash,
      proofUrl: proof.proofUrl,
      proofStatus: "verified",
    });

    return {
      signalId: input.signalId,
      revealRecord,
      proofId: proof.proofId,
      txHash: proof.txHash,
      proofUrl: proof.proofUrl,
      proofStatus: "verified" as const,
    };
  } catch (error) {
    await persistProofResult(input.db, {
      signalId: input.signalId,
      proofStatus: "failed",
    });

    throw error;
  }
}

export async function runSignalLifecycleTick(input: {
  db: Queryable;
  config: RuntimeConfig;
  now: Date;
  baseUrl: string;
} & RunSignalLifecycleTickDependencies) {
  const syncWorkflow = input.syncSupportedMarketsWorkflow ?? syncSupportedMarketsWorkflow;
  const syncBinanceWorkflow = input.syncBinanceCandlesWorkflow ?? syncBinanceCandlesWorkflow;
  const runWorkflow = input.runStoredMarketsWorkflow ?? runStoredMarketsWorkflow;
  const retryAnchorWorkflow = input.retryPendingAnchorsWorkflow ?? retryPendingAnchorsWorkflow;
  const revealWorkflow = input.revealDueSignalsWorkflow ?? revealDueSignalsWorkflow;
  const retryProofWorkflow = input.retryPendingSignalProofsWorkflow ?? retryPendingSignalProofsWorkflow;

  const sync = await syncWorkflow({
    db: input.db,
    baseUrl: input.baseUrl,
    fetchSupportedMarkets: input.fetchSupportedMarkets,
    upsertMarketSnapshots: input.upsertMarketSnapshots,
    findExistingSignalIdForMarket: input.findExistingSignalIdForMarket,
  });

  const binance = await syncBinanceWorkflow({
    db: input.db,
    config: input.config,
    now: input.now,
    fetchBinanceKlines: input.fetchBinanceKlines,
    upsertBinanceCandles: input.upsertBinanceCandles,
  });

  const run = await runWorkflow({
    db: input.db,
    config: input.config,
    now: input.now,
    listRunnableMarkets: input.listRunnableMarkets,
    upsertAgentsCatalog: input.upsertAgentsCatalog,
    insertSignalProposal: input.insertSignalProposal,
    persistSignalAnchor: input.persistSignalAnchor,
    runSignalAgent: input.runSignalAgent,
    anchorSignalCommitment: input.anchorSignalCommitment,
  });

  const reveal = await revealWorkflow({
    db: input.db,
    config: input.config,
    now: input.now,
    baseUrl: input.baseUrl,
    fetchSupportedMarkets: input.fetchSupportedMarkets,
    fetchBinanceKlines: input.fetchBinanceKlines,
    listStoredBinanceCandles: input.listStoredBinanceCandles,
    listDueSignals: input.listDueSignals,
    upsertMarketSnapshots: input.upsertMarketSnapshots,
    findExistingSignalIdForMarket: input.findExistingSignalIdForMarket,
    applyRevealPackage: input.applyRevealPackage,
    buildRevealPackage: input.buildRevealPackage,
    getSignalCommitmentWitness: input.getSignalCommitmentWitness,
    proveAndSubmitSignalReveal: input.proveAndSubmitSignalReveal,
  });

  const proof = await retryProofWorkflow({
    db: input.db,
    config: input.config,
    listSignalsNeedingProof: input.listSignalsNeedingProof,
    getSignalById: input.getSignalById,
    getSignalCommitmentWitness: input.getSignalCommitmentWitness,
    getSignalRevealRecord: input.getSignalRevealRecord,
    applyProofResult: input.applyProofResult,
    proveAndSubmitSignalReveal: input.proveAndSubmitSignalReveal,
  });

  return {
    sync,
    binance,
    run,
    reveal,
    proof,
  };
}

export async function runAnchorRetryTick(input: {
  db: Queryable;
  config: RuntimeConfig;
  now: Date;
} & RetryPendingAnchorsWorkflowDependencies) {
  const retryAnchorWorkflow = input.retryPendingAnchorsWorkflow ?? retryPendingAnchorsWorkflow;
  const anchor = await retryAnchorWorkflow({
    db: input.db,
    config: input.config,
    now: input.now,
    listSignalsNeedingAnchor: input.listSignalsNeedingAnchor,
    getSignalCommitmentWitness: input.getSignalCommitmentWitness,
    persistSignalAnchor: input.persistSignalAnchor,
    anchorSignalCommitment: input.anchorSignalCommitment,
  });

  return {
    anchor,
  };
}
