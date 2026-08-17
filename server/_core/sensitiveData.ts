const REDACTED = "[REDACTED]";
const SENSITIVE_KEY =
  /(?:^|_)(?:authorization|api_?key|credential|password|senha|secret|token)(?:$|_)/i;

export type SensitiveDataContext = {
  knownValues?: Record<string, unknown>;
};

function marker(key: string): string {
  const normalized = key
    .replace(/[^a-z0-9_]+/gi, "_")
    .toUpperCase()
    .slice(0, 60);
  return normalized ? `[LOCAL:${normalized}]` : REDACTED;
}

function replacements(context?: SensitiveDataContext): Array<[string, string]> {
  return Object.entries(context?.knownValues ?? {})
    .map(
      ([key, value]) => [String(value ?? ""), marker(key)] as [string, string]
    )
    .filter(([value]) => value.length >= 3)
    .sort((left, right) => right[0].length - left[0].length);
}

export function sanitizeSensitiveText(
  value: string,
  context?: SensitiveDataContext
): string {
  let sanitized = value;
  for (const [knownValue, replacement] of replacements(context)) {
    sanitized = sanitized.split(knownValue).join(replacement);
  }
  return sanitized
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, `Bearer ${REDACTED}`)
    .replace(
      /([?&](?:authorization|api_?key|password|senha|secret|token)=)[^&#\s]+/gi,
      `$1${REDACTED}`
    )
    .replace(
      /\b(authorization|api[_-]?key|credential|password|senha|secret|token)\b\s*[:=]\s*["']?([^\s,"';}]+)/gi,
      `$1=${REDACTED}`
    )
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[REDACTED_CPF]")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]")
    .replace(
      /(?<!\d)(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}\b/g,
      "[REDACTED_PHONE]"
    );
}

export function sanitizeSensitiveData<T>(
  value: T,
  context?: SensitiveDataContext,
  depth = 0
): T {
  if (depth > 12) return REDACTED as T;
  if (typeof value === "string")
    return sanitizeSensitiveText(value, context) as T;
  if (Array.isArray(value))
    return value.map(item =>
      sanitizeSensitiveData(item, context, depth + 1)
    ) as T;
  if (value instanceof Date) return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeSensitiveText(value.message, context),
    } as T;
  }
  if (!value || typeof value !== "object") return value;

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEY.test(key)
      ? REDACTED
      : sanitizeSensitiveData(item, context, depth + 1);
  }
  return result as T;
}

export function safeErrorMessage(
  error: unknown,
  context?: SensitiveDataContext
): string {
  return sanitizeSensitiveText(
    error instanceof Error ? error.message : String(error),
    context
  ).slice(0, 2_000);
}
