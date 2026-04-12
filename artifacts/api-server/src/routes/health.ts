import { Router, type IRouter } from "express";
import { ApiSchemas } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = ApiSchemas.HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
