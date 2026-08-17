import crypto from "node:crypto";
import express, { type Express, type Request } from "express";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ENV } from "./_core/env";
import { logError } from "./_core/logger";
import { safeErrorMessage } from "./_core/sensitiveData";

const ARTIFACT_ROOT = path.resolve("artifacts", "worker-shared");
const DOWNLOAD_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const REFERENCE_PATTERN = /^worker-artifact:\/\/([a-z0-9][a-z0-9-]{0,79})\/([a-z0-9][a-z0-9._-]{0,180})$/i;

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function bearerToken(req: Request): string {
  const authorization = req.headers.authorization ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

function safeSegment(value: string, fallback: string, maxLength: number): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "").slice(0, maxLength) || fallback;
}

function insideRoot(candidate: string): boolean {
  const relative = path.relative(ARTIFACT_ROOT, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function workerArtifactReference(executionId: string, filename: string): string {
  return `worker-artifact://${safeSegment(executionId, "execucao", 80)}/${safeSegment(filename, "artefato.bin", 181)}`;
}

export function resolveWorkerArtifactReference(reference: string): string | undefined {
  const match = reference.match(REFERENCE_PATTERN);
  if (!match) return undefined;
  const candidate = path.resolve(ARTIFACT_ROOT, match[1], match[2]);
  return insideRoot(candidate) ? candidate : undefined;
}

export function materializeWorkerArtifactReferences<T>(value: T): T {
  if (typeof value === "string") return (resolveWorkerArtifactReference(value) ?? value) as T;
  if (Array.isArray(value)) return value.map(item => materializeWorkerArtifactReferences(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, materializeWorkerArtifactReferences(item)])) as T;
  }
  return value;
}

function signature(reference: string, expires: number): string {
  return crypto.createHmac("sha256", ENV.qaAgentApiToken)
    .update(`worker-artifact:${reference}:${expires}`).digest("hex");
}

function downloadUrl(reference: string, expires: number): string {
  const parsed = reference.match(REFERENCE_PATTERN)!;
  const base = (ENV.orchestratorPublicUrl || `http://localhost:${ENV.port}`).replace(/\/+$/, "");
  const url = new URL(`/api/qa/worker-artifacts/${parsed[1]}/${parsed[2]}`, base);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("signature", signature(reference, expires));
  return url.toString();
}

function contentType(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  return ({
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
    ".pdf": "application/pdf", ".csv": "text/csv; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  } as Record<string, string>)[extension] ?? "application/octet-stream";
}

export function registerWorkerArtifactRoutes(app: Express): void {
  app.post(
    "/api/qa/worker-artifacts/:executionId",
    express.raw({ type: "application/octet-stream", limit: "25mb" }),
    async (req, res) => {
      try {
        if (!ENV.qaAgentApiToken) return void res.status(503).json({ error: "Integração do worker não configurada." });
        if (!safeEqual(bearerToken(req), ENV.qaAgentApiToken)) return void res.status(401).json({ error: "Token do worker inválido." });
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) return void res.status(400).json({ error: "Artefato vazio." });
        const executionId = safeSegment(String(req.params.executionId ?? ""), "execucao", 80);
        const originalName = safeSegment(String(req.headers["x-artifact-filename"] ?? "artefato.bin"), "artefato.bin", 120);
        const storedName = `${crypto.randomUUID()}-${originalName}`;
        const directory = path.resolve(ARTIFACT_ROOT, executionId);
        const filepath = path.resolve(directory, storedName);
        if (!insideRoot(filepath)) throw new Error("Destino de artefato inválido.");
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(filepath, req.body, { flag: "wx" });
        const reference = workerArtifactReference(executionId, storedName);
        const expires = Math.floor(Date.now() / 1000) + DOWNLOAD_LIFETIME_SECONDS;
        res.status(201).json({ reference, downloadUrl: downloadUrl(reference, expires), bytes: req.body.length, expiresAt: new Date(expires * 1000).toISOString() });
      } catch (error) {
        logError("worker_artifact_upload_failed", error);
        res.status(500).json({ error: safeErrorMessage(error) });
      }
    },
  );

  app.get("/api/qa/worker-artifacts/:executionId/:filename", async (req, res) => {
    const reference = workerArtifactReference(String(req.params.executionId ?? ""), String(req.params.filename ?? ""));
    const expires = Number(req.query.expires);
    const received = String(req.query.signature ?? "");
    const filepath = resolveWorkerArtifactReference(reference);
    if (!ENV.qaAgentApiToken || !filepath || !Number.isInteger(expires) || expires < Math.floor(Date.now() / 1000) || !received || !safeEqual(received, signature(reference, expires))) {
      return void res.status(403).json({ error: "Link de artefato inválido ou expirado." });
    }
    try {
      res.setHeader("Content-Type", contentType(filepath));
      res.setHeader("Content-Disposition", `attachment; filename="${path.basename(filepath).replace(/["\\]/g, "")}"`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(await fs.readFile(filepath));
    } catch {
      res.status(404).json({ error: "Artefato não encontrado." });
    }
  });
}
