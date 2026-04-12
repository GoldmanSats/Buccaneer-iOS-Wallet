import http from "http";
import app from "./app";
import { backfillLegacyApiSecretHashes } from "./lib/agentSecrets.js";
import { startNwcRelay } from "./lib/nwc.js";
import { mountNwcRelay } from "./lib/nwcRelay.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);
mountNwcRelay(server);

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);

  void backfillLegacyApiSecretHashes()
    .then((count) => {
      if (count > 0) {
        console.log(`[agent-auth] Migrated ${count} legacy API key(s) to hashed storage`);
      }
    })
    .catch((err) => {
      console.error("[agent-auth] Failed to backfill legacy API key hashes:", err);
    });

  setTimeout(() => {
    startNwcRelay();
  }, 3000);
});
