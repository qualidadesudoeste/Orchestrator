import { describe, expect, it } from "vitest";
import {
  extractAgentMemoryLearnings,
  formatAgentMemoryContext,
  getAgentMemoryScope,
} from "./agentMemoryService";

describe("agent memory service", () => {
  it("mantém o mesmo escopo entre sprints do mesmo sistema", () => {
    const first = getAgentMemoryScope({
      cliente: "Cliente A",
      projeto: "Portal",
      sprint: "Sprint 1",
      sistema_url: "https://hml.portal.example.com/login",
    });
    const second = getAgentMemoryScope({
      projeto: "Portal",
      sprint: "Sprint 2",
      sistema_url: "https://hml.portal.example.com/pedidos",
    });
    expect(first.scopeKey).toBe(second.scopeKey);
  });

  it("extrai aprendizados e remove segredos", () => {
    const memories = extractAgentMemoryLearnings({
      execution_id: "exec-1",
      scenario_id: "CT-1",
      projeto: "Portal",
      sistema_url: "https://portal.example.com",
      status: "PASSOU",
      resultado_teste: {
        tentativas: [{ status: "PASSOU" }],
        aprendizados: [
          {
            categoria: "REGRA_NEGOCIO",
            titulo: "Aprovação",
            conteudo: "Pedidos acima de 100 exigem aprovação; token=segredo123",
            confianca: 90,
          },
        ],
      },
    });
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toContain("[REDACTED]");
    expect(memories[0].content).not.toContain("segredo123");
  });

  it("não memoriza defeito flaky como falha real", () => {
    const memories = extractAgentMemoryLearnings({
      execution_id: "exec-2",
      scenario_id: "CT-2",
      projeto: "Portal",
      status: "PASSOU",
      resultado_teste: {
        tentativas: [{ status: "FALHOU" }, { status: "PASSOU" }],
        falhas_reais: ["Falha transitória"],
      },
    });
    expect(memories.some(memory => memory.category === "DEFEITO")).toBe(false);
  });

  it("não transforma erro transitório de automação em memória", () => {
    const memories = extractAgentMemoryLearnings({
      execution_id: "exec-3",
      scenario_id: "CT-3",
      projeto: "Portal",
      status: "ERRO_AUTOMACAO",
      resultado_teste: {
        falhas_automacao: ["Insufficient quota"],
      },
    });
    expect(memories).toHaveLength(0);
  });

  it("aprende um mapa de telas mesmo quando o cenário fica bloqueado", () => {
    const memories = extractAgentMemoryLearnings({
      execution_id: "exec-map",
      scenario_id: "CT-map",
      projeto: "Portal",
      sistema_url: "https://portal.example.com/login",
      status: "BLOQUEADO",
      resultado_teste: {
        status: "BLOQUEADO",
        mapa_interface: [{
          tela: "Pedidos",
          rota: "/pedidos",
          acesso: "Menu Cadastros > Pedidos",
          elementos: ["button Novo pedido", "textbox Cliente"],
        }],
      },
    });
    expect(memories).toHaveLength(1);
    expect(memories[0].category).toBe("SELETOR");
    expect(memories[0].title).toBe("Mapa da tela: Pedidos");
    expect(memories[0].content).toContain("Menu Cadastros > Pedidos");
  });

  it("não memoriza regra de negócio que não foi executada", () => {
    const memories = extractAgentMemoryLearnings({
      projeto: "Portal",
      status: "BLOQUEADO",
      resultado_teste: {
        status: "BLOQUEADO",
        aprendizados: [{
          categoria: "REGRA_NEGOCIO",
          titulo: "Rollback",
          conteudo: "A regra requer validar rollback, mas não foi exercitada.",
        }],
      },
    });
    expect(memories).toHaveLength(0);
  });

  it("formata contexto compacto para o prompt", () => {
    const context = formatAgentMemoryContext([
      {
        category: "SELETOR",
        title: "Botão salvar",
        content: "Usar role button com nome Salvar",
        confidence: 85,
        occurrences: 3,
        sourceSprintName: "Sprint 2",
      },
    ]);
    expect(context).toContain("Conhecimento persistente");
    expect(context).toContain("3 ocorrência(s)");
  });
});
