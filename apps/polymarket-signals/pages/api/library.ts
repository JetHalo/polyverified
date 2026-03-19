import type { NextApiRequest, NextApiResponse } from "next";

import { resolveWalletAddressFromRequest } from "@/server/auth/service";
import { getSingleQueryValue, requireMethod } from "@/server/http/api";
import { getLibraryView } from "@/server/read-models/library";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, "GET")) {
    return;
  }

  const walletAddress = await resolveWalletAddressFromRequest(req, getSingleQueryValue(req.query.walletAddress));

  res.status(200).json(await getLibraryView(walletAddress));
}
