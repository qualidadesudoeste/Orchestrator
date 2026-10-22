import { promises as fs } from "node:fs";
import path from "node:path";

export type SyntheticFixtureKind = "PNG" | "JPEG" | "PDF" | "TXT";

const FIXTURES: Record<SyntheticFixtureKind, { extension: string; mimeType: string; bytes: () => Buffer }> = {
  PNG: {
    extension: ".png",
    mimeType: "image/png",
    bytes: () => Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  },
  JPEG: {
    extension: ".jpg",
    mimeType: "image/jpeg",
    bytes: () => Buffer.from("/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==", "base64"),
  },
  PDF: {
    extension: ".pdf",
    mimeType: "application/pdf",
    bytes: () => Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n", "ascii"),
  },
  TXT: {
    extension: ".txt",
    mimeType: "text/plain",
    bytes: () => Buffer.from("Arquivo sintetico de teste gerado pelo Orchestrator.\n", "utf8"),
  },
};

export function selectSyntheticFixtureKind(accept: string, requested?: SyntheticFixtureKind): SyntheticFixtureKind {
  const normalized = accept.toLowerCase();
  const requestedPattern: Record<SyntheticFixtureKind, RegExp> = {
    PNG: /png|image\/\*/,
    JPEG: /jpe?g|image\/\*/,
    PDF: /pdf|application\/\*/,
    TXT: /text|\.txt|text\/\*/,
  };
  if (requested && (!normalized.trim() || requestedPattern[requested].test(normalized))) return requested;
  if (/png|image\/\*/.test(normalized)) return "PNG";
  if (/jpe?g/.test(normalized)) return "JPEG";
  if (/pdf/.test(normalized)) return "PDF";
  if (/text|\.txt/.test(normalized)) return "TXT";
  return "PNG";
}

function safeSegment(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "teste";
}

export async function createSyntheticUploadFixture(
  outputDirectory: string,
  runId: string,
  scenarioId: string,
  kind: SyntheticFixtureKind,
): Promise<{ filepath: string; filename: string; mimeType: string; bytes: number; kind: SyntheticFixtureKind }> {
  const fixture = FIXTURES[kind];
  const directory = path.resolve(outputDirectory, "fixtures");
  await fs.mkdir(directory, { recursive: true });
  const filename = `qa-${safeSegment(runId)}-${safeSegment(scenarioId)}${fixture.extension}`;
  const filepath = path.resolve(directory, filename);
  if (path.dirname(filepath) !== directory) throw new Error("Destino de fixture inválido.");
  const bytes = fixture.bytes();
  await fs.writeFile(filepath, bytes, { flag: "w" });
  return { filepath, filename, mimeType: fixture.mimeType, bytes: bytes.length, kind };
}
