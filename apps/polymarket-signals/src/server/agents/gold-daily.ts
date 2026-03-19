import type { AgentExplanationInput, AgentPredictionInput, AgentPredictionOutput, SignalAgent } from "@/server/agents/types";
import { buildDailyAgentFeatures, type DailyAgentFeatures } from "@/server/agents/daily-strategy";
import { baselineConfidence, passesDailyExecutionWindow, passesMarketQualityFilters } from "@/server/agents/shared";

export const goldDailyAgent: SignalAgent = {
  slug: "gold-daily",
  marketType: "Gold Daily",
  displayName: "Gold Daily Agent",
  async shouldRun(input) {
    return passesDailyExecutionWindow(input)
      && passesMarketQualityFilters(input, {
        minLiquidityUsd: input.config.strategy.daily.goldMinLiquidityUsd,
        maxSpreadBps: input.config.strategy.daily.goldMaxSpreadBps,
      });
  },
  async buildFeatures(input) {
    return buildDailyAgentFeatures(input, {
      asset: "Gold",
      marketType: "Gold Daily",
    });
  },
  async predict(input: AgentPredictionInput): Promise<AgentPredictionOutput | null> {
    const features = input.features as DailyAgentFeatures;
    if (!features.shouldSignal || !features.finalDirection || features.finalConfidence === null) {
      return null;
    }

    return {
      side: features.finalDirection,
      confidence: baselineConfidence(Math.round(features.finalConfidence * 100)),
      reasonCodes: features.reasonCodes,
    };
  },
  async explain(input: AgentExplanationInput): Promise<string> {
    const features = input.features as DailyAgentFeatures;
    return features.explanation;
  },
};
