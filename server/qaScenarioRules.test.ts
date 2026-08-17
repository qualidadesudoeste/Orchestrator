import { describe, expect, it } from "vitest";
import {
  analyzeCoverageWithQaRules,
  buildRuleBasedPlan,
  enhancePlanWithQaRules,
} from "./qaScenarioRules";

describe("regras locais de cenários QA", () => {
  it("gera um plano mínimo sem depender de IA", () => {
    const plan = buildRuleBasedPlan({
      userStory: "Como usuário, quero informar email e senha para acessar o sistema",
      systemType: "web",
      criticality: "high",
    });

    const cases = plan.cards.flatMap(card => card.casos);
    expect(cases.length).toBeGreaterThanOrEqual(4);
    expect(cases.some(item => item.tipo === "segurança")).toBe(true);
    expect(cases.some(item => item.tipo === "usabilidade")).toBe(true);
  });

  it("complementa a resposta do modelo sem ultrapassar doze casos", () => {
    const plan = enhancePlanWithQaRules({
      resumo: "Plano da IA local",
      cobertura: { funcional: [], naoFuncional: [], heuristicas: [] },
      cards: [{
        categoria: "Funcional",
        casos: [{
          id: "CT-001",
          titulo: "Consultar tela",
          prioridade: "média",
          dado: "que o usuário está na página",
          quando: "consulta os dados",
          entao: "a tela é exibida",
          resultado_esperado: "a tela é exibida",
          tipo: "funcional",
        }],
      }],
    }, {
      userStory: "Como usuário quero preencher um formulário com campos obrigatórios e salvar os dados",
      systemType: "web",
      criticality: "critical",
    });

    const cases = plan.cards.flatMap(card => card.casos);
    expect(cases.length).toBeLessThanOrEqual(12);
    expect(cases.some(item => /obrigatórios/i.test(item.titulo))).toBe(true);
  });

  it("não acrescenta cenários genéricos a um plano de domínio já suficiente", () => {
    const domainCases = [
      ["DEN-001", "Cadastrar denúncia", "cadastra a denúncia", "a denúncia é salva"],
      ["DEN-002", "Consultar denúncia", "consulta pelo protocolo", "a denúncia é exibida"],
      ["DEN-003", "Editar denúncia", "altera a ocorrência", "a alteração é apresentada"],
    ].map(([id, titulo, quando, entao]) => ({
      id, titulo, prioridade: "alta", dado: "existe uma denúncia", quando, entao,
      resultado_esperado: entao, tipo: "funcional",
    }));
    const enhanced = enhancePlanWithQaRules({
      resumo: "Fluxos de denúncia",
      cobertura: { funcional: [], naoFuncional: [], heuristicas: [] },
      cards: [
        { categoria: "Denúncias", casos: domainCases },
        { categoria: "Validações", casos: [{
          id: "CT-004", titulo: "Validar campos obrigatórios não preenchidos", prioridade: "alta",
          dado: "acessa um formulário", quando: "tenta prosseguir", entao: "o envio é impedido",
          resultado_esperado: "o envio é impedido", tipo: "funcional",
        }] },
        { categoria: " ", casos: [] },
      ],
    }, {
      userStory: "Como gestor quero manter o cadastro e acompanhar denúncias",
      systemType: "web",
      criticality: "high",
    });

    const cases = enhanced.cards.flatMap(card => card.casos);
    expect(cases).toHaveLength(3);
    expect(enhanced.cards).toHaveLength(1);
    expect(cases.some(item => /^CT-/.test(item.id))).toBe(false);
  });

  it("analisa lacunas localmente", () => {
    const analysis = analyzeCoverageWithQaRules(
      "Como usuário quero preencher um formulário protegido",
      [],
    );
    expect(analysis.score_cobertura).toBeLessThan(100);
    expect(analysis.cenarios_faltantes.length).toBeGreaterThan(0);
  });
});
