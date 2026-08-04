import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type WorkflowNode = {
  name?: string;
  type?: string;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  credentials?: {
    googlePalmApi?: { id?: string; name?: string };
    openAiApi?: { id?: string; name?: string };
  };
  parameters?: {
    url?: string;
    body?: string;
    jsCode?: string;
    text?: string;
    model?: string | { value?: string; mode?: string };
    modelName?: string;
    amount?: number;
    unit?: string;
    options?: {
      systemMessage?: string;
      reasoningEffort?: string;
      maxIterations?: number;
    };
  };
};

describe("workflow do Agente QA", () => {
  it("mantém o contrato atual do Playwright MCP para autenticação", () => {
    const workflowPath = resolve(
      process.cwd(),
      "automation/n8n/Agente_QA_Playwright_MCP.json"
    );
    const workflow = JSON.parse(readFileSync(workflowPath, "utf8")) as {
      nodes?: WorkflowNode[];
    };
    const agent = workflow.nodes?.find(node => node.name === "Agente QA");
    const systemMessage = agent?.parameters?.options?.systemMessage ?? "";

    expect(systemMessage).toContain("POLÍTICA DE AUTENTICAÇÃO");
    expect(systemMessage).toContain("LOGIN_TEST");
    expect(systemMessage).toContain("AUTH_REQUIRED");
    expect(systemMessage).toContain("PUBLIC");
    expect(systemMessage).toContain("browser_snapshot");
    expect(systemMessage).toContain(
      "browser_snapshot explicitamente, sem filename",
    );
    expect(systemMessage).toContain(
      "browser_fill_form exige exatamente {fields:[{target,name,type,value}]}"
    );
    expect(systemMessage).toContain("browser_type, que exige exatamente target e text");
    expect(systemMessage).toContain("browser_click exige target");
    expect(systemMessage).toContain("MFA_CAPTCHA");
  });

  it("entrega snapshots semânticos diretamente ao agente", () => {
    const startScriptPath = resolve(
      process.cwd(),
      "automation/playwright/start-playwright-mcp.ps1",
    );
    const startScript = readFileSync(startScriptPath, "utf8");
    const configPath = resolve(
      process.cwd(),
      "automation/playwright/playwright-mcp.config.json",
    );
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      saveSession?: boolean;
    };

    expect(startScript).toContain("--output-mode stdout");
    expect(startScript).toContain("@playwright/mcp@0.0.78");
    expect(startScript).toContain("--output-dir $outputDirectory");
    expect(startScript).toContain("artifacts\\playwright-mcp");
    expect(config.saveSession).toBe(false);
  });

  it("aceita JSON mesmo quando o modelo inclui texto ao redor", () => {
    const workflowPath = resolve(
      process.cwd(),
      "automation/n8n/Agente_QA_Playwright_MCP.json",
    );
    const workflow = JSON.parse(readFileSync(workflowPath, "utf8")) as {
      nodes?: WorkflowNode[];
    };
    const formatter = workflow.nodes?.find(
      node => node.name === "Formatar Resultado",
    );
    const code = formatter?.parameters?.jsCode ?? "";

    expect(code).toContain("bruto.indexOf('{')");
    expect(code).toContain("bruto.lastIndexOf('}')");
    expect(code).toContain("JSON.parse(candidatoJson)");
  });

  it("usa OpenAI com um modelo eficiente capaz de chamar ferramentas", () => {
    const workflowPath = resolve(
      process.cwd(),
      "automation/n8n/Agente_QA_Playwright_MCP.json",
    );
    const workflow = JSON.parse(readFileSync(workflowPath, "utf8")) as {
      nodes?: WorkflowNode[];
    };
    const model = workflow.nodes?.find(
      node => node.name === "OpenAI — GPT-5.6 Luna",
    );
    const modelConfig = model?.parameters?.model as unknown as {
      value?: string;
    };

    expect(model?.type).toBe("@n8n/n8n-nodes-langchain.lmChatOpenAi");
    expect(modelConfig.value).toBe("gpt-5.6-luna");
    expect(model?.parameters?.options?.reasoningEffort).toBe("low");
    expect(model?.credentials?.openAiApi?.id).toBe("orchestrator-openai");
    expect(model?.retryOnFail).toBe(true);
    expect(model?.maxTries).toBe(2);
  });

  it("classifica autenticação, diagnostica falhas e controla a cota", () => {
    const workflowPath = resolve(
      process.cwd(),
      "automation/n8n/Agente_QA_Playwright_MCP.json",
    );
    const workflow = JSON.parse(readFileSync(workflowPath, "utf8")) as {
      nodes?: WorkflowNode[];
    };
    const prepare = workflow.nodes?.find(node => node.name === "Preparar Cenários");
    const diagnostics = workflow.nodes?.find(
      node => node.name === "Diagnosticar Falha do Agente",
    );
    const wait = workflow.nodes?.find(node => node.name === "Aguardar Cota da IA");

    expect(prepare?.parameters?.jsCode).toContain("ambiente_inferido");
    expect(prepare?.parameters?.jsCode).toContain("AMBIENTE_PADRAO_DA_EXECUCAO");
    expect(prepare?.parameters?.jsCode).toContain("LOGIN_TEST");
    expect(diagnostics?.parameters?.jsCode).toContain("LIMITE_IA");
    expect(diagnostics?.parameters?.jsCode).toContain("PREENCHIMENTO_FALHOU");
    expect(wait?.type).toBe("n8n-nodes-base.wait");
    expect(wait?.parameters?.amount).toBeGreaterThanOrEqual(30);
    expect(wait?.parameters?.unit).toBe("seconds");
  });

  it("faz login determinístico antes do agente e limita as ferramentas da IA", () => {
    const workflowPath = resolve(
      process.cwd(),
      "automation/n8n/Agente_QA_Playwright_MCP.json",
    );
    const workflow = JSON.parse(readFileSync(workflowPath, "utf8")) as {
      nodes?: WorkflowNode[];
      connections?: Record<string, unknown>;
    };
    const login = workflow.nodes?.find(
      node => node.name === "Login Determinístico Playwright",
    );
    const agentTools = workflow.nodes?.find(node => node.name === "MCP Client");
    const preparation = workflow.nodes?.find(
      node => node.name === "Preparar Login Determinístico",
    );

    expect(login?.type).toBe("@n8n/n8n-nodes-langchain.mcpClient");
    expect(login?.parameters?.tool?.value).toBe("browser_run_code_unsafe");
    expect(preparation?.parameters?.jsCode).toContain("page.getByLabel");
    expect(preparation?.parameters?.jsCode).toContain("page.getByRole('button'");
    expect(agentTools?.parameters?.excludeTools).toContain("browser_run_code_unsafe");
    expect(workflow.connections).toHaveProperty("Precisa de login prévio?");
  });

  it("preserva o usuário solicitante até a persistência da execução", () => {
    const workflowPath = resolve(
      process.cwd(),
      "automation/n8n/Agente_QA_Playwright_MCP.json",
    );
    const workflow = JSON.parse(readFileSync(workflowPath, "utf8")) as {
      nodes?: WorkflowNode[];
    };
    const validation = workflow.nodes?.find(
      node => node.name === "Validar solicitação segura",
    );
    const consolidation = workflow.nodes?.find(
      node => node.name === "Consolidar Execução",
    );

    expect(validation?.parameters?.jsCode).toContain("solicitado_por");
    expect(consolidation?.parameters?.jsCode).toContain(
      "solicitado_por: primeiro.solicitado_por",
    );
  });

  it("preserva e entrega o índice local do código-fonte ao agente", () => {
    const workflowPath = resolve(
      process.cwd(),
      "automation/n8n/Agente_QA_Playwright_MCP.json",
    );
    const workflow = JSON.parse(readFileSync(workflowPath, "utf8")) as {
      nodes?: WorkflowNode[];
    };
    const validation = workflow.nodes?.find(node => node.name.startsWith("Validar "));
    const agent = workflow.nodes?.find(node => node.name === "Agente QA");

    expect(validation?.parameters?.jsCode).toContain("contexto_codigo_fonte");
    expect(agent?.parameters?.text).toContain("contexto_codigo_fonte");
    expect(agent?.parameters?.text).toContain("testids");
  });

  it("explora sistemas sem código e encerra antes de perder a resposta final", () => {
    const workflowPath = resolve(
      process.cwd(),
      "automation/n8n/Agente_QA_Playwright_MCP.json",
    );
    const workflow = JSON.parse(readFileSync(workflowPath, "utf8")) as {
      nodes?: WorkflowNode[];
      connections?: Record<string, unknown>;
    };
    const agent = workflow.nodes?.find(node => node.name === "Agente QA");
    const formatter = workflow.nodes?.find(node => node.name === "Formatar Resultado");

    expect(agent?.parameters?.options?.maxIterations).toBe(16);
    expect(agent?.parameters?.text).toContain("ESTRATEGIA DE DESCOBERTA");
    expect(agent?.parameters?.text).toContain("mapa_interface");
    expect(formatter?.parameters?.jsCode).toContain("MAX_ITERACOES");
    expect(Object.keys(workflow.connections ?? {}).some(name => name.startsWith("Mem"))).toBe(false);
  });

  it("seleciona e alterna ambientes sem persistir suas credenciais", () => {
    const workflowPath = resolve(
      process.cwd(),
      "automation/n8n/Agente_QA_Playwright_MCP.json",
    );
    const workflow = JSON.parse(readFileSync(workflowPath, "utf8")) as {
      nodes?: WorkflowNode[];
    };
    const validation = workflow.nodes?.find(node => node.name.startsWith("Validar "));
    const preparation = workflow.nodes?.find(node => node.name === "Preparar Cenários");
    const agent = workflow.nodes?.find(node => node.name === "Agente QA");
    const formatter = workflow.nodes?.find(node => node.name === "Formatar Resultado");

    expect(validation?.parameters?.jsCode).toContain("body.ambientes");
    expect(validation?.parameters?.jsCode).toContain("ambientes_json");
    expect(preparation?.parameters?.jsCode).toContain("ambientes_execucao_json");
    expect(preparation?.parameters?.jsCode).toContain("ambiente_ambiguo");
    expect(agent?.parameters?.text).toContain("TROCA DE AMBIENTES");
    expect(agent?.parameters?.text).toContain("ambientes_execucao_json");
    expect(agent?.parameters?.text).toContain("AMBIENTE_AMBIGUO");
    expect(agent?.parameters?.text).toContain("AMBIENTE INFERIDO");
    expect(agent?.parameters?.options?.systemMessage).toContain("interceptação de ponteiro");
    expect(formatter?.parameters?.jsCode).toContain("ambientes_execucao_json");
    expect(formatter?.parameters?.jsCode).toContain("login_senha");
  });

  it("notifica o progresso de cada cenário sem enviar credenciais", () => {
    const workflowPath = resolve(
      process.cwd(),
      "automation/n8n/Agente_QA_Playwright_MCP.json",
    );
    const workflow = JSON.parse(readFileSync(workflowPath, "utf8")) as {
      nodes?: WorkflowNode[];
      connections?: Record<string, unknown>;
    };
    const started = workflow.nodes?.find(
      node => node.name === "Notificar Início do Cenário",
    );
    const completed = workflow.nodes?.find(
      node => node.name === "Notificar Cenário Concluído",
    );

    expect(started?.parameters?.url).toContain(
      "/api/qa/test-executions/progress",
    );
    expect(started?.parameters?.body).toContain("SCENARIO_STARTED");
    expect(completed?.parameters?.url).toContain(
      "/api/qa/test-executions/progress",
    );
    expect(completed?.parameters?.body).toContain("SCENARIO_COMPLETED");
    expect(started?.parameters?.body).not.toContain("login_senha");
    expect(completed?.parameters?.body).not.toContain("login_senha");
    expect(workflow.connections).toHaveProperty("Notificar Início do Cenário");
    expect(workflow.connections).toHaveProperty("Notificar Cenário Concluído");
  });
  it("consulta pausa e encerramento antes de iniciar o próximo cenário", () => {
    const workflowPath = resolve(
      process.cwd(),
      "automation/n8n/Agente_QA_Playwright_MCP.json",
    );
    const workflow = JSON.parse(readFileSync(workflowPath, "utf8")) as {
      nodes?: WorkflowNode[];
      connections?: Record<string, unknown>;
    };
    const checkpoint = workflow.nodes?.find(
      node => node.name === "Consultar Controle da Execução",
    );
    const pause = workflow.nodes?.find(
      node => node.name === "Execução está pausada?",
    );
    const stop = workflow.nodes?.find(
      node => node.name === "Execução deve encerrar?",
    );
    const wait = workflow.nodes?.find(
      node => node.name === "Aguardar Retomada",
    );
    const connections = JSON.stringify(workflow.connections ?? {});

    expect(checkpoint?.parameters?.url).toContain(
      "/api/qa/test-executions/control-state",
    );
    expect(checkpoint?.parameters?.body).toContain("execution_id");
    expect(pause?.parameters?.conditions?.conditions?.[0]?.rightValue).toBe("PAUSE");
    expect(stop?.parameters?.conditions?.conditions?.[0]?.rightValue).toBe("CANCEL");
    expect(wait?.parameters?.amount).toBe(5);
    expect(connections).toContain("Salvar Aprendizado");
    expect(connections).toContain("Preparar Checkpoint de Controle");
    expect(connections).toContain("Aguardar Retomada");
    expect(connections).toContain("Encerrar Fluxo com Segurança");
  });
});
