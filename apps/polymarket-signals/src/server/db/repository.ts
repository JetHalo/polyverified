import type { Pool, QueryResult } from "pg";

import type { MarketObservation, MarketSnapshot, SignalProofState, SignalRecord } from "@/server/types";

type Queryable = Pick<Pool, "query">;

function mapSignalRow(row: any): SignalRecord {
  const predictedAt = row.predicted_at ?? row.predictedAt;
  const resolvesAt = row.resolves_at ?? row.resolvesAt;

  return {
    signalId: row.signal_id ?? row.signalId,
    agentSlug: row.agent_slug ?? row.agentSlug,
    marketId: row.market_id ?? row.marketId,
    marketType: row.market_type ?? row.marketType,
    direction: row.direction,
    entryPriceCents: row.entry_price_cents ?? row.entryPriceCents,
    predictedAt: new Date(predictedAt).toISOString(),
    resolvesAt: new Date(resolvesAt).toISOString(),
    commitment: row.commitment,
    commitmentHashMode: row.commitment_hash_mode ?? row.commitmentHashMode ?? "poseidon2-field-v1",
    commitmentStatus: row.commitment_status ?? row.commitmentStatus,
    isPremium: row.is_premium ?? row.isPremium,
  };
}

export async function upsertAgentsCatalog(
  db: Queryable,
  agents: Array<{ slug: string; marketType: string; displayName: string }>,
): Promise<void> {
  for (const agent of agents) {
    await db.query(
      `
        insert into agents (
          slug,
          market_type,
          display_name
        ) values ($1, $2, $3)
        on conflict (slug) do update set
          market_type = excluded.market_type,
          display_name = excluded.display_name
      `,
      [agent.slug, agent.marketType, agent.displayName],
    );
  }
}

export async function upsertMarketSnapshots(db: Queryable, markets: MarketSnapshot[]): Promise<void> {
  for (const market of markets) {
    await db.query(
      `
        insert into markets (
          market_id,
          market_type,
          opens_at,
          resolves_at,
          up_price_cents,
          down_price_cents,
          up_ask_price_cents,
          down_ask_price_cents,
          spread_bps,
          liquidity_usd,
          updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
        on conflict (market_id) do update set
          market_type = excluded.market_type,
          opens_at = excluded.opens_at,
          resolves_at = excluded.resolves_at,
          up_price_cents = excluded.up_price_cents,
          down_price_cents = excluded.down_price_cents,
          up_ask_price_cents = excluded.up_ask_price_cents,
          down_ask_price_cents = excluded.down_ask_price_cents,
          spread_bps = excluded.spread_bps,
          liquidity_usd = excluded.liquidity_usd,
          updated_at = now()
      `,
      [
        market.marketId,
        market.marketType,
        market.opensAt,
        market.resolvesAt,
        market.upPriceCents,
        market.downPriceCents,
        market.upAskPriceCents ?? null,
        market.downAskPriceCents ?? null,
        market.spreadBps,
        market.liquidityUsd,
      ],
    );

    await db.query(
      `
        insert into market_observations (
          market_id,
          market_type,
          observed_at,
          up_price_cents,
          down_price_cents,
          up_ask_price_cents,
          down_ask_price_cents,
          spread_bps,
          liquidity_usd
        ) values ($1, $2, now(), $3, $4, $5, $6, $7, $8)
      `,
      [
        market.marketId,
        market.marketType,
        market.upPriceCents,
        market.downPriceCents,
        market.upAskPriceCents ?? null,
        market.downAskPriceCents ?? null,
        market.spreadBps,
        market.liquidityUsd,
      ],
    );
  }
}

function mapMarketRow(row: any): MarketSnapshot {
  return {
    marketId: row.market_id ?? row.marketId,
    marketType: row.market_type ?? row.marketType,
    opensAt: new Date(row.opens_at ?? row.opensAt).toISOString(),
    resolvesAt: new Date(row.resolves_at ?? row.resolvesAt).toISOString(),
    upPriceCents: row.up_price_cents ?? row.upPriceCents,
    downPriceCents: row.down_price_cents ?? row.downPriceCents,
    upAskPriceCents: row.up_ask_price_cents ?? row.upAskPriceCents ?? null,
    downAskPriceCents: row.down_ask_price_cents ?? row.downAskPriceCents ?? null,
    spreadBps: row.spread_bps ?? row.spreadBps,
    liquidityUsd: Number(row.liquidity_usd ?? row.liquidityUsd),
    existingSignalId: row.existing_signal_id ?? row.existingSignalId ?? null,
  };
}

export async function listRunnableMarketSnapshots(db: Queryable, now: Date): Promise<MarketSnapshot[]> {
  const result: QueryResult = await db.query(
    `
      with current_markets as (
        select
          market_type,
          max(updated_at) as latest_updated_at
        from markets
        group by market_type
      )
      select
        m.market_id,
        m.market_type,
        m.opens_at,
        m.resolves_at,
        m.up_price_cents,
        m.down_price_cents,
        m.up_ask_price_cents,
        m.down_ask_price_cents,
        m.spread_bps,
        m.liquidity_usd,
        existing.signal_id as existing_signal_id
      from markets m
      inner join current_markets cm
        on cm.market_type = m.market_type
       and cm.latest_updated_at = m.updated_at
      left join lateral (
        select s.signal_id
        from signals s
        where s.market_id = m.market_id
          and s.commitment_status in ('committed', 'revealed', 'verified')
        order by s.predicted_at desc
        limit 1
      ) existing on true
      where m.opens_at <= $1
        and m.resolves_at > $1
      order by m.opens_at asc
    `,
    [now.toISOString()],
  );

  return result.rows.map(mapMarketRow);
}

export async function listSignalsNeedingAnchor(db: Queryable): Promise<SignalRecord[]> {
  const result: QueryResult = await db.query(
    `
      select
        s.signal_id,
        s.agent_slug,
        s.market_id,
        s.market_type,
        s.direction,
        s.entry_price_cents,
        s.predicted_at,
        s.resolves_at,
        s.commitment,
        s.commitment_hash_mode,
        s.commitment_status,
        s.is_premium
      from signals s
      left join signal_anchors sa on sa.signal_id = s.signal_id
      where s.commitment_status in ('committed', 'revealed')
        and (sa.signal_id is null or sa.anchor_status = 'pending')
      order by s.predicted_at asc
    `,
  );

  return result.rows.map(mapSignalRow);
}

export async function listDueSignalsNeedingReveal(db: Queryable, now: Date): Promise<SignalRecord[]> {
  const result: QueryResult = await db.query(
    `
      select
        signal_id,
        agent_slug,
        market_id,
        market_type,
        direction,
        entry_price_cents,
        predicted_at,
        resolves_at,
        commitment,
        commitment_hash_mode,
        commitment_status,
        is_premium
      from signals
      where commitment_status = 'committed'
        and resolves_at <= $1
      order by resolves_at asc
    `,
    [now.toISOString()],
  );

  return result.rows.map(mapSignalRow);
}

export async function listSignalsByStatus(db: Queryable, status: SignalProofState): Promise<SignalRecord[]> {
  const result: QueryResult = await db.query(
    `
      select
        signal_id,
        agent_slug,
        market_id,
        market_type,
        direction,
        entry_price_cents,
        predicted_at,
        resolves_at,
        commitment,
        commitment_hash_mode,
        commitment_status,
        is_premium
      from signals
      where commitment_status = $1
      order by predicted_at desc
    `,
    [status],
  );

  return result.rows.map(mapSignalRow);
}

export async function getSignalById(db: Queryable, signalId: string): Promise<SignalRecord | null> {
  const result: QueryResult = await db.query(
    `
      select
        signal_id,
        agent_slug,
        market_id,
        market_type,
        direction,
        entry_price_cents,
        predicted_at,
        resolves_at,
        commitment,
        commitment_hash_mode,
        commitment_status,
        is_premium
      from signals
      where signal_id = $1
      limit 1
    `,
    [signalId],
  );

  return result.rows[0] ? mapSignalRow(result.rows[0]) : null;
}

export async function findExistingSignalIdForMarket(db: Queryable, marketId: string): Promise<string | null> {
  const result: QueryResult = await db.query(
    `
      select signal_id
      from signals
      where market_id = $1
      order by predicted_at desc
      limit 1
    `,
    [marketId],
  );

  return (result.rows[0]?.signal_id ?? null) as string | null;
}

function mapMarketObservationRow(row: any): MarketObservation {
  return {
    marketId: row.market_id ?? row.marketId,
    marketType: row.market_type ?? row.marketType,
    observedAt: new Date(row.observed_at ?? row.observedAt).toISOString(),
    upPriceCents: row.up_price_cents ?? row.upPriceCents,
    downPriceCents: row.down_price_cents ?? row.downPriceCents,
    upAskPriceCents: row.up_ask_price_cents ?? row.upAskPriceCents ?? null,
    downAskPriceCents: row.down_ask_price_cents ?? row.downAskPriceCents ?? null,
    spreadBps: row.spread_bps ?? row.spreadBps,
    liquidityUsd: Number(row.liquidity_usd ?? row.liquidityUsd),
  };
}

export async function listMarketObservations(
  db: Queryable,
  marketId: string,
  from: Date,
  to: Date,
): Promise<MarketObservation[]> {
  const result: QueryResult = await db.query(
    `
      select
        market_id,
        market_type,
        observed_at,
        up_price_cents,
        down_price_cents,
        up_ask_price_cents,
        down_ask_price_cents,
        spread_bps,
        liquidity_usd
      from market_observations
      where market_id = $1
        and observed_at >= $2
        and observed_at <= $3
      order by observed_at asc
    `,
    [marketId, from.toISOString(), to.toISOString()],
  );

  return result.rows.map(mapMarketObservationRow);
}
