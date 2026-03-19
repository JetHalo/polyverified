import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import type { UserActivityRecord, WalletAuthNonceRecord, WalletSessionRecord } from "@/server/types";

type Queryable = Pick<Pool, "query">;

function mapWalletSessionRow(row: any): WalletSessionRecord {
  return {
    sessionId: row.session_id,
    walletAddress: row.wallet_address,
    chainId: row.chain_id,
    signature: row.signature,
    createdAt: new Date(row.created_at).toISOString(),
    lastSeenAt: new Date(row.last_seen_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
  };
}

function mapWalletNonceRow(row: any): WalletAuthNonceRecord {
  return {
    walletAddress: row.wallet_address,
    nonce: row.nonce,
    chainId: row.chain_id,
    message: row.message,
    expiresAt: new Date(row.expires_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapActivityRow(row: any): UserActivityRecord {
  return {
    eventId: row.event_id,
    walletAddress: row.wallet_address,
    signalId: row.signal_id,
    eventType: row.event_type,
    eventPayload: row.event_payload ?? {},
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function upsertWalletAuthNonce(
  db: Queryable,
  input: {
    walletAddress: string;
    nonce: string;
    chainId: number;
    message: string;
    expiresAt: string;
  },
): Promise<WalletAuthNonceRecord> {
  const result = await db.query(
    `
      insert into wallet_auth_nonces (
        wallet_address,
        nonce,
        chain_id,
        message,
        expires_at
      ) values ($1, $2, $3, $4, $5)
      on conflict (wallet_address) do update set
        nonce = excluded.nonce,
        chain_id = excluded.chain_id,
        message = excluded.message,
        expires_at = excluded.expires_at,
        created_at = now()
      returning wallet_address, nonce, chain_id, message, expires_at, created_at
    `,
    [input.walletAddress, input.nonce, input.chainId, input.message, input.expiresAt],
  );

  return mapWalletNonceRow(result.rows[0]);
}

export async function getWalletAuthNonce(db: Queryable, walletAddress: string): Promise<WalletAuthNonceRecord | null> {
  const result = await db.query(
    `
      select wallet_address, nonce, chain_id, message, expires_at, created_at
      from wallet_auth_nonces
      where lower(wallet_address) = lower($1)
      limit 1
    `,
    [walletAddress],
  );

  return result.rows[0] ? mapWalletNonceRow(result.rows[0]) : null;
}

export async function deleteWalletAuthNonce(db: Queryable, walletAddress: string): Promise<void> {
  await db.query(`delete from wallet_auth_nonces where lower(wallet_address) = lower($1)`, [walletAddress]);
}

export async function createWalletSessionRecord(
  db: Queryable,
  input: {
    walletAddress: string;
    chainId: number;
    signature: string;
    expiresAt: string;
    sessionId?: string;
  },
): Promise<WalletSessionRecord> {
  const sessionId = input.sessionId ?? randomUUID();
  const result = await db.query(
    `
      insert into wallet_sessions (
        session_id,
        wallet_address,
        chain_id,
        signature,
        expires_at
      ) values ($1, $2, $3, $4, $5)
      returning session_id, wallet_address, chain_id, signature, created_at, last_seen_at, expires_at, revoked_at
    `,
    [sessionId, input.walletAddress, input.chainId, input.signature, input.expiresAt],
  );

  return mapWalletSessionRow(result.rows[0]);
}

export async function getWalletSessionRecord(db: Queryable, sessionId: string): Promise<WalletSessionRecord | null> {
  const result = await db.query(
    `
      select session_id, wallet_address, chain_id, signature, created_at, last_seen_at, expires_at, revoked_at
      from wallet_sessions
      where session_id = $1
      limit 1
    `,
    [sessionId],
  );

  return result.rows[0] ? mapWalletSessionRow(result.rows[0]) : null;
}

export async function touchWalletSessionRecord(db: Queryable, sessionId: string): Promise<void> {
  await db.query(`update wallet_sessions set last_seen_at = now() where session_id = $1`, [sessionId]);
}

export async function revokeWalletSessionRecord(db: Queryable, sessionId: string): Promise<void> {
  await db.query(`update wallet_sessions set revoked_at = now() where session_id = $1`, [sessionId]);
}

export async function createUserActivityEvent(
  db: Queryable,
  input: {
    walletAddress: string | null;
    signalId?: string | null;
    eventType: string;
    eventPayload?: Record<string, unknown>;
  },
): Promise<UserActivityRecord> {
  const result = await db.query(
    `
      insert into user_activity_events (
        event_id,
        wallet_address,
        signal_id,
        event_type,
        event_payload
      ) values ($1, $2, $3, $4, $5::jsonb)
      returning event_id, wallet_address, signal_id, event_type, event_payload, created_at
    `,
    [randomUUID(), input.walletAddress, input.signalId ?? null, input.eventType, JSON.stringify(input.eventPayload ?? {})],
  );

  return mapActivityRow(result.rows[0]);
}

export async function listUserActivityEvents(
  db: Queryable,
  walletAddress: string,
  limit = 12,
): Promise<UserActivityRecord[]> {
  const result = await db.query(
    `
      select event_id, wallet_address, signal_id, event_type, event_payload, created_at
      from user_activity_events
      where lower(wallet_address) = lower($1)
      order by created_at desc
      limit $2
    `,
    [walletAddress, limit],
  );

  return result.rows.map(mapActivityRow);
}
