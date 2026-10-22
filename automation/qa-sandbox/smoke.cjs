const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright-core");
const { startSandbox } = require("./server.cjs");

const scenarios = [
  {
    id: "SANDBOX-001",
    title: "Carregar a aplicação",
    run: async page => {
      await page.goto(page.baseUrl);
      await page.getByRole("heading", { name: "Sandbox neutra de QA" }).waitFor();
      await page.getByRole("status").getByText("Pronta para testes").waitFor();
    },
  },
  {
    id: "SANDBOX-002",
    title: "Validar campo obrigatório",
    run: async page => {
      await page.goto(page.baseUrl);
      await page.getByRole("button", { name: "Adicionar item" }).click();
      await page.getByRole("alert").getByText("Informe o nome do item.").waitFor();
    },
  },
  {
    id: "SANDBOX-003",
    title: "Criar e filtrar item",
    run: async page => {
      await page.goto(page.baseUrl);
      await page.getByLabel("Nome do item").fill("Registro neutro 001");
      await page.getByRole("button", { name: "Adicionar item" }).click();
      await page.getByText("Registro neutro 001").waitFor();
      await page.reload();
      await page.getByLabel("Filtrar itens").fill("inexistente");
      await page.getByText("Nenhum item encontrado").waitFor();
      await page.getByLabel("Filtrar itens").fill("neutro");
      await page.getByText("Registro neutro 001").waitFor();
    },
  },
  {
    id: "SANDBOX-004",
    title: "Baixar relatório",
    run: async page => {
      await page.goto(page.baseUrl);
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Baixar relatório" }).click();
      const download = await downloadPromise;
      if (download.suggestedFilename() !== "relatorio-sandbox.csv") throw new Error("Nome do download inesperado.");
    },
  },
];

async function main() {
  const server = await startSandbox();
  const port = server.address().port;
  const executablePath = process.env.PLAYWRIGHT_CHROME_EXECUTABLE_PATH?.trim();
  const browser = await chromium.launch(executablePath ? { executablePath, headless: true } : { channel: "chrome", headless: true });
  const results = [];
  try {
    for (const scenario of scenarios) {
      const context = await browser.newContext({ acceptDownloads: true });
      const page = await context.newPage();
      page.baseUrl = `http://127.0.0.1:${port}`;
      const startedAt = Date.now();
      try {
        await scenario.run(page);
        results.push({ id: scenario.id, title: scenario.title, status: "PASSOU", durationMs: Date.now() - startedAt });
      } catch (error) {
        results.push({ id: scenario.id, title: scenario.title, status: "FALHOU", durationMs: Date.now() - startedAt, error: error.message });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }

  const report = { generatedAt: new Date().toISOString(), suite: "qa-sandbox-neutral", results };
  const outputDirectory = path.resolve("artifacts", "qa-sandbox");
  fs.mkdirSync(outputDirectory, { recursive: true });
  const reportPath = path.join(outputDirectory, "latest.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  for (const result of results) console.log(`${result.status.padEnd(6)} ${result.id} — ${result.title}`);
  console.log(`Relatório: ${reportPath}`);
  if (results.some(result => result.status !== "PASSOU")) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
