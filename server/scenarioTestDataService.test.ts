import { describe, expect, it } from "vitest";
import {
  chainedTestDataGuidance,
  extractCreatedProtocol,
  protocolTestDataKeys,
  scenarioCreatesBusinessRecord,
  storeScenarioProtocol,
} from "./scenarioTestDataService";

const scenario = [
  "Cenário: Cadastrar denúncia com anexos e audiência",
  "Dado que estou na tela de nova denúncia",
  "Quando preencho os dados, adiciono anexos, informo audiência e confirmo o cadastro",
  "Então a denúncia fica registrada",
].join("\n");

describe("scenarioTestDataService", () => {
  it("reconhece somente o cenário que cria o registro de negócio", () => {
    expect(scenarioCreatesBusinessRecord(scenario)).toBe(true);
    expect(scenarioCreatesBusinessRecord("Cenário: Consultar denúncia\nQuando consulto pelo protocolo")).toBe(false);
  });

  it("captura protocolo somente em confirmação ou detalhe, não em uma grade genérica", () => {
    expect(extractCreatedProtocol("Cadastro realizado com sucesso. Denúncia R2026-12345")).toBe("R2026-12345");
    expect(extractCreatedProtocol("Registro salvo. Protocolo: R2026-99999")).toBe("R2026-99999");
    expect(extractCreatedProtocol("Listagem Protocolo R2026-00001 Status Pendente")).toBeUndefined();
  });

  it("armazena protocolo por cenário e por característica do registro", () => {
    const data: Record<string, string> = {};
    const keys = storeScenarioProtocol(data, "DEN-002", scenario, "R2026-12345");
    expect(keys).toEqual(expect.arrayContaining([
      "DEN_002_PROTOCOLO",
      "PROTOCOLO_COM_ANEXOS",
      "PROTOCOLO_COM_AUDIENCIA",
    ]));
    expect(data.DEN_002_PROTOCOLO).toBe("R2026-12345");
    expect(data.PROTOCOLO).toBe("R2026-12345");
  });

  it("prioriza o protocolo compatível no cenário dependente", () => {
    const keys = protocolTestDataKeys("DEN-002", scenario);
    const guidance = chainedTestDataGuidance(
      "Cenário: Consultar anexos e audiência",
      [...keys, "DEN_001_PROTOCOLO"],
    );
    expect(guidance).toContain("PROTOCOLO_COM_ANEXOS");
    expect(guidance).toContain("PROTOCOLO_COM_AUDIENCIA");
    expect(guidance).not.toContain("R2026");
  });
});
