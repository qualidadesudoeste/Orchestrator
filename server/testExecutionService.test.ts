import { describe, expect, it } from "vitest";
import {
  normalizeTestExecutionPayload,
  TestExecutionValidationError,
} from "./testExecutionService";

describe("normalizeTestExecutionPayload", () => {
  it("separa defeitos reais de erros de automação e calcula cobertura", () => {
    const execution = normalizeTestExecutionPayload({
      execution_id: "n8n-100",
      projeto: "Portal",
      sprint: "Sprint 3",
      status_geral: "FALHOU",
      resultados: [
        {
          scenario_id: "CT-001",
          scenario_title: "Login válido",
          status: "PASSOU",
          resultado_teste: { falhas_reais: [], falhas_automacao: [] },
        },
        {
          scenario_id: "CT-002",
          scenario_title: "Pagamento",
          status: "FALHOU",
          risco: "crítico",
          resultado_teste: {
            falhas_reais: ["Pagamento recusado indevidamente"],
            falhas_automacao: [],
          },
        },
        {
          scenario_id: "CT-003",
          scenario_title: "Ambiente",
          status: "ERRO_AUTOMACAO",
          resultado_teste: {
            falhas_reais: [],
            falhas_automacao: ["Timeout do runner"],
          },
        },
      ],
    });

    expect(execution.totalScenarios).toBe(3);
    expect(execution.coveragePercent).toBe(67);
    expect(execution.defectsFound).toBe(1);
    expect(execution.criticalDefects).toBe(1);
    expect(execution.automationErrors).toBe(1);
  });

  it("exige um identificador idempotente", () => {
    expect(() =>
      normalizeTestExecutionPayload({
        resultados: [{ scenario_id: "CT-001", status: "PASSOU" }],
      }),
    ).toThrowError(TestExecutionValidationError);
  });

  it("retira flaky do total de falhas confiáveis", () => {
    const execution = normalizeTestExecutionPayload({
      execution_id: "exec-flaky",
      resultados: [
        {
          scenario_id: "CT-001",
          status: "PASSOU",
          resultado_teste: {
            tentativas: [{ status: "FALHOU" }, { status: "PASSOU" }],
            falhas_reais: ["Falha transitória"],
          },
        },
      ],
    });
    expect(execution).toMatchObject({
      status: "PASSOU",
      failedScenarios: 0,
      flakyScenarios: 1,
      defectsFound: 0,
    });
    expect(execution.results[0]).toMatchObject({
      reliabilityStatus: "FLAKY",
      attempts: 2,
      failedAttempts: 1,
      passedAttempts: 1,
      realDefects: 0,
    });
  });
});
