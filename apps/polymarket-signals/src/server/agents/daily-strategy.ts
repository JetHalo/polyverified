import { getPool } from "@/server/db/client";
import { listMarketObservations } from "@/server/db/repository";
import type { AgentRunContext } from "@/server/agents/types";
import { getMarketCycleStart, getMinutesSinceCycleWindowStart } from "@/server/agents/shared";
import { reviewHourlyStrategyWithDeepSeek, type DeepSeekReviewResult } from "@/server/strategy/deepseek";
import { evaluateHourlyStrategy, type HourlyStrategyDecision } from "@/server/strategy/hourly";
import { buildPolymarketCandles } from "@/server/strategy/polymarket-history";
import type { Direction } from "@/server/types";

export interface DailyAgentFeatures {
  asset: "Gold" | "Silver";
  marketType: "Gold Daily" | "Silver Daily";
  analysis: HourlyStrategyDecision;
  review: DeepSeekReviewResult;
  finalDirection: Direction | null;
  finalConfidence: number | null;
  shouldSignal: boolean;
  explanation: string;
  reasonCodes: string[];
  observationsAnalyzed: number;
  backgroundCandlesAnalyzed: number;
  triggerCandlesAnalyzed: number;
  dataSource: "polymarket-history" | "price-bias-fallback";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolvePriceBiasFallback(
  marketType: "Gold Daily" | "Silver Daily",
  upPriceCents: number,
): Direction {
  if (marketType === "Gold Daily") {
    return upPriceCents <= 50 ? "Up" : "Down";
  }

  return upPriceCents <= 47 ? "Up" : "Down";
}

export async function buildDailyAgentFeatures(
  input: AgentRunContext,
  options: { asset: "Gold" | "Silver"; marketType: "Gold Daily" | "Silver Daily" },
): Promise<DailyAgentFeatures> {
  const opensAtMs = getMarketCycleStart(input.market.marketType, input.market.opensAt, input.market.resolvesAt).getTime();
  const backgroundLookbackMs = input.config.strategy.daily.backgroundLookbackHours * 60 * 60 * 1000;
  const from = new Date(opensAtMs - backgroundLookbackMs);
  const pool = getPool(input.config);
  const observations = await listMarketObservations(pool, input.market.marketId, from, input.now);
  const preOpenObservations = observations.filter((observation) => new Date(observation.observedAt).getTime() < opensAtMs);
  const postOpenObservations = observations.filter((observation) => new Date(observation.observedAt).getTime() >= opensAtMs);
  const backgroundCandles = buildPolymarketCandles(preOpenObservations, {
    bucketMinutes: input.config.strategy.daily.backgroundBucketMinutes,
    priceField: "upPriceCents",
  });
  const triggerCandles = buildPolymarketCandles(postOpenObservations, {
    bucketMinutes: input.config.strategy.daily.triggerBucketMinutes,
    priceField: "upPriceCents",
  }).slice(0, input.config.strategy.daily.triggerLookbackMinutes);
  const minutesSinceOpen = getMinutesSinceCycleWindowStart(
    input.now,
    input.market.marketType,
    input.market.opensAt,
    input.market.resolvesAt,
  );

  let analysis: HourlyStrategyDecision;
  let dataSource: DailyAgentFeatures["dataSource"] = "polymarket-history";

  try {
    analysis = evaluateHourlyStrategy({
      asset: options.asset,
      backgroundCandles,
      triggerCandles,
      minutesSinceOpen,
      market: {
        upPriceCents: input.market.upPriceCents,
        downPriceCents: input.market.downPriceCents,
        upAskPriceCents: input.market.upAskPriceCents ?? null,
        downAskPriceCents: input.market.downAskPriceCents ?? null,
        spreadBps: input.market.spreadBps,
        liquidityUsd: input.market.liquidityUsd,
      },
      minBackgroundCandles: input.config.strategy.daily.minBackgroundCandles,
      triggerLookbackMinutes: input.config.strategy.daily.triggerLookbackMinutes,
      maxRecentQqeCrossBars: input.config.strategy.daily.maxRecentQqeCrossBars,
      minPricingEdgeCents: input.config.strategy.daily.minPricingEdgeCents,
      maxContractPriceCents: input.config.strategy.daily.maxContractPriceCents,
      atrPercentIdealMin: input.config.strategy.daily.atrPercentIdealMin,
      atrPercentIdealMax: input.config.strategy.daily.atrPercentIdealMax,
      atrPercentAllowedMin: input.config.strategy.daily.atrPercentAllowedMin,
      atrPercentAllowedMax: input.config.strategy.daily.atrPercentAllowedMax,
      volumeConfirmationRatio: input.config.strategy.daily.volumeConfirmationRatio,
    });
  } catch {
    dataSource = "price-bias-fallback";
    const fallbackDirection = resolvePriceBiasFallback(options.marketType, input.market.upPriceCents);
    const fallbackSelectedPrice = fallbackDirection === "Up"
      ? input.market.upAskPriceCents ?? input.market.upPriceCents
      : input.market.downAskPriceCents ?? input.market.downPriceCents;

    analysis = {
      asset: options.asset,
      priceToBeat: null,
      latestClose: input.market.upPriceCents,
      currentVsPriceToBeat: null,
      currentVsPriceToBeatBps: null,
      currentVsPriceToBeatDirection: null,
      ema20: input.market.upPriceCents,
      ema50: input.market.upPriceCents,
      ema20Slope: 0,
      atrPercent: 0,
      qqeTrend: "neutral",
      qqeCrossAge: null,
      donchianUpper: input.market.upPriceCents,
      donchianLower: input.market.upPriceCents,
      donchianMid: input.market.upPriceCents,
      donchianPosition: 0.5,
      breakoutUp: false,
      breakoutDown: false,
      bullishCandlesLast4: 0,
      bearishCandlesLast4: 0,
      volumeRatio: 1,
      bullishRegime: fallbackDirection === "Up",
      bearishRegime: fallbackDirection === "Down",
      bullishMomentum: fallbackDirection === "Up",
      bearishMomentum: fallbackDirection === "Down",
      bullishStructure: fallbackDirection === "Up",
      bearishStructure: fallbackDirection === "Down",
      bullishPriceToBeat: false,
      bearishPriceToBeat: false,
      bullishTrigger: false,
      bearishTrigger: false,
      volatilityAllowed: true,
      volatilityIdeal: false,
      backgroundDirection: fallbackDirection,
      triggerDirection: null,
      triggerObservationReady: false,
      triggerCandlesAnalyzed: triggerCandles.length,
      usedTrendFallback: true,
      ruleDirection: fallbackDirection,
      ruleConfidence: clamp(0.6 + Math.abs(fallbackSelectedPrice - 50) / 100, 0.6, 0.76),
      selectedContractPriceCents: fallbackSelectedPrice,
      fairValueCents: fallbackSelectedPrice,
      pricingEdgeCents: 0,
      passesPricingGate: true,
      shouldSignal: true,
      ruleReasons: ["polymarket-history-insufficient", fallbackDirection === "Up" ? "price-bias-up" : "price-bias-down"],
    };
  }

  const review = analysis.ruleDirection
    ? await reviewHourlyStrategyWithDeepSeek({
        marketType: options.marketType,
        direction: analysis.ruleDirection,
        analysis,
        config: input.config,
      })
    : {
        approve: false,
        confidenceDelta: 0,
        riskFlags: ["trigger-window-incomplete"],
        explanation: "Waiting: the Polymarket opening trigger window is still forming.",
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
        0.9,
      );
  const shouldSignal = Boolean(finalDirection && finalConfidence !== null);
  const explanation = shouldSignal
    ? review.explanation
    : "Waiting: the Polymarket opening trigger window is still forming.";

  return {
    asset: options.asset,
    marketType: options.marketType,
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
    observationsAnalyzed: observations.length,
    backgroundCandlesAnalyzed: backgroundCandles.length,
    triggerCandlesAnalyzed: triggerCandles.length,
    dataSource,
  };
}
