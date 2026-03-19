import type { RuntimeConfig, Direction, MarketType } from "@/server/types";
import type { HourlyStrategyDecision } from "@/server/strategy/hourly";

export interface DeepSeekReviewResult {
  approve: boolean;
  confidenceDelta: number;
  riskFlags: string[];
  explanation: string;
  source: "deepseek" | "fallback";
}

export interface ReviewHourlyStrategyInput {
  marketType: MarketType;
  direction: Direction;
  analysis: HourlyStrategyDecision;
  config: RuntimeConfig;
  fetchImpl?: typeof fetch;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatSignedNumber(value: number, digits = 2): string {
  const absolute = Math.abs(value).toFixed(digits);
  return value > 0 ? `+${absolute}` : value < 0 ? `-${absolute}` : absolute;
}

function formatMaybePrice(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return value >= 1000 ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value.toFixed(2);
}

function buildReviewSummary(analysis: HourlyStrategyDecision) {
  const direction = analysis.ruleDirection === "Up" ? "upside" : analysis.ruleDirection === "Down" ? "downside" : "neutral";
  const regime = analysis.backgroundDirection === "Up"
    ? "the pre-open regime stayed bullish with EMA20 above EMA50 and a positive slope"
    : "the pre-open regime stayed bearish with EMA20 below EMA50 and a negative slope";
  const momentum = analysis.qqeTrend === "bullish"
    ? "QQE momentum is still pointing higher"
    : analysis.qqeTrend === "bearish"
      ? "QQE momentum is still pointing lower"
      : "QQE momentum has flattened out";
  const structure = analysis.backgroundDirection === "Up"
    ? "price held above the Donchian midline into the open"
    : "price held below the Donchian midline into the open";
  const trigger = analysis.usedTrendFallback
    ? "the opening tape did not print a clean trigger, so the call is falling back to the broader trend bias"
    : analysis.triggerDirection === "Up"
      ? "the opening tape printed a clean upside trigger"
      : analysis.triggerDirection === "Down"
        ? "the opening tape printed a clean downside trigger"
        : "the opening tape is still inconclusive";
  const priceToBeat = analysis.priceToBeat === null
    ? "hourly price-to-beat was unavailable"
    : analysis.currentVsPriceToBeatDirection === "Up"
      ? `current price is above the hourly price-to-beat by ${formatSignedNumber(analysis.currentVsPriceToBeat ?? 0)}`
      : analysis.currentVsPriceToBeatDirection === "Down"
        ? `current price is below the hourly price-to-beat by ${formatSignedNumber(analysis.currentVsPriceToBeat ?? 0)}`
        : "current price is sitting right on the hourly price-to-beat";
  const pricing = analysis.selectedContractPriceCents === null
    ? "entry pricing is unavailable"
    : analysis.pricingEdgeCents === null
      ? `current ask is ${analysis.selectedContractPriceCents}c`
      : `current ask is ${analysis.selectedContractPriceCents}c versus a model fair value near ${analysis.fairValueCents}c, leaving ${formatSignedNumber(analysis.pricingEdgeCents, 0)}c of edge`;

  return {
    direction,
    regime,
    momentum,
    structure,
    trigger,
    priceToBeat,
    pricing,
  };
}

function buildFallbackExplanation(analysis: HourlyStrategyDecision): string {
  if (analysis.ruleDirection === null) {
    return "The opening window is still forming, so the system is waiting for a clearer move away from the hourly price-to-beat before committing to a direction.";
  }

  const summary = buildReviewSummary(analysis);
  const directionText = analysis.ruleDirection === "Up" ? "upside" : "downside";
  const riskSentence = analysis.usedTrendFallback
    ? `Conviction is trimmed because ${summary.trigger}, and ${summary.priceToBeat}.`
    : analysis.currentVsPriceToBeatDirection !== null && analysis.currentVsPriceToBeatDirection !== analysis.ruleDirection
      ? `Conviction is trimmed because ${summary.priceToBeat}, even though the broader setup still points ${directionText}.`
      : analysis.volatilityIdeal
        ? `Volatility remains in a clean range, and ${summary.pricing}.`
        : `The setup still qualifies, but volatility is not ideal and ${summary.pricing}.`;

  return [
    `Bias remains ${directionText}: ${summary.regime}, ${summary.momentum}, and ${summary.structure}.`,
    analysis.usedTrendFallback
      ? `No clean post-open trigger appeared, so the model is leaning on the larger trend rather than a fresh breakout.`
      : `The opening tape confirmed the bias early, so the model is treating this as a genuine opening continuation rather than a blind trend chase.`,
    riskSentence,
  ].join(" ");
}

function fallbackReview(analysis: HourlyStrategyDecision): DeepSeekReviewResult {
  return {
    approve: analysis.ruleDirection !== null,
    confidenceDelta: 0,
    riskFlags: [],
    explanation: buildFallbackExplanation(analysis),
    source: "fallback",
  };
}

function buildMessages(input: ReviewHourlyStrategyInput) {
  const reviewSummary = buildReviewSummary(input.analysis);

  return [
    {
      role: "system",
      content: [
        "You are a cautious reviewer for short-horizon Polymarket signals.",
        "You must not flip the proposed direction.",
        "You may only approve, reject, or adjust confidence.",
        "Return strict JSON with keys: approve, confidence_delta, risk_flags, explanation.",
        "confidence_delta must be a number between -0.15 and 0.08.",
        "Write the explanation like a concise trader note, not like a QA checklist.",
        "Use 2 or 3 tight sentences.",
        "Sentence 1 should state the directional thesis.",
        "Sentence 2 should name the strongest confirmation.",
        "Sentence 3, if needed, should explain what reduces confidence or what could invalidate the setup.",
        "Avoid numbered lists, raw field names, and robotic phrases like 'aligns with indicators' or 'passes gating'.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({
        marketType: input.marketType,
        proposedDirection: input.direction,
        ruleConfidence: input.analysis.ruleConfidence,
        priceToBeat: input.analysis.priceToBeat,
        latestClose: input.analysis.latestClose,
        currentVsPriceToBeat: input.analysis.currentVsPriceToBeat,
        currentVsPriceToBeatBps: input.analysis.currentVsPriceToBeatBps,
        currentVsPriceToBeatDirection: input.analysis.currentVsPriceToBeatDirection,
        ema20: input.analysis.ema20,
        ema50: input.analysis.ema50,
        ema20Slope: input.analysis.ema20Slope,
        qqeTrend: input.analysis.qqeTrend,
        qqeCrossAge: input.analysis.qqeCrossAge,
        atrPercent: input.analysis.atrPercent,
        donchianPosition: input.analysis.donchianPosition,
        breakoutUp: input.analysis.breakoutUp,
        breakoutDown: input.analysis.breakoutDown,
        bullishCandlesLast4: input.analysis.bullishCandlesLast4,
        bearishCandlesLast4: input.analysis.bearishCandlesLast4,
        volumeRatio: input.analysis.volumeRatio,
        bullishRegime: input.analysis.bullishRegime,
        bearishRegime: input.analysis.bearishRegime,
        bullishMomentum: input.analysis.bullishMomentum,
        bearishMomentum: input.analysis.bearishMomentum,
        bullishStructure: input.analysis.bullishStructure,
        bearishStructure: input.analysis.bearishStructure,
        bullishPriceToBeat: input.analysis.bullishPriceToBeat,
        bearishPriceToBeat: input.analysis.bearishPriceToBeat,
        bullishTrigger: input.analysis.bullishTrigger,
        bearishTrigger: input.analysis.bearishTrigger,
        volatilityAllowed: input.analysis.volatilityAllowed,
        volatilityIdeal: input.analysis.volatilityIdeal,
        backgroundDirection: input.analysis.backgroundDirection,
        triggerDirection: input.analysis.triggerDirection,
        triggerObservationReady: input.analysis.triggerObservationReady,
        triggerCandlesAnalyzed: input.analysis.triggerCandlesAnalyzed,
        usedTrendFallback: input.analysis.usedTrendFallback,
        selectedContractPriceCents: input.analysis.selectedContractPriceCents,
        fairValueCents: input.analysis.fairValueCents,
        pricingEdgeCents: input.analysis.pricingEdgeCents,
        passesPricingGate: input.analysis.passesPricingGate,
        ruleReasons: input.analysis.ruleReasons,
        reviewSummary,
      }),
    },
  ];
}

function extractJsonBlock(content: string): Record<string, unknown> {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(content.slice(start, end + 1));
    }
    throw new Error("DeepSeek response did not contain valid JSON");
  }
}

export async function reviewHourlyStrategyWithDeepSeek(input: ReviewHourlyStrategyInput): Promise<DeepSeekReviewResult> {
  if (!input.config.strategy.deepseek.enabled || !input.config.strategy.deepseek.apiKey) {
    return fallbackReview(input.analysis);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.config.strategy.deepseek.timeoutMs);

  try {
    const fetchImpl = input.fetchImpl ?? fetch;
    const response = await fetchImpl(`${input.config.strategy.deepseek.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.config.strategy.deepseek.apiKey}`,
      },
      body: JSON.stringify({
        model: input.config.strategy.deepseek.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: buildMessages(input),
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek review request failed with status ${response.status}`);
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("DeepSeek review response was empty");
    }

    const parsed = extractJsonBlock(content);
    return {
      approve: Boolean(parsed.approve),
      confidenceDelta: clamp(Number(parsed.confidence_delta ?? 0), -0.15, 0.08),
      riskFlags: Array.isArray(parsed.risk_flags) ? parsed.risk_flags.map((flag) => String(flag)) : [],
      explanation: typeof parsed.explanation === "string"
        ? parsed.explanation.trim()
        : buildFallbackExplanation(input.analysis),
      source: "deepseek",
    };
  } catch {
    return fallbackReview(input.analysis);
  } finally {
    clearTimeout(timeout);
  }
}
