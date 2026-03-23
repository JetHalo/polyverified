export type Market = "BTC Hourly" | "ETH Hourly" | "Gold Daily" | "Silver Daily";
export type Direction = "Up" | "Down";
export type ProofState = "committed" | "revealed" | "verified" | "failed";

export interface Signal {
  id: string;
  market: Market;
  direction: Direction;
  committedAt: string;
  resolvesAt: string;
  revealedAt?: string | null;
  proofState: ProofState;
  entryPrice?: number;
  outcome?: "win" | "loss";
  commitHash?: string;
  anchorStatus?: "pending" | "anchored" | "failed";
  anchorTxHash?: string | null;
  anchorExplorerUrl?: string | null;
  anchoredAt?: string | null;
  proofHash?: string;
  proofUrl?: string | null;
  isPremium: boolean;
  agentSlug?: string;
  agentName?: string;
  confidence?: "High" | "Medium-High" | "Medium" | "Low";
  explanation?: string;
}

const markets: Market[] = ["BTC Hourly", "ETH Hourly", "Gold Daily", "Silver Daily"];
const directions: Direction[] = ["Up", "Down"];
export const MOCK_NOW = Date.parse("2026-03-12T12:00:00.000Z");

function hashFromSeed(seed: string): string {
  let hash = 2166136261;

  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return `0x${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizedValue(seed: string): number {
  const hex = hashFromSeed(seed).slice(2);
  const value = Number.parseInt(hex, 16);

  return (value % 10_000) / 10_000;
}

function generateSignal(id: number, hoursAgo: number, state: ProofState): Signal {
  const market = markets[id % markets.length];
  const direction = directions[id % 2];
  const now = MOCK_NOW;
  const committedAt = new Date(now - hoursAgo * 3600000).toISOString();
  const resolvesAt = new Date(now - (hoursAgo - 1) * 3600000).toISOString();
  const signalSeed = `${id}-${market}-${direction}-${state}-${hoursAgo}`;

  const entryPrice = state !== "committed" ? +(0.1 + normalizedValue(`${signalSeed}-entry`) * 0.8).toFixed(4) : undefined;
  const outcome = state === "verified" ? (normalizedValue(`${signalSeed}-outcome`) > 0.38 ? "win" : "loss") : undefined;

  return {
    id: `sig-${String(id).padStart(4, "0")}`,
    market,
    direction,
    committedAt,
    resolvesAt,
    revealedAt: state !== "committed" ? new Date(now - (hoursAgo - 1.1) * 3600000).toISOString() : undefined,
    proofState: state,
    entryPrice,
    outcome,
    commitHash: hashFromSeed(`${signalSeed}-commit`),
    proofHash: state === "verified" ? hashFromSeed(`${signalSeed}-proof`) : undefined,
    isPremium: id % 3 !== 0,
  };
}

export const liveFeed: Signal[] = [
  generateSignal(1, 0.2, "committed"),
  generateSignal(2, 0.5, "committed"),
  generateSignal(3, 0.8, "committed"),
  generateSignal(4, 1.2, "revealed"),
  generateSignal(5, 1.5, "committed"),
  generateSignal(6, 2, "revealed"),
  generateSignal(7, 2.5, "committed"),
  generateSignal(8, 3, "revealed"),
];

export const revealedHistory: Signal[] = Array.from({ length: 30 }, (_, i) =>
  generateSignal(100 + i, 4 + i * 2, "verified")
);

export const myLibrary: Signal[] = [
  generateSignal(4, 1.2, "revealed"),
  generateSignal(6, 2, "revealed"),
  ...revealedHistory.slice(0, 8),
];

export interface AgentStats {
  totalSignals: number;
  winRate: number;
  simulatedROI: number;
  marketsTracked: number;
  avgEntryPrice: number;
  totalSimulatedReturn: number;
}

export const agentStats: AgentStats = {
  totalSignals: 247,
  winRate: 62.3,
  simulatedROI: 38.7,
  marketsTracked: 4,
  avgEntryPrice: 0.47,
  totalSimulatedReturn: 4820,
};

export function simulatedReturn(signal: Signal): number | null {
  if (!signal.entryPrice || !signal.outcome) return null;
  if (signal.entryPrice < 0.1 || signal.entryPrice > 0.9) return null;
  const stake = 100;
  if (signal.outcome === "win") {
    return +(stake / signal.entryPrice - stake).toFixed(2);
  } else {
    return -stake;
  }
}
