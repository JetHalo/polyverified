import type { CommitmentHashMode, Direction } from "@/server/types";

export const COMMITMENT_VERSION = 1;
export const COMMITMENT_HASH_MODE: CommitmentHashMode = "poseidon2-field-v1";
export const BN254_FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export interface CommitmentPayloadInput {
  signalIdHash: string;
  agentSlugHash: string;
  marketIdHash: string;
  direction: Direction;
  entryPriceCents: number;
  predictedAtUnix: number;
  resolvesAtUnix: number;
  salt: string;
}

export interface CommitmentPayload {
  commitmentVersion: number;
  signalIdHash: string;
  agentSlugHash: string;
  marketIdHash: string;
  directionBit: 0 | 1;
  entryPriceCents: number;
  predictedAtUnix: number;
  resolvesAtUnix: number;
  salt: string;
}

export interface CommitmentDraftBase {
  payload: CommitmentPayload;
  vector: string[];
  seed: string;
  hashMode: CommitmentHashMode;
}

export interface CommitmentDraft extends CommitmentDraftBase {
  commitment: string;
}

export type CommitmentResolver = (draft: CommitmentDraftBase) => Promise<string>;

export function directionToBit(direction: Direction): 0 | 1 {
  return direction === "Up" ? 1 : 0;
}

function assertScalarLike(value: string, field: string): void {
  if (!value || !/^\d+$/.test(value)) {
    throw new Error(`${field} must be a decimal scalar string`);
  }
}

export function normalizeFieldScalar(value: string, field: string): string {
  assertScalarLike(value, field);

  return (BigInt(value) % BN254_FIELD_MODULUS).toString();
}

export function buildCommitmentPayload(input: CommitmentPayloadInput): CommitmentPayload {
  const signalIdHash = normalizeFieldScalar(input.signalIdHash, "signalIdHash");
  const agentSlugHash = normalizeFieldScalar(input.agentSlugHash, "agentSlugHash");
  const marketIdHash = normalizeFieldScalar(input.marketIdHash, "marketIdHash");
  const salt = normalizeFieldScalar(input.salt, "salt");

  if (!Number.isInteger(input.entryPriceCents) || input.entryPriceCents < 10 || input.entryPriceCents > 90) {
    throw new Error("entryPriceCents must be an integer between 10 and 90");
  }

  if (!Number.isInteger(input.predictedAtUnix) || !Number.isInteger(input.resolvesAtUnix)) {
    throw new Error("predictedAtUnix and resolvesAtUnix must be integers");
  }

  if (input.predictedAtUnix >= input.resolvesAtUnix) {
    throw new Error("predictedAtUnix must be earlier than resolvesAtUnix");
  }

  return {
    commitmentVersion: COMMITMENT_VERSION,
    signalIdHash,
    agentSlugHash,
    marketIdHash,
    directionBit: directionToBit(input.direction),
    entryPriceCents: input.entryPriceCents,
    predictedAtUnix: input.predictedAtUnix,
    resolvesAtUnix: input.resolvesAtUnix,
    salt,
  };
}

export function buildCommitmentVector(payload: CommitmentPayload): string[] {
  return [
    String(payload.commitmentVersion),
    payload.signalIdHash,
    payload.agentSlugHash,
    payload.marketIdHash,
    String(payload.directionBit),
    String(payload.entryPriceCents),
    String(payload.predictedAtUnix),
    String(payload.resolvesAtUnix),
    payload.salt,
  ];
}

export function buildCanonicalCommitmentSeed(payload: CommitmentPayload): string {
  return buildCommitmentVector(payload).join("|");
}

export function buildCommitmentDraftBase(input: CommitmentPayloadInput): CommitmentDraftBase {
  const payload = buildCommitmentPayload(input);

  return {
    payload,
    vector: buildCommitmentVector(payload),
    seed: buildCanonicalCommitmentSeed(payload),
    hashMode: COMMITMENT_HASH_MODE,
  };
}

export async function buildCommitmentDraft(
  input: CommitmentPayloadInput,
  resolveCommitment: CommitmentResolver,
): Promise<CommitmentDraft> {
  const draft = buildCommitmentDraftBase(input);
  const commitment = await resolveCommitment(draft);

  if (!/^\d+$/.test(commitment)) {
    throw new Error("Resolved commitment must be a decimal scalar string");
  }

  return {
    ...draft,
    commitment,
  };
}
