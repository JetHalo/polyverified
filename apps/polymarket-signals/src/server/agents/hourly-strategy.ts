import type { AgentRunContext } from "@/server/agents/types";
import { getMarketCycleStart, getMinutesSinceCycleWindowStart } from "@/server/agents/shared";
import { fetchBinanceKlines } from "@/server/binance/client";
import { listStoredBinanceCandles } from "@/server/db/repository";
import { reviewHourlyStrategyWithDeepSeek, type DeepSeekReviewResult } from "@/server/strategy/deepseek";
import { evaluateHourlyStrategy, type HourlyStrategyDecision } from "@/server/strategy/hourly";
import type { StrategyCandle } from "@/server/strategy/indicators";
import type { Direction } from "@/server/types";

export interface HourlyAgentFeatures {
  asset: "BTC" | "ETH";
  symbol: "BTCUSDT" | "ETHUSDT";
  candlesAnalyzed: number;
  analysis: HourlyStrategyDecision;
  review: DeepSeekReviewResult;
  finalDirection: Direction | null;
  finalConfidence: number | null;
  shouldSignal: boolean;
  explanation: string;
  reasonCodes: string[];
}

interface HourlyAgentFeatureDependencies {
  fetchBinanceKlines?: typeof fetchBinanceKlines;
  loadStoredBinanceCandles?: typeof listStoredBinanceCandles;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolvePriceToBeat(
  backgroundSeries: StrategyCandle[],
  triggerSeries: StrategyCandle[],
  cycleStartMs: number,
): number | null {
  const exactTriggerBoundary = triggerSeries.find((candle) => candle.openTime === cycleStartMs);
  if (exactTriggerBoundary) {
    return exactTriggerBoundary.open;
  }

  const spanningTriggerBoundary = triggerSeries.find(
    (candle) => candle.openTime <= cycleStartMs && candle.closeTime >= cycleStartMs,
  );
  if (spanningTriggerBoundary) {
    return spanningTriggerBoundary.open;
  }

  const exactBackgroundBoundary = backgroundSeries.find((candle) => candle.openTime === cycleStartMs);
  if (exactBackgroundBoundary) {
    return exactBackgroundBoundary.open;
  }

  const nearestPostBoundary = triggerSeries.find((candle) => candle.openTime > cycleStartMs);
  if (nearestPostBoundary) {
    return nearestPostBoundary.open;
  }

  return null;
}

export async function buildHourlyAgentFeatures(
  input: AgentRunContext,
  options: { asset: "BTC" | "ETH"; symbol: "BTCUSDT" | "ETHUSDT" },
  dependencies: HourlyAgentFeatureDependencies = {},
): Promise<HourlyAgentFeatures> {
  const cycleStartMs = getMarketCycleStart(input.market.marketType, input.market.opensAt, input.market.resolvesAt).getTime();
  const fetchBinanceKlinesImpl = dependencies.fetchBinanceKlines ?? fetchBinanceKlines;
  const loadStoredBinanceCandlesImpl = dependencies.loadStoredBinanceCandles ?? listStoredBinanceCandles;
  const backgroundWindowStart = new Date(
    cycleStartMs - (input.config.strategy.binance.backgroundKlineLimit * 5 * 60 * 1000),
  );
  const triggerWindowEnd = new Date(
    cycleStartMs + (input.config.strategy.binance.triggerKlineLimit * 60 * 1000),
  );
  const loadSeries = async (interval: "5m" | "1m", limit: number, from: Date, to: Date) => {
    if (input.db) {
      const stored = await loadStoredBinanceCandlesImpl(input.db, {
        symbol: options.symbol,
        interval,
        from,
        to,
      });

      if (stored.length > 0) {
        return stored;
      }
    }

    return fetchBinanceKlinesImpl({
      baseUrl: input.config.strategy.binance.baseUrl,
      symbol: options.symbol,
      interval,
      limit,
      now: input.now,
    });
  };
  const [backgroundSeries, triggerSeries] = await Promise.all([
    loadSeries(
      input.config.strategy.binance.backgroundInterval,
      input.config.strategy.binance.backgroundKlineLimit,
      backgroundWindowStart,
      input.now,
    ),
    loadSeries(
      input.config.strategy.binance.triggerInterval,
      input.config.strategy.binance.triggerKlineLimit,
      new Date(cycleStartMs),
      triggerWindowEnd,
    ),
  ]);

  const backgroundDecisionWindowStartMs = cycleStartMs - (2 * 60 * 60 * 1000);
  const preOpenCandles = backgroundSeries.filter((candle) => candle.closeTime <= cycleStartMs);
  const preOpenDecisionCandles = preOpenCandles.filter((candle) => candle.openTime >= backgroundDecisionWindowStartMs);
  const triggerCandles = triggerSeries
    .filter((candle) => candle.openTime >= cycleStartMs)
    .slice(0, input.config.strategy.hourly.triggerLookbackMinutes);
  const priceToBeat = resolvePriceToBeat(backgroundSeries, triggerSeries, cycleStartMs);
  const minutesSinceOpen = getMinutesSinceCycleWindowStart(
    input.now,
    input.market.marketType,
    input.market.opensAt,
    input.market.resolvesAt,
  );

  const analysis = evaluateHourlyStrategy({
    asset: options.asset,
    backgroundCandles: preOpenCandles,
    backgroundDecisionCandles: preOpenDecisionCandles,
    triggerCandles,
    minutesSinceOpen,
    priceToBeat,
      market: {
        upPriceCents: input.market.upPriceCents,
        downPriceCents: input.market.downPriceCents,
        upAskPriceCents: input.market.upAskPriceCents ?? null,
        downAskPriceCents: input.market.downAskPriceCents ?? null,
        spreadBps: input.market.spreadBps,
        liquidityUsd: input.market.liquidityUsd,
      },
    triggerLookbackMinutes: input.config.strategy.hourly.triggerLookbackMinutes,
    maxRecentQqeCrossBars: input.config.strategy.hourly.maxRecentQqeCrossBars,
    minPricingEdgeCents: input.config.strategy.hourly.minPricingEdgeCents,
    maxContractPriceCents: input.config.strategy.hourly.maxContractPriceCents,
    atrPercentIdealMin: input.config.strategy.hourly.atrPercentIdealMin,
    atrPercentIdealMax: input.config.strategy.hourly.atrPercentIdealMax,
    atrPercentAllowedMin: input.config.strategy.hourly.atrPercentAllowedMin,
    atrPercentAllowedMax: input.config.strategy.hourly.atrPercentAllowedMax,
    volumeConfirmationRatio: input.config.strategy.hourly.volumeConfirmationRatio,
  });

  const review = analysis.ruleDirection
    ? await reviewHourlyStrategyWithDeepSeek({
        marketType: input.market.marketType as "BTC Hourly" | "ETH Hourly",
        direction: analysis.ruleDirection,
        analysis,
        config: input.config,
      })
    : {
        approve: false,
        confidenceDelta: 0,
        riskFlags: ["trigger-window-incomplete"],
        explanation: "Waiting: the post-open 1m trigger window is still forming.",
        source: "fallback" as const,
      };

  const finalDirection = analysis.ruleDirection;
  const finalConfidence = analysis.ruleConfidence === null
    ? null
    : clamp(
        analysis.ruleConfidence
          + review.confidenceDelta
          + (review.approve ? 0 : -0.05),
        0.55,
        0.95,
      );
  const shouldSignal = Boolean(finalDirection && finalConfidence !== null);
  const explanation = shouldSignal
    ? review.explanation
    : "Waiting: the system is still observing the opening trigger candles.";

  return {
    asset: options.asset,
    symbol: options.symbol,
    candlesAnalyzed: preOpenDecisionCandles.length + triggerCandles.length,
    analysis,
    review,
    finalDirection: shouldSignal ? finalDirection : null,
    finalConfidence: shouldSignal ? finalConfidence : null,
    shouldSignal,
    explanation,
    reasonCodes: [
      ...analysis.ruleReasons,
      ...review.riskFlags.map((flag) => `review-${flag}`),
    ],
  };
}
