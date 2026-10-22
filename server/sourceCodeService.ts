import { promises as fs } from "node:fs";
import path from "node:path";

const IGNORED_DIRECTORIES = new Set([
  ".git", ".idea", ".next", ".nuxt", ".output", ".turbo", ".vscode",
  "artifacts", "build", "coverage", "dist", "node_modules", "out", "target", "vendor",
]);

const SENSITIVE_FILE = /(^|[._-])(\.env|secret|credential|private[-_]?key|id_rsa|token)([._-]|$)/i;
const SOURCE_EXTENSIONS = new Set([
  ".astro", ".cs", ".css", ".go", ".graphql", ".html", ".java", ".js", ".jsx",
  ".json", ".kt", ".php", ".py", ".rb", ".rs", ".scss", ".svelte", ".swift",
  ".ts", ".tsx", ".vue", ".xml", ".yaml", ".yml",
]);
const IMPORTANT_FILES = new Set([
  "angular.json", "composer.json", "package.json", "pom.xml", "pyproject.toml",
  "requirements.txt", "vite.config.js", "vite.config.ts",
]);
const MAX_FILES_DISCOVERED = 2_000;
const MAX_FILES_READ = 350;
const MAX_FILE_BYTES = 160_000;
const MAX_TOTAL_BYTES = 2_000_000;
const MAX_SUMMARY_CHARS = 14_000;

export type SourceCodeIndex = {
  absolutePath: string;
  summary: string;
  fileCount: number;
  analyzedFileCount: number;
  indexedAt: Date;
};

function unique(values: string[], limit: number) {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean))).slice(0, limit);
}

function collectMatches(text: string, expression: RegExp, group = 1, limit = 80) {
  const matches: string[] = [];
  for (const match of Array.from(text.matchAll(expression))) {
    const value = match[group];
    if (value) matches.push(value);
    if (matches.length >= limit) break;
  }
  return matches;
}

function redact(value: string) {
  return value
    .replace(/([?&](?:token|key|secret|password|senha)=)[^&\s]+/gi, "$1[REMOVIDO]")
    .replace(/(bearer\s+)[a-z0-9._~+\/-]+/gi, "$1[REMOVIDO]");
}

async function discoverFiles(root: string) {
  const found: string[] = [];
  const pending = [root];
  while (pending.length && found.length < MAX_FILES_DISCOVERED) {
    const current = pending.pop()!;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name.toLowerCase())) pending.push(absolute);
        continue;
      }
      if (!entry.isFile() || SENSITIVE_FILE.test(entry.name)) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (SOURCE_EXTENSIONS.has(extension) || IMPORTANT_FILES.has(entry.name.toLowerCase())) {
        found.push(absolute);
        if (found.length >= MAX_FILES_DISCOVERED) break;
      }
    }
  }
  return found;
}

export async function indexProjectSource(sourcePath: string): Promise<SourceCodeIndex> {
  const absolutePath = path.resolve(sourcePath.trim());
  const stat = await fs.stat(absolutePath).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error("A pasta de código-fonte não existe ou não pode ser acessada pelo Orchestrator.");
  }

  const files = await discoverFiles(absolutePath);
  const routes: string[] = [];
  const selectors: string[] = [];
  const fields: string[] = [];
  const dependencies: string[] = [];
  const readPaths: string[] = [];
  let totalBytes = 0;

  for (const absoluteFile of files.slice(0, MAX_FILES_READ)) {
    const stat = await fs.stat(absoluteFile).catch(() => null);
    if (!stat || stat.size > MAX_FILE_BYTES || totalBytes + stat.size > MAX_TOTAL_BYTES) continue;
    const content = await fs.readFile(absoluteFile, "utf8").catch(() => "");
    if (!content || content.includes("\0")) continue;
    totalBytes += stat.size;
    readPaths.push(path.relative(absolutePath, absoluteFile).replaceAll("\\", "/"));

    routes.push(...collectMatches(content, /(?:path|route|url)\s*[:=]\s*["'`]([^"'`]{1,160})["'`]/gi));
    routes.push(...collectMatches(content, /(?:app|router)\.(?:get|post|put|patch|delete|use)\(\s*["'`]([^"'`]{1,160})["'`]/gi));
    routes.push(...collectMatches(content, /(?:href|to)\s*=\s*["'`]([^"'`]{1,160})["'`]/gi));

    selectors.push(...collectMatches(content, /data-testid\s*=\s*["'`]([^"'`]{1,120})["'`]/gi));
    selectors.push(...collectMatches(content, /getBy(?:Role|Label|Text|Placeholder|TestId|Title)\(\s*["'`]([^"'`]{1,120})["'`]/gi));
    fields.push(...collectMatches(content, /(?:name|placeholder|aria-label)\s*=\s*["'`]([^"'`]{1,120})["'`]/gi));

    if (path.basename(absoluteFile).toLowerCase() === "package.json") {
      try {
        const pkg = JSON.parse(content);
        dependencies.push(...Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }));
      } catch { /* arquivo inválido: apenas ignora dependências */ }
    }
  }

  const fileSample = readPaths.slice(0, 120);
  const summary = redact([
    "ÍNDICE LOCAL DO CÓDIGO-FONTE (use como orientação; confirme tudo na interface em execução)",
    `Arquivos encontrados: ${files.length}; arquivos analisados: ${readPaths.length}`,
    dependencies.length ? `Stack/dependências relevantes: ${unique(dependencies, 60).join(", ")}` : "",
    routes.length ? `Rotas e navegação identificadas: ${unique(routes, 100).join(", ")}` : "",
    fields.length ? `Campos, labels e placeholders identificados: ${unique(fields, 100).join(", ")}` : "",
    selectors.length ? `Seletores semânticos/testids identificados: ${unique(selectors, 100).join(", ")}` : "",
    fileSample.length ? `Arquivos relevantes (amostra): ${fileSample.join(", ")}` : "",
    "Segurança: arquivos sensíveis, dependências instaladas e artefatos de build foram ignorados; nenhum segredo deve ser inferido deste índice.",
  ].filter(Boolean).join("\n")).slice(0, MAX_SUMMARY_CHARS);

  return {
    absolutePath,
    summary,
    fileCount: files.length,
    analyzedFileCount: readPaths.length,
    indexedAt: new Date(),
  };
}
