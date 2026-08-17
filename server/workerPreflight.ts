import { access } from "node:fs/promises";

const DEFAULT_CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

export async function resolveWorkerChromeExecutable(): Promise<string> {
  const configured = process.env.PLAYWRIGHT_CHROME_EXECUTABLE_PATH?.trim();
  const candidates = configured
    ? [configured, ...DEFAULT_CHROME_PATHS]
    : DEFAULT_CHROME_PATHS;
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continua procurando uma instalação aprovada.
    }
  }
  throw new Error(
    "Google Chrome não encontrado. Instale-o no worker ou configure PLAYWRIGHT_CHROME_EXECUTABLE_PATH."
  );
}
