import { describe, expect, it, vi } from "vitest";
import { fetchSigTestQueue, normalizeSigTestQueue } from "./sigMcpService";

describe("fila de testes do SIG", () => {
  it("normaliza sprints liberadas com nomes alternativos", () => {
    const items = normalizeSigTestQueue({
      structuredContent: {
        fila: [{
          id_projeto: 12,
          nome_projeto: "Portal do Cidadão",
          id_sprint: 34,
          nome_sprint: "Sprint Agosto",
          situacao: "Liberada para Teste",
          prioridade: "Alta",
          responsavel: "Equipe QA",
          data_liberacao: "2026-08-08T10:00:00Z",
          total_cards: 7,
        }],
      },
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      projectId: "12",
      projectName: "Portal do Cidadão",
      sprintId: "34",
      sprintName: "Sprint Agosto",
      status: "Liberada para Teste",
      priority: "Alta",
      responsible: "Equipe QA",
      cardCount: 7,
    });
  });

  it("detecta e chama automaticamente a ferramenta da fila", async () => {
    const calledTools: string[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.method === "initialize") {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26" } }), {
          status: 200,
          headers: { "content-type": "application/json", "mcp-session-id": "queue-session" },
        });
      }
      if (body.method === "notifications/initialized") return new Response("", { status: 202 });
      if (body.method === "tools/list") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          result: { tools: [
            { name: "listar_cards", description: "Lista cards" },
            { name: "fila_sprints_liberadas_teste", description: "Lista a fila de sprints prontas para QA" },
          ] },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      calledTools.push(body.params.name);
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        result: { content: [{ type: "text", text: JSON.stringify([{ sprintId: "55", sprintName: "Sprint 55", projectName: "SIG" }]) }] },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const result = await fetchSigTestQueue({
      connection: { endpointUrl: "https://sig.example/mcp", username: "qa", password: "secret", projectId: "0", sprintId: "0" },
      fetchImpl,
    });

    expect(result.toolName).toBe("fila_sprints_liberadas_teste");
    expect(calledTools).toEqual(["fila_sprints_liberadas_teste"]);
    expect(result.items[0]).toMatchObject({ sprintId: "55", sprintName: "Sprint 55" });
  });
});
