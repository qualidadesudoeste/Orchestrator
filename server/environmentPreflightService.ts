import { chromium } from "playwright-core";
import { isExternalAccessBlock } from "./accessBlockPolicy";

export type EnvironmentProbeResult = {
  url: string;
  status: number | null;
  title: string;
  externallyBlocked: boolean;
  detail: string;
};

type Probe = (url: string) => Promise<EnvironmentProbeResult>;

export async function probeEnvironmentWithBrowser(url: string): Promise<EnvironmentProbeResult> {
  const executablePath = process.env.PLAYWRIGHT_CHROME_EXECUTABLE_PATH?.trim();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : { channel: "chrome" as const }),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const title = await page.title();
    const text = (await page.locator("body").innerText().catch(() => "")).slice(0, 4_000);
    const externallyBlocked = isExternalAccessBlock(`${title}\n${text}`);
    return {
      url: page.url(),
      status: response?.status() ?? null,
      title,
      externallyBlocked,
      detail: externallyBlocked
        ? "O navegador do worker recebeu uma página de bloqueio por política externa de acesso."
        : "O navegador do worker alcançou o ambiente sem página de bloqueio externo.",
    };
  } finally {
    await browser.close();
  }
}

export async function preflightEnvironmentAccess(
  url: string,
  options: { attempts?: number; probe?: Probe } = {},
): Promise<EnvironmentProbeResult> {
  const attempts = Math.min(3, Math.max(1, options.attempts ?? 2));
  const probe = options.probe ?? probeEnvironmentWithBrowser;
  let latest: EnvironmentProbeResult | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    latest = await probe(url);
    if (!latest.externallyBlocked) return latest;
  }
  return latest!;
}
