import { db } from "@workspace/db";
import { walletAgentPoliciesTable } from "@workspace/db/schema";
import {
  createPerUserNwcSecret,
  createPerUserNwcUri,
  derivePerUserNwcPubkey,
} from "./src/lib/perUserAgentAccess.js";

async function main() {
  const nwcClientSecret = createPerUserNwcSecret();
  const nwcServiceSecret = createPerUserNwcSecret();
  const nwcClientPubkey = derivePerUserNwcPubkey(nwcClientSecret);
  const servicePubkey = derivePerUserNwcPubkey(nwcServiceSecret);

  const [policy] = await db
    .insert(walletAgentPoliciesTable)
    .values({
      identityId: 3,
      name: "CLI Test Agent",
      connectionType: "nwc",
      nwcSecretKey: nwcServiceSecret,
      nwcClientPubkey,
      spendingLimitSats: 1000,
      maxDailySats: 5000,
      approvalMode: "session",
    })
    .returning();

  const nwcUri = createPerUserNwcUri(servicePubkey, nwcClientSecret);

  console.log("\n✓ Created NWC policy:", policy!.name, "(id:", policy!.id + ")");
  console.log("\nNWC URI (copy this whole line):\n");
  console.log(nwcUri);
  console.log();

  process.exit(0);
}

main();
