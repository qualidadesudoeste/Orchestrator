import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PlaywrightPilotRuntime } from "./qaPilotRuntime";

let server: Server | undefined;
let outputDirectory: string | undefined;

afterEach(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  if (outputDirectory) await rm(outputDirectory, { recursive: true, force: true });
  server = undefined;
  outputDirectory = undefined;
});

describe("PlaywrightPilotRuntime universal browser surfaces", () => {
  it("observa frames e Shadow DOM, estrutura tabelas e controla pop-ups", async () => {
    server = createServer((request, response) => {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      if (request.url === "/frame") {
        response.end(`<!doctype html><html><body>
          <label for="internal">Campo interno</label><input id="internal">
          <button onclick="document.querySelector('#result').textContent='Confirmado no frame'">Confirmar frame</button>
          <p id="result"></p>
        </body></html>`);
        return;
      }
      if (request.url === "/popup") {
        response.end("<!doctype html><html><head><title>Painel secundário</title></head><body><h1>Conteúdo do pop-up</h1></body></html>");
        return;
      }
      response.end(`<!doctype html><html><head><title>Aplicação universal</title></head><body>
        <button onclick="window.open('/popup', '_blank')">Abrir painel</button>
        <iframe name="detalhes" src="/frame"></iframe>
        <qa-widget></qa-widget>
        <table aria-label="Itens"><thead><tr><th>Código</th><th>Nome</th></tr></thead>
          <tbody><tr><td>A-1</td><td>Primeiro item</td></tr></tbody></table>
        <script>
          customElements.define('qa-widget', class extends HTMLElement {
            connectedCallback() {
              const root = this.attachShadow({ mode: 'open' });
              root.innerHTML = '<button aria-label="Ação sombreada">Executar</button><span id="shadow-result"></span>';
              root.querySelector('button').addEventListener('click', () => root.querySelector('#shadow-result').textContent = 'Executado no Shadow DOM');
            }
          });
        </script>
      </body></html>`);
    });
    await new Promise<void>((resolve, reject) => server!.listen(0, "127.0.0.1", resolve).once("error", reject));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Servidor de teste sem porta TCP.");
    const url = `http://127.0.0.1:${address.port}`;
    outputDirectory = await mkdtemp(path.join(os.tmpdir(), "orchestrator-runtime-universal-"));
    const runtime = new PlaywrightPilotRuntime({
      runId: "universal-run",
      scenarioId: "CT-UNIVERSAL",
      title: "Testar superfícies universais",
      gherkin: "Cenário: Superfícies universais\nDado uma aplicação web\nQuando interajo com suas superfícies\nEntão observo os resultados",
      environments: [{ name: "Sandbox", url }],
      outputDirectory,
      headless: true,
    });
    try {
      const navigation = await runtime.execute("browser_navigate", { url }, 1);
      const observation = navigation.output as any;
      const frameInput = observation.elements.find((item: any) => item.name === "Campo interno");
      const frameButton = observation.elements.find((item: any) => item.name === "Confirmar frame");
      const shadowButton = observation.elements.find((item: any) => item.name === "Ação sombreada");
      expect(frameInput).toMatchObject({ frameName: "detalhes" });
      expect(frameButton).toMatchObject({ frameName: "detalhes" });
      expect(shadowButton).toBeTruthy();

      const clickedShadow = await runtime.execute("browser_click", { ref: shadowButton.ref }, 2);
      expect(JSON.stringify(clickedShadow.output)).toContain("Executado no Shadow DOM");

      const remapped = await runtime.execute("browser_observe", {}, 3);
      const currentFrameInput = (remapped.output as any).elements.find((item: any) => item.name === "Campo interno");
      const currentFrameButton = (remapped.output as any).elements.find((item: any) => item.name === "Confirmar frame");
      await runtime.execute("browser_fill", { ref: currentFrameInput.ref, value: "valor" }, 4);
      const clickedFrame = await runtime.execute("browser_click", { ref: currentFrameButton.ref }, 5);
      expect(JSON.stringify(clickedFrame.output)).toContain("Confirmado no frame");

      const tables = await runtime.execute("browser_inspect_table", { query: "Primeiro item" }, 6);
      expect(tables.output).toMatchObject({
        tables: [expect.objectContaining({ headers: ["Código", "Nome"], rows: [["A-1", "Primeiro item"]] })],
      });

      const refreshed = await runtime.execute("browser_observe", {}, 7);
      const popupButton = (refreshed.output as any).elements.find((item: any) => item.name === "Abrir painel");
      const popup = await runtime.execute("browser_click", { ref: popupButton.ref }, 8);
      expect(popup.output).toMatchObject({ title: "Painel secundário" });
      const tabs = await runtime.execute("browser_tabs", {}, 9);
      expect((tabs.output as any).tabs).toHaveLength(2);
      const original = await runtime.execute("browser_switch_tab", { index: 0 }, 10);
      expect(original.output).toMatchObject({ title: "Aplicação universal" });
    } finally {
      await runtime.close();
    }
  }, 40_000);
});
