export type ResolvedOutcome = "win" | "loss";

export interface ResolvedSignalLike {
  entryPriceCents: number;
  outcome: ResolvedOutcome;
}

export interface SignalPerformanceSummary {
  totalSignals: number;
  hits: number;
  deployedCents: number;
  pnlCents: number;
  roiPct: number;
  hitRatePct: number;
}

const STANDARDIZED_STAKE_CENTS = 10_000;

export function calculateSimulatedPnlCents(entryPriceCents: number, outcome: ResolvedOutcome): number {
  if (!Number.isInteger(entryPriceCents) || entryPriceCents < 10 || entryPriceCents > 90) {
    throw new Error("entryPriceCents must be an integer between 10 and 90");
  }

  if (outcome === "loss") {
    return -STANDARDIZED_STAKE_CENTS;
  }

  const payoutCents = Math.round((STANDARDIZED_STAKE_CENTS * 100) / entryPriceCents);
  return payoutCents - STANDARDIZED_STAKE_CENTS;
}

export function summarizeResolvedSignals(signals: ResolvedSignalLike[]): SignalPerformanceSummary {
  const totalSignals = signals.length;
  const hits = signals.filter((signal) => signal.outcome === "win").length;
  const deployedCents = totalSignals * STANDARDIZED_STAKE_CENTS;
  const pnlCents = signals.reduce(
    (sum, signal) => sum + calculateSimulatedPnlCents(signal.entryPriceCents, signal.outcome),
    0,
  );

  return {
    totalSignals,
    hits,
    deployedCents,
    pnlCents,
    roiPct: deployedCents === 0 ? 0 : Number(((pnlCents / deployedCents) * 100).toFixed(2)),
    hitRatePct: totalSignals === 0 ? 0 : Number(((hits / totalSignals) * 100).toFixed(2)),
  };
}
