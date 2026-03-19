import { resolveSignalStore, type SignalStore } from "@/server/repository/store";
import { summarizeResolvedSignals } from "@/server/signals/performance";

function summarizeWindow(records: Awaited<ReturnType<SignalStore["listHistoricalSignals"]>>, signalIds: Set<string>) {
  const filtered = records
    .filter((signal) => signalIds.has(signal.id))
    .filter((signal) => signal.outcome && typeof signal.entryPrice === "number")
    .map((signal) => ({
      entryPriceCents: Math.round(signal.entryPrice! * 100),
      outcome: signal.outcome!,
    }));

  return summarizeResolvedSignals(filtered);
}

export async function getHistoryView(options: { store?: SignalStore } = {}) {
  const store = options.store ?? resolveSignalStore();
  const records = await store.listHistoricalSignals();
  const now = Date.parse("2026-03-12T12:00:00.000Z");
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const yesterday = new Set(records.filter((signal) => Date.parse(signal.committedAt) > dayAgo).map((signal) => signal.id));
  const last7Days = new Set(records.filter((signal) => Date.parse(signal.committedAt) > weekAgo).map((signal) => signal.id));

  return {
    records,
    summary: {
      yesterday: summarizeWindow(records, yesterday),
      last7Days: summarizeWindow(records, last7Days),
      allTime: summarizeWindow(records, new Set(records.map((signal) => signal.id))),
    },
  };
}
