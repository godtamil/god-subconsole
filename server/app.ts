import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { ZodError } from "zod";
import { authRouter,auditEvent } from "./auth";
import { api } from "./api";
import { AppError, safeError } from "./security";
import { config } from "./config";
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'", config.app.replace(/^http/, "ws")],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "1100kb" }));
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, name: "GOD Subconsole" }),
  );
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Too many requests. Please wait a moment." },
    }),
  );
  app.use("/api/auth", authRouter);
  app.use("/api", api);
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint unavailable" }),
  );
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (_req.user && !["GET", "HEAD", "OPTIONS"].includes(_req.method)) {
        const route = String(_req.route?.path || "api");
        const action = route.endsWith("/power") ? "power.request.failed"
          : route.endsWith("/command") ? "console.command.failed"
          : "request.failed:" + _req.method + ":" + route;
        const serverId = typeof _req.params?.id === "string" ? _req.params.id : null;
        void auditEvent(_req.user.id, action, serverId, "failed").catch(() => {});
      }
      if(res.headersSent){res.destroy();return;}
      res
        .status(
          err instanceof ZodError
            ? 400
            : err instanceof AppError
              ? err.status
              : err.type === "entity.too.large"
                ? 413
                : 500,
        )
        .json({
          error:
            err instanceof ZodError
              ? "Invalid input. Check the form fields."
              : safeError(err),
        });
    },
  );
  return app;
}
