import { normalizeGammaMarket, type GammaMarketLike } from "@/server/polymarket/markets";
import type { MarketSnapshot } from "@/server/types";

export interface FetchSupportedGammaMarketsOptions {
  baseUrl: string;
  clobBaseUrl?: string;
  fetchImpl?: typeof fetch;
  spreadResolver?: (market: GammaMarketLike) => number;
  existingSignalResolver?: (marketId: string) => Promise<string | null>;
  now?: Date;
}

interface ClobBookLevelLike {
  price: string | number;
  size: string | number;
}

interface ClobBookLike {
  asks?: ClobBookLevelLike[] | null;
}

interface ClobOrderbookMetrics {
  askDepthUsd: number;
  bestAskPriceCents: number | null;
}

const DEFAULT_CLOB_BASE_URL = "https://clob.polymarket.com";

interface GammaSeriesEventLike {
  slug?: string | null;
  active?: boolean | null;
  closed?: boolean | null;
  endDate?: string | null;
}

interface GammaSeriesLike {
  slug?: string | null;
  events?: GammaSeriesEventLike[] | null;
}

interface GammaSearchEventLike {
  slug?: string | null;
  title?: string | null;
  active?: boolean | null;
  closed?: boolean | null;
  endDate?: string | null;
}

interface GammaSearchPayload {
  events?: GammaSearchEventLike[] | null;
}

const TARGETED_SERIES_SLUGS = ["btc-up-or-down-hourly", "eth-up-or-down-hourly"] as const;
const TARGETED_SEARCH_QUERIES = ["gold up or down", "silver up or down"] as const;

async function fetchMarketBySlug(input: {
  baseUrl: string;
  clobBaseUrl: string;
  slug: string;
  fetchImpl: typeof fetch;
  spreadResolver: (market: GammaMarketLike) => number;
  existingSignalResolver: (marketId: string) => Promise<string | null>;
}): Promise<MarketSnapshot | null> {
  const response = await input.fetchImpl(
    `${input.baseUrl}/markets?slug=${encodeURIComponent(input.slug)}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch gamma market by slug: ${response.status}`);
  }

  const payload = (await response.json()) as GammaMarketLike[];
  const market = payload[0];

  if (!market) {
    return null;
  }

  return buildNormalizedMarketSnapshot({
    baseUrl: input.baseUrl,
    clobBaseUrl: input.clobBaseUrl,
    fetchImpl: input.fetchImpl,
    market,
    spreadResolver: input.spreadResolver,
    existingSignalResolver: input.existingSignalResolver,
    errorContext: `slug ${input.slug}`,
  });
}

async function buildNormalizedMarketSnapshot(input: {
  baseUrl: string;
  clobBaseUrl: string;
  fetchImpl: typeof fetch;
  market: GammaMarketLike;
  spreadResolver: (market: GammaMarketLike) => number;
  existingSignalResolver: (marketId: string) => Promise<string | null>;
  errorContext: string;
}): Promise<MarketSnapshot | null> {
  const orderbookMetrics = await resolveOrderbookMetrics({
    clobBaseUrl: input.clobBaseUrl,
    fetchImpl: input.fetchImpl,
    market: input.market,
  });

  try {
    return normalizeGammaMarket(input.market, {
      spreadBps: input.spreadResolver(input.market),
      existingSignalId: await input.existingSignalResolver(String(input.market.id)),
      liquidityUsd: orderbookMetrics.liquidityUsd,
      upAskPriceCents: orderbookMetrics.upAskPriceCents,
      downAskPriceCents: orderbookMetrics.downAskPriceCents,
    });
  } catch (error) {
    const detail = {
      id: input.market.id,
      question: input.market.question,
      slug: input.market.slug,
      outcomes: input.market.outcomes,
      outcomePrices: input.market.outcomePrices,
    };
    throw new Error(
      `Failed to normalize gamma market by ${input.errorContext}: ${error instanceof Error ? error.message : String(error)} | ${JSON.stringify(detail)}`,
    );
  }
}

export async function fetchGammaMarketById(input: {
  baseUrl: string;
  marketId: string;
  clobBaseUrl?: string;
  fetchImpl?: typeof fetch;
  spreadResolver?: (market: GammaMarketLike) => number;
  existingSignalResolver?: (marketId: string) => Promise<string | null>;
}): Promise<MarketSnapshot | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const spreadResolver = input.spreadResolver ?? (() => 0);
  const existingSignalResolver = input.existingSignalResolver ?? (async () => null);
  const baseUrl = input.baseUrl.replace(/\/$/, "");
  const clobBaseUrl = (input.clobBaseUrl ?? DEFAULT_CLOB_BASE_URL).replace(/\/$/, "");
  const response = await fetchImpl(`${baseUrl}/markets/${encodeURIComponent(input.marketId)}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch gamma market by id: ${response.status}`);
  }

  const market = (await response.json()) as GammaMarketLike;
  if (!market?.id) {
    return null;
  }

  return buildNormalizedMarketSnapshot({
    baseUrl,
    clobBaseUrl,
    fetchImpl,
    market,
    spreadResolver,
    existingSignalResolver,
    errorContext: `id ${input.marketId}`,
  });
}

async function fetchRecurringSeriesMarkets(input: {
  baseUrl: string;
  clobBaseUrl: string;
  fetchImpl: typeof fetch;
  spreadResolver: (market: GammaMarketLike) => number;
  existingSignalResolver: (marketId: string) => Promise<string | null>;
  now: Date;
}): Promise<MarketSnapshot[]> {
  const snapshots: MarketSnapshot[] = [];

  for (const slug of TARGETED_SERIES_SLUGS) {
    const response = await input.fetchImpl(`${input.baseUrl}/series?slug=${encodeURIComponent(slug)}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch gamma series: ${response.status}`);
    }

    const payload = (await response.json()) as GammaSeriesLike[];
    const series = payload[0];

    if (!series?.events?.length) {
      continue;
    }

    const candidateEvents = [...series.events]
      .filter((event) => event.slug && event.active && !event.closed)
      .sort((left, right) => {
        const leftTime = left.endDate ? new Date(left.endDate).getTime() : 0;
        const rightTime = right.endDate ? new Date(right.endDate).getTime() : 0;
        return leftTime - rightTime;
      });

    for (const event of candidateEvents) {
      if (!event.slug) {
        continue;
      }

      const snapshot = await fetchMarketBySlug({
        baseUrl: input.baseUrl,
        clobBaseUrl: input.clobBaseUrl,
        slug: event.slug,
        fetchImpl: input.fetchImpl,
        spreadResolver: input.spreadResolver,
        existingSignalResolver: input.existingSignalResolver,
      });

      if (snapshot && new Date(snapshot.resolvesAt).getTime() > input.now.getTime()) {
        snapshots.push(snapshot);
        break;
      }
    }
  }

  return snapshots;
}

async function fetchSearchMarkets(input: {
  baseUrl: string;
  clobBaseUrl: string;
  fetchImpl: typeof fetch;
  spreadResolver: (market: GammaMarketLike) => number;
  existingSignalResolver: (marketId: string) => Promise<string | null>;
  now: Date;
}): Promise<MarketSnapshot[]> {
  const snapshots: MarketSnapshot[] = [];

  for (const query of TARGETED_SEARCH_QUERIES) {
    const response = await input.fetchImpl(
      `${input.baseUrl}/public-search?q=${encodeURIComponent(query)}`,
    );

    if (!response.ok) {
      throw new Error(`Failed to search gamma markets: ${response.status}`);
    }

    const payload = (await response.json()) as GammaSearchPayload;
    const candidateEvents = [...(payload.events ?? [])]
      .filter((event) => event.slug && event.active && !event.closed)
      .sort((left, right) => {
        const leftTime = left.endDate ? new Date(left.endDate).getTime() : 0;
        const rightTime = right.endDate ? new Date(right.endDate).getTime() : 0;
        return leftTime - rightTime;
      });

    for (const event of candidateEvents) {
      if (!event.slug) {
        continue;
      }

      const snapshot = await fetchMarketBySlug({
        baseUrl: input.baseUrl,
        clobBaseUrl: input.clobBaseUrl,
        slug: event.slug,
        fetchImpl: input.fetchImpl,
        spreadResolver: input.spreadResolver,
        existingSignalResolver: input.existingSignalResolver,
      });

      if (snapshot && new Date(snapshot.resolvesAt).getTime() > input.now.getTime()) {
        snapshots.push(snapshot);
        break;
      }
    }
  }

  return snapshots;
}

function parseClobTokenIds(value: string | string[] | null | undefined): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }

  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.map((item) => String(item)).filter(Boolean);
}

function parseOutcomeNames(value: string | string[]): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim().toLowerCase());
  }

  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.map((item) => String(item).trim().toLowerCase());
}

function parseNumeric(value: string | number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid numeric value: ${String(value)}`);
  }
  return numeric;
}

function sumAskDepthUsd(book: ClobBookLike): number {
  return (book.asks ?? []).reduce((total, level) => {
    return total + parseNumeric(level.price) * parseNumeric(level.size);
  }, 0);
}

function bestAskPriceCents(book: ClobBookLike): number | null {
  const askPrices = (book.asks ?? []).map((level) => parseNumeric(level.price));

  if (!askPrices.length) {
    return null;
  }

  return Math.round(Math.min(...askPrices) * 100);
}

async function fetchTokenOrderbookMetrics(input: {
  clobBaseUrl: string;
  fetchImpl: typeof fetch;
  tokenId: string;
}): Promise<ClobOrderbookMetrics> {
  const response = await input.fetchImpl(
    `${input.clobBaseUrl}/book?token_id=${encodeURIComponent(input.tokenId)}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch CLOB book: ${response.status}`);
  }

  const payload = (await response.json()) as ClobBookLike;
  return {
    askDepthUsd: sumAskDepthUsd(payload),
    bestAskPriceCents: bestAskPriceCents(payload),
  };
}

async function resolveOrderbookMetrics(input: {
  clobBaseUrl: string;
  fetchImpl: typeof fetch;
  market: GammaMarketLike;
}): Promise<{ liquidityUsd: number | null; upAskPriceCents: number | null; downAskPriceCents: number | null }> {
  const tokenIds = parseClobTokenIds(input.market.clobTokenIds);
  if (!tokenIds.length) {
    return {
      liquidityUsd: null,
      upAskPriceCents: null,
      downAskPriceCents: null,
    };
  }

  try {
    const outcomes = parseOutcomeNames(input.market.outcomes);
    const metrics = await Promise.all(
      tokenIds.map((tokenId) =>
        fetchTokenOrderbookMetrics({
          clobBaseUrl: input.clobBaseUrl,
          fetchImpl: input.fetchImpl,
          tokenId,
        }),
      ),
    );

    const upIndex = outcomes.findIndex((outcome) => outcome === "up");
    const downIndex = outcomes.findIndex((outcome) => outcome === "down");

    return {
      liquidityUsd: Number(metrics.reduce((total, value) => total + value.askDepthUsd, 0).toFixed(4)),
      upAskPriceCents: upIndex >= 0 ? metrics[upIndex]?.bestAskPriceCents ?? null : null,
      downAskPriceCents: downIndex >= 0 ? metrics[downIndex]?.bestAskPriceCents ?? null : null,
    };
  } catch {
    return {
      liquidityUsd: null,
      upAskPriceCents: null,
      downAskPriceCents: null,
    };
  }
}

export async function fetchSupportedGammaMarkets(
  options: FetchSupportedGammaMarketsOptions,
): Promise<MarketSnapshot[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const spreadResolver = options.spreadResolver ?? (() => 0);
  const existingSignalResolver = options.existingSignalResolver ?? (async () => null);
  const now = options.now ?? new Date();
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const clobBaseUrl = (options.clobBaseUrl ?? DEFAULT_CLOB_BASE_URL).replace(/\/$/, "");
  const targetedSnapshots = await fetchRecurringSeriesMarkets({
    baseUrl,
    clobBaseUrl,
    fetchImpl,
    spreadResolver,
    existingSignalResolver,
    now,
  });
  const searchSnapshots = await fetchSearchMarkets({
    baseUrl,
    clobBaseUrl,
    fetchImpl,
    spreadResolver,
    existingSignalResolver,
    now,
  });
  const snapshotsById = new Map<string, MarketSnapshot>(
    targetedSnapshots.map((snapshot) => [snapshot.marketId, snapshot]),
  );
  for (const snapshot of searchSnapshots) {
    snapshotsById.set(snapshot.marketId, snapshot);
  }

  return [...snapshotsById.values()];
}
