import crypto from "crypto";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentKeysTable } from "@workspace/db";

export function hashAgentSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret, "utf8").digest("hex");
}

export async function backfillLegacyApiSecretHashes(): Promise<number> {
  const legacyKeys = await db
    .select({
      id: agentKeysTable.id,
      secretKey: agentKeysTable.secretKey,
    })
    .from(agentKeysTable)
    .where(
      and(
        eq(agentKeysTable.connectionType, "api"),
        isNull(agentKeysTable.secretHash),
        isNotNull(agentKeysTable.secretKey),
      ),
    );

  for (const key of legacyKeys) {
    if (!key.secretKey) continue;

    await db
      .update(agentKeysTable)
      .set({
        secretHash: hashAgentSecret(key.secretKey),
        secretKey: null,
      })
      .where(eq(agentKeysTable.id, key.id));
  }

  return legacyKeys.length;
}
