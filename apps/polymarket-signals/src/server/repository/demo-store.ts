import { randomUUID } from "node:crypto";

import { liveFeed, myLibrary, revealedHistory, type Market, type Signal as MockSignal } from "@/lib/mock-data";
import type { AgentSlug } from "@/server/types";
import { createAccessGrantFromPayment, type AccessGrantInput, type PaidUnlockInput, type PurchaseRecordInput } from "@/server/x402/access";

export const DEMO_WALLET_ADDRESS = "0x7a3bf29d0000000000000000000000000000f29d";

const explanations: Record<Market, string> = {
  "BTC Hourly": "Momentum divergence detected on 15m candles with volume confirmation across major exchanges.",
  "ETH Hourly": "Relative strength breakout signaled against BTC pair with on-chain flow support.",
  "Gold Daily": "Macro positioning shift detected via treasury yield correlation and institutional flow data.",
  "Silver Daily": "Industrial demand signals combined with precious metals sector rotation indicators.",
};

const agentByMarket: Record<Market, { slug: AgentSlug; name: string }> = {
  "BTC Hourly": { slug: "btc-hourly", name: "BTC Hourly Agent" },
  "ETH Hourly": { slug: "eth-hourly", name: "ETH Hourly Agent" },
  "Gold Daily": { slug: "gold-daily", name: "Gold Daily Agent" },
  "Silver Daily": { slug: "silver-daily", name: "Silver Daily Agent" },
};

const confidenceBuckets = ["High", "Medium-High", "Medium", "Low"] as const;

export type DemoSignal = MockSignal & {
  agentSlug: AgentSlug;
  agentName: string;
  confidence: (typeof confidenceBuckets)[number];
  explanation: string;
  proofUrl: string | null;
};

export interface DemoAccessGrant extends AccessGrantInput {}
export interface DemoPurchase extends PurchaseRecordInput {}

function enrichSignal(signal: MockSignal): DemoSignal {
  const agent = agentByMarket[signal.market];

  return {
    ...signal,
    agentSlug: agent.slug,
    agentName: agent.name,
    confidence: confidenceBuckets[Number.parseInt(signal.id.slice(-1), 10) % confidenceBuckets.length],
    explanation: explanations[signal.market],
    proofUrl: signal.proofHash ? `https://explorer.zkverify.io/proofs/${signal.proofHash}` : null,
  };
}

function dedupeSignals(signals: MockSignal[]): DemoSignal[] {
  const map = new Map<string, DemoSignal>();

  for (const signal of signals) {
    map.set(signal.id, enrichSignal(signal));
  }

  return Array.from(map.values()).sort((left, right) => {
    return new Date(right.committedAt).getTime() - new Date(left.committedAt).getTime();
  });
}

function seedPurchases(signals: DemoSignal[]): DemoPurchase[] {
  return signals.map((signal, index) => ({
    purchaseId: `purchase-${String(index + 1).padStart(4, "0")}`,
    walletAddress: DEMO_WALLET_ADDRESS,
    signalId: signal.id,
    paymentNetwork: "unset",
    paymentToken: "unset",
    paymentAmount: "0.002 ETH",
    paymentStatus: "confirmed",
    paymentScheme: "demo-unlock",
    paymentTxHash: null,
    paymentPayer: null,
    treasuryAddress: "0xtreasury",
    createdAt: new Date(Date.parse(signal.committedAt) + 15 * 60_000).toISOString(),
  }));
}

function seedAccessGrants(purchases: DemoPurchase[]): DemoAccessGrant[] {
  return purchases.map((purchase, index) => ({
    grantId: `grant-${String(index + 1).padStart(4, "0")}`,
    walletAddress: purchase.walletAddress,
    signalId: purchase.signalId,
    purchaseId: purchase.purchaseId,
    createdAt: purchase.createdAt,
  }));
}

function buildInitialState() {
  const liveSignals = dedupeSignals(liveFeed);
  const historicalSignals = dedupeSignals(revealedHistory);
  const librarySignals = dedupeSignals(myLibrary);
  const allSignals = dedupeSignals([...liveFeed, ...revealedHistory, ...myLibrary]);
  const purchases = seedPurchases(librarySignals);
  const accessGrants = seedAccessGrants(purchases);

  return {
    liveSignals,
    historicalSignals,
    librarySignals,
    allSignals,
    purchases,
    accessGrants,
  };
}

let demoState = buildInitialState();

function refreshAllSignals(updatedSignals?: DemoSignal[]): void {
  demoState.allSignals = dedupeSignals(updatedSignals ?? [
    ...demoState.liveSignals,
    ...demoState.historicalSignals,
    ...demoState.librarySignals,
  ]);
}

export function resetDemoStore(): void {
  demoState = buildInitialState();
}

export function listDemoLiveSignals(): DemoSignal[] {
  return demoState.liveSignals;
}

export function listDemoHistoricalSignals(): DemoSignal[] {
  return demoState.historicalSignals;
}

export function listDemoAllSignals(): DemoSignal[] {
  return demoState.allSignals;
}

export function getDemoSignalById(signalId: string): DemoSignal | null {
  return demoState.allSignals.find((signal) => signal.id === signalId) ?? null;
}

export function listDemoSignalsForAgent(slug: AgentSlug): DemoSignal[] {
  return demoState.allSignals.filter((signal) => signal.agentSlug === slug);
}

export function listDemoPurchases(walletAddress: string): DemoPurchase[] {
  return demoState.purchases
    .filter((purchase) => purchase.walletAddress.toLowerCase() === walletAddress.toLowerCase())
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function listDemoAccessGrants(walletAddress: string): DemoAccessGrant[] {
  return demoState.accessGrants
    .filter((grant) => grant.walletAddress.toLowerCase() === walletAddress.toLowerCase())
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function hasDemoSignalAccess(walletAddress: string | null | undefined, signalId: string): boolean {
  if (!walletAddress) {
    return false;
  }

  return demoState.accessGrants.some((grant) => {
    return grant.signalId === signalId && grant.walletAddress.toLowerCase() === walletAddress.toLowerCase();
  });
}

export function listDemoLibrarySignals(walletAddress: string): DemoSignal[] {
  const accessible = new Set(listDemoAccessGrants(walletAddress).map((grant) => grant.signalId));

  return demoState.allSignals.filter((signal) => accessible.has(signal.id));
}

export function createDemoPurchaseAndGrant(
  input: PaidUnlockInput,
  options: {
    now?: Date;
    randomId?: () => string;
  } = {},
): { purchase: DemoPurchase; grant: DemoAccessGrant } {
  const { purchase, grant } = createAccessGrantFromPayment(input, {
    randomId: options.randomId ?? randomUUID,
    now: options.now,
  });

  if (!hasDemoSignalAccess(input.walletAddress, input.signalId)) {
    demoState.purchases = [purchase, ...demoState.purchases];
    demoState.accessGrants = [grant, ...demoState.accessGrants];

    const signal = getDemoSignalById(input.signalId);

    if (signal && !demoState.librarySignals.some((entry) => entry.id === signal.id)) {
      demoState.librarySignals = dedupeSignals([signal, ...demoState.librarySignals]);
      refreshAllSignals();
    }
  }

  return { purchase, grant };
}
