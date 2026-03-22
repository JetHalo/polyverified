import "dotenv/config";

import { resolveAnchorWatchEnabled, resolveTickWatchIntervalMs } from "./tick-watch-lib.mjs";

const baseUrl = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const intervalMs = resolveTickWatchIntervalMs(process.env.TICK_INTERVAL_MS);
const enableAnchorWatch = resolveAnchorWatchEnabled(process.env.ENABLE_ANCHOR_WATCH);

async function runEndpointOnce(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${path} failed: ${response.status} ${body}`);
  }

  return response.json();
}

async function watchEndpoint(label, path) {
  console.log(`[${label}] polling ${baseUrl}${path} every ${intervalMs}ms`);

  while (true) {
    const startedAt = new Date();

    try {
      const payload = await runEndpointOnce(path);
      console.log(`[${label}] ${startedAt.toISOString()} ok`, JSON.stringify(payload));
    } catch (error) {
      console.error(
        `[${label}] ${startedAt.toISOString()} error`,
        error instanceof Error ? error.message : String(error),
      );
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function main() {
  const watchers = [watchEndpoint("tick:watch", "/api/internal/tick")];

  if (enableAnchorWatch) {
    watchers.push(watchEndpoint("anchor:watch", "/api/internal/retry-anchors"));
  }

  await Promise.all(watchers);
}

await main();
