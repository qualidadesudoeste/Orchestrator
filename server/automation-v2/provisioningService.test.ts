import { describe, expect, it, vi } from "vitest";
import { requestQaProvisioning } from "./provisioningService";

describe("ponte de provisionamento QA", () => {
  it("envia contrato idempotente sem expor o token no corpo", async () => {
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => new Response(JSON.stringify({
      resolved: true,
      message: "Massa criada",
      testData: { PROTOCOLO: "QA-123" },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await requestQaProvisioning({ endpointUrl: "https://qa.example.test/bridge", token: "segredo" }, {
      action: "PREPARE_STATE",
      runId: "run-1",
      scenarioId: "CT-1",
      objective: "Criar registro vencido",
      category: "BUSINESS_DATA",
      availableTestDataKeys: [],
    }, fetchMock as typeof fetch);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer segredo");
    expect(String(init.body)).not.toContain("segredo");
    expect(result.testData.PROTOCOLO).toBe("QA-123");
  });

  it("rejeita protocolos que não sejam HTTP", async () => {
    await expect(requestQaProvisioning({ endpointUrl: "file:///tmp/bridge" }, {
      action: "PREPARE_STATE", runId: "r", scenarioId: "s", objective: "x", availableTestDataKeys: [],
    })).rejects.toThrow("HTTP ou HTTPS");
  });
});
