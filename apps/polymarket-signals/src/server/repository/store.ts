import { getPool } from "@/server/db/client";
import { resolveRuntimeConfig } from "@/server/config";
import { listUserActivityEvents } from "@/server/auth/store";
import type { AgentSlug } from "@/server/types";
import {
  createDbPurchaseAndGrant,
  getDbSignalById,
  hasDbSignalAccess,
  listDbAccessGrants,
  listDbAllSignals,
  listDbHistoricalSignals,
  listDbLibrarySignals,
  listDbLiveSignals,
  listDbPurchases,
  listDbSignalsForAgent,
} from "@/server/repository/db-store";
import {
  createDemoPurchaseAndGrant,
  getDemoSignalById,
  hasDemoSignalAccess,
  listDemoAccessGrants,
  listDemoAllSignals,
  listDemoHistoricalSignals,
  listDemoLibrarySignals,
  listDemoLiveSignals,
  listDemoPurchases,
  listDemoSignalsForAgent,
  type DemoAccessGrant,
  type DemoPurchase,
  type DemoSignal,
} from "@/server/repository/demo-store";
import type { PaidUnlockInput } from "@/server/x402/access";
import type { UserActivityRecord } from "@/server/types";

export interface SignalStore {
  listLiveSignals(): Promise<DemoSignal[]>;
  listHistoricalSignals(): Promise<DemoSignal[]>;
  listAllSignals(): Promise<DemoSignal[]>;
  getSignalById(signalId: string): Promise<DemoSignal | null>;
  listSignalsForAgent(slug: AgentSlug): Promise<DemoSignal[]>;
  listPurchases(walletAddress: string): Promise<DemoPurchase[]>;
  listAccessGrants(walletAddress: string): Promise<DemoAccessGrant[]>;
  hasSignalAccess(walletAddress: string | null | undefined, signalId: string): Promise<boolean>;
  listLibrarySignals(walletAddress: string): Promise<DemoSignal[]>;
  listUserActivity(walletAddress: string): Promise<UserActivityRecord[]>;
  createPurchaseAndGrant(
    input: PaidUnlockInput,
    options?: { now?: Date; randomId?: () => string },
  ): Promise<{ purchase: DemoPurchase; grant: DemoAccessGrant }>;
}

export function createDemoSignalStore(): SignalStore {
  return {
    listLiveSignals: async () => listDemoLiveSignals(),
    listHistoricalSignals: async () => listDemoHistoricalSignals(),
    listAllSignals: async () => listDemoAllSignals(),
    getSignalById: async (signalId) => getDemoSignalById(signalId),
    listSignalsForAgent: async (slug) => listDemoSignalsForAgent(slug),
    listPurchases: async (walletAddress) => listDemoPurchases(walletAddress),
    listAccessGrants: async (walletAddress) => listDemoAccessGrants(walletAddress),
    hasSignalAccess: async (walletAddress, signalId) => hasDemoSignalAccess(walletAddress, signalId),
    listLibrarySignals: async (walletAddress) => listDemoLibrarySignals(walletAddress),
    listUserActivity: async () => [],
    createPurchaseAndGrant: async (input, options) => createDemoPurchaseAndGrant(input, options),
  };
}

export function createPostgresSignalStore(env: Record<string, string | undefined> = process.env): SignalStore | null {
  try {
    const config = resolveRuntimeConfig(env);
    const pool = getPool(config);

    return {
      listLiveSignals: async () => listDbLiveSignals(pool),
      listHistoricalSignals: async () => listDbHistoricalSignals(pool),
      listAllSignals: async () => listDbAllSignals(pool),
      getSignalById: async (signalId) => getDbSignalById(pool, signalId),
      listSignalsForAgent: async (slug) => listDbSignalsForAgent(pool, slug),
      listPurchases: async (walletAddress) => listDbPurchases(pool, walletAddress),
      listAccessGrants: async (walletAddress) => listDbAccessGrants(pool, walletAddress),
      hasSignalAccess: async (walletAddress, signalId) => hasDbSignalAccess(pool, walletAddress, signalId),
      listLibrarySignals: async (walletAddress) => listDbLibrarySignals(pool, walletAddress),
      listUserActivity: async (walletAddress) => listUserActivityEvents(pool, walletAddress),
      createPurchaseAndGrant: async (input, options) => createDbPurchaseAndGrant(pool, input, options),
    };
  } catch {
    return null;
  }
}

export function resolveSignalStore(env: Record<string, string | undefined> = process.env): SignalStore {
  return createPostgresSignalStore(env) ?? createDemoSignalStore();
}
