import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import {
  classifyBlocker,
  requestQaProvisioning,
  strategiesForBlocker,
  type BlockerCategory,
  type QaProvisioningAction,
} from "./automation-v2";
import { safeErrorMessage, sanitizeSensitiveData, type SensitiveDataContext } from "./_core/sensitiveData";
import { boundedResult, classifyAutomationError, MAX_OBSERVATION_TEXT } from "./qaPilotShared";
import type {
  QaPilotFinal,
  QaPilotInput,
  QaPilotStatus,
  QaPilotToolRuntime,
  QaPilotTraceEvent,
  QaScenarioStepResult,
  ToolExecution,
} from "./qaPilotAgent";
import { isExternalAccessBlock } from "./accessBlockPolicy";

export { isExternalAccessBlock } from "./accessBlockPolicy";

const DESTRUCTIVE_ACTION = /\b(excluir|remover|apagar|deletar|delete|remove|encerrar processo|cancelar processo)\b/i;
const UI_MUTATING_TOOLS = new Set([
  "browser_click", "browser_click_semantic", "browser_check", "browser_check_semantic",
  "browser_fill", "browser_fill_semantic", "browser_fill_test_data", "browser_fill_test_data_semantic",
  "browser_fill_visible_form", "browser_submit_form", "browser_select", "browser_select_semantic",
  "browser_press", "browser_back", "browser_search_no_match", "browser_click_and_download",
]);

const PLAYWRIGHT_KEY_NAMES: Record<string, string> = {
  ALT: "Alt",
  ARROWDOWN: "ArrowDown",
  ARROWLEFT: "ArrowLeft",
  ARROWRIGHT: "ArrowRight",
  ARROWUP: "ArrowUp",
  BACKSPACE: "Backspace",
  CONTROL: "Control",
  CTRL: "Control",
  DELETE: "Delete",
  END: "End",
  ENTER: "Enter",
  ESC: "Escape",
  ESCAPE: "Escape",
  HOME: "Home",
  INSERT: "Insert",
  META: "Meta",
  PAGEDOWN: "PageDown",
  PAGEUP: "PageUp",
  SHIFT: "Shift",
  SPACE: "Space",
  TAB: "Tab",
};

export function normalizePlaywrightKey(value: unknown): string {
  const raw = String(value ?? "Enter").trim() || "Enter";
  return raw.split("+").map(part => {
    const token = part.trim();
    return PLAYWRIGHT_KEY_NAMES[token.toUpperCase()] ?? token;
  }).join("+");
}

function safeFilename(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "cenario";
}

function isAllowedNavigation(target: string, allowedOrigins: Set<string>, currentUrl?: string): boolean {
  try { return allowedOrigins.has(new URL(target, currentUrl).origin); }
  catch { return false; }
}

function capturedValue(raw: string, key: string, label: string): string {
  const source = raw.replace(/\s+/g, " ").trim();
  if (/LINK|URL/.test(key)) return source.match(/https?:\/\/[^\s]+/i)?.[0] ?? source;
  if (/EMAIL|CONTATO/.test(key)) return source.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] ?? source;
  if (/CPF/.test(key)) return source.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)?.[0] ?? source;
  if (/TELEFONE/.test(key)) return source.match(/\(?\d{2}\)?\s?\d{4,5}-?\d{4}/)?.[0] ?? source;
  const escaped = label.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
  return source.replace(new RegExp("^.*?" + escaped + "\\s*[:#-]?\\s*", "i"), "").trim().slice(0, 2_000) || source.slice(0, 2_000);
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
  private readonly refDescriptors = new Map<string, { name: string; context: string; role: string; tag: string; type: string }>();
  private final?: QaPilotFinal;
  private readonly allowedOrigins: Set<string>;

  constructor(private readonly input: QaPilotInput) {
    this.allowedOrigins = new Set(input.environments.map(item => new URL(item.url).origin));
  }

  private sensitiveContext(): SensitiveDataContext {
    const knownValues: Record<string, unknown> = { ...(this.input.testData ?? {}) };
    this.input.environments.forEach((environment, index) => {
      knownValues[`ENV_${index + 1}_USERNAME`] = environment.username;
      knownValues[`ENV_${index + 1}_PASSWORD`] = environment.password;
    });
    return { knownValues };
  }

  private sanitize<T>(value: T): T {
    return sanitizeSensitiveData(value, this.sensitiveContext());
  }

  private async ensurePage(): Promise<Page> {
    if (this.page) return this.page;
    const executablePath = process.env.PLAYWRIGHT_CHROME_EXECUTABLE_PATH?.trim();
    this.browser = await chromium.launch({
      ...(executablePath ? { executablePath } : { channel: "chrome" as const }),
      headless: this.input.headless ?? true,
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1440, height: 1000 },
      ignoreHTTPSErrors: false,
    });
    await this.context.route("**/*", async route => {
      const request = route.request();
      if (request.isNavigationRequest() && /^https?:/i.test(request.url()) &&
        !isAllowedNavigation(request.url(), this.allowedOrigins)) {
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
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
    const rawSnapshot = await page.evaluate(`(() => {
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
          context: (((element.closest("tr,[role=row],li") || element.parentElement) && (element.closest("tr,[role=row],li") || element.parentElement).innerText) || "").replace(/\\s+/g, " ").trim().slice(0, 160),
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
    this.captureReusableObservedData(rawSnapshot.text);
    for (const raw of rawSnapshot.elements) {
      const element = raw as { ref?: unknown; name?: unknown; context?: unknown; role?: unknown; tag?: unknown; type?: unknown };
      const ref = String(element.ref ?? "");
      if (ref) this.refDescriptors.set(ref, {
        name: String(element.name ?? "").trim(),
        context: String(element.context ?? "").trim(),
        role: String(element.role ?? "").trim(),
        tag: String(element.tag ?? "").trim(),
        type: String(element.type ?? "").trim(),
      });
    }
    return this.sanitize({
      url: page.url(),
      ...rawSnapshot,
      console: this.consoleMessages.slice(-10),
      networkFailures: this.networkFailures.slice(-10),
    });
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
    const blockedAfter = isExternalAccessBlock(after);
    return {
      category,
      objective: objective.slice(0, 500),
      strategies,
      attempts,
      attempted: attempts.some(item => item.strategy !== "REPORT_EXTERNAL_DEPENDENCY"),
      changed,
      resolved: category !== "EXTERNAL" && !blockedAfter && successfulAttempt && (
        changed || category === "AUTH_SESSION" || category === "NETWORK" || category === "SIMPLE_DATA"
      ),
      external: category === "EXTERNAL" || blockedAfter,
      requiresStepRetry: category !== "EXTERNAL" && !blockedAfter,
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
    await page.waitForFunction(
      loginPath => {
        const field = document.querySelector('input[type="password"]');
        const visible = field instanceof HTMLElement && Boolean(field.offsetWidth || field.offsetHeight || field.getClientRects().length);
        return location.pathname !== loginPath || !visible;
      },
      loginUrl.pathname,
      { timeout: 15_000 },
    ).catch(() => undefined);
    const passwordStillVisible = await password.isVisible().catch(() => false);
    const currentAfterSubmit = new URL(page.url());
    if (passwordStillVisible && currentAfterSubmit.pathname === loginUrl.pathname) {
      throw new Error("O formulário de login permaneceu visível após o envio.");
    }
    this.authenticatedOrigins.add(loginUrl.origin);
    return { authenticated: true, url: page.url(), title: await page.title() };
  }

  async execute(name: string, args: Record<string, unknown>, iteration: number): Promise<ToolExecution> {
    const started = Date.now();
    const event: QaPilotTraceEvent = {
      iteration,
      tool: name,
      arguments: this.sanitize(args),
      startedAt: new Date(started).toISOString(),
      durationMs: 0,
      ok: false,
      result: null,
    };
    try {
      const page = await this.ensurePage();
      const signature = `${name}|${JSON.stringify(this.sanitize(args))}|${page.url()}`;
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
        const descriptor = this.refDescriptors.get(String(args.ref ?? ""));
        const directLabel = await locator.getAttribute("aria-label") || await locator.getAttribute("title") || await locator.evaluate(element => {
          const input = element as HTMLInputElement;
          return input.labels?.[0]?.innerText || element.textContent || "";
        }).catch(() => "");
        const label = directLabel || descriptor?.context || "";
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
          const beforeClick = `${page.url()}|${(await page.locator("body").innerText().catch(() => "")).slice(0, 4_000)}`;
          await this.clickWithUiRecovery(page, locator);
          await page.waitForTimeout(800);
          const afterClick = `${page.url()}|${(await page.locator("body").innerText().catch(() => "")).slice(0, 4_000)}`;
          if (!String(directLabel).trim() && beforeClick === afterClick) {
            throw new Error("Clique em controle sem identificação não produziu mudança observável. Reobserve a tela e escolha um controle com rótulo ou contexto de linha.");
          }
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
          filename: download.suggestedFilename(),
          artifactFilename: path.basename(filepath),
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
        const key = normalizePlaywrightKey(args.key);
        event.arguments = { key };
        await page.keyboard.press(key);
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
        this.final = this.sanitize({
          status,
          summary: String(args.summary ?? "").slice(0, 2_000),
          evidence: [...this.evidence],
          missingPreconditions: Array.isArray(args.missingPreconditions)
            ? args.missingPreconditions.map(String).slice(0, 20) : [],
          observedResult: String(args.observedResult ?? "").slice(0, 4_000),
          steps: Array.isArray(args.steps) ? args.steps as QaScenarioStepResult[] : [],
        });
        output = this.final;
      } else {
        throw new Error(`Ferramenta desconhecida: ${name}`);
      }
      if (UI_MUTATING_TOOLS.has(name) && output && typeof output === "object" && !Array.isArray(output) &&
        !("elements" in output)) {
        output = { ...(output as Record<string, unknown>), ...(await this.observe() as Record<string, unknown>) };
      }
      const safeOutput = this.sanitize(output);
      event.ok = true;
      event.result = boundedResult(safeOutput);
      return { output: safeOutput, ...(this.final ? { final: this.final } : {}) };
    } catch (error) {
      const category = classifyAutomationError(error);
      const output = {
        error: safeErrorMessage(error, this.sensitiveContext()),
        category,
        recoverable: true,
        recovery: category === "AUTHENTICATION"
          ? "Observe o estado atual antes de repetir login; a sessão pode já estar autenticada."
          : category === "UI_OVERLAY"
            ? "Interaja com o modal/overlay visível ou feche-o de forma segura, reobserve e tente novamente."
            : "Observe novamente a página e tente a mesma intenção com a referência atual ou com um seletor semântico. Não classifique uma falha isolada de ferramenta como bloqueio funcional.",
      };
      event.result = this.sanitize(output);
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
