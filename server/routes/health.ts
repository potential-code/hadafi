import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get(["/healthz", "/health"], (_req, res) => {
  res.json({ status: "ok" });
});

export default router;
