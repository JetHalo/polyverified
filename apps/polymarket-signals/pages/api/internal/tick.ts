import type { NextApiRequest, NextApiResponse } from "next";

import { resolveRuntimeConfig } from "@/server/config";
import { getPool } from "@/server/db/client";
import { requireMethod } from "@/server/http/api";
import { runSignalLifecycleTick } from "@/server/workflows";

interface TickBody {
  now?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, "POST")) {
    return;
  }

  try {
    const body = (req.body ?? {}) as TickBody;
    const config = resolveRuntimeConfig(process.env);
    const pool = getPool(config);
    const now = body.now ? new Date(body.now) : new Date();

    const result = await runSignalLifecycleTick({
      db: pool,
      config,
      now,
      baseUrl: process.env.POLYMARKET_API_BASE_URL || "https://gamma-api.polymarket.com",
    });

    res.status(200).json(result);
  } catch (error: unknown) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "failed to run lifecycle tick",
    });
  }
}
