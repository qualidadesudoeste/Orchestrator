import { describe, expect, it, vi } from "vitest";
import { buildSigToolArguments, fetchSigCards, normalizeSigCards } from "./sigMcpService";

describe("integração SIG MCP", () => {
  it("abre sessão, descobre a ferramenta e normaliza os cards", async () => {
    const requests: Array<{ method: string; headers: Headers; body: any }> = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const headers = new Headers(init?.headers);
      requests.push({ method: body.method, headers, body });
      if (body.method === "initialize") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: { protocolVersion: "2025-03-26", serverInfo: { name: "sig", version: "1" } },
        }), { status: 200, headers: { "content-type": "application/json", "mcp-session-id": "session-123" } });
      }
      if (body.method === "notifications/initialized") return new Response("", { status: 202 });
      if (body.method === "tools/list") {
        return new Response(`event: message\ndata: ${JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          result: { tools: [{ name: "listar_cards_sprint", description: "Lista cards da sprint", inputSchema: { type: "object", properties: {} } }] },
        })}\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } });
      }
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        result: {
          content: [{ type: "text", text: JSON.stringify({ cards: [{ id: 91, titulo: "Consultar protocolo", descricao: "Como cidadão...", criterios_aceite: ["Exibir status"], situacao: "Aberto" }] }) }],
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const result = await fetchSigCards({
      connection: {
        endpointUrl: "https://sig.example/mcp",
        username: "qa",
        password: "secret",
        projectId: "12",
        sprintId: "34",
      },
      fetchImpl,
    });

    expect(result.toolName).toBe("listar_cards_sprint");
    expect(result.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "91", title: "Consultar protocolo", status: "Aberto" }),
    ]));
    expect(requests.map(request => request.method)).toEqual([
      "initialize", "notifications/initialized", "tools/list", "tools/call",
    ]);
    expect(requests[0].headers.get("X-SIG-User")).toBe("qa");
    expect(requests[2].headers.get("mcp-session-id")).toBe("session-123");
  });

  it("mapeia nomes alternativos de projeto e sprint no schema da ferramenta", () => {
    expect(buildSigToolArguments({
      name: "cards",
      inputSchema: { properties: { id_projeto: {}, sprintId: {}, filtro: {} } },
    }, "77", "88")).toEqual({ id_projeto: "77", sprintId: "88" });
  });

  it("normaliza conteúdo estruturado", () => {
    const cards = normalizeSigCards({
      structuredContent: { items: [{ codigo: "SIG-1", nome: "Card estruturado", detalhes: "Detalhes" }] },
    });
    expect(cards[0]).toMatchObject({ id: "SIG-1", title: "Card estruturado", description: "Detalhes" });
  });
});
