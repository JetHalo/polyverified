import type { NextApiRequest, NextApiResponse } from "next";

import { getWalletSessionFromRequest } from "@/server/auth/service";
import { requireMethod } from "@/server/http/api";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, "GET")) {
    return;
  }

  const session = await getWalletSessionFromRequest(req);

  if (!session) {
    res.status(200).json({
      authenticated: false,
      session: null,
    });
    return;
  }

  res.status(200).json({
    authenticated: true,
    session,
  });
}
