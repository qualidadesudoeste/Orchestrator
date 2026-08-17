import type { SigTestQueueItem } from "./sigMcpService";

type FetchLike = typeof fetch;

type SigQueueRow = {
  PRO_NOME?: unknown;
  VER_NOME?: unknown;
  COD_VERSAO?: unknown;
  COD_PROJETO?: unknown;
  INI_DEV?: unknown;
  LIB_TESTE?: unknown;
  PRAZO_TESTE?: unknown;
  QUANTIDADE_REQ?: unknown;
};

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function apiBase(endpointUrl: string): string {
  const origin = new URL(endpointUrl).origin;
  return `${origin}/sig_v3`;
}

async function readJson(response: Response) {
  const body = await response.text();
  let parsed: any = {};
  try { parsed = body ? JSON.parse(body) : {}; } catch {}
  if (!response.ok) {
    const detail = parsed?.error || parsed?.message || body.slice(0, 300);
    throw new Error(`SIG API respondeu HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return parsed;
}

export async function fetchSigReleasedQueue(input: {
  endpointUrl: string;
  username: string;
  password: string;
  fetchImpl?: FetchLike;
}): Promise<{ source: string; items: SigTestQueueItem[] }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const baseUrl = apiBase(input.endpointUrl);
  const loginResponse = await fetchImpl(`${baseUrl}/login`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username: input.username, password: input.password }),
  });
  const login = await readJson(loginResponse);
  const token = login.access_token ?? login.token ?? login.accessToken;
  if (typeof token !== "string" || !token) {
    throw new Error("O login do SIG não retornou um token de acesso válido.");
  }

  const rows: SigQueueRow[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const response = await fetchImpl(`${baseUrl}/qa/queue/released`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        page,
        pageSize: 100,
        search: "",
        sort: "LIB_TESTE",
        sortDir: "asc",
      }),
    });
    const result = await readJson(response);
    if (Array.isArray(result.data)) rows.push(...result.data);
    totalPages = Math.max(1, Math.min(Number(result.pagination?.totalPages) || 1, 50));
    page += 1;
  } while (page <= totalPages);

  const seen = new Set<string>();
  const items = rows.flatMap((row, index): SigTestQueueItem[] => {
    const sprintId = text(row.COD_VERSAO);
    const projectId = text(row.COD_PROJETO);
    const sprintName = text(row.VER_NOME);
    if (!sprintId && !sprintName) return [];
    const id = sprintId || `SIG-${index + 1}`;
    const unique = `${projectId}::${id}`;
    if (seen.has(unique)) return [];
    seen.add(unique);
    return [{
      id,
      projectId,
      projectName: text(row.PRO_NOME) || "Projeto não informado",
      sprintId: sprintId || id,
      sprintName: sprintName || `Sprint ${id}`,
      clientName: "",
      status: "Liberada para teste",
      priority: "",
      responsible: "",
      releasedAt: text(row.LIB_TESTE) || null,
      dueDate: text(row.PRAZO_TESTE) || null,
      cardCount: numberOrNull(row.QUANTIDADE_REQ),
      rawJson: JSON.stringify(row).slice(0, 30_000),
    }];
  });

  return { source: "/sig_v3/qa/queue/released", items };
}
