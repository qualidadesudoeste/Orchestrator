import { promises as fs } from "node:fs";
import path from "node:path";
import {
  invokeLLM,
  type InvokeParams,
  type InvokeResult,
  type Message,
  type Tool,
} from "./_core/llm";
import type { ApprovedAutomationRecipe } from "./approvedAutomationService";
import {
  classifyBlocker,
  compileSingleGherkinScenario,
  type ExecutableScenarioPlan,
  type QaProvisioningConfig,
} from "./automation-v2";
import {
  automationErrorRecoveryCategory,
  boundedResult,
} from "./qaPilotShared";
import {
  safeErrorMessage,
  sanitizeSensitiveData,
} from "./_core/sensitiveData";
export {
  automationErrorRecoveryCategory,
  boundedResult,
  classifyAutomationError,
} from "./qaPilotShared";

export type QaPilotStatus = "PASSOU" | "FALHOU" | "BLOQUEADO" | "ERRO_AUTOMACAO";

export type QaPilotEnvironment = {
  name: string;
  url: string;
  username?: string;
  password?: string;
};

export type QaPilotInput = {
  runId: string;
  scenarioId: string;
  title: string;
  gherkin: string;
  environments: QaPilotEnvironment[];
  sourceContext?: string;
  memoryContext?: string;
  executionPlan?: ExecutableScenarioPlan;
  testData?: Record<string, string>;
  provisioning?: QaProvisioningConfig;
  outputDirectory: string;
  headless?: boolean;
  maxIterations?: number;
  model?: string;
  control?: () => Promise<"RUN" | "PAUSE" | "CANCEL">;
};

export class QaExecutionCancelledError extends Error {
  constructor() {
    super("Execução encerrada pelo usuário.");
    this.name = "QaExecutionCancelledError";
  }
}

function safePilotResult(input: QaPilotInput, result: QaPilotResult): QaPilotResult {
  const environmentValues = Object.fromEntries(
    input.environments.flatMap((environment, index) => [
      [`environment_${index + 1}_username`, environment.username],
      [`environment_${index + 1}_password`, environment.password],
    ]),
  );
  return sanitizeSensitiveData(result, {
    knownValues: { ...input.testData, ...environmentValues },
  });
}

export type QaPilotPlan = {
  objective: string;
  steps: string[];
  successCriteria: string[];
  requiredData: string[];
  risks: string[];
};

export type QaScenarioStepKeyword = "DADO" | "QUANDO" | "ENTAO";
export type QaScenarioStepStatus = QaPilotStatus | "NAO_EXECUTADO";

export type QaScenarioStep = {
  id: string;
  keyword: QaScenarioStepKeyword;
  text: string;
  sourceLine: string;
};

export type QaScenarioStepResult = QaScenarioStep & {
  status: QaScenarioStepStatus;
  observed: string;
  traceFrom: number;
  traceTo: number;
};

export type QaPilotFinal = {
  status: QaPilotStatus;
  summary: string;
  evidence: string[];
  missingPreconditions: string[];
  observedResult: string;
  steps: QaScenarioStepResult[];
};

export type QaPilotTraceEvent = {
  iteration: number;
  tool: string;
  arguments: Record<string, unknown>;
  startedAt: string;
  durationMs: number;
  ok: boolean;
  result: unknown;
};

export type QaPilotResult = {
  runId: string;
  scenarioId: string;
  plan: QaPilotPlan;
  scenarioContract: QaScenarioStep[];
  final: QaPilotFinal;
  verifier?: {
    accepted: boolean;
    reason: string;
    correctedStatus?: QaPilotStatus;
  };
  iterations: number;
  usage: {
    calls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  traceFile: string;
  trace: QaPilotTraceEvent[];
  executionMode?: "AGENT" | "APPROVED_RECIPE" | "HYBRID_V2";
  executionPlan?: ExecutableScenarioPlan;
};

export type ToolExecution = { output: unknown; final?: QaPilotFinal };

export interface QaPilotToolRuntime {
  execute(name: string, args: Record<string, unknown>, iteration: number): Promise<ToolExecution>;
  close(): Promise<void>;
  getTrace(): QaPilotTraceEvent[];
}

type LlmInvoker = (params: InvokeParams) => Promise<InvokeResult>;

export const SYNTHETIC_NO_MATCH_GUIDANCE =
  "Quando uma busca ou filtro exigir zero resultados e o Gherkin nao fornecer um valor, use QA_SEM_RESULTADO_AUTOMACAO como termo sintetico seguro. Isso nao e massa de negocio nem pre-condicao ausente. Nunca aplique essa regra a CPF, CNPJ, pagamento, permissao ou outro dado de negocio.";

function contentText(content: InvokeResult["choices"][number]["message"]["content"] | null | undefined): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  return content.map(item => item.type === "text" ? item.text : "").join("\n");
}

async function waitForExecutionControl(input: QaPilotInput): Promise<void> {
  if (!input.control) return;
  while (true) {
    const action = await input.control();
    if (action === "RUN") return;
    if (action === "CANCEL") throw new QaExecutionCancelledError();
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
}

function jsonFromText<T>(value: string): T {
  const clean = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("A IA não retornou JSON válido.");
  return JSON.parse(clean.slice(start, end + 1)) as T;
}

export function compactPilotToolHistory(messages: Message[], keepLatest = 2): void {
  const toolIndexes = messages
    .map((message, index) => message.role === "tool" ? index : -1)
    .filter(index => index >= 0);
  for (const index of toolIndexes.slice(0, Math.max(0, toolIndexes.length - keepLatest))) {
    const message = messages[index];
    const content = typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content ?? "");
    if (content.length <= 700) continue;
    message.content = JSON.stringify({ compacted: true, preview: content.slice(0, 600) });
  }
}

function safeFilename(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "cenario";
}

export function parseGherkinScenarioSteps(gherkin: string): QaScenarioStep[] {
  const steps: QaScenarioStep[] = compileSingleGherkinScenario(gherkin).steps.map(step => ({
    id: step.id,
    keyword: step.keyword,
    text: step.text,
    sourceLine: step.sourceLine,
  }));
  if (!steps.length) throw new Error("O cenário não contém passos Dado/Quando/Então executáveis.");
  if (!steps.some(step => step.keyword === "QUANDO")) throw new Error("O cenário não possui um passo Quando executável.");
  if (!steps.some(step => step.keyword === "ENTAO")) throw new Error("O cenário não possui um passo Então verificável.");
  return steps;
}

function deriveScenarioStatus(steps: QaScenarioStepResult[]): QaPilotStatus {
  if (steps.some(step => step.status === "ERRO_AUTOMACAO")) return "ERRO_AUTOMACAO";
  if (steps.some(step => step.status === "BLOQUEADO")) return "BLOQUEADO";
  if (steps.some(step => step.status === "FALHOU")) return "FALHOU";
  if (steps.some(step => step.status === "NAO_EXECUTADO")) return "ERRO_AUTOMACAO";
  return "PASSOU";
}

function normalizedDecisionText(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function citesAvailableTestData(observed: unknown, testData?: Record<string, string>): boolean {
  const text = normalizedDecisionText(observed);
  return Object.keys(testData ?? {}).some(key => {
    const normalizedKey = normalizedDecisionText(key);
    return normalizedKey.length >= 3 && text.includes(normalizedKey);
  });
}

function evidenceFromTrace(trace: QaPilotTraceEvent[]): string[] {
  return trace.filter(event => event.ok && event.tool === "browser_screenshot")
    .map(event => String((event.result as { filepath?: unknown } | null)?.filepath ?? ""))
    .filter(Boolean);
}

export function classifyObservedAbsence(step: QaScenarioStep, observed: unknown): "BLOQUEADO" | "FALHOU" | undefined {
  const text = normalizedDecisionText(`${step.text} ${observed}`);
  const businessData = /(?:REGISTRO|MASSA|USUARIO|CONTA|PERFIL|PERMISSAO|AUTORIZACAO|MANIFESTACAO|CONTEUDO|ARQUIVO|LINK).*(?:INEXISTENTE|AUSENTE|NAO (?:(?:FOI|ESTA) )?(?:ENCONTRAD|DISPONIVEL|COMPROVAD|OBSERVAD|LOCALIZAD))/.test(text)
    || /(?:VENCID|EXPIRAD|RASCUNHO|INATIV|DESCARTAD|MAIS DE \d+|SUPERIOR A \d+|\>\s*\d+|OUTRO ANALISTA|SEGUNDO USUARIO|EXCLUSIVAMENTE.*VISUALIZACAO)/.test(text);
  if (step.keyword === "DADO" && businessData) return "BLOQUEADO";
  const missingFunctionality = /(?:ROTA|PAGINA|TELA|BOTAO|CAMPO|CONTROLE|FUNCIONALIDADE|COMPORTAMENTO).*(?:404|NAO (?:EXISTE|FOI ENCONTRAD|ESTA DISPONIVEL)|AUSENTE|INEXISTENTE)/.test(text)
    || /404 NOT FOUND/.test(text);
  if (missingFunctionality) return "FALHOU";
  return undefined;
}

import { PlaywrightPilotRuntime } from "./qaPilotRuntime";
export { PlaywrightPilotRuntime };

const tools: Tool[] = [
  { type: "function", function: { name: "browser_navigate", description: "Navega somente dentro dos ambientes autorizados e já retorna a observação.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false } } },
  { type: "function", function: { name: "browser_navigate_test_data", description: "Navega para uma URL parametrizada localmente sem revelar o valor ao modelo. Use para links de arquivos, rotinas e recursos preparados.", parameters: { type: "object", properties: { key: { type: "string" } }, required: ["key"], additionalProperties: false } } },
  { type: "function", function: { name: "browser_observe", description: "Lê URL, título, texto, elementos interativos, console e falhas de rede. Gere novas referências e use-as imediatamente.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "browser_inspect_page", description: "Inspeciona textos estruturados, tabelas e campos visíveis. Use antes de declarar que uma precondição ou registro não existe. Query vazia lê um panorama; query preenchida procura o termo semântico.", parameters: { type: "object", properties: { query: { type: "string" } }, additionalProperties: false } } },
  { type: "function", function: { name: "browser_login", description: "Executa login localmente com credenciais parametrizadas, sem revelar as credenciais ao modelo. Informe environmentName quando houver mais de uma conta/ambiente.", parameters: { type: "object", properties: { environmentName: { type: "string" } }, additionalProperties: false } } },
  { type: "function", function: { name: "browser_new_session", description: "Fecha a sessão atual, abre um contexto isolado e autentica com o ambiente/conta indicado. Use para cenários que exigem um segundo usuário.", parameters: { type: "object", properties: { environmentName: { type: "string" } }, required: ["environmentName"], additionalProperties: false } } },
  { type: "function", function: { name: "browser_new_session_test_data", description: "Abre sessão isolada usando uma conta sintética criada durante o teste e armazenada localmente. Os valores não são revelados ao modelo.", parameters: { type: "object", properties: { environmentName: { type: "string" }, usernameKey: { type: "string" }, passwordKey: { type: "string" } }, required: ["environmentName", "usernameKey", "passwordKey"], additionalProperties: false } } },
  { type: "function", function: { name: "browser_click", description: "Clica em uma referência da observação mais recente e retorna nova observação.", parameters: { type: "object", properties: { ref: { type: "string" } }, required: ["ref"], additionalProperties: false } } },
  { type: "function", function: { name: "browser_check", description: "Marca checkbox ou radio de forma idempotente e confirma que permaneceu marcado. Use sempre para aceite, consentimento, LGPD, termos e opções; nunca clique duas vezes nesses controles.", parameters: { type: "object", properties: { ref: { type: "string" } }, required: ["ref"], additionalProperties: false } } },
  { type: "function", function: { name: "browser_fill", description: "Preenche um campo não secreto usando uma referência recente.", parameters: { type: "object", properties: { ref: { type: "string" }, value: { type: "string" } }, required: ["ref", "value"], additionalProperties: false } } },
  { type: "function", function: { name: "browser_fill_test_data", description: "Preenche um campo com uma massa parametrizada localmente. Informe apenas a chave disponível; o valor não é enviado ao modelo nem gravado no trace.", parameters: { type: "object", properties: { ref: { type: "string" }, key: { type: "string" } }, required: ["ref", "key"], additionalProperties: false } } },
  { type: "function", function: { name: "browser_fill_visible_form", description: "Preenche deterministicamente os campos visíveis reconhecidos (nome, CPF, CNPJ, e-mail, telefone, CEP e datas) com dados sintéticos e marca aceites de forma idempotente. Use antes de preencher campo a campo.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "browser_submit_form", description: "Envia o formulário visível por um controle semântico seguro e retorna a observação resultante.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "resolve_blocker", description: "Diagnostica e tenta resolver autonomamente um impedimento antes de aceitar BLOQUEADO. Depois, reexecute e observe o passo original.", parameters: { type: "object", properties: { category: { type: "string", enum: ["UI_STATE", "AUTH_SESSION", "NAVIGATION", "SIMPLE_DATA", "BUSINESS_DATA", "PERMISSION", "NETWORK", "EXTERNAL"] }, objective: { type: "string" }, environmentName: { type: "string" } }, required: ["category", "objective"], additionalProperties: false } } },
  { type: "function", function: { name: "provision_test_state", description: "Aciona a ponte segura configurada no projeto para preparar massa/estado ou executar uma rotina de teste. Use PREPARE_STATE para Dados complexos e RUN_ROUTINE quando o Gherkin mandar executar scheduler, job ou rotina.", parameters: { type: "object", properties: { action: { type: "string", enum: ["PREPARE_STATE", "RUN_ROUTINE"] }, objective: { type: "string" }, category: { type: "string" }, environmentName: { type: "string" } }, required: ["action", "objective"], additionalProperties: false } } },
  { type: "function", function: { name: "browser_capture_field_test_data", description: "Captura localmente o valor de um campo/elemento e o guarda sob uma chave para passos ou cenários seguintes, sem revelar o valor ao modelo.", parameters: { type: "object", properties: { ref: { type: "string" }, key: { type: "string" } }, required: ["ref", "key"], additionalProperties: false } } },
  { type: "function", function: { name: "browser_capture_link_test_data", description: "Captura localmente um link visível e o guarda sob uma chave para uso posterior, sem revelar a URL ao modelo.", parameters: { type: "object", properties: { label: { type: "string" }, key: { type: "string" } }, required: ["label", "key"], additionalProperties: false } } },
  { type: "function", function: { name: "browser_capture_text_test_data", description: "Captura localmente um protocolo, identificador, contato ou outro texto visível e o guarda sob uma chave para cenários seguintes, sem revelar o valor ao modelo.", parameters: { type: "object", properties: { query: { type: "string" }, key: { type: "string" } }, required: ["query", "key"], additionalProperties: false } } },
  { type: "function", function: { name: "browser_search_no_match", description: "Executa uma busca negativa universal com termo sintético seguro. Opcionalmente aciona antes um filtro visível pelo rótulo informado. Não use para CPF, CNPJ, permissão, pagamento ou massa de negócio.", parameters: { type: "object", properties: { filterLabel: { type: "string" } }, additionalProperties: false } } },
  { type: "function", function: { name: "browser_click_and_download", description: "Clica em um controle semântico e captura o arquivo baixado, incluindo nome e tamanho. Use obrigatoriamente quando o cenário exigir download; net::ERR_ABORTED não é evidência de falha de download.", parameters: { type: "object", properties: { label: { type: "string" } }, required: ["label"], additionalProperties: false } } },
  { type: "function", function: { name: "browser_select", description: "Seleciona uma opção pelo value e retorna nova observação.", parameters: { type: "object", properties: { ref: { type: "string" }, value: { type: "string" } }, required: ["ref", "value"], additionalProperties: false } } },
  { type: "function", function: { name: "browser_press", description: "Pressiona uma tecla e retorna nova observação.", parameters: { type: "object", properties: { key: { type: "string" } }, required: ["key"], additionalProperties: false } } },
  { type: "function", function: { name: "browser_back", description: "Volta uma página e retorna nova observação.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "browser_wait", description: "Aguarda no máximo cinco segundos e observa novamente.", parameters: { type: "object", properties: { milliseconds: { type: "number" } }, required: ["milliseconds"], additionalProperties: false } } },
  { type: "function", function: { name: "browser_screenshot", description: "Salva uma evidência da página atual.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "complete_step", description: "Registra o resultado do próximo passo EXATO do contrato. Só pode ser chamado na ordem S1, S2... e após observar ou agir. Não reformule o passo.", parameters: { type: "object", properties: { stepId: { type: "string" }, status: { type: "string", enum: ["PASSOU", "FALHOU", "BLOQUEADO", "ERRO_AUTOMACAO", "NAO_EXECUTADO"] }, observed: { type: "string" } }, required: ["stepId", "status", "observed"], additionalProperties: false } } },
  { type: "function", function: { name: "finish", description: "Solicita a conclusão. O executor rejeita se algum Dado/Quando/Então não estiver registrado ou se não houver screenshot. O status é calculado pelo contrato, não pela IA.", parameters: { type: "object", properties: { summary: { type: "string" }, observedResult: { type: "string" }, missingPreconditions: { type: "array", items: { type: "string" } } }, required: ["summary", "observedResult", "missingPreconditions"], additionalProperties: false } } },
];

async function createPlan(input: QaPilotInput, llm: LlmInvoker): Promise<QaPilotPlan> {
  const response = await llm({
    model: input.model,
    messages: [
      { role: "system", content: `Planeje um teste web observável. O Gherkin é o único contrato obrigatório: não acrescente campos, dados, validações de payload/rede ou precondições que ele não exige. requiredData deve conter somente dados indispensáveis explicitamente pedidos pelo Gherkin. Não invente massa, telas ou dados de negócio. ${SYNTHETIC_NO_MATCH_GUIDANCE} Retorne somente JSON.` },
      { role: "user", content: [
        `Cenário: ${input.title}`,
        input.gherkin,
        Object.keys(input.testData ?? {}).length ? `Chaves de dados sintéticos locais disponíveis: ${Object.keys(input.testData ?? {}).join(", ")}` : "",
        input.sourceContext ? `Contexto técnico:\n${input.sourceContext.slice(0, 5_000)}` : "",
        input.memoryContext ? `Conhecimento já observado:\n${input.memoryContext.slice(0, 5_000)}` : "",
      ].filter(Boolean).join("\n\n") },
    ],
    maxTokens: 1_500,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "qa_pilot_plan",
        strict: true,
        schema: {
          type: "object",
          properties: {
            objective: { type: "string" },
            steps: { type: "array", items: { type: "string" } },
            successCriteria: { type: "array", items: { type: "string" } },
            requiredData: { type: "array", items: { type: "string" } },
            risks: { type: "array", items: { type: "string" } },
          },
          required: ["objective", "steps", "successCriteria", "requiredData", "risks"],
          additionalProperties: false,
        },
      },
    },
  });
  return jsonFromText<QaPilotPlan>(contentText(response.choices[0]?.message.content ?? ""));
}

async function verifyFinal(
  input: QaPilotInput,
  plan: QaPilotPlan,
  final: QaPilotFinal,
  trace: QaPilotTraceEvent[],
  llm: LlmInvoker,
) {
  const evidence = trace.map(item => ({ tool: item.tool, ok: item.ok, result: item.result })).slice(-20);
  const response = await llm({
    model: input.model,
    messages: [
      { role: "system", content: "Você é um verificador independente. O Gherkin é o único contrato; o plano não pode acrescentar requisitos. Aceite conclusões sustentadas pelas observações e ações registradas. Um clique registrado no botão exato é evidência da aplicação do filtro mesmo sem aria-pressed. Erros de console ou rede só invalidam o teste quando houver relação observável com o resultado esperado. Ausência observada de funcionalidade, rota, campo, botão ou comportamento exigido pelo Gherkin é FALHOU. Ausência de massa especial ou estado temporal (registros em quantidade, vencidos, expirados, rascunhos, perfis, permissões, outro usuário ou arquivo preparado) é BLOQUEADO enquanto o provisionador não puder criá-la. Falha técnica de ferramenta que impediu a execução é ERRO_AUTOMACAO. Retorne somente JSON." },
      { role: "user", content: JSON.stringify({ gherkin: input.gherkin, proposedFinal: final, evidence, planIsAdvisoryOnly: true }) },
    ],
    maxTokens: 800,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "qa_pilot_verifier",
        strict: true,
        schema: {
          type: "object",
          properties: {
            accepted: { type: "boolean" },
            reason: { type: "string" },
            correctedStatus: { type: "string", enum: ["PASSOU", "FALHOU", "BLOQUEADO", "ERRO_AUTOMACAO"] },
          },
          required: ["accepted", "reason", "correctedStatus"],
          additionalProperties: false,
        },
      },
    },
  });
  return jsonFromText<{ accepted: boolean; reason: string; correctedStatus?: QaPilotStatus }>(
    contentText(response.choices[0]?.message.content ?? ""),
  );
}

export async function executeV2Bootstrap(input: QaPilotInput, runtime: QaPilotToolRuntime): Promise<unknown[]> {
  if (!input.executionPlan) return [];
  const outputs: unknown[] = [];
  const skillIds = new Set(input.executionPlan.resolutions.flatMap(item => item.skillIds));
  if (skillIds.has("universal.login") && input.environments.some(item => item.username && item.password)) {
    const login = await runtime.execute("browser_login", {}, 0);
    outputs.push({ action: "LOGIN", result: boundedResult(login.output) });
  }
  const route = input.executionPlan.scenario.steps
    .filter(step => step.keyword !== "ENTAO")
    .map(step => step.text.match(/\/(?:[a-z0-9][a-z0-9/_-]*)(?:\?[a-z0-9=&_%.-]+)?/i)?.[0])
    .find(Boolean);
  if (route) {
    const base = input.environments[0]?.url;
    if (base) {
      const target = new URL(route, base).toString();
      const navigation = await runtime.execute("browser_navigate", { url: target }, 0);
      outputs.push({ action: "NAVIGATE", target, result: boundedResult(navigation.output) });
    }
  }
  const scenarioText = input.executionPlan.scenario.steps.map(step => step.text).join(" ");
  if (/preencher|dados v[aá]lidos|formul[aá]rio|cadastro/i.test(scenarioText)) {
    const form = await runtime.execute("browser_fill_visible_form", {}, 0);
    outputs.push({ action: "FILL_FORM", result: boundedResult(form.output) });
  }
  const actionText = input.executionPlan.scenario.steps
    .filter(step => step.keyword === "QUANDO").map(step => step.text).join(" ");
  if (/enviar|submeter|cadastrar|salvar/i.test(actionText)) {
    const submit = await runtime.execute("browser_submit_form", {}, 0);
    outputs.push({ action: "SUBMIT_FORM", result: boundedResult(submit.output) });
  }
  return outputs;
}

/**
 * Reproduz um fluxo previamente aprovado sem deixar o modelo decidir cada
 * clique. Uma chamada curta ao verificador ainda confirma o resultado atual;
 * qualquer divergência devolve undefined para que o executor use o agente.
 */
export async function runApprovedAutomationRecipe(
  input: QaPilotInput,
  recipe: ApprovedAutomationRecipe,
  options: { llm?: LlmInvoker; runtime?: QaPilotToolRuntime } = {},
): Promise<QaPilotResult | undefined> {
  if (!input.environments.length || !recipe.actions.length) return undefined;
  const scenarioContract = parseGherkinScenarioSteps(input.gherkin);
  await fs.mkdir(input.outputDirectory, { recursive: true });
  const runtime = options.runtime ?? new PlaywrightPilotRuntime(input);
  const llm = options.llm ?? invokeLLM;
  const usage = { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const trackedLlm: LlmInvoker = async params => {
    const response = await llm(params);
    usage.calls += 1;
    usage.promptTokens += response.usage?.prompt_tokens ?? 0;
    usage.completionTokens += response.usage?.completion_tokens ?? 0;
    usage.totalTokens += response.usage?.total_tokens ?? 0;
    return response;
  };
  const plan: QaPilotPlan = {
    objective: input.title,
    steps: recipe.actions.map(action => action.tool),
    successCriteria: scenarioContract.filter(step => step.keyword === "ENTAO").map(step => step.text),
    requiredData: [],
    risks: ["A interface pode ter mudado desde a aprovação desta receita."],
  };
  try {
    let iteration = 0;
    for (const action of recipe.actions) {
      await waitForExecutionControl(input);
      iteration += 1;
      await runtime.execute(action.tool, action.args, iteration);
      const last = runtime.getTrace().at(-1);
      if (!last?.ok) return undefined;
    }
    await runtime.execute("browser_screenshot", {}, ++iteration);
    if (!runtime.getTrace().at(-1)?.ok) return undefined;

    const traceBeforeFinish = runtime.getTrace();
    const lastObservation = [...traceBeforeFinish].reverse().find(event => {
      const result = event.result;
      return result && typeof result === "object" && !Array.isArray(result) && "text" in result;
    });
    const observedText = lastObservation && typeof lastObservation.result === "object"
      ? String((lastObservation.result as Record<string, unknown>).text ?? "") : "";
    const steps: QaScenarioStepResult[] = scenarioContract.map(step => ({
      ...step,
      status: "PASSOU",
      observed: `Passo reproduzido pela receita aprovada e submetido à verificação independente: ${step.text}`.slice(0, 2_000),
      traceFrom: 0,
      traceTo: traceBeforeFinish.length,
    }));
    const execution = await runtime.execute("finish", {
      status: "PASSOU",
      summary: "Fluxo reaproveitado de uma execução aprovada e confirmado na interface atual.",
      observedResult: observedText.slice(0, 4_000) || "Todas as ações aprovadas foram executadas sem erro.",
      missingPreconditions: [],
      steps,
    }, ++iteration);
    if (!execution.final) return undefined;
    const trace = runtime.getTrace();
    let verifier: QaPilotResult["verifier"];
    try {
      verifier = await verifyFinal(input, plan, execution.final, trace, trackedLlm);
    } catch {
      return undefined;
    }
    if (!verifier.accepted || verifier.correctedStatus !== "PASSOU") return undefined;
    const traceFile = path.join(input.outputDirectory, `${safeFilename(input.scenarioId)}-trace.json`);
    const result: QaPilotResult = {
      runId: input.runId,
      scenarioId: input.scenarioId,
      plan,
      scenarioContract,
      final: execution.final,
      verifier,
      iterations: iteration,
      usage,
      traceFile,
      trace,
      executionMode: "APPROVED_RECIPE",
      executionPlan: input.executionPlan,
    };
    const safeResult = safePilotResult(input, result);
    await fs.writeFile(traceFile, JSON.stringify({ ...safeResult, approvedRecipe: true }, null, 2), "utf8");
    return safeResult;
  } finally {
    await runtime.close();
  }
}

export async function runQaPilotAgent(
  input: QaPilotInput,
  options: { llm?: LlmInvoker; runtime?: QaPilotToolRuntime; verify?: boolean } = {},
): Promise<QaPilotResult> {
  if (!input.environments.length) throw new Error("O piloto exige ao menos um ambiente.");
  const scenarioContract = parseGherkinScenarioSteps(input.gherkin);
  await fs.mkdir(input.outputDirectory, { recursive: true });
  const llm = options.llm ?? invokeLLM;
  const usage = { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const trackedLlm: LlmInvoker = async params => {
    const response = await llm(params);
    usage.calls += 1;
    usage.promptTokens += response.usage?.prompt_tokens ?? 0;
    usage.completionTokens += response.usage?.completion_tokens ?? 0;
    usage.totalTokens += response.usage?.total_tokens ?? 0;
    return response;
  };
  const runtime = options.runtime ?? new PlaywrightPilotRuntime(input);
  const maxIterations = Math.min(40, Math.max(8, input.maxIterations ?? 28));
  const plan = await createPlan(input, trackedLlm);
  const bootstrapEvidence = await executeV2Bootstrap(input, runtime);
  const stepResults: QaScenarioStepResult[] = [];
  let traceCheckpoint = 0;
  const messages: Message[] = [
    {
      role: "system",
      content: [
        "Você executa um teste web com ferramentas locais.",
        "Observe depois de cada mudança e replaneje quando a evidência contrariar o plano.",
        "Não invente dados nem considere ausência genérica como prova de comportamento.",
        SYNTHETIC_NO_MATCH_GUIDANCE,
        "Quando essa regra se aplicar, prefira browser_search_no_match em vez de vários cliques e preenchimentos separados.",
        "Estabeleça precondições executáveis pela interface. Se um botão de filtro não expuser aria-pressed/active, clique nele e valide o estado observável; não bloqueie apenas pela ausência desse atributo.",
        "Antes de marcar um Dado como BLOQUEADO, navegue até a tela relevante e use browser_inspect_page. Login ou observação do painel inicial, isoladamente, nunca comprovam ausência de precondição.",
        "Para dados parametrizados, use browser_fill_test_data com uma chave de availableTestDataKeys; nunca peça nem revele o valor.",
        "Para checkbox, radio, aceite, consentimento, LGPD ou termo, use obrigatoriamente browser_check; browser_click pode desmarcar um controle já marcado.",
        "Dados sintéticos básicos já são gerados automaticamente. Quando faltar uma precondição segura, tente criá-la pela interface autorizada e capture identificadores/links com browser_capture_field_test_data ou browser_capture_link_test_data para reutilização.",
        "Não bloqueie por falta de CPF, nome, e-mail, telefone, contato alternativo ou credenciais sintéticas: use as chaves automáticas disponíveis.",
        "Para downloads, use browser_click_and_download e valide downloaded, filename e bytes; net::ERR_ABORTED isolado é comportamento comum de download, não falha funcional.",
        "Use browser_login quando precisar autenticar; credenciais não estão no contexto.",
        "Quando o cenário exigir outro usuário, escolha uma segunda conta listada em environments e use browser_new_session com seu nome.",
        "Se uma segunda conta não existir e a conta atual puder administrar usuários, crie uma conta sintética com USUARIO_SEGUNDA_CONTA/SENHA_SEGUNDA_CONTA e abra-a com browser_new_session_test_data.",
        "Não execute ações destrutivas. Capture screenshot antes de finalizar.",
        "Use FALHOU apenas para divergência funcional observada; falha da ferramenta é ERRO_AUTOMACAO.",
        "Antes de concluir BLOQUEADO ou ERRO_AUTOMACAO, use resolve_blocker, repita o passo original e observe novamente. O motor também aplicará essa recuperação automaticamente se você tentar concluir sem fazê-la.",
        "Quando houver ponte de provisionamento e o passo exigir massa complexa, estado temporal, perfil específico ou execução de rotina agendada, use provision_test_state. Nunca tente simular a passagem do tempo apenas pelo navegador.",
        "Execute literalmente cada item de scenarioContract, na ordem. Não substitua, agrupe nem pule passos.",
        "scenarioContract/Gherkin é a única fonte de requisitos. O plano é apenas uma sugestão de navegação: ignore qualquer requiredData, campo, payload ou validação extra que não esteja no scenarioContract.",
        "Ausência comprovada de uma tela, campo, botão, rota ou comportamento que o scenarioContract exige é FALHOU (divergência funcional), não BLOQUEADO. BLOQUEADO é reservado a dependência externa ou massa de negócio indispensável que não pode ser criada pela interface.",
        "Depois de executar e observar cada passo, chame complete_step com o ID correspondente.",
        "Se um passo impedir os seguintes, registre os restantes em ordem como NAO_EXECUTADO e explique a dependência.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({
        scenario: { id: input.scenarioId, title: input.title, gherkin: input.gherkin },
        environments: input.environments.map(({ name, url, username, password }) => ({
          name, url, hasCredentials: Boolean(username && password),
        })),
        plan: {
          objective: plan.objective,
          steps: plan.steps,
          successCriteria: plan.successCriteria,
          risks: plan.risks,
          requiredDataIsAdvisoryOnly: true,
        },
        scenarioContract,
        availableTestDataKeys: Object.keys(input.testData ?? {}),
        provisioningAvailable: Boolean(input.provisioning),
        automationV2: input.executionPlan ? {
          mode: input.executionPlan.mode,
          resolutions: input.executionPlan.resolutions,
          rule: "Use habilidades resolvidas primeiro. Acione descoberta somente nos passos marcados como DISCOVERY_REQUIRED ou PROVISION_REQUIRED.",
          bootstrapEvidence,
        } : undefined,
      }),
    },
  ];

  let final: QaPilotFinal | undefined;
  let iterations = 0;
  try {
    for (iterations = 1; iterations <= maxIterations && !final; iterations++) {
      await waitForExecutionControl(input);
      compactPilotToolHistory(messages);
      const remainingBudget = maxIterations - iterations + 1;
      if (remainingBudget === 3) {
        messages.push({ role: "user", content: "Restam somente 3 decisões. Pare de explorar: registre agora cada passo restante com complete_step usando apenas a evidência observada, capture screenshot se necessário e finalize. Não repita navegação ou inspeção." });
      }
      const response = await trackedLlm({
        model: input.model,
        messages,
        tools,
        toolChoice: "auto",
        reasoningEffort: "none",
        maxTokens: 2_048,
      });
      const assistant = response.choices[0]?.message;
      if (!assistant) throw new Error("A IA não retornou uma decisão.");
      const toolCalls = assistant.tool_calls ?? [];
      messages.push({
        role: "assistant",
        content: contentText(assistant.content),
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });
      if (!toolCalls.length) {
        messages.push({ role: "user", content: "Escolha uma ferramenta para continuar ou finalize com finish." });
        continue;
      }
      for (const call of toolCalls) {
        await waitForExecutionControl(input);
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function.arguments || "{}"); }
        catch { args = {}; }
        let execution: ToolExecution;
        if (call.function.name === "complete_step") {
          const expected = scenarioContract[stepResults.length];
          const requestedId = String(args.stepId ?? "");
          const requestedStatus = String(args.status ?? "") as QaScenarioStepStatus;
          const allowedStatuses: QaScenarioStepStatus[] = ["PASSOU", "FALHOU", "BLOQUEADO", "ERRO_AUTOMACAO", "NAO_EXECUTADO"];
          const traceNow = runtime.getTrace();
          const activity = traceNow.slice(traceCheckpoint).filter(event => event.ok && event.tool !== "browser_screenshot");
          const previousFailed = stepResults.some(step => step.status !== "PASSOU");
          if (!expected) {
            execution = { output: { error: "Todos os passos já foram registrados; capture a evidência e finalize." } };
          } else if (requestedId !== expected.id) {
            execution = { output: { error: `Passo fora de ordem. O próximo obrigatório é ${expected.id}: ${expected.sourceLine}` } };
          } else if (!allowedStatuses.includes(requestedStatus)) {
            execution = { output: { error: "Status de passo inválido." } };
          } else if (requestedStatus === "NAO_EXECUTADO" && !previousFailed) {
            execution = { output: { error: "NAO_EXECUTADO só é permitido após um passo anterior não aprovado." } };
          } else if (requestedStatus === "BLOQUEADO" && citesAvailableTestData(args.observed, input.testData)) {
            execution = { output: { error: "Bloqueio rejeitado: o dado citado já está disponível automaticamente. Preencha somente os campos visíveis exigidos pelo Gherkin e continue; requisitos extras do plano são apenas sugestões." } };
          } else if (requestedStatus !== "NAO_EXECUTADO" && activity.length === 0) {
            execution = { output: { error: `Execute ou observe ${expected.id} antes de registrá-lo.` } };
          } else if (String(args.observed ?? "").trim().length < 10) {
            execution = { output: { error: "Descreva objetivamente o que foi observado neste passo." } };
          } else {
            const classifiedAbsence = classifyObservedAbsence(expected, args.observed);
            const effectiveStatus: QaScenarioStepStatus = requestedStatus === "FALHOU" && classifiedAbsence === "BLOQUEADO"
              ? "BLOQUEADO"
              : requestedStatus === "BLOQUEADO" && classifiedAbsence === "FALHOU"
                ? "FALHOU"
                : requestedStatus;
            const resolverEvents = activity.filter(event => event.tool === "resolve_blocker");
            const lastResolver = resolverEvents.at(-1);
            const needsAutonomousRecovery = effectiveStatus === "BLOQUEADO" || effectiveStatus === "ERRO_AUTOMACAO";
            if (needsAutonomousRecovery && !lastResolver) {
              const category = effectiveStatus === "BLOQUEADO"
                ? classifyBlocker(expected, args.observed)
                : automationErrorRecoveryCategory(args.observed);
              const resolution = await runtime.execute("resolve_blocker", {
                category,
                objective: `${expected.sourceLine}. Observado: ${String(args.observed ?? "").trim()}`.slice(0, 1_000),
              }, iterations);
              execution = { output: {
                error: category === "EXTERNAL"
                  ? "Dependência externa identificada. Confirme novamente o passo para registrar o bloqueio comprovado."
                  : `${effectiveStatus} ainda não aceito: o motor executou uma tentativa autônoma de resolução. Reexecute o passo original, observe o novo estado e somente então registre o resultado.`,
                autonomousResolution: boundedResult(resolution.output),
              } };
            } else if (needsAutonomousRecovery && lastResolver) {
              const resolution = lastResolver.result && typeof lastResolver.result === "object"
                ? lastResolver.result as Record<string, unknown>
                : {};
              const resolverIndex = activity.lastIndexOf(lastResolver);
              const retriedAfterResolution = activity.slice(resolverIndex + 1)
                .some(event => event.tool !== "resolve_blocker");
              if (resolution.external !== true && !retriedAfterResolution) {
                execution = { output: {
                  error: "A correção autônoma foi tentada, mas o passo original ainda não foi repetido. Reexecute-o e observe o resultado antes de concluir.",
                  autonomousResolution: boundedResult(resolution),
                } };
              } else {
                const completed: QaScenarioStepResult = {
                  ...expected,
                  status: effectiveStatus,
                  observed: String(args.observed).trim().slice(0, 2_000),
                  traceFrom: traceCheckpoint,
                  traceTo: traceNow.length,
                };
                stepResults.push(completed);
                traceCheckpoint = traceNow.length;
                execution = { output: { recorded: completed, remaining: scenarioContract.slice(stepResults.length) } };
              }
            } else {
              const completed: QaScenarioStepResult = {
                ...expected,
                status: effectiveStatus,
                observed: String(args.observed).trim().slice(0, 2_000),
                traceFrom: traceCheckpoint,
                traceTo: traceNow.length,
              };
              stepResults.push(completed);
              traceCheckpoint = traceNow.length;
              execution = { output: { recorded: completed, remaining: scenarioContract.slice(stepResults.length) } };
            }
          }
        } else if (call.function.name === "finish") {
          const missing = scenarioContract.slice(stepResults.length);
          const hasScreenshot = runtime.getTrace().some(event => event.ok && event.tool === "browser_screenshot");
          if (missing.length) {
            execution = { output: { error: "Conclusão rejeitada: existem passos sem resultado.", missing } };
          } else if (!hasScreenshot) {
            execution = { output: { error: "Conclusão rejeitada: capture uma screenshot final." } };
          } else {
            execution = await runtime.execute("finish", {
              ...args,
              status: deriveScenarioStatus(stepResults),
              steps: stepResults,
            }, iterations);
          }
        } else {
          execution = await runtime.execute(call.function.name, args, iterations);
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify(boundedResult(execution.output)),
        });
        if (execution.final) {
          final = execution.final;
          break;
        }
      }
    }
    if (!final) {
      const remainingSteps = scenarioContract.slice(stepResults.length).map(step => ({
        ...step,
        status: "NAO_EXECUTADO" as const,
        observed: "O executor atingiu o limite antes deste passo.",
        traceFrom: runtime.getTrace().length,
        traceTo: runtime.getTrace().length,
      }));
      const derivedStatus = stepResults.some(step => step.status !== "PASSOU")
        ? deriveScenarioStatus(stepResults)
        : "ERRO_AUTOMACAO";
      final = {
        status: derivedStatus,
        summary: derivedStatus === "ERRO_AUTOMACAO"
          ? `O piloto atingiu o limite de ${maxIterations} iterações sem conclusão.`
          : `O piloto atingiu o limite de ${maxIterations} iterações após registrar ${stepResults.find(step => step.status !== "PASSOU")?.status ?? derivedStatus}.`,
        evidence: evidenceFromTrace(runtime.getTrace()),
        missingPreconditions: [],
        observedResult: "Execução interrompida pelo limite do piloto.",
        steps: [...stepResults, ...remainingSteps],
      };
    }
    const trace = runtime.getTrace();
    let verifier: QaPilotResult["verifier"];
    if (options.verify !== false) {
      try {
        verifier = await verifyFinal(input, plan, final, trace, trackedLlm);
        if (!verifier.accepted && verifier.correctedStatus && verifier.correctedStatus !== final.status) {
          final = {
            ...final,
            status: verifier.correctedStatus,
            summary: `${final.summary} Verificação independente: ${verifier.reason}`.slice(0, 2_000),
          };
        }
      }
      catch (error) {
        verifier = {
          accepted: false,
          reason: `Verificador indisponível: ${safeErrorMessage(error)}`,
        };
      }
    }
    const traceFile = path.join(input.outputDirectory, `${safeFilename(input.scenarioId)}-trace.json`);
    const result: QaPilotResult = {
      runId: input.runId,
      scenarioId: input.scenarioId,
      plan,
      scenarioContract,
      final,
      verifier,
      iterations: Math.min(iterations, maxIterations),
      usage,
      traceFile,
      trace,
      executionMode: input.executionPlan ? "HYBRID_V2" : "AGENT",
      executionPlan: input.executionPlan,
    };
    const safeResult = safePilotResult(input, result);
    await fs.writeFile(traceFile, JSON.stringify(safeResult, null, 2), "utf8");
    return safeResult;
  } finally {
    await runtime.close();
  }
}
