import type { AgentRunContext } from "@/server/agents/types";
import type { MarketType } from "@/server/types";

function resolveMarketCycleStart(marketType: MarketType, opensAt: string, resolvesAt: string): Date {
  const resolvesAtMs = new Date(resolvesAt).getTime();

  if (marketType.includes("Hourly")) {
    return new Date(resolvesAtMs - 60 * 60 * 1000);
  }

  if (marketType.includes("Daily")) {
    return new Date(resolvesAtMs - 24 * 60 * 60 * 1000);
  }

  return new Date(opensAt);
}

function minutesSinceCycleStart(now: Date, marketType: MarketType, opensAt: string, resolvesAt: string): number {
  return (now.getTime() - resolveMarketCycleStart(marketType, opensAt, resolvesAt).getTime()) / 60_000;
}

export function getMinutesSinceOpen(now: Date, opensAt: string): number {
  return (now.getTime() - new Date(opensAt).getTime()) / 60_000;
}

export function getMarketCycleStart(marketType: MarketType, opensAt: string, resolvesAt: string): Date {
  return resolveMarketCycleStart(marketType, opensAt, resolvesAt);
}

export function getMinutesSinceCycleWindowStart(now: Date, marketType: MarketType, opensAt: string, resolvesAt: string): number {
  return minutesSinceCycleStart(now, marketType, opensAt, resolvesAt);
}

export function passesBaselineWindow(input: AgentRunContext, marketType: MarketType): boolean {
  const minutesOpen = minutesSinceCycleStart(input.now, marketType, input.market.opensAt, input.market.resolvesAt);
  const expectedOffset = marketType.includes("Hourly")
    ? input.config.timing.hourlyOffsetMinutes
    : input.config.timing.dailyOffsetMinutes;

  if (minutesOpen < expectedOffset) {
    return false;
  }

  return input.now.getTime() < new Date(input.market.resolvesAt).getTime();
}

export function passesHourlyExecutionWindow(input: AgentRunContext): boolean {
  const minutesOpen = minutesSinceCycleStart(
    input.now,
    input.market.marketType,
    input.market.opensAt,
    input.market.resolvesAt,
  );
  const { minExecutionMinutes, maxExecutionMinutes } = input.config.strategy.hourly;

  if (minutesOpen < minExecutionMinutes || minutesOpen > maxExecutionMinutes) {
    return false;
  }

  return input.now.getTime() < new Date(input.market.resolvesAt).getTime();
}

export function passesDailyExecutionWindow(input: AgentRunContext): boolean {
  const minutesOpen = minutesSinceCycleStart(
    input.now,
    input.market.marketType,
    input.market.opensAt,
    input.market.resolvesAt,
  );
  const { minExecutionMinutes, maxExecutionMinutes } = input.config.strategy.daily;

  if (minutesOpen < minExecutionMinutes || minutesOpen > maxExecutionMinutes) {
    return false;
  }

  return input.now.getTime() < new Date(input.market.resolvesAt).getTime();
}

export function passesTradeFilters(input: AgentRunContext): boolean {
  const { minEntryPriceCents, maxEntryPriceCents, maxSpreadBps, minLiquidityUsd } = input.config.trade;
  const {
    upPriceCents,
    downPriceCents,
    upAskPriceCents,
    downAskPriceCents,
    spreadBps,
    liquidityUsd,
    existingSignalId,
  } = input.market;
  const upTradablePriceCents = upAskPriceCents ?? upPriceCents;
  const downTradablePriceCents = downAskPriceCents ?? downPriceCents;

  if (existingSignalId) {
    return false;
  }

  if (upTradablePriceCents < minEntryPriceCents || upTradablePriceCents > maxEntryPriceCents) {
    return false;
  }

  if (downTradablePriceCents < minEntryPriceCents || downTradablePriceCents > maxEntryPriceCents) {
    return false;
  }

  if (spreadBps > maxSpreadBps) {
    return false;
  }

  if (liquidityUsd < minLiquidityUsd) {
    return false;
  }

  return true;
}

export function passesMarketQualityFilters(
  input: AgentRunContext,
  overrides?: { maxSpreadBps?: number; minLiquidityUsd?: number },
): boolean {
  const maxSpreadBps = overrides?.maxSpreadBps ?? input.config.trade.maxSpreadBps;
  const minLiquidityUsd = overrides?.minLiquidityUsd ?? input.config.trade.minLiquidityUsd;
  const { spreadBps, liquidityUsd, existingSignalId } = input.market;

  if (existingSignalId) {
    return false;
  }

  if (spreadBps > maxSpreadBps) {
    return false;
  }

  if (liquidityUsd < minLiquidityUsd) {
    return false;
  }

  return true;
}

export function baselineConfidence(probabilityCents: number): number {
  const distanceFromMid = Math.abs(probabilityCents - 50);

  return Math.min(0.95, Number((0.5 + distanceFromMid / 100).toFixed(2)));
}
