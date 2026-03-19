import type { MarketObservation } from "@/server/types";
import type { StrategyCandle } from "@/server/strategy/indicators";

interface BuildPolymarketCandlesOptions {
  bucketMinutes: number;
  priceField?: "upPriceCents" | "downPriceCents";
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function buildPolymarketCandles(
  observations: MarketObservation[],
  options: BuildPolymarketCandlesOptions,
): StrategyCandle[] {
  const bucketMs = options.bucketMinutes * 60_000;
  const priceField = options.priceField ?? "upPriceCents";
  const buckets = new Map<number, MarketObservation[]>();

  for (const observation of observations) {
    const observedAtMs = new Date(observation.observedAt).getTime();
    const bucketStart = Math.floor(observedAtMs / bucketMs) * bucketMs;
    const existing = buckets.get(bucketStart) ?? [];
    existing.push(observation);
    buckets.set(bucketStart, existing);
  }

  return [...buckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([bucketStart, points]) => {
      const sorted = [...points].sort(
        (left, right) => new Date(left.observedAt).getTime() - new Date(right.observedAt).getTime(),
      );
      const prices = sorted.map((point) => point[priceField]);
      const liquidity = sorted.map((point) => point.liquidityUsd);
      const close = prices.at(-1) ?? 0;
      const volume = liquidity.reduce((total, value) => total + value, 0);

      return {
        openTime: bucketStart,
        closeTime: bucketStart + bucketMs - 1,
        open: prices[0] ?? close,
        high: Math.max(...prices),
        low: Math.min(...prices),
        close,
        volume,
        quoteVolume: volume * close,
        trades: sorted.length,
        takerBuyBaseVolume: average(liquidity),
        takerBuyQuoteVolume: average(liquidity) * close,
      };
    });
}
