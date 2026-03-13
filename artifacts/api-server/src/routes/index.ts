import { Router } from "express";
import healthRouter from "./health.js";
import walletRouter from "./wallet.js";
import settingsRouter from "./settings.js";
import agentKeysRouter from "./agentKeys.js";

const router = Router();

router.use(healthRouter);
router.use("/wallet", walletRouter);
router.use("/settings", settingsRouter);
router.use("/agent-keys", agentKeysRouter);

export default router;
