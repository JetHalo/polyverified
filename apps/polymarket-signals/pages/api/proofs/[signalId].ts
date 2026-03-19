import type { NextApiRequest, NextApiResponse } from "next";

import { getSingleQueryValue, notFound, requireMethod } from "@/server/http/api";
import { getProofView } from "@/server/read-models/proofs";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, "GET")) {
    return;
  }

  const signalId = getSingleQueryValue(req.query.signalId);

  if (!signalId) {
    res.status(400).json({ error: "signalId is required" });
    return;
  }

  const proof = await getProofView(signalId);

  if (!proof) {
    notFound(res, "Proof not available");
    return;
  }

  res.status(200).json(proof);
}
