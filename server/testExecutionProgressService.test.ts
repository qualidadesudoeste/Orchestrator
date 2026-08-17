import { describe, expect, it } from "vitest";
import {
  ExecutionProgressValidationError,
  normalizeExecutionProgressPayload,
} from "./testExecutionProgressService";

describe("testExecutionProgressService", () => {
  it("normaliza o início de um cenário", () => {
    const progress = normalizeExecutionProgressPayload({
      execution_id: "web-123",
      event: "SCENARIO_STARTED",
      scenario_index: 2,
      scenario_id: "CT-002",
      scenario_title: "Aprovar solicitação",
      ambiente: "Retaguarda",
      stage: "AUTENTICANDO",
    });

    expect(progress).toMatchObject({
      externalExecutionId: "web-123",
      event: "SCENARIO_STARTED",
      scenarioIndex: 2,
      environment: "Retaguarda",
      stage: "AUTENTICANDO",
    });
  });

  it("normaliza o resultado concluído sem carregar credenciais", () => {
    const progress = normalizeExecutionProgressPayload({
      execution_id: "web-123",
      event: "SCENARIO_COMPLETED",
      scenario_index: 1,
      scenario_id: "CT-001",
      scenario_title: "Entrar",
      status: "PASSOU",
      login_senha: "não deve ser copiada",
      resultado_teste: { resumo: "Login realizado" },
    });

    expect(progress.status).toBe("PASSOU");
    expect(progress.summary).toBe("Login realizado");
    expect(progress).not.toHaveProperty("login_senha");
  });

  it("rejeita evento incompleto", () => {
    expect(() => normalizeExecutionProgressPayload({ event: "SCENARIO_STARTED" }))
      .toThrow(ExecutionProgressValidationError);
  });
});
