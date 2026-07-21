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
import { sdk } from "./sdk";
import { COOKIE_NAME } from "@shared/const";
import cookie from "cookie";

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
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);

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

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
