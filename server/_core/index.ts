import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { storagePut } from "../storage";
import { registerEvidenceDocxRoutes } from "../evidenceDocxRoutes";
import { registerRegressionCodeRoutes } from "../regressionCodeRoutes";
import { registerTestExecutionRoutes } from "../testExecutionRoutes";
import { registerNonFunctionalRoutes } from "../nonFunctionalRoutes";
import { registerDefectCardRoutes } from "../defectCardRoutes";
import { registerReliabilityReportRoutes } from "../reliabilityReportRoutes";
import { registerAgentMemoryRoutes } from "../agentMemoryRoutes";
import { registerWorkerArtifactRoutes } from "../workerArtifactRoutes";
import { checkDatabaseHealth } from "../db";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { assertProductionEnvironment, parseTrustProxy } from "./envValidation";
import { registerSecurityMiddleware, requestLogMiddleware } from "./security";
import { COOKIE_NAME } from "@shared/const";
import cookie from "cookie";
import { createRequire } from "module";
import { MultipartValidationError, parseMultipartFiles } from "./multipart";
import { logError, logInfo, logWarn } from "./logger";
import { safeErrorMessage } from "./sensitiveData";
const require = createRequire(import.meta.url);

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const environmentValidation = assertProductionEnvironment();
  for (const warning of environmentValidation.warnings) {
    logWarn("configuration_warning", { message: warning });
  }

  const app = express();
  const server = createServer(app);
  let shuttingDown = false;
  app.set("trust proxy", parseTrustProxy(ENV.trustProxy));
  app.use(requestLogMiddleware);
  registerSecurityMiddleware(app);

  app.get("/healthz", (_req, res) => {
    res.status(shuttingDown ? 503 : 200).json({
      ok: !shuttingDown,
      status: shuttingDown ? "shutting_down" : "alive",
      timestamp: new Date().toISOString(),
    });
  });
  app.get("/readyz", async (_req, res) => {
    const database = await checkDatabaseHealth();
    const ready = !shuttingDown && database.ok;
    res.status(ready ? 200 : 503).json({
      ok: ready,
      status: shuttingDown ? "shutting_down" : ready ? "ready" : "not_ready",
      database,
      timestamp: new Date().toISOString(),
    });
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: ENV.jsonBodyLimit }));
  app.use(express.urlencoded({ limit: ENV.jsonBodyLimit, extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerEvidenceDocxRoutes(app);
  registerRegressionCodeRoutes(app);
  registerTestExecutionRoutes(app);
  registerNonFunctionalRoutes(app);
  registerDefectCardRoutes(app);
  registerReliabilityReportRoutes(app);
  registerAgentMemoryRoutes(app);
  registerWorkerArtifactRoutes(app);

  // ── Upload de imagens para evidências de teste ──────────────────────────────
  app.post("/api/qa-upload", async (req, res) => {
    try {
      // Autenticação básica
      const cookieHeader = req.headers.cookie ?? "";
      const cookies = cookie.parse(cookieHeader);
      const token =
        cookies[COOKIE_NAME] ??
        req.headers.authorization?.replace("Bearer ", "") ??
        "";
      if (!token) {
        res.status(401).json({ error: "Não autenticado" });
        return;
      }
      const session = await sdk.verifySession(token).catch(() => null);
      if (!session) {
        res.status(401).json({ error: "Sessão inválida" });
        return;
      }

      const files = await parseMultipartFiles(req, {
        kind: "image",
        maxFiles: 8,
        maxFileBytes: 10 * 1024 * 1024,
        maxTotalBytes: 25 * 1024 * 1024,
      });
      if (files.length === 0) {
        res.status(400).json({ error: "Nenhum arquivo enviado" });
        return;
      }

      const uploaded = await Promise.all(
        files.map(async ({ buffer, mimetype, filename, extension }) => {
          const key = `qa-evidence/${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`;
          const { url } = await storagePut(key, buffer, mimetype);
          return { url, key, filename };
        })
      );

      res.json(uploaded);
    } catch (e: any) {
      logError("qa_upload_failed", e);
      res.status(e instanceof MultipartValidationError ? e.status : 500).json({
        error:
          e instanceof MultipartValidationError
            ? safeErrorMessage(e)
            : "Falha ao armazenar o arquivo.",
      });
    }
  });

  // ── Extração de texto de PDF/DOCX para o Gerador de Plano de Teste ──────────
  app.post("/api/qa-extract", async (req, res) => {
    try {
      const cookieHeader = req.headers.cookie ?? "";
      const cookies = cookie.parse(cookieHeader);
      const token =
        cookies[COOKIE_NAME] ??
        req.headers.authorization?.replace("Bearer ", "") ??
        "";
      if (!token) {
        res.status(401).json({ error: "Não autenticado" });
        return;
      }
      const session = await sdk.verifySession(token).catch(() => null);
      if (!session) {
        res.status(401).json({ error: "Sessão inválida" });
        return;
      }

      const files = await parseMultipartFiles(req, {
        kind: "document",
        maxFiles: 1,
        maxFileBytes: 15 * 1024 * 1024,
        maxTotalBytes: 15 * 1024 * 1024,
      });
      if (files.length === 0) {
        res.status(400).json({ error: "Nenhum arquivo enviado" });
        return;
      }

      const { buffer, filename, extension } = files[0];
      let text = "";

      if (extension === "pdf") {
        const pdfParse = require("pdf-parse");
        const data = await pdfParse(buffer);
        text = data.text ?? "";
      } else if (extension === "docx") {
        const mammoth = require("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        text = result.value ?? "";
      } else {
        res
          .status(400)
          .json({ error: "Formato não suportado. Use PDF ou DOCX." });
        return;
      }

      // Limpar e truncar o texto extraído (máx 8000 chars para não explodir o prompt)
      text = text.replace(/\s+/g, " ").trim().slice(0, 8000);
      res.json({ text, filename });
    } catch (e: any) {
      logError("qa_extract_failed", e);
      res.status(e instanceof MultipartValidationError ? e.status : 500).json({
        error:
          e instanceof MultipartValidationError
            ? safeErrorMessage(e)
            : "Falha ao extrair o documento.",
      });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = ENV.port;
  const port = ENV.isProduction
    ? preferredPort
    : await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    logWarn("preferred_port_unavailable", {
      preferredPort,
      selectedPort: port,
    });
  }

  server.listen(port, ENV.host, () => {
    logInfo("server_started", {
      host: ENV.host,
      port,
    });
  });
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logInfo("shutdown_started", {
      signal,
    });
    const timeout = setTimeout(() => {
      server.closeAllConnections();
      process.exit(1);
    }, ENV.shutdownTimeoutMs);
    timeout.unref();
    server.close(error => {
      clearTimeout(timeout);
      if (error) {
        logError("shutdown_failed", error);
        process.exit(1);
      }
      logInfo("shutdown_complete");
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch(error => {
  logError("startup_failed", error);
  process.exitCode = 1;
});
