import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  automationErrorExecutionResult,
  blockedDependencyExecutionResult,
  blockedEnvironmentExecutionResult,
  deriveInterfaceMap,
  loadExecutionCheckpoint,
  pendingDirectScenarios,
  splitGherkinScenarios,
  writeExecutionCheckpoint,
} from "./directQaExecutionService";

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

  it("recusa IDs duplicados para permitir retomada inequívoca", () => {
    expect(() => splitGherkinScenarios([
      "# ID: DUP-01",
      "Cenário: Primeiro",
      "  Dado um estado inicial",
      "  Quando executo a ação",
      "  Então vejo o resultado",
      "# ID: DUP-01",
      "Cenário: Segundo",
      "  Dado outro estado inicial",
      "  Quando executo outra ação",
      "  Então vejo outro resultado",
    ].join("\n"))).toThrow(/ID de cenário duplicado: DUP-01/);
  });

  it("preserva contratos genéricos de artefatos entre cenários", () => {
    const scenarios = splitGherkinScenarios([
      "Cenário: Criar registro",
      "  Dado que acesso o cadastro",
      "  Quando concluo o cadastro",
      "  Então vejo o identificador",
      "  # Produz: identificador do registro, URL de consulta",
      "Cenário: Consultar registro",
      "  Dado que possuo o identificador criado",
      "  Quando consulto o registro",
      "  Então vejo seus dados",
      "  # Consome: identificador do registro",
    ].join("\n"));

    expect(scenarios[0]).toMatchObject({
      produces: ["IDENTIFICADOR_DO_REGISTRO", "URL_DE_CONSULTA"],
      consumes: [],
    });
    expect(scenarios[1]).toMatchObject({
      produces: [],
      consumes: ["IDENTIFICADOR_DO_REGISTRO"],
    });
  });

  it("continua somente pelos cenários ainda não concluídos", () => {
    const scenarios = splitGherkinScenarios([
      "Cenário: Primeiro",
      "  Dado um estado inicial",
      "  Quando executo a ação",
      "  Então vejo o resultado",
      "Cenário: Segundo",
      "  Dado outro estado inicial",
      "  Quando executo outra ação",
      "  Então vejo outro resultado",
    ].join("\n"));
    expect(pendingDirectScenarios(scenarios, [{ scenario_id: scenarios[0].id }]))
      .toEqual([scenarios[1]]);
  });

  it("persiste checkpoint criptografado e restaura resultado e massa", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "orchestrator-checkpoint-"));
    const checkpointFile = path.join(directory, "execution-checkpoint.json");
    const scenarios = splitGherkinScenarios([
      "Cenário: Cenário retomável",
      "  Dado um estado inicial",
      "  Quando executo a ação",
      "  Então vejo o resultado",
    ].join("\n"));
    const result = automationErrorExecutionResult(scenarios[0], new Error("falha controlada"), 25);
    result.resultado_teste.resultado_observado = "Valor usado: valor-secreto";
    try {
      await writeExecutionCheckpoint(checkpointFile, {
        externalExecutionId: "exec-checkpoint",
        startedAt: "2026-08-17T12:00:00.000Z",
        results: [result],
      }, { PROTOCOLO: "ABC-123", SENHA_TESTE: "valor-secreto" });
      const raw = await fs.readFile(checkpointFile, "utf8");
      expect(raw).not.toContain("ABC-123");
      expect(raw).not.toContain("valor-secreto");
      const local = await loadExecutionCheckpoint(checkpointFile, "exec-checkpoint", scenarios);
      expect(local.results).toHaveLength(1);
      const sharedCheckpoint = await writeExecutionCheckpoint(checkpointFile, {
        externalExecutionId: "exec-checkpoint",
        startedAt: "2026-08-17T12:00:00.000Z",
        results: [result],
      }, { PROTOCOLO: "ABC-123", SENHA_TESTE: "valor-secreto" });
      await fs.unlink(checkpointFile);
      const loaded = await loadExecutionCheckpoint(
        checkpointFile,
        "exec-checkpoint",
        scenarios,
        sharedCheckpoint,
      );
      expect(loaded.results).toHaveLength(1);
      expect(loaded.testData).toMatchObject({ PROTOCOLO: "ABC-123", SENHA_TESTE: "valor-secreto" });
      expect(loaded.startedAt?.toISOString()).toBe("2026-08-17T12:00:00.000Z");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("converte erro isolado sem impedir os cenários seguintes", () => {
    const scenario = splitGherkinScenarios([
      "Cenário: Falha técnica isolada",
      "  Dado um estado inicial",
      "  Quando executo a ação",
      "  Então vejo o resultado",
    ].join("\n"))[0];
    const result = automationErrorExecutionResult(scenario, new Error("locator expirou"), 30);
    expect(result.status).toBe("ERRO_AUTOMACAO");
    expect(result.resultado_teste.passos).toHaveLength(3);
    expect(result.resultado_teste.resumo).toContain("locator expirou");
  });

  it("classifica todo o contrato sem consumir IA quando o ambiente está bloqueado", () => {
    const scenario = splitGherkinScenarios([
      "Cenário: Ambiente protegido",
      "  Dado que acesso o ambiente",
      "  Quando executo a operação",
      "  Então vejo a confirmação",
    ].join("\n"))[0];
    const result = blockedEnvironmentExecutionResult(scenario, {
      url: "https://example.test/login",
      status: 500,
      title: "URL Bloqueada",
      externallyBlocked: true,
      detail: "Bloqueio externo confirmado.",
    });
    expect(result.status).toBe("BLOQUEADO");
    expect(result.resultado_teste.passos.map(step => step.status)).toEqual([
      "BLOQUEADO", "NAO_EXECUTADO", "NAO_EXECUTADO",
    ]);
    expect(result.resultado_teste.consumo_ia.totalTokens).toBe(0);
  });

  it("bloqueia dependência ausente sem consumir IA", () => {
    const scenario = splitGherkinScenarios([
      "Cenário: Reutilizar artefato",
      "  Dado que existe um registro anterior",
      "  Quando consulto o registro",
      "  Então vejo os detalhes",
      "  # Consome: identificador do registro",
    ].join("\n"))[0];
    const result = blockedDependencyExecutionResult(scenario, ["identificador do registro"]);
    expect(result.status).toBe("BLOQUEADO");
    expect(result.resultado_teste.precondicoes_ausentes).toEqual(["IDENTIFICADOR_DO_REGISTRO"]);
    expect(result.resultado_teste.consumo_ia.totalTokens).toBe(0);
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
