import type { Pool } from "pg";

import type { DemoAccessGrant, DemoPurchase, DemoSignal } from "@/server/repository/demo-store";
import type { SignalProposal } from "@/server/signals/create-signal";
import type { FinalizeSignalResult } from "@/server/signals/finalize-signal";
import type { CommitmentAnchorRecord, CommitmentHashMode, CommitmentWitnessRecord, SignalProofState, SignalRevealRecord } from "@/server/types";
import { createAccessGrantFromPayment, type PaidUnlockInput } from "@/server/x402/access";

type Queryable = Pick<Pool, "query">;

function confidenceToBucket(value: number): DemoSignal["confidence"] {
  if (value >= 0.8) {
    return "High";
  }
  if (value >= 0.65) {
    return "Medium-High";
  }
  if (value >= 0.45) {
    return "Medium";
  }
  return "Low";
}

function normalizeProofState(value: string | null | undefined): DemoSignal["proofState"] {
  if (value === "verified" || value === "revealed" || value === "failed") {
    return value;
  }
  return "committed";
}

function mapSignalRow(row: any): DemoSignal {
  const entryPriceCents = row.entry_price_cents ?? row.entryPriceCents;
  const proofState = normalizeProofState(row.proof_state ?? row.proofState ?? row.commitment_status ?? row.commitmentStatus);
  const confidence = Number(row.confidence ?? row.signal_confidence ?? 0);
  const commitment = row.commitment ?? row.commit_hash ?? row.commitHash;
  const proofReference = row.proof_reference ?? row.proofReference ?? row.proof_id ?? row.proofId;
  const proofUrl = row.zkverify_url ?? row.proof_url ?? row.proofUrl ?? null;
  const anchorStatus = row.anchor_status ?? row.anchorStatus ?? undefined;
  const anchorTxHash = row.anchor_tx_hash ?? row.anchorTxHash ?? null;
  const anchorExplorerUrl = row.anchor_explorer_url ?? row.anchorExplorerUrl ?? null;
  const anchoredAt = row.anchored_at ? new Date(row.anchored_at).toISOString() : null;

  return {
    id: row.signal_id ?? row.signalId,
    market: row.market_type ?? row.marketType,
    direction: row.direction,
    committedAt: new Date(row.predicted_at ?? row.predictedAt).toISOString(),
    resolvesAt: new Date(row.resolves_at ?? row.resolvesAt).toISOString(),
    revealedAt: row.revealed_at ? new Date(row.revealed_at).toISOString() : null,
    proofState,
    entryPrice: typeof entryPriceCents === "number" ? Number((entryPriceCents / 100).toFixed(4)) : undefined,
    outcome: row.outcome ?? undefined,
    commitHash: commitment ?? undefined,
    anchorStatus,
    anchorTxHash,
    anchorExplorerUrl,
    anchoredAt,
    proofHash: proofReference ?? undefined,
    isPremium: Boolean(row.is_premium ?? row.isPremium),
    agentSlug: row.agent_slug ?? row.agentSlug,
    agentName: row.agent_name ?? row.agentName ?? `${row.market_type ?? row.marketType} Agent`,
    confidence: confidenceToBucket(confidence),
    explanation: row.explanation ?? "",
    proofUrl,
  };
}

function mapPurchaseRow(row: any): DemoPurchase {
  return {
    purchaseId: row.purchase_id ?? row.purchaseId,
    walletAddress: row.wallet_address ?? row.walletAddress,
    signalId: row.signal_id ?? row.signalId,
    paymentNetwork: row.payment_network ?? row.paymentNetwork,
    paymentToken: row.payment_token ?? row.paymentToken,
    paymentAmount: row.payment_amount ?? row.paymentAmount,
    paymentStatus: row.payment_status ?? row.paymentStatus,
    paymentScheme: row.payment_scheme ?? row.paymentScheme ?? "x402-exact-evm",
    paymentTxHash: row.payment_tx_hash ?? row.paymentTxHash ?? null,
    paymentPayer: row.payment_payer ?? row.paymentPayer ?? null,
    treasuryAddress: row.treasury_address ?? row.treasuryAddress,
    createdAt: new Date(row.created_at ?? row.createdAt).toISOString(),
  };
}

function mapAccessGrantRow(row: any): DemoAccessGrant {
  return {
    grantId: row.grant_id ?? row.grantId,
    walletAddress: row.wallet_address ?? row.walletAddress,
    signalId: row.signal_id ?? row.signalId,
    purchaseId: row.purchase_id ?? row.purchaseId,
    createdAt: new Date(row.created_at ?? row.createdAt).toISOString(),
  };
}

const SIGNAL_LIST_SQL = `
  select
    s.signal_id,
    s.agent_slug,
    s.market_type,
    s.direction,
    s.predicted_at,
    s.resolves_at,
    s.entry_price_cents,
    s.confidence,
    s.explanation,
    s.commitment,
    s.commitment_hash_mode,
    s.commitment_status,
    s.is_premium,
    sa.anchor_status,
    sa.anchor_tx_hash,
    sa.anchor_explorer_url,
    sa.anchored_at,
    sr.revealed_at,
    sr.outcome,
    coalesce(zp.proof_status, sr.proof_state, s.commitment_status) as proof_state,
    coalesce(zp.proof_reference, zp.proof_id, sr.proof_id, sr.zk_tx_hash) as proof_reference,
    coalesce(zp.zkverify_url, sr.zkverify_url) as zkverify_url
  from signals s
  left join signal_anchors sa on sa.signal_id = s.signal_id
  left join signal_reveals sr on sr.signal_id = s.signal_id
  left join zk_proofs zp on zp.signal_id = s.signal_id
`;

export async function listDbLiveSignals(db: Queryable): Promise<DemoSignal[]> {
  const result = await db.query(
    `with current_markets as (
       select
         market_type,
         max(updated_at) as latest_updated_at
       from markets
       group by market_type
     )
     ${SIGNAL_LIST_SQL}
      inner join markets m on m.market_id = s.market_id
      inner join current_markets cm
        on cm.market_type = m.market_type
       and cm.latest_updated_at = m.updated_at
      where s.commitment_status in ('committed', 'revealed')
      order by m.resolves_at asc, s.predicted_at desc`,
  );

  return result.rows.map(mapSignalRow);
}

export async function listDbHistoricalSignals(db: Queryable): Promise<DemoSignal[]> {
  const result = await db.query(
    `${SIGNAL_LIST_SQL}
      where sr.signal_id is not null
      order by s.predicted_at desc`,
  );

  return result.rows.map(mapSignalRow);
}

export async function listDbAllSignals(db: Queryable): Promise<DemoSignal[]> {
  const result = await db.query(`${SIGNAL_LIST_SQL} order by s.predicted_at desc`);
  return result.rows.map(mapSignalRow);
}

export async function getDbSignalById(db: Queryable, signalId: string): Promise<DemoSignal | null> {
  const result = await db.query(`${SIGNAL_LIST_SQL} where s.signal_id = $1`, [signalId]);
  return result.rows[0] ? mapSignalRow(result.rows[0]) : null;
}

export async function listDbSignalsForAgent(db: Queryable, agentSlug: string): Promise<DemoSignal[]> {
  const result = await db.query(`${SIGNAL_LIST_SQL} where s.agent_slug = $1 order by s.predicted_at desc`, [agentSlug]);
  return result.rows.map(mapSignalRow);
}

export async function listDbPurchases(db: Queryable, walletAddress: string): Promise<DemoPurchase[]> {
  const result = await db.query(
    `
      select
        purchase_id,
        wallet_address,
        signal_id,
        payment_network,
        payment_token,
        payment_amount,
        payment_status,
        payment_scheme,
        payment_tx_hash,
        payment_payer,
        treasury_address,
        created_at
      from purchases
      where lower(wallet_address) = lower($1)
      order by created_at desc
    `,
    [walletAddress],
  );

  return result.rows.map(mapPurchaseRow);
}

export async function listDbAccessGrants(db: Queryable, walletAddress: string): Promise<DemoAccessGrant[]> {
  const result = await db.query(
    `
      select
        grant_id,
        wallet_address,
        signal_id,
        purchase_id,
        created_at
      from access_grants
      where lower(wallet_address) = lower($1)
      order by created_at desc
    `,
    [walletAddress],
  );

  return result.rows.map(mapAccessGrantRow);
}

export async function hasDbSignalAccess(db: Queryable, walletAddress: string | null | undefined, signalId: string): Promise<boolean> {
  if (!walletAddress) {
    return false;
  }

  const result = await db.query(
    `
      select 1
      from access_grants
      where lower(wallet_address) = lower($1)
        and signal_id = $2
      limit 1
    `,
    [walletAddress, signalId],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function listDbLibrarySignals(db: Queryable, walletAddress: string): Promise<DemoSignal[]> {
  const result = await db.query(
    `${SIGNAL_LIST_SQL}
      inner join access_grants ag on ag.signal_id = s.signal_id
      where lower(ag.wallet_address) = lower($1)
      order by ag.created_at desc`,
    [walletAddress],
  );

  return result.rows.map(mapSignalRow);
}

export async function insertDbSignalProposal(db: Queryable, proposal: SignalProposal): Promise<void> {
  await db.query(
    `
      insert into signals (
        signal_id,
        agent_slug,
        market_id,
        market_type,
        direction,
        entry_price_cents,
        confidence,
        explanation,
        predicted_at,
        resolves_at,
        commitment,
        commitment_hash_mode,
        commitment_status,
        is_premium
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      on conflict (signal_id) do update set
        direction = excluded.direction,
        entry_price_cents = excluded.entry_price_cents,
        confidence = excluded.confidence,
        explanation = excluded.explanation,
        predicted_at = excluded.predicted_at,
        resolves_at = excluded.resolves_at,
        commitment = excluded.commitment,
        commitment_hash_mode = excluded.commitment_hash_mode,
        commitment_status = excluded.commitment_status,
        is_premium = excluded.is_premium
    `,
    [
      proposal.signal.signalId,
      proposal.signal.agentSlug,
      proposal.signal.marketId,
      proposal.signal.marketType,
      proposal.signal.direction,
      proposal.signal.entryPriceCents,
      proposal.confidence,
      proposal.explanation,
      proposal.signal.predictedAt,
      proposal.signal.resolvesAt,
      proposal.signal.commitment,
      proposal.signal.commitmentHashMode,
      proposal.signal.commitmentStatus,
      proposal.signal.isPremium,
    ],
  );

  await db.query(
    `
      insert into signal_commitment_witnesses (
        signal_id,
        signal_id_hash,
        agent_slug_hash,
        market_id_hash,
        commitment_version,
        salt,
        updated_at
      ) values ($1, $2, $3, $4, $5, $6, now())
      on conflict (signal_id) do update set
        signal_id_hash = excluded.signal_id_hash,
        agent_slug_hash = excluded.agent_slug_hash,
        market_id_hash = excluded.market_id_hash,
        commitment_version = excluded.commitment_version,
        salt = excluded.salt,
        updated_at = now()
    `,
    [
      proposal.signal.signalId,
      proposal.payload.signalIdHash,
      proposal.payload.agentSlugHash,
      proposal.payload.marketIdHash,
      proposal.payload.commitmentVersion,
      proposal.payload.salt,
    ],
  );
}

export async function getDbSignalCommitmentWitness(
  db: Queryable,
  signalId: string,
): Promise<CommitmentWitnessRecord | null> {
  const result = await db.query(
    `
      select
        signal_id,
        signal_id_hash,
        agent_slug_hash,
        market_id_hash,
        commitment_version,
        salt
      from signal_commitment_witnesses
      where signal_id = $1
      limit 1
    `,
    [signalId],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    signalId: row.signal_id,
    signalIdHash: row.signal_id_hash,
    agentSlugHash: row.agent_slug_hash,
    marketIdHash: row.market_id_hash,
    commitmentVersion: row.commitment_version,
    salt: row.salt,
  };
}

export async function getDbSignalRevealRecord(
  db: Queryable,
  signalId: string,
): Promise<SignalRevealRecord | null> {
  const result = await db.query(
    `
      select
        signal_id,
        revealed_at,
        outcome,
        simulated_pnl_cents,
        proof_state,
        proof_id,
        zk_tx_hash,
        zkverify_url
      from signal_reveals
      where signal_id = $1
      limit 1
    `,
    [signalId],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    signalId: row.signal_id,
    revealedAt: new Date(row.revealed_at).toISOString(),
    outcome: row.outcome,
    simulatedPnlCents: row.simulated_pnl_cents,
    proofState: row.proof_state,
    proofId: row.proof_id ?? null,
    txHash: row.zk_tx_hash ?? null,
    proofUrl: row.zkverify_url ?? null,
  };
}

export async function upsertDbSignalAnchor(
  db: Queryable,
  anchor: CommitmentAnchorRecord,
  commitmentHashMode: CommitmentHashMode,
): Promise<void> {
  await db.query(
    `
      insert into signal_anchors (
        signal_id,
        commitment,
        commitment_hash_mode,
        anchor_status,
        anchor_chain_id,
        anchor_network,
        anchor_contract_address,
        anchor_tx_hash,
        anchor_explorer_url,
        anchored_at,
        updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
      on conflict (signal_id) do update set
        commitment = excluded.commitment,
        commitment_hash_mode = excluded.commitment_hash_mode,
        anchor_status = excluded.anchor_status,
        anchor_chain_id = excluded.anchor_chain_id,
        anchor_network = excluded.anchor_network,
        anchor_contract_address = excluded.anchor_contract_address,
        anchor_tx_hash = excluded.anchor_tx_hash,
        anchor_explorer_url = excluded.anchor_explorer_url,
        anchored_at = excluded.anchored_at,
        updated_at = now()
    `,
    [
      anchor.signalId,
      anchor.commitment,
      commitmentHashMode,
      anchor.anchorStatus,
      anchor.anchorChainId,
      anchor.anchorNetwork,
      anchor.anchorContractAddress,
      anchor.anchorTxHash,
      anchor.anchorExplorerUrl,
      anchor.anchoredAt,
    ],
  );
}

export async function applyDbRevealPackage(db: Queryable, finalized: FinalizeSignalResult): Promise<void> {
  const proofStatus = finalized.proof.proofStatus;

  await db.query(`update signals set commitment_status = $2 where signal_id = $1`, [
    finalized.revealed.signalId,
    proofStatus,
  ]);

  await db.query(
    `
      insert into signal_reveals (
        signal_id,
        revealed_at,
        outcome,
        simulated_pnl_cents,
        proof_state,
        proof_id,
        zk_tx_hash,
        zkverify_url
      ) values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict (signal_id) do update set
        revealed_at = excluded.revealed_at,
        outcome = excluded.outcome,
        simulated_pnl_cents = excluded.simulated_pnl_cents,
        proof_state = excluded.proof_state,
        proof_id = excluded.proof_id,
        zk_tx_hash = excluded.zk_tx_hash,
        zkverify_url = excluded.zkverify_url
    `,
    [
      finalized.revealed.signalId,
      finalized.revealed.revealedAt,
      finalized.revealed.outcome,
      finalized.revealed.simulatedPnlCents,
      finalized.proof.proofStatus,
      finalized.proof.proofId,
      finalized.proof.txHash,
      finalized.proof.proofUrl,
    ],
  );

  if (finalized.proof.proofId) {
    await db.query(
      `
        insert into zk_proofs (
          proof_id,
          signal_id,
          proof_system,
          verification_mode,
          proof_status,
          tx_hash,
          zkverify_url,
          updated_at
        ) values ($1, $2, 'ultrahonk', 'zkverifyjs-non-aggregation', $3, $4, $5, now())
        on conflict (proof_id) do update set
          proof_status = excluded.proof_status,
          tx_hash = excluded.tx_hash,
          zkverify_url = excluded.zkverify_url,
          updated_at = now()
      `,
      [
        finalized.proof.proofId,
        finalized.revealed.signalId,
        finalized.proof.proofStatus,
        finalized.proof.txHash,
        finalized.proof.proofUrl,
      ],
    );
  }
}

export async function applyDbSignalProofResult(
  db: Queryable,
  input: {
    signalId: string;
    proofId?: string | null;
    txHash?: string | null;
    proofUrl?: string | null;
    proofStatus: Extract<SignalProofState, "revealed" | "verified" | "failed">;
  },
): Promise<void> {
  await db.query(`update signals set commitment_status = $2 where signal_id = $1`, [input.signalId, input.proofStatus]);

  await db.query(
    `
      update signal_reveals
      set proof_state = $2,
          proof_id = $3,
          zk_tx_hash = $4,
          zkverify_url = $5
      where signal_id = $1
    `,
    [input.signalId, input.proofStatus, input.proofId ?? null, input.txHash ?? null, input.proofUrl ?? null],
  );

  if (input.proofId) {
    await db.query(
      `
        insert into zk_proofs (
          proof_id,
          signal_id,
          proof_system,
          verification_mode,
          proof_status,
          tx_hash,
          zkverify_url,
          updated_at
        ) values ($1, $2, 'ultrahonk', 'zkverifyjs-non-aggregation', $3, $4, $5, now())
        on conflict (proof_id) do update set
          proof_status = excluded.proof_status,
          tx_hash = excluded.tx_hash,
          zkverify_url = excluded.zkverify_url,
          updated_at = now()
      `,
      [input.proofId, input.signalId, input.proofStatus, input.txHash ?? null, input.proofUrl ?? null],
    );
  }
}

export async function createDbPurchaseAndGrant(
  db: Queryable,
  input: PaidUnlockInput,
  options: {
    now?: Date;
    randomId?: () => string;
  } = {},
): Promise<{ purchase: DemoPurchase; grant: DemoAccessGrant }> {
  const { purchase, grant } = createAccessGrantFromPayment(input, options);

  if (purchase.paymentTxHash) {
    const existingPurchaseResult = await db.query(
      `
        select
          purchase_id,
          wallet_address,
          signal_id,
          payment_network,
          payment_token,
          payment_amount,
          payment_status,
          payment_scheme,
          payment_tx_hash,
          payment_payer,
          treasury_address,
          created_at
        from purchases
        where payment_tx_hash = $1
        limit 1
      `,
      [purchase.paymentTxHash],
    );

    if (existingPurchaseResult.rows[0]) {
      const existingPurchase = mapPurchaseRow(existingPurchaseResult.rows[0]);
      const existingGrantResult = await db.query(
        `
          insert into access_grants (
            grant_id,
            wallet_address,
            signal_id,
            purchase_id,
            created_at
          ) values ($1, $2, $3, $4, $5)
          on conflict (wallet_address, signal_id) do update set
            purchase_id = excluded.purchase_id,
            created_at = excluded.created_at
          returning grant_id, wallet_address, signal_id, purchase_id, created_at
        `,
        [grant.grantId, grant.walletAddress, grant.signalId, existingPurchase.purchaseId, grant.createdAt],
      );

      return {
        purchase: existingPurchase,
        grant: mapAccessGrantRow(existingGrantResult.rows[0]),
      };
    }
  }

  await db.query(
    `
      insert into purchases (
        purchase_id,
        wallet_address,
        signal_id,
        payment_network,
        payment_token,
        payment_amount,
        payment_status,
        payment_scheme,
        payment_tx_hash,
        payment_payer,
        treasury_address,
        created_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `,
    [
      purchase.purchaseId,
      purchase.walletAddress,
      purchase.signalId,
      purchase.paymentNetwork,
      purchase.paymentToken,
      purchase.paymentAmount,
      purchase.paymentStatus,
      purchase.paymentScheme,
      purchase.paymentTxHash,
      purchase.paymentPayer,
      purchase.treasuryAddress,
      purchase.createdAt,
    ],
  );

  await db.query(
    `
      insert into access_grants (
        grant_id,
        wallet_address,
        signal_id,
        purchase_id,
        created_at
      ) values ($1, $2, $3, $4, $5)
      on conflict (wallet_address, signal_id) do update set
        purchase_id = excluded.purchase_id,
        created_at = excluded.created_at
    `,
    [
      grant.grantId,
      grant.walletAddress,
      grant.signalId,
      grant.purchaseId,
      grant.createdAt,
    ],
  );

  return { purchase, grant };
}
