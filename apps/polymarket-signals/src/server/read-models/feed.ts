import { resolveSignalStore, type SignalStore } from "@/server/repository/store";
import { summarizeResolvedSignals } from "@/server/signals/performance";

function toResolvedSignals(records: Awaited<ReturnType<SignalStore["listHistoricalSignals"]>>) {
  return records
    .filter((signal) => signal.outcome && typeof signal.entryPrice === "number")
    .map((signal) => ({
      entryPriceCents: Math.round(signal.entryPrice! * 100),
      outcome: signal.outcome!,
    }));
}

export async function getFeedView(options: { store?: SignalStore } = {}) {
  const store = options.store ?? resolveSignalStore();
  const [liveSignals, historicalSignals] = await Promise.all([
    store.listLiveSignals(),
    store.listHistoricalSignals(),
  ]);
  const summary = summarizeResolvedSignals(toResolvedSignals(historicalSignals));

  return {
    liveSignals,
    trackRecord: {
      totalSignals: summary.totalSignals,
      winRate: summary.hitRatePct,
      simulatedROI: summary.roiPct,
      marketsTracked: 4,
      deployedCents: summary.deployedCents,
      pnlCents: summary.pnlCents,
    },
  };
}
