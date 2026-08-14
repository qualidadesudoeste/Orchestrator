import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import path from "node:path";

export type VpnProvider = "NONE" | "COGEL" | "SEFAZ" | "OUTRA";
export type VpnConnectionStrategy = "AUTO" | "CLI" | "AUTOCONNECT";

export type VpnRequirement = {
  provider: VpnProvider;
  profileName: string;
  username?: string | null;
  password?: string | null;
  autoConnect: boolean;
  targetUrl: string;
  verificationUrl?: string | null;
  connectionStrategy?: VpnConnectionStrategy | null;
  configFileName?: string | null;
  configContent?: string | null;
  configPassword?: string | null;
  configImported?: boolean;
  installerUrl?: string | null;
  installerSha256?: string | null;
};

export type VpnPreflightResult = {
  required: boolean;
  connected: boolean;
  connectedAutomatically: boolean;
  provider: VpnProvider;
  profileName?: string;
  verification: "NOT_REQUIRED" | "TARGET_REACHABLE" | "CLIENT_STATUS";
  clientInstalled?: boolean;
  clientInstalledNow?: boolean;
  configurationImported?: boolean;
  connectionMethod?: "NONE" | "CLI" | "AUTOCONNECT";
};

export class VpnManualActionRequiredError extends Error {
  readonly code = "VPN_MANUAL_ACTION_REQUIRED";

  constructor(message: string) {
    super(message);
    this.name = "VpnManualActionRequiredError";
  }
}

const PROJECT_ROOT = path.resolve(process.cwd());
const VPN_ARTIFACTS = path.resolve(PROJECT_ROOT, "artifacts", "vpn");
const MAX_INSTALLER_BYTES = 350 * 1024 * 1024;
const DEFAULT_FORTICLIENT_CLI_PATHS = [
  "C:\\Program Files\\Fortinet\\FortiClient\\FortiVPN.exe",
  "C:\\Program Files (x86)\\Fortinet\\FortiClient\\FortiVPN.exe",
];
const DEFAULT_FCCONFIG_PATHS = [
  "C:\\Program Files\\Fortinet\\FortiClient\\FCConfig.exe",
  "C:\\Program Files (x86)\\Fortinet\\FortiClient\\FCConfig.exe",
];
const DEFAULT_FORTICLIENT_GUI_PATHS = [
  "C:\\Program Files\\Fortinet\\FortiClient\\FortiClient.exe",
  "C:\\Program Files (x86)\\Fortinet\\FortiClient\\FortiClient.exe",
];

type ProcessResult = { output: string; exitCode: number };

function runFile(executable: string, args: string[], timeoutMs = 15_000): Promise<ProcessResult> {
  return new Promise(resolve => {
    execFile(executable, args, {
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 512 * 1024,
    }, (error, stdout, stderr) => {
      resolve({
        output: `${stdout ?? ""}\n${stderr ?? ""}\n${error?.message ?? ""}`.trim(),
        exitCode: typeof (error as any)?.code === "number" ? (error as any).code : error ? 1 : 0,
      });
    });
  });
}

function launchFile(executable: string, args: string[] = []): void {
  const child = spawn(executable, args, { detached: true, stdio: "ignore", windowsHide: false });
  child.unref();
}

async function firstExisting(paths: string[]): Promise<string | undefined> {
  for (const candidate of paths) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continua procurando uma instalação compatível.
    }
  }
  return undefined;
}

async function fortiCliPath(): Promise<string | undefined> {
  const configured = process.env.FORTICLIENT_CLI_PATH?.trim();
  return firstExisting(configured ? [configured, ...DEFAULT_FORTICLIENT_CLI_PATHS] : DEFAULT_FORTICLIENT_CLI_PATHS);
}

function escapePowerShellLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

async function runElevated(executable: string, args: string[], timeoutMs: number): Promise<ProcessResult> {
  const exe = escapePowerShellLiteral(executable);
  const serializedArgs = args.map(value => `'${escapePowerShellLiteral(value)}'`).join(",");
  const script = `$p=Start-Process -FilePath '${exe}' -ArgumentList @(${serializedArgs}) -Verb RunAs -Wait -PassThru; exit $p.ExitCode`;
  return runFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], timeoutMs);
}

async function runFortiVpn(args: string[], timeoutMs = 15_000): Promise<ProcessResult> {
  const executable = await fortiCliPath();
  if (!executable) return { output: "FortiVPN executable not found", exitCode: 1 };
  return runFile(executable, args, timeoutMs);
}

export function parseFortiClientStatus(output: string, profileName: string): "CONNECTED" | "DISCONNECTED" | "UNAVAILABLE" {
  const normalized = output.toLowerCase();
  if (/option ['"]?cli['"]? does not exist|error parsing options|enoent|cannot find|not found/.test(normalized)) {
    return "UNAVAILABLE";
  }
  const profile = profileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`${profile}\\s*::\\s*connected`, "i").test(output)) return "CONNECTED";
  if (/::\s*connected/i.test(output)) return "CONNECTED";
  return "DISCONNECTED";
}

export function isTrustedFortinetSignature(status: string, signerSubject: string): boolean {
  return status.trim().toLowerCase() === "valid" && /\bfortinet\b/i.test(signerSubject);
}

export function validateInstallerSettings(urlValue: string, sha256Value: string): { url: URL; sha256: string; extension: ".msi" | ".exe" } {
  const url = new URL(urlValue);
  if (url.protocol !== "https:") throw new Error("O instalador da VPN deve usar uma URL HTTPS oficial.");
  const pathExtension = path.extname(url.pathname).toLowerCase();
  const isOfficialFortinetVpnAgent = url.hostname.toLowerCase() === "links.fortinet.com"
    && url.pathname.replace(/\/$/, "").toLowerCase() === "/forticlient/win/vpnagent";
  const extension = isOfficialFortinetVpnAgent ? ".exe" : pathExtension;
  if (extension !== ".msi" && extension !== ".exe") throw new Error("O instalador deve ser um arquivo .msi ou .exe ou o link oficial do FortiClient VPN para Windows.");
  const sha256 = sha256Value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("Informe o SHA-256 oficial do instalador da VPN.");
  return { url, sha256, extension };
}

export async function isTargetReachable(targetUrl: string, timeoutMs = 4_000): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return false;
  }
  const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  return new Promise(resolve => {
    const socket = connect({ host: url.hostname, port });
    const finish = (reachable: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function verifyAuthenticode(filepath: string): Promise<boolean> {
  const file = escapePowerShellLiteral(filepath);
  const result = await runFile("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `$s=Get-AuthenticodeSignature -LiteralPath '${file}'; [Console]::WriteLine(($s.Status.ToString())+'|'+($s.SignerCertificate.Subject))`,
  ], 30_000);
  const [status = "", signer = ""] = result.output.split("|", 2);
  return result.exitCode === 0 && isTrustedFortinetSignature(status, signer);
}

async function downloadVerifiedInstaller(urlValue: string, sha256Value: string): Promise<string> {
  const { url, sha256, extension } = validateInstallerSettings(urlValue, sha256Value);
  await mkdir(path.join(VPN_ARTIFACTS, "installers"), { recursive: true });
  const destination = path.join(VPN_ARTIFACTS, "installers", `${sha256}${extension}`);
  try {
    const existing = await readFile(destination);
    if (createHash("sha256").update(existing).digest("hex") === sha256 && await verifyAuthenticode(destination)) return destination;
  } catch {
    // Baixa novamente quando o cache não existe ou não é confiável.
  }

  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Não foi possível baixar o instalador oficial da VPN (HTTP ${response.status}).`);
  if (new URL(response.url).protocol !== "https:") throw new Error("O download do instalador foi redirecionado para uma conexão não segura.");
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_INSTALLER_BYTES) throw new Error("O instalador da VPN excede o limite de 350 MB.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_INSTALLER_BYTES) throw new Error("O instalador da VPN excede o limite de 350 MB.");
  if (createHash("sha256").update(bytes).digest("hex") !== sha256) throw new Error("O SHA-256 do instalador baixado não corresponde ao valor cadastrado.");
  await writeFile(destination, bytes, { flag: "w" });
  if (!await verifyAuthenticode(destination)) {
    await rm(destination, { force: true });
    throw new Error("O instalador não possui uma assinatura digital válida da Fortinet.");
  }
  return destination;
}

async function ensureFortiClientInstalled(input: VpnRequirement): Promise<{ installedNow: boolean }> {
  const installed = await firstExisting([...DEFAULT_FORTICLIENT_GUI_PATHS, ...DEFAULT_FCCONFIG_PATHS, ...DEFAULT_FORTICLIENT_CLI_PATHS]);
  if (installed) return { installedNow: false };
  if (!input.installerUrl || !input.installerSha256) {
    throw new Error("O FortiClient não está instalado. Cadastre a URL HTTPS oficial e o SHA-256 do instalador no ambiente.");
  }
  const installer = await downloadVerifiedInstaller(input.installerUrl, input.installerSha256);
  const extension = path.extname(installer).toLowerCase();
  const installResult = extension === ".msi"
    ? await runElevated("msiexec.exe", ["/i", installer, "/qn", "/norestart"], 10 * 60_000)
    : await runElevated(installer, [], 10 * 60_000);
  if (installResult.exitCode !== 0) throw new Error("A instalação do FortiClient não foi concluída. Autorize o UAC e finalize o instalador.");
  const detected = await firstExisting([...DEFAULT_FORTICLIENT_GUI_PATHS, ...DEFAULT_FCCONFIG_PATHS, ...DEFAULT_FORTICLIENT_CLI_PATHS]);
  if (!detected) throw new Error("O instalador terminou, mas o FortiClient não foi localizado no computador.");
  return { installedNow: true };
}

async function importVpnConfiguration(input: VpnRequirement): Promise<boolean> {
  if (input.configImported || !input.configContent) return false;
  const fcConfig = await firstExisting(DEFAULT_FCCONFIG_PATHS);
  if (!fcConfig) throw new Error("O FortiClient instalado não contém o FCConfig necessário para importar o arquivo .conf.");
  await mkdir(path.join(VPN_ARTIFACTS, "runtime"), { recursive: true });
  const extension = input.configFileName?.toLowerCase().endsWith(".xml") ? ".xml" : ".conf";
  const temporaryConfig = path.join(VPN_ARTIFACTS, "runtime", `${randomUUID()}${extension}`);
  await writeFile(temporaryConfig, Buffer.from(input.configContent, "base64"), { flag: "wx" });
  try {
    const args = ["-m", "vpn", "-f", temporaryConfig, "-o", "importvpn", "-i", "1"];
    if (input.configPassword) args.push("-p", input.configPassword);
    const result = await runElevated(fcConfig, args, 120_000);
    if (result.exitCode !== 0) throw new Error("O FortiClient recusou a importação do arquivo de configuração da VPN.");
    return true;
  } finally {
    await rm(temporaryConfig, { force: true });
  }
}

async function waitUntilReachable(targetUrl: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isTargetReachable(targetUrl)) return true;
    await new Promise(resolve => setTimeout(resolve, 2_000));
  }
  return false;
}

function validateRequirement(input: VpnRequirement): void {
  if (!input.profileName.trim()) throw new Error("Informe o nome do perfil configurado no cliente VPN.");
  if (/[\r\n\0]/.test(input.profileName)) throw new Error("Nome do perfil VPN inválido.");
}

export async function ensureVpnConnection(input: VpnRequirement): Promise<VpnPreflightResult> {
  if (input.provider === "NONE") {
    return { required: false, connected: true, connectedAutomatically: false, provider: "NONE", verification: "NOT_REQUIRED", connectionMethod: "NONE" };
  }
  validateRequirement(input);
  const verificationUrl = input.verificationUrl?.trim() || input.targetUrl;
  if (await isTargetReachable(verificationUrl)) {
    return { required: true, connected: true, connectedAutomatically: false, provider: input.provider, profileName: input.profileName, verification: "TARGET_REACHABLE", clientInstalled: true, connectionMethod: "NONE" };
  }

  if (!input.autoConnect) throw new Error(`Conecte manualmente a VPN ${input.provider} (${input.profileName}) antes de iniciar os testes.`);
  const installation = await ensureFortiClientInstalled(input);
  const configurationImported = await importVpnConfiguration(input);
  const strategy = input.connectionStrategy ?? "AUTO";
  const status = await runFortiVpn(["--cli", "--status", "--tunnel", input.profileName]);
  const parsedStatus = parseFortiClientStatus(status.output, input.profileName);
  if (parsedStatus === "CONNECTED") {
    return { required: true, connected: true, connectedAutomatically: false, provider: input.provider, profileName: input.profileName, verification: "CLIENT_STATUS", clientInstalled: true, clientInstalledNow: installation.installedNow, configurationImported, connectionMethod: "CLI" };
  }

  if (parsedStatus !== "UNAVAILABLE" && strategy !== "AUTOCONNECT") {
    const args = ["--cli", "--connect", "--tunnel", input.profileName];
    if (input.username) args.push("--username", input.username);
    if (input.password) args.push("--password", input.password);
    await runFortiVpn(args, 60_000);
    if (await waitUntilReachable(verificationUrl, 45_000)) {
      return { required: true, connected: true, connectedAutomatically: true, provider: input.provider, profileName: input.profileName, verification: "TARGET_REACHABLE", clientInstalled: true, clientInstalledNow: installation.installedNow, configurationImported, connectionMethod: "CLI" };
    }
  }

  if (strategy === "CLI") throw new Error("A versão instalada do FortiClient não oferece conexão VPN por CLI. Selecione a estratégia Automática/Auto Connect ou instale uma edição compatível.");
  const gui = await firstExisting(DEFAULT_FORTICLIENT_GUI_PATHS);
  if (!gui) throw new Error("O FortiClient foi detectado, mas sua interface de conexão não foi localizada.");
  launchFile(gui);
  if (parsedStatus === "UNAVAILABLE") {
    throw new VpnManualActionRequiredError(
      `O FortiClient foi aberto. Conecte manualmente a VPN ${input.provider} (${input.profileName}) e depois retome esta execucao. Esta edicao do FortiClient nao oferece conexao por linha de comando.`,
    );
  }
  if (await waitUntilReachable(verificationUrl, 120_000)) {
    return { required: true, connected: true, connectedAutomatically: true, provider: input.provider, profileName: input.profileName, verification: "TARGET_REACHABLE", clientInstalled: true, clientInstalledNow: installation.installedNow, configurationImported, connectionMethod: "AUTOCONNECT" };
  }
  throw new VpnManualActionRequiredError(
    `O FortiClient foi aberto. Conclua o MFA/aceite da VPN ${input.provider} (${input.profileName}) e depois retome esta execucao.`,
  );
}

export function assertCompatibleVpnRequirements(requirements: VpnRequirement[]): void {
  const distinct = new Set(requirements.filter(item => item.provider !== "NONE").map(item => `${item.provider}:${item.profileName.trim().toLowerCase()}`));
  if (distinct.size > 1) throw new Error("Os ambientes selecionados usam VPNs diferentes. Execute-os separadamente, pois o FortiClient mantém apenas um túnel automático por vez.");
}
