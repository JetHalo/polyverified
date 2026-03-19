import { resolveSignalStore, type SignalStore } from "@/server/repository/store";

export async function getProofView(signalId: string, options: { store?: SignalStore } = {}) {
  const store = options.store ?? resolveSignalStore();
  const signal = await store.getSignalById(signalId);

  if (!signal || (!signal.proofHash && !signal.proofUrl)) {
    return null;
  }

  return {
    signalId: signal.id,
    proofState: signal.proofState,
    commitment: signal.commitHash ?? null,
    proofHash: signal.proofHash ?? null,
    proofUrl: signal.proofUrl,
  };
}
