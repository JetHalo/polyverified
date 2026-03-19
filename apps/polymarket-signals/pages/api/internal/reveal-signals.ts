import type { NextApiRequest, NextApiResponse } from "next";

import { resolveRuntimeConfig } from "@/server/config";
import { getPool } from "@/server/db/client";
import { requireMethod } from "@/server/http/api";
import type { SignalRecord } from "@/server/types";
import type { FinalizeSignalResult } from "@/server/signals/finalize-signal";
import { revealDueSignalsWorkflow } from "@/server/workflows";

interface RevealSignalItem {
  signal: SignalRecord;
  finalDirection: SignalRecord["direction"];
  resolvedAt: string;
  proofId?: string;
  txHash?: string;
  proofUrl?: string;
}

interface RevealSignalsBody {
  items?: RevealSignalItem[];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, "POST")) {
    return;
  }

  try {
    const body = (req.body ?? {}) as RevealSignalsBody;
    const config = resolveRuntimeConfig(process.env);
    const pool = getPool(config);

    if (Array.isArray(body.items)) {
      const { buildRevealPackage } = await import("@/server/signals/finalize-signal");
      const { applyDbRevealPackage } = await import("@/server/repository/db-store");
      const results: FinalizeSignalResult[] = [];

      for (const item of body.items) {
        const result = buildRevealPackage(item);
        await applyDbRevealPackage(pool, result);
        results.push(result);
      }

      res.status(200).json({ results, skipped: [] });
      return;
    }

    const result = await revealDueSignalsWorkflow({
      db: pool,
      config,
      now: new Date(),
      baseUrl: process.env.POLYMARKET_API_BASE_URL || "https://gamma-api.polymarket.com",
    });

    res.status(200).json(result);
  } catch (error: unknown) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "failed to reveal signals",
    });
  }
}
