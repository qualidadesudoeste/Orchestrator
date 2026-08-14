import { describe, expect, it } from "vitest";
import { deriveInterfaceMap, splitGherkinScenarios } from "./directQaExecutionService";

describe("executor direto da fila", () => {
  it("preserva cada cenário completo e o ID original do plano", () => {
    const scenarios = splitGherkinScenarios([
      "Cenário: Autenticar usuário",
      "  Dado que acesso o portal",
      "  Quando informo credenciais válidas",
      "  Então visualizo a página inicial",
      "  # ID: LOGIN-01 | Tipo: Funcional",
      "",
      "Cenário: Encerrar sessão",
      "  Dado que estou autenticado",
      "  Quando encerro a sessão",
      "  Então retorno ao login",
    ].join("\n"));

    expect(scenarios).toHaveLength(2);
    expect(scenarios[0]).toMatchObject({ index: 1, id: "LOGIN-01", title: "Autenticar usuário" });
    expect(scenarios[0].gherkin).toContain("Quando informo credenciais válidas");
    expect(scenarios[1]).toMatchObject({ index: 2, title: "Encerrar sessão" });
    expect(scenarios[1].id).toContain("CT-002-encerrar-sessao");
  });

  it("recusa uma carga sem cenários Gherkin identificáveis", () => {
    expect(() => splitGherkinScenarios("texto livre")).toThrow(/Cenário/);
  });
  it("transforma observacoes reais em mapa de interface sem guardar valores", () => {
    const screens = deriveInterfaceMap({
      trace: [{
        iteration: 1,
        tool: "browser_observe",
        arguments: {},
        startedAt: new Date().toISOString(),
        durationMs: 5,
        ok: true,
        result: {
          url: "https://sistema.example.test/fila?status=aberta",
          title: "Fila de testes",
          elements: [
            { role: "button", name: "Pesquisar", value: "segredo" },
            { tag: "input", name: "Filtro", value: "conteudo privado" },
          ],
        },
      }],
    }, { name: "Portal HML", url: "https://sistema.example.test/login" });

    expect(screens).toEqual([expect.objectContaining({
      tela: "Fila de testes",
      ambiente: "Portal HML",
      rota: "/fila?status=aberta",
      elementos: ["button: Pesquisar", "input: Filtro"],
    })]);
    expect(JSON.stringify(screens)).not.toContain("segredo");
    expect(JSON.stringify(screens)).not.toContain("conteudo privado");
  });
});
