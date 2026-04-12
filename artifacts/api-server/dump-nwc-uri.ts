import { db } from "@workspace/db";
import { walletAgentPoliciesTable } from "@workspace/db/schema";
import { desc } from "drizzle-orm";
import { schnorr } from "@noble/curves/secp256k1";

async function main() {
  const policies = await db
    .select()
    .from(walletAgentPoliciesTable)
    .orderBy(desc(walletAgentPoliciesTable.createdAt));

  if (policies.length === 0) {
    console.log("No agent policies found.");
    process.exit(0);
  }

  for (const p of policies) {
    if (!p.nwcSecretKey || !p.nwcClientSecret) continue;
    const servicePub = Buffer.from(
      schnorr.getPublicKey(Buffer.from(p.nwcSecretKey, "hex")),
    ).toString("hex");
    const relay = encodeURIComponent("ws://localhost:8787/nwc");
    const uri = `nostr+walletconnect://${servicePub}?relay=${relay}&secret=${p.nwcClientSecret}`;

    console.log(`\nName: ${p.name}`);
    console.log(`NWC URI:\n${uri}\n`);
  }
  process.exit(0);
}

main();
