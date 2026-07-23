import type { Express, Request } from "express";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENV } from "./_core/env";

type RegressionFile = {
  filename: string;
  content: string;
  scenarioId?: string;
  scenarioTitle?: string;
};

type SavedRegressionFile = {
  filename: string;
  scenario_id?: string;
  scenario_title?: string;
  bytes: number;
  download_url: string;
};

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const OUTPUT_DIRECTORY = path.resolve(
  PROJECT_ROOT,
  "artifacts",
  "regression-code",
);
const DOWNLOAD_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const MAX_FILES = 100;
const MAX_FILE_BYTES = 500_000;
const MAX_TOTAL_BYTES = 5_000_000;
const SAFE_BUNDLE = /^[a-f0-9-]{36}$/;
const SAFE_FILENAME = /^[a-z0-9][a-z0-9._-]{0,170}\.(?:spec|test)\.ts$/i;

export class RegressionValidationError extends Error {}

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

function slug(value: unknown, fallback = "cenario"): string {
  return (
    String(value || fallback)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100) || fallback
  );
}

function stripMarkdownFence(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/^```(?:typescript|ts)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function validateCode(filename: string, content: string): void {
  const bytes = Buffer.byteLength(content, "utf8");
  if (!content) {
    throw new RegressionValidationError(`${filename}: código vazio.`);
  }
  if (bytes > MAX_FILE_BYTES) {
    throw new RegressionValidationError(
      `${filename}: excede o limite de ${MAX_FILE_BYTES} bytes.`,
    );
  }
  if (!/from\s+["']@playwright\/test["']/.test(content)) {
    throw new RegressionValidationError(
      `${filename}: importe test/expect de @playwright/test.`,
    );
  }
  if (!/\btest(?:\.describe)?\s*\(/.test(content)) {
    throw new RegressionValidationError(
      `${filename}: nenhum teste Playwright foi encontrado.`,
    );
  }

  const nonSemanticSelectors = [
    { pattern: /\bpage\.locator\s*\(/, label: "page.locator" },
    { pattern: /\bpage\.\$\$?\s*\(/, label: "page.$/page.$$" },
    { pattern: /\bwaitForSelector\s*\(/, label: "waitForSelector" },
    { pattern: /(?:xpath=|(^|[^:])\/\/[a-z*])/im, label: "XPath" },
  ];
  const invalidSelector = nonSemanticSelectors.find(({ pattern }) =>
    pattern.test(content),
  );
  if (invalidSelector) {
    throw new RegressionValidationError(
      `${filename}: seletor não semântico detectado (${invalidSelector.label}).`,
    );
  }

  const hasInteraction =
    /\.(?:click|fill|check|uncheck|selectOption|press|hover)\s*\(/.test(content);
  const hasSemanticSelector =
    /\.(?:getByRole|getByLabel|getByText|getByPlaceholder|getByAltText|getByTitle|getByTestId)\s*\(/.test(
      content,
    );
  if (hasInteraction && !hasSemanticSelector) {
    throw new RegressionValidationError(
      `${filename}: interações devem usar seletores semânticos.`,
    );
  }
}

function uniqueFilename(
  desired: string,
  usedNames: Set<string>,
): string {
  const parsed = path.parse(desired);
  let candidate = desired;
  let suffix = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${parsed.name}-${suffix}${parsed.ext}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

export function extractRegressionFiles(payload: unknown): RegressionFile[] {
  const raw = (payload as any)?.json ?? payload;
  if (!raw || typeof raw !== "object") {
    throw new RegressionValidationError("O JSON de entrada é inválido.");
  }

  const candidates: Array<{
    filename?: unknown;
    content?: unknown;
    scenarioId?: unknown;
    scenarioTitle?: unknown;
  }> = [];

  if (Array.isArray((raw as any).files)) {
    for (const file of (raw as any).files) {
      candidates.push({
        filename: file?.filename ?? file?.path,
        content: file?.content ?? file?.code,
        scenarioId: file?.scenario_id,
        scenarioTitle: file?.scenario_title,
      });
    }
  } else if (Array.isArray((raw as any).resultados)) {
    for (const result of (raw as any).resultados) {
      candidates.push({
        filename: `${slug(result?.scenario_id ?? result?.scenario_title)}.spec.ts`,
        content:
          result?.resultado_teste?.codigo_regressao ??
          result?.codigo_regressao ??
          result?.code,
        scenarioId: result?.scenario_id,
        scenarioTitle: result?.scenario_title,
      });
    }
  }

  const withCode = candidates.filter(
    ({ content }) => stripMarkdownFence(content).length > 0,
  );
  if (withCode.length === 0) {
    throw new RegressionValidationError(
      "Nenhum código de regressão foi informado.",
    );
  }
  if (withCode.length > MAX_FILES) {
    throw new RegressionValidationError(
      `Uma execução pode conter no máximo ${MAX_FILES} arquivos.`,
    );
  }

  const usedNames = new Set<string>();
  let totalBytes = 0;
  return withCode.map((candidate, index) => {
    const desiredName = String(
      candidate.filename || `cenario-${index + 1}.spec.ts`,
    );
    if (
      !SAFE_FILENAME.test(desiredName) ||
      path.basename(desiredName) !== desiredName
    ) {
      throw new RegressionValidationError(
        `${desiredName}: nome de arquivo inválido. Use .spec.ts ou .test.ts.`,
      );
    }

    const filename = uniqueFilename(desiredName, usedNames);
    const content = stripMarkdownFence(candidate.content);
    validateCode(filename, content);
    totalBytes += Buffer.byteLength(content, "utf8");
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new RegressionValidationError(
        `O conjunto excede o limite de ${MAX_TOTAL_BYTES} bytes.`,
      );
    }

    return {
      filename,
      content,
      scenarioId: candidate.scenarioId
        ? String(candidate.scenarioId)
        : undefined,
      scenarioTitle: candidate.scenarioTitle
        ? String(candidate.scenarioTitle)
        : undefined,
    };
  });
}

function signature(resource: string, expires: number): string {
  return crypto
    .createHmac("sha256", ENV.qaAgentApiToken)
    .update(`${resource}:${expires}`)
    .digest("hex");
}

function downloadUrl(
  req: Request,
  bundleId: string,
  filename: string,
  expires: number,
): string {
  const baseUrl =
    ENV.orchestratorPublicUrl.replace(/\/+$/, "") ||
    `${req.protocol}://${req.get("host")}`;
  const resource = `${bundleId}/${filename}`;
  const url = new URL(
    `/api/qa/regression-code/${bundleId}/${encodeURIComponent(filename)}`,
    baseUrl,
  );
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("signature", signature(resource, expires));
  return url.toString();
}

export function registerRegressionCodeRoutes(app: Express): void {
  app.post("/api/qa/regression-code", async (req, res) => {
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
      const files = extractRegressionFiles(raw);
      const bundleId = crypto.randomUUID();
      const bundleDirectory = path.join(OUTPUT_DIRECTORY, bundleId);
      await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });
      await fs.mkdir(bundleDirectory, { recursive: false });

      const expires = Math.floor(Date.now() / 1000) + DOWNLOAD_LIFETIME_SECONDS;
      const savedFiles: SavedRegressionFile[] = [];
      for (const file of files) {
        await fs.writeFile(
          path.join(bundleDirectory, file.filename),
          file.content,
          { encoding: "utf8", flag: "wx" },
        );
        savedFiles.push({
          filename: file.filename,
          scenario_id: file.scenarioId,
          scenario_title: file.scenarioTitle,
          bytes: Buffer.byteLength(file.content, "utf8"),
          download_url: downloadUrl(
            req,
            bundleId,
            file.filename,
            expires,
          ),
        });
      }

      const manifest = {
        bundle_id: bundleId,
        execution_id: raw?.execution_id ?? null,
        projeto: raw?.projeto ?? null,
        sprint: raw?.sprint ?? null,
        sistema_url: raw?.sistema_url ?? null,
        created_at: new Date().toISOString(),
        expires_at: new Date(expires * 1000).toISOString(),
        files: savedFiles.map(({ download_url: _downloadUrl, ...file }) => file),
      };
      await fs.writeFile(
        path.join(bundleDirectory, "manifest.json"),
        JSON.stringify(manifest, null, 2),
        { encoding: "utf8", flag: "wx" },
      );

      res.status(201).json({
        ...raw,
        regression_code: {
          bundle_id: bundleId,
          saved_at: manifest.created_at,
          expires_at: manifest.expires_at,
          files: savedFiles,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha desconhecida.";
      if (error instanceof RegressionValidationError) {
        res.status(400).json({ error: message });
        return;
      }
      console.error("[qa-regression-code] error:", error);
      res.status(500).json({
        error: `Falha ao salvar código de regressão: ${message}`,
      });
    }
  });

  app.get(
    "/api/qa/regression-code/:bundleId/:filename",
    async (req, res) => {
      const { bundleId, filename } = req.params;
      const expires = Number(req.query.expires);
      const receivedSignature = String(req.query.signature ?? "");
      const resource = `${bundleId}/${filename}`;

      if (
        !ENV.qaAgentApiToken ||
        !SAFE_BUNDLE.test(bundleId) ||
        !SAFE_FILENAME.test(filename) ||
        path.basename(filename) !== filename ||
        !Number.isInteger(expires) ||
        expires < Math.floor(Date.now() / 1000) ||
        !receivedSignature ||
        !safeEqual(receivedSignature, signature(resource, expires))
      ) {
        res.status(403).json({ error: "Link inválido ou expirado." });
        return;
      }

      const filepath = path.join(OUTPUT_DIRECTORY, bundleId, filename);
      try {
        await fs.access(filepath);
        res.type("text/typescript").download(filepath, filename);
      } catch {
        res.status(404).json({ error: "Arquivo não encontrado." });
      }
    },
  );
}
