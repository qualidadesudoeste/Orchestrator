export type ExecutionStatus =
  | "PASSOU"
  | "FALHOU"
  | "BLOQUEADO"
  | "ERRO_AUTOMACAO";

export type RiskLevel = "BAIXO" | "MEDIO" | "ALTO" | "CRITICO";

export type NormalizedTestResult = {
  externalScenarioId: string;
  title: string;
  moduleName?: string;
  gherkin?: string;
  status: ExecutionStatus;
  risk: RiskLevel;
  summary?: string;
  realDefects: number;
  automationFailures: number;
  durationMs?: number;
  evidenceJson: string;
  failuresJson: string;
  regressionCodeUrl?: string;
  executedAt?: Date;
};

export type NormalizedTestExecution = {
  externalExecutionId: string;
  clientId?: number;
  projectId?: number;
  sprintId?: number;
  clientName?: string;
  projectName: string;
  sprintName?: string;
  systemUrl?: string;
  status: ExecutionStatus;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  blockedScenarios: number;
  automationErrors: number;
  coveragePercent: number;
  defectsFound: number;
  criticalDefects: number;
  escapedDefects: number;
  evidenceDocxUrl?: string;
  regressionBundleId?: string;
  startedAt?: Date;
  finishedAt?: Date;
  rawPayload: string;
  results: NormalizedTestResult[];
};

export class TestExecutionValidationError extends Error {}

function integer(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function optionalId(value: unknown): number | undefined {
  const parsed = integer(value);
  return parsed > 0 ? parsed : undefined;
}

function clampPercent(value: unknown): number {
  return Math.min(100, integer(value));
}

function optionalDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function status(value: unknown): ExecutionStatus {
  const normalized = String(value ?? "ERRO_AUTOMACAO").toUpperCase();
  return ["PASSOU", "FALHOU", "BLOQUEADO", "ERRO_AUTOMACAO"].includes(
    normalized,
  )
    ? (normalized as ExecutionStatus)
    : "ERRO_AUTOMACAO";
}

function risk(value: unknown): RiskLevel {
  const normalized = String(value ?? "MEDIO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return ["BAIXO", "MEDIO", "ALTO", "CRITICO"].includes(normalized)
    ? (normalized as RiskLevel)
    : "MEDIO";
}

function text(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function moduleFromGherkin(gherkin: string | undefined): string | undefined {
  return gherkin?.match(/(?:Funcionalidade|Feature):\s*([^\r\n]+)/i)?.[1]?.trim();
}

export function normalizeTestExecutionPayload(
  payload: unknown,
): NormalizedTestExecution {
  const raw = (payload as any)?.json ?? payload;
  if (!raw || typeof raw !== "object") {
    throw new TestExecutionValidationError("O JSON de execução é inválido.");
  }

  const rawResults = array((raw as any).resultados ?? (raw as any).results);
  if (rawResults.length === 0) {
    throw new TestExecutionValidationError(
      "A execução deve conter ao menos um resultado.",
    );
  }
  if (rawResults.length > 500) {
    throw new TestExecutionValidationError(
      "Uma execução pode conter no máximo 500 resultados.",
    );
  }

  const regressionFiles = array((raw as any).regression_code?.files);
  const regressionUrls = new Map<string, string>();
  for (const file of regressionFiles as any[]) {
    if (file?.scenario_id && file?.download_url) {
      regressionUrls.set(String(file.scenario_id), String(file.download_url));
    }
  }

  const results: NormalizedTestResult[] = rawResults.map(
    (item: any, index) => {
      const observed = item?.resultado_teste ?? item?.result ?? {};
      const scenarioId =
        text(item?.scenario_id ?? item?.id) ??
        `CT-${String(index + 1).padStart(3, "0")}`;
      const gherkin = text(item?.cenario ?? item?.gherkin ?? item?.bdd);
      const realFailures = array(
        observed?.falhas_reais ?? item?.falhas_reais,
      );
      const automationFailures = array(
        observed?.falhas_automacao ?? item?.falhas_automacao,
      );
      const evidences = array(observed?.evidencias ?? item?.evidencias);
      const resultStatus = status(item?.status ?? observed?.status);
      const resultRisk = risk(
        item?.risco ?? item?.risk ?? observed?.risco ?? observed?.risk,
      );

      return {
        externalScenarioId: scenarioId,
        title:
          text(item?.scenario_title ?? item?.title) ?? `Cenário ${index + 1}`,
        moduleName:
          text(item?.modulo ?? item?.module ?? item?.funcionalidade) ??
          moduleFromGherkin(gherkin),
        gherkin,
        status: resultStatus,
        risk: resultRisk,
        summary: text(observed?.resumo ?? item?.resumo),
        realDefects: realFailures.length,
        automationFailures: automationFailures.length,
        durationMs: optionalId(item?.duration_ms ?? item?.durationMs),
        evidenceJson: JSON.stringify(evidences),
        failuresJson: JSON.stringify({
          real: realFailures,
          automation: automationFailures,
        }),
        regressionCodeUrl:
          regressionUrls.get(scenarioId) ??
          text(item?.regression_code_url ?? observed?.regression_code_url),
        executedAt: optionalDate(
          item?.data_execucao ?? item?.executed_at ?? item?.executedAt,
        ),
      };
    },
  );

  const counts = {
    PASSOU: results.filter(item => item.status === "PASSOU").length,
    FALHOU: results.filter(item => item.status === "FALHOU").length,
    BLOQUEADO: results.filter(item => item.status === "BLOQUEADO").length,
    ERRO_AUTOMACAO: results.filter(
      item => item.status === "ERRO_AUTOMACAO",
    ).length,
  };
  const totalScenarios = results.length;
  const executedScenarios = counts.PASSOU + counts.FALHOU;
  const defectsFound = results.reduce(
    (total, result) => total + result.realDefects,
    0,
  );
  const criticalDefects = results.reduce(
    (total, result) =>
      total +
      (result.risk === "CRITICO" && result.status === "FALHOU"
        ? Math.max(1, result.realDefects)
        : 0),
    0,
  );
  const externalExecutionId = text(
    (raw as any).execution_id ?? (raw as any).external_execution_id,
  );
  if (!externalExecutionId) {
    throw new TestExecutionValidationError(
      "Informe execution_id para garantir ingestão sem duplicidade.",
    );
  }

  const rawCoverage =
    (raw as any).coverage_percent ?? (raw as any).score_cobertura;

  return {
    externalExecutionId,
    clientId: optionalId((raw as any).client_id),
    projectId: optionalId((raw as any).project_id),
    sprintId: optionalId((raw as any).sprint_id),
    clientName: text((raw as any).cliente ?? (raw as any).client_name),
    projectName:
      text((raw as any).projeto ?? (raw as any).project_name) ??
      "Projeto não informado",
    sprintName: text((raw as any).sprint ?? (raw as any).sprint_name),
    systemUrl: text((raw as any).sistema_url ?? (raw as any).system_url),
    status: status((raw as any).status_geral),
    totalScenarios,
    passedScenarios: counts.PASSOU,
    failedScenarios: counts.FALHOU,
    blockedScenarios: counts.BLOQUEADO,
    automationErrors: counts.ERRO_AUTOMACAO,
    coveragePercent:
      rawCoverage === undefined
        ? clampPercent((executedScenarios / totalScenarios) * 100)
        : clampPercent(rawCoverage),
    defectsFound,
    criticalDefects:
      integer((raw as any).critical_defects, criticalDefects),
    escapedDefects: integer((raw as any).escaped_defects),
    evidenceDocxUrl: text((raw as any).evidence_docx?.download_url),
    regressionBundleId: text((raw as any).regression_code?.bundle_id),
    startedAt: optionalDate(
      (raw as any).inicio_processamento ?? (raw as any).started_at,
    ),
    finishedAt:
      optionalDate(
        (raw as any).fim_processamento ?? (raw as any).finished_at,
      ) ?? new Date(),
    rawPayload: JSON.stringify(raw),
    results,
  };
}
