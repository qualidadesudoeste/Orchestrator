import { sanitizeSensitiveData } from "./sensitiveData";

type LogLevel = "info" | "warn" | "error";

function write(
  level: LogLevel,
  event: string,
  details?: Record<string, unknown>
): void {
  const entry = sanitizeSensitiveData({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...details,
  });
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logInfo(
  event: string,
  details?: Record<string, unknown>
): void {
  write("info", event, details);
}

export function logWarn(
  event: string,
  details?: Record<string, unknown>
): void {
  write("warn", event, details);
}

export function logError(
  event: string,
  error: unknown,
  details?: Record<string, unknown>
): void {
  write("error", event, { ...details, error });
}
