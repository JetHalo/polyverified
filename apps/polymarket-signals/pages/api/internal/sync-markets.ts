import type { NextApiRequest, NextApiResponse } from "next";

import { resolveRuntimeConfig } from "@/server/config";
import { getPool } from "@/server/db/client";
import { requireMethod } from "@/server/http/api";
import { syncSupportedMarketsWorkflow } from "@/server/workflows";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, "POST")) {
    return;
  }

  const config = resolveRuntimeConfig(process.env);
  const pool = getPool(config);
  const result = await syncSupportedMarketsWorkflow({
    db: pool,
    baseUrl: process.env.POLYMARKET_API_BASE_URL || "https://gamma-api.polymarket.com",
  });

  res.status(200).json({
    synced: result.synced,
    markets: result.markets,
  });
}
