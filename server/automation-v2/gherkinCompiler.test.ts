import { describe, expect, it } from "vitest";
import { compileGherkinScenarios, compileSingleGherkinScenario } from "./gherkinCompiler";

describe("compilador Gherkin V2", () => {
  it("usa a gramática oficial e preserva continuações e linhas", () => {
    const scenario = compileSingleGherkinScenario([
      "Cenário: Exportar relatório",
      "Dado que estou autenticado",
      "E existem registros",
      "Quando exporto o relatório",
      "Então o arquivo é baixado",
    ].join("\n"));
    expect(scenario.version).toBe(2);
    expect(scenario.title).toBe("Exportar relatório");
    expect(scenario.steps.map(step => step.keyword)).toEqual(["DADO", "DADO", "QUANDO", "ENTAO"]);
    expect(scenario.steps[1].sourceLine).toBe("E existem registros");
    expect(scenario.steps[2].intent).toBe("INTERACT");
  });

  it("expande esquema de cenário em contratos independentes", () => {
    const scenarios = compileGherkinScenarios([
      "# language: pt",
      "Funcionalidade: Busca",
      "Esquema do Cenário: Buscar <termo>",
      "Dado que acesso a busca",
      "Quando pesquiso <termo>",
      "Então vejo o resultado",
      "Exemplos:",
      "| termo |",
      "| alfa  |",
      "| beta  |",
    ].join("\n"));
    expect(scenarios.map(item => item.title)).toEqual(["Buscar alfa", "Buscar beta"]);
  });
});
