import type { Express, Request } from "express";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ENV } from "./_core/env";

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
  req: Request,
  filename: string,
  expires: number,
): string {
  const baseUrl =
    ENV.orchestratorPublicUrl.replace(/\/+$/, "") ||
    `${req.protocol}://${req.get("host")}`;
  const url = new URL(
    `/api/qa/evidence-docx/${encodeURIComponent(filename)}`,
    baseUrl,
  );
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("signature", signature(filename, expires));
  return url.toString();
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

      const generator = require(GENERATOR_PATH) as EvidenceGenerator;
      const { buffer, data } = await generator.generateEvidenceDocxBuffer(
        raw,
        PROJECT_ROOT,
      );

      await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });
      const filename = `${slug(data.execution_id)}-${crypto.randomUUID()}.docx`;
      const filepath = path.join(OUTPUT_DIRECTORY, filename);
      await fs.writeFile(filepath, buffer, { flag: "wx" });

      const expires = Math.floor(Date.now() / 1000) + DOWNLOAD_LIFETIME_SECONDS;
      const evidenceDocx = {
        filename,
        download_url: absoluteDownloadUrl(req, filename, expires),
        expires_at: new Date(expires * 1000).toISOString(),
        bytes: buffer.length,
        scenarios: data.resultados.length,
        status: data.status_geral,
      };

      res.status(201).json({ ...raw, evidence_docx: evidenceDocx });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha desconhecida.";
      console.error("[qa-evidence-docx] error:", error);
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
