import { revealSignal, type RevealedSignalRecord } from "@/server/signals/reveal-signal";
import type { SignalRecord } from "@/server/types";

export interface FinalizeSignalInput {
  signal: SignalRecord;
  finalDirection: SignalRecord["direction"];
  resolvedAt: string;
  proofId?: string;
  txHash?: string;
  proofUrl?: string;
  proofStatus?: "revealed" | "verified" | "failed";
}

export interface FinalizeSignalResult {
  revealed: RevealedSignalRecord;
  proof: {
    proofId: string | null;
    signalId: string;
    proofStatus: "revealed" | "verified" | "failed";
    txHash: string | null;
    proofUrl: string | null;
  };
}

export function buildRevealPackage(input: FinalizeSignalInput): FinalizeSignalResult {
  const revealed = revealSignal({
    signal: input.signal,
    resolvedAt: input.resolvedAt,
    finalDirection: input.finalDirection,
  });
  const proofStatus = input.proofStatus ?? (input.proofId ? "verified" : "revealed");

  return {
    revealed,
    proof: {
      proofId: input.proofId ?? null,
      signalId: input.signal.signalId,
      proofStatus,
      txHash: input.txHash ?? null,
      proofUrl: input.proofUrl ?? null,
    },
  };
}
