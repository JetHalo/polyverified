import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { CommitmentPayload } from "@/server/zk/commitment";
import type { CommitmentAnchorRecord, RuntimeConfig, SignalRecord } from "@/server/types";

const execFileAsync = promisify(execFile);

interface RunCommandResult {
  stdout: string;
  stderr: string;
}

type RunCommand = (command: string, args: string[]) => Promise<RunCommandResult>;

const RECEIPT_RETRY_ATTEMPTS = 3;
const RECEIPT_RETRY_DELAY_MS = 250;

function defaultRunCommand(command: string, args: string[]): Promise<RunCommandResult> {
  return execFileAsync(command, args, {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024,
    env: process.env,
  });
}

function normalizePrivateKey(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function parseTxHash(stdout: string): string {
  const match = stdout.match(/0x[a-fA-F0-9]{64}/);

  if (!match) {
    throw new Error(`Failed to parse anchor tx hash from cast send output: ${stdout.trim() || "(empty)"}`);
  }

  return match[0];
}

function parseReceiptStatus(status: unknown): number {
  if (typeof status === "number") {
    return status;
  }

  if (typeof status === "string") {
    if (status.startsWith("0x")) {
      return Number.parseInt(status, 16);
    }

    return Number.parseInt(status, 10);
  }

  return Number.NaN;
}

function parseAnchoredAt(blockTimestamp: unknown): string | null {
  if (typeof blockTimestamp === "string") {
    const value = blockTimestamp.startsWith("0x")
      ? Number.parseInt(blockTimestamp, 16)
      : Number.parseInt(blockTimestamp, 10);

    if (Number.isFinite(value)) {
      return new Date(value * 1000).toISOString();
    }
  }

  if (typeof blockTimestamp === "number" && Number.isFinite(blockTimestamp)) {
    return new Date(blockTimestamp * 1000).toISOString();
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function loadReceipt(input: {
  runCommand: RunCommand;
  txHash: string;
  rpcUrl: string;
}): Promise<any> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < RECEIPT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const receiptResult = await input.runCommand("cast", [
        "receipt",
        input.txHash,
        "--rpc-url",
        input.rpcUrl,
        "--json",
      ]);

      return JSON.parse(receiptResult.stdout || "{}");
    } catch (error) {
      lastError = error;

      if (attempt < RECEIPT_RETRY_ATTEMPTS - 1) {
        await sleep(RECEIPT_RETRY_DELAY_MS);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to fetch anchor receipt");
}

function buildPendingAnchorRecord(input: {
  config: RuntimeConfig;
  signal: SignalRecord;
  txHash: string;
}): CommitmentAnchorRecord {
  return {
    signalId: input.signal.signalId,
    commitment: input.signal.commitment,
    anchorStatus: "pending",
    anchorTxHash: input.txHash,
    anchorExplorerUrl: `${input.config.anchor.explorerBaseUrl}${input.txHash}`,
    anchorChainId: input.config.anchor.chainId,
    anchorNetwork: input.config.anchor.network,
    anchorContractAddress: input.config.anchor.contractAddress,
    anchoredAt: null,
  };
}

export function decimalScalarToBytes32Hex(value: string): string {
  if (!/^\d+$/.test(value)) {
    throw new Error("Decimal scalar must contain only digits");
  }

  const hex = BigInt(value).toString(16);
  return `0x${hex.padStart(64, "0")}`;
}

export async function anchorSignalCommitment(input: {
  config: RuntimeConfig;
  signal: SignalRecord;
  payload: CommitmentPayload;
  existingAnchorTxHash?: string | null;
  runCommand?: RunCommand;
}): Promise<CommitmentAnchorRecord> {
  const contractAddress = input.config.anchor.contractAddress;
  const rpcUrl = input.config.anchor.rpcUrl;
  const signerPrivateKey = input.config.anchor.signerPrivateKey;

  if (!contractAddress) {
    throw new Error("ANCHOR_CONTRACT_ADDRESS is required when anchoring is enabled");
  }

  if (!rpcUrl) {
    throw new Error("ANCHOR_RPC_URL is required when anchoring is enabled");
  }

  if (!signerPrivateKey) {
    throw new Error("ANCHOR_SIGNER_PRIVATE_KEY is required when anchoring is enabled");
  }

  const runCommand = input.runCommand ?? defaultRunCommand;
  const existingAnchorTxHash = input.existingAnchorTxHash?.trim() || null;

  if (existingAnchorTxHash) {
    const receipt = await loadReceipt({
      runCommand,
      txHash: existingAnchorTxHash,
      rpcUrl,
    });
    const status = parseReceiptStatus(receipt.status);

    if (status !== 1) {
      throw new Error(`Anchor transaction failed: ${JSON.stringify(receipt) || "unknown error"}`);
    }

    return {
      signalId: input.signal.signalId,
      commitment: input.signal.commitment,
      anchorStatus: "anchored",
      anchorTxHash: existingAnchorTxHash,
      anchorExplorerUrl: `${input.config.anchor.explorerBaseUrl}${existingAnchorTxHash}`,
      anchorChainId: input.config.anchor.chainId,
      anchorNetwork: input.config.anchor.network,
      anchorContractAddress: contractAddress,
      anchoredAt: parseAnchoredAt(receipt.blockTimestamp),
    };
  }

  const commitmentHex = decimalScalarToBytes32Hex(input.signal.commitment);
  const signalIdHashHex = decimalScalarToBytes32Hex(input.payload.signalIdHash);
  const predictedAtUnix = String(input.payload.predictedAtUnix);
  const normalizedPrivateKey = normalizePrivateKey(signerPrivateKey);

  const sendResult = await runCommand("cast", [
    "send",
    contractAddress,
    "anchor(bytes32,bytes32,uint64)",
    commitmentHex,
    signalIdHashHex,
    predictedAtUnix,
    "--rpc-url",
    rpcUrl,
    "--private-key",
    normalizedPrivateKey,
    "--async",
  ]);

  const txHash = parseTxHash(sendResult.stdout);
  return buildPendingAnchorRecord({
    config: input.config,
    signal: input.signal,
    txHash,
  });
}
