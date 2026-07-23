const PLACEHOLDER_PATTERN =
  /(substitua|troque|change[_-]?me|example|placeholder|gere[_-]?(um|uma|outro|outra)?)/i;

export type EnvironmentValidation = {
  errors: string[];
  warnings: string[];
};

function validUrl(value: string, protocols: string[]): boolean {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function validPublicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function validateSecret(
  env: NodeJS.ProcessEnv,
  name: string,
  errors: string[],
): string {
  const value = env[name]?.trim() ?? "";
  if (value.length < 32) {
    errors.push(`${name} deve possuir pelo menos 32 caracteres.`);
  } else if (PLACEHOLDER_PATTERN.test(value)) {
    errors.push(`${name} ainda contém um valor de exemplo ou previsível.`);
  }
  return value;
}

export function validateProductionEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): EnvironmentValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (env.NODE_ENV !== "production") return { errors, warnings };

  const databaseUrl = env.DATABASE_URL?.trim() ?? "";
  if (!validUrl(databaseUrl, ["mysql:"])) {
    errors.push("DATABASE_URL deve ser uma URL MySQL válida.");
  } else if (PLACEHOLDER_PATTERN.test(databaseUrl)) {
    errors.push("DATABASE_URL ainda contém credenciais de exemplo.");
  }

  const jwtSecret = validateSecret(env, "JWT_SECRET", errors);
  const agentToken = validateSecret(env, "QA_AGENT_API_TOKEN", errors);
  if (jwtSecret && agentToken && jwtSecret === agentToken) {
    errors.push("JWT_SECRET e QA_AGENT_API_TOKEN devem ser diferentes.");
  }

  const publicUrl = env.ORCHESTRATOR_PUBLIC_URL?.trim() ?? "";
  if (!validPublicUrl(publicUrl)) {
    errors.push(
      "ORCHESTRATOR_PUBLIC_URL deve usar HTTPS (HTTP é aceito apenas em loopback local).",
    );
  }

  if (!env.BUILT_IN_FORGE_API_KEY?.trim()) {
    warnings.push(
      "BUILT_IN_FORGE_API_KEY ausente: recursos de IA e armazenamento ficarão indisponíveis.",
    );
  }
  if (!env.VITE_ANALYTICS_ENDPOINT?.trim()) {
    warnings.push("Analytics desativado.");
  }

  return { errors, warnings };
}

export function assertProductionEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): EnvironmentValidation {
  const validation = validateProductionEnvironment(env);
  if (validation.errors.length > 0) {
    throw new Error(
      `Configuração de produção inválida:\n- ${validation.errors.join("\n- ")}`,
    );
  }
  return validation;
}

export function parseTrustProxy(value: string | undefined): boolean | number | string {
  const normalized = value?.trim();
  if (!normalized) return false;
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return normalized;
}
