import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { ZodError } from "zod";

import { apiRouter } from "./routes/api.js";
import { webhookRouter } from "./routes/webhook.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: true,
      credentials: true
    })
  );
  app.use(morgan("combined"));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "backend" });
  });

  app.use(
    "/api/webhook",
    express.raw({ type: "application/json", limit: "2mb" }),
    webhookRouter
  );

  app.use(express.json({ limit: "2mb" }));
  app.use("/api", apiRouter);

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: "Validation error",
        issues: error.issues
      });
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown server error";
    res.status(500).json({
      error: "Internal server error",
      detail: message
    });
  });

  return app;
}
