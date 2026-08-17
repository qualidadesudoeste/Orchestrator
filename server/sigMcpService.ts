type FetchLike = typeof fetch;

export type SigMcpTool = {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
};

export type SigCard = {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  status: string;
  type: string;
  updatedAt: string | null;
  rawJson: string;
};

export type SigTestQueueItem = {
  id: string;
  projectId: string;
  projectName: string;
  sprintId: string;
  sprintName: string;
  clientName: string;
  status: string;
  priority: string;
  responsible: string;
  releasedAt: string | null;
  dueDate: string | null;
  cardCount: number | null;
  rawJson: string;
};

export type SigMcpConnection = {
  endpointUrl: string;
  username: string;
  password: string;
  projectId: string;
  sprintId: string;
};

type RpcEnvelope = {
  jsonrpc?: string;
  id?: number | string | null;
  result?: any;
  error?: { code?: number; message?: string; data?: unknown };
};

function parseResponse(text: string, contentType: string): RpcEnvelope | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (contentType.includes("text/event-stream") || trimmed.startsWith("event:")) {
    const messages = trimmed
      .split(/\r?\n\r?\n/)
      .flatMap(block => block.split(/\r?\n/).filter(line => line.startsWith("data:")))
      .map(line => line.slice(5).trim())
      .filter(Boolean)
      .map(data => JSON.parse(data) as RpcEnvelope);
    return messages.find(message => message.result !== undefined || message.error) ?? messages.at(-1) ?? null;
  }
  return JSON.parse(trimmed) as RpcEnvelope;
}

async function rpcRequest(input: {
  fetchImpl: FetchLike;
  connection: SigMcpConnection;
  method: string;
  params?: Record<string, unknown>;
  id?: number;
  sessionId?: string;
}) {
  const response = await input.fetchImpl(input.connection.endpointUrl, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "X-SIG-User": input.connection.username,
      "X-SIG-Password": input.connection.password,
      "X-SIG-Project-Id": input.connection.projectId,
      "X-SIG-Sprint-Id": input.connection.sprintId,
      ...(input.sessionId ? { "mcp-session-id": input.sessionId } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      ...(input.id === undefined ? {} : { id: input.id }),
      method: input.method,
      ...(input.params === undefined ? {} : { params: input.params }),
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`SIG MCP respondeu HTTP ${response.status}${text ? `: ${text.slice(0, 300)}` : ""}`);
  }
  const payload = parseResponse(text, response.headers.get("content-type") ?? "");
  if (payload?.error) throw new Error(`SIG MCP: ${payload.error.message ?? "erro JSON-RPC"}`);
  return {
    result: payload?.result,
    sessionId: response.headers.get("mcp-session-id") ?? input.sessionId ?? "",
  };
}

async function openSession(connection: SigMcpConnection, fetchImpl: FetchLike) {
  const initialized = await rpcRequest({
    fetchImpl,
    connection,
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "Orchestrator SIG Integration", version: "1.0.0" },
    },
  });
  if (!initialized.sessionId) throw new Error("O SIG MCP não retornou o header mcp-session-id.");
  await rpcRequest({
    fetchImpl,
    connection,
    sessionId: initialized.sessionId,
    method: "notifications/initialized",
  });
  return {
    sessionId: initialized.sessionId,
    serverInfo: initialized.result?.serverInfo ?? null,
    protocolVersion: initialized.result?.protocolVersion ?? "2025-03-26",
  };
}

export async function listSigMcpTools(connection: SigMcpConnection, fetchImpl: FetchLike = fetch) {
  const session = await openSession(connection, fetchImpl);
  const listed = await rpcRequest({
    fetchImpl,
    connection,
    sessionId: session.sessionId,
    id: 2,
    method: "tools/list",
    params: {},
  });
  const tools = Array.isArray(listed.result?.tools) ? listed.result.tools as SigMcpTool[] : [];
  return { ...session, tools };
}

function normalizeKey(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function buildSigToolArguments(tool: SigMcpTool, projectId: string, sprintId: string) {
  const properties = tool.inputSchema?.properties ?? {};
  const args: Record<string, string> = {};
  for (const propertyName of Object.keys(properties)) {
    const key = normalizeKey(propertyName);
    if (["projectid", "idproject", "idprojeto", "projetoid", "project"].includes(key)) args[propertyName] = projectId;
    if (["sprintid", "idsprint", "sprint"].includes(key)) args[propertyName] = sprintId;
  }
  return args;
}

function parseJsonText(text: string): unknown | null {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(normalized); } catch {}
  const arrayStart = normalized.indexOf("[");
  const arrayEnd = normalized.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    try { return JSON.parse(normalized.slice(arrayStart, arrayEnd + 1)); } catch {}
  }
  const objectStart = normalized.indexOf("{");
  const objectEnd = normalized.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    try { return JSON.parse(normalized.slice(objectStart, objectEnd + 1)); } catch {}
  }
  return null;
}

function valuesFromToolResult(result: any): unknown[] {
  const values: unknown[] = [];
  if (result?.structuredContent !== undefined) values.push(result.structuredContent);
  for (const block of Array.isArray(result?.content) ? result.content : []) {
    if (block?.type === "text" && typeof block.text === "string") {
      values.push(parseJsonText(block.text) ?? block.text);
    }
  }
  if (!values.length && result !== undefined) values.push(result);
  return values;
}

const TITLE_KEYS = ["title", "titulo", "name", "nome", "summary", "resumo", "assunto"];
const ID_KEYS = ["id", "cardId", "card_id", "codigo", "code", "key", "numero"];
const DESCRIPTION_KEYS = ["description", "descricao", "body", "conteudo", "detalhes", "userStory", "historiaUsuario", "historia"];
const ACCEPTANCE_KEYS = ["acceptanceCriteria", "acceptance_criteria", "criteriosAceite", "criterios_aceite", "criterios", "resultadoEsperado"];
const SPRINT_ID_KEYS = ["sprintId", "sprint_id", "idSprint", "id_sprint", "codigoSprint"];
const SPRINT_NAME_KEYS = ["sprintName", "sprint_name", "nomeSprint", "nome_sprint", "sprint", "title", "titulo", "name", "nome"];
const PROJECT_ID_KEYS = ["projectId", "project_id", "idProject", "idProjeto", "id_projeto", "codigoProjeto"];
const PROJECT_NAME_KEYS = ["projectName", "project_name", "nomeProject", "nomeProjeto", "nome_projeto", "project", "projeto"];

function readValue(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const match = Object.keys(record).find(candidate => normalizeKey(candidate) === normalizeKey(key));
    if (match && record[match] != null) {
      const value = record[match];
      return typeof value === "string" ? value : JSON.stringify(value);
    }
  }
  return "";
}

function collectRecords(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 5 || value == null) return [];
  if (Array.isArray(value)) {
    const direct = value.filter(item => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown>[];
    if (direct.some(item => readValue(item, TITLE_KEYS))) return direct;
    return value.flatMap(item => collectRecords(item, depth + 1));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (readValue(record, TITLE_KEYS)) return [record];
    return Object.values(record).flatMap(item => collectRecords(item, depth + 1));
  }
  return [];
}

export function normalizeSigCards(toolResult: unknown): SigCard[] {
  const records = valuesFromToolResult(toolResult).flatMap(value => collectRecords(value));
  const seen = new Set<string>();
  return records.slice(0, 300).flatMap((record, index) => {
    const title = readValue(record, TITLE_KEYS).trim();
    if (!title) return [];
    const id = readValue(record, ID_KEYS).trim() || `SIG-${index + 1}`;
    const unique = `${id}::${title}`;
    if (seen.has(unique)) return [];
    seen.add(unique);
    return [{
      id,
      title,
      description: readValue(record, DESCRIPTION_KEYS),
      acceptanceCriteria: readValue(record, ACCEPTANCE_KEYS),
      status: readValue(record, ["status", "situacao", "state"]),
      type: readValue(record, ["type", "tipo", "category", "categoria"]),
      updatedAt: readValue(record, ["updatedAt", "updated_at", "dataAtualizacao", "alteradoEm"]) || null,
      rawJson: JSON.stringify(record).slice(0, 30_000),
    }];
  });
}


function collectQueueRecords(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 5 || value == null) return [];
  if (Array.isArray(value)) {
    const direct = value.filter(item => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown>[];
    if (direct.some(item => readValue(item, SPRINT_ID_KEYS) || readValue(item, SPRINT_NAME_KEYS))) return direct;
    return value.flatMap(item => collectQueueRecords(item, depth + 1));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (readValue(record, SPRINT_ID_KEYS) || (readValue(record, SPRINT_NAME_KEYS) && readValue(record, PROJECT_NAME_KEYS))) return [record];
    return Object.values(record).flatMap(item => collectQueueRecords(item, depth + 1));
  }
  return [];
}

function readNumber(record: Record<string, unknown>, keys: string[]): number | null {
  const value = readValue(record, keys);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeSigTestQueue(toolResult: unknown): SigTestQueueItem[] {
  const records = valuesFromToolResult(toolResult).flatMap(value => collectQueueRecords(value));
  const seen = new Set<string>();
  return records.slice(0, 500).flatMap((record, index) => {
    const sprintId = readValue(record, SPRINT_ID_KEYS).trim();
    const sprintName = readValue(record, SPRINT_NAME_KEYS).trim();
    const projectId = readValue(record, PROJECT_ID_KEYS).trim();
    const projectName = readValue(record, PROJECT_NAME_KEYS).trim();
    if (!sprintId && !sprintName) return [];
    const id = sprintId || `${projectId || projectName || "SIG"}-${index + 1}`;
    const unique = `${projectId}::${id}::${sprintName}`;
    if (seen.has(unique)) return [];
    seen.add(unique);
    return [{
      id,
      projectId,
      projectName: projectName || "Projeto não informado",
      sprintId: sprintId || id,
      sprintName: sprintName || `Sprint ${id}`,
      clientName: readValue(record, ["clientName", "client_name", "cliente", "nomeCliente", "customer"]),
      status: readValue(record, ["status", "situacao", "state", "fase"]) || "Liberada para teste",
      priority: readValue(record, ["priority", "prioridade", "urgency", "criticidade"]),
      responsible: readValue(record, ["responsible", "responsavel", "assignee", "analista", "qa"]),
      releasedAt: readValue(record, ["releasedAt", "released_at", "dataLiberacao", "liberadoEm", "createdAt"]) || null,
      dueDate: readValue(record, ["dueDate", "due_date", "prazo", "dataLimite", "deadline"]) || null,
      cardCount: readNumber(record, ["cardCount", "card_count", "totalCards", "quantidadeCards", "itemsCount"]),
      rawJson: JSON.stringify(record).slice(0, 30_000),
    }];
  });
}

function scoreCardsTool(tool: SigMcpTool): number {
  const text = normalizeKey(`${tool.name} ${tool.description ?? ""}`);
  let score = 0;
  if (/card|issue|ticket|tarefa|historia|backlog/.test(text)) score += 10;
  if (/list|listar|search|buscar|consultar|get/.test(text)) score += 5;
  if (/sprint/.test(text)) score += 3;
  return score;
}

export async function fetchSigCards(input: {
  connection: SigMcpConnection;
  cardsToolName?: string | null;
  fetchImpl?: FetchLike;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const discovery = await listSigMcpTools(input.connection, fetchImpl);
  const selected = input.cardsToolName
    ? discovery.tools.find(tool => tool.name === input.cardsToolName)
    : [...discovery.tools].sort((a, b) => scoreCardsTool(b) - scoreCardsTool(a))[0];
  if (!selected) throw new Error("Nenhuma ferramenta foi disponibilizada pelo SIG MCP.");
  if (!input.cardsToolName && scoreCardsTool(selected) === 0) {
    throw new Error("Não foi possível identificar automaticamente a ferramenta de cards. Configure-a em Parâmetros > SIG.");
  }
  const called = await rpcRequest({
    fetchImpl,
    connection: input.connection,
    sessionId: discovery.sessionId,
    id: 3,
    method: "tools/call",
    params: {
      name: selected.name,
      arguments: buildSigToolArguments(selected, input.connection.projectId, input.connection.sprintId),
    },
  });
  if (called.result?.isError) {
    const detail = valuesFromToolResult(called.result).map(value => typeof value === "string" ? value : JSON.stringify(value)).join(" ");
    throw new Error(`A ferramenta ${selected.name} retornou erro${detail ? `: ${detail.slice(0, 500)}` : ""}`);
  }
  return {
    toolName: selected.name,
    tools: discovery.tools,
    cards: normalizeSigCards(called.result),
  };
}


function scoreTestQueueTool(tool: SigMcpTool): number {
  const text = normalizeKey(`${tool.name} ${tool.description ?? ""}`);
  let score = 0;
  if (/fila|queue/.test(text)) score += 15;
  if (/sprint/.test(text)) score += 8;
  if (/liberad|released|ready|teste|test/.test(text)) score += 7;
  if (/list|listar|search|buscar|consultar|get/.test(text)) score += 3;
  if (/card|issue|ticket/.test(text) && !/sprint/.test(text)) score -= 5;
  return score;
}

export async function fetchSigTestQueue(input: {
  connection: SigMcpConnection;
  queueToolName?: string | null;
  fetchImpl?: FetchLike;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const discovery = await listSigMcpTools(input.connection, fetchImpl);
  const selected = input.queueToolName
    ? discovery.tools.find(tool => tool.name === input.queueToolName)
    : [...discovery.tools].sort((a, b) => scoreTestQueueTool(b) - scoreTestQueueTool(a))[0];
  if (!selected) throw new Error("Nenhuma ferramenta foi disponibilizada pelo SIG MCP.");
  if (!input.queueToolName && scoreTestQueueTool(selected) <= 0) {
    throw new Error("Não foi possível identificar automaticamente a ferramenta da fila de testes. Configure-a em Parâmetros > SIG.");
  }
  const called = await rpcRequest({
    fetchImpl,
    connection: input.connection,
    sessionId: discovery.sessionId,
    id: 3,
    method: "tools/call",
    params: {
      name: selected.name,
      arguments: buildSigToolArguments(selected, input.connection.projectId, input.connection.sprintId),
    },
  });
  if (called.result?.isError) {
    const detail = valuesFromToolResult(called.result).map(value => typeof value === "string" ? value : JSON.stringify(value)).join(" ");
    throw new Error(`A ferramenta ${selected.name} retornou erro${detail ? `: ${detail.slice(0, 500)}` : ""}`);
  }
  return {
    toolName: selected.name,
    tools: discovery.tools,
    items: normalizeSigTestQueue(called.result),
  };
}