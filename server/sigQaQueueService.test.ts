import { describe, expect, it, vi } from "vitest";
import { fetchSigReleasedQueue } from "./sigQaQueueService";

describe("fila liberada da API SIG", () => {
  it("autentica, pagina e normaliza as sprints liberadas", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      if (String(url).endsWith("/login")) {
        return new Response(JSON.stringify({ access_token: "temporary-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        data: [{
          PRO_NOME: "Projeto QA",
          VER_NOME: "Sprint 13",
          COD_VERSAO: 20496,
          COD_PROJETO: 440,
          LIB_TESTE: "28/07/2026",
          PRAZO_TESTE: "30/07/2026",
          QUANTIDADE_REQ: 5,
        }],
        pagination: { page: 1, totalPages: 1, totalItems: 1 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const result = await fetchSigReleasedQueue({
      endpointUrl: "https://sig.example/mcp",
      username: "qa",
      password: "secret",
      fetchImpl,
    });

    expect(result.items[0]).toMatchObject({
      projectId: "440",
      projectName: "Projeto QA",
      sprintId: "20496",
      sprintName: "Sprint 13",
      releasedAt: "28/07/2026",
      dueDate: "30/07/2026",
      cardCount: 5,
    });
    expect(requests[1].init?.headers).toMatchObject({ Authorization: "Bearer temporary-token" });
    expect(JSON.parse(String(requests[1].init?.body))).toMatchObject({ page: 1, pageSize: 100, sort: "LIB_TESTE" });
  });

  it("não inclui a senha nos erros da API", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "Acesso negado" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

    await expect(fetchSigReleasedQueue({
      endpointUrl: "https://sig.example/mcp",
      username: "qa",
      password: "test-password",
      fetchImpl,
    })).rejects.toThrow("Acesso negado");
  });
});
