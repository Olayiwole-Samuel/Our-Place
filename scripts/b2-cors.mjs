#!/usr/bin/env node
/**
 * One-time Backblaze B2 setup: lets the Our Place website upload videos
 * straight to your bucket (a CORS rule), using the keys in .env / .env.local.
 *
 *   node scripts/b2-cors.mjs [--origin https://another-domain.example]
 *
 * Allowed: https://our-place-tau.vercel.app, http://localhost:3000 and any
 * --origin you add. Operations: upload (PUT), download (GET/HEAD). Nothing
 * else about the bucket changes (it stays private). Keys are never printed.
 */
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const extraOrigins = args.flatMap((value, i) => (args[i - 1] === "--origin" ? [value.replace(/\/$/, "")] : []));

function env(name) {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    const line = readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
    if (line) return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return process.env[name];
}

const keyId = env("B2_KEY_ID");
const appKey = env("B2_APPLICATION_KEY");
const bucketName = env("B2_BUCKET");
if (!keyId || !appKey || !bucketName) {
  console.error("Set B2_KEY_ID, B2_APPLICATION_KEY and B2_BUCKET in .env first.");
  process.exit(1);
}

const auth = await fetch("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", {
  headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${appKey}`).toString("base64")}` },
});
if (!auth.ok) {
  console.error(`Backblaze refused the key (HTTP ${auth.status}). Check B2_KEY_ID / B2_APPLICATION_KEY.`);
  process.exit(1);
}
const account = await auth.json();
const api = account.apiInfo.storageApi;
const call = async (name, body) => {
  const response = await fetch(`${api.apiUrl}/b2api/v3/${name}`, { method: "POST", headers: { Authorization: account.authorizationToken, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.message || `HTTP ${response.status}`), { status: response.status, code: data.code });
  return data;
};

let bucket;
try {
  ({ buckets: [bucket] = [] } = await call("b2_list_buckets", { accountId: account.accountId, bucketName }));
} catch (error) {
  console.error(`Couldn't find the bucket: ${error.message}`);
  process.exit(1);
}
if (!bucket) {
  console.error(`No bucket named "${bucketName}" for this key.`);
  process.exit(1);
}

const origins = ["https://our-place-tau.vercel.app", "http://localhost:3000", ...extraOrigins];
try {
  await call("b2_update_bucket", {
    accountId: account.accountId,
    bucketId: bucket.bucketId,
    corsRules: [
      {
        corsRuleName: "ourPlaceUploads",
        allowedOrigins: origins,
        allowedOperations: ["s3_put", "s3_get", "s3_head"],
        allowedHeaders: ["content-type", "content-length", "range"],
        exposeHeaders: ["etag", "content-length", "content-range"],
        maxAgeSeconds: 3600,
      },
    ],
  });
} catch (error) {
  if (error.status === 401 || error.code === "unauthorized") {
    console.error("This key can't change bucket settings. In Backblaze: App Keys → Add a New Application Key → allow access to ALL buckets with Read and Write, use it once here, then delete it.");
  } else console.error(`Couldn't save the CORS rule: ${error.message}`);
  process.exit(1);
}
console.log(`Done — "${bucketName}" now accepts uploads from: ${origins.join(", ")}`);
