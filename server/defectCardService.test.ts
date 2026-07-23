import { describe, expect, it } from "vitest";
import {
  DefectCardValidationError,
  generateDefectCards,
} from "./defectCardService";

describe("generateDefectCards", () => {
  it("gera card apenas para falha funcional real", () => {
    const cards = generateDefectCards({
      execution_id: "exec-001",
      projeto: "Orchestrator",
      sprint: "Sprint 8",
      sistema_url: "https://hml.example.com",
      resultados: [
        {
          scenario_id: "CT-001",
          scenario_title: "Finalizar pagamento",
          status: "FALHOU",
          risco: "CRITICO",
          cenario:
            "Cenário: Finalizar pagamento\nDado um carrinho válido\nQuando confirmo o pagamento\nEntão o pedido deve ser aprovado",
          resultado_teste: {
            resumo: "Pagamento não foi concluído.",
            passos: [
              { descricao: "Abrir o carrinho" },
              { descricao: "Confirmar pagamento" },
            ],
            evidencias: [{ caminho: "C:\\evidencias\\falha.png" }],
            falhas_reais: [
              {
                titulo: "Pagamento válido foi recusado",
                resultado_esperado: "Pedido aprovado",
                resultado_obtido: "API retornou erro 500",
              },
            ],
            falhas_automacao: [],
          },
        },
        {
          scenario_id: "CT-002",
          status: "ERRO_AUTOMACAO",
          resultado_teste: {
            falhas_reais: [],
            falhas_automacao: ["Seletor não localizado"],
          },
        },
      ],
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      externalExecutionId: "exec-001",
      externalScenarioId: "CT-001",
      severity: "CRITICO",
      title: "Pagamento válido foi recusado",
    });
    expect(cards[0].markdown).toContain("## Passos para reprodução");
    expect(cards[0].markdown).toContain("API retornou erro 500");
    expect(cards[0].markdown).not.toContain("Seletor não localizado");
  });

  it("remove segredos do conteúdo", () => {
    const [card] = generateDefectCards({
      execution_id: "exec-002",
      resultados: [
        {
          status: "FALHOU",
          resultado_teste: {
            falhas_reais: ["authorization: Bearer segredo123"],
          },
        },
      ],
    });
    expect(card.markdown).not.toContain("segredo123");
    expect(card.rawPayload).not.toContain("segredo123");
    expect(card.markdown).toContain("[REDACTED]");
  });

  it("exige execution_id", () => {
    expect(() => generateDefectCards({ resultados: [] })).toThrow(
      DefectCardValidationError,
    );
  });
});
