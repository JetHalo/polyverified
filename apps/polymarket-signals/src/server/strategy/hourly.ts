import type { Direction } from "@/server/types";
import { average, calculateAtr, calculateDonchian, calculateEma, calculateQqeState, type StrategyCandle } from "@/server/strategy/indicators";

export interface HourlyStrategyMarketContext {
  upPriceCents: number;
  downPriceCents: number;
  upAskPriceCents?: number | null;
  downAskPriceCents?: number | null;
  spreadBps: number;
  liquidityUsd: number;
}

export interface HourlyStrategyDecision {
  asset: string;
  priceToBeat: number | null;
  latestClose: number;
  currentVsPriceToBeat: number | null;
  currentVsPriceToBeatBps: number | null;
  currentVsPriceToBeatDirection: Direction | null;
  ema20: number;
  ema50: number;
  ema20Slope: number;
  atrPercent: number;
  qqeTrend: "bullish" | "bearish" | "neutral";
  qqeCrossAge: number | null;
  donchianUpper: number;
  donchianLower: number;
  donchianMid: number;
  donchianPosition: number;
  breakoutUp: boolean;
  breakoutDown: boolean;
  bullishCandlesLast4: number;
  bearishCandlesLast4: number;
  volumeRatio: number;
  bullishRegime: boolean;
  bearishRegime: boolean;
  bullishMomentum: boolean;
  bearishMomentum: boolean;
  bullishStructure: boolean;
  bearishStructure: boolean;
  bullishPriceToBeat: boolean;
  bearishPriceToBeat: boolean;
  bullishTrigger: boolean;
  bearishTrigger: boolean;
  volatilityAllowed: boolean;
  volatilityIdeal: boolean;
  backgroundDirection: Direction;
  triggerDirection: Direction | null;
  triggerObservationReady: boolean;
  triggerCandlesAnalyzed: number;
  usedTrendFallback: boolean;
  ruleDirection: Direction | null;
  ruleConfidence: number | null;
  selectedContractPriceCents: number | null;
  fairValueCents: number | null;
  pricingEdgeCents: number | null;
  passesPricingGate: boolean;
  shouldSignal: boolean;
  ruleReasons: string[];
}

export interface EvaluateHourlyStrategyInput {
  asset: string;
  backgroundCandles: StrategyCandle[];
  backgroundDecisionCandles?: StrategyCandle[];
  triggerCandles: StrategyCandle[];
  minutesSinceOpen: number;
  priceToBeat?: number | null;
  market: HourlyStrategyMarketContext;
  minBackgroundCandles?: number;
  triggerLookbackMinutes?: number;
  maxRecentQqeCrossBars?: number;
  minPricingEdgeCents?: number;
  maxContractPriceCents?: number;
  atrPercentIdealMin?: number;
  atrPercentIdealMax?: number;
  atrPercentAllowedMin?: number;
  atrPercentAllowedMax?: number;
  volumeConfirmationRatio?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function countDirectionalCandles(candles: StrategyCandle[], direction: "up" | "down"): number {
  return candles.reduce((count, candle) => {
    if (direction === "up") {
      return candle.close > candle.open ? count + 1 : count;
    }

    return candle.close < candle.open ? count + 1 : count;
  }, 0);
}

function resolveBackgroundDirection(input: {
  bullishRegime: boolean;
  bearishRegime: boolean;
  bullishMomentum: boolean;
  bearishMomentum: boolean;
  bullishStructure: boolean;
  bearishStructure: boolean;
  latestClose: number;
  donchianMid: number;
}): Direction {
  if (input.bullishRegime && !input.bearishRegime) {
    return "Up";
  }

  if (input.bearishRegime && !input.bullishRegime) {
    return "Down";
  }

  if (input.bullishMomentum && !input.bearishMomentum) {
    return "Up";
  }

  if (input.bearishMomentum && !input.bullishMomentum) {
    return "Down";
  }

  if (input.bullishStructure && !input.bearishStructure) {
    return "Up";
  }

  if (input.bearishStructure && !input.bullishStructure) {
    return "Down";
  }

  return input.latestClose >= input.donchianMid ? "Up" : "Down";
}

function computeConfidence(input: {
  usedTrendFallback: boolean;
  recentQqeCross: boolean;
  breakout: boolean;
  volumeConfirmed: boolean;
  volatilityIdeal: boolean;
  donchianExtreme: boolean;
}): number {
  const base = input.usedTrendFallback ? 0.62 : 0.74;

  return clamp(
    base
      + (input.recentQqeCross ? 0.03 : 0)
      + (input.breakout ? 0.05 : 0)
      + (input.volumeConfirmed ? 0.04 : 0)
      + (input.volatilityIdeal ? 0.03 : 0)
      + (input.donchianExtreme ? 0.03 : 0),
    input.usedTrendFallback ? 0.6 : 0.72,
    input.usedTrendFallback ? 0.82 : 0.9,
  );
}

export function evaluateHourlyStrategy(input: EvaluateHourlyStrategyInput): HourlyStrategyDecision {
  const minBackgroundCandles = input.minBackgroundCandles ?? 24;
  const decisionCandles = input.backgroundDecisionCandles ?? input.backgroundCandles;

  if (decisionCandles.length < minBackgroundCandles) {
    throw new Error(`Not enough background candles to evaluate ${input.asset} hourly strategy`);
  }

  const triggerLookbackMinutes = input.triggerLookbackMinutes ?? 5;
  const maxRecentQqeCrossBars = input.maxRecentQqeCrossBars ?? 3;
  const minPricingEdgeCents = input.minPricingEdgeCents ?? 8;
  const maxContractPriceCents = input.maxContractPriceCents ?? 72;
  const atrPercentIdealMin = input.atrPercentIdealMin ?? 0.002;
  const atrPercentIdealMax = input.atrPercentIdealMax ?? 0.018;
  const atrPercentAllowedMin = input.atrPercentAllowedMin ?? 0.0015;
  const atrPercentAllowedMax = input.atrPercentAllowedMax ?? 0.022;
  const volumeConfirmationRatio = input.volumeConfirmationRatio ?? 1.1;

  const backgroundCloses = input.backgroundCandles.map((candle) => candle.close);
  const ema20Series = calculateEma(backgroundCloses, 20);
  const ema50Series = calculateEma(backgroundCloses, 50);
  const atrSeries = calculateAtr(input.backgroundCandles, 14);
  const qqe = calculateQqeState(backgroundCloses);
  const backgroundIndex = input.backgroundCandles.length - 1;
  const backgroundLatest = decisionCandles.at(-1) ?? input.backgroundCandles[backgroundIndex]!;
  const backgroundClose = backgroundLatest.close;
  const ema20 = ema20Series[backgroundIndex] ?? backgroundClose;
  const ema50 = ema50Series[backgroundIndex] ?? backgroundClose;
  const ema20Slope = ema20 - (ema20Series[Math.max(0, backgroundIndex - 3)] ?? ema20);
  const atr = atrSeries[backgroundIndex] ?? 0;
  const atrPercent = backgroundClose === 0 ? 0 : atr / backgroundClose;
  const donchian = calculateDonchian(decisionCandles, 20);
  const donchianWidth = Math.max(donchian.upper - donchian.lower, 0.000001);
  const donchianPosition = clamp((backgroundClose - donchian.lower) / donchianWidth, 0, 1);
  const bullishRegime = ema20 > ema50 && ema20Slope > 0;
  const bearishRegime = ema20 < ema50 && ema20Slope < 0;
  const bullishMomentum = qqe.trend === "bullish";
  const bearishMomentum = qqe.trend === "bearish";
  const bullishStructure = backgroundClose > donchian.mid;
  const bearishStructure = backgroundClose < donchian.mid;
  const volatilityAllowed = atrPercent >= atrPercentAllowedMin && atrPercent <= atrPercentAllowedMax;
  const volatilityIdeal = atrPercent >= atrPercentIdealMin && atrPercent <= atrPercentIdealMax;
  const recentQqeCross = qqe.crossAge !== null && qqe.crossAge <= maxRecentQqeCrossBars;
  const backgroundDirection = resolveBackgroundDirection({
    bullishRegime,
    bearishRegime,
    bullishMomentum,
    bearishMomentum,
    bullishStructure,
    bearishStructure,
    latestClose: backgroundClose,
    donchianMid: donchian.mid,
  });

  const triggerWindow = input.triggerCandles.slice(0, triggerLookbackMinutes);
  const triggerObservationReady = input.minutesSinceOpen >= triggerLookbackMinutes || triggerWindow.length >= triggerLookbackMinutes;
  const triggerLatest = triggerWindow.at(-1) ?? backgroundLatest;
  const triggerLatestClose = triggerLatest.close;
  const priceToBeat = input.priceToBeat ?? null;
  const currentVsPriceToBeat = priceToBeat === null ? null : Number((triggerLatestClose - priceToBeat).toFixed(4));
  const currentVsPriceToBeatBps = priceToBeat === null || priceToBeat === 0
    ? null
    : Math.round(((triggerLatestClose - priceToBeat) / priceToBeat) * 10_000);
  const bullishPriceToBeat = priceToBeat !== null && triggerLatestClose > priceToBeat;
  const bearishPriceToBeat = priceToBeat !== null && triggerLatestClose < priceToBeat;
  const currentVsPriceToBeatDirection: Direction | null = bullishPriceToBeat
    ? "Up"
    : bearishPriceToBeat
      ? "Down"
      : null;
  const bullishCandlesLast4 = countDirectionalCandles(triggerWindow.slice(-4), "up");
  const bearishCandlesLast4 = countDirectionalCandles(triggerWindow.slice(-4), "down");
  const triggerVolumes = triggerWindow.map((candle) => candle.volume);
  const triggerVolumeBaseline = average(triggerVolumes.slice(0, -1));
  const volumeRatio = triggerVolumeBaseline === 0 ? 1 : triggerLatest.volume / triggerVolumeBaseline;
  const bullishVolumeConfirmation = volumeRatio >= volumeConfirmationRatio && triggerLatest.close > triggerLatest.open;
  const bearishVolumeConfirmation = volumeRatio >= volumeConfirmationRatio && triggerLatest.close < triggerLatest.open;
  const priorTriggerCandles = triggerWindow.slice(0, -1);
  const priorTriggerHigh = priorTriggerCandles.length > 0
    ? Math.max(...priorTriggerCandles.map((candle) => candle.high))
    : triggerLatest.high;
  const priorTriggerLow = priorTriggerCandles.length > 0
    ? Math.min(...priorTriggerCandles.map((candle) => candle.low))
    : triggerLatest.low;
  const triggerHigh = triggerWindow.length > 0
    ? Math.max(...triggerWindow.map((candle) => candle.high))
    : backgroundLatest.high;
  const triggerLow = triggerWindow.length > 0
    ? Math.min(...triggerWindow.map((candle) => candle.low))
    : backgroundLatest.low;
  const triggerMid = (triggerHigh + triggerLow) / 2;
  const breakoutUp = priorTriggerCandles.length > 0 && triggerLatestClose > priorTriggerHigh;
  const breakoutDown = priorTriggerCandles.length > 0 && triggerLatestClose < priorTriggerLow;
  const bullishTrigger = triggerObservationReady
    && backgroundDirection === "Up"
    && (priceToBeat === null || bullishPriceToBeat)
    && triggerWindow.length >= 2
    && triggerLatestClose > triggerMid
    && (breakoutUp || bullishCandlesLast4 >= 3 || (bullishCandlesLast4 >= 2 && bullishVolumeConfirmation));
  const bearishTrigger = triggerObservationReady
    && backgroundDirection === "Down"
    && (priceToBeat === null || bearishPriceToBeat)
    && triggerWindow.length >= 2
    && triggerLatestClose < triggerMid
    && (breakoutDown || bearishCandlesLast4 >= 3 || (bearishCandlesLast4 >= 2 && bearishVolumeConfirmation));
  const triggerDirection = bullishTrigger ? "Up" : bearishTrigger ? "Down" : null;

  let ruleDirection: Direction | null = null;
  let usedTrendFallback = false;
  let ruleReasons: string[] = [];

  if (triggerDirection) {
    ruleDirection = triggerDirection;
    ruleReasons = [
      backgroundDirection === "Up" ? "background-bias-up" : "background-bias-down",
      backgroundDirection === "Up" ? "ema-regime-bullish" : "ema-regime-bearish",
      backgroundDirection === "Up" ? "qqe-momentum-bullish" : "qqe-momentum-bearish",
      backgroundDirection === "Up" ? "donchian-structure-bullish" : "donchian-structure-bearish",
      triggerDirection === "Up"
        ? (breakoutUp ? "post-open-breakout-up" : "post-open-impulse-up")
        : (breakoutDown ? "post-open-breakout-down" : "post-open-impulse-down"),
      volatilityIdeal ? "atr-ideal" : "atr-allowed",
      triggerDirection === "Up"
        ? (bullishVolumeConfirmation ? "volume-confirms-up" : "volume-neutral")
        : (bearishVolumeConfirmation ? "volume-confirms-down" : "volume-neutral"),
      priceToBeat === null
        ? "price-to-beat-unavailable"
        : (triggerDirection === "Up" ? "price-to-beat-cleared-up" : "price-to-beat-cleared-down"),
    ];
  } else if (triggerObservationReady && volatilityAllowed) {
    ruleDirection = backgroundDirection;
    usedTrendFallback = true;
    ruleReasons = [
      backgroundDirection === "Up" ? "background-bias-up" : "background-bias-down",
      backgroundDirection === "Up" ? "ema-regime-bullish" : "ema-regime-bearish",
      backgroundDirection === "Up" ? "qqe-momentum-bullish" : "qqe-momentum-bearish",
      backgroundDirection === "Up" ? "donchian-structure-bullish" : "donchian-structure-bearish",
      "trigger-window-no-confirmation",
      volatilityIdeal ? "atr-ideal" : "atr-allowed",
      "fallback-to-trend",
      priceToBeat === null
        ? "price-to-beat-unavailable"
        : currentVsPriceToBeatDirection === backgroundDirection
          ? "price-to-beat-aligned-with-trend"
          : currentVsPriceToBeatDirection === null
            ? "price-to-beat-flat"
            : "price-to-beat-opposes-trend",
    ];
  }

  const ruleConfidence = ruleDirection === null
    ? null
    : computeConfidence({
        usedTrendFallback,
        recentQqeCross,
        breakout: ruleDirection === "Up" ? breakoutUp : breakoutDown,
        volumeConfirmed: ruleDirection === "Up" ? bullishVolumeConfirmation : bearishVolumeConfirmation,
        volatilityIdeal,
        donchianExtreme: ruleDirection === "Up" ? donchianPosition >= 0.8 : donchianPosition <= 0.2,
      });
  const adjustedRuleConfidence = ruleConfidence === null
    ? null
    : clamp(
        ruleConfidence
          + (priceToBeat === null ? 0 : 0)
          + (
            ruleDirection === null || currentVsPriceToBeatDirection === null
              ? 0
              : currentVsPriceToBeatDirection === ruleDirection
                ? 0.03
                : usedTrendFallback
                  ? -0.08
                  : -0.05
          ),
        usedTrendFallback ? 0.55 : 0.68,
        usedTrendFallback ? 0.84 : 0.92,
      );

  const selectedContractPriceCents = ruleDirection === null
    ? null
    : ruleDirection === "Up"
      ? input.market.upAskPriceCents ?? input.market.upPriceCents
      : input.market.downAskPriceCents ?? input.market.downPriceCents;
  const fairValueCents = adjustedRuleConfidence === null ? null : Math.round(adjustedRuleConfidence * 100);
  const pricingEdgeCents = selectedContractPriceCents === null || fairValueCents === null
    ? null
    : fairValueCents - selectedContractPriceCents;
  const passesPricingGate = Boolean(
    ruleDirection &&
    selectedContractPriceCents !== null &&
    fairValueCents !== null &&
    pricingEdgeCents !== null &&
    selectedContractPriceCents <= maxContractPriceCents &&
    pricingEdgeCents >= minPricingEdgeCents
  );

  return {
    asset: input.asset,
    priceToBeat,
    latestClose: triggerWindow.length > 0 ? triggerLatestClose : backgroundClose,
    currentVsPriceToBeat,
    currentVsPriceToBeatBps,
    currentVsPriceToBeatDirection,
    ema20,
    ema50,
    ema20Slope,
    atrPercent,
    qqeTrend: qqe.trend,
    qqeCrossAge: qqe.crossAge,
    donchianUpper: donchian.upper,
    donchianLower: donchian.lower,
    donchianMid: donchian.mid,
    donchianPosition,
    breakoutUp,
    breakoutDown,
    bullishCandlesLast4,
    bearishCandlesLast4,
    volumeRatio,
    bullishRegime,
    bearishRegime,
    bullishMomentum,
    bearishMomentum,
    bullishStructure,
    bearishStructure,
    bullishPriceToBeat,
    bearishPriceToBeat,
    bullishTrigger,
    bearishTrigger,
    volatilityAllowed,
    volatilityIdeal,
    backgroundDirection,
    triggerDirection,
    triggerObservationReady,
    triggerCandlesAnalyzed: triggerWindow.length,
    usedTrendFallback,
    ruleDirection,
    ruleConfidence: adjustedRuleConfidence,
    selectedContractPriceCents,
    fairValueCents,
    pricingEdgeCents,
    passesPricingGate,
    shouldSignal: Boolean(ruleDirection),
    ruleReasons,
  };
}
