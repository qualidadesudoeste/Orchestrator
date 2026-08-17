import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateEvidenceDocxArtifact } from "./evidenceDocxRoutes";

const generatedFiles: string[] = [];

afterEach(async () => {
  await Promise.all(generatedFiles.splice(0).map(filepath => fs.rm(filepath, { force: true })));
});

describe("evidencia DOCX interna", () => {
  it("gera o documento e devolve uma URL persistivel para o historico", async () => {
    const result = await generateEvidenceDocxArtifact({
      execution_id: "execucao-teste-docx",
      projeto: "Projeto QA",
      sprint: "Sprint 1",
      resultados: [{
        scenario_id: "CT-001",
        scenario_title: "Exibir fila",
        cenario: "Cenario: Exibir fila\nDado que acesso o sistema\nEntao visualizo a fila",
        status: "PASSOU",
        resultado_teste: {
          resumo: "Fila exibida.",
          passos: [],
          evidencias: [],
          falhas_reais: [],
          falhas_automacao: [],
        },
      }],
    }, "http://localhost:3000");

    expect(result.evidence_docx.download_url).toContain("/api/qa/evidence-docx/");
    expect(result.evidence_docx.scenarios).toBe(1);
    const filepath = path.resolve("artifacts", "evidence-docx", "agent", result.evidence_docx.filename);
    generatedFiles.push(filepath);
    const bytes = await fs.readFile(filepath);
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    expect(bytes.length).toBeGreaterThan(1_000);
  });
});
