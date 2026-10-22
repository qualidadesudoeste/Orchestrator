export type ExecutionProgressEvent = "SCENARIO_STARTED" | "SCENARIO_COMPLETED";

export type NormalizedExecutionProgress = {
  externalExecutionId: string;
  event: ExecutionProgressEvent;
  scenarioIndex: number;
  scenarioId: string;
  scenarioTitle: string;
  environment: string;
  stage: string;
  status?: "PASSOU" | "FALHOU" | "BLOQUEADO" | "ERRO_AUTOMACAO";
  summary?: string;
  occurredAt: Date;
};

export class ExecutionProgressValidationError extends Error {}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function text(value: unknown, max = 1000): string {
  return String(value ?? "").trim().slice(0, max);
}

export function normalizeExecutionProgressPayload(payload: unknown): NormalizedExecutionProgress {
  const raw = object(payload);
  const result = object(raw.resultado_teste ?? raw.result);
  const externalExecutionId = text(raw.execution_id ?? raw.external_execution_id, 128);
  const event = text(raw.event, 40).toUpperCase() as ExecutionProgressEvent;
  const scenarioIndex = Number(raw.scenario_index ?? raw.scenarioIndex ?? 0);
  const scenarioId = text(raw.scenario_id ?? raw.scenarioId, 160);
  const scenarioTitle = text(raw.scenario_title ?? raw.scenarioTitle, 500);

  if (!externalExecutionId) throw new ExecutionProgressValidationError("execution_id é obrigatório.");
  if (!(["SCENARIO_STARTED", "SCENARIO_COMPLETED"] as string[]).includes(event)) {
    throw new ExecutionProgressValidationError("Evento de progresso inválido.");
  }
  if (!Number.isInteger(scenarioIndex) || scenarioIndex < 1) {
    throw new ExecutionProgressValidationError("scenario_index deve ser um inteiro positivo.");
  }
  if (!scenarioId || !scenarioTitle) {
    throw new ExecutionProgressValidationError("Identificação do cenário incompleta.");
  }

  const normalized: NormalizedExecutionProgress = {
    externalExecutionId,
    event,
    scenarioIndex,
    scenarioId,
    scenarioTitle,
    environment: text(raw.ambiente ?? raw.environment, 160),
    stage: text(raw.stage, 80) || (event === "SCENARIO_STARTED" ? "EXECUTANDO" : "CENARIO_CONCLUIDO"),
    occurredAt: new Date(),
  };

  if (event === "SCENARIO_COMPLETED") {
    const status = text(raw.status ?? result.status, 40).toUpperCase();
    if (!( ["PASSOU", "FALHOU", "BLOQUEADO", "ERRO_AUTOMACAO"] as string[]).includes(status)) {
      throw new ExecutionProgressValidationError("Status do cenário inválido.");
    }
    normalized.status = status as NormalizedExecutionProgress["status"];
    normalized.summary = text(result.resumo ?? raw.resumo ?? raw.summary, 1000);
  }

  return normalized;
}
