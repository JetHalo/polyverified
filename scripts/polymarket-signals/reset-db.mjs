import "dotenv/config";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = `
  truncate table
    access_grants,
    purchases,
    signal_reveals,
    signal_commitment_witnesses,
    signal_anchors,
    zk_proofs,
    audit_events,
    signals,
    markets,
    agents
  restart identity cascade;
`;

const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();
  await client.query(sql);
  console.log("Database tables cleared.");
} finally {
  await client.end();
}
