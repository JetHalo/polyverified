import type { NextApiRequest, NextApiResponse } from "next";
import { recoverMessageAddress } from "viem";

import { getPool } from "@/server/db/client";
import { resolveRuntimeConfig } from "@/server/config";
import { badRequest, internalServerError, requireMethod } from "@/server/http/api";
import { getSessionExpiry, setSessionCookie } from "@/server/auth/session";
import {
  createUserActivityEvent,
  createWalletSessionRecord,
  deleteWalletAuthNonce,
  getWalletAuthNonce,
} from "@/server/auth/store";

interface VerifyBody {
  walletAddress?: string;
  chainId?: number;
  signature?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, "POST")) {
    return;
  }

  try {
    const body = (req.body ?? {}) as VerifyBody;
    const walletAddress = body.walletAddress?.trim();
    const chainId = Number(body.chainId ?? 0);
    const signature = body.signature?.trim();

    if (!walletAddress || !signature) {
      badRequest(res, "walletAddress and signature are required");
      return;
    }

    if (!Number.isInteger(chainId) || chainId <= 0) {
      badRequest(res, "chainId is required");
      return;
    }

    const config = resolveRuntimeConfig(process.env);
    const pool = getPool(config);
    const nonceRecord = await getWalletAuthNonce(pool, walletAddress);

    if (!nonceRecord) {
      badRequest(res, "wallet nonce not found");
      return;
    }

    if (Date.parse(nonceRecord.expiresAt) <= Date.now()) {
      await deleteWalletAuthNonce(pool, walletAddress);
      badRequest(res, "wallet nonce expired");
      return;
    }

    if (nonceRecord.chainId !== chainId) {
      badRequest(res, "chainId mismatch");
      return;
    }

    const recoveredAddress = await recoverMessageAddress({
      message: nonceRecord.message,
      signature: signature as `0x${string}`,
    });

    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      badRequest(res, "signature verification failed");
      return;
    }

    await deleteWalletAuthNonce(pool, walletAddress);
    const session = await createWalletSessionRecord(pool, {
      walletAddress,
      chainId,
      signature,
      expiresAt: getSessionExpiry().toISOString(),
    });

    await createUserActivityEvent(pool, {
      walletAddress,
      eventType: "wallet_connected",
      eventPayload: {
        chainId,
        sessionId: session.sessionId,
      },
    });

    setSessionCookie(res, session.sessionId);
    res.status(200).json({
      authenticated: true,
      session,
    });
  } catch (error) {
    console.error("wallet verify failed", error);
    internalServerError(res, "Wallet authentication failed");
  }
}
