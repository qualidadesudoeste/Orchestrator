const ARTIFACT_PREFIX = "ARTEFATO_";

export type ExecutionArtifactContract = {
  produces: string[];
  consumes: string[];
};

function normalizedKey(value: string, maxLength = 40): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, maxLength) || "VALOR";
}

function artifactLabelsFromGherkin(gherkin: string): string[] {
  const normalized = gherkin.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const matches = normalized.match(/\b(?:ID|IDENTIFICADOR|IDENTIFIER|CODIGO|CODE|NUMERO|NUMBER|REFERENCIA|REFERENCE|PROTOCOLO|URL|LINK|ARQUIVO|FILE|COMPROVANTE|RECEIPT)\b/g) ?? [];
  return Array.from(new Set(matches));
}

export function storeExecutionArtifact(
  testData: Record<string, string>,
  scenarioId: string,
  requestedKey: string,
  rawValue: string,
): string[] {
  const value = rawValue.trim().slice(0, 2_000);
  if (!value) return [];
  const scenarioKey = normalizedKey(scenarioId, 28);
  const artifactKey = normalizedKey(requestedKey, 36);
  const scopedKey = `${ARTIFACT_PREFIX}${scenarioKey}_${artifactKey}`.slice(0, 80);
  const latestKey = `ULTIMO_${artifactKey}`.slice(0, 80);
  testData[artifactKey] = value;
  testData[scopedKey] = value;
  testData[latestKey] = value;
  return [artifactKey, scopedKey, latestKey];
}

export function normalizedArtifactKey(value: string): string {
  return normalizedKey(value, 36);
}

export function scopedArtifactKey(scenarioId: string, artifact: string): string {
  return `${ARTIFACT_PREFIX}${normalizedKey(scenarioId, 28)}_${normalizedArtifactKey(artifact)}`.slice(0, 80);
}

export function hasExecutionArtifact(testData: Record<string, string>, artifact: string): boolean {
  const key = normalizedArtifactKey(artifact);
  return Boolean(testData[key]) || Object.entries(testData)
    .some(([candidate, value]) => candidate.startsWith(ARTIFACT_PREFIX) && candidate.endsWith(`_${key}`) && Boolean(value));
}

export function hasScenarioArtifact(testData: Record<string, string>, scenarioId: string, artifact: string): boolean {
  return Boolean(testData[scopedArtifactKey(scenarioId, artifact)]);
}

export function executionArtifactGuidance(
  gherkin: string,
  availableKeys: string[],
  contract?: ExecutionArtifactContract,
): string | undefined {
  const artifactKeys = availableKeys.filter(key => key.startsWith(ARTIFACT_PREFIX));
  const labels = artifactLabelsFromGherkin(gherkin);
  const normalizedGherkin = normalizedKey(gherkin, 2_000);
  const ranked = artifactKeys
    .map((key, index) => ({
      key,
      index,
      score: key.split("_").filter(token => token.length >= 3 && normalizedGherkin.includes(token)).length,
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(item => item.key);
  const instructions = [];
  if (contract?.consumes.length) {
    instructions.push(`Este cenário consome: ${contract.consumes.map(normalizedArtifactKey).join(", ")}. Use somente as chaves de artefato fornecidas pelo runtime.`);
  }
  if (contract?.produces.length) {
    instructions.push(`Antes de concluir com sucesso, capture os artefatos produzidos: ${contract.produces.map(normalizedArtifactKey).join(", ")}.`);
  }
  if (labels.length) {
    instructions.push(`Se o cenário produzir um valor reutilizável (${labels.join(", ")}), capture-o com browser_capture_field_test_data, browser_capture_text_test_data ou browser_capture_link_test_data usando uma chave semântica.`);
  }
  if (ranked.length) {
    instructions.push(`Artefatos de cenários anteriores disponíveis localmente: ${ranked.join(", ")}. Use a chave semanticamente correspondente nas ferramentas *_test_data; nunca invente nem peça o valor.`);
  }
  return instructions.length ? instructions.join(" ") : undefined;
}
