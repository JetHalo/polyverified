import "dotenv/config";

import { resolveTickWatchIntervalMs } from "./tick-watch-lib.mjs";

const baseUrl = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const intervalMs = resolveTickWatchIntervalMs(process.env.TICK_INTERVAL_MS);

async function runOnce() {
  const response = await fetch(`${baseUrl}/api/internal/retry-anchors`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`/api/internal/retry-anchors failed: ${response.status} ${body}`);
  }

  return response.json();
}

async function main() {
  console.log(`[anchor:watch] polling ${baseUrl}/api/internal/retry-anchors every ${intervalMs}ms`);

  while (true) {
    const startedAt = new Date();

    try {
      const payload = await runOnce();
      console.log(`[anchor:watch] ${startedAt.toISOString()} ok`, JSON.stringify(payload));
    } catch (error) {
      console.error(
        `[anchor:watch] ${startedAt.toISOString()} error`,
        error instanceof Error ? error.message : String(error),
      );
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

await main();
