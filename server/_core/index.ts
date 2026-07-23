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
import { checkDatabaseHealth } from "../db";
import { sdk } from "./sdk";
import { ENV } from "./env";
import {
  assertProductionEnvironment,
  parseTrustProxy,
} from "./envValidation";
import {
  registerSecurityMiddleware,
  requestLogMiddleware,
} from "./security";
import { COOKIE_NAME } from "@shared/const";
import cookie from "cookie";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// ─── Multipart upload helper (no external deps) ───────────────────────────────
async function parseMultipartImages(req: express.Request): Promise<{ buffer: Buffer; mimetype: string; filename: string }[]> {
  return new Promise((resolve, reject) => {
    const boundary = (() => {
      const ct = req.headers["content-type"] ?? "";
      const m = ct.match(/boundary=([^\s;]+)/);
      return m ? m[1] : null;
    })();
    if (!boundary) return reject(new Error("No boundary"));
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const sep = Buffer.from(`--${boundary}`);
      const results: { buffer: Buffer; mimetype: string; filename: string }[] = [];
      let start = 0;
      while (true) {
        const idx = body.indexOf(sep, start);
        if (idx === -1) break;
        start = idx + sep.length;
        if (body.slice(start, start + 2).toString() === "--") break;
        // skip \r\n after boundary
        let headerStart = start + 2;
        const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), headerStart);
        if (headerEnd === -1) continue;
        const headers = body.slice(headerStart, headerEnd).toString();
        const filenameMatch = headers.match(/filename="([^"]+)"/);
        const mimeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/);
        if (!filenameMatch || !mimeMatch) continue;
        const filename = filenameMatch[1];
        const mimetype = mimeMatch[1].trim();
        const dataStart = headerEnd + 4;
        const nextBoundary = body.indexOf(sep, dataStart);
        const dataEnd = nextBoundary === -1 ? body.length : nextBoundary - 2;
        const buffer = body.slice(dataStart, dataEnd);
        results.push({ buffer, mimetype, filename });
        start = nextBoundary === -1 ? body.length : nextBoundary;
      }
      resolve(results);
    });
    req.on("error", reject);
  });
}

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
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "warn",
      event: "configuration_warning",
      message: warning,
    }));
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

  // ── Upload de imagens para evidências de teste ──────────────────────────────
  app.post("/api/qa-upload", async (req, res) => {
    try {
      // Autenticação básica
      const cookieHeader = req.headers.cookie ?? "";
      const cookies = cookie.parse(cookieHeader);
      const token = cookies[COOKIE_NAME] ?? (req.headers.authorization?.replace("Bearer ", "") ?? "");
      if (!token) { res.status(401).json({ error: "Não autenticado" }); return; }
      const session = await sdk.verifySession(token).catch(() => null);
      if (!session) { res.status(401).json({ error: "Sessão inválida" }); return; }

      const files = await parseMultipartImages(req);
      if (files.length === 0) { res.status(400).json({ error: "Nenhum arquivo enviado" }); return; }

      const uploaded = await Promise.all(files.map(async ({ buffer, mimetype, filename }) => {
        const ext = filename.split(".").pop() ?? "png";
        const key = `qa-evidence/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { url } = await storagePut(key, buffer, mimetype);
        return { url, key, filename };
      }));

    res.json(uploaded);
    } catch (e: any) {
      console.error("[qa-upload] error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Extração de texto de PDF/DOCX para o Gerador de Plano de Teste ──────────
  app.post("/api/qa-extract", async (req, res) => {
    try {
      const cookieHeader = req.headers.cookie ?? "";
      const cookies = cookie.parse(cookieHeader);
      const token = cookies[COOKIE_NAME] ?? (req.headers.authorization?.replace("Bearer ", "") ?? "");
      if (!token) { res.status(401).json({ error: "Não autenticado" }); return; }
      const session = await sdk.verifySession(token).catch(() => null);
      if (!session) { res.status(401).json({ error: "Sessão inválida" }); return; }

      const files = await parseMultipartImages(req);
      if (files.length === 0) { res.status(400).json({ error: "Nenhum arquivo enviado" }); return; }

      const { buffer, mimetype, filename } = files[0];
      let text = "";

      if (mimetype === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
        const pdfParse = require("pdf-parse");
        const data = await pdfParse(buffer);
        text = data.text ?? "";
      } else if (
        mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        filename.toLowerCase().endsWith(".docx")
      ) {
        const mammoth = require("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        text = result.value ?? "";
      } else {
        res.status(400).json({ error: "Formato não suportado. Use PDF ou DOCX." });
        return;
      }

      // Limpar e truncar o texto extraído (máx 8000 chars para não explodir o prompt)
      text = text.replace(/\s+/g, " ").trim().slice(0, 8000);
      res.json({ text, filename });
    } catch (e: any) {
      console.error("[qa-extract] error:", e);
      res.status(500).json({ error: e.message });
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
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, ENV.host, () => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      event: "server_started",
      host: ENV.host,
      port,
    }));
  });

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      event: "shutdown_started",
      signal,
    }));
    const timeout = setTimeout(() => {
      server.closeAllConnections();
      process.exit(1);
    }, ENV.shutdownTimeoutMs);
    timeout.unref();
    server.close(error => {
      clearTimeout(timeout);
      if (error) {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "error",
          event: "shutdown_failed",
          message: error.message,
        }));
        process.exit(1);
      }
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "info",
        event: "shutdown_complete",
      }));
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch(error => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "error",
    event: "startup_failed",
    message: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
});
