import type { AgentSlug } from "@/server/types";
import { listAgents } from "@/server/agents";
import { resolveSignalStore, type SignalStore } from "@/server/repository/store";
import { summarizeResolvedSignals } from "@/server/signals/performance";

function summarizeAgent(slug: AgentSlug, historicalSignals: Awaited<ReturnType<SignalStore["listHistoricalSignals"]>>) {
  const resolvedSignals = historicalSignals
    .filter((signal) => signal.agentSlug === slug)
    .filter((signal) => signal.outcome && typeof signal.entryPrice === "number")
    .map((signal) => ({
      entryPriceCents: Math.round(signal.entryPrice! * 100),
      outcome: signal.outcome!,
    }));

  return summarizeResolvedSignals(resolvedSignals);
}

export async function getAgentHubView(options: { store?: SignalStore } = {}) {
  const store = options.store ?? resolveSignalStore();
  const [liveSignals, historicalSignals] = await Promise.all([
    store.listLiveSignals(),
    store.listHistoricalSignals(),
  ]);

  return {
    agents: listAgents().map((agent) => {
      const summary = summarizeAgent(agent.slug, historicalSignals);
      const latestSignal = liveSignals.find((signal) => signal.agentSlug === agent.slug) ?? null;

      return {
        slug: agent.slug,
        displayName: agent.displayName,
        marketType: agent.marketType,
        latestSignalState: latestSignal?.proofState ?? "none",
        totalSignals: summary.totalSignals,
        hitRatePct: summary.hitRatePct,
        simulatedRoiPct: summary.roiPct,
      };
    }),
  };
}

export async function getAgentProfileView(slug: AgentSlug, options: { store?: SignalStore } = {}) {
  const agent = listAgents().find((entry) => entry.slug === slug);

  if (!agent) {
    return null;
  }

  const store = options.store ?? resolveSignalStore();
  const [allSignals, currentSignals, historicalSignals] = await Promise.all([
    store.listSignalsForAgent(slug),
    store.listLiveSignals().then((signals) => signals.filter((signal) => signal.agentSlug === slug)),
    store.listHistoricalSignals().then((signals) => signals.filter((signal) => signal.agentSlug === slug)),
  ]);
  const now = Date.parse("2026-03-12T12:00:00.000Z");
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const summarize = (signals: typeof historicalSignals) =>
    summarizeResolvedSignals(
      signals
        .filter((signal) => signal.outcome && typeof signal.entryPrice === "number")
        .map((signal) => ({
          entryPriceCents: Math.round(signal.entryPrice! * 100),
          outcome: signal.outcome!,
        })),
    );

  return {
    agent: {
      slug: agent.slug,
      displayName: agent.displayName,
      marketType: agent.marketType,
      activeSince: agent.slug.includes("daily") ? "Feb 2025" : "Jan 2025",
    },
    currentSignals,
    historicalSignals,
    performance: {
      yesterday: summarize(historicalSignals.filter((signal) => Date.parse(signal.committedAt) > dayAgo)),
      last7Days: summarize(historicalSignals.filter((signal) => Date.parse(signal.committedAt) > weekAgo)),
      allTime: summarize(historicalSignals),
    },
    latestSignalState: currentSignals[0]?.proofState ?? "none",
    totalSignals: allSignals.length,
  };
}
