export interface StrategyCandle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  trades: number;
  takerBuyBaseVolume: number;
  takerBuyQuoteVolume: number;
}

export interface QqeState {
  trend: "bullish" | "bearish" | "neutral";
  crossAge: number | null;
  smoothedRsi: number;
  qqeLine: number;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return sum(values) / values.length;
}

export function calculateEma(values: number[], period: number): number[] {
  if (values.length === 0) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  const result = [values[0] ?? 0];

  for (let index = 1; index < values.length; index += 1) {
    const previous = result[index - 1] ?? values[index - 1] ?? 0;
    const current = values[index] ?? previous;
    result.push(previous + (current - previous) * multiplier);
  }

  return result;
}

export function calculateRsi(values: number[], period: number): number[] {
  if (values.length <= period) {
    return values.map(() => 50);
  }

  const result = new Array<number>(values.length).fill(50);
  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = (values[index] ?? 0) - (values[index - 1] ?? 0);
    if (change >= 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  result[period] = averageLoss === 0 ? 100 : 100 - (100 / (1 + averageGain / averageLoss));

  for (let index = period + 1; index < values.length; index += 1) {
    const change = (values[index] ?? 0) - (values[index - 1] ?? 0);
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    averageGain = ((averageGain * (period - 1)) + gain) / period;
    averageLoss = ((averageLoss * (period - 1)) + loss) / period;
    result[index] = averageLoss === 0 ? 100 : 100 - (100 / (1 + averageGain / averageLoss));
  }

  return result;
}

function trueRange(current: StrategyCandle, previous: StrategyCandle | null): number {
  if (!previous) {
    return current.high - current.low;
  }

  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previous.close),
    Math.abs(current.low - previous.close),
  );
}

export function calculateAtr(candles: StrategyCandle[], period: number): number[] {
  if (candles.length === 0) {
    return [];
  }

  const ranges = candles.map((candle, index) => trueRange(candle, candles[index - 1] ?? null));
  const seedWindow = ranges.slice(0, Math.min(period, ranges.length));
  const result = new Array<number>(candles.length).fill(average(seedWindow));
  const seedIndex = Math.min(period - 1, candles.length - 1);
  let currentAtr = result[seedIndex] ?? 0;

  for (let index = seedIndex + 1; index < candles.length; index += 1) {
    currentAtr = ((currentAtr * (period - 1)) + (ranges[index] ?? currentAtr)) / period;
    result[index] = currentAtr;
  }

  return result;
}

export function calculateDonchian(candles: StrategyCandle[], period: number) {
  const window = candles.slice(-period);
  const upper = Math.max(...window.map((candle) => candle.high));
  const lower = Math.min(...window.map((candle) => candle.low));
  const mid = (upper + lower) / 2;

  return { upper, lower, mid };
}

export function calculateQqeState(closes: number[]): QqeState {
  if (closes.length < 20) {
    return {
      trend: "neutral",
      crossAge: null,
      smoothedRsi: 50,
      qqeLine: 50,
    };
  }

  const rsi = calculateRsi(closes, 14);
  const smoothedRsi = calculateEma(rsi, 5);
  const delta = smoothedRsi.map((value, index) => Math.abs(value - (smoothedRsi[index - 1] ?? value)));
  const dar = calculateEma(calculateEma(delta, 14), 14).map((value) => value * 4.236);
  const longBand = new Array<number>(smoothedRsi.length).fill(50);
  const shortBand = new Array<number>(smoothedRsi.length).fill(50);
  const trends = new Array<"bullish" | "bearish">(smoothedRsi.length).fill("bullish");
  let lastCrossIndex: number | null = null;

  for (let index = 0; index < smoothedRsi.length; index += 1) {
    const currentRsi = smoothedRsi[index] ?? 50;
    const currentTrailing = dar[index] ?? 0;
    const currentLong = currentRsi - currentTrailing;
    const currentShort = currentRsi + currentTrailing;

    if (index === 0) {
      longBand[index] = currentLong;
      shortBand[index] = currentShort;
      continue;
    }

    const previousLong = longBand[index - 1] ?? currentLong;
    const previousShort = shortBand[index - 1] ?? currentShort;
    const previousRsi = smoothedRsi[index - 1] ?? currentRsi;

    longBand[index] = previousRsi > previousLong && currentRsi > previousLong
      ? Math.max(currentLong, previousLong)
      : currentLong;
    shortBand[index] = previousRsi < previousShort && currentRsi < previousShort
      ? Math.min(currentShort, previousShort)
      : currentShort;

    if (currentRsi > previousShort) {
      trends[index] = "bullish";
    } else if (currentRsi < previousLong) {
      trends[index] = "bearish";
    } else {
      trends[index] = trends[index - 1] ?? "bullish";
    }

    if (trends[index] !== (trends[index - 1] ?? trends[index])) {
      lastCrossIndex = index;
    }
  }

  const latestIndex = smoothedRsi.length - 1;
  const latestTrend = trends[latestIndex] ?? "bullish";

  return {
    trend: latestTrend,
    crossAge: lastCrossIndex === null ? null : latestIndex - lastCrossIndex,
    smoothedRsi: smoothedRsi[latestIndex] ?? 50,
    qqeLine: latestTrend === "bullish"
      ? (longBand[latestIndex] ?? smoothedRsi[latestIndex] ?? 50)
      : (shortBand[latestIndex] ?? smoothedRsi[latestIndex] ?? 50),
  };
}
