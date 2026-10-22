import { promises as fs } from "node:fs";
import path from "node:path";
import { ENV } from "./_core/env";

type UploadedArtifact = { reference: string; downloadUrl: string };

function apiBase(): string {
  const raw = ENV.orchestratorApiUrl.trim();
  if (!raw) throw new Error("ORCHESTRATOR_API_URL não configurada para o worker remoto.");
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error("ORCHESTRATOR_API_URL inválida.");
  return url.toString().replace(/\/+$/, "");
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  if (!ENV.qaAgentApiToken) throw new Error("QA_AGENT_API_TOKEN não configurado para o worker remoto.");
  return { authorization: `Bearer ${ENV.qaAgentApiToken}`, ...extra };
}

function isInside(directory: string, candidate: string): boolean {
  const relative = path.relative(directory, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function uploadArtifact(externalExecutionId: string, filepath: string): Promise<UploadedArtifact | undefined> {
  if (/^(?:https?:\/\/|data:|worker-artifact:\/\/)/i.test(filepath)) return undefined;
  const artifactsRoot = path.resolve("artifacts");
  const resolved = path.resolve(filepath.replace(/^file:\/\//i, ""));
  if (!isInside(artifactsRoot, resolved)) return undefined;
  const stat = await fs.stat(resolved).catch(() => undefined);
  if (!stat?.isFile() || stat.size === 0 || stat.size > 25 * 1024 * 1024) return undefined;
  const buffer = await fs.readFile(resolved);
  const response = await fetch(`${apiBase()}/api/qa/worker-artifacts/${encodeURIComponent(externalExecutionId)}`, {
    method: "POST",
    headers: headers({
      "content-type": "application/octet-stream",
      "x-artifact-filename": path.basename(resolved).normalize("NFD").replace(/[^\x20-\x7E]/g, "-").slice(0, 120),
    }),
    body: new Blob([buffer as unknown as BlobPart]),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Upload de artefato falhou: HTTP ${response.status}.`);
  return await response.json() as UploadedArtifact;
}

function evidenceLocations(payload: Record<string, any>): Array<{ owner: Record<string, any>; key: string }> {
  const locations: Array<{ owner: Record<string, any>; key: string }> = [];
  for (const scenario of Array.isArray(payload.resultados) ? payload.resultados : []) {
    const result = scenario?.resultado_teste;
    if (!result || typeof result !== "object") continue;
    for (const evidence of Array.isArray(result.evidencias) ? result.evidencias : []) {
      if (evidence && typeof evidence === "object" && typeof evidence.caminho === "string") locations.push({ owner: evidence, key: "caminho" });
    }
    for (const attempt of Array.isArray(result.tentativas) ? result.tentativas : []) {
      for (const evidence of Array.isArray(attempt?.evidencias) ? attempt.evidencias : []) {
        if (evidence && typeof evidence === "object" && typeof evidence.caminho === "string") locations.push({ owner: evidence, key: "caminho" });
        else if (typeof evidence === "string") {
          const index = attempt.evidencias.indexOf(evidence);
          locations.push({ owner: attempt.evidencias, key: String(index) });
        }
      }
    }
    for (const failure of Array.isArray(result.falhas_automacao) ? result.falhas_automacao : []) {
      if (failure && typeof failure === "object" && typeof failure.trace === "string" && failure.trace) locations.push({ owner: failure, key: "trace" });
    }
  }
  return locations;
}

export function replaceArtifactReferences<T>(value: T, publicUrls: Map<string, string>): T {
  if (typeof value === "string") return (publicUrls.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map(item => replaceArtifactReferences(item, publicUrls)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, replaceArtifactReferences(item, publicUrls)])) as T;
  }
  return value;
}

async function postJson(endpoint: string, payload: Record<string, unknown>): Promise<Record<string, any>> {
  const response = await fetch(`${apiBase()}${endpoint}`, {
    method: "POST",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) throw new Error(`Geração remota de artefato falhou em ${endpoint}: HTTP ${response.status}.`);
  return await response.json() as Record<string, any>;
}

export async function generateRemoteExecutionArtifacts(
  payload: Record<string, unknown>,
): Promise<Record<string, any>> {
  const prepared = structuredClone(payload) as Record<string, any>;
  const executionId = String(prepared.execution_id ?? "").trim();
  if (!executionId) throw new Error("Execução sem identificador para compartilhar artefatos.");
  const uploads = new Map<string, UploadedArtifact>();
  for (const location of evidenceLocations(prepared)) {
    const source = String(location.owner[location.key] ?? "");
    if (!source) continue;
    let uploaded = uploads.get(source);
    if (!uploaded) {
      uploaded = await uploadArtifact(executionId, source);
      if (uploaded) uploads.set(source, uploaded);
    }
    if (uploaded) location.owner[location.key] = uploaded.reference;
  }
  let generated = await postJson("/api/qa/reliability-reports", prepared);
  generated = await postJson("/api/qa/evidence-docx", generated);
  const publicUrls = new Map(Array.from(uploads.values()).map(item => [item.reference, item.downloadUrl]));
  return replaceArtifactReferences(generated, publicUrls);
}
