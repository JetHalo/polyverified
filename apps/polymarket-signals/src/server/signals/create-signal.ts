import type { AgentSlug, Direction, MarketSnapshot, RuntimeConfig, SignalRecord } from "@/server/types";
import { COMMITMENT_HASH_MODE, buildCommitmentPayload, type CommitmentPayload } from "@/server/zk/commitment";

export interface CreateSignalProposalInput {
  signalId: string;
  market: MarketSnapshot;
  agentSlug: AgentSlug;
  direction: Direction;
  confidence: number;
  explanation: string;
  config: RuntimeConfig;
  predictedAt: Date;
  salt: string;
  signalIdHash: string;
  agentSlugHash: string;
  marketIdHash: string;
  commitment: string;
}

export interface SignalProposal {
  signal: SignalRecord;
  confidence: number;
  explanation: string;
  payload: CommitmentPayload;
}

function resolveSignalEntryPriceCents(market: MarketSnapshot, direction: Direction): number {
  if (direction === "Up") {
    return market.upAskPriceCents ?? market.upPriceCents;
  }

  return market.downAskPriceCents ?? market.downPriceCents;
}

export async function createSignalProposal(input: CreateSignalProposalInput): Promise<SignalProposal> {
  const entryPriceCents = resolveSignalEntryPriceCents(input.market, input.direction);

  const payload = buildCommitmentPayload({
    signalIdHash: input.signalIdHash,
    agentSlugHash: input.agentSlugHash,
    marketIdHash: input.marketIdHash,
    direction: input.direction,
    entryPriceCents,
    predictedAtUnix: Math.floor(input.predictedAt.getTime() / 1000),
    resolvesAtUnix: Math.floor(new Date(input.market.resolvesAt).getTime() / 1000),
    salt: input.salt,
  });

  return {
    signal: {
      signalId: input.signalId,
      agentSlug: input.agentSlug,
      marketId: input.market.marketId,
      marketType: input.market.marketType,
      direction: input.direction,
      entryPriceCents,
      predictedAt: input.predictedAt.toISOString(),
      resolvesAt: input.market.resolvesAt,
      commitment: input.commitment,
      commitmentHashMode: COMMITMENT_HASH_MODE,
      commitmentStatus: "committed",
      isPremium: true,
    },
    confidence: input.confidence,
    explanation: input.explanation,
    payload,
  };
}
