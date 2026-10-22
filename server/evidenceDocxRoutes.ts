import type { Express, Request } from "express";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ENV } from "./_core/env";
import { logError } from "./_core/logger";
import { materializeWorkerArtifactReferences } from "./workerArtifactRoutes";

type EvidenceDocumentData = {
  execution_id: string;
  projeto: string;
  sprint: string;
  status_geral: string;
  resultados: unknown[];
};

type EvidenceGenerator = {
  generateEvidenceDocxBuffer(
    raw: unknown,
    inputDirectory?: string,
  ): Promise<{ buffer: Buffer; data: EvidenceDocumentData }>;
};

const require = createRequire(import.meta.url);
const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const GENERATOR_PATH = path.resolve(
  PROJECT_ROOT,
  "automation",
  "evidence-docx",
  "generate-evidence-docx.cjs",
);
const OUTPUT_DIRECTORY = path.resolve(
  PROJECT_ROOT,
  "artifacts",
  "evidence-docx",
  "agent",
);
const DOWNLOAD_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const SAFE_FILENAME = /^[a-z0-9][a-z0-9._-]{0,180}\.docx$/i;

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function bearerToken(req: Request): string {
  const authorization = req.headers.authorization ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function slug(value: unknown): string {
  return String(value || "execucao")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "execucao";
}

function signature(filename: string, expires: number): string {
  return crypto
    .createHmac("sha256", ENV.qaAgentApiToken)
    .update(`${filename}:${expires}`)
    .digest("hex");
}

function absoluteDownloadUrl(
  filename: string,
  expires: number,
  baseUrl?: string,
): string {
  const resolvedBase = (baseUrl || ENV.orchestratorPublicUrl || `http://localhost:${ENV.port}`).replace(/\/+$/, "");
  const url = new URL(
    `/api/qa/evidence-docx/${encodeURIComponent(filename)}`,
    resolvedBase,
  );
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("signature", signature(filename, expires));
  return url.toString();
}

export async function generateEvidenceDocxArtifact(
  raw: Record<string, any>,
  baseUrl?: string,
): Promise<Record<string, any>> {
  if (!Array.isArray(raw.resultados) || raw.resultados.length === 0) {
    throw new Error("Informe o resultado consolidado com ao menos um item em 'resultados'.");
  }
  if (raw.resultados.length > 500) {
    throw new Error("Uma execucao pode conter no maximo 500 cenarios.");
  }
  const generator = require(GENERATOR_PATH) as EvidenceGenerator;
  const materialized = materializeWorkerArtifactReferences(raw);
  const { buffer, data } = await generator.generateEvidenceDocxBuffer(materialized, PROJECT_ROOT);
  await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });
  const filename = `${slug(data.execution_id)}-${crypto.randomUUID()}.docx`;
  await fs.writeFile(path.join(OUTPUT_DIRECTORY, filename), buffer, { flag: "wx" });
  const expires = Math.floor(Date.now() / 1000) + DOWNLOAD_LIFETIME_SECONDS;
  return {
    ...raw,
    evidence_docx: {
      filename,
      download_url: absoluteDownloadUrl(filename, expires, baseUrl),
      expires_at: new Date(expires * 1000).toISOString(),
      bytes: buffer.length,
      scenarios: data.resultados.length,
      status: data.status_geral,
    },
  };
}

export function registerEvidenceDocxRoutes(app: Express): void {
  app.post("/api/qa/evidence-docx", async (req, res) => {
    try {
      if (!ENV.qaAgentApiToken) {
        res.status(503).json({
          error:
            "Integração não configurada. Defina QA_AGENT_API_TOKEN no Orchestrator.",
        });
        return;
      }

      const token = bearerToken(req);
      if (!token || !safeEqual(token, ENV.qaAgentApiToken)) {
        res.status(401).json({ error: "Token do agente inválido." });
        return;
      }

      const raw = req.body?.json ?? req.body;
      if (
        !raw ||
        typeof raw !== "object" ||
        !Array.isArray(raw.resultados) ||
        raw.resultados.length === 0
      ) {
        res.status(400).json({
          error:
            "Informe o resultado consolidado com ao menos um item em 'resultados'.",
        });
        return;
      }
      if (raw.resultados.length > 500) {
        res.status(413).json({
          error: "Uma execução pode conter no máximo 500 cenários.",
        });
        return;
      }

      res.status(201).json(await generateEvidenceDocxArtifact(
        raw,
        ENV.orchestratorPublicUrl || `${req.protocol}://${req.get("host")}`,
      ));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha desconhecida.";
      logError("qa_evidence_docx_failed", error);
      res.status(500).json({ error: `Falha ao gerar evidências: ${message}` });
    }
  });

  app.get("/api/qa/evidence-docx/:filename", async (req, res) => {
    const filename = req.params.filename;
    const expires = Number(req.query.expires);
    const receivedSignature = String(req.query.signature ?? "");

    if (
      !ENV.qaAgentApiToken ||
      !SAFE_FILENAME.test(filename) ||
      path.basename(filename) !== filename ||
      !Number.isInteger(expires) ||
      expires < Math.floor(Date.now() / 1000) ||
      !receivedSignature ||
      !safeEqual(receivedSignature, signature(filename, expires))
    ) {
      res.status(403).json({ error: "Link inválido ou expirado." });
      return;
    }

    const filepath = path.join(OUTPUT_DIRECTORY, filename);
    try {
      await fs.access(filepath);
      res.download(filepath, filename);
    } catch {
      res.status(404).json({ error: "Documento não encontrado." });
    }
  });
}
