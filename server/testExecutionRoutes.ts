import type { Express, Request } from "express";
import crypto from "node:crypto";
import { ENV } from "./_core/env";
import { upsertTestExecution } from "./db";
import {
  normalizeTestExecutionPayload,
  TestExecutionValidationError,
} from "./testExecutionService";

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

export function registerTestExecutionRoutes(app: Express): void {
  app.post("/api/qa/test-executions", async (req, res) => {
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

      const normalized = normalizeTestExecutionPayload(req.body);
      const saved = await upsertTestExecution(normalized);
      res.status(saved.created ? 201 : 200).json({
        ...req.body,
        persistence: {
          execution_id: saved.id,
          external_execution_id: normalized.externalExecutionId,
          created: saved.created,
          results_saved: normalized.results.length,
          saved_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha desconhecida.";
      if (error instanceof TestExecutionValidationError) {
        res.status(400).json({ error: message });
        return;
      }
      if (message === "DB unavailable") {
        res.status(503).json({
          error:
            "Banco de dados indisponível. Configure DATABASE_URL e aplique as migrations.",
        });
        return;
      }
      console.error("[qa-test-executions] error:", error);
      res.status(500).json({
        error: `Falha ao persistir execução: ${message}`,
      });
    }
  });
}
