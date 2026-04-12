import { db } from "@workspace/db";
import { walletAgentPoliciesTable } from "@workspace/db/schema";

async function main() {
  const policies = await db.select().from(walletAgentPoliciesTable);
  console.log(`Found ${policies.length} policies:`);
  for (const p of policies) {
    console.log(JSON.stringify({
      id: p.id,
      name: p.name,
      connectionType: p.connectionType,
      isActive: p.isActive,
      hasNwcSecretKey: !!p.nwcSecretKey,
      hasNwcClientSecret: !!p.nwcClientSecret,
      hasNwcClientPubkey: !!p.nwcClientPubkey,
      identityId: p.identityId,
    }, null, 2));
  }
  process.exit(0);
}

main();
