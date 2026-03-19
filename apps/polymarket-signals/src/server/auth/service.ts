import type { IncomingMessage } from "node:http";

import { getPool } from "@/server/db/client";
import { resolveRuntimeConfig } from "@/server/config";
import { getSessionIdFromCookieHeader, getSessionIdFromRequest } from "@/server/auth/session";
import { getWalletSessionRecord, touchWalletSessionRecord } from "@/server/auth/store";
import type { WalletSessionRecord } from "@/server/types";

export async function getWalletSessionFromRequest(req: IncomingMessage): Promise<WalletSessionRecord | null> {
  const sessionId = getSessionIdFromRequest(req);
  return getWalletSessionById(sessionId);
}

export async function getWalletSessionById(sessionId: string | null | undefined): Promise<WalletSessionRecord | null> {
  if (!sessionId) {
    return null;
  }

  try {
    const config = resolveRuntimeConfig(process.env);
    const pool = getPool(config);
    const session = await getWalletSessionRecord(pool, sessionId);

    if (!session || session.revokedAt) {
      return null;
    }

    if (Date.parse(session.expiresAt) <= Date.now()) {
      return null;
    }

    await touchWalletSessionRecord(pool, session.sessionId);
    return session;
  } catch {
    return null;
  }
}

export async function resolveWalletAddressFromRequest(
  req: IncomingMessage,
  explicitWalletAddress?: string | null,
): Promise<string | null> {
  if (explicitWalletAddress?.trim()) {
    return explicitWalletAddress.trim();
  }

  const session = await getWalletSessionFromRequest(req);
  return session?.walletAddress ?? null;
}

export async function resolveWalletAddressFromCookieHeader(header: string | undefined): Promise<string | null> {
  const sessionId = getSessionIdFromCookieHeader(header);
  const session = await getWalletSessionById(sessionId);
  return session?.walletAddress ?? null;
}
