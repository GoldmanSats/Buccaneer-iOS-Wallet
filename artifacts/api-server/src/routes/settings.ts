import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

async function getOrCreateSettings() {
  const existing = await db.select().from(settingsTable).limit(1);
  if (existing.length > 0) return existing[0]!;
  const created = await db.insert(settingsTable).values({
    fiatCurrency: "USD",
    primaryDisplay: "sats",
    soundEffectsEnabled: true,
    backupCompleted: false,
    lightningAddress: "buccaneeradiciw@breez.tips",
  }).returning();
  return created[0]!;
}

// GET /settings
router.get("/", async (_req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.json({
      fiatCurrency: settings.fiatCurrency,
      primaryDisplay: settings.primaryDisplay,
      soundEffectsEnabled: settings.soundEffectsEnabled,
      backupCompleted: settings.backupCompleted,
      lightningAddress: settings.lightningAddress,
    });
  } catch (err) {
    res.status(500).json({ error: "settings_error", message: String(err) });
  }
});

// PUT /settings
router.put("/", async (req, res) => {
  try {
    const body = req.body as Partial<{
      fiatCurrency: string;
      primaryDisplay: string;
      soundEffectsEnabled: boolean;
      backupCompleted: boolean;
      lightningAddress: string;
    }>;

    const settings = await getOrCreateSettings();
    const updated = await db.update(settingsTable)
      .set({
        ...(body.fiatCurrency !== undefined ? { fiatCurrency: body.fiatCurrency } : {}),
        ...(body.primaryDisplay !== undefined ? { primaryDisplay: body.primaryDisplay } : {}),
        ...(body.soundEffectsEnabled !== undefined ? { soundEffectsEnabled: body.soundEffectsEnabled } : {}),
        ...(body.backupCompleted !== undefined ? { backupCompleted: body.backupCompleted } : {}),
        ...(body.lightningAddress !== undefined ? { lightningAddress: body.lightningAddress } : {}),
        updatedAt: new Date(),
      })
      .where(eq(settingsTable.id, settings.id))
      .returning();

    const s = updated[0]!;
    res.json({
      fiatCurrency: s.fiatCurrency,
      primaryDisplay: s.primaryDisplay,
      soundEffectsEnabled: s.soundEffectsEnabled,
      backupCompleted: s.backupCompleted,
      lightningAddress: s.lightningAddress,
    });
  } catch (err) {
    res.status(500).json({ error: "settings_error", message: String(err) });
  }
});

export default router;
