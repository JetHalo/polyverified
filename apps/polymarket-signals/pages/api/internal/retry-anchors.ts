import type { NextApiRequest, NextApiResponse } from "next";

import { resolveRuntimeConfig } from "@/server/config";
import { getPool } from "@/server/db/client";
import { requireMethod } from "@/server/http/api";
import { runAnchorRetryTick } from "@/server/workflows";

interface RetryAnchorsBody {
  now?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, "POST")) {
    return;
  }

  try {
    const body = (req.body ?? {}) as RetryAnchorsBody;
    const config = resolveRuntimeConfig(process.env);
    const pool = getPool(config);
    const now = body.now ? new Date(body.now) : new Date();

    const result = await runAnchorRetryTick({
      db: pool,
      config,
      now,
    });

    res.status(200).json(result);
  } catch (error: unknown) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "failed to retry anchors",
    });
  }
}
