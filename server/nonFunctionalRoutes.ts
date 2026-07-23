import crypto from "node:crypto";
import type { Express, Request } from "express";
import { ENV } from "./_core/env";
import { upsertNonFunctionalRun } from "./db";
import {
  NonFunctionalValidationError,
  normalizeNonFunctionalPayload,
} from "./nonFunctionalService";

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

export function registerNonFunctionalRoutes(app: Express): void {
  app.post("/api/qa/non-functional-runs", async (req, res) => {
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

      const normalized = normalizeNonFunctionalPayload(req.body);
      const saved = await upsertNonFunctionalRun(normalized);
      res.status(saved.created ? 201 : 200).json({
        run_id: normalized.externalRunId,
        status: normalized.status,
        persistence: {
          id: saved.id,
          created: saved.created,
          findings_saved: normalized.findings.length,
          saved_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha desconhecida.";
      if (error instanceof NonFunctionalValidationError) {
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
      console.error("[qa-non-functional-runs] error:", error);
      res.status(500).json({
        error: `Falha ao persistir teste não funcional: ${message}`,
      });
    }
  });
}
