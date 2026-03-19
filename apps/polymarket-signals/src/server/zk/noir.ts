import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import type { CommitmentDraft, CommitmentDraftBase, CommitmentPayload } from "@/server/zk/commitment";
import type { UltraHonkProofData } from "@/server/zk/zkverify-client";

const execFileAsync = promisify(execFile);
const BN254_FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

interface RunCommandOptions {
  cwd: string;
}

interface RunCommandResult {
  stdout: string;
  stderr: string;
}

type RunCommand = (command: string, args: string[], options: RunCommandOptions) => Promise<RunCommandResult>;

function defaultRunCommand(command: string, args: string[], options: RunCommandOptions): Promise<RunCommandResult> {
  return execFileAsync(command, args, {
    cwd: options.cwd,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
}

export interface NoirCircuitPaths {
  commitmentCircuitDir: string;
  proveCircuitDir: string;
}

export interface GeneratedProofArtifacts {
  proofData: UltraHonkProofData;
  outputDir: string;
}

function resolveProjectRoot(): string {
  const candidates = [
    process.cwd(),
    resolve(process.cwd(), ".."),
    resolve(process.cwd(), "../.."),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, "apps", "polymarket-signals")) && existsSync(join(candidate, "circuits"))) {
      return candidate;
    }
  }

  throw new Error("Unable to resolve project root for Noir circuits");
}

function resolveCircuitDir(projectRoot: string, directoryName: string): string {
  const circuitDir = join(projectRoot, "circuits", directoryName);

  if (!existsSync(circuitDir)) {
    throw new Error(`Circuit directory not found: ${circuitDir}`);
  }

  return circuitDir;
}

function serializeProverToml(entries: Record<string, string | number>): string {
  return `${Object.entries(entries)
    .map(([key, value]) => `${key} = "${String(value)}"`)
    .join("\n")}\n`;
}

function parseCircuitOutput(stdout: string): string {
  const match = stdout.match(/Circuit output:\s*Field\((-?\d+)\)/);

  if (!match) {
    throw new Error(`Unable to parse Noir circuit output from stdout: ${stdout.trim() || "(empty)"}`);
  }

  const rawValue = BigInt(match[1]);
  const normalizedValue = ((rawValue % BN254_FIELD_MODULUS) + BN254_FIELD_MODULUS) % BN254_FIELD_MODULUS;

  return normalizedValue.toString();
}

async function runNargoExecute(input: {
  circuitDir: string;
  proverToml: string;
  runCommand?: RunCommand;
}): Promise<{ witnessPath: string; stdout: string }> {
  const runCommand = input.runCommand ?? defaultRunCommand;
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const proverName = `Prover-${uniqueId}`;
  const witnessName = `witness-${uniqueId}`;
  const proverPath = join(input.circuitDir, `${proverName}.toml`);
  const witnessPath = join(input.circuitDir, "target", `${witnessName}.gz`);

  await writeFile(proverPath, input.proverToml, "utf8");

  try {
    const result = await runCommand("nargo", ["execute", witnessName, "--prover-name", proverName], {
      cwd: input.circuitDir,
    });

    return {
      witnessPath,
      stdout: result.stdout,
    };
  } finally {
    await rm(proverPath, { force: true });
  }
}

function commitmentPayloadToToml(payload: CommitmentPayload): string {
  return serializeProverToml({
    commitment_version: payload.commitmentVersion,
    signal_id_hash: payload.signalIdHash,
    agent_slug_hash: payload.agentSlugHash,
    market_id_hash: payload.marketIdHash,
    direction_bit: payload.directionBit,
    entry_price_cents: payload.entryPriceCents,
    predicted_at_unix: payload.predictedAtUnix,
    resolves_at_unix: payload.resolvesAtUnix,
    salt: payload.salt,
  });
}

function revealPayloadToToml(draft: CommitmentDraft): string {
  return serializeProverToml({
    commitment: draft.commitment,
    commitment_version: draft.payload.commitmentVersion,
    signal_id_hash: draft.payload.signalIdHash,
    agent_slug_hash: draft.payload.agentSlugHash,
    market_id_hash: draft.payload.marketIdHash,
    direction_bit: draft.payload.directionBit,
    entry_price_cents: draft.payload.entryPriceCents,
    predicted_at_unix: draft.payload.predictedAtUnix,
    resolves_at_unix: draft.payload.resolvesAtUnix,
    salt: draft.payload.salt,
  });
}

function readHexFile(path: string): Promise<string> {
  return readFile(path).then((buffer) => `0x${buffer.toString("hex")}`);
}

function readPublicSignals(path: string): Promise<string[]> {
  return readFile(path, "utf8").then((value) => JSON.parse(value) as string[]);
}

export function resolveNoirCircuitPaths(projectRoot = resolveProjectRoot()): NoirCircuitPaths {
  return {
    commitmentCircuitDir: resolveCircuitDir(projectRoot, "polymarket-commitment-hash-noir"),
    proveCircuitDir: resolveCircuitDir(projectRoot, "polymarket-commit-reveal-noir"),
  };
}

export async function computePoseidonCommitment(
  draft: CommitmentDraftBase,
  options: {
    paths?: NoirCircuitPaths;
    runCommand?: RunCommand;
  } = {},
): Promise<string> {
  const paths = options.paths ?? resolveNoirCircuitPaths();
  const result = await runNargoExecute({
    circuitDir: paths.commitmentCircuitDir,
    proverToml: commitmentPayloadToToml(draft.payload),
    runCommand: options.runCommand,
  });

  return parseCircuitOutput(result.stdout);
}

export async function generateUltraHonkProofArtifacts(
  draft: CommitmentDraft,
  options: {
    paths?: NoirCircuitPaths;
    runCommand?: RunCommand;
    outputDir?: string;
  } = {},
): Promise<GeneratedProofArtifacts> {
  const runCommand = options.runCommand ?? defaultRunCommand;
  const paths = options.paths ?? resolveNoirCircuitPaths();
  const outputDir = options.outputDir ?? (await mkdtemp(join(tmpdir(), "polymarket-proof-")));
  const bytecodePath = join(paths.proveCircuitDir, "target", "polymarket_commit_reveal.json");

  const { witnessPath } = await runNargoExecute({
    circuitDir: paths.proveCircuitDir,
    proverToml: revealPayloadToToml(draft),
    runCommand,
  });

  try {
    await runCommand(
      "bb",
      [
        "write_vk",
        "--scheme",
        "ultra_honk",
        "-b",
        bytecodePath,
        "-o",
        outputDir,
        "--oracle_hash",
        "keccak",
        "--output_format",
        "bytes",
      ],
      {
        cwd: paths.proveCircuitDir,
      },
    );

    await runCommand(
      "bb",
      [
        "prove",
        "--scheme",
        "ultra_honk",
        "-b",
        bytecodePath,
        "-w",
        witnessPath,
        "-o",
        outputDir,
        "--oracle_hash",
        "keccak",
        "--zk",
        "--output_format",
        "bytes_and_fields",
      ],
      {
        cwd: paths.proveCircuitDir,
      },
    );

    const [proof, vk, publicSignals] = await Promise.all([
      readHexFile(join(outputDir, "proof")),
      readHexFile(join(outputDir, "vk")),
      readPublicSignals(join(outputDir, "public_inputs_fields.json")),
    ]);

    return {
      proofData: {
        proof,
        vk,
        publicSignals,
      },
      outputDir,
    };
  } finally {
    await rm(witnessPath, { force: true });
  }
}
