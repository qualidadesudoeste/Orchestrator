import type { BlockerCategory } from "./automation-v2";

export const MAX_OBSERVATION_TEXT = 1_200;
const MAX_TOOL_RESULT_TEXT = 6_000;
// A browser map can contain 80 actionable controls. The generic 6 KB preview
// cannot represent that map together with frames, tabs and table evidence.
export const MAX_BROWSER_TOOL_RESULT_TEXT = 64_000;

type ToolResultObject = Record<string, unknown>;

const BROWSER_RESULT_KEYS = new Set([
  "action", "uploaded", "downloaded", "filename", "mimeType", "bytes",
  "visibleConfirmation", "filled", "checked", "ref", "key", "url", "title",
  "text", "query", "elements", "frames", "tabs", "tables", "console",
  "networkFailures", "category", "objective", "strategies", "attempts",
  "attempted", "changed", "resolved", "external", "requiresStepRetry",
]);

function isObject(value: unknown): value is ToolResultObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBrowserResult(value: ToolResultObject): boolean {
  return typeof value.url === "string" || typeof value.title === "string" ||
    ["elements", "frames", "tabs", "tables"].some(key => Array.isArray(value[key]));
}

function compactBrowserResult(value: ToolResultObject): unknown {
  // Reduce prose first, then samples of inspection evidence. Control references
  // and frame/tab identities survive every profile, including the last one.
  for (const stringLimit of [1_200, 300, 120, 60, 24, 8]) {
    const omitted: Record<string, number> = {};
    const sampleLimit = stringLimit >= 300 ? 50 : stringLimit >= 60 ? 10 : 2;
    const compact = (item: unknown, key: string, path: string, depth = 0): unknown => {
      if (typeof item === "string") {
        const minimum = key === "networkFailures" || key === "console" ? 400 :
          key === "url" || key === "frameUrl" ? 160 :
          ["name", "frameName", "label", "title", "caption"].includes(key) ? 80 : 0;
        const limit = key === "ref" ? 32 : Math.max(minimum, Math.min(stringLimit, key === "text" ? MAX_OBSERVATION_TEXT : 600));
        if (item.length > limit) omitted[path] = item.length - limit;
        return item.length > limit && (key === "networkFailures" || key === "console")
          ? `${item.slice(0, limit / 2 - 2)} … ${item.slice(-limit / 2 + 2)}`
          : item.slice(0, limit);
      }
      if (Array.isArray(item)) {
        const limit = key === "elements" ? 80 : stringLimit === 1_200 ? item.length : key === "frames" ? 20 : key === "tabs" ? 50 :
          key === "tables" ? 20 : key === "attempts" ? 12 :
          key === "console" || key === "networkFailures" ? 5 :
          key === "rows" || key === "sections" || key === "fields" ? sampleLimit :
          key === "headers" || key === "row" ? Math.min(40, sampleLimit) : 20;
        if (item.length > limit) omitted[path] = item.length - limit;
        const offset = key === "console" || key === "networkFailures" ? Math.max(0, item.length - limit) : 0;
        return item.slice(offset, offset + limit).map((child, index) =>
          compact(child, key === "rows" ? "row" : key, `${path}[${offset + index}]`, depth + 1));
      }
      if (isObject(item)) {
        if (depth > 6) {
          omitted[path] = 1;
          return {};
        }
        const result: ToolResultObject = {};
        const entries = Object.entries(item);
        for (const [childKey, child] of entries.slice(0, 30)) {
          // The map describes controls, not the possibly confidential data
          // entered into them. State such as checked/disabled remains useful.
          if (key === "elements" && childKey === "value") continue;
          result[childKey] = compact(child, childKey, `${path}.${childKey}`, depth + 1);
        }
        if (entries.length > 30) omitted[`${path}.properties`] = entries.length - 30;
        return result;
      }
      return item;
    };

    const result: ToolResultObject = { truncated: true };
    for (const [key, item] of Object.entries(value)) {
      if (BROWSER_RESULT_KEYS.has(key)) result[key] = compact(item, key, key);
    }
    // A bounded list of paths keeps truncation metadata from outgrowing the
    // evidence itself. Counts always describe omitted items or characters.
    const paths = Object.entries(omitted);
    result.truncation = {
      originalCharacters: JSON.stringify(value).length,
      maxCharacters: MAX_BROWSER_TOOL_RESULT_TEXT,
      paths: Object.fromEntries(paths.slice(0, 20)),
      additionalPaths: Math.max(0, paths.length - 20),
      guidance: "Conteúdo parcial: use inspeção com query específica antes de concluir que um item está ausente.",
    };
    if (JSON.stringify(result).length <= MAX_BROWSER_TOOL_RESULT_TEXT) return result;
  }
  // Browser runtime outputs use the bounded structures above. For unexpected
  // nested extension payloads, preserve the actionable map and identities while
  // limiting inspection samples once more instead of producing invalid JSON.
  let result: ToolResultObject = {};
  for (const identityLimit of [64, 32, 16, 0]) {
    result = { truncated: true };
    const collections: ToolResultObject = {};
    for (const [key, limit] of [["elements", 80], ["frames", 20], ["tabs", 50], ["tables", 20]] as const) {
      if (!Array.isArray(value[key])) continue;
      const items = value[key].slice(0, limit);
      collections[key] = { total: value[key].length, kept: items.length };
      result[key] = items.map(item => {
        const record = isObject(item) ? item : {};
        const summary: ToolResultObject = {};
        for (const field of ["ref", "name", "frameName", "url", "frameUrl", "title", "caption"]) {
          if (typeof record[field] !== "string" || (identityLimit === 0 && field !== "ref")) continue;
          const stringBudget = field === "ref" ? 32 : identityLimit;
          let text = record[field].slice(0, stringBudget);
          // Escaped characters also consume the JSON budget. Valid e1..e80
          // references fit unchanged, even in the minimal identity profile.
          while (JSON.stringify(text).length > stringBudget + 2) text = text.slice(0, -1);
          summary[field] = text;
        }
        for (const field of ["index", "frameIndex", "tableIndex", "totalVisibleRows"]) {
          if (typeof record[field] === "number") summary[field] = record[field];
        }
        for (const field of ["checked", "disabled", "active", "main"]) {
          if (typeof record[field] === "boolean") summary[field] = record[field];
        }
        return summary;
      });
    }
    result.truncation = {
      originalCharacters: JSON.stringify(value).length,
      maxCharacters: MAX_BROWSER_TOOL_RESULT_TEXT,
      extremeSummary: true,
      identityStringLimit: identityLimit,
      collections,
      guidance: "Somente identidades preservadas: resposta excedeu o limite; repita a inspeção com query específica.",
    };
    if (JSON.stringify(result).length <= MAX_BROWSER_TOOL_RESULT_TEXT) return result;
  }
  // The zero-text profile contains at most 170 fixed-size identity records.
  return result;
}

export function classifyAutomationError(
  error: unknown
):
  | "STALE_ELEMENT"
  | "UI_OVERLAY"
  | "AUTHENTICATION"
  | "NETWORK"
  | "TIMEOUT"
  | "UNKNOWN" {
  const message = String(
    error instanceof Error ? error.message : error
  ).toLowerCase();
  if (
    /data-qa-pilot-ref|refer[eê]ncia|element.*(?:mudou|detached|not attached|n[aã]o.*dispon)/i.test(
      message
    )
  )
    return "STALE_ELEMENT";
  if (/intercepts pointer events|dialog-mask|overlay|modal/i.test(message))
    return "UI_OVERLAY";
  if (/login|senha|password|credencia|autentic/i.test(message))
    return "AUTHENTICATION";
  if (/net::|econn|dns|network|conex[aã]o|connection/i.test(message))
    return "NETWORK";
  if (/timeout|tempo limite/i.test(message)) return "TIMEOUT";
  return "UNKNOWN";
}

export function automationErrorRecoveryCategory(
  error: unknown
): BlockerCategory {
  switch (classifyAutomationError(error)) {
    case "AUTHENTICATION":
      return "AUTH_SESSION";
    case "NETWORK":
      return "NETWORK";
    case "STALE_ELEMENT":
    case "UI_OVERLAY":
    case "TIMEOUT":
    case "UNKNOWN":
      return "UI_STATE";
  }
}

export function boundedResult(value: unknown): unknown {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return value;
  if (serialized.length <= MAX_TOOL_RESULT_TEXT) return value;
  if (isObject(value)) {
    if (value.truncated === true && isObject(value.truncation) &&
      value.truncation.maxCharacters === MAX_BROWSER_TOOL_RESULT_TEXT && serialized.length <= MAX_BROWSER_TOOL_RESULT_TEXT) return value;
    if (isBrowserResult(value)) return compactBrowserResult(value);
    const observation = value as Record<string, any>;
    if (
      typeof observation.category === "string" &&
      Array.isArray(observation.attempts)
    ) {
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
  }
  return {
    truncated: true,
    preview: serialized.slice(0, MAX_TOOL_RESULT_TEXT),
  };
}
