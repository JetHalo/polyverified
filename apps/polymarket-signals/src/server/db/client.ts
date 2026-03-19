import { Pool } from "pg";

import type { RuntimeConfig } from "@/server/types";

let pool: Pool | null = null;

export function getPool(config: RuntimeConfig): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 5,
    });
  }

  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
