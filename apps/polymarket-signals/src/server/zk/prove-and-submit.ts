import { zkVerifySession } from "zkverifyjs";

import type { CommitmentWitnessRecord, RuntimeConfig, SignalRecord } from "@/server/types";
import {
  buildCommitmentDraftBase,
  type CommitmentDraft,
} from "@/server/zk/commitment";
import { generateUltraHonkProofArtifacts, type NoirCircuitPaths } from "@/server/zk/noir";
import { submitUltraHonkProof, type MinimalZkVerifySession } from "@/server/zk/zkverify-client";

export interface SubmittedSignalProof {
  draft: CommitmentDraft;
  proofId: string;
  txHash: string | null;
  proofUrl: string | null;
  statement: string | null;
}

type SessionWithClose = MinimalZkVerifySession & {
  close?: () => Promise<void> | void;
  getAccount?: () => Promise<{ address: string }>;
};

type SessionFactory = (config: RuntimeConfig) => Promise<SessionWithClose>;
type GenerateProofArtifacts = typeof generateUltraHonkProofArtifacts;

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeRpcEndpoints(endpoint: string): { rpc: string; websocket: string } {
  if (endpoint.startsWith("ws://") || endpoint.startsWith("wss://")) {
    return {
      websocket: endpoint,
      rpc: endpoint.replace(/^ws/, "http"),
    };
  }

  return {
    rpc: endpoint,
    websocket: endpoint.replace(/^http/, "ws"),
  };
}

export function buildCommitmentDraftFromSignal(signal: SignalRecord, witness: CommitmentWitnessRecord): CommitmentDraft {
  const payload = buildCommitmentDraftBase({
    signalIdHash: witness.signalIdHash,
    agentSlugHash: witness.agentSlugHash,
    marketIdHash: witness.marketIdHash,
    direction: signal.direction,
    entryPriceCents: signal.entryPriceCents,
    predictedAtUnix: Math.floor(new Date(signal.predictedAt).getTime() / 1000),
    resolvesAtUnix: Math.floor(new Date(signal.resolvesAt).getTime() / 1000),
    salt: witness.salt,
  });

  if (payload.payload.commitmentVersion !== witness.commitmentVersion) {
    throw new Error(`Commitment version mismatch for signal ${signal.signalId}`);
  }

  return {
    ...payload,
    commitment: signal.commitment,
  };
}

export async function createZkVerifySession(config: RuntimeConfig): Promise<SessionWithClose> {
  if (!config.zk.rpcUrl) {
    throw new Error("ZKVERIFY_RPC_URL is required for proof submission");
  }

  if (!config.zk.seedPhrase) {
    throw new Error("ZKVERIFY_SEED is required for proof submission");
  }

  const { rpc, websocket } = normalizeRpcEndpoints(config.zk.rpcUrl);

  return zkVerifySession
    .start()
    .Custom({
      rpc,
      websocket,
      network: "zkVerify",
    })
    .withAccount(config.zk.seedPhrase) as unknown as Promise<SessionWithClose>;
}

export async function proveAndSubmitSignalReveal(input: {
  config: RuntimeConfig;
  signal: SignalRecord;
  witness: CommitmentWitnessRecord;
  circuitPaths?: NoirCircuitPaths;
  sessionFactory?: SessionFactory;
  generateProofArtifacts?: GenerateProofArtifacts;
}): Promise<SubmittedSignalProof> {
  if (input.signal.commitmentHashMode !== "poseidon2-field-v1") {
    throw new Error(`Signal ${input.signal.signalId} uses unsupported commitment mode ${input.signal.commitmentHashMode}`);
  }

  const draft = buildCommitmentDraftFromSignal(input.signal, input.witness);
  const generateProofArtifacts = input.generateProofArtifacts ?? generateUltraHonkProofArtifacts;
  const { proofData } = await generateProofArtifacts(draft, {
    paths: input.circuitPaths,
  });

  const sessionFactory = input.sessionFactory ?? createZkVerifySession;
  const session = await sessionFactory(input.config);

  try {
    const sessionAccount = await session.getAccount?.();
    const accountAddress = sessionAccount?.address ?? input.config.zk.accountAddress;
    const { transactionInfo } = await submitUltraHonkProof(session, {
      proofData,
      accountAddress,
    });

    const txHash = transactionInfo.txHash ?? null;
    const proofUrl =
      txHash && input.config.zk.explorerBaseUrl ? `${ensureTrailingSlash(input.config.zk.explorerBaseUrl)}${txHash}` : null;
    const proofId = transactionInfo.statement ?? txHash ?? input.signal.signalId;

    return {
      draft,
      proofId,
      txHash,
      proofUrl,
      statement: transactionInfo.statement ?? null,
    };
  } finally {
    await session.close?.();
  }
}
