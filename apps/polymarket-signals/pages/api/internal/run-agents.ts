import type { NextApiRequest, NextApiResponse } from "next";

import { resolveRuntimeConfig } from "@/server/config";
import { getPool } from "@/server/db/client";
import { requireMethod } from "@/server/http/api";
import type { MarketSnapshot } from "@/server/types";
import { runStoredMarketsWorkflow } from "@/server/workflows";

interface RunAgentsBody {
  markets?: MarketSnapshot[];
  now?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, "POST")) {
    return;
  }

  const body = (req.body ?? {}) as RunAgentsBody;
  const config = resolveRuntimeConfig(process.env);
  const pool = getPool(config);

  const now = body.now ? new Date(body.now) : new Date();
  const result = await runStoredMarketsWorkflow({
    db: pool,
    config,
    now,
    markets: Array.isArray(body.markets) ? body.markets : undefined,
  });

  res.status(200).json(result);
}
