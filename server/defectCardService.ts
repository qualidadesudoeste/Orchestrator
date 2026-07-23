import crypto from "node:crypto";

export type DefectSeverity = "BAIXO" | "MEDIO" | "ALTO" | "CRITICO";

export type NormalizedDefectCard = {
  externalCardId: string;
  externalExecutionId: string;
  externalScenarioId: string;
  clientId?: number;
  projectId?: number;
  sprintId?: number;
  clientName?: string;
  projectName: string;
  sprintName?: string;
  systemUrl?: string;
  scenarioTitle: string;
  title: string;
  severity: DefectSeverity;
  summary: string;
  expectedResult?: string;
  actualResult: string;
  reproductionSteps: string;
  evidenceJson: string;
  markdown: string;
  rawPayload: string;
};

export class DefectCardValidationError extends Error {}

export function getDefectExecutionId(payload: unknown): string {
  const raw = object((payload as any)?.json ?? payload);
  const externalExecutionId = text(
    raw.execution_id ?? raw.external_execution_id,
  );
  if (!externalExecutionId) {
    throw new DefectCardValidationError(
      "Informe execution_id para gerar cards sem duplicidade.",
    );
  }
  return externalExecutionId;
}

function array(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function text(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function optionalId(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
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

function severity(value: unknown): DefectSeverity {
  const normalized = String(value ?? "MEDIO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const aliases: Record<string, DefectSeverity> = {
    LOW: "BAIXO",
    MEDIUM: "MEDIO",
    HIGH: "ALTO",
    CRITICAL: "CRITICO",
    SERIOUS: "ALTO",
  };
  const translated = aliases[normalized] ?? normalized;
  return ["BAIXO", "MEDIO", "ALTO", "CRITICO"].includes(translated)
    ? (translated as DefectSeverity)
    : "MEDIO";
}

function expectedFromGherkin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const lines = value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^(?:Então|Entao|Then|E |And )/i.test(line));
  return redact(lines.join("\n")) || undefined;
}

function markdownList(values: string[]): string {
  return values.length > 0
    ? values.map(value => `- ${value}`).join("\n")
    : "- Nenhuma evidência disponível.";
}

function createMarkdown(card: Omit<NormalizedDefectCard, "markdown" | "rawPayload">): string {
  const steps = card.reproductionSteps.trim() || "1. Passos não informados.";
  const expected = card.expectedResult || "Não informado.";
  const environment = card.systemUrl || "Não informado.";
  const evidence = JSON.parse(card.evidenceJson) as string[];

  return [
    `# [BUG] ${card.title}`,
    "",
    "## Identificação",
    "",
    `- **ID:** ${card.externalCardId}`,
    `- **Projeto:** ${card.projectName}`,
    `- **Sprint:** ${card.sprintName || "Não informada"}`,
    `- **Cenário:** ${card.externalScenarioId} — ${card.scenarioTitle}`,
    `- **Severidade:** ${card.severity}`,
    "- **Status:** ABERTO",
    `- **Ambiente:** ${environment}`,
    "",
    "## Resumo",
    "",
    card.summary,
    "",
    "## Passos para reprodução",
    "",
    steps,
    "",
    "## Resultado esperado",
    "",
    expected,
    "",
    "## Resultado obtido",
    "",
    card.actualResult,
    "",
    "## Evidências",
    "",
    markdownList(evidence),
    "",
    "---",
    "",
    `Gerado automaticamente pelo Orchestrator a partir da execução ${card.externalExecutionId}.`,
    "",
  ].join("\n");
}

function failureText(value: unknown): string {
  if (typeof value === "string") return redact(value) || "Falha funcional.";
  const failure = object(value);
  return (
    redact(
      text(
        failure.resultado_obtido ??
          failure.actual_result ??
          failure.descricao ??
          failure.description ??
          failure.detalhe ??
          failure.message,
      ),
    ) || "Falha funcional registrada pelo agente."
  );
}

export function generateDefectCards(payload: unknown): NormalizedDefectCard[] {
  const raw = object((payload as any)?.json ?? payload);
  const externalExecutionId = getDefectExecutionId(raw);

  const results = array(raw.resultados ?? raw.results);
  if (results.length > 500) {
    throw new DefectCardValidationError(
      "Uma execução pode conter no máximo 500 resultados.",
    );
  }

  const projectName =
    redact(text(raw.projeto ?? raw.project_name)) ?? "Projeto não informado";
  const sprintName = redact(text(raw.sprint ?? raw.sprint_name));
  const systemUrl = redact(text(raw.sistema_url ?? raw.system_url));
  const cards: NormalizedDefectCard[] = [];

  for (let scenarioIndex = 0; scenarioIndex < results.length; scenarioIndex += 1) {
    const result = results[scenarioIndex];
    const observed = object(result?.resultado_teste ?? result?.result);
    const status = String(result?.status ?? observed.status ?? "").toUpperCase();
    const realFailures = array(
      observed.falhas_reais ?? result?.falhas_reais,
    );
    if (status !== "FALHOU" || realFailures.length === 0) continue;

    const scenarioId =
      text(result?.scenario_id ?? result?.id) ??
      `CT-${String(scenarioIndex + 1).padStart(3, "0")}`;
    const scenarioTitle =
      redact(text(result?.scenario_title ?? result?.title)) ??
      `Cenário ${scenarioIndex + 1}`;
    const gherkin = redact(text(result?.cenario ?? result?.gherkin));
    const observedSteps = array(observed.passos ?? result?.passos)
      .map((step, index) => {
        const stepObject = object(step);
        const description = redact(
          text(stepObject.descricao ?? stepObject.description ?? step),
        );
        return description ? `${index + 1}. ${description}` : undefined;
      })
      .filter((step): step is string => Boolean(step));
    const evidence = array(observed.evidencias ?? result?.evidencias)
      .map(item => {
        const evidenceItem = object(item);
        return redact(
          text(
            evidenceItem.url ??
              evidenceItem.download_url ??
              evidenceItem.caminho ??
              evidenceItem.path ??
              item,
          ),
        );
      })
      .filter((item): item is string => Boolean(item));

    for (
      let failureIndex = 0;
      failureIndex < realFailures.length;
      failureIndex += 1
    ) {
      const failureValue = realFailures[failureIndex];
      if (cards.length >= 200) {
        throw new DefectCardValidationError(
          "Uma execução pode gerar no máximo 200 cards.",
        );
      }
      const failure = object(failureValue);
      const actualResult = failureText(failureValue);
      const summary =
        redact(
          text(
            failure.resumo ??
              failure.summary ??
              failure.descricao ??
              failure.description,
          ),
        ) ??
        redact(text(observed.resumo ?? result?.resumo)) ??
        actualResult;
      const expectedResult =
        redact(
          text(
            failure.resultado_esperado ??
              failure.expected_result ??
              result?.resultado_esperado,
          ),
        ) ?? expectedFromGherkin(gherkin);
      const title =
        redact(text(failure.titulo ?? failure.title)) ??
        `${scenarioTitle}: ${actualResult}`.slice(0, 180);
      const digest = crypto
        .createHash("sha256")
        .update(
          `${externalExecutionId}|${scenarioId}|${failureIndex}|${JSON.stringify(failureValue)}`,
        )
        .digest("hex")
        .slice(0, 20)
        .toUpperCase();
      const externalCardId = `BUG-${digest}`;
      const baseCard = {
        externalCardId,
        externalExecutionId,
        externalScenarioId: scenarioId,
        clientId: optionalId(raw.client_id),
        projectId: optionalId(raw.project_id),
        sprintId: optionalId(raw.sprint_id),
        clientName: redact(text(raw.cliente ?? raw.client_name)),
        projectName,
        sprintName,
        systemUrl,
        scenarioTitle,
        title,
        severity: severity(
          failure.severidade ??
            failure.severity ??
            result?.risco ??
            result?.risk ??
            observed.risco,
        ),
        summary,
        expectedResult,
        actualResult,
        reproductionSteps:
          observedSteps.length > 0
            ? observedSteps.join("\n")
            : gherkin
              ? gherkin
                  .split(/\r?\n/)
                  .map(line => line.trim())
                  .filter(line => /^(?:Dado|Quando|Então|Entao|E |Given|When|Then|And )/i.test(line))
                  .map((line, index) => `${index + 1}. ${line}`)
                  .join("\n")
              : "1. Passos não informados.",
        evidenceJson: JSON.stringify(evidence),
      };
      const markdown = createMarkdown(baseCard);
      if (Buffer.byteLength(markdown, "utf8") > 200_000) {
        throw new DefectCardValidationError(
          `${externalCardId}: card Markdown excede 200 KB.`,
        );
      }
      cards.push({
        ...baseCard,
        markdown,
        rawPayload: JSON.stringify({
          execution_id: externalExecutionId,
          scenario_id: scenarioId,
          failure_index: failureIndex,
          source: "qa-agent",
        }),
      });
    }
  }

  return cards;
}
