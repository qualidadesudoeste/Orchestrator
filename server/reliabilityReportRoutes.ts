import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Express, Request } from "express";
import { ENV } from "./_core/env";
import {
  buildReliabilityReport,
  ReliabilityReportValidationError,
  renderReliabilityHtml,
} from "./reliabilityReportService";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const OUTPUT_DIRECTORY = path.resolve(
  PROJECT_ROOT,
  "artifacts",
  "reliability-reports",
);
const ARTIFACTS_DIRECTORY = path.resolve(PROJECT_ROOT, "artifacts");
const EVIDENCE_DIRECTORY = path.resolve(ARTIFACTS_DIRECTORY, "playwright-mcp");
const DOWNLOAD_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const SAFE_FILENAME = /^[a-z0-9][a-z0-9._-]{0,180}\.html$/i;

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
  return (
    String(value || "execucao")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "execucao"
  );
}

function signature(filename: string, expires: number): string {
  return crypto
    .createHmac("sha256", ENV.qaAgentApiToken)
    .update(`reliability-report/${filename}:${expires}`)
    .digest("hex");
}

function artifactDownloadUrl(filename: string, expires: number, baseUrl?: string): string {
  const resolvedBase = (baseUrl || ENV.orchestratorPublicUrl || `http://localhost:${ENV.port}`).replace(/\/+$/, "");
  const url = new URL(
    `/api/qa/reliability-reports/${encodeURIComponent(filename)}`,
    resolvedBase,
  );
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("signature", signature(filename, expires));
  return url.toString();
}

function isInside(directory: string, candidate: string): boolean {
  const relative = path.relative(directory, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function evidenceDataUri(value: string): Promise<string> {
  if (value.startsWith("data:image/")) return value;
  if (/^https?:\/\//i.test(value)) return value;

  const normalized = value.replace(/^file:\/\//i, "");
  const candidates = path.isAbsolute(normalized)
    ? [path.resolve(normalized)]
    : [
        path.resolve(PROJECT_ROOT, normalized),
        path.resolve(EVIDENCE_DIRECTORY, normalized),
        path.resolve(EVIDENCE_DIRECTORY, path.basename(normalized)),
      ];
  const mimeByExtension: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };

  for (const candidate of candidates) {
    if (!isInside(ARTIFACTS_DIRECTORY, candidate)) continue;
    const mime = mimeByExtension[path.extname(candidate).toLowerCase()];
    if (!mime) continue;
    try {
      const file = await fs.readFile(candidate);
      if (file.length > 5_000_000) continue;
      return `data:${mime};base64,${file.toString("base64")}`;
    } catch {
      // Tenta o próximo caminho permitido.
    }
  }
  return value;
}

async function embedEvidenceImages(report: ReturnType<typeof buildReliabilityReport>): Promise<void> {
  for (const result of report.results) {
    for (const attempt of result.reliability.history) {
      attempt.evidence = await Promise.all(attempt.evidence.map(evidenceDataUri));
    }
  }
}

export async function generateReliabilityReportArtifact(
  payload: unknown,
  baseUrl?: string,
): Promise<Record<string, any>> {
  const report = buildReliabilityReport(payload);
  await embedEvidenceImages(report);
  const html = renderReliabilityHtml(report);
  await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });
  const filename = `${slug(report.executionId)}-${crypto.randomUUID()}.html`;
  await fs.writeFile(path.join(OUTPUT_DIRECTORY, filename), html, {
    encoding: "utf8",
    flag: "wx",
  });
  const expires = Math.floor(Date.now() / 1000) + DOWNLOAD_LIFETIME_SECONDS;
  return {
    ...report.enrichedPayload,
    reliability_report: {
      filename,
      download_url: artifactDownloadUrl(filename, expires, baseUrl),
      expires_at: new Date(expires * 1000).toISOString(),
      generated_at: report.generatedAt,
      bytes: Buffer.byteLength(html, "utf8"),
      totals: report.totals,
    },
  };
}
export function registerReliabilityReportRoutes(app: Express): void {
  app.post("/api/qa/reliability-reports", async (req, res) => {
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

      const baseUrl = ENV.orchestratorPublicUrl.replace(/\/+$/, "") || `${req.protocol}://${req.get("host")}`;
      res.status(201).json(await generateReliabilityReportArtifact(req.body?.json ?? req.body, baseUrl));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha desconhecida.";
      if (error instanceof ReliabilityReportValidationError) {
        res.status(400).json({ error: message });
        return;
      }
      console.error("[qa-reliability-report] error:", error);
      res.status(500).json({
        error: `Falha ao gerar relatório de confiabilidade: ${message}`,
      });
    }
  });

  app.get("/api/qa/reliability-reports/:filename", async (req, res) => {
    const filename = String(req.params.filename ?? "");
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

    try {
      const filepath = path.join(OUTPUT_DIRECTORY, filename);
      await fs.access(filepath);
      res
        .status(200)
        .type("text/html; charset=utf-8")
        .setHeader(
          "Content-Security-Policy",
          "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
        )
        .setHeader("Content-Disposition", `inline; filename="${filename}"`)
        .send(await fs.readFile(filepath, "utf8"));
    } catch {
      res.status(404).json({ error: "Relatório não encontrado." });
    }
  });
}
