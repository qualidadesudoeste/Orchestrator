import type { Express, Request } from "express";
import crypto from "node:crypto";
import { ENV } from "./_core/env";
import { getTestExecutionControlCheckpoint, updateTestExecutionProgress, upsertTestExecution } from "./db";
import {
  normalizeTestExecutionPayload,
  TestExecutionValidationError,
} from "./testExecutionService";
import {
  ExecutionProgressValidationError,
  normalizeExecutionProgressPayload,
} from "./testExecutionProgressService";

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
  app.post("/api/qa/test-executions/control-state", async (req, res) => {
    try {
      if (!ENV.qaAgentApiToken) {
        res.status(503).json({ error: "Integração de controle não configurada." });
        return;
      }
      const token = bearerToken(req);
      if (!token || !safeEqual(token, ENV.qaAgentApiToken)) {
        res.status(401).json({ error: "Token do agente inválido." });
        return;
      }
      const externalExecutionId = String(req.body?.execution_id ?? "").trim();
      if (!externalExecutionId || externalExecutionId.length > 128) {
        res.status(400).json({ error: "execution_id é obrigatório." });
        return;
      }
      const checkpoint = await getTestExecutionControlCheckpoint(externalExecutionId);
      if (!checkpoint) {
        res.status(404).json({ error: "Execução não encontrada." });
        return;
      }
      res.status(200).json({
        execution_id: externalExecutionId,
        action: checkpoint.action,
        execution_state: checkpoint.executionState,
        polling_ms: checkpoint.pollingMs,
        checked_at: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha desconhecida.";
      if (message === "DB unavailable") {
        res.status(503).json({ error: "Banco de dados indisponível." });
        return;
      }
      console.error("[qa-test-execution-control] error:", error);
      res.status(500).json({ error: `Falha ao consultar controle: ${message}` });
    }
  });

  app.post("/api/qa/test-executions/progress", async (req, res) => {
    try {
      if (!ENV.qaAgentApiToken) {
        res.status(503).json({ error: "Integração de progresso não configurada." });
        return;
      }
      const token = bearerToken(req);
      if (!token || !safeEqual(token, ENV.qaAgentApiToken)) {
        res.status(401).json({ error: "Token do agente inválido." });
        return;
      }
      const normalized = normalizeExecutionProgressPayload(req.body);
      const saved = await updateTestExecutionProgress(normalized);
      if (!saved) {
        res.status(404).json({ error: "Execução não encontrada." });
        return;
      }
      res.status(200).json({
        ...req.body,
        progress: {
          saved: true,
          completed_scenarios: saved.completedScenarios,
          progress_percent: saved.progressPercent,
          saved_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha desconhecida.";
      if (error instanceof ExecutionProgressValidationError) {
        res.status(400).json({ error: message });
        return;
      }
      if (message === "DB unavailable") {
        res.status(503).json({ error: "Banco de dados indisponível." });
        return;
      }
      console.error("[qa-test-execution-progress] error:", error);
      res.status(500).json({ error: `Falha ao atualizar progresso: ${message}` });
    }
  });

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
