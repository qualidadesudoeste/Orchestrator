import path from "node:path";
import { promises as fs } from "node:fs";
import {
  getAgentMemories,
  getAgentMemoryByFingerprint,
  getExecutionCheckpoint,
  getTestExecutionControlCheckpoint,
  markExecutionJobDispatched,
  saveExecutionCheckpoint,
  updateTestExecutionProgress,
  upsertAgentMemories,
  upsertTestExecution,
} from "./db";
import {
  extractAgentMemoryLearnings,
  formatAgentMemoryContext,
  getAgentMemoryScope,
} from "./agentMemoryService";
import {
  QaExecutionCancelledError,
  runApprovedAutomationRecipe,
  runQaPilotAgent,
  type QaPilotEnvironment,
  type QaPilotResult,
} from "./qaPilotAgent";
import {
  APPROVED_RECIPE_TITLE_PREFIX,
  approvedRecipeMemoryFingerprint,
  approvedRecipeLearning,
  createApprovedAutomationRecipe,
  findApprovedAutomationRecipe,
  legacyScenarioFingerprint,
  migrateLegacyApprovedRecipe,
  parseApprovedAutomationRecipe,
  scenarioFingerprint,
} from "./approvedAutomationService";
import { normalizeTestExecutionPayload } from "./testExecutionService";
import { generateReliabilityReportArtifact } from "./reliabilityReportRoutes";
import { generateEvidenceDocxArtifact } from "./evidenceDocxRoutes";
import type { QueuedExecutionDispatchPayload } from "./executionQueueTypes";
import { buildAutomaticTestData } from "./automaticTestDataService";
import { logError, logWarn } from "./_core/logger";
import { safeErrorMessage, sanitizeSensitiveData } from "./_core/sensitiveData";
import { decryptCredential, encryptCredential } from "./credentialCrypto";
import { ENV } from "./_core/env";
import { compileGherkinScenarios, compileSingleGherkinScenario, resolveScenarioPlan } from "./automation-v2";
import { getPersistedScenarioGherkin } from "./repositories/testExecutionRepository";
import { generateRemoteExecutionArtifacts } from "./workerArtifactClient";
import { preflightEnvironmentAccess, type EnvironmentProbeResult } from "./environmentPreflightService";
import {
  hasExecutionArtifact,
  normalizedArtifactKey,
} from "./executionArtifactService";

export type DirectScenario = {
  index: number;
  id: string;
  title: string;
  gherkin: string;
  produces: string[];
  consumes: string[];
};

type DirectEnvironment = QaPilotEnvironment & { type?: string };

type DirectExecutionResult = ReturnType<typeof executionResult>;

type ExecutionCheckpoint = {
  version: 2;
  externalExecutionId: string;
  startedAt: string;
  results: DirectExecutionResult[];
  testData: Record<string, string>;
};

type ParsedExecutionCheckpoint = {
  version?: number;
  externalExecutionId?: string;
  startedAt?: string;
  results?: DirectExecutionResult[];
  testData?: Record<string, unknown>;
  testDataEncrypted?: string;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "cenario";
}

export function splitGherkinScenarios(value: unknown): DirectScenario[] {
  const source = text(value).replace(/\r\n/g, "\n");
  if (!source) throw new Error("Nenhum cenário Gherkin foi informado para a execução direta.");
  let compiled;
  try {
    compiled = compileGherkinScenarios(source);
  } catch (error) {
    throw new Error(`O plano não contém Cenário Gherkin válido: ${error instanceof Error ? error.message : String(error)}`);
  }
  const declaredIds = Array.from(source.matchAll(/^\s*#\s*ID:\s*([^|\r\n]+)/gim), match => match[1].trim());
  const scenarioHeading = /^\s*Cen[aá]rio(?: de Exemplo| Outline)?:/im;
  const scenarioBlocks = source
    .split(/(?=^\s*Cen[aá]rio(?: de Exemplo| Outline)?:)/gim)
    .filter(block => scenarioHeading.test(block));
  const declaredArtifacts = scenarioBlocks.map(block => {
    const parse = (label: "Produz" | "Consome") => {
      const raw = block.match(new RegExp(`^\\s*#\\s*${label}:\\s*(.+)$`, "im"))?.[1] ?? "";
      return Array.from(new Set(raw.split(",").map(item => item.trim()).filter(Boolean).map(normalizedArtifactKey))).slice(0, 10);
    };
    return { produces: parse("Produz"), consumes: parse("Consome") };
  });
  const scenarios = compiled.map((scenario, offset) => {
    const title = scenario.title || `Cenário ${offset + 1}`;
    const gherkin = [`Cenário: ${title}`, ...scenario.steps.map(step => `  ${step.sourceLine}`)].join("\n");
    const declaredId = declaredIds[offset];
    return {
      index: offset + 1,
      id: declaredId || `CT-${String(offset + 1).padStart(3, "0")}-${slug(title)}`,
      title,
      gherkin,
      produces: declaredArtifacts[offset]?.produces ?? [],
      consumes: declaredArtifacts[offset]?.consumes ?? [],
    };
  });
  const duplicateId = scenarios.find((scenario, index) =>
    scenarios.findIndex(candidate => candidate.id === scenario.id) !== index,
  )?.id;
  if (duplicateId) throw new Error(`O plano contém ID de cenário duplicado: ${duplicateId}.`);
  return scenarios;
}

export function pendingDirectScenarios(
  scenarios: DirectScenario[],
  results: Array<Pick<DirectExecutionResult, "scenario_id">>,
): DirectScenario[] {
  const completed = new Set(results.map(result => result.scenario_id));
  return scenarios.filter(scenario => !completed.has(scenario.id));
}

function environmentsFromBody(body: Record<string, unknown>): DirectEnvironment[] {
  const raw = Array.isArray(body.ambientes) ? body.ambientes : [];
  const environments = raw.map(item => {
    const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      name: text(value.nome ?? value.name) || "Ambiente",
      type: text(value.tipo ?? value.type),
      url: text(value.url ?? value.loginUrl),
      username: text(value.usuario ?? value.username) || undefined,
      password: text(value.senha ?? value.password) || undefined,
    };
  }).filter(item => Boolean(item.url));
  if (environments.length) return environments;
  const url = text(body.sistema_url);
  if (!url) return [];
  return [{
    name: text(body.ambiente) || "Ambiente principal",
    type: text(body.ambiente_tipo),
    url,
    username: text(body.login_usuario) || undefined,
    password: text(body.login_senha) || undefined,
  }];
}

function testDataFromBody(body: Record<string, unknown>): Record<string, string> {
  const raw = body.dados_teste;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>)
    .map(([key, value]) => [key.trim().slice(0, 80), String(value ?? "").trim().slice(0, 2_000)])
    .filter(([key, value]) => Boolean(key && value))
    .slice(0, 50));
}

function provisioningFromBody(body: Record<string, unknown>) {
  const raw = body.qa_provisioning;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const endpointUrl = text(value.endpointUrl);
  if (!endpointUrl) return undefined;
  try {
    const parsed = new URL(endpointUrl);
    if (!/^https?:$/.test(parsed.protocol)) return undefined;
  } catch {
    return undefined;
  }
  return {
    endpointUrl,
    token: text(value.token) || undefined,
    projectId: Number(value.projectId) || undefined,
  };
}

export function deriveInterfaceMap(
  result: Pick<QaPilotResult, "trace">,
  environment: DirectEnvironment,
) {
  const screens = new Map<string, Record<string, unknown>>();
  for (const event of result.trace) {
    if (!event.ok || !event.result || typeof event.result !== "object" || Array.isArray(event.result)) continue;
    const observation = event.result as Record<string, unknown>;
    const url = text(observation.url);
    if (!url) continue;
    let route = url;
    try {
      const parsed = new URL(url);
      route = `${parsed.pathname}${parsed.search}`;
    } catch {
      // Mantem a URL observada quando o navegador retornar um valor nao padrao.
    }
    const elements = (Array.isArray(observation.elements) ? observation.elements : [])
      .map(item => item && typeof item === "object" ? item as Record<string, unknown> : {})
      .map(item => {
        const label = text(item.name);
        const semanticType = text(item.role) || text(item.tag);
        return [semanticType, label].filter(Boolean).join(": ");
      })
      .filter(Boolean)
      .slice(0, 20);
    const title = text(observation.title) || route || "Tela observada";
    screens.set(`${url}|${title}`, {
      tela: title,
      ambiente: environment.name,
      sistema_url: environment.url,
      rota: route,
      elementos: elements,
      confianca: 90,
    });
  }
  return Array.from(screens.values()).slice(0, 12);
}

function executionResult(
  scenario: DirectScenario,
  result: QaPilotResult,
  durationMs: number,
  environment: DirectEnvironment,
) {
  const final = result.final;
  const realFailures = final.status === "FALHOU"
    ? [{ descricao: final.observedResult, resultado_esperado: scenario.gherkin }]
    : [];
  const automationFailures = final.status === "ERRO_AUTOMACAO"
    ? [{ descricao: final.summary, trace: result.traceFile }]
    : [];
  const evidences = final.evidence.map(filepath => ({
    tipo: /\.(?:png|jpe?g|webp)$/i.test(filepath) ? "screenshot" : "arquivo_baixado",
    caminho: filepath,
    momento: /\.(?:png|jpe?g|webp)$/i.test(filepath) ? "resultado final" : "download validado",
  }));
  return {
    scenario_index: scenario.index,
    scenario_id: scenario.id,
    scenario_title: scenario.title,
    cenario: scenario.gherkin,
    status: final.status,
    duration_ms: durationMs,
    resultado_teste: {
      status: final.status,
      resumo: final.summary,
      resultado_observado: final.observedResult,
      precondicoes_ausentes: final.missingPreconditions,
      passos: final.steps.map(step => ({
        id: step.id,
        descricao: step.sourceLine,
        status: step.status,
        detalhe: step.observed,
      })),
      evidencias: evidences,
      falhas_reais: realFailures,
      falhas_automacao: automationFailures,
      tentativas: [{
        numero: 1,
        status: final.status,
        resumo: final.summary,
        duration_ms: durationMs,
        evidencias: evidences,
      }],
      verificacao_independente: result.verifier,
      consumo_ia: result.usage,
      resolucoes_bloqueio: result.trace
        .filter(event => event.tool === "resolve_blocker")
        .map(event => ({
          categoria: String(event.arguments.category ?? ""),
          objetivo: String(event.arguments.objective ?? "").slice(0, 500),
          sucesso_tecnico: event.ok,
          resultado: event.result,
        })),
      modo_execucao: result.executionMode ?? "AGENT",
      motor_automacao: result.executionPlan ? {
        versao: result.executionPlan.version,
        modo: result.executionPlan.mode,
        resolucoes: result.executionPlan.resolutions.map(item => ({
          passo: item.stepId,
          estado: item.state,
          habilidades: item.skillIds,
          motivo: item.reason,
        })),
      } : { versao: 1, modo: "LEGACY" },
      mapa_interface: deriveInterfaceMap(result, environment),
      aprendizados: final.status === "PASSOU" ? [{
        categoria: "AUTOMACAO",
        titulo: `Fluxo validado: ${scenario.title}`,
        conteudo: `Cenario executado com sucesso. Passos: ${final.steps.map(step => step.sourceLine).join(" | ")}`,
        confianca: 90,
      }] : [],
    },
  };
}

export function automationErrorExecutionResult(
  scenario: DirectScenario,
  error: unknown,
  durationMs: number,
): DirectExecutionResult {
  const summary = `Erro técnico isolado no cenário: ${safeErrorMessage(error)}`.slice(0, 2_000);
  const steps = scenario.gherkin.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^(?:Dado|Quando|Então|Entao|E|Mas)\b/i.test(line))
    .map((line, index) => ({
      id: `S${index + 1}`,
      descricao: line,
      status: "NAO_EXECUTADO" as const,
      detalhe: "Não executado porque o cenário encontrou um erro técnico isolado.",
    }));
  return {
    scenario_index: scenario.index,
    scenario_id: scenario.id,
    scenario_title: scenario.title,
    cenario: scenario.gherkin,
    status: "ERRO_AUTOMACAO",
    duration_ms: durationMs,
    resultado_teste: {
      status: "ERRO_AUTOMACAO",
      resumo: summary,
      resultado_observado: "O cenário foi encerrado com erro técnico; os cenários seguintes continuarão.",
      precondicoes_ausentes: [],
      passos: steps,
      evidencias: [],
      falhas_reais: [],
      falhas_automacao: [{ descricao: summary, trace: "" }],
      tentativas: [{
        numero: 1,
        status: "ERRO_AUTOMACAO",
        resumo: summary,
        duration_ms: durationMs,
        evidencias: [],
      }],
      verificacao_independente: undefined,
      consumo_ia: { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      resolucoes_bloqueio: [],
      modo_execucao: "AGENT",
      motor_automacao: { versao: 1, modo: "LEGACY" },
      mapa_interface: [],
      aprendizados: [],
    },
  };
}

export function blockedEnvironmentExecutionResult(
  scenario: DirectScenario,
  preflight: EnvironmentProbeResult,
): DirectExecutionResult {
  const compiled = compileSingleGherkinScenario(scenario.gherkin);
  const steps = compiled.steps.map((step, index) => ({
    id: step.id,
    descricao: step.sourceLine,
    status: index === 0 ? "BLOQUEADO" as const : "NAO_EXECUTADO" as const,
    detalhe: index === 0
      ? `${preflight.detail} URL: ${preflight.url}; HTTP: ${preflight.status ?? "sem resposta"}; título: ${preflight.title || "sem título"}.`
      : "Não executado porque o ambiente permaneceu bloqueado antes do primeiro passo.",
  }));
  const summary = "Cenário não iniciado porque o preflight confirmou bloqueio externo do ambiente no navegador do worker.";
  return {
    scenario_index: scenario.index,
    scenario_id: scenario.id,
    scenario_title: scenario.title,
    cenario: scenario.gherkin,
    status: "BLOQUEADO",
    duration_ms: 0,
    resultado_teste: {
      status: "BLOQUEADO",
      resumo: summary,
      resultado_observado: preflight.detail,
      precondicoes_ausentes: ["Liberação externa de acesso ao ambiente para o navegador do worker."],
      passos: steps,
      evidencias: [],
      falhas_reais: [],
      falhas_automacao: [],
      tentativas: [{ numero: 1, status: "BLOQUEADO", resumo: summary, duration_ms: 0, evidencias: [] }],
      verificacao_independente: undefined,
      consumo_ia: { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      resolucoes_bloqueio: [{ categoria: "EXTERNAL", objetivo: "Acessar o ambiente pelo navegador do worker.", sucesso_tecnico: true, resultado: preflight }],
      modo_execucao: "AGENT",
      motor_automacao: { versao: 1, modo: "PREFLIGHT" },
      mapa_interface: [],
      aprendizados: [],
    },
  };
}

export function blockedDependencyExecutionResult(
  scenario: DirectScenario,
  missingArtifacts: string[],
): DirectExecutionResult {
  const compiled = compileSingleGherkinScenario(scenario.gherkin);
  const labels = missingArtifacts.map(normalizedArtifactKey);
  const detail = `Artefatos necessários ainda não foram produzidos: ${labels.join(", ")}.`;
  const steps = compiled.steps.map((step, index) => ({
    id: step.id,
    descricao: step.sourceLine,
    status: index === 0 ? "BLOQUEADO" as const : "NAO_EXECUTADO" as const,
    detalhe: index === 0
      ? detail
      : "Não executado porque uma dependência declarada do cenário está ausente.",
  }));
  return {
    scenario_index: scenario.index,
    scenario_id: scenario.id,
    scenario_title: scenario.title,
    cenario: scenario.gherkin,
    status: "BLOQUEADO",
    duration_ms: 0,
    resultado_teste: {
      status: "BLOQUEADO",
      resumo: "Cenário não iniciado porque depende de artefatos que um cenário anterior não produziu.",
      resultado_observado: detail,
      precondicoes_ausentes: labels,
      passos: steps,
      evidencias: [],
      falhas_reais: [],
      falhas_automacao: [],
      tentativas: [{ numero: 1, status: "BLOQUEADO", resumo: detail, duration_ms: 0, evidencias: [] }],
      verificacao_independente: undefined,
      consumo_ia: { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      resolucoes_bloqueio: [],
      modo_execucao: "AGENT",
      motor_automacao: { versao: 1, modo: "DEPENDENCY_CHECK" },
      mapa_interface: [],
      aprendizados: [],
    },
  };
}

export async function loadExecutionCheckpoint(
  checkpointFile: string,
  externalExecutionId: string,
  scenarios: DirectScenario[],
  sharedCheckpointEncrypted?: string | null,
): Promise<{ startedAt?: Date; results: DirectExecutionResult[]; testData: Record<string, string> }> {
  try {
    let raw = sharedCheckpointEncrypted?.trim() ?? "";
    if (!raw) {
      const stat = await fs.stat(checkpointFile);
      if (stat.size > 25_000_000) throw new Error("Checkpoint excede o limite permitido.");
      raw = await fs.readFile(checkpointFile, "utf8");
    }
    const decoded = raw.startsWith("v1:") ? decryptCredential(raw) : raw;
    const parsed = JSON.parse(decoded) as ParsedExecutionCheckpoint;
    if (![1, 2].includes(Number(parsed.version)) || parsed.externalExecutionId !== externalExecutionId || !Array.isArray(parsed.results)) {
      throw new Error("Checkpoint incompatível com a execução atual.");
    }
    const scenarioOrder = new Map(scenarios.map((scenario, index) => [scenario.id, index]));
    const seen = new Set<string>();
    const results = parsed.results.filter(result => {
      const scenarioId = text(result?.scenario_id);
      if (!scenarioOrder.has(scenarioId) || seen.has(scenarioId)) return false;
      seen.add(scenarioId);
      return ["PASSOU", "FALHOU", "BLOQUEADO", "ERRO_AUTOMACAO"].includes(text(result?.status));
    }).sort((left, right) => scenarioOrder.get(left.scenario_id)! - scenarioOrder.get(right.scenario_id)!);
    let testData: Record<string, string> = {};
    const checkpointData = parsed.version === 1 && parsed.testDataEncrypted
      ? JSON.parse(decryptCredential(parsed.testDataEncrypted)) as Record<string, unknown>
      : parsed.testData ?? {};
    if (checkpointData && typeof checkpointData === "object" && !Array.isArray(checkpointData)) {
      testData = Object.fromEntries(Object.entries(checkpointData)
        .map(([key, value]) => [key.slice(0, 80), String(value ?? "").slice(0, 2_000)])
        .slice(0, 100));
    }
    const startedAt = parsed.startedAt && Number.isFinite(Date.parse(parsed.startedAt))
      ? new Date(parsed.startedAt)
      : undefined;
    return { startedAt, results, testData };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      logWarn("direct_qa_checkpoint_ignored", { externalExecutionId, error: safeErrorMessage(error) });
    }
    return { results: [], testData: {} };
  }
}

export async function writeExecutionCheckpoint(
  checkpointFile: string,
  checkpoint: Omit<ExecutionCheckpoint, "version" | "testData">,
  testData: Record<string, string>,
): Promise<string> {
  const temporaryFile = `${checkpointFile}.tmp`;
  const payload: ExecutionCheckpoint = {
    version: 2,
    ...checkpoint,
    results: sanitizeSensitiveData(checkpoint.results, { knownValues: testData }),
    testData,
  };
  const encrypted = encryptCredential(JSON.stringify(payload));
  await fs.writeFile(temporaryFile, encrypted, { encoding: "utf8", flag: "w" });
  await fs.rename(temporaryFile, checkpointFile);
  return encrypted;
}

async function persistExecutionCheckpoint(
  checkpointFile: string,
  checkpoint: Omit<ExecutionCheckpoint, "version" | "testData">,
  testData: Record<string, string>,
): Promise<void> {
  const encrypted = await writeExecutionCheckpoint(checkpointFile, checkpoint, testData);
  await saveExecutionCheckpoint(checkpoint.externalExecutionId, encrypted);
}

async function persistScenarioMemory(
  externalExecutionId: string,
  body: Record<string, unknown>,
  result: ReturnType<typeof executionResult>,
): Promise<void> {
  try {
    const learnings = extractAgentMemoryLearnings({
      ...body,
      execution_id: externalExecutionId,
      scenario_id: result.scenario_id,
      status: result.status,
      resultado_teste: result.resultado_teste,
    });
    await upsertAgentMemories(learnings);
  } catch (error) {
    logError("direct_qa_memory_save_failed", error);
  }
}

async function waitUntilRunnable(externalExecutionId: string): Promise<"RUN" | "CANCEL"> {
  while (true) {
    const checkpoint = await getTestExecutionControlCheckpoint(externalExecutionId);
    if (!checkpoint || checkpoint.action === "CANCEL") return "CANCEL";
    if (checkpoint.action === "RUN") return "RUN";
    await new Promise(resolve => setTimeout(resolve, Math.min(5_000, checkpoint.pollingMs || 1_000)));
  }
}

export async function runDirectQaExecution(
  externalExecutionId: string,
  payload: QueuedExecutionDispatchPayload,
): Promise<{ cancelled: boolean; results: number }> {
  const body = payload.webhookBody;
  const scenarios = splitGherkinScenarios(body.cenarios_gherkin);
  const environments = environmentsFromBody(body);
  const provisioning = provisioningFromBody(body);
  if (!environments.length) throw new Error("A execução não possui ambiente com URL parametrizada.");

  const memoryScope = getAgentMemoryScope(body);
  const memories = await getAgentMemories(memoryScope.scopeKey, 50);
  const memoryContext = formatAgentMemoryContext(
    memories.filter(memory => !memory.title.startsWith(APPROVED_RECIPE_TITLE_PREFIX)),
  );
  const runDirectory = path.resolve("artifacts", "agent-executions", externalExecutionId);
  await fs.mkdir(runDirectory, { recursive: true });
  const checkpointFile = path.join(runDirectory, "execution-checkpoint.json");
  const checkpoint = await loadExecutionCheckpoint(
    checkpointFile,
    externalExecutionId,
    scenarios,
    await getExecutionCheckpoint(externalExecutionId),
  );
  const testData = {
    ...buildAutomaticTestData(externalExecutionId),
    ...testDataFromBody(body),
    ...checkpoint.testData,
  };
  await markExecutionJobDispatched(externalExecutionId);

  const startedAt = checkpoint.startedAt ?? new Date();
  const results: DirectExecutionResult[] = [...checkpoint.results];
  const environmentPreflight = await preflightEnvironmentAccess(environments[0].url);
  for (const scenario of pendingDirectScenarios(scenarios, results)) {
    if (await waitUntilRunnable(externalExecutionId) === "CANCEL") {
      return { cancelled: true, results: results.length };
    }
    await updateTestExecutionProgress({
      externalExecutionId,
      event: "SCENARIO_STARTED",
      scenarioIndex: scenario.index,
      scenarioId: scenario.id,
      scenarioTitle: scenario.title,
      environment: environments[0].name,
      stage: "EXECUTANDO_CONTRATO",
      occurredAt: new Date(),
    });
    const scenarioStartedAt = Date.now();
    const missingConsumedArtifacts = scenario.consumes.filter(artifact =>
      !hasExecutionArtifact(testData, artifact),
    );
    if (missingConsumedArtifacts.length) {
      const blockedResult = blockedDependencyExecutionResult(scenario, missingConsumedArtifacts);
      results.push(blockedResult);
      await persistExecutionCheckpoint(checkpointFile, {
        externalExecutionId,
        startedAt: startedAt.toISOString(),
        results,
      }, testData);
      await updateTestExecutionProgress({
        externalExecutionId,
        event: "SCENARIO_COMPLETED",
        scenarioIndex: scenario.index,
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        environment: environments[0].name,
        stage: "DEPENDENCIA_AUSENTE",
        status: "BLOQUEADO",
        summary: blockedResult.resultado_teste.resumo,
        occurredAt: new Date(),
      });
      continue;
    }
    if (environmentPreflight.externallyBlocked) {
      const blockedResult = blockedEnvironmentExecutionResult(scenario, environmentPreflight);
      results.push(blockedResult);
      await persistExecutionCheckpoint(checkpointFile, {
        externalExecutionId,
        startedAt: startedAt.toISOString(),
        results,
      }, testData);
      await updateTestExecutionProgress({
        externalExecutionId,
        event: "SCENARIO_COMPLETED",
        scenarioIndex: scenario.index,
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        environment: environments[0].name,
        stage: "AMBIENTE_BLOQUEADO",
        status: "BLOQUEADO",
        summary: blockedResult.resultado_teste.resumo,
        occurredAt: new Date(),
      });
      continue;
    }
    const scenarioDeadline = scenarioStartedAt + Math.min(
      3_600_000,
      Math.max(60_000, ENV.qaScenarioTimeoutMs || 900_000),
    );
    try {
      const compiledScenario = compileSingleGherkinScenario(scenario.gherkin);
      const executionPlan = resolveScenarioPlan({ scenario: compiledScenario, testData });
      const pilotInput = {
        runId: externalExecutionId,
        scenarioId: scenario.id,
        title: scenario.title,
        gherkin: scenario.gherkin,
        environments,
        sourceContext: text(body.contexto_codigo_fonte).slice(0, 14_000),
        memoryContext,
        executionPlan,
        testData,
        provisioning,
        artifactContract: { produces: scenario.produces, consumes: scenario.consumes },
        outputDirectory: path.join(runDirectory, slug(scenario.id)),
        headless: true,
        maxIterations: 18,
        control: async () => {
          if (Date.now() >= scenarioDeadline) return "CANCEL";
          const checkpoint = await getTestExecutionControlCheckpoint(externalExecutionId);
          return checkpoint?.action ?? "CANCEL";
        },
      };
      const recipeScenarioFingerprint = scenarioFingerprint(scenario.gherkin);
      const legacyRecipeScenarioFingerprint = legacyScenarioFingerprint(scenario.gherkin);
      const recipeMemoryFingerprints = Array.from(new Set([
        recipeScenarioFingerprint,
        legacyRecipeScenarioFingerprint,
      ])).map(fingerprint => approvedRecipeMemoryFingerprint(memoryScope.scopeKey, fingerprint));
      const recipeMemories = (await Promise.all(recipeMemoryFingerprints.map(fingerprint =>
        getAgentMemoryByFingerprint(memoryScope.scopeKey, fingerprint),
      ))).filter(Boolean) as Array<{ title: string; content: string; status?: string }>;
      let approvedRecipe = !scenario.produces.length && recipeMemories.length
        ? findApprovedAutomationRecipe(recipeMemories, scenario.gherkin)
        : undefined;
      if (!approvedRecipe && !scenario.produces.length) {
        for (const memory of memories) {
          const legacyRecipe = parseApprovedAutomationRecipe(memory);
          if (!legacyRecipe || legacyRecipe.scenarioId !== scenario.id) continue;
          const sourceGherkin = await getPersistedScenarioGherkin(
            legacyRecipe.sourceExecutionId,
            legacyRecipe.scenarioId,
          );
          if (!sourceGherkin) continue;
          approvedRecipe = migrateLegacyApprovedRecipe(legacyRecipe, scenario.gherkin, sourceGherkin);
          if (!approvedRecipe) continue;
          try {
            await upsertAgentMemories([approvedRecipeLearning({
              ...memoryScope,
              externalExecutionId: legacyRecipe.sourceExecutionId,
              externalScenarioId: legacyRecipe.scenarioId,
            }, approvedRecipe)]);
          } catch (error) {
            logError("direct_qa_legacy_recipe_migration_failed", error);
          }
          break;
        }
      }
      let result: QaPilotResult;
      if (!approvedRecipe) {
        result = await runQaPilotAgent(pilotInput);
      } else {
        const replay = await runApprovedAutomationRecipe(pilotInput, approvedRecipe);
        if (replay.kind === "PASSED") {
          result = replay.result;
        } else if (replay.kind === "FAILED" && replay.mayHaveSideEffects) {
          logWarn("direct_qa_recipe_replay_stopped_after_side_effect", {
            externalExecutionId,
            scenarioId: scenario.id,
            reason: replay.reason,
          });
          result = replay.result;
        } else {
          logWarn("direct_qa_recipe_fallback", {
            externalExecutionId,
            scenarioId: scenario.id,
            reason: replay.reason,
          });
          const replayTrace = replay.kind === "FAILED" ? replay.result.trace : [];
          const agentResult = await runQaPilotAgent(pilotInput);
          result = replayTrace.length ? {
            ...agentResult,
            trace: [...replayTrace, ...agentResult.trace],
            executionMode: "HYBRID_V2",
          } : agentResult;
          if (replayTrace.length) {
            await fs.writeFile(result.traceFile, JSON.stringify(result, null, 2), "utf8");
          }
        }
      }
      const normalizedResult = executionResult(scenario, result, Date.now() - scenarioStartedAt, environments[0]);
      results.push(normalizedResult);
      await persistExecutionCheckpoint(checkpointFile, {
        externalExecutionId,
        startedAt: startedAt.toISOString(),
        results,
      }, testData);
      await persistScenarioMemory(externalExecutionId, body, normalizedResult);
      const learnedRecipe = createApprovedAutomationRecipe({
        result,
        gherkin: scenario.gherkin,
        title: scenario.title,
        executionId: externalExecutionId,
      });
      if (learnedRecipe) {
        try {
          await upsertAgentMemories([approvedRecipeLearning({
            ...memoryScope,
            externalExecutionId,
            externalScenarioId: scenario.id,
          }, learnedRecipe)]);
        } catch (error) {
          logError("direct_qa_recipe_save_failed", error);
        }
      }
      await updateTestExecutionProgress({
        externalExecutionId,
        event: "SCENARIO_COMPLETED",
        scenarioIndex: scenario.index,
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        environment: environments[0].name,
        stage: "CENARIO_CONCLUIDO",
        status: result.final.status,
        summary: result.final.summary,
        occurredAt: new Date(),
      });
    } catch (error) {
      if (error instanceof QaExecutionCancelledError) {
        if (Date.now() < scenarioDeadline) {
          await getTestExecutionControlCheckpoint(externalExecutionId);
          return { cancelled: true, results: results.length };
        }
      }
      if (results.some(result => result.scenario_id === scenario.id)) {
        // O cenário e seu checkpoint já foram concluídos. Uma falha posterior
        // (por exemplo, ao atualizar o progresso) deve acionar a retomada sem
        // duplicar o resultado nem repetir a ação no sistema alvo.
        throw error;
      }
      const scenarioError = error instanceof QaExecutionCancelledError
        ? new Error(`O cenário excedeu o limite de ${Math.round((scenarioDeadline - scenarioStartedAt) / 60_000)} minutos.`)
        : error;
      logError("direct_qa_scenario_failed_continuing_plan", scenarioError, {
        externalExecutionId,
        scenarioId: scenario.id,
      });
      const normalizedResult = automationErrorExecutionResult(
        scenario,
        scenarioError,
        Date.now() - scenarioStartedAt,
      );
      results.push(normalizedResult);
      await persistExecutionCheckpoint(checkpointFile, {
        externalExecutionId,
        startedAt: startedAt.toISOString(),
        results,
      }, testData);
      await updateTestExecutionProgress({
        externalExecutionId,
        event: "SCENARIO_COMPLETED",
        scenarioIndex: scenario.index,
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        environment: environments[0].name,
        stage: "CENARIO_COM_ERRO_TECNICO",
        status: "ERRO_AUTOMACAO",
        summary: normalizedResult.resultado_teste.resumo,
        occurredAt: new Date(),
      });
    }
  }

  const basePayload: Record<string, unknown> = {
    execution_id: externalExecutionId,
    solicitado_por: body.solicitado_por,
    client_id: body.client_id,
    project_id: body.project_id,
    sprint_id: body.sprint_id,
    cliente: body.cliente,
    projeto: body.projeto,
    sprint: body.sprint,
    sistema_url: body.sistema_url,
    inicio_processamento: startedAt.toISOString(),
    fim_processamento: new Date().toISOString(),
    resultados: results,
  };
  let persistedPayload = basePayload;
  if (ENV.orchestratorApiUrl.trim()) {
    try {
      persistedPayload = await generateRemoteExecutionArtifacts(basePayload);
    } catch (error) {
      logError("direct_qa_remote_artifacts_failed_using_local_fallback", error);
    }
  }
  if (!persistedPayload.reliability_report) {
    try {
      persistedPayload = await generateReliabilityReportArtifact(basePayload);
    } catch (error) {
      logError("direct_qa_reliability_report_failed", error);
    }
  }
  if (!persistedPayload.evidence_docx) {
    try {
      persistedPayload = await generateEvidenceDocxArtifact(persistedPayload as Record<string, any>);
    } catch (error) {
      logError("direct_qa_docx_failed", error);
    }
  }
  await upsertTestExecution(normalizeTestExecutionPayload(persistedPayload));
  return { cancelled: false, results: results.length };
}
