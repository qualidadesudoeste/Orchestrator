import { describe, expect, it } from "vitest";
import {
  assertProductionEnvironment,
  parseTrustProxy,
  validateProductionEnvironment,
} from "./envValidation";

const validEnvironment = {
  NODE_ENV: "production",
  DATABASE_URL: "mysql://app:strong-db-value@mysql:3306/orchestrator",
  JWT_SECRET: "jwt_4f8ec97ca6754a75a084ff49d7af99ba",
  QA_AGENT_API_TOKEN: "qa_9fb2c3a8dddf4ca19ac5ce192aaec936",
  ORCHESTRATOR_PUBLIC_URL: "https://qa.example.org",
  BUILT_IN_FORGE_API_KEY: "configured",
} satisfies NodeJS.ProcessEnv;

describe("validação do ambiente de produção", () => {
  it("aceita uma configuração segura", () => {
    expect(validateProductionEnvironment(validEnvironment).errors).toEqual([]);
  });

  it("rejeita segredos curtos, repetidos e URL pública sem HTTPS", () => {
    const result = validateProductionEnvironment({
      ...validEnvironment,
      JWT_SECRET: "curto",
      QA_AGENT_API_TOKEN: "curto",
      ORCHESTRATOR_PUBLIC_URL: "http://qa.example.org",
    });
    expect(result.errors).toHaveLength(4);
  });

  it("não bloqueia o ambiente de desenvolvimento", () => {
    expect(validateProductionEnvironment({ NODE_ENV: "development" })).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("falha cedo quando a configuração de produção é inválida", () => {
    expect(() =>
      assertProductionEnvironment({ NODE_ENV: "production" }),
    ).toThrow("Configuração de produção inválida");
  });

  it("interpreta TRUST_PROXY sem habilitá-lo implicitamente", () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy("1")).toBe(1);
    expect(parseTrustProxy("loopback")).toBe("loopback");
  });
});
