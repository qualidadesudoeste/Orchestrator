import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ENV } from "./_core/env";
import {
  materializeWorkerArtifactReferences,
  resolveWorkerArtifactReference,
  workerArtifactReference,
} from "./workerArtifactRoutes";
import { generateRemoteExecutionArtifacts, replaceArtifactReferences } from "./workerArtifactClient";

const originalApiUrl = ENV.orchestratorApiUrl;
const originalToken = ENV.qaAgentApiToken;
const originalFetch = global.fetch;

afterEach(() => {
  ENV.orchestratorApiUrl = originalApiUrl;
  ENV.qaAgentApiToken = originalToken;
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("artefatos compartilhados do worker", () => {
  it("aceita somente referências internas canônicas", () => {
    const reference = workerArtifactReference("web-123", "captura final.png");
    expect(reference).toMatch(/^worker-artifact:\/\/web-123\//);
    expect(resolveWorkerArtifactReference(reference)).toContain(path.join("worker-shared", "web-123"));
    expect(resolveWorkerArtifactReference("worker-artifact://../../segredo.txt")).toBeUndefined();
    expect(materializeWorkerArtifactReferences({ evidence: reference })).toEqual({
      evidence: resolveWorkerArtifactReference(reference),
    });
  });

  it("substitui referências internas por links públicos no resultado persistido", () => {
    const urls = new Map([["worker-artifact://exec/file.png", "https://qa.example.test/file.png"]]);
    expect(replaceArtifactReferences({ items: ["worker-artifact://exec/file.png"] }, urls))
      .toEqual({ items: ["https://qa.example.test/file.png"] });
  });

  it("envia evidência uma vez e gera relatório e DOCX na API", async () => {
    const directory = path.resolve("artifacts", "test-worker-share");
    const screenshot = path.join(directory, "captura.png");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(screenshot, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]));
    ENV.orchestratorApiUrl = "https://qa.example.test";
    ENV.qaAgentApiToken = "token-de-teste-com-tamanho-suficiente";
    const reference = "worker-artifact://exec-1/shared.png";
    const publicUrl = "https://qa.example.test/api/qa/worker-artifacts/exec-1/shared.png?signature=test";
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/worker-artifacts/")) {
        return new Response(JSON.stringify({ reference, downloadUrl: publicUrl }), { status: 201 });
      }
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (url.endsWith("/reliability-reports")) {
        expect(JSON.stringify(body)).toContain(reference);
        return new Response(JSON.stringify({ ...body, reliability_report: { download_url: "https://qa.example.test/report" } }), { status: 201 });
      }
      return new Response(JSON.stringify({ ...body, evidence_docx: { download_url: "https://qa.example.test/docx" } }), { status: 201 });
    });
    global.fetch = fetchMock as typeof fetch;
    try {
      const generated = await generateRemoteExecutionArtifacts({
        execution_id: "exec-1",
        resultados: [{
          resultado_teste: {
            evidencias: [{ caminho: screenshot }],
            tentativas: [{ evidencias: [{ caminho: screenshot }] }],
            falhas_automacao: [],
          },
        }],
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(generated.resultados[0].resultado_teste.evidencias[0].caminho).toBe(publicUrl);
      expect(generated.evidence_docx.download_url).toContain("/docx");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
