import { describe, expect, it } from "vitest";
import {
  executionArtifactGuidance,
  hasExecutionArtifact,
  hasScenarioArtifact,
  storeExecutionArtifact,
} from "./executionArtifactService";

describe("executionArtifactService", () => {
  it("isola valores iguais por cenário sem conhecer o domínio testado", () => {
    const data: Record<string, string> = {};
    const first = storeExecutionArtifact(data, "CT-001", "identificador", "A-100");
    const second = storeExecutionArtifact(data, "CT-002", "identificador", "B-200");
    expect(first).toContain("ARTEFATO_CT_001_IDENTIFICADOR");
    expect(second).toContain("ARTEFATO_CT_002_IDENTIFICADOR");
    expect(data.ARTEFATO_CT_001_IDENTIFICADOR).toBe("A-100");
    expect(data.ARTEFATO_CT_002_IDENTIFICADOR).toBe("B-200");
    expect(data.ULTIMO_IDENTIFICADOR).toBe("B-200");
    expect(hasExecutionArtifact(data, "identificador")).toBe(true);
    expect(hasScenarioArtifact(data, "CT-001", "identificador")).toBe(true);
    expect(hasScenarioArtifact(data, "CT-003", "identificador")).toBe(false);
  });

  it("orienta captura e consumo somente pelas chaves, sem revelar valores", () => {
    const guidance = executionArtifactGuidance(
      "Cenário: Consultar pedido\nDado um código criado anteriormente\nEntão o arquivo fica disponível",
      ["ARTEFATO_CT_001_CODIGO", "ARTEFATO_CT_002_URL", "CPF_VALIDO"],
      { produces: ["arquivo"], consumes: ["código"] },
    );
    expect(guidance).toContain("CODIGO");
    expect(guidance).toContain("ARQUIVO");
    expect(guidance).toContain("ARTEFATO_CT_001_CODIGO");
    expect(guidance).not.toContain("CPF_VALIDO");
  });

  it("normaliza chaves fornecidas pelo agente e limita o namespace", () => {
    const data: Record<string, string> = {};
    const keys = storeExecutionArtifact(data, "cenário externo / 01", "Número da referência", "REF-9");
    expect(keys).toEqual([
      "NUMERO_DA_REFERENCIA",
      "ARTEFATO_CENARIO_EXTERNO_01_NUMERO_DA_REFERENCIA",
      "ULTIMO_NUMERO_DA_REFERENCIA",
    ]);
    expect(keys.every(key => key.length <= 80)).toBe(true);
  });
});
