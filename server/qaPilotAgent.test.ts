import { describe, expect, it } from "vitest";
import {
  QaExecutionCancelledError,
  automationErrorRecoveryCategory,
  boundedResult,
  compactPilotToolHistory,
  classifyObservedAbsence,
  classifyAutomationError,
  executeV2Bootstrap,
  normalizeVerifierDecision,
  parseGherkinScenarioSteps,
  runApprovedAutomationRecipe,
  runQaPilotAgent,
  SYNTHETIC_NO_MATCH_GUIDANCE,
  type QaPilotToolRuntime,
  type QaPilotTraceEvent,
} from "./qaPilotAgent";
import { compileSingleGherkinScenario, resolveScenarioPlan } from "./automation-v2";
import type { ApprovedAutomationRecipe } from "./approvedAutomationService";
import type { InvokeParams, InvokeResult } from "./_core/llm";

function response(message: InvokeResult["choices"][number]["message"]): InvokeResult {
  return {
    id: "test",
    created: 1,
    model: "test",
    choices: [{ index: 0, message, finish_reason: "stop" }],
  };
}

function callTool(id: string, name: string, args: Record<string, unknown> = {}) {
  return response({
    role: "assistant",
    content: null as any,
    tool_calls: [{
      id,
      type: "function",
      function: { name, arguments: JSON.stringify(args) },
    }],
  });
}

function planResponse() {
  return response({
    role: "assistant",
    content: JSON.stringify({
      objective: "Validar a busca",
      steps: ["Abrir", "Buscar", "Validar"],
      successCriteria: ["Resultado visível"],
      requiredData: [],
      risks: [],
    }),
  });
}

function scenario() {
  return [
    "Cenário: Buscar item",
    "  Dado que acesso a tela de busca",
    "  Quando busco pelo item existente",
    "  Então encontro o item na lista",
  ].join("\n");
}

function runtimeDouble() {
  const trace: QaPilotTraceEvent[] = [];
  const runtime: QaPilotToolRuntime = {
    async execute(name, args, iteration) {
      trace.push({ iteration, tool: name, arguments: args, startedAt: new Date().toISOString(), durationMs: 1, ok: true, result: {} });
      if (name === "finish") {
        return {
          output: args,
          final: {
            status: String(args.status) as "PASSOU" | "FALHOU" | "BLOQUEADO" | "ERRO_AUTOMACAO",
            summary: String(args.summary),
            evidence: ["final.png"],
            missingPreconditions: Array.isArray(args.missingPreconditions) ? args.missingPreconditions.map(String) : [],
            observedResult: String(args.observedResult),
            steps: args.steps as any,
          },
        };
      }
      return { output: { url: "https://example.test", text: "Item encontrado" } };
    },
    async close() {},
    getTrace: () => trace,
  };
  return { runtime, trace };
}

describe("contrato executável do cenário", () => {
  it("normaliza decisões contraditórias do verificador", () => {
    expect(normalizeVerifierDecision("PASSOU", {
      accepted: false,
      correctedStatus: "PASSOU",
      reason: "A evidência confirma o resultado.",
    })).toMatchObject({ accepted: true, correctedStatus: "PASSOU" });
    expect(normalizeVerifierDecision("PASSOU", {
      accepted: true,
      correctedStatus: "FALHOU",
      reason: "A evidência contradiz o resultado.",
    })).toMatchObject({ accepted: false, correctedStatus: "FALHOU" });
  });

  it("distingue ausência de massa especial de funcionalidade ausente", () => {
    const step = { id: "S1", keyword: "DADO" as const, text: "listagem com mais de 2000 registros", sourceLine: "Dado listagem com mais de 2000 registros" };
    expect(classifyObservedAbsence(step, "A listagem possui somente 6 registros; massa superior a 2000 não foi encontrada.")).toBe("BLOQUEADO");
    expect(classifyObservedAbsence({ ...step, text: "página pública acessível" }, "A rota exigida retornou 404 Not Found.")).toBe("FALHOU");
  });
  it("classifica falhas técnicas por categoria sem conhecer o cenário", () => {
    expect(classifyAutomationError("element intercepts pointer events by dialog-mask")).toBe("UI_OVERLAY");
    expect(classifyAutomationError("locator.click: Timeout 6000ms exceeded")).toBe("TIMEOUT");
    expect(classifyAutomationError("Campos de login não encontrados")).toBe("AUTHENTICATION");
    expect(automationErrorRecoveryCategory("Campos de login não encontrados")).toBe("AUTH_SESSION");
    expect(automationErrorRecoveryCategory("element intercepts pointer events by dialog-mask")).toBe("UI_STATE");
  });
  it("executa login e rota conhecidos antes de acionar descoberta por IA", async () => {
    const gherkin = [
      "Cenário: Relatório",
      "Dado administrador autenticado",
      "Quando acessar /relatorios",
      "Então a tela de relatórios é exibida",
    ].join("\n");
    const compiled = compileSingleGherkinScenario(gherkin);
    const executionPlan = resolveScenarioPlan({ scenario: compiled });
    const { runtime, trace } = runtimeDouble();
    const output = await executeV2Bootstrap({
      runId: "v2-bootstrap", scenarioId: "V2-1", title: compiled.title, gherkin,
      environments: [{ name: "HML", url: "https://example.test/login", username: "admin", password: "secret" }],
      outputDirectory: pathForTest(), executionPlan,
    }, runtime);
    expect(trace.map(item => item.tool)).toEqual(["browser_login", "browser_navigate"]);
    expect(JSON.stringify(output)).toContain("https://example.test/relatorios");
    expect(JSON.stringify(output)).not.toContain("secret");
  });
  it("autoriza termo sintético somente para buscas negativas sem massa", () => {
    expect(SYNTHETIC_NO_MATCH_GUIDANCE).toContain("QA_SEM_RESULTADO_AUTOMACAO");
    expect(SYNTHETIC_NO_MATCH_GUIDANCE).toContain("nao e massa de negocio");
    expect(SYNTHETIC_NO_MATCH_GUIDANCE).toContain("CPF");
  });

  it("compacta observações antigas sem remover as duas mais recentes", () => {
    const messages = [
      { role: "tool", content: "a".repeat(2_000) },
      { role: "tool", content: "b".repeat(2_000) },
      { role: "tool", content: "c".repeat(2_000) },
    ] as any;
    compactPilotToolHistory(messages, 2);
    expect(String(messages[0].content).length).toBeLessThan(800);
    expect(messages[1].content).toBe("b".repeat(2_000));
    expect(messages[2].content).toBe("c".repeat(2_000));
  });

  it("preserva ação e mapa sem guardar valores em observações grandes", () => {
    const compacted = boundedResult({
      action: { type: "click", label: "Meus processos" },
      url: "https://example.test/processos",
      title: "Caixa de Processos",
      text: "conteudo ".repeat(2_000),
      elements: Array.from({ length: 40 }, (_, index) => ({
        ref: `e${index}`,
        tag: "input",
        name: `Campo ${index}`,
        value: `segredo-${index}`,
      })),
    }) as any;
    expect(compacted.action.label).toBe("Meus processos");
    expect(compacted.url).toBe("https://example.test/processos");
    expect(compacted.elements).toHaveLength(25);
    expect(JSON.stringify(compacted)).not.toContain("segredo-");
  });
  it("preserva o diagnóstico do resolvedor quando a observação é compactada", () => {
    const compacted = boundedResult({
      category: "BUSINESS_DATA",
      objective: "Criar massa temporal",
      strategies: ["FIND_OR_CREATE_RECORD"],
      attempts: [{ strategy: "FIND_OR_CREATE_RECORD", ok: false, detail: "Sem criação segura" }],
      attempted: true,
      changed: false,
      external: false,
      requiresStepRetry: true,
      url: "https://example.test/registros",
      text: "conteúdo ".repeat(2_000),
      elements: Array.from({ length: 100 }, (_, index) => ({ ref: `e${index}`, name: `Campo ${index}` })),
    }) as any;
    expect(compacted.category).toBe("BUSINESS_DATA");
    expect(compacted.attempts[0].ok).toBe(false);
    expect(compacted.changed).toBe(false);
  });
  it("extrai Dado/Quando/Então e preserva continuações na ordem", () => {
    expect(parseGherkinScenarioSteps([
      "Cenário: Exemplo",
      "Dado que existe um usuário",
      "E existe um item",
      "Quando o usuário pesquisa",
      "Então o item aparece",
      "Mas nenhum item diferente aparece",
    ].join("\n"))).toEqual([
      { id: "S1", keyword: "DADO", text: "que existe um usuário", sourceLine: "Dado que existe um usuário" },
      { id: "S2", keyword: "DADO", text: "existe um item", sourceLine: "E existe um item" },
      { id: "S3", keyword: "QUANDO", text: "o usuário pesquisa", sourceLine: "Quando o usuário pesquisa" },
      { id: "S4", keyword: "ENTAO", text: "o item aparece", sourceLine: "Então o item aparece" },
      { id: "S5", keyword: "ENTAO", text: "nenhum item diferente aparece", sourceLine: "Mas nenhum item diferente aparece" },
    ]);
  });

  it("rejeita passo fora de ordem e conclusão parcial, depois conclui somente todos os passos", async () => {
    const calls: InvokeParams[] = [];
    const scripted = [
      callTool("observe-1", "browser_observe"),
      callTool("wrong-order", "complete_step", { stepId: "S2", status: "PASSOU", observed: "Busca ainda não executada." }),
      callTool("step-1", "complete_step", { stepId: "S1", status: "PASSOU", observed: "A tela de busca foi aberta." }),
      callTool("early-finish", "finish", { summary: "Parcial", observedResult: "Parcial", missingPreconditions: [] }),
      callTool("observe-2", "browser_observe"),
      callTool("step-2", "complete_step", { stepId: "S2", status: "PASSOU", observed: "A pesquisa pelo item foi enviada." }),
      callTool("observe-3", "browser_observe"),
      callTool("step-3", "complete_step", { stepId: "S3", status: "PASSOU", observed: "O item apareceu na lista." }),
      callTool("screenshot", "browser_screenshot"),
      callTool("finish", "finish", { summary: "Busca validada.", observedResult: "Item encontrado.", missingPreconditions: [] }),
    ];
    let scriptedIndex = 0;
    const llm = async (params: InvokeParams) => {
      calls.push(params);
      if (calls.length === 1) return planResponse();
      if (scriptedIndex < scripted.length) return scripted[scriptedIndex++];
      return response({ role: "assistant", content: JSON.stringify({ accepted: true, reason: "Todos os passos têm evidência.", correctedStatus: "PASSOU" }) });
    };
    const { runtime, trace } = runtimeDouble();
    const result = await runQaPilotAgent({
      runId: "pilot-test",
      scenarioId: "CT-001",
      title: "Buscar item",
      gherkin: scenario(),
      environments: [{ name: "Teste", url: "https://example.test" }],
      outputDirectory: pathForTest(),
    }, { llm, runtime });

    const toolOutputs = calls.flatMap(item => item.messages)
      .filter(message => message.role === "tool")
      .map(message => String(message.content));
    expect(toolOutputs.some(output => output.includes("Passo fora de ordem"))).toBe(true);
    expect(toolOutputs.some(output => output.includes("existem passos sem resultado"))).toBe(true);
    expect(result.final.status).toBe("PASSOU");
    expect(result.final.steps.map(step => [step.id, step.status])).toEqual([
      ["S1", "PASSOU"], ["S2", "PASSOU"], ["S3", "PASSOU"],
    ]);
    expect(result.scenarioContract.map(step => step.sourceLine)).toEqual([
      "Dado que acesso a tela de busca",
      "Quando busco pelo item existente",
      "Então encontro o item na lista",
    ]);
    expect(trace.map(item => item.tool)).toEqual([
      "browser_observe", "browser_observe", "browser_observe", "browser_screenshot", "finish",
    ]);
  });

  it("deriva o status final dos passos e não aceita o status sugerido pela IA", async () => {
    const scripted = [
      callTool("observe", "browser_observe"),
      callTool("inspect", "browser_inspect_page", { query: "conta necessária" }),
      callTool("step-1", "complete_step", { stepId: "S1", status: "BLOQUEADO", observed: "A conta com perfil visualizador necessária não está disponível." }),
      callTool("retry-observe", "browser_observe"),
      callTool("step-1-after-recovery", "complete_step", { stepId: "S1", status: "BLOQUEADO", observed: "A conta com perfil visualizador continua indisponível depois da correção e da repetição do passo." }),
      callTool("step-2", "complete_step", { stepId: "S2", status: "NAO_EXECUTADO", observed: "Não executado porque S1 bloqueou a execução." }),
      callTool("step-3", "complete_step", { stepId: "S3", status: "NAO_EXECUTADO", observed: "Não verificável porque S1 bloqueou a execução." }),
      callTool("shot", "browser_screenshot"),
      callTool("finish", "finish", { status: "PASSOU", summary: "Pré-condição ausente.", observedResult: "Sem execução.", missingPreconditions: ["Conta necessária"] }),
    ];
    let call = 0;
    let index = 0;
    const llm = async () => {
      call += 1;
      if (call === 1) return planResponse();
      if (index < scripted.length) return scripted[index++];
      return response({ role: "assistant", content: JSON.stringify({ accepted: true, reason: "Bloqueio comprovado.", correctedStatus: "BLOQUEADO" }) });
    };
    const { runtime, trace } = runtimeDouble();
    const result = await runQaPilotAgent({
      runId: "derive",
      scenarioId: "CT-002",
      title: "Buscar item",
      gherkin: scenario(),
      environments: [{ name: "Teste", url: "https://example.test" }],
      outputDirectory: pathForTest(),
    }, { llm, runtime });
    expect(result.final.status).toBe("BLOQUEADO");
    expect(result.final.steps).toHaveLength(3);
    expect(trace.some(event => event.tool === "resolve_blocker" && event.arguments.category === "PERMISSION")).toBe(true);
  });

  it("tenta recuperar erro de automação antes de aceitar o status", async () => {
    const scripted = [
      callTool("observe-error", "browser_observe"),
      callTool("error-first", "complete_step", { stepId: "S1", status: "ERRO_AUTOMACAO", observed: "locator.click atingiu timeout ao abrir a tela de busca." }),
      callTool("observe-after-recovery", "browser_observe"),
      callTool("error-after-recovery", "complete_step", { stepId: "S1", status: "ERRO_AUTOMACAO", observed: "O timeout persistiu depois da recuperação e da repetição do passo." }),
      callTool("error-step-2", "complete_step", { stepId: "S2", status: "NAO_EXECUTADO", observed: "Não executado por causa do erro técnico anterior." }),
      callTool("error-step-3", "complete_step", { stepId: "S3", status: "NAO_EXECUTADO", observed: "Não verificável por causa do erro técnico anterior." }),
      callTool("error-shot", "browser_screenshot"),
      callTool("error-finish", "finish", { summary: "Falha técnica persistente.", observedResult: "Passo repetido sem sucesso.", missingPreconditions: [] }),
    ];
    let call = 0;
    let index = 0;
    const llm = async () => call++ === 0 ? planResponse() : scripted[index++];
    const { runtime, trace } = runtimeDouble();
    const result = await runQaPilotAgent({
      runId: "recover-error",
      scenarioId: "CT-ERR",
      title: "Buscar item",
      gherkin: scenario(),
      environments: [{ name: "Teste", url: "https://example.test" }],
      outputDirectory: pathForTest(),
    }, { llm, runtime, verify: false });
    expect(result.final.status).toBe("ERRO_AUTOMACAO");
    expect(trace.some(event => event.tool === "resolve_blocker" && event.arguments.category === "UI_STATE")).toBe(true);
  });

  it("mantém falha funcional já registrada quando o piloto atinge o limite", async () => {
    const scripted = [
      callTool("limit-observe-1", "browser_observe"),
      callTool("limit-step-1", "complete_step", { stepId: "S1", status: "PASSOU", observed: "A tela de busca foi aberta corretamente." }),
      callTool("limit-observe-2", "browser_observe"),
      callTool("limit-step-2", "complete_step", { stepId: "S2", status: "FALHOU", observed: "O botão obrigatório não existe na interface observada." }),
    ];
    let call = 0;
    let index = 0;
    const llm = async () => {
      if (call++ === 0) return planResponse();
      return scripted[index++] ?? response({ role: "assistant", content: "Sem nova ação disponível." });
    };
    const { runtime } = runtimeDouble();
    const result = await runQaPilotAgent({
      runId: "limit-after-failure",
      scenarioId: "CT-LIMIT",
      title: "Buscar item",
      gherkin: scenario(),
      environments: [{ name: "Teste", url: "https://example.test" }],
      outputDirectory: pathForTest(),
      maxIterations: 8,
    }, { llm, runtime, verify: false });
    expect(result.final.status).toBe("FALHOU");
    expect(result.final.steps.map(step => step.status)).toEqual(["PASSOU", "FALHOU", "NAO_EXECUTADO"]);
  });

  it("classifica formulário inacessível em passo Dado como bloqueio, não defeito", () => {
    expect(classifyObservedAbsence(
      { id: "S1", keyword: "DADO", text: "que o usuário acessou o formulário", sourceLine: "Dado que o usuário acessou o formulário" },
      "Não foi possível acessar o formulário pela navegação disponível.",
    )).toBe("BLOQUEADO");
  });

  it("interrompe repetição sem progresso antes do limite global", async () => {
    let call = 0;
    const llm = async () => call++ === 0
      ? planResponse()
      : callTool(`observe-${call}`, "browser_observe");
    const { runtime } = runtimeDouble();
    const result = await runQaPilotAgent({
      runId: "no-progress",
      scenarioId: "CT-LOOP",
      title: "Buscar item",
      gherkin: scenario(),
      environments: [{ name: "Teste", url: "https://example.test" }],
      outputDirectory: pathForTest(),
      maxIterations: 18,
    }, { llm, runtime, verify: false });
    expect(result.final.status).toBe("ERRO_AUTOMACAO");
    expect(result.final.summary).toContain("ciclo sem progresso");
    expect(result.iterations).toBeLessThan(18);
    expect(result.final.steps.map(step => step.status)).toEqual([
      "ERRO_AUTOMACAO", "NAO_EXECUTADO", "NAO_EXECUTADO",
    ]);
  });

  it("encerra o processo real quando o controle solicita cancelamento", async () => {
    const { runtime } = runtimeDouble();
    await expect(runQaPilotAgent({
      runId: "cancel",
      scenarioId: "CT-003",
      title: "Buscar item",
      gherkin: scenario(),
      environments: [{ name: "Teste", url: "https://example.test" }],
      outputDirectory: pathForTest(),
      control: async () => "CANCEL",
    }, { llm: async () => planResponse(), runtime })).rejects.toBeInstanceOf(QaExecutionCancelledError);
  });

  it("reproduz receita aprovada com uma única chamada de verificação", async () => {
    const { runtime, trace } = runtimeDouble();
    let calls = 0;
    const llm = async () => {
      calls += 1;
      return response({ role: "assistant", content: JSON.stringify({ accepted: true, reason: "Evidência atual confirma o cenário.", correctedStatus: "PASSOU" }) });
    };
    const recipe: ApprovedAutomationRecipe = {
      version: 1,
      scenarioFingerprint: "fingerprint",
      scenarioId: "CT-001",
      scenarioTitle: "Buscar item",
      sourceExecutionId: "anterior",
      actions: [
        { tool: "browser_login", args: {} },
        { tool: "browser_click_semantic", args: { label: "Pesquisar" } },
      ],
    };
    const result = await runApprovedAutomationRecipe({
      runId: "reuse", scenarioId: "CT-001", title: "Buscar item", gherkin: scenario(),
      environments: [{ name: "Teste", url: "https://example.test" }],
      outputDirectory: pathForTest(),
    }, recipe, { llm, runtime });
    expect(result.kind).toBe("PASSED");
    if (result.kind !== "PASSED") throw new Error("Replay deveria ter sido aprovado.");
    expect(result.result.final.status).toBe("PASSOU");
    expect(result.result.usage.calls).toBe(1);
    expect(calls).toBe(1);
    expect(trace.map(item => item.tool)).toEqual([
      "browser_login", "browser_click_semantic", "browser_screenshot", "finish",
    ]);
  });

  it("não reinicia o agente quando o replay rejeitado pode ter produzido efeito colateral", async () => {
    const { runtime } = runtimeDouble();
    const recipe: ApprovedAutomationRecipe = {
      version: 1,
      scenarioFingerprint: "fingerprint",
      scenarioId: "CT-EXP",
      scenarioTitle: "Exportar",
      sourceExecutionId: "anterior",
      actions: [{ tool: "browser_click_and_download", args: { label: "Exportar" } }],
    };
    const outcome = await runApprovedAutomationRecipe({
      runId: "replay-rejected", scenarioId: "CT-EXP", title: "Exportar", gherkin: scenario(),
      environments: [{ name: "Teste", url: "https://example.test" }],
      outputDirectory: pathForTest(),
    }, recipe, {
      runtime,
      llm: async () => response({
        role: "assistant",
        content: JSON.stringify({ accepted: false, reason: "Evidência inconclusiva.", correctedStatus: "ERRO_AUTOMACAO" }),
      }),
    });
    expect(outcome.kind).toBe("FAILED");
    if (outcome.kind !== "FAILED") throw new Error("Replay deveria ter sido rejeitado.");
    expect(outcome.mayHaveSideEffects).toBe(true);
    expect(outcome.result.final.status).toBe("ERRO_AUTOMACAO");
    expect(outcome.result.final.observedResult).toContain("nova execução automática foi bloqueada");
  });
});

function pathForTest() {
  return `${process.cwd()}/artifacts/test-agent-pilot`;
}
