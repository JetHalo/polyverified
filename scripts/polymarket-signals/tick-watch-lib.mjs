export function resolveTickWatchIntervalMs(value) {
  if (value == null || String(value).trim() === "") {
    return 30_000;
  }

  const numeric = Number.parseInt(String(value), 10);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error("TICK_INTERVAL_MS must be a positive integer");
  }

  return numeric;
}
