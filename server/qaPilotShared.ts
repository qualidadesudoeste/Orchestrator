import type { BlockerCategory } from "./automation-v2";

export const MAX_OBSERVATION_TEXT = 1_200;
const MAX_TOOL_RESULT_TEXT = 6_000;

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
  if (serialized.length <= MAX_TOOL_RESULT_TEXT) return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
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
    if (
      observation.url ||
      observation.title ||
      Array.isArray(observation.elements)
    ) {
      return {
        truncated: true,
        action: observation.action,
        url: observation.url,
        title: observation.title,
        text: String(observation.text ?? "").slice(0, MAX_OBSERVATION_TEXT),
        elements: (Array.isArray(observation.elements)
          ? observation.elements
          : []
        )
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
        console: Array.isArray(observation.console)
          ? observation.console.slice(-5)
          : [],
        networkFailures: Array.isArray(observation.networkFailures)
          ? observation.networkFailures.slice(-5)
          : [],
      };
    }
  }
  return {
    truncated: true,
    preview: serialized.slice(0, MAX_TOOL_RESULT_TEXT),
  };
}
