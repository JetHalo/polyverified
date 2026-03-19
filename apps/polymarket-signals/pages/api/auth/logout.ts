import type { NextApiRequest, NextApiResponse } from "next";

import { getPool } from "@/server/db/client";
import { resolveRuntimeConfig } from "@/server/config";
import { getWalletSessionFromRequest } from "@/server/auth/service";
import { clearSessionCookie } from "@/server/auth/session";
import { createUserActivityEvent, revokeWalletSessionRecord } from "@/server/auth/store";
import { requireMethod } from "@/server/http/api";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, "POST")) {
    return;
  }

  const session = await getWalletSessionFromRequest(req);
  clearSessionCookie(res);

  if (!session) {
    res.status(200).json({
      authenticated: false,
      loggedOut: true,
    });
    return;
  }

  const config = resolveRuntimeConfig(process.env);
  const pool = getPool(config);

  await revokeWalletSessionRecord(pool, session.sessionId);
  await createUserActivityEvent(pool, {
    walletAddress: session.walletAddress,
    eventType: "wallet_disconnected",
    eventPayload: {
      sessionId: session.sessionId,
    },
  });

  res.status(200).json({
    authenticated: false,
    loggedOut: true,
  });
}
