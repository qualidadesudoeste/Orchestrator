import { describe, expect, it } from "vitest";
import {
  buildReliabilityReport,
  classifyScenarioReliability,
  renderReliabilityHtml,
} from "./reliabilityReportService";

describe("reliability report", () => {
  it("classifica falha seguida de sucesso como flaky", () => {
    const result = classifyScenarioReliability({
      status: "PASSOU",
      resultado_teste: {
        tentativas: [{ status: "FALHOU" }, { status: "PASSOU" }],
      },
    });
    expect(result).toMatchObject({
      classification: "FLAKY",
      attempts: 2,
      passedAttempts: 1,
      failedAttempts: 1,
    });
  });

  it("mantém falha consistente como falha real", () => {
    const result = classifyScenarioReliability({
      status: "FALHOU",
      resultado_teste: {
        tentativas: [{ status: "FALHOU" }, { status: "FALHOU" }],
      },
    });
    expect(result.classification).toBe("FALHA_REAL");
  });

  it("separa flaky da lista de falhas reais no HTML e remove segredos", () => {
    const data = buildReliabilityReport({
      execution_id: "exec-reliability-001",
      projeto: "Orchestrator",
      resultados: [
        {
          scenario_id: "CT-001",
          scenario_title: "Pagamento",
          status: "FALHOU",
          resultado_teste: {
            resumo: "senha=segredo123",
            tentativas: [{ status: "FALHOU" }, { status: "FALHOU" }],
          },
        },
        {
          scenario_id: "CT-002",
          scenario_title: "Login instável",
          status: "PASSOU",
          resultado_teste: {
            tentativas: [{ status: "ERRO_AUTOMACAO" }, { status: "PASSOU" }],
          },
        },
      ],
    });
    const html = renderReliabilityHtml(data);
    expect(data.totals).toMatchObject({ realFailures: 1, flaky: 1 });
    expect(html).toContain("Falhas reais");
    expect(html).toContain("Testes flaky");
    expect(html).not.toContain("segredo123");
    expect(data.enrichedPayload.resultados[1].reliability.classification).toBe(
      "FLAKY",
    );
  });
});
