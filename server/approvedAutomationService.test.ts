import { describe, expect, it } from "vitest";
import {
  approvedRecipeLearning,
  createApprovedAutomationRecipe,
  findApprovedAutomationRecipe,
  legacyScenarioFingerprint,
  migrateLegacyApprovedRecipe,
  scenarioFingerprint,
} from "./approvedAutomationService";
import type { QaPilotResult, QaPilotTraceEvent } from "./qaPilotAgent";

const gherkin = "Cenário: Buscar\nDado que estou autenticado\nQuando pesquiso X\nEntão vejo X";

function event(tool: string, result: unknown, args: Record<string, unknown> = {}): QaPilotTraceEvent {
  return { iteration: 1, tool, arguments: args, startedAt: new Date().toISOString(), durationMs: 1, ok: true, result };
}

function successfulResult(): QaPilotResult {
  return {
    runId: "run-1", scenarioId: "CT-1",
    plan: { objective: "Buscar", steps: [], successCriteria: [], requiredData: [], risks: [] },
    scenarioContract: [],
    final: { status: "PASSOU", summary: "ok", evidence: ["x.png"], missingPreconditions: [], observedResult: "X", steps: [] },
    verifier: { accepted: true, reason: "confirmado", correctedStatus: "PASSOU" },
    iterations: 3, usage: { calls: 3, promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    traceFile: "trace.json",
    trace: [
      event("browser_login", { authenticated: true }),
      event("browser_click", { action: { type: "click", label: "Pesquisar" } }, { ref: "e2" }),
      event("browser_check", { action: { type: "check", label: "Aceito a LGPD" }, checked: true }, { ref: "e5" }),
      event("browser_fill", { action: { type: "fill", label: "Busca", value: "X" } }, { ref: "e3", value: "X" }),
      event("browser_fill", { action: { type: "fill", label: "Senha", value: "segredo" } }, { ref: "e4", value: "segredo" }),
      event("browser_screenshot", { saved: true }),
    ],
  };
}

describe("receitas de automação aprovadas", () => {
  it("converte somente ações reaproveitáveis e nunca persiste senha", () => {
    const recipe = createApprovedAutomationRecipe({ result: successfulResult(), gherkin, title: "Buscar", executionId: "run-1" });
    expect(recipe?.actions.map(action => action.tool)).toEqual([
      "browser_login", "browser_click_semantic", "browser_check_semantic", "browser_fill_semantic",
    ]);
    expect(JSON.stringify(recipe)).not.toContain("segredo");
  });

  it("localiza apenas a receita da mesma versão e do mesmo Gherkin", () => {
    const recipe = createApprovedAutomationRecipe({ result: successfulResult(), gherkin, title: "Buscar", executionId: "run-1" })!;
    const learning = approvedRecipeLearning({
      scopeKey: "scope", projectName: "Projeto", systemHost: "example.test",
    }, recipe);
    expect(findApprovedAutomationRecipe([learning], gherkin)).toEqual(recipe);
    expect(findApprovedAutomationRecipe([learning], `${gherkin}\nE vejo detalhes`)).toBeUndefined();
    expect(learning.fingerprint).toHaveLength(64);
    expect(recipe.scenarioFingerprint).toBe(scenarioFingerprint(gherkin));
  });

  it("mantém o fingerprint quando mudam apenas título, comentário ou ID", () => {
    const decorated = [
      "# observação editorial",
      "Cenário: Outro título",
      "Dado que estou autenticado",
      "Quando pesquiso X",
      "Então vejo X",
      "# ID: CT-999 | Tipo: Regressão",
    ].join("\n");
    expect(scenarioFingerprint(decorated)).toBe(scenarioFingerprint(gherkin));
    expect(legacyScenarioFingerprint(decorated)).not.toBe(legacyScenarioFingerprint(gherkin));
  });

  it("migra receita legada somente após validar o Gherkin persistido da origem", () => {
    const recipe = createApprovedAutomationRecipe({ result: successfulResult(), gherkin, title: "Buscar", executionId: "run-1" })!;
    const legacyRecipe = { ...recipe, scenarioFingerprint: legacyScenarioFingerprint(gherkin) };
    const current = gherkin.replace("Cenário: Buscar", "Cenário: Busca atualizada");
    expect(migrateLegacyApprovedRecipe(legacyRecipe, current, gherkin)?.scenarioFingerprint)
      .toBe(scenarioFingerprint(current));
    expect(migrateLegacyApprovedRecipe(legacyRecipe, `${current}\nE vejo detalhes`, gherkin))
      .toBeUndefined();
  });

  it("não aprova receita de uma execução falha", () => {
    const result = successfulResult();
    result.final.status = "FALHOU";
    expect(createApprovedAutomationRecipe({ result, gherkin, title: "Buscar", executionId: "run-1" })).toBeUndefined();
  });
});
