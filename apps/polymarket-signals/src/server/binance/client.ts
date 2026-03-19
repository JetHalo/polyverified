import type { StrategyCandle } from "@/server/strategy/indicators";

export type BinanceKlineRow = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];

export interface FetchBinanceKlinesInput {
  baseUrl: string;
  symbol: "BTCUSDT" | "ETHUSDT";
  interval: "1m" | "5m";
  limit: number;
  now?: Date;
  fetchImpl?: typeof fetch;
}

function parseKlineRow(row: BinanceKlineRow): StrategyCandle {
  return {
    openTime: row[0],
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
    closeTime: row[6],
    quoteVolume: Number(row[7]),
    trades: row[8],
    takerBuyBaseVolume: Number(row[9]),
    takerBuyQuoteVolume: Number(row[10]),
  };
}

export function normalizeBinanceKlines(rows: BinanceKlineRow[], options: { now?: Date } = {}): StrategyCandle[] {
  const nowMs = options.now?.getTime() ?? Date.now();

  return rows
    .map(parseKlineRow)
    .filter((candle) => candle.closeTime < nowMs)
    .sort((left, right) => left.openTime - right.openTime);
}

function resolveBinanceBaseUrlCandidates(baseUrl: string): string[] {
  const normalized = baseUrl.replace(/\/$/, "");
  const candidates = [
    normalized,
    "https://data-api.binance.vision",
    "https://api-gcp.binance.com",
    "https://api1.binance.com",
    "https://api2.binance.com",
    "https://api3.binance.com",
    "https://api4.binance.com",
  ];

  return [...new Set(candidates)];
}

export async function fetchBinanceKlines(input: FetchBinanceKlinesInput): Promise<StrategyCandle[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const baseUrlCandidates = resolveBinanceBaseUrlCandidates(input.baseUrl);
  let lastError: Error | null = null;

  for (const baseUrl of baseUrlCandidates) {
    const url = new URL("/api/v3/klines", baseUrl);
    url.searchParams.set("symbol", input.symbol);
    url.searchParams.set("interval", input.interval);
    url.searchParams.set("limit", String(input.limit));

    try {
      const response = await fetchImpl(url.toString(), {
        headers: {
          accept: "application/json",
        },
      });

      if (!response.ok) {
        lastError = new Error(`Binance kline request failed with status ${response.status}`);
        continue;
      }

      const payload = await response.json();
      if (!Array.isArray(payload)) {
        throw new Error("Binance kline response must be an array");
      }

      return normalizeBinanceKlines(payload as BinanceKlineRow[], { now: input.now });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("Binance kline request failed");
}
