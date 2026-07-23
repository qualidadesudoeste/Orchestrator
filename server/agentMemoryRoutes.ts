import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { ENV } from "./_core/env";
import {
  AgentMemoryValidationError,
  extractAgentMemoryLearnings,
  formatAgentMemoryContext,
  getAgentMemoryScope,
} from "./agentMemoryService";
import {
  getAgentMemories,
  upsertAgentMemories,
} from "./db";

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

function authorize(req: Request): string | undefined {
  if (!ENV.qaAgentApiToken) {
    return "Integração não configurada. Defina QA_AGENT_API_TOKEN no Orchestrator.";
  }
  const token = bearerToken(req);
  if (!token || !safeEqual(token, ENV.qaAgentApiToken)) {
    return "Token do agente inválido.";
  }
  return undefined;
}

function handleError(
  error: unknown,
  res: Response,
  operation: string,
): void {
  const message =
    error instanceof Error ? error.message : "Falha desconhecida.";
  if (error instanceof AgentMemoryValidationError) {
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
  console.error(`[qa-agent-memory:${operation}] error:`, error);
  res.status(500).json({
    error: `Falha ao processar memória do agente: ${message}`,
  });
}

export function registerAgentMemoryRoutes(app: Express): void {
  app.post("/api/qa/agent-memory/context", async (req, res) => {
    const authorizationError = authorize(req);
    if (authorizationError) {
      res
        .status(ENV.qaAgentApiToken ? 401 : 503)
        .json({ error: authorizationError });
      return;
    }
    try {
      const raw = req.body?.json ?? req.body;
      const scope = getAgentMemoryScope(raw);
      const memories = await getAgentMemories(scope.scopeKey, 30);
      res.status(200).json({
        ...raw,
        agent_memory: {
          scope_key: scope.scopeKey,
          project: scope.projectName,
          system_host: scope.systemHost,
          total: memories.length,
          context: formatAgentMemoryContext(memories),
          entries: memories.map(memory => ({
            id: memory.id,
            category: memory.category,
            title: memory.title,
            content: memory.content,
            confidence: memory.confidence,
            occurrences: memory.occurrences,
            source_sprint: memory.sourceSprintName,
            last_seen_at: memory.lastSeenAt.toISOString(),
          })),
        },
      });
    } catch (error) {
      handleError(error, res, "context");
    }
  });

  app.post("/api/qa/agent-memory/learn", async (req, res) => {
    const authorizationError = authorize(req);
    if (authorizationError) {
      res
        .status(ENV.qaAgentApiToken ? 401 : 503)
        .json({ error: authorizationError });
      return;
    }
    try {
      const raw = req.body?.json ?? req.body;
      const scope = getAgentMemoryScope(raw);
      const learnings = extractAgentMemoryLearnings(raw);
      const saved = await upsertAgentMemories(learnings);
      res.status(200).json({
        ...raw,
        memory_learning: {
          scope_key: scope.scopeKey,
          system_host: scope.systemHost,
          received: saved.received,
          inserted: saved.inserted,
          reinforced: saved.updated,
          saved_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      handleError(error, res, "learn");
    }
  });
}
