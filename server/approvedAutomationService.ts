import crypto from "node:crypto";
import type { AgentMemoryLearning, AgentMemoryScope } from "./agentMemoryService";
import type { QaPilotResult, QaPilotTraceEvent } from "./qaPilotAgent";
import { compileSingleGherkinScenario } from "./automation-v2";

export const APPROVED_RECIPE_TITLE_PREFIX = "Receita aprovada:";
export const APPROVED_RECIPE_VERSION = 1;

export type ApprovedAutomationAction = {
  tool: "browser_navigate" | "browser_navigate_test_data" | "browser_login" | "browser_new_session" | "browser_click_semantic" |
    "browser_check_semantic" |
    "browser_fill_semantic" | "browser_select_semantic" |
    "browser_fill_test_data_semantic" | "browser_click_and_download" |
    "browser_fill_visible_form" | "browser_submit_form" |
    "browser_search_no_match" | "browser_press" | "browser_back" | "browser_wait";
  args: Record<string, string | number>;
};

export type ApprovedAutomationRecipe = {
  version: 1;
  scenarioFingerprint: string;
  scenarioId: string;
  scenarioTitle: string;
  sourceExecutionId: string;
  actions: ApprovedAutomationAction[];
};

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

export function scenarioFingerprint(gherkin: string): string {
  const scenario = compileSingleGherkinScenario(gherkin);
  const executableContract = scenario.steps.map(step => ({
    keyword: step.keyword,
    text: normalized(step.text),
  }));
  return crypto.createHash("sha256").update(JSON.stringify(executableContract)).digest("hex");
}

export function legacyScenarioFingerprint(gherkin: string): string {
  return crypto.createHash("sha256").update(normalized(gherkin)).digest("hex");
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function safeText(value: unknown, max = 300): string {
  return String(value ?? "").trim().slice(0, max);
}

function actionFromTrace(event: QaPilotTraceEvent): ApprovedAutomationAction | undefined {
  if (!event.ok) return undefined;
  const result = object(event.result);
  const action = object(result.action);
  switch (event.tool) {
    case "browser_navigate":
      return { tool: "browser_navigate", args: { url: safeText(event.arguments.url, 1_000) } };
    case "browser_navigate_test_data":
      return { tool: "browser_navigate_test_data", args: { key: safeText(event.arguments.key, 80) } };
    case "browser_login":
      return { tool: "browser_login", args: event.arguments.environmentName ? { environmentName: safeText(event.arguments.environmentName) } : {} };
    case "browser_new_session":
      return { tool: "browser_new_session", args: { environmentName: safeText(event.arguments.environmentName) } };
    case "browser_click": {
      const label = safeText(action.label);
      return label ? { tool: "browser_click_semantic", args: { label } } : undefined;
    }
    case "browser_check": {
      const label = safeText(action.label);
      return label ? { tool: "browser_check_semantic", args: { label } } : undefined;
    }
    case "browser_fill": {
      const label = safeText(action.label);
      const value = safeText(action.value);
      return label && value && value !== "[REDACTED]" && !/senha|password|token|secret|chave/i.test(label)
        ? { tool: "browser_fill_semantic", args: { label, value } } : undefined;
    }
    case "browser_fill_test_data": {
      const label = safeText(action.label);
      const key = safeText(action.key ?? event.arguments.key, 80);
      return label && key ? { tool: "browser_fill_test_data_semantic", args: { label, key } } : undefined;
    }
    case "browser_fill_visible_form":
      return { tool: "browser_fill_visible_form", args: {} };
    case "browser_submit_form":
      return { tool: "browser_submit_form", args: {} };
    case "browser_click_and_download": {
      const label = safeText(action.label ?? event.arguments.label);
      return label ? { tool: "browser_click_and_download", args: { label } } : undefined;
    }
    case "browser_select": {
      const label = safeText(action.label);
      const value = safeText(action.value ?? event.arguments.value);
      return label && value ? { tool: "browser_select_semantic", args: { label, value } } : undefined;
    }
    case "browser_search_no_match":
      return { tool: "browser_search_no_match", args: event.arguments.filterLabel ? { filterLabel: safeText(event.arguments.filterLabel) } : {} };
    case "browser_press":
      return { tool: "browser_press", args: { key: safeText(event.arguments.key, 80) } };
    case "browser_back":
      return { tool: "browser_back", args: {} };
    case "browser_wait":
      return { tool: "browser_wait", args: { milliseconds: Math.min(2_000, Number(event.arguments.milliseconds) || 500) } };
    default:
      return undefined;
  }
}

export function createApprovedAutomationRecipe(input: {
  result: QaPilotResult;
  gherkin: string;
  title: string;
  executionId: string;
}): ApprovedAutomationRecipe | undefined {
  if (input.result.final.status !== "PASSOU" || input.result.verifier?.accepted !== true) return undefined;
  if (input.result.trace.some(event => event.ok && event.tool.startsWith("browser_capture_"))) return undefined;
  const actions = input.result.trace.map(actionFromTrace).filter(Boolean) as ApprovedAutomationAction[];
  if (!actions.length || !actions.some(action => action.tool !== "browser_navigate" && action.tool !== "browser_login")) {
    return undefined;
  }
  return {
    version: APPROVED_RECIPE_VERSION,
    scenarioFingerprint: scenarioFingerprint(input.gherkin),
    scenarioId: input.result.scenarioId,
    scenarioTitle: input.title,
    sourceExecutionId: input.executionId,
    actions: actions.slice(0, 40),
  };
}

export function approvedRecipeLearning(
  scope: AgentMemoryScope,
  recipe: ApprovedAutomationRecipe,
): AgentMemoryLearning {
  const fingerprint = approvedRecipeMemoryFingerprint(scope.scopeKey, recipe.scenarioFingerprint);
  return {
    ...scope,
    externalExecutionId: recipe.sourceExecutionId,
    externalScenarioId: recipe.scenarioId,
    fingerprint,
    category: "AUTOMACAO",
    title: `${APPROVED_RECIPE_TITLE_PREFIX} ${recipe.scenarioFingerprint}`,
    content: JSON.stringify(recipe),
    confidence: 95,
  };
}

export function approvedRecipeMemoryFingerprint(scopeKey: string, recipeScenarioFingerprint: string): string {
  return crypto.createHash("sha256")
    .update(`${scopeKey}|approved-recipe|${recipeScenarioFingerprint}`)
    .digest("hex");
}

export function findApprovedAutomationRecipe(
  memories: Array<{ title: string; content: string; status?: string }>,
  gherkin: string,
): ApprovedAutomationRecipe | undefined {
  const expected = new Set([scenarioFingerprint(gherkin), legacyScenarioFingerprint(gherkin)]);
  for (const memory of memories) {
    if (!memory.title.startsWith(APPROVED_RECIPE_TITLE_PREFIX)) continue;
    try {
      const recipe = JSON.parse(memory.content) as ApprovedAutomationRecipe;
      if (recipe.version === APPROVED_RECIPE_VERSION &&
          expected.has(recipe.scenarioFingerprint) && Array.isArray(recipe.actions)) return recipe;
    } catch {
      // Memórias legadas ou corrompidas não impedem a execução inteligente.
    }
  }
  return undefined;
}
