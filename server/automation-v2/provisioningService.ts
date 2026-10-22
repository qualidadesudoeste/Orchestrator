export type QaProvisioningAction = "PREPARE_STATE" | "RUN_ROUTINE";

export type QaProvisioningConfig = {
  endpointUrl: string;
  token?: string;
  projectId?: number;
};

export type QaProvisioningRequest = {
  action: QaProvisioningAction;
  runId: string;
  scenarioId: string;
  objective: string;
  category?: string;
  environmentName?: string;
  availableTestDataKeys: string[];
};

export type QaProvisioningResult = {
  resolved: boolean;
  message: string;
  testData: Record<string, string>;
  cleanupToken?: string;
  externalReference?: string;
};

function safeTestData(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => [key.trim().slice(0, 80), String(item ?? "").trim().slice(0, 2_000)])
    .filter(([key, item]) => Boolean(key && item))
    .slice(0, 50));
}

export async function requestQaProvisioning(
  config: QaProvisioningConfig,
  request: QaProvisioningRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<QaProvisioningResult> {
  const endpoint = new URL(config.endpointUrl);
  if (!/^https?:$/.test(endpoint.protocol)) throw new Error("O endpoint de provisionamento deve usar HTTP ou HTTPS.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-qa-idempotency-key": `${request.runId}:${request.scenarioId}:${request.action}`.slice(0, 240),
        ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
      },
      body: JSON.stringify({
        version: 1,
        projectId: config.projectId,
        ...request,
        objective: request.objective.slice(0, 2_000),
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(`Provisionador respondeu HTTP ${response.status}: ${String(body.message ?? response.statusText).slice(0, 500)}`);
    }
    return {
      resolved: body.resolved === true,
      message: String(body.message ?? (body.resolved === true ? "Precondição preparada." : "Precondição não preparada.")).slice(0, 1_000),
      testData: safeTestData(body.testData),
      cleanupToken: body.cleanupToken ? String(body.cleanupToken).slice(0, 500) : undefined,
      externalReference: body.externalReference ? String(body.externalReference).slice(0, 500) : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function testQaProvisioningConnection(
  config: QaProvisioningConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; message: string }> {
  const result = await requestQaProvisioning(config, {
    action: "PREPARE_STATE",
    runId: "connection-test",
    scenarioId: "HEALTHCHECK",
    objective: "Validar conectividade sem criar ou alterar massa de teste.",
    category: "HEALTHCHECK",
    availableTestDataKeys: [],
  }, fetchImpl);
  return { ok: true, message: result.message };
}
