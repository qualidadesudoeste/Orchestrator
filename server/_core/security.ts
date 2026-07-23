import crypto from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { ENV } from "./env";

function safeRequestId(value: unknown): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  return /^[a-zA-Z0-9._-]{8,100}$/.test(candidate)
    ? candidate
    : crypto.randomUUID();
}

function origin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function registerSecurityMiddleware(app: Express): void {
  const analyticsOrigin = origin(process.env.VITE_ANALYTICS_ENDPOINT ?? "");
  app.disable("x-powered-by");
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          scriptSrc: ["'self'", ...(analyticsOrigin ? [analyticsOrigin] : [])],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          connectSrc: ["'self'", ...(analyticsOrigin ? [analyticsOrigin] : [])],
          upgradeInsecureRequests: ENV.orchestratorPublicUrl
            .toLowerCase()
            .startsWith("https://")
            ? []
            : null,
        },
      },
      referrerPolicy: { policy: "no-referrer" },
    }),
  );

  const apiLimiter = rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    limit: Number(process.env.RATE_LIMIT_API_MAX || 600),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Muitas requisições. Aguarde antes de tentar novamente." },
  });
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_LOGIN_MAX || 10),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: "Muitas tentativas de login. Aguarde 15 minutos." },
  });
  app.use("/api/trpc/auth.login", loginLimiter);
  app.use("/api", apiLimiter);
}

export function requestLogMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startedAt = performance.now();
  const requestId = safeRequestId(req.headers["x-request-id"]);
  res.setHeader("X-Request-Id", requestId);
  res.on("finish", () => {
    const entry = {
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 500 ? "error" : "info",
      event: "request_complete",
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
    };
    console.log(JSON.stringify(entry));
  });
  next();
}
