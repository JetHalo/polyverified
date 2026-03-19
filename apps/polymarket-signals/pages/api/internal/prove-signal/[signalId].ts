import type { NextApiRequest, NextApiResponse } from "next";

import { resolveRuntimeConfig } from "@/server/config";
import { getPool } from "@/server/db/client";
import { requireMethod } from "@/server/http/api";
import { retrySignalProofWorkflow } from "@/server/workflows";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, "POST")) {
    return;
  }

  const signalId = Array.isArray(req.query.signalId) ? req.query.signalId[0] : req.query.signalId;

  if (!signalId) {
    res.status(400).json({ error: "signalId is required" });
    return;
  }

  try {
    const config = resolveRuntimeConfig(process.env);
    const pool = getPool(config);
    const result = await retrySignalProofWorkflow({
      db: pool,
      config,
      signalId,
    });

    res.status(200).json(result);
  } catch (error: unknown) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "failed to prove signal",
    });
  }
}
