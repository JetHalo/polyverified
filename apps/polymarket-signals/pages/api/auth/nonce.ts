import type { NextApiRequest, NextApiResponse } from "next";

import { getPool } from "@/server/db/client";
import { resolveRuntimeConfig } from "@/server/config";
import { badRequest, internalServerError, requireMethod } from "@/server/http/api";
import { buildWalletAuthMessage, createWalletAuthNonce, getNonceExpiry } from "@/server/auth/session";
import { upsertWalletAuthNonce } from "@/server/auth/store";

interface NonceBody {
  walletAddress?: string;
  chainId?: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, "POST")) {
    return;
  }

  try {
    const body = (req.body ?? {}) as NonceBody;
    const walletAddress = body.walletAddress?.trim();
    const chainId = Number(body.chainId ?? 0);

    if (!walletAddress) {
      badRequest(res, "walletAddress is required");
      return;
    }

    if (!Number.isInteger(chainId) || chainId <= 0) {
      badRequest(res, "chainId is required");
      return;
    }

    const issuedAt = new Date().toISOString();
    const nonce = createWalletAuthNonce();
    const expiresAt = getNonceExpiry().toISOString();
    const config = resolveRuntimeConfig(process.env);
    const pool = getPool(config);
    const message = buildWalletAuthMessage({
      walletAddress,
      chainId,
      nonce,
      issuedAt,
      domain: new URL(process.env.APP_BASE_URL ?? "http://localhost:3000").host,
    });

    const record = await upsertWalletAuthNonce(pool, {
      walletAddress,
      nonce,
      chainId,
      message,
      expiresAt,
    });

    res.status(200).json({
      walletAddress: record.walletAddress,
      chainId: record.chainId,
      nonce: record.nonce,
      message: record.message,
      expiresAt: record.expiresAt,
    });
  } catch (error) {
    console.error("wallet nonce creation failed", error);
    internalServerError(res, "Failed to create wallet challenge");
  }
}
