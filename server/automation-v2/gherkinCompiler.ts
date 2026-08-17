import { generateMessages } from "@cucumber/gherkin";
import { IdGenerator, SourceMediaType, type GherkinDocument, type Pickle } from "@cucumber/messages";
import type { BddKeyword, CompiledBddStep, CompiledScenario, StepIntent } from "./types";

function sourceDocument(source: string): string {
  const normalized = source.replace(/\r\n/g, "\n").trim();
  if (/^\s*(?:Funcionalidade|Feature):/im.test(normalized)) return normalized;
  const language = /^\s*#\s*language\s*:/im.test(normalized) ? "" : "# language: pt\n";
  return `${language}Funcionalidade: Execução automatizada\n${normalized}`;
}

function keywordFromType(type?: string): BddKeyword {
  if (type === "Context") return "DADO";
  if (type === "Action") return "QUANDO";
  return "ENTAO";
}

export function normalizeGherkinStepText(keyword: BddKeyword, value: string): string {
  const prefix = keyword === "DADO"
    ? /^(?:Dado|Dada|Dados|Dadas|Given)\s+/i
    : keyword === "QUANDO"
      ? /^(?:Quando|When)\s+/i
      : /^(?:Então|Entao|Then)\s+/i;
  return value.trim().replace(prefix, "").trim();
}

function inferIntent(keyword: BddKeyword, text: string): StepIntent {
  const value = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(login|autenticad|autenticar|credencia|sessao)\b/.test(value)) return "AUTHENTICATE";
  if (/\b(acessar|navegar|abrir|pagina|tela|portal|site|url)\b/.test(value)) return "NAVIGATE";
  if (/\b(evidencia|screenshot|captur|protocolo|codigo gerado)\b/.test(value)) return "CAPTURE";
  if (keyword === "DADO") return "PRECONDITION";
  if (keyword === "QUANDO") return "INTERACT";
  if (keyword === "ENTAO") return "ASSERT";
  return "UNKNOWN";
}

function metadataForAstNode(document: GherkinDocument | undefined, astNodeId: string): { line: number; keyword: string } {
  for (const child of document?.feature?.children ?? []) {
    const scenario = child.scenario;
    const step = scenario?.steps.find(item => item.id === astNodeId);
    if (step?.location?.line) return { line: step.location.line, keyword: step.keyword.trim() };
    for (const backgroundStep of child.background?.steps ?? []) {
      if (backgroundStep.id === astNodeId) return { line: backgroundStep.location?.line ?? 0, keyword: backgroundStep.keyword.trim() };
    }
  }
  return { line: 0, keyword: "" };
}

export function compileGherkinScenarios(source: string, uri = "execution.feature"): CompiledScenario[] {
  const envelopes = generateMessages(
    sourceDocument(source),
    uri,
    SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN,
    {
      includeSource: false,
      includeGherkinDocument: true,
      includePickles: true,
      newId: IdGenerator.incrementing(),
    },
  );
  const parseError = envelopes.find(envelope => envelope.parseError)?.parseError;
  if (parseError) throw new Error(`Gherkin inválido: ${parseError.message}`);
  const document = envelopes.find(envelope => envelope.gherkinDocument)?.gherkinDocument;
  const pickles = envelopes.map(envelope => envelope.pickle).filter(Boolean) as Pickle[];
  if (!pickles.length) throw new Error("O documento Gherkin não possui cenários executáveis.");

  return pickles.map(pickle => ({
    version: 2,
    language: pickle.language || document?.feature?.language || "pt",
    feature: document?.feature?.name || "Execução automatizada",
    title: pickle.name,
    tags: pickle.tags.map(tag => tag.name),
    steps: pickle.steps.map((step, index): CompiledBddStep => {
      const keyword = keywordFromType(step.type);
      const metadata = metadataForAstNode(document, step.astNodeIds[0] ?? "");
      return {
        id: `S${index + 1}`,
        keyword,
        text: step.text,
        sourceLine: `${metadata.keyword || (keyword === "DADO" ? "Dado" : keyword === "QUANDO" ? "Quando" : "Então")} ${step.text}`,
        line: metadata.line,
        intent: inferIntent(keyword, step.text),
      };
    }),
  }));
}

export function compileSingleGherkinScenario(source: string): CompiledScenario {
  const scenarios = compileGherkinScenarios(source);
  if (scenarios.length !== 1) throw new Error("Era esperado exatamente um cenário Gherkin.");
  return scenarios[0];
}
