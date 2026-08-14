import "dotenv/config";
import { createRequire } from "node:module";
import path from "node:path";
import { promises as fs } from "node:fs";
import { runQaPilotAgent, type QaPilotResult } from "../../server/qaPilotAgent";

const require = createRequire(import.meta.url);
const { startSandbox } = require("./server.cjs") as {
  startSandbox(port?: number): Promise<import("node:http").Server>;
};

const scenarios = [
  {
    id: "AGENT-SANDBOX-001",
    title: "Carregar a aplicação neutra",
    gherkin: "Cenário: Carregar a aplicação neutra\n  Dado que acesso a sandbox de QA\n  Quando a página concluir o carregamento\n  Então devo visualizar o título \"Sandbox neutra de QA\"\n  E o status \"Pronta para testes\"",
  },
  {
    id: "AGENT-SANDBOX-002",
    title: "Validar o campo obrigatório",
    gherkin: "Cenário: Validar o campo obrigatório\n  Dado que acesso a sandbox de QA\n  Quando aciono \"Adicionar item\" sem informar um nome\n  Então devo visualizar a mensagem \"Informe o nome do item.\"",
  },
  {
    id: "AGENT-SANDBOX-003",
    title: "Criar e filtrar um item",
    gherkin: "Cenário: Criar e filtrar um item\n  Dado que acesso a sandbox de QA\n  Quando informo \"Registro neutro 001\" no campo \"Nome do item\"\n  E aciono \"Adicionar item\"\n  Então devo visualizar \"Registro neutro 001\" na lista\n  Quando filtro por \"inexistente\"\n  Então devo visualizar \"Nenhum item encontrado\"",
  },
  {
    id: "AGENT-SANDBOX-004",
    title: "Baixar relatório",
    gherkin: "Cenário: Baixar relatório\n  Dado que acesso a sandbox de QA\n  Quando aciono \"Baixar relatório\"\n  Então deve ser baixado o arquivo \"relatorio-sandbox.csv\"",
  },
];

async function main(): Promise<number> {
  const server = await startSandbox();
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("A sandbox não informou uma porta TCP.");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const runId = `neutral-sandbox-${Date.now()}`;
  const root = path.resolve("artifacts", "qa-sandbox-agent", runId);
  const results: QaPilotResult[] = [];
  const requestedId = process.argv[process.argv.indexOf("--scenario") + 1];
  const selectedScenarios = process.argv.includes("--scenario")
    ? scenarios.filter(scenario => scenario.id === requestedId)
    : scenarios;
  if (!selectedScenarios.length) throw new Error(`Cenário neutro não encontrado: ${requestedId || "não informado"}.`);
  try {
    for (const scenario of selectedScenarios) {
      console.log(`Executando ${scenario.id} — ${scenario.title}`);
      const result = await runQaPilotAgent({
        runId,
        scenarioId: scenario.id,
        title: scenario.title,
        gherkin: scenario.gherkin,
        environments: [{ name: "Sandbox neutra", url: baseUrl }],
        outputDirectory: path.join(root, scenario.id),
        headless: true,
        maxIterations: 18,
      });
      results.push(result);
      console.log(`${result.final.status.padEnd(15)} ${scenario.id} — ${result.final.summary}`);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  await fs.mkdir(root, { recursive: true });
  const summary = {
    runId,
    generatedAt: new Date().toISOString(),
    suite: "qa-sandbox-neutral-agent",
    results: results.map(result => ({
      scenarioId: result.scenarioId,
      status: result.final.status,
      verifier: result.verifier,
      iterations: result.iterations,
      usage: result.usage,
      traceFile: result.traceFile,
    })),
  };
  await fs.writeFile(path.join(root, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(`Resumo: ${path.join(root, "summary.json")}`);
  return results.some(result => result.final.status !== "PASSOU" || result.verifier?.accepted === false) ? 1 : 0;
}

main().then(code => process.exit(code)).catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
