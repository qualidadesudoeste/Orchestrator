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

describe("PlaywrightPilotRuntime upload", () => {
  it("anexa uma imagem sintética e confirma o arquivo na interface", async () => {
    server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><html><body>
        <label for="attachment">Anexos</label>
        <input id="attachment" type="file" accept=".jpg,.jpeg,.png" hidden>
        <p id="selected">Nenhum anexo</p>
        <script>document.querySelector('#attachment').addEventListener('change', event => {
          document.querySelector('#selected').textContent = event.target.files[0]?.name || 'Nenhum anexo';
          event.target.value = '';
        });</script>
      </body></html>`);
    });
    await new Promise<void>((resolve, reject) => server!.listen(0, "127.0.0.1", resolve).once("error", reject));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Servidor de teste sem porta TCP.");
    const url = `http://127.0.0.1:${address.port}`;
    outputDirectory = await mkdtemp(path.join(os.tmpdir(), "orchestrator-runtime-upload-"));
    const runtime = new PlaywrightPilotRuntime({
      runId: "upload-run",
      scenarioId: "DEN-002",
      title: "Cadastrar denúncia com anexo",
      gherkin: "Cenário: Cadastrar denúncia com anexo\nDado nova denúncia\nQuando adiciono anexo\nEntão o anexo fica registrado",
      environments: [{ name: "Sandbox", url }],
      outputDirectory,
      headless: true,
    });
    try {
      await runtime.execute("browser_navigate", { url }, 1);
      const execution = await runtime.execute("browser_upload_test_file", { label: "Anexos" }, 2);
      expect(execution.output).toMatchObject({
        uploaded: true,
        mimeType: "image/png",
        fixtureKind: "PNG",
        visibleConfirmation: true,
      });
      expect(JSON.stringify(execution.output)).toContain("qa-upload-run-den-002.png");
    } finally {
      await runtime.close();
    }
  }, 30_000);
});
