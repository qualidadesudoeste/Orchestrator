import { describe, expect, it } from "vitest";
import { boundedResult, MAX_BROWSER_TOOL_RESULT_TEXT } from "./qaPilotShared";

describe("observações grandes enviadas ao agente", () => {
  it("mantém os 80 controles acionáveis, seu estado e o frame sem divulgar valores", () => {
    const controls = Array.from({ length: 80 }, (_, index) => ({
      ref: `e${index + 1}`, tag: "input", role: "checkbox", type: "checkbox",
      name: `Permitir acesso ao módulo ${index + 1}`,
      context: `Configuração de permissões do módulo ${index + 1}`,
      value: `segredo-do-controle-${index}`, checked: index % 2 === 0,
      disabled: index === 79, frameIndex: 1, frameName: "permissoes",
      frameUrl: "https://example.test/configuracao/permissoes",
    }));
    const compacted = boundedResult({
      url: "https://example.test/configuracao", title: "Configuração de acesso",
      text: "Configuração ".repeat(2_000), elements: controls,
      frames: [{ index: 1, name: "permissoes", url: "https://example.test/configuracao/permissoes" }],
      tabs: [{ index: 0, active: true, title: "Configuração", url: "https://example.test/configuracao" }],
    }) as any;

    expect(compacted.elements.map((element: any) => element.ref)).toEqual(controls.map(element => element.ref));
    expect(compacted.elements[79]).toMatchObject({
      ref: "e80", name: "Permitir acesso ao módulo 80", frameIndex: 1,
      frameName: "permissoes", checked: false, disabled: true,
    });
    expect(compacted.frames[0].name).toBe("permissoes");
    expect(compacted.tabs[0].active).toBe(true);
    expect(JSON.stringify(compacted)).not.toContain("segredo-do-controle");
    expect(compacted.truncation.paths.text).toBeGreaterThan(0);
    expect(boundedResult(compacted)).toEqual(compacted);
  });

  it("conserva a tabela inteira quando cabe no orçamento de observação", () => {
    const rows = Array.from({ length: 50 }, (_, row) =>
      Array.from({ length: 12 }, (_, column) => `Linha ${row + 1}, coluna ${column + 1}`));
    const table = {
      frameIndex: 2, frameName: "registros", frameUrl: "https://example.test/registros",
      tableIndex: 0, caption: "Registros para conferência",
      headers: Array.from({ length: 12 }, (_, index) => `Coluna ${index + 1}`),
      rows, totalVisibleRows: 75,
    };
    const input = { url: "https://example.test", query: "registros", tables: [table] };
    expect(JSON.stringify(input).length).toBeGreaterThan(6_000);

    const compacted = boundedResult(input) as any;
    expect(compacted.tables).toEqual([table]);
    expect(compacted.query).toBe("registros");
    expect(compacted.truncation.paths).toEqual({});
    expect(JSON.stringify(compacted).length).toBeLessThanOrEqual(MAX_BROWSER_TOOL_RESULT_TEXT);
  });

  it("preserva inspeção de campos e seções, abas sem URL raiz e diagnósticos", () => {
    const frame = {
      frameIndex: 1, frameName: "edicao", frameUrl: "https://example.test/edicao",
      sections: Array.from({ length: 20 }, (_, index) => `Seção ${index}: ${"evidência ".repeat(50)}`),
      fields: [{ label: "Situação", type: "select-one", value: "Em análise" }],
    };
    const console = Array.from({ length: 10 }, (_, index) => `Diagnóstico ${index}`);
    const networkFailures = ["GET https://example.test/api — net::ERR_CONNECTION_REFUSED"];
    const compacted = boundedResult({ url: "https://example.test", query: "", frames: [frame], console, networkFailures }) as any;
    expect(compacted.frames).toEqual([frame]);
    expect(compacted.console).toEqual(console);
    expect(compacted.networkFailures).toEqual(networkFailures);

    const tabs = Array.from({ length: 60 }, (_, index) => ({
      index, active: index === 59, title: `Documento ${index}: ${"descrição ".repeat(15)}`,
      url: `https://example.test/documentos/${index}`,
    }));
    const tabResult = boundedResult({ tabs }) as any;
    expect(tabResult.tabs).toEqual(tabs);
    expect(tabResult.tabs[59].active).toBe(true);
  });

  it("limita inspeções enormes com contagens explícitas sem perder mapa e identidades", () => {
    const input = {
      url: "https://example.test", title: "Inspeção extensa",
      elements: Array.from({ length: 80 }, (_, index) => ({
        ref: `e${index + 1}`, name: `Abrir registro ${index + 1}`, context: "contexto ".repeat(30),
        frameIndex: index % 20, frameName: `frame-${index % 20}`, checked: true,
      })),
      tabs: Array.from({ length: 10 }, (_, index) => ({ index, active: index === 9, title: `Tela de acompanhamento ${index}`, url: `https://example.test/tela/${index}` })),
      frames: Array.from({ length: 20 }, (_, index) => ({
        frameIndex: index, frameName: `frame-${index}`, frameUrl: `https://example.test/frame/${index}`,
        sections: Array.from({ length: 40 }, () => "Seção com evidência ".repeat(30)),
        fields: Array.from({ length: 40 }, () => ({ label: "Situação detalhada", type: "text", value: "Em análise" })),
      })),
      tables: Array.from({ length: 20 }, (_, index) => ({
        frameIndex: index, tableIndex: 0, caption: `Registros do frame ${index}`, totalVisibleRows: 500,
        headers: Array.from({ length: 12 }, (_, column) => `Coluna ${column}`),
        rows: Array.from({ length: 50 }, () => Array.from({ length: 12 }, () => "Evidência extensa ".repeat(15))),
      })),
      console: Array.from({ length: 10 }, (_, index) => `${index}: ${"diagnóstico ".repeat(60)}`),
      networkFailures: ["GET https://example.test/api — net::ERR_CONNECTION_REFUSED"],
    };
    const compacted = boundedResult(input) as any;
    expect(JSON.stringify(compacted).length).toBeLessThanOrEqual(MAX_BROWSER_TOOL_RESULT_TEXT);
    expect(compacted.elements).toHaveLength(80);
    expect(compacted.elements[79]).toMatchObject({ ref: "e80", name: "Abrir registro 80", frameIndex: 19, checked: true });
    expect(compacted.tabs[9]).toMatchObject({ index: 9, active: true, title: "Tela de acompanhamento 9", url: "https://example.test/tela/9" });
    expect(compacted.frames).toHaveLength(20);
    expect(compacted.tables).toHaveLength(20);
    expect(compacted.tables[19].totalVisibleRows).toBe(500);
    expect(compacted.tables[0].rows.length).toBeGreaterThan(0);
    expect(compacted.truncation.additionalPaths).toBeGreaterThan(0);
    expect(compacted.truncation.guidance).toContain("query");
    expect(compacted.networkFailures[0]).toContain("ERR_CONNECTION_REFUSED");
    expect(boundedResult(compacted)).toEqual(compacted);
  });

  it("mantém o teto também no resumo extremo com todas as identidades extensas", () => {
    for (const longText of ["x".repeat(1_000), "\u0000".repeat(1_000)]) {
      const identity = (index: number) => ({
        ref: `e${index + 1}`, index, frameIndex: index % 20, tableIndex: index,
        name: longText, frameName: longText, url: longText, frameUrl: longText,
        title: longText, caption: longText, checked: true, disabled: false,
        active: index === 49, main: index === 0, totalVisibleRows: 500,
      });
      const compacted = boundedResult({
        elements: Array.from({ length: 80 }, (_, index) => identity(index)),
        frames: Array.from({ length: 20 }, (_, index) => identity(index)),
        tabs: Array.from({ length: 50 }, (_, index) => identity(index)),
        tables: Array.from({ length: 20 }, (_, index) => identity(index)),
      }) as any;

      expect(JSON.stringify(compacted).length).toBeLessThanOrEqual(MAX_BROWSER_TOOL_RESULT_TEXT);
      expect(compacted.elements).toHaveLength(80);
      expect(compacted.frames).toHaveLength(20);
      expect(compacted.tabs).toHaveLength(50);
      expect(compacted.tables).toHaveLength(20);
      expect(compacted.elements[79]).toMatchObject({ ref: "e80", index: 79, frameIndex: 19, checked: true });
      expect(compacted.tabs[49]).toMatchObject({ index: 49, active: true });
      expect(compacted.tables[19]).toMatchObject({ tableIndex: 19, totalVisibleRows: 500 });
      expect(compacted.truncation.extremeSummary).toBe(true);
      expect(compacted.truncation.collections.elements).toEqual({ total: 80, kept: 80 });
      expect(boundedResult(compacted)).toEqual(compacted);
    }
  });
});
