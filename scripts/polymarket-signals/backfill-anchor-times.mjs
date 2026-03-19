import "dotenv/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "pg";

const execFileAsync = promisify(execFile);

const databaseUrl = process.env.DATABASE_URL;
const rpcUrl = process.env.ANCHOR_RPC_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

if (!rpcUrl) {
  console.error("ANCHOR_RPC_URL is required");
  process.exit(1);
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

function extractAnchoredAt(receipt) {
  const direct = parseAnchoredAt(receipt?.blockTimestamp);

  if (direct) {
    return direct;
  }

  if (Array.isArray(receipt?.logs)) {
    for (const log of receipt.logs) {
      const fromLog = parseAnchoredAt(log?.blockTimestamp);

      if (fromLog) {
        return fromLog;
      }
    }
  }

  return null;
}

const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();

  const pending = await client.query(
    `
      select signal_id, anchor_tx_hash
      from signal_anchors
      where anchor_status = 'anchored'
        and anchor_tx_hash is not null
        and anchored_at is null
      order by created_at asc
    `,
  );

  let updated = 0;

  for (const row of pending.rows) {
    const { stdout } = await execFileAsync(
      "cast",
      ["receipt", row.anchor_tx_hash, "--rpc-url", rpcUrl, "--json"],
      {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024,
        env: process.env,
      },
    );

    const receipt = JSON.parse(stdout || "{}");
    const anchoredAt = extractAnchoredAt(receipt);

    if (!anchoredAt) {
      continue;
    }

    await client.query(
      `
        update signal_anchors
        set anchored_at = $2,
            updated_at = now()
        where signal_id = $1
      `,
      [row.signal_id, anchoredAt],
    );

    updated += 1;
  }

  console.log(JSON.stringify({ checked: pending.rowCount ?? 0, updated }, null, 2));
} finally {
  await client.end();
}
