import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";

import type { NextApiResponse } from "next";

export const AUTH_SESSION_COOKIE = "poly_verified_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const NONCE_TTL_SECONDS = 60 * 10;

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }

  return header.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) {
      return acc;
    }

    acc[rawKey] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

export function getSessionIdFromCookieHeader(header: string | undefined): string | null {
  const cookies = parseCookieHeader(header);
  return cookies[AUTH_SESSION_COOKIE] ?? null;
}

export function getSessionIdFromRequest(req: IncomingMessage): string | null {
  return getSessionIdFromCookieHeader(req.headers.cookie);
}

export function setSessionCookie(res: NextApiResponse, sessionId: string): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${AUTH_SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
  );
}

export function clearSessionCookie(res: NextApiResponse): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${AUTH_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
  );
}

export function buildWalletAuthMessage(input: {
  walletAddress: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  domain: string;
}): string {
  return [
    `${input.domain} wants you to sign in with your wallet.`,
    "",
    `Address: ${input.walletAddress}`,
    `Chain ID: ${input.chainId}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
    "",
    "This signature proves wallet ownership for Poly Verified account access.",
  ].join("\n");
}

export function createWalletAuthNonce() {
  return randomUUID().replace(/-/g, "");
}

export function getNonceExpiry(now = new Date()): Date {
  return new Date(now.getTime() + NONCE_TTL_SECONDS * 1000);
}

export function getSessionExpiry(now = new Date()): Date {
  return new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
}
