function normalizedKey(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 55) || "CENARIO";
}

export function scenarioCreatesBusinessRecord(gherkin: string): boolean {
  const normalized = gherkin.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /cenario:.*(?:cadastrar|criar).*denuncia/.test(normalized)
    || /quando .*confirma (?:o )?cadastro/.test(normalized);
}

export function extractCreatedProtocol(text: string): string | undefined {
  const source = text.replace(/\s+/g, " ").trim();
  return source.match(/\bden[uú]ncia\s+(?:n[ºo]?\.?\s*)?([A-Z0-9][A-Z0-9./_-]{4,80})\b/i)?.[1]
    ?? source.match(/(?:cadastrad[ao]|salv[ao]|registrad[ao]).{0,160}?protocolo\s*(?:n[ºo]?\.?\s*)?(?:[:#-]|é)?\s*([A-Z0-9][A-Z0-9./_-]{4,80})/i)?.[1];
}

export function protocolTestDataKeys(scenarioId: string, gherkin: string): string[] {
  const normalized = gherkin.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const keys = [`${normalizedKey(scenarioId)}_PROTOCOLO`, "ULTIMO_PROTOCOLO"];
  if (scenarioCreatesBusinessRecord(gherkin)) keys.push("PROTOCOLO_CRIADO");
  if (/anexo/.test(normalized)) keys.push("PROTOCOLO_COM_ANEXOS");
  if (/audiencia/.test(normalized)) keys.push("PROTOCOLO_COM_AUDIENCIA");
  return Array.from(new Set(keys));
}

export function storeScenarioProtocol(
  testData: Record<string, string>,
  scenarioId: string,
  gherkin: string,
  protocol: string,
): string[] {
  const value = protocol.trim().slice(0, 200);
  if (!value) return [];
  const keys = protocolTestDataKeys(scenarioId, gherkin);
  for (const key of keys) {
    if (key === "PROTOCOLO_CRIADO") testData[key] ??= value;
    else testData[key] = value;
  }
  testData.PROTOCOLO ??= value;
  return keys;
}

export function chainedTestDataGuidance(gherkin: string, availableKeys: string[]): string | undefined {
  const protocolKeys = availableKeys.filter(key => /PROTOCOLO/.test(key));
  if (!protocolKeys.length) return undefined;
  const normalized = gherkin.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const preferred = [
    /anexo/.test(normalized) ? "PROTOCOLO_COM_ANEXOS" : "",
    /audiencia/.test(normalized) ? "PROTOCOLO_COM_AUDIENCIA" : "",
    "PROTOCOLO_CRIADO",
    "ULTIMO_PROTOCOLO",
  ].filter(key => key && protocolKeys.includes(key));
  const ordered = Array.from(new Set([...preferred, ...protocolKeys]));
  return `Dados encadeados de cenários anteriores disponíveis localmente: ${ordered.join(", ")}. Use browser_fill_test_data com a chave semanticamente correspondente; nunca invente nem peça o valor.`;
}
