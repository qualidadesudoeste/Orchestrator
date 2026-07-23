export type AttemptStatus =
  | "PASSOU"
  | "FALHOU"
  | "BLOQUEADO"
  | "ERRO_AUTOMACAO";

export type ReliabilityClassification =
  | "ESTAVEL"
  | "FLAKY"
  | "FALHA_REAL"
  | "INCONCLUSIVO";

export type NormalizedAttempt = {
  attempt: number;
  status: AttemptStatus;
  summary?: string;
  durationMs?: number;
  evidence: string[];
};

export type ScenarioReliability = {
  classification: ReliabilityClassification;
  attempts: number;
  passedAttempts: number;
  failedAttempts: number;
  blockedAttempts: number;
  automationErrorAttempts: number;
  history: NormalizedAttempt[];
};

export type ReliabilityReportData = {
  executionId: string;
  projectName: string;
  sprintName?: string;
  generatedAt: string;
  totals: {
    scenarios: number;
    stable: number;
    flaky: number;
    realFailures: number;
    inconclusive: number;
  };
  results: Array<{
    scenarioId: string;
    title: string;
    originalStatus: AttemptStatus;
    reliability: ScenarioReliability;
    summary?: string;
  }>;
  enrichedPayload: Record<string, any>;
};

export class ReliabilityReportValidationError extends Error {}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function array(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function integer(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed)
    : undefined;
}

function status(value: unknown): AttemptStatus {
  const normalized = String(value ?? "ERRO_AUTOMACAO").toUpperCase();
  return ["PASSOU", "FALHOU", "BLOQUEADO", "ERRO_AUTOMACAO"].includes(
    normalized,
  )
    ? (normalized as AttemptStatus)
    : "ERRO_AUTOMACAO";
}

function redact(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(
      /\b(password|senha|token|authorization|api[_-]?key)\b\s*[:=]\s*([^\s,;]+)/gi,
      "$1=[REDACTED]",
    );
}

function evidenceValues(value: unknown): string[] {
  return array(value)
    .map(item => {
      if (typeof item === "string") return redact(text(item));
      const record = object(item);
      return redact(
        text(record.url ?? record.download_url ?? record.caminho ?? record.path),
      );
    })
    .filter((item): item is string => Boolean(item))
    .slice(0, 20);
}

export function classifyScenarioReliability(
  rawResult: unknown,
): ScenarioReliability {
  const result = object(rawResult);
  const observed = object(result.resultado_teste ?? result.result);
  const rawAttempts = array(
    observed.tentativas ??
      observed.attempts ??
      result.tentativas ??
      result.attempts,
  );
  const fallbackAttempt = {
    status: result.status ?? observed.status,
    resumo: observed.resumo ?? result.resumo,
    duration_ms: result.duration_ms ?? result.durationMs,
    evidencias: observed.evidencias ?? result.evidencias,
  };
  const source = rawAttempts.length > 0 ? rawAttempts.slice(0, 5) : [fallbackAttempt];
  const history = source.map((rawAttempt, index): NormalizedAttempt => {
    const attempt = object(rawAttempt);
    return {
      attempt: index + 1,
      status: status(attempt.status ?? rawAttempt),
      summary: redact(
        text(
          attempt.resumo ??
            attempt.summary ??
            attempt.detalhe ??
            attempt.detail,
        ),
      ),
      durationMs: integer(attempt.duration_ms ?? attempt.durationMs),
      evidence: evidenceValues(attempt.evidencias ?? attempt.evidence),
    };
  });

  const passedAttempts = history.filter(item => item.status === "PASSOU").length;
  const failedAttempts = history.filter(item => item.status === "FALHOU").length;
  const blockedAttempts = history.filter(
    item => item.status === "BLOQUEADO",
  ).length;
  const automationErrorAttempts = history.filter(
    item => item.status === "ERRO_AUTOMACAO",
  ).length;

  let classification: ReliabilityClassification;
  if (
    passedAttempts > 0 &&
    failedAttempts + blockedAttempts + automationErrorAttempts > 0
  ) {
    classification = "FLAKY";
  } else if (passedAttempts === history.length) {
    classification = "ESTAVEL";
  } else if (failedAttempts === history.length) {
    classification = "FALHA_REAL";
  } else {
    classification = "INCONCLUSIVO";
  }

  return {
    classification,
    attempts: history.length,
    passedAttempts,
    failedAttempts,
    blockedAttempts,
    automationErrorAttempts,
    history,
  };
}

export function buildReliabilityReport(payload: unknown): ReliabilityReportData {
  const raw = object((payload as any)?.json ?? payload);
  const executionId = text(raw.execution_id ?? raw.external_execution_id);
  if (!executionId) {
    throw new ReliabilityReportValidationError(
      "Informe execution_id para gerar o relatório de confiabilidade.",
    );
  }
  const rawResults = array(raw.resultados ?? raw.results);
  if (rawResults.length === 0) {
    throw new ReliabilityReportValidationError(
      "Informe ao menos um resultado para gerar o relatório.",
    );
  }
  if (rawResults.length > 500) {
    throw new ReliabilityReportValidationError(
      "Uma execução pode conter no máximo 500 resultados.",
    );
  }

  const results = rawResults.map((rawResult, index) => {
    const result = object(rawResult);
    const observed = object(result.resultado_teste ?? result.result);
    return {
      scenarioId:
        text(result.scenario_id ?? result.id) ??
        `CT-${String(index + 1).padStart(3, "0")}`,
      title:
        redact(text(result.scenario_title ?? result.title)) ??
        `Cenário ${index + 1}`,
      originalStatus: status(result.status ?? observed.status),
      reliability: classifyScenarioReliability(result),
      summary: redact(text(observed.resumo ?? result.resumo)),
    };
  });
  const totals = {
    scenarios: results.length,
    stable: results.filter(
      item => item.reliability.classification === "ESTAVEL",
    ).length,
    flaky: results.filter(
      item => item.reliability.classification === "FLAKY",
    ).length,
    realFailures: results.filter(
      item => item.reliability.classification === "FALHA_REAL",
    ).length,
    inconclusive: results.filter(
      item => item.reliability.classification === "INCONCLUSIVO",
    ).length,
  };
  const enrichedResults = rawResults.map((rawResult, index) => {
    const result = object(rawResult);
    const observedKey = result.resultado_teste ? "resultado_teste" : "result";
    const observed = object(result[observedKey]);
    const reliability = results[index].reliability;
    return {
      ...result,
      reliability: {
        classification: reliability.classification,
        attempts: reliability.attempts,
        passed_attempts: reliability.passedAttempts,
        failed_attempts: reliability.failedAttempts,
        blocked_attempts: reliability.blockedAttempts,
        automation_error_attempts: reliability.automationErrorAttempts,
      },
      [observedKey]: {
        ...observed,
        tentativas: reliability.history.map(attempt => ({
          numero: attempt.attempt,
          status: attempt.status,
          resumo: attempt.summary,
          duration_ms: attempt.durationMs,
          evidencias: attempt.evidence,
        })),
      },
    };
  });

  return {
    executionId,
    projectName:
      redact(text(raw.projeto ?? raw.project_name)) ?? "Projeto não informado",
    sprintName: redact(text(raw.sprint ?? raw.sprint_name)),
    generatedAt: new Date().toISOString(),
    totals,
    results,
    enrichedPayload: {
      ...raw,
      resultados: enrichedResults,
      totais_confiabilidade: totals,
      status_geral_confiavel:
        totals.realFailures > 0
          ? "FALHOU"
          : totals.inconclusive > 0
            ? "INCONCLUSIVO"
            : "PASSOU",
    },
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const LABELS: Record<ReliabilityClassification, string> = {
  ESTAVEL: "Estável",
  FLAKY: "Flaky",
  FALHA_REAL: "Falha real",
  INCONCLUSIVO: "Inconclusivo",
};

function scenarioRows(
  results: ReliabilityReportData["results"],
  emptyMessage: string,
): string {
  if (results.length === 0) {
    return `<tr><td colspan="5" class="empty">${escapeHtml(emptyMessage)}</td></tr>`;
  }
  return results
    .map(result => {
      const attempts = result.reliability.history
        .map(
          attempt =>
            `<span class="attempt ${attempt.status.toLowerCase()}">#${attempt.attempt} ${escapeHtml(attempt.status)}</span>`,
        )
        .join(" ");
      return `<tr>
        <td><strong>${escapeHtml(result.scenarioId)}</strong></td>
        <td>${escapeHtml(result.title)}</td>
        <td><span class="badge ${result.reliability.classification.toLowerCase()}">${escapeHtml(LABELS[result.reliability.classification])}</span></td>
        <td>${attempts}</td>
        <td>${escapeHtml(result.summary ?? "Sem resumo informado.")}</td>
      </tr>`;
    })
    .join("");
}

export function renderReliabilityHtml(data: ReliabilityReportData): string {
  const realFailures = data.results.filter(
    item => item.reliability.classification === "FALHA_REAL",
  );
  const flaky = data.results.filter(
    item => item.reliability.classification === "FLAKY",
  );
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Extent QA — ${escapeHtml(data.executionId)}</title>
  <style>
    :root{font-family:Inter,Segoe UI,Arial,sans-serif;color:#172033;background:#f4f7fb}
    *{box-sizing:border-box}body{margin:0}.wrap{max-width:1280px;margin:auto;padding:28px}
    header{background:linear-gradient(135deg,#172554,#3730a3);color:white;padding:28px;border-radius:16px;box-shadow:0 12px 30px #17255422}
    h1{margin:0 0 8px;font-size:28px}h2{font-size:18px;margin:28px 0 12px}.meta{opacity:.82}
    .cards{display:grid;grid-template-columns:repeat(5,minmax(130px,1fr));gap:12px;margin:18px 0}
    .card{background:white;border-radius:12px;padding:16px;border:1px solid #e5e7eb}.card b{display:block;font-size:26px;margin-top:5px}
    .table{background:white;border:1px solid #e5e7eb;border-radius:12px;overflow:auto}
    table{width:100%;border-collapse:collapse;min-width:850px}th,td{text-align:left;padding:12px;border-bottom:1px solid #eef2f7;font-size:13px;vertical-align:top}
    th{background:#f8fafc;color:#64748b;text-transform:uppercase;font-size:11px;letter-spacing:.04em}
    .badge,.attempt{display:inline-block;border-radius:999px;padding:4px 8px;font-weight:700;font-size:11px;white-space:nowrap}
    .estavel,.passou{background:#dcfce7;color:#166534}.flaky{background:#fef3c7;color:#92400e}.falha_real,.falhou{background:#fee2e2;color:#991b1b}.inconclusivo,.bloqueado,.erro_automacao{background:#e2e8f0;color:#475569}
    .attempt{margin:0 3px 3px 0}.empty{color:#64748b;text-align:center;padding:24px}
    .note{border-left:4px solid #f59e0b;background:#fffbeb;padding:12px 14px;border-radius:8px;color:#78350f}
    footer{color:#64748b;font-size:12px;margin:24px 0;text-align:center}
    @media(max-width:800px){.cards{grid-template-columns:repeat(2,1fr)}.wrap{padding:14px}}
  </style>
</head>
<body><main class="wrap">
  <header>
    <h1>Extent QA — Relatório de Confiabilidade</h1>
    <div class="meta">Execução ${escapeHtml(data.executionId)} · ${escapeHtml(data.projectName)} · ${escapeHtml(data.sprintName ?? "Sem sprint")}</div>
  </header>
  <section class="cards">
    <div class="card">Cenários<b>${data.totals.scenarios}</b></div>
    <div class="card">Estáveis<b>${data.totals.stable}</b></div>
    <div class="card">Flaky<b>${data.totals.flaky}</b></div>
    <div class="card">Falhas reais<b>${data.totals.realFailures}</b></div>
    <div class="card">Inconclusivos<b>${data.totals.inconclusive}</b></div>
  </section>
  <p class="note">A lista principal contém somente falhas reproduzidas de forma consistente. Cenários flaky ficam separados e não são contabilizados como defeitos reais.</p>
  <h2>Falhas reais</h2>
  <div class="table"><table><thead><tr><th>Cenário</th><th>Título</th><th>Classificação</th><th>Tentativas</th><th>Resumo</th></tr></thead><tbody>${scenarioRows(realFailures, "Nenhuma falha real nesta execução.")}</tbody></table></div>
  <h2>Testes flaky</h2>
  <div class="table"><table><thead><tr><th>Cenário</th><th>Título</th><th>Classificação</th><th>Tentativas</th><th>Resumo</th></tr></thead><tbody>${scenarioRows(flaky, "Nenhum teste flaky nesta execução.")}</tbody></table></div>
  <h2>Todos os cenários</h2>
  <div class="table"><table><thead><tr><th>Cenário</th><th>Título</th><th>Classificação</th><th>Tentativas</th><th>Resumo</th></tr></thead><tbody>${scenarioRows(data.results, "Nenhum cenário.")}</tbody></table></div>
  <footer>Gerado automaticamente pelo Orchestrator em ${escapeHtml(data.generatedAt)}.</footer>
</main></body></html>`;
  if (Buffer.byteLength(html, "utf8") > 2_000_000) {
    throw new ReliabilityReportValidationError(
      "O relatório de confiabilidade excede 2 MB.",
    );
  }
  return html;
}
