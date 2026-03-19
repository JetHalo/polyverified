import { UltrahonkVariant } from "zkverifyjs";

export interface UltraHonkProofData {
  proof: string;
  vk: string;
  publicSignals: string[];
}

export interface UltraHonkExecuteInput {
  proofData: UltraHonkProofData;
  domainId?: number;
}

export interface UltraHonkSubmitRequest {
  proofData: UltraHonkProofData;
  domainId?: number;
  registeredVk?: boolean;
  accountAddress?: string;
}

export interface MinimalVerifyResult {
  events: unknown;
  transactionResult: Promise<{
    txHash?: string;
    status: string;
    statement?: string | null;
  }>;
}

export interface MinimalUltraHonkVerifyBuilder {
  execute(input: UltraHonkExecuteInput): Promise<MinimalVerifyResult>;
  withRegisteredVk(): MinimalUltraHonkVerifyBuilder;
}

export interface MinimalZkVerifySession {
  verify(accountAddress?: string): {
    ultrahonk(config: { variant: UltrahonkVariant }): MinimalUltraHonkVerifyBuilder;
  };
}

function ensureHex(value: string, field: string): string {
  const normalized = value.trim();
  if (!/^0x[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`${field} must be a 0x-prefixed hex string`);
  }
  return normalized;
}

export function buildUltraHonkProofData(input: UltraHonkProofData): UltraHonkProofData {
  return {
    proof: ensureHex(input.proof, "proof"),
    vk: ensureHex(input.vk, "vk"),
    publicSignals: input.publicSignals.map((item, index) => ensureHex(item, `publicSignals[${index}]`)),
  };
}

export function buildUltraHonkExecuteInput(input: UltraHonkProofData & { domainId?: number }): UltraHonkExecuteInput {
  return {
    proofData: buildUltraHonkProofData(input),
    domainId: input.domainId,
  };
}

export async function submitUltraHonkProof(session: MinimalZkVerifySession, request: UltraHonkSubmitRequest) {
  const builder = session.verify(request.accountAddress).ultrahonk({
    variant: UltrahonkVariant.ZK,
  });

  const executable = request.registeredVk ? builder.withRegisteredVk() : builder;
  const { events, transactionResult } = await executable.execute(
    buildUltraHonkExecuteInput({
      ...request.proofData,
      domainId: request.domainId,
    }),
  );

  return {
    events,
    transactionInfo: await transactionResult,
  };
}
