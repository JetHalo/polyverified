import type { AgentExplanationInput, AgentPredictionInput, AgentPredictionOutput, SignalAgent } from "@/server/agents/types";
import { buildHourlyAgentFeatures, type HourlyAgentFeatures } from "@/server/agents/hourly-strategy";
import { baselineConfidence, passesHourlyExecutionWindow, passesMarketQualityFilters } from "@/server/agents/shared";

export const ethHourlyAgent: SignalAgent = {
  slug: "eth-hourly",
  marketType: "ETH Hourly",
  displayName: "ETH Hourly Agent",
  async shouldRun(input) {
    return passesHourlyExecutionWindow(input) && passesMarketQualityFilters(input);
  },
  async buildFeatures(input) {
    return buildHourlyAgentFeatures(input, {
      asset: "ETH",
      symbol: "ETHUSDT",
    });
  },
  async predict(input: AgentPredictionInput): Promise<AgentPredictionOutput | null> {
    const features = input.features as HourlyAgentFeatures;
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
    const features = input.features as HourlyAgentFeatures;
    return features.explanation;
  },
};
