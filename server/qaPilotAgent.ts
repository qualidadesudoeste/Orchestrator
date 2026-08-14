import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
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
  requestQaProvisioning,
  strategiesForBlocker,
  type BlockerCategory,
  type ExecutableScenarioPlan,
  type QaProvisioningAction,
  type QaProvisioningConfig,
} from "./automation-v2";

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

type ToolExecution = { output: unknown; final?: QaPilotFinal };

export interface QaPilotToolRuntime {
  execute(name: string, args: Record<string, unknown>, iteration: number): Promise<ToolExecution>;
  close(): Promise<void>;
  getTrace(): QaPilotTraceEvent[];
}

type LlmInvoker = (params: InvokeParams) => Promise<InvokeResult>;

const MAX_OBSERVATION_TEXT = 1_200;
const MAX_TOOL_RESULT_TEXT = 6_000;
const DESTRUCTIVE_ACTION = /\b(excluir|remover|apagar|deletar|delete|remove|encerrar processo|cancelar processo)\b/i;
const UI_MUTATING_TOOLS = new Set([
  "browser_click", "browser_click_semantic", "browser_check", "browser_check_semantic",
  "browser_fill", "browser_fill_semantic", "browser_fill_test_data", "browser_fill_test_data_semantic",
  "browser_fill_visible_form", "browser_submit_form", "browser_select", "browser_select_semantic",
  "browser_press", "browser_back", "browser_search_no_match", "browser_click_and_download",
]);
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

function redactedArgs(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).map(([key, value]) => [
    key,
    /password|senha|credential|token/i.test(key) ? "[REDACTED]" : value,
  ]));
}

export function classifyAutomationError(error: unknown): "STALE_ELEMENT" | "UI_OVERLAY" | "AUTHENTICATION" | "NETWORK" | "TIMEOUT" | "UNKNOWN" {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  if (/data-qa-pilot-ref|refer[eê]ncia|element.*(?:mudou|detached|not attached|n[aã]o.*dispon)/i.test(message)) return "STALE_ELEMENT";
  if (/intercepts pointer events|dialog-mask|overlay|modal/i.test(message)) return "UI_OVERLAY";
  if (/login|senha|password|credencia|autentic/i.test(message)) return "AUTHENTICATION";
  if (/net::|econn|dns|network|conex[aã]o|connection/i.test(message)) return "NETWORK";
  if (/timeout|tempo limite/i.test(message)) return "TIMEOUT";
  return "UNKNOWN";
}

export function automationErrorRecoveryCategory(error: unknown): BlockerCategory {
  switch (classifyAutomationError(error)) {
    case "AUTHENTICATION": return "AUTH_SESSION";
    case "NETWORK": return "NETWORK";
    case "STALE_ELEMENT":
    case "UI_OVERLAY":
    case "TIMEOUT":
    case "UNKNOWN": return "UI_STATE";
  }
}

export function boundedResult(value: unknown): unknown {
  const serialized = JSON.stringify(value);
  if (serialized.length <= MAX_TOOL_RESULT_TEXT) return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const observation = value as Record<string, any>;
    if (typeof observation.category === "string" && Array.isArray(observation.attempts)) {
      return {
        truncated: true,
        category: observation.category,
        objective: String(observation.objective ?? "").slice(0, 500),
        strategies: observation.strategies,
        attempts: observation.attempts.slice(0, 12),
        attempted: observation.attempted,
        changed: observation.changed,
        resolved: observation.resolved,
        external: observation.external,
        requiresStepRetry: observation.requiresStepRetry,
        url: observation.url,
        title: observation.title,
        text: String(observation.text ?? "").slice(0, MAX_OBSERVATION_TEXT),
      };
    }
    if (observation.url || observation.title || Array.isArray(observation.elements)) {
      return {
        truncated: true,
        action: observation.action,
        url: observation.url,
        title: observation.title,
        text: String(observation.text ?? "").slice(0, MAX_OBSERVATION_TEXT),
        elements: (Array.isArray(observation.elements) ? observation.elements : [])
          .slice(0, 25)
          .map((element: Record<string, unknown>) => ({
            ref: element.ref,
            tag: element.tag,
            role: element.role,
            type: element.type,
            name: element.name,
            context: String(element.context ?? "").slice(0, 60),
            disabled: element.disabled,
          })),
        console: Array.isArray(observation.console) ? observation.console.slice(-5) : [],
        networkFailures: Array.isArray(observation.networkFailures) ? observation.networkFailures.slice(-5) : [],
      };
    }
  }
  return { truncated: true, preview: serialized.slice(0, MAX_TOOL_RESULT_TEXT) };
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

function isAllowedNavigation(target: string, allowedOrigins: Set<string>, currentUrl?: string): boolean {
  try {
    const resolved = new URL(target, currentUrl);
    return allowedOrigins.has(resolved.origin);
  } catch {
    return false;
  }
}

function capturedValue(raw: string, key: string, label: string): string {
  const source = raw.replace(/\s+/g, " ").trim();
  if (/LINK|URL/.test(key)) return source.match(/https?:\/\/[^\s]+/i)?.[0] ?? source;
  if (/EMAIL|CONTATO/.test(key)) return source.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] ?? source;
  if (/CPF/.test(key)) return source.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)?.[0] ?? source;
  if (/TELEFONE/.test(key)) return source.match(/\(?\d{2}\)?\s?\d{4,5}-?\d{4}/)?.[0] ?? source;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.replace(new RegExp(`^.*?${escaped}\s*[:#-]?\s*`, "i"), "").trim().slice(0, 2_000) || source.slice(0, 2_000);
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

export class PlaywrightPilotRuntime implements QaPilotToolRuntime {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private readonly trace: QaPilotTraceEvent[] = [];
  private readonly evidence: string[] = [];
  private readonly consoleMessages: string[] = [];
  private readonly networkFailures: string[] = [];
  private readonly authenticatedOrigins = new Set<string>();
  private readonly refDescriptors = new Map<string, { name: string; role: string; tag: string; type: string }>();
  private final?: QaPilotFinal;
  private readonly allowedOrigins: Set<string>;

  constructor(private readonly input: QaPilotInput) {
    this.allowedOrigins = new Set(input.environments.map(item => new URL(item.url).origin));
  }

  private async ensurePage(): Promise<Page> {
    if (this.page) return this.page;
    this.browser = await chromium.launch({ channel: "chrome", headless: this.input.headless ?? true });
    this.context = await this.browser.newContext({
      viewport: { width: 1440, height: 1000 },
      ignoreHTTPSErrors: false,
    });
    this.page = await this.context.newPage();
    this.page.on("console", message => {
      const value = `[${message.type()}] ${message.text()}`.slice(0, 1_000);
      this.consoleMessages.push(value);
      if (this.consoleMessages.length > 30) this.consoleMessages.shift();
    });
    this.page.on("pageerror", error => {
      this.consoleMessages.push(`[pageerror] ${error.message}`.slice(0, 1_000));
    });
    this.page.on("requestfailed", request => {
      this.networkFailures.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "falhou"}`.slice(0, 1_000));
      if (this.networkFailures.length > 30) this.networkFailures.shift();
    });
    return this.page;
  }

  private async observe(): Promise<unknown> {
    const page = await this.ensurePage();
    // A string is intentional: TSX/esbuild decorates nested callbacks with a
    // helper that does not exist inside the isolated browser context.
    const snapshot = await page.evaluate(`(() => {
      const candidates = Array.from(document.querySelectorAll(
        "a,button,input,select,textarea,[contenteditable=true],[aria-haspopup],[role=button],[role=link],[role=tab],[role=checkbox],[role=radio],[role=combobox],[role=listbox],[role=option],[role=menuitem]"
      )).filter(element => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      }).slice(0, 80);
      document.querySelectorAll("[data-qa-pilot-ref]").forEach(element => element.removeAttribute("data-qa-pilot-ref"));
      const elements = candidates.map((element, index) => {
        const ref = "e" + (index + 1);
        element.setAttribute("data-qa-pilot-ref", ref);
        const label = (element.labels && element.labels[0] && element.labels[0].innerText || "").trim()
          || element.getAttribute("aria-label") || "";
        return {
          ref,
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute("role") || "",
          type: element.type || "",
          name: label || (element.innerText || "").trim().slice(0, 120) || element.placeholder || element.name || "",
          context: ((element.parentElement && element.parentElement.innerText) || "").replace(/\\s+/g, " ").trim().slice(0, 100),
          value: element.type === "password" ? "[REDACTED]" : String(element.value || "").slice(0, 160),
          disabled: Boolean(element.disabled) || element.getAttribute("aria-disabled") === "true",
          checked: element.type === "checkbox" || element.type === "radio"
            ? Boolean(element.checked)
            : element.getAttribute("aria-checked")
        };
      });
      return {
        title: document.title,
        text: (document.body && document.body.innerText || "").replace(/\\s+/g, " ").trim().slice(0, ${MAX_OBSERVATION_TEXT}),
        elements
      };
    })()` ) as { title: string; text: string; elements: unknown[] };
    this.captureReusableObservedData(snapshot.text);
    for (const raw of snapshot.elements) {
      const element = raw as { ref?: unknown; name?: unknown; role?: unknown; tag?: unknown; type?: unknown };
      const ref = String(element.ref ?? "");
      if (ref) this.refDescriptors.set(ref, {
        name: String(element.name ?? "").trim(),
        role: String(element.role ?? "").trim(),
        tag: String(element.tag ?? "").trim(),
        type: String(element.type ?? "").trim(),
      });
    }
    return {
      url: page.url(),
      ...snapshot,
      console: this.consoleMessages.slice(-10),
      networkFailures: this.networkFailures.slice(-10),
    };
  }

  private captureReusableObservedData(text: string) {
    // Business identifiers created by one scenario must be available to the
    // following scenarios without asking the user to copy or configure them.
    const protocol = text.match(/(?:protocolo|n(?:u|\u00fa)mero\s+do\s+protocolo)\s*(?:n(?:\u00ba|o)?\.?\s*)?(?:[:#-]|\u00e9)?\s*([A-Z0-9][A-Z0-9./_-]{4,80})/i)?.[1];
    if (!protocol) return;
    this.input.testData ??= {};
    for (const key of ["PROTOCOLO", "PROTOCOLO_CRIADO", "PROTOCOL"]) {
      this.input.testData[key] ??= protocol;
    }
    // A public record created with the synthetic form data has a known,
    // deterministic original contact. Keep that relationship for subsequent
    // protocol-consultation scenarios in the same execution.
    if (this.input.testData.EMAIL_TESTE) {
      this.input.testData.CONTATO_ORIGINAL ??= this.input.testData.EMAIL_TESTE;
      this.input.testData.CONTATO_ORIGINAL_EMAIL ??= this.input.testData.EMAIL_TESTE;
    }
    if (this.input.testData.TELEFONE_TESTE) {
      this.input.testData.CONTATO_ORIGINAL_TELEFONE ??= this.input.testData.TELEFONE_TESTE;
    }
  }

  private locatorForRef(page: Page, ref: unknown) {
    const normalized = String(ref ?? "");
    if (!/^e\d+$/.test(normalized)) throw new Error("Referência de elemento inválida; observe a página novamente.");
    return page.locator(`[data-qa-pilot-ref="${normalized}"]`).first();
  }

  private semanticCandidates(page: Page, label: string) {
    return [
      page.getByRole("button", { name: label, exact: true }),
      page.getByRole("link", { name: label, exact: true }),
      page.getByRole("tab", { name: label, exact: true }),
      page.getByRole("menuitem", { name: label, exact: true }),
      page.getByLabel(label, { exact: true }),
      page.getByPlaceholder(label, { exact: true }),
      page.getByText(label, { exact: true }),
    ];
  }

  private async firstVisible(candidates: ReturnType<Page["locator"]>[]) {
    for (const candidate of candidates) {
      const locator = candidate.first();
      if (await locator.count() && await locator.isVisible().catch(() => false)) return locator;
    }
    return null;
  }

  private async locatorWithSemanticRecovery(page: Page, ref: unknown) {
    const direct = this.locatorForRef(page, ref);
    if (await direct.count() && await direct.isVisible().catch(() => false)) return direct;
    const descriptor = this.refDescriptors.get(String(ref ?? ""));
    if (!descriptor?.name) throw new Error("Elemento não está mais disponível e não possui identidade semântica para recuperação.");
    const recovered = await this.firstVisible(this.semanticCandidates(page, descriptor.name));
    if (!recovered) throw new Error(`Elemento '${descriptor.name}' mudou e não foi reencontrado semanticamente.`);
    return recovered;
  }

  private async clickWithUiRecovery(page: Page, locator: ReturnType<Page["locator"]>): Promise<void> {
    try {
      await locator.click({ timeout: 6_000 });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const type = await locator.getAttribute("type").catch(() => null);
      const readonly = await locator.getAttribute("readonly").catch(() => null);
      const role = await locator.getAttribute("role").catch(() => null);
      const tagName = await locator.evaluate(element => element.tagName).catch(() => "");
      if (readonly != null || role === "combobox" || type === "select-one" || tagName === "SELECT") {
        const wrapper = locator.locator("xpath=ancestor-or-self::*[@role='combobox' or contains(@class,'p-dropdown') or contains(@class,'p-select')][1]");
        if (await wrapper.count() && await wrapper.isVisible().catch(() => false)) {
          const trigger = await this.firstVisible([
            wrapper.locator(".p-dropdown-label,.p-select-label,[data-pc-section='input']"),
            wrapper.getByRole("combobox"),
            wrapper,
          ]);
          await (trigger ?? wrapper).click({ timeout: 6_000 });
          return;
        }
        const parent = locator.locator("..");
        if (await parent.isVisible().catch(() => false)) {
          await parent.click({ timeout: 6_000, position: { x: 8, y: 8 } });
          return;
        }
      }
      if (/intercepts pointer events/i.test(message)) {
        const dialog = page.getByRole("dialog").last();
        const targetInsideDialog = await locator.evaluate(element => Boolean(element.closest('[role="dialog"],.p-dialog'))).catch(() => false);
        if (await dialog.count() && await dialog.isVisible().catch(() => false) && !targetInsideDialog) {
          const close = await this.firstVisible([
            dialog.getByRole("button", { name: /fechar|close|cancelar|sair/i }),
            dialog.locator('[aria-label*="close" i],[aria-label*="fechar" i],button.p-dialog-header-close'),
          ]);
          if (close) {
            await close.click({ timeout: 6_000 });
            await page.waitForTimeout(250);
            await locator.click({ timeout: 6_000 });
            return;
          }
        }
      }
      throw error;
    }
  }

  private async inspectPage(query: unknown): Promise<unknown> {
    const page = await this.ensurePage();
    const needle = String(query ?? "").trim().slice(0, 200);
    const encodedNeedle = JSON.stringify(needle);
    return page.evaluate(`(() => {
      const needle = ${encodedNeedle};
      const normalized = value => value.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase();
      const wanted = normalized(needle);
      const visible = element => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      };
      const sections = Array.from(document.querySelectorAll("h1,h2,h3,h4,table,dl,article,section,[role=row],label"))
        .filter(visible)
        .map(element => (element.textContent || "").replace(/\s+/g, " ").trim())
        .filter(value => value && (!wanted || normalized(value).includes(wanted)))
        .slice(0, 40)
        .map(value => value.slice(0, 600));
      const fields = Array.from(document.querySelectorAll("input,select,textarea"))
        .filter(visible)
        .map(element => {
          const field = element;
          const label = field.labels?.[0]?.innerText || field.getAttribute("aria-label") || field.getAttribute("placeholder") || field.getAttribute("name") || "campo";
          const sensitive = field.type === "password" || /senha|password|token|secret|cpf|cnpj|e-?mail|telefone/i.test(label);
          return { label: label.trim().slice(0, 160), type: field.type || field.tagName.toLowerCase(), value: sensitive ? "[REDACTED]" : String(field.value || "").slice(0, 300) };
        })
        .filter(field => !wanted || normalized(field.label + " " + field.value).includes(wanted))
        .slice(0, 40);
      return { url: location.href, title: document.title, query: needle, sections, fields };
    })()`);
  }

  private automaticFieldKey(label: string, type: string): string | undefined {
    const value = `${label} ${type}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (/cpf/.test(value)) return "CPF_VALIDO";
    if (/cnpj/.test(value)) return "CNPJ_VALIDO";
    if (/e-?mail|email/.test(value) || type === "email") return "EMAIL_TESTE";
    if (/telefone|celular|whatsapp/.test(value) || type === "tel") return "TELEFONE_TESTE";
    if (/cep|codigo postal/.test(value)) return "CEP_TESTE";
    if (/contato alternativo/.test(value)) return "CONTATO_ALTERNATIVO";
    if (/nome|name/.test(value) && !/usuario|user|login/.test(value)) return "NOME_TESTE";
    if (/usuario|username|login/.test(value)) return "USUARIO_SEGUNDA_CONTA";
    if (/confirm.*senha|confirm.*password|nova senha|new password|^senha | password/.test(value)) return "SENHA_SEGUNDA_CONTA";
    if (type === "date" || /data|vencimento/.test(value)) {
      if (/passad|vencid|anterior/.test(value)) return "DATA_PASSADA";
      if (/futur|proxim/.test(value)) return "DATA_FUTURA";
      return "DATA_HOJE";
    }
    return undefined;
  }

  private async fillVisibleKnownForm(): Promise<unknown> {
    const page = await this.ensurePage();
    const fields = page.locator("input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]):not([type=file]),textarea");
    const filled: Array<{ label: string; key: string }> = [];
    for (let index = 0; index < await fields.count(); index++) {
      const field = fields.nth(index);
      if (!await field.isVisible().catch(() => false) || await field.isDisabled().catch(() => true)) continue;
      if (await field.getAttribute("readonly") != null) continue;
      const current = await field.inputValue().catch(() => "");
      if (current.trim()) continue;
      const label = await field.evaluate(element => {
        const input = element as HTMLInputElement;
        return input.labels?.[0]?.innerText || element.getAttribute("aria-label") ||
          element.getAttribute("placeholder") || element.getAttribute("name") || "campo";
      });
      const type = await field.getAttribute("type") || (await field.evaluate(element => element.tagName.toLowerCase()));
      const key = this.automaticFieldKey(String(label), type);
      const value = key ? this.input.testData?.[key] : undefined;
      if (!key || value == null) continue;
      await field.fill(value, { timeout: 15_000 });
      filled.push({ label: String(label).trim().slice(0, 120), key });
    }

    const checked: string[] = [];
    const controls = page.locator('input[type="checkbox"], [role="checkbox"]');
    for (let index = 0; index < await controls.count(); index++) {
      const control = controls.nth(index);
      if (!await control.isVisible().catch(() => false) || await control.isDisabled().catch(() => true)) continue;
      const label = await control.evaluate(element => {
        const input = element as HTMLInputElement;
        return input.labels?.[0]?.innerText || element.getAttribute("aria-label") ||
          element.parentElement?.innerText || "";
      });
      if (!/aceit|concord|consent|privacidade|lgpd|termo/i.test(label)) continue;
      const type = await control.getAttribute("type");
      if (type === "checkbox") await control.check({ timeout: 15_000 });
      else if (await control.getAttribute("aria-checked") !== "true") await control.click({ timeout: 15_000 });
      const isChecked = type === "checkbox" ? await control.isChecked() : await control.getAttribute("aria-checked") === "true";
      if (!isChecked) throw new Error(`O aceite '${String(label).slice(0, 120)}' não permaneceu marcado.`);
      checked.push(String(label).trim().slice(0, 120));
    }
    return { action: { type: "fill_visible_form", fields: filled, checked }, ...(await this.observe() as Record<string, unknown>) };
  }

  private async submitVisibleForm(): Promise<unknown> {
    const page = await this.ensurePage();
    const submit = await this.firstVisible([
      page.getByRole("button", { name: /enviar|cadastrar|confirmar|salvar|consultar|pesquisar|buscar|continuar/i }),
      page.locator('button[type="submit"],input[type="submit"]'),
    ]);
    if (!submit) throw new Error("Nenhum controle semântico de envio foi encontrado no formulário visível.");
    const label = await submit.innerText().catch(() => submit.getAttribute("value")) || "Enviar";
    if (DESTRUCTIVE_ACTION.test(label)) throw new Error("Ação destrutiva bloqueada pelo motor V2.");
    await submit.click({ timeout: 15_000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    return { action: { type: "submit_form", label: String(label).trim().slice(0, 120) }, ...(await this.observe() as Record<string, unknown>) };
  }

  private async provisionTestState(
    action: QaProvisioningAction,
    objective: string,
    category?: string,
    environmentName?: string,
  ): Promise<unknown> {
    if (!this.input.provisioning) {
      return { configured: false, resolved: false, message: "Projeto sem ponte de provisionamento configurada." };
    }
    const result = await requestQaProvisioning(this.input.provisioning, {
      action,
      runId: this.input.runId,
      scenarioId: this.input.scenarioId,
      objective,
      category,
      environmentName,
      availableTestDataKeys: Object.keys(this.input.testData ?? {}),
    });
    this.input.testData ??= {};
    Object.assign(this.input.testData, result.testData);
    return {
      configured: true,
      resolved: result.resolved,
      message: result.message,
      suppliedTestDataKeys: Object.keys(result.testData),
      cleanupToken: result.cleanupToken,
      externalReference: result.externalReference,
    };
  }

  private async resolveBlocker(category: BlockerCategory, objective: string, environmentName?: string): Promise<unknown> {
    const page = await this.ensurePage();
    const before = `${page.url()}|${(await page.locator("body").innerText().catch(() => "")).slice(0, 2_000)}`;
    const attempts: Array<{ strategy: string; ok: boolean; detail: string }> = [];
    const strategies = strategiesForBlocker(category);

    for (const strategy of strategies) {
      try {
        if (strategy === "PROJECT_PROVISIONER") {
          const result = await this.provisionTestState("PREPARE_STATE", objective, category, environmentName) as Record<string, unknown>;
          attempts.push({ strategy, ok: result.resolved === true, detail: String(result.message ?? "Provisionador não resolveu a precondição.").slice(0, 500) });
          if (result.resolved === true) break;
          continue;
        }
        if (strategy === "REPORT_EXTERNAL_DEPENDENCY") {
          attempts.push({ strategy, ok: false, detail: "Dependência externa que não pode ser contornada com segurança pelo navegador." });
          continue;
        }
        if (strategy === "DISMISS_OVERLAY_AND_REMAP") {
          const dialog = page.getByRole("dialog").last();
          if (await dialog.count() && await dialog.isVisible().catch(() => false)) {
            const close = await this.firstVisible([
              dialog.getByRole("button", { name: /fechar|close|cancelar|sair/i }),
              dialog.locator('[aria-label*="close" i],[aria-label*="fechar" i],button.p-dialog-header-close'),
            ]);
            if (close) await close.click({ timeout: 6_000 });
            else await page.keyboard.press("Escape");
          } else {
            await page.keyboard.press("Escape");
          }
          await page.waitForTimeout(250);
          attempts.push({ strategy, ok: true, detail: "Overlay tratado e mapa de elementos renovado." });
        } else if (strategy === "REAUTHENTICATE") {
          await this.deterministicLogin(environmentName);
          attempts.push({ strategy, ok: true, detail: "Sessão autenticada novamente." });
        } else if (strategy === "DISCOVER_ROUTE") {
          const tokens = objective.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
            .split(/[^a-z0-9]+/).filter(token => token.length >= 4 && !/^(dado|quando|entao|para|como|uma|com)$/.test(token));
          const candidates = page.locator("a:visible,button:visible,[role=menuitem]:visible,[role=tab]:visible");
          let best: { index: number; score: number; label: string } | undefined;
          for (let index = 0; index < Math.min(await candidates.count(), 120); index++) {
            const candidate = candidates.nth(index);
            const label = (await candidate.innerText().catch(() => "")).trim();
            if (!label || DESTRUCTIVE_ACTION.test(label)) continue;
            const normalizedLabel = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            const score = tokens.filter(token => normalizedLabel.includes(token)).length;
            if (score > (best?.score ?? 0)) best = { index, score, label };
          }
          if (!best?.score) throw new Error("Nenhum destino de navegação relacionado ao objetivo foi identificado.");
          await this.clickWithUiRecovery(page, candidates.nth(best.index));
          await page.waitForTimeout(500);
          attempts.push({ strategy, ok: true, detail: `Destino semântico acionado: ${best.label.slice(0, 120)}` });
        } else if (strategy === "FILL_SYNTHETIC_DATA") {
          const result = await this.fillVisibleKnownForm() as Record<string, any>;
          const count = result.action?.fields?.length ?? 0;
          attempts.push({ strategy, ok: count > 0 || (result.action?.checked?.length ?? 0) > 0, detail: `${count} campo(s) sintético(s) preenchido(s).` });
        } else if (strategy === "FIND_OR_CREATE_RECORD") {
          const inspection = await this.inspectPage(objective) as Record<string, any>;
          const found = (inspection.sections?.length ?? 0) > 0;
          if (found) {
            attempts.push({ strategy, ok: true, detail: "Registro relacionado encontrado pela inspeção estruturada." });
          } else {
            const create = await this.firstVisible([
              page.getByRole("button", { name: /novo|nova|criar|cadastrar|adicionar|incluir/i }),
              page.getByRole("link", { name: /novo|nova|criar|cadastrar|adicionar|incluir/i }),
            ]);
            if (!create) throw new Error("Registro não encontrado e a interface atual não oferece criação segura.");
            await this.clickWithUiRecovery(page, create);
            await page.waitForTimeout(400);
            const form = await this.fillVisibleKnownForm() as Record<string, any>;
            if (!(form.action?.fields?.length || form.action?.checked?.length)) {
              throw new Error("A tela de criação não expôs campos reconhecidos para provisionamento automático.");
            }
            await this.submitVisibleForm();
            attempts.push({ strategy, ok: true, detail: "Pré-condição criada pela interface autorizada." });
          }
        } else if (strategy === "SWITCH_OR_CREATE_ACCOUNT") {
          const alternative = this.input.environments.find(item => item.username && item.password &&
            (!environmentName || item.name.toLowerCase() !== environmentName.toLowerCase()));
          if (!alternative) throw new Error("Nenhuma conta alternativa parametrizada; a criação dependerá da tela administrativa de usuários.");
          await this.context?.close();
          this.context = undefined;
          this.page = undefined;
          await this.deterministicLogin(alternative.name);
          attempts.push({ strategy, ok: true, detail: `Sessão isolada aberta no ambiente '${alternative.name}'.` });
        } else if (strategy === "RELOAD_AND_RETRY") {
          await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
          attempts.push({ strategy, ok: true, detail: "Página recarregada após falha transitória." });
        }
      } catch (error) {
        attempts.push({ strategy, ok: false, detail: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) });
      }
    }
    const activePage = await this.ensurePage();
    const after = `${activePage.url()}|${(await activePage.locator("body").innerText().catch(() => "")).slice(0, 2_000)}`;
    const changed = before !== after;
    const successfulAttempt = attempts.some(item => item.ok);
    return {
      category,
      objective: objective.slice(0, 500),
      strategies,
      attempts,
      attempted: attempts.some(item => item.strategy !== "REPORT_EXTERNAL_DEPENDENCY"),
      changed,
      resolved: category !== "EXTERNAL" && successfulAttempt && (
        changed || category === "AUTH_SESSION" || category === "NETWORK" || category === "SIMPLE_DATA"
      ),
      external: category === "EXTERNAL",
      requiresStepRetry: category !== "EXTERNAL",
      ...(await this.observe() as Record<string, unknown>),
    };
  }

  private async deterministicLogin(environmentName?: unknown, localUsername?: string, localPassword?: string): Promise<unknown> {
    const page = await this.ensurePage();
    const requestedName = String(environmentName ?? "").trim();
    const currentOrigin = (() => { try { return new URL(page.url()).origin; } catch { return ""; } })();
    const configuredEnvironment = (requestedName
      ? this.input.environments.find(item => item.name.toLowerCase() === requestedName.toLowerCase() && item.username && item.password)
      : this.input.environments.find(item => item.username && item.password && new URL(item.url).origin === currentOrigin))
      ?? this.input.environments.find(item => item.username && item.password);
    const environment = configuredEnvironment && localUsername && localPassword
      ? { ...configuredEnvironment, username: localUsername, password: localPassword }
      : configuredEnvironment;
    if (!environment) return { authenticated: false, reason: "Ambiente sem credenciais parametrizadas." };
    if (!isAllowedNavigation(environment.url, this.allowedOrigins, page.url())) throw new Error("URL de login fora dos ambientes autorizados.");
    const loginUrl = new URL(environment.url);
    const currentUrl = page.url() && page.url() !== "about:blank" ? new URL(page.url()) : null;
    if (currentUrl?.origin === loginUrl.origin && this.authenticatedOrigins.has(loginUrl.origin)) {
      const visiblePassword = page.locator("input[type=password]:visible").first();
      if (!await visiblePassword.count()) {
        return { authenticated: true, alreadyAuthenticated: true, url: page.url(), title: await page.title() };
      }
      this.authenticatedOrigins.delete(loginUrl.origin);
    }
    if (!currentUrl || currentUrl.origin !== loginUrl.origin || currentUrl.pathname !== loginUrl.pathname) {
      await page.goto(environment.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    }
    // SPA forms may be mounted after DOMContentLoaded. Waiting for the first
    // visible input prevents a false "field not found" during hydration.
    await page.locator("input").first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
    const firstVisible = async (candidates: ReturnType<Page["locator"]>[]) => {
      for (const candidate of candidates) {
        const locator = candidate.first();
        if (await locator.count() && await locator.isVisible().catch(() => false)) return locator;
      }
      return null;
    };
    const user = await firstVisible([
      page.getByLabel(/usu.rio|login|e-?mail|cpf|cnpj|matr.cula/i),
      page.getByPlaceholder(/usu.rio|login|e-?mail|cpf|cnpj|matr.cula/i),
      page.locator("input[type=email]"),
      page.locator("input[name*=user i],input[name*=login i],input[name*=email i],input[name*=cpf i]"),
      page.locator("input[type=text]"),
    ]);
    const password = await firstVisible([
      page.getByLabel(/senha|password/i),
      page.getByPlaceholder(/senha|password/i),
      page.locator("input[type=password]"),
    ]);
    if (!user || !password) throw new Error("Campos de login não encontrados.");
    await user.fill(environment.username!);
    await password.fill(environment.password!);
    const submit = await firstVisible([
      page.getByRole("button", { name: /entrar|acessar|login|sign in|continuar/i }),
      page.locator("button[type=submit],input[type=submit]"),
    ]);
    if (!submit) throw new Error("Botão de login não encontrado.");
    await submit.click();
    await page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(1_000);
    const passwordStillVisible = await password.isVisible().catch(() => false);
    if (passwordStillVisible) throw new Error("O formulário de login permaneceu visível após o envio.");
    this.authenticatedOrigins.add(loginUrl.origin);
    return { authenticated: true, url: page.url(), title: await page.title() };
  }

  async execute(name: string, args: Record<string, unknown>, iteration: number): Promise<ToolExecution> {
    const started = Date.now();
    const event: QaPilotTraceEvent = {
      iteration,
      tool: name,
      arguments: redactedArgs(args),
      startedAt: new Date(started).toISOString(),
      durationMs: 0,
      ok: false,
      result: null,
    };
    try {
      const page = await this.ensurePage();
      const signature = `${name}|${JSON.stringify(redactedArgs(args))}|${page.url()}`;
      const repeatedFailures = this.trace.slice(-5).filter(previous => !previous.ok &&
        `${previous.tool}|${JSON.stringify(previous.arguments)}|${String((previous.result as any)?.url ?? page.url())}` === signature);
      if (repeatedFailures.length >= 2) {
        throw new Error("Loop de automação interrompido: a mesma ação falhou duas vezes no mesmo estado. Reobserve a tela e escolha outra estratégia sem repetir a referência.");
      }
      let output: unknown;
      if (name === "browser_navigate") {
        const target = String(args.url ?? "");
        if (!isAllowedNavigation(target, this.allowedOrigins, page.url())) throw new Error("Navegação fora dos ambientes autorizados.");
        await page.goto(new URL(target, page.url()).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
        output = await this.observe();
      } else if (name === "browser_navigate_test_data") {
        const key = String(args.key ?? "").trim();
        const target = this.input.testData?.[key];
        if (!key || !target) throw new Error(`Massa de teste '${key}' não foi parametrizada.`);
        if (!isAllowedNavigation(target, this.allowedOrigins, page.url())) throw new Error("A URL parametrizada está fora dos ambientes autorizados.");
        event.arguments = { key, url: "[REDACTED]" };
        await page.goto(new URL(target, page.url()).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
        output = { key, ...(await this.observe() as Record<string, unknown>) };
      } else if (name === "browser_observe") {
        output = await this.observe();
      } else if (name === "browser_inspect_page") {
        output = await this.inspectPage(args.query);
      } else if (name === "browser_login") {
        output = await this.deterministicLogin(args.environmentName);
      } else if (name === "browser_new_session") {
        await this.context?.close();
        this.context = undefined;
        this.page = undefined;
        output = await this.deterministicLogin(args.environmentName);
      } else if (name === "browser_new_session_test_data") {
        const usernameKey = String(args.usernameKey ?? "").trim();
        const passwordKey = String(args.passwordKey ?? "").trim();
        const username = this.input.testData?.[usernameKey];
        const password = this.input.testData?.[passwordKey];
        if (!username || !password) throw new Error("Dados da segunda conta não estão disponíveis.");
        await this.context?.close();
        this.context = undefined;
        this.page = undefined;
        event.arguments = { environmentName: args.environmentName, usernameKey, passwordKey, credentials: "[REDACTED]" };
        output = await this.deterministicLogin(args.environmentName, username, password);
      } else if (name === "browser_click") {
        const locator = await this.locatorWithSemanticRecovery(page, args.ref);
        const label = await locator.getAttribute("aria-label") || await locator.evaluate(element => {
          const input = element as HTMLInputElement;
          return input.labels?.[0]?.innerText || element.textContent || "";
        }).catch(() => "");
        if (DESTRUCTIVE_ACTION.test(label)) throw new Error("Ação destrutiva bloqueada pelo piloto.");
        const type = await locator.getAttribute("type");
        const role = await locator.getAttribute("role");
        let actionType = "click";
        if (type === "checkbox" || type === "radio") {
          // A repeated generic click must never undo an acceptance that was
          // already established by a previous agent iteration.
          await locator.check({ timeout: 15_000 });
          actionType = "check";
        } else if (role === "checkbox" || role === "radio") {
          if (await locator.getAttribute("aria-checked") !== "true") await locator.click({ timeout: 15_000 });
          actionType = "check";
        } else {
          await this.clickWithUiRecovery(page, locator);
        }
        await page.waitForTimeout(400);
        output = { action: { type: actionType, label: String(label).trim().slice(0, 160) }, ...(await this.observe() as Record<string, unknown>) };
      } else if (name === "browser_click_semantic") {
        const label = String(args.label ?? "").trim();
        if (!label || DESTRUCTIVE_ACTION.test(label)) throw new Error("Ação semântica inválida ou destrutiva.");
        const locator = await this.firstVisible(this.semanticCandidates(page, label));
        if (!locator) throw new Error(`Elemento '${label}' não encontrado semanticamente.`);
        await this.clickWithUiRecovery(page, locator);
        await page.waitForTimeout(400);
        output = { action: { type: "click", label }, ...(await this.observe() as Record<string, unknown>) };
      } else if (name === "browser_check") {
        const locator = await this.locatorWithSemanticRecovery(page, args.ref);
        const label = await locator.getAttribute("aria-label") || await locator.evaluate(element => {
          const input = element as HTMLInputElement;
          return input.labels?.[0]?.innerText || element.textContent || "";
        }).catch(() => "");
        const type = await locator.getAttribute("type");
        const role = await locator.getAttribute("role");
        if (type === "checkbox" || type === "radio") {
          await locator.check({ timeout: 15_000 });
          if (!await locator.isChecked()) throw new Error("O controle não permaneceu marcado.");
        } else if (role === "checkbox" || role === "radio") {
          if (await locator.getAttribute("aria-checked") !== "true") await locator.click({ timeout: 15_000 });
          if (await locator.getAttribute("aria-checked") !== "true") throw new Error("O controle customizado não confirmou o estado marcado.");
        } else {
          throw new Error("O elemento indicado não é um checkbox ou radio selecionável.");
        }
        await page.waitForTimeout(200);
        output = { action: { type: "check", label: String(label).trim().slice(0, 160) }, checked: true, ...(await this.observe() as Record<string, unknown>) };
      } else if (name === "browser_check_semantic") {
        const label = String(args.label ?? "").trim();
        const locator = await this.firstVisible([
          page.getByRole("checkbox", { name: label, exact: false }),
          page.getByRole("radio", { name: label, exact: false }),
          page.getByLabel(label, { exact: false }),
        ]);
        if (!locator) throw new Error(`Controle '${label}' não encontrado semanticamente.`);
        const type = await locator.getAttribute("type");
        if (type === "checkbox" || type === "radio") await locator.check({ timeout: 15_000 });
        else if (await locator.getAttribute("aria-checked") !== "true") await locator.click({ timeout: 15_000 });
        const checked = type === "checkbox" || type === "radio"
          ? await locator.isChecked()
          : await locator.getAttribute("aria-checked") === "true";
        if (!checked) throw new Error("O controle não permaneceu marcado.");
        output = { action: { type: "check", label }, checked: true, ...(await this.observe() as Record<string, unknown>) };
      } else if (name === "browser_fill") {
        const value = String(args.value ?? "");
        const locator = await this.locatorWithSemanticRecovery(page, args.ref);
        const label = await locator.getAttribute("aria-label") || await locator.getAttribute("placeholder") || await locator.getAttribute("name") || "campo";
        await locator.fill(value, { timeout: 15_000 });
        output = { filled: true, ref: args.ref, action: { type: "fill", label: String(label).trim().slice(0, 160), value: value.slice(0, 160) } };
      } else if (name === "browser_fill_semantic") {
        const label = String(args.label ?? "").trim();
        const value = String(args.value ?? "");
        const candidates = [page.getByLabel(label, { exact: true }), page.getByPlaceholder(label, { exact: true }), page.locator(`[name="${label.replace(/["\\]/g, "")}"]`)];
        let locator = candidates[0].first();
        for (const candidate of candidates) {
          if (await candidate.count() && await candidate.first().isVisible().catch(() => false)) {
            locator = candidate.first(); break;
          }
        }
        await locator.fill(value, { timeout: 15_000 });
        output = { action: { type: "fill", label, value: value.slice(0, 160) }, ...(await this.observe() as Record<string, unknown>) };
      } else if (name === "browser_fill_test_data") {
        const key = String(args.key ?? "").trim();
        const value = this.input.testData?.[key];
        if (!key || value == null) throw new Error(`Massa de teste '${key}' não foi parametrizada.`);
        const locator = await this.locatorWithSemanticRecovery(page, args.ref);
        const label = await locator.getAttribute("aria-label") || await locator.getAttribute("placeholder") || await locator.getAttribute("name") || "campo";
        await locator.fill(value, { timeout: 15_000 });
        event.arguments = { ref: args.ref, key, value: "[REDACTED]" };
        output = { filled: true, ref: args.ref, key, action: { type: "fill_test_data", label: String(label).trim().slice(0, 160), key, value: "[REDACTED]" } };
      } else if (name === "browser_fill_test_data_semantic") {
        const key = String(args.key ?? "").trim();
        const label = String(args.label ?? "").trim();
        const value = this.input.testData?.[key];
        if (!key || value == null) throw new Error(`Massa de teste '${key}' não foi parametrizada.`);
        const locator = await this.firstVisible(this.semanticCandidates(page, label));
        if (!locator) throw new Error(`Campo '${label}' não foi reencontrado semanticamente.`);
        await locator.fill(value, { timeout: 15_000 });
        event.arguments = { label, key, value: "[REDACTED]" };
        output = { filled: true, key, action: { type: "fill_test_data", label, key, value: "[REDACTED]" } };
      } else if (name === "browser_fill_visible_form") {
        output = await this.fillVisibleKnownForm();
      } else if (name === "browser_submit_form") {
        output = await this.submitVisibleForm();
      } else if (name === "resolve_blocker") {
        const objective = String(args.objective ?? "").trim();
        const requestedCategory = String(args.category ?? "UI_STATE") as BlockerCategory;
        const inferredCategory = classifyBlocker({
          id: "RESOLUTION",
          keyword: "DADO",
          text: objective,
          sourceLine: objective,
        }, objective);
        const hasStrongDomainSignal = /captcha|otp|vpn|conex[aã]o|perfil|permiss[aã]o|segundo usu[aá]rio|sess[aã]o|login|credencial|mais de \d+|massa|vencid|expirad|rascunho|arquivo ass[ií]ncrono|rotina agendada|scheduler/i.test(objective);
        const category = hasStrongDomainSignal ? inferredCategory : requestedCategory;
        event.arguments = { ...event.arguments, requestedCategory, category };
        output = await this.resolveBlocker(
          category,
          objective,
          args.environmentName ? String(args.environmentName) : undefined,
        );
      } else if (name === "provision_test_state") {
        output = await this.provisionTestState(
          String(args.action ?? "PREPARE_STATE") as QaProvisioningAction,
          String(args.objective ?? "").trim(),
          args.category ? String(args.category) : undefined,
          args.environmentName ? String(args.environmentName) : undefined,
        );
      } else if (name === "browser_capture_field_test_data") {
        const key = String(args.key ?? "").trim().slice(0, 80);
        if (!key) throw new Error("Informe a chave para capturar o dado.");
        const locator = await this.locatorWithSemanticRecovery(page, args.ref);
        const value = String(await locator.getAttribute("value") || await locator.textContent() || "").trim().slice(0, 2_000);
        if (!value) throw new Error("O campo indicado não possui valor capturável.");
        this.input.testData ??= {};
        this.input.testData[key] = value;
        event.arguments = { ref: args.ref, key, value: "[REDACTED]" };
        output = { captured: true, key, characters: value.length };
      } else if (name === "browser_capture_link_test_data") {
        const key = String(args.key ?? "").trim().slice(0, 80);
        const label = String(args.label ?? "").trim().slice(0, 200);
        const locator = await this.firstVisible([page.getByRole("link", { name: label, exact: false }), page.getByText(label, { exact: false })]);
        if (!key || !locator) throw new Error("Link capturável não encontrado.");
        const href = await locator.getAttribute("href");
        if (!href) throw new Error("O elemento não expõe um link.");
        const resolved = new URL(href, page.url()).toString();
        if (!isAllowedNavigation(resolved, this.allowedOrigins, page.url())) throw new Error("Link capturado fora dos ambientes autorizados.");
        this.input.testData ??= {};
        this.input.testData[key] = resolved;
        event.arguments = { key, label, href: "[REDACTED]" };
        output = { captured: true, key, label };
      } else if (name === "browser_capture_text_test_data") {
        const key = String(args.key ?? "").trim().slice(0, 80);
        const query = String(args.query ?? "").trim().slice(0, 200);
        const locator = page.getByText(query, { exact: false }).first();
        if (!key || !query || !await locator.count() || !await locator.isVisible().catch(() => false)) {
          throw new Error("Texto capturável não encontrado.");
        }
        const container = locator.locator("..");
        const raw = await container.innerText().catch(() => locator.innerText());
        const value = capturedValue(raw, key, query);
        if (!value) throw new Error("O texto indicado não possui valor capturável.");
        this.input.testData ??= {};
        this.input.testData[key] = value;
        event.arguments = { key, query, value: "[REDACTED]" };
        output = { captured: true, key, characters: value.length };
      } else if (name === "browser_search_no_match") {
        const filterLabel = String(args.filterLabel ?? "").trim();
        if (filterLabel) {
          const filter = await this.firstVisible([
            page.getByRole("button", { name: filterLabel, exact: false }),
            page.getByRole("tab", { name: filterLabel, exact: false }),
            page.getByLabel(filterLabel, { exact: false }),
          ]);
          if (!filter) throw new Error(`Filtro '${filterLabel}' não encontrado ou invisível.`);
          await this.clickWithUiRecovery(page, filter);
        }
        const search = page.locator("input[type=search], input[placeholder*='buscar' i], input[placeholder*='pesquisar' i], input[aria-label*='buscar' i], input[aria-label*='pesquisar' i]").first();
        await search.waitFor({ state: "visible", timeout: 15_000 });
        const noMatchValue = this.input.testData?.TERMO_SEM_RESULTADO ?? "QA_SEM_RESULTADO_AUTOMACAO";
        await search.fill(noMatchValue);
        await search.press("Enter");
        await page.waitForTimeout(700);
        output = {
          action: { type: "search_no_match", ...(filterLabel ? { filter: filterLabel } : {}), value: "[SYNTHETIC_NO_MATCH]" },
          ...(await this.observe() as Record<string, unknown>),
        };
      } else if (name === "browser_click_and_download") {
        const label = String(args.label ?? "").trim();
        if (!label || DESTRUCTIVE_ACTION.test(label)) throw new Error("Ação de download inválida ou destrutiva.");
        const locator = await this.firstVisible(this.semanticCandidates(page, label));
        if (!locator) throw new Error(`Controle de download '${label}' não encontrado.`);
        const downloadPromise = page.waitForEvent("download", { timeout: 20_000 });
        await locator.click({ timeout: 15_000 });
        const download = await downloadPromise;
        await fs.mkdir(this.input.outputDirectory, { recursive: true });
        const suggested = safeFilename(download.suggestedFilename().replace(/\.[^.]+$/, ""));
        const extension = path.extname(download.suggestedFilename()).slice(0, 12);
        const filepath = path.join(this.input.outputDirectory, `${safeFilename(this.input.scenarioId)}-${suggested}${extension}`);
        await download.saveAs(filepath);
        const stat = await fs.stat(filepath);
        this.evidence.push(filepath);
        output = {
          action: { type: "download", label },
          downloaded: true,
          filename: path.basename(filepath),
          bytes: stat.size,
          filepath,
          ...(await this.observe() as Record<string, unknown>),
        };
      } else if (name === "browser_select") {
        const locator = await this.locatorWithSemanticRecovery(page, args.ref);
        const label = await locator.getAttribute("aria-label") || await locator.getAttribute("name") || "campo";
        const value = String(args.value ?? "");
        const options = await locator.locator("option").evaluateAll(items => items.map(item => ({
          value: (item as HTMLOptionElement).value,
          label: (item.textContent || "").trim(),
        })));
        const normalize = (item: string) => item.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        const wanted = normalize(value);
        const match = options.find(item => normalize(item.value) === wanted || normalize(item.label) === wanted)
          ?? options.find(item => normalize(item.label).includes(wanted));
        if (!match) throw new Error(`Opção '${value}' não encontrada. Opções disponíveis: ${options.map(item => item.label).filter(Boolean).slice(0, 20).join(", ")}`);
        await locator.selectOption(match.value, { timeout: 6_000 });
        output = { action: { type: "select", label, value: match.value, selectedLabel: match.label }, ...(await this.observe() as Record<string, unknown>) };
      } else if (name === "browser_select_semantic") {
        const label = String(args.label ?? "").trim();
        const value = String(args.value ?? "");
        const locator = page.getByLabel(label, { exact: true }).first();
        await locator.selectOption(value, { timeout: 15_000 });
        output = { action: { type: "select", label, value }, ...(await this.observe() as Record<string, unknown>) };
      } else if (name === "browser_press") {
        await page.keyboard.press(String(args.key ?? "Enter"));
        await page.waitForTimeout(300);
        output = await this.observe();
      } else if (name === "browser_back") {
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 30_000 });
        output = await this.observe();
      } else if (name === "browser_wait") {
        const milliseconds = Math.min(5_000, Math.max(100, Number(args.milliseconds ?? 500)));
        await page.waitForTimeout(milliseconds);
        output = await this.observe();
      } else if (name === "browser_screenshot") {
        await fs.mkdir(this.input.outputDirectory, { recursive: true });
        const filename = `${safeFilename(this.input.scenarioId)}-${this.evidence.length + 1}.png`;
        const filepath = path.join(this.input.outputDirectory, filename);
        await page.screenshot({ path: filepath, fullPage: true });
        this.evidence.push(filepath);
        output = { saved: true, filepath };
      } else if (name === "finish") {
        const status = String(args.status ?? "ERRO_AUTOMACAO") as QaPilotStatus;
        if (!["PASSOU", "FALHOU", "BLOQUEADO", "ERRO_AUTOMACAO"].includes(status)) {
          throw new Error("Status final inválido.");
        }
        this.final = {
          status,
          summary: String(args.summary ?? "").slice(0, 2_000),
          evidence: [...this.evidence],
          missingPreconditions: Array.isArray(args.missingPreconditions)
            ? args.missingPreconditions.map(String).slice(0, 20) : [],
          observedResult: String(args.observedResult ?? "").slice(0, 4_000),
          steps: Array.isArray(args.steps) ? args.steps as QaScenarioStepResult[] : [],
        };
        output = this.final;
      } else {
        throw new Error(`Ferramenta desconhecida: ${name}`);
      }
      if (UI_MUTATING_TOOLS.has(name) && output && typeof output === "object" && !Array.isArray(output) &&
        !("elements" in output)) {
        output = { ...(output as Record<string, unknown>), ...(await this.observe() as Record<string, unknown>) };
      }
      event.ok = true;
      event.result = boundedResult(output);
      return { output, ...(this.final ? { final: this.final } : {}) };
    } catch (error) {
      const category = classifyAutomationError(error);
      const output = {
        error: error instanceof Error ? error.message : String(error),
        category,
        recoverable: true,
        recovery: category === "AUTHENTICATION"
          ? "Observe o estado atual antes de repetir login; a sessão pode já estar autenticada."
          : category === "UI_OVERLAY"
            ? "Interaja com o modal/overlay visível ou feche-o de forma segura, reobserve e tente novamente."
            : "Observe novamente a página e tente a mesma intenção com a referência atual ou com um seletor semântico. Não classifique uma falha isolada de ferramenta como bloqueio funcional.",
      };
      event.result = output;
      return { output };
    } finally {
      event.durationMs = Date.now() - started;
      this.trace.push(event);
    }
  }

  getTrace() { return [...this.trace]; }

  async close() {
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
  }
}

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
    await fs.writeFile(traceFile, JSON.stringify({ ...result, approvedRecipe: true }, null, 2), "utf8");
    return result;
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
        verifier = { accepted: false, reason: `Verificador indisponível: ${error instanceof Error ? error.message : String(error)}` };
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
    await fs.writeFile(traceFile, JSON.stringify(result, null, 2), "utf8");
    return result;
  } finally {
    await runtime.close();
  }
}
