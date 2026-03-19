import type { MarketSnapshot, MarketType } from "@/server/types";

export interface GammaMarketLike {
  id: string | number;
  question: string;
  slug?: string | null;
  startDate: string;
  endDate: string;
  liquidity?: string | number | null;
  liquidityClob?: string | number | null;
  clobTokenIds?: string | string[] | null;
  outcomes: string | string[];
  outcomePrices: string | string[];
}

export interface MarketRuntimeMetadata {
  spreadBps: number;
  existingSignalId: string | null;
  liquidityUsd?: number | null;
  upAskPriceCents?: number | null;
  downAskPriceCents?: number | null;
}

function normalizeText(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

function isMinuteIntervalMarket(haystack: string): boolean {
  if (/\b(?:1|5|10|15|30)m\b/.test(haystack)) {
    return true;
  }

  if (/\b\d{1,2}:\d{2}(?:am|pm)-\d{1,2}:\d{2}(?:am|pm)\b/.test(haystack)) {
    return true;
  }

  return false;
}

function parseJsonArray(value: string | string[]): string[] {
  if (Array.isArray(value)) {
    return value;
  }

  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error("Expected JSON array");
  }
  return parsed.map((item) => String(item));
}

function parseUsd(value: string | number | null | undefined): number {
  if (value == null) {
    return 0;
  }

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error("Invalid liquidity value");
  }
  return numeric;
}

function resolveLiquidityUsd(market: Pick<GammaMarketLike, "liquidity" | "liquidityClob">): number {
  if (market.liquidityClob != null) {
    return parseUsd(market.liquidityClob);
  }

  return parseUsd(market.liquidity);
}

function parseOutcomePrices(value: string | string[]): number[] {
  const parsed = parseJsonArray(value).map((item) => Math.round(Number(item) * 100));
  if (parsed.some((item) => !Number.isInteger(item))) {
    throw new Error("Invalid outcome price");
  }
  return parsed;
}

function resolveOutcomePrice(outcomes: string[], prices: number[], outcome: "up" | "down"): number {
  const index = outcomes.findIndex((item) => normalizeText(item) === outcome);

  if (index === -1 || prices[index] == null) {
    throw new Error(`Missing ${outcome} outcome price`);
  }

  return prices[index];
}

export function classifySupportedMarket(input: Pick<GammaMarketLike, "question" | "slug">): MarketType | null {
  const question = normalizeText(input.question);
  const slug = normalizeText(input.slug);
  const haystack = `${question} ${slug}`;
  const isMinuteMarket = isMinuteIntervalMarket(haystack);

  if (haystack.includes("bitcoin up or down") && !isMinuteMarket) {
    return "BTC Hourly";
  }

  if (haystack.includes("ethereum up or down") && !isMinuteMarket) {
    return "ETH Hourly";
  }

  if (haystack.includes("gold") && haystack.includes("up or down")) {
    return "Gold Daily";
  }

  if (haystack.includes("silver") && haystack.includes("up or down")) {
    return "Silver Daily";
  }

  return null;
}

export function normalizeGammaMarket(
  market: GammaMarketLike,
  metadata: MarketRuntimeMetadata,
): MarketSnapshot | null {
  const marketType = classifySupportedMarket(market);

  if (!marketType) {
    return null;
  }

  const outcomes = parseJsonArray(market.outcomes).map(normalizeText);
  const prices = parseOutcomePrices(market.outcomePrices);

  return {
    marketId: String(market.id),
    marketType,
    opensAt: market.startDate,
    resolvesAt: market.endDate,
    upPriceCents: resolveOutcomePrice(outcomes, prices, "up"),
    downPriceCents: resolveOutcomePrice(outcomes, prices, "down"),
    upAskPriceCents: metadata.upAskPriceCents ?? null,
    downAskPriceCents: metadata.downAskPriceCents ?? null,
    spreadBps: metadata.spreadBps,
    liquidityUsd: metadata.liquidityUsd ?? resolveLiquidityUsd(market),
    existingSignalId: metadata.existingSignalId,
  };
}
