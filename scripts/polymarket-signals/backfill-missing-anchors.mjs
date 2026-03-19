import "dotenv/config";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "pg";

const execFileAsync = promisify(execFile);

const databaseUrl = process.env.DATABASE_URL;
const contractAddress = process.env.ANCHOR_CONTRACT_ADDRESS;
const rpcUrl = process.env.ANCHOR_RPC_URL;
const signerPrivateKey = process.env.ANCHOR_SIGNER_PRIVATE_KEY ?? process.env.ANCHOR_DEPLOYER_PRIVATE_KEY;
const explorerBaseUrl = process.env.ANCHOR_EXPLORER_BASE_URL?.trim() || "https://sepolia.basescan.org/tx/";
const anchorChainId = Number.parseInt(process.env.ANCHOR_CHAIN_ID?.trim() || "", 10) || 84532;
const anchorNetwork = process.env.ANCHOR_NETWORK?.trim() || "base-sepolia";

if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

if (!contractAddress) {
  console.error("ANCHOR_CONTRACT_ADDRESS is required");
  process.exit(1);
}

if (!rpcUrl) {
  console.error("ANCHOR_RPC_URL is required");
  process.exit(1);
}

if (!signerPrivateKey) {
  console.error("ANCHOR_SIGNER_PRIVATE_KEY is required");
  process.exit(1);
}

function toScalar(seed) {
  const digest = createHash("sha256").update(seed).digest("hex");
  return BigInt(`0x${digest}`).toString(10);
}

function decimalScalarToBytes32Hex(value) {
  if (!/^\d+$/.test(value)) {
    throw new Error("Decimal scalar must contain only digits");
  }

  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

function normalizePrivateKey(value) {
  const trimmed = value.trim();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function parseTxHash(stdout) {
  const match = stdout.match(/0x[a-fA-F0-9]{64}/);

  if (!match) {
    throw new Error(`Failed to parse anchor tx hash from cast send output: ${stdout.trim() || "(empty)"}`);
  }

  return match[0];
}

function parseReceiptStatus(status) {
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

function parseAnchoredAt(blockTimestamp) {
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

const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();

  const pending = await client.query(
    `
      select
        s.signal_id,
        s.commitment,
        s.commitment_hash_mode,
        s.predicted_at
      from signals s
      left join signal_anchors sa on sa.signal_id = s.signal_id
      where s.commitment_status in ('committed', 'revealed')
        and sa.signal_id is null
      order by s.predicted_at asc
    `,
  );

  let anchored = 0;

  for (const row of pending.rows) {
    const signalIdHash = toScalar(`${row.signal_id}:signal`);
    const predictedAtUnix = Math.floor(new Date(row.predicted_at).getTime() / 1000);

    const sendResult = await execFileAsync(
      "cast",
      [
        "send",
        contractAddress,
        "anchor(bytes32,bytes32,uint64)",
        decimalScalarToBytes32Hex(row.commitment),
        decimalScalarToBytes32Hex(signalIdHash),
        String(predictedAtUnix),
        "--rpc-url",
        rpcUrl,
        "--private-key",
        normalizePrivateKey(signerPrivateKey),
        "--async",
      ],
      {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024,
        env: process.env,
      },
    );

    const txHash = parseTxHash(sendResult.stdout);

    const receiptResult = await execFileAsync(
      "cast",
      ["receipt", txHash, "--rpc-url", rpcUrl, "--json"],
      {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024,
        env: process.env,
      },
    );

    const receipt = JSON.parse(receiptResult.stdout || "{}");
    const status = parseReceiptStatus(receipt.status);

    if (status !== 1) {
      throw new Error(`Anchor transaction failed for ${row.signal_id}: ${receiptResult.stdout.trim() || "unknown error"}`);
    }

    await client.query(
      `
        insert into signal_anchors (
          signal_id,
          commitment,
          commitment_hash_mode,
          anchor_status,
          anchor_tx_hash,
          anchor_explorer_url,
          anchor_chain_id,
          anchor_network,
          anchor_contract_address,
          anchored_at
        ) values ($1, $2, $3, 'anchored', $4, $5, $6, $7, $8, $9)
        on conflict (signal_id) do update set
          commitment = excluded.commitment,
          commitment_hash_mode = excluded.commitment_hash_mode,
          anchor_status = excluded.anchor_status,
          anchor_tx_hash = excluded.anchor_tx_hash,
          anchor_explorer_url = excluded.anchor_explorer_url,
          anchor_chain_id = excluded.anchor_chain_id,
          anchor_network = excluded.anchor_network,
          anchor_contract_address = excluded.anchor_contract_address,
          anchored_at = excluded.anchored_at,
          updated_at = now()
      `,
      [
        row.signal_id,
        row.commitment,
        row.commitment_hash_mode,
        txHash,
        `${explorerBaseUrl}${txHash}`,
        anchorChainId,
        anchorNetwork,
        contractAddress,
        parseAnchoredAt(receipt.blockTimestamp),
      ],
    );

    anchored += 1;
  }

  console.log(JSON.stringify({ checked: pending.rowCount ?? 0, anchored }, null, 2));
} finally {
  await client.end();
}
