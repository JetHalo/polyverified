import type { Pool } from "pg";

import type { Direction, MarketSnapshot, RuntimeConfig, AgentSlug, MarketType } from "@/server/types";

export interface AgentRunContext {
  now: Date;
  market: MarketSnapshot;
  config: RuntimeConfig;
  db?: Pick<Pool, "query">;
}

export interface AgentPredictionInput {
  features: unknown;
  context: AgentRunContext;
}

export interface AgentPredictionOutput {
  side: Direction;
  confidence: number;
  reasonCodes: string[];
}

export interface AgentExplanationInput {
  features: unknown;
  prediction: AgentPredictionOutput;
  context: AgentRunContext;
}

export interface SignalAgent {
  slug: AgentSlug;
  marketType: MarketType;
  displayName: string;
  shouldRun(input: AgentRunContext): Promise<boolean>;
  buildFeatures(input: AgentRunContext): Promise<unknown>;
  predict(input: AgentPredictionInput): Promise<AgentPredictionOutput | null>;
  explain(input: AgentExplanationInput): Promise<string>;
}
