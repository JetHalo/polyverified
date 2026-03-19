import "dotenv/config";

const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
const now = process.argv[2];

const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/internal/tick`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
  },
  body: JSON.stringify(now ? { now } : {}),
});

if (!response.ok) {
  const body = await response.text();
  console.error(`Tick failed: ${response.status} ${body}`);
  process.exit(1);
}

const payload = await response.json();
console.log(JSON.stringify(payload, null, 2));
