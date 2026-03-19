import "dotenv/config";

const signalId = process.argv[2];

if (!signalId) {
  console.error("Usage: npm run zk:prove-signal -- <signal-id>");
  process.exit(1);
}

const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/internal/prove-signal/${signalId}`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
  },
});

if (!response.ok) {
  const body = await response.text();
  console.error(`Proof submit failed: ${response.status} ${body}`);
  process.exit(1);
}

const payload = await response.json();
console.log(JSON.stringify(payload, null, 2));
