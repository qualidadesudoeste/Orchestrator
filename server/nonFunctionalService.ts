export type NonFunctionalTool = "K6" | "ZAP" | "AXE";
export type NonFunctionalToolStatus =
  | "PASSOU"
  | "FALHOU"
  | "NAO_EXECUTADO"
  | "ERRO";
export type NonFunctionalRunStatus = "PASSOU" | "FALHOU" | "PARCIAL" | "ERRO";
export type FindingSeverity = "INFO" | "BAIXO" | "MEDIO" | "ALTO" | "CRITICO";

export type NormalizedNonFunctionalFinding = {
  tool: NonFunctionalTool;
  severity: FindingSeverity;
  ruleId?: string;
  title: string;
  description?: string;
  helpUrl?: string;
  occurrences: number;
  rawPayload: string;
};

export type NormalizedNonFunctionalRun = {
  externalRunId: string;
  clientId?: number;
  projectId?: number;
  sprintId?: number;
  clientName?: string;
  projectName: string;
  sprintName?: string;
  targetUrl: string;
  status: NonFunctionalRunStatus;
  k6Status: NonFunctionalToolStatus;
  k6P95Ms?: number;
  k6FailureRateBasisPoints?: number;
  k6Requests: number;
  zapStatus: NonFunctionalToolStatus;
  zapHigh: number;
  zapMedium: number;
  zapLow: number;
  axeStatus: NonFunctionalToolStatus;
  axeCritical: number;
  axeSerious: number;
  axeModerate: number;
  axeMinor: number;
  reportDirectory?: string;
  startedAt?: Date;
  finishedAt: Date;
  rawPayload: string;
  findings: NormalizedNonFunctionalFinding[];
};

export class NonFunctionalValidationError extends Error {}

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

function helpUrl(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  const match = raw.match(/https?:\/\/[^\s<>"']+/i);
  return match?.[0];
}

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function optionalCount(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return count(value);
}

function optionalId(value: unknown): number | undefined {
  const parsed = count(value);
  return parsed > 0 ? parsed : undefined;
}

function optionalDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toolStatus(value: unknown): NonFunctionalToolStatus {
  const normalized = String(value ?? "NAO_EXECUTADO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "_");
  return ["PASSOU", "FALHOU", "NAO_EXECUTADO", "ERRO"].includes(normalized)
    ? (normalized as NonFunctionalToolStatus)
    : "ERRO";
}

function severity(value: unknown): FindingSeverity {
  const normalized = String(value ?? "INFO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const aliases: Record<string, FindingSeverity> = {
    INFORMATIONAL: "INFO",
    LOW: "BAIXO",
    MEDIUM: "MEDIO",
    HIGH: "ALTO",
    CRITICAL: "CRITICO",
    MINOR: "BAIXO",
    MODERATE: "MEDIO",
    SERIOUS: "ALTO",
  };
  const translated = aliases[normalized] ?? normalized;
  return ["INFO", "BAIXO", "MEDIO", "ALTO", "CRITICO"].includes(translated)
    ? (translated as FindingSeverity)
    : "INFO";
}

function normalizeFindings(
  tool: NonFunctionalTool,
  value: unknown,
): NormalizedNonFunctionalFinding[] {
  return array(value)
    .filter(
      item =>
        !(
          tool === "ZAP" &&
          String(object(item).plugin_id ?? object(item).rule_id) === "10116"
        ),
    )
    .slice(0, 1000)
    .map((item, index) => {
    const finding = object(item);
    return {
      tool,
      severity: severity(
        finding.severity ?? finding.risk ?? finding.impact ?? finding.level,
      ),
      ruleId: text(
        finding.rule_id ??
          finding.ruleId ??
          finding.plugin_id ??
          finding.id ??
          finding.test,
      ),
      title:
        text(
          finding.title ??
            finding.name ??
            finding.alert ??
            finding.metric,
        ) ?? `${tool} — achado ${index + 1}`,
      description: text(
        finding.description ??
          finding.help ??
          finding.message ??
          finding.failure,
      ),
      helpUrl: helpUrl(
        finding.help_url ??
          finding.helpUrl ??
          finding.help_uri ??
          finding.reference,
      ),
      occurrences: Math.max(
        1,
        count(finding.occurrences ?? finding.nodes ?? finding.count ?? 1),
      ),
      rawPayload: JSON.stringify(finding),
    };
    });
}

function deriveRunStatus(
  statuses: NonFunctionalToolStatus[],
): NonFunctionalRunStatus {
  if (statuses.every(item => item === "ERRO" || item === "NAO_EXECUTADO")) {
    return "ERRO";
  }
  if (statuses.includes("FALHOU")) return "FALHOU";
  if (statuses.some(item => item === "ERRO" || item === "NAO_EXECUTADO")) {
    return "PARCIAL";
  }
  return "PASSOU";
}

export function normalizeNonFunctionalPayload(
  payload: unknown,
): NormalizedNonFunctionalRun {
  const raw = object((payload as any)?.json ?? payload);
  const externalRunId = text(raw.run_id ?? raw.external_run_id);
  if (!externalRunId) {
    throw new NonFunctionalValidationError(
      "Informe run_id para garantir ingestão sem duplicidade.",
    );
  }

  const targetUrl = text(raw.target_url ?? raw.sistema_url);
  if (!targetUrl) {
    throw new NonFunctionalValidationError("Informe target_url.");
  }
  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    throw new NonFunctionalValidationError("target_url é inválida.");
  }
  if (!["http:", "https:"].includes(parsedTarget.protocol)) {
    throw new NonFunctionalValidationError(
      "target_url deve usar HTTP ou HTTPS.",
    );
  }

  const k6 = object(raw.k6);
  const k6Metrics = object(k6.metrics);
  const zap = object(raw.zap);
  const zapAlerts = object(zap.alerts);
  const axe = object(raw.axe);
  const axeViolations = object(axe.violations);

  const k6Status = toolStatus(k6.status);
  const zapStatus = toolStatus(zap.status);
  const axeStatus = toolStatus(axe.status);
  const findings = [
    ...normalizeFindings("K6", k6.findings),
    ...normalizeFindings("ZAP", zap.findings),
    ...normalizeFindings("AXE", axe.findings),
  ];

  return {
    externalRunId,
    clientId: optionalId(raw.client_id),
    projectId: optionalId(raw.project_id),
    sprintId: optionalId(raw.sprint_id),
    clientName: text(raw.cliente ?? raw.client_name),
    projectName:
      text(raw.projeto ?? raw.project_name) ?? "Projeto não informado",
    sprintName: text(raw.sprint ?? raw.sprint_name),
    targetUrl: parsedTarget.toString(),
    status: deriveRunStatus([k6Status, zapStatus, axeStatus]),
    k6Status,
    k6P95Ms: optionalCount(
      k6Metrics.http_req_duration_p95_ms ?? k6Metrics.p95_ms,
    ),
    k6FailureRateBasisPoints: optionalCount(
      k6Metrics.http_req_failed_basis_points ??
        (Number(k6Metrics.http_req_failed_rate) * 10_000),
    ),
    k6Requests: count(k6Metrics.total_requests ?? k6Metrics.requests),
    zapStatus,
    zapHigh: count(zapAlerts.high ?? zapAlerts.alto),
    zapMedium: count(zapAlerts.medium ?? zapAlerts.medio),
    zapLow: count(zapAlerts.low ?? zapAlerts.baixo),
    axeStatus,
    axeCritical: count(axeViolations.critical ?? axeViolations.critico),
    axeSerious: count(axeViolations.serious ?? axeViolations.serio),
    axeModerate: count(axeViolations.moderate ?? axeViolations.moderado),
    axeMinor: count(axeViolations.minor ?? axeViolations.baixo),
    reportDirectory: text(raw.report_directory ?? raw.diretorio_relatorios),
    startedAt: optionalDate(raw.started_at ?? raw.inicio_processamento),
    finishedAt:
      optionalDate(raw.finished_at ?? raw.fim_processamento) ?? new Date(),
    rawPayload: JSON.stringify(raw),
    findings,
  };
}
