import type { Pool } from "pg";

import { createHash, randomUUID } from "node:crypto";

import { getAgentBySlug } from "@/server/agents";
import type { SignalAgent } from "@/server/agents/types";
import { createSignalProposal, type SignalProposal } from "@/server/signals/create-signal";
import { buildCommitmentDraft, type CommitmentResolver } from "@/server/zk/commitment";
import { computePoseidonCommitment } from "@/server/zk/noir";
import type { MarketSnapshot, AgentSlug, RuntimeConfig } from "@/server/types";

export interface RunSignalAgentInput {
  db?: Pick<Pool, "query">;
  market: MarketSnapshot;
  config: RuntimeConfig;
  now: Date;
  idFactory?: () => string;
  scalarFactory?: (seed: string) => string;
  commitmentFactory?: (seed: string) => string;
  commitmentResolver?: CommitmentResolver;
  resolveAgent?: (slug: AgentSlug) => SignalAgent;
}

function agentSlugForMarket(marketType: MarketSnapshot["marketType"]): AgentSlug {
  switch (marketType) {
    case "BTC Hourly":
      return "btc-hourly";
    case "ETH Hourly":
      return "eth-hourly";
    case "Gold Daily":
      return "gold-daily";
    case "Silver Daily":
      return "silver-daily";
  }
}

function defaultScalarFactory(seed: string): string {
  const digest = createHash("sha256").update(seed).digest("hex");
  return BigInt(`0x${digest}`).toString(10);
}

function resolveSignalEntryPriceCents(market: MarketSnapshot, direction: "Up" | "Down"): number {
  if (direction === "Up") {
    return market.upAskPriceCents ?? market.upPriceCents;
  }

  return market.downAskPriceCents ?? market.downPriceCents;
}

export async function runSignalAgent(input: RunSignalAgentInput): Promise<SignalProposal | null> {
  const slug = agentSlugForMarket(input.market.marketType);
  const agent = input.resolveAgent?.(slug) ?? getAgentBySlug(slug);
  const context = {
    now: input.now,
    market: input.market,
    config: input.config,
    db: input.db,
  };

  if (!(await agent.shouldRun(context))) {
    return null;
  }

  const features = await agent.buildFeatures(context);
  const prediction = await agent.predict({ features, context });
  if (!prediction) {
    return null;
  }
  const explanation = await agent.explain({ prediction, context, features });
  const nextId = input.idFactory ?? randomUUID;
  const toScalar = input.scalarFactory ?? defaultScalarFactory;
  const signalId = nextId();
  const predictedAtUnix = Math.floor(input.now.getTime() / 1000);
  const resolvesAtUnix = Math.floor(new Date(input.market.resolvesAt).getTime() / 1000);
  const signalIdHash = toScalar(`${signalId}:signal`);
  const agentSlugHash = toScalar(`${slug}:agent`);
  const marketIdHash = toScalar(`${input.market.marketId}:market`);
  const salt = toScalar(`${signalId}:salt`);
  const direction = prediction.side;
  const entryPriceCents = resolveSignalEntryPriceCents(input.market, direction);
  const resolveCommitment =
    input.commitmentResolver ??
    (input.commitmentFactory
      ? async (draft: Parameters<CommitmentResolver>[0]) => input.commitmentFactory!(draft.seed)
      : computePoseidonCommitment);
  const draft = await buildCommitmentDraft({
    signalIdHash,
    agentSlugHash,
    marketIdHash,
    direction,
    entryPriceCents,
    predictedAtUnix,
    resolvesAtUnix,
    salt,
  }, resolveCommitment);
  const commitment = draft.commitment;

  return createSignalProposal({
    signalId,
    market: input.market,
    agentSlug: slug,
    direction,
    confidence: prediction.confidence,
    explanation,
    config: input.config,
    predictedAt: input.now,
    salt,
    signalIdHash,
    agentSlugHash,
    marketIdHash,
    commitment,
  });
}
