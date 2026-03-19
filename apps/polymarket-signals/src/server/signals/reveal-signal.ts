import type { Direction, SignalProofState, SignalRecord } from "@/server/types";
import { calculateSimulatedPnlCents, type ResolvedOutcome } from "@/server/signals/performance";

export interface RevealSignalInput {
  signal: SignalRecord;
  resolvedAt: string;
  finalDirection: Direction;
}

export interface RevealedSignalRecord {
  signalId: string;
  revealedAt: string;
  outcome: ResolvedOutcome;
  simulatedPnlCents: number;
  proofState: Extract<SignalProofState, "revealed">;
}

export function revealSignal(input: RevealSignalInput): RevealedSignalRecord {
  const outcome: ResolvedOutcome = input.signal.direction === input.finalDirection ? "win" : "loss";

  return {
    signalId: input.signal.signalId,
    revealedAt: input.resolvedAt,
    outcome,
    simulatedPnlCents: calculateSimulatedPnlCents(input.signal.entryPriceCents, outcome),
    proofState: "revealed",
  };
}
