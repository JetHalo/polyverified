import type { NextApiRequest, NextApiResponse } from "next";

import { resolveWalletAddressFromRequest } from "@/server/auth/service";
import { getSingleQueryValue, notFound, requireMethod } from "@/server/http/api";
import { getSignalDetailView } from "@/server/read-models/signals";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, "GET")) {
    return;
  }

  const id = getSingleQueryValue(req.query.id);

  if (!id) {
    res.status(400).json({ error: "id is required" });
    return;
  }

  const walletAddress = await resolveWalletAddressFromRequest(req, getSingleQueryValue(req.query.walletAddress));
  const view = await getSignalDetailView(id, walletAddress);

  if (!view) {
    notFound(res, "Unknown signal");
    return;
  }

  res.status(200).json(view);
}
