import { execFile } from "node:child_process";
import { connect } from "node:net";

export type VpnProvider = "NONE" | "COGEL" | "SEFAZ" | "OUTRA";

export type VpnRequirement = {
  provider: VpnProvider;
  profileName: string;
  username?: string | null;
  password?: string | null;
  autoConnect: boolean;
  targetUrl: string;
};

export type VpnPreflightResult = {
  required: boolean;
  connected: boolean;
  connectedAutomatically: boolean;
  provider: VpnProvider;
  profileName?: string;
  verification: "NOT_REQUIRED" | "TARGET_REACHABLE" | "CLIENT_STATUS";
};

const DEFAULT_FORTICLIENT_PATH = "C:\\Program Files\\Fortinet\\FortiClient\\FortiVPN.exe";

function runFortiVpn(args: string[], timeoutMs = 15_000): Promise<{ output: string; exitCode: number }> {
  const executable = process.env.FORTICLIENT_CLI_PATH || DEFAULT_FORTICLIENT_PATH;
  return new Promise(resolve => {
    execFile(executable, args, {
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 256 * 1024,
    }, (error, stdout, stderr) => {
      resolve({
        output: `${stdout ?? ""}\n${stderr ?? ""}\n${error?.message ?? ""}`.trim(),
        exitCode: typeof (error as any)?.code === "number" ? (error as any).code : error ? 1 : 0,
      });
    });
  });
}

export function parseFortiClientStatus(output: string, profileName: string): "CONNECTED" | "DISCONNECTED" | "UNAVAILABLE" {
  const normalized = output.toLowerCase();
  if (/option ['"]?cli['"]? does not exist|error parsing options|enoent|cannot find/.test(normalized)) {
    return "UNAVAILABLE";
  }
  const profile = profileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`${profile}\\s*::\\s*connected`, "i").test(output)) return "CONNECTED";
  if (/::\s*connected/i.test(output)) return "CONNECTED";
  return "DISCONNECTED";
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

function validateRequirement(input: VpnRequirement) {
  if (!input.profileName.trim()) throw new Error("Informe o nome do perfil configurado no cliente VPN.");
  if (/[\r\n\0]/.test(input.profileName)) throw new Error("Nome do perfil VPN inválido.");
}

export async function ensureVpnConnection(input: VpnRequirement): Promise<VpnPreflightResult> {
  if (input.provider === "NONE") {
    return { required: false, connected: true, connectedAutomatically: false, provider: "NONE", verification: "NOT_REQUIRED" };
  }
  validateRequirement(input);

  if (await isTargetReachable(input.targetUrl)) {
    return {
      required: true,
      connected: true,
      connectedAutomatically: false,
      provider: input.provider,
      profileName: input.profileName,
      verification: "TARGET_REACHABLE",
    };
  }

  const status = await runFortiVpn(["--cli", "--status", "--tunnel", input.profileName]);
  const parsedStatus = parseFortiClientStatus(status.output, input.profileName);
  if (parsedStatus === "CONNECTED") {
    return {
      required: true,
      connected: true,
      connectedAutomatically: false,
      provider: input.provider,
      profileName: input.profileName,
      verification: "CLIENT_STATUS",
    };
  }
  if (!input.autoConnect) {
    throw new Error(`Conecte manualmente a VPN ${input.provider} (${input.profileName}) antes de iniciar os testes.`);
  }
  if (parsedStatus === "UNAVAILABLE") {
    throw new Error("O FortiClient instalado não oferece automação por linha de comando. Atualize para uma versão com FortiVPN CLI ou conecte a VPN manualmente.");
  }

  const args = ["--cli", "--connect", "--tunnel", input.profileName];
  if (input.username) args.push("--username", input.username);
  if (input.password) args.push("--password", input.password);
  const connection = await runFortiVpn(args, 60_000);
  if (connection.exitCode !== 0 && parseFortiClientStatus(connection.output, input.profileName) !== "CONNECTED") {
    throw new Error(`Não foi possível conectar automaticamente à VPN ${input.provider}. Verifique perfil, credenciais, MFA ou aceite pendente no FortiClient.`);
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (await isTargetReachable(input.targetUrl)) {
      return {
        required: true,
        connected: true,
        connectedAutomatically: true,
        provider: input.provider,
        profileName: input.profileName,
        verification: "TARGET_REACHABLE",
      };
    }
    const current = await runFortiVpn(["--cli", "--status", "--tunnel", input.profileName]);
    if (parseFortiClientStatus(current.output, input.profileName) === "CONNECTED") {
      return {
        required: true,
        connected: true,
        connectedAutomatically: true,
        provider: input.provider,
        profileName: input.profileName,
        verification: "CLIENT_STATUS",
      };
    }
    await new Promise(resolve => setTimeout(resolve, 1_500));
  }

  throw new Error(`A VPN ${input.provider} não confirmou a conexão dentro do tempo esperado.`);
}

export function assertCompatibleVpnRequirements(requirements: VpnRequirement[]) {
  const distinct = new Set(
    requirements
      .filter(item => item.provider !== "NONE")
      .map(item => `${item.provider}:${item.profileName.trim().toLowerCase()}`),
  );
  if (distinct.size > 1) {
    throw new Error("Os ambientes selecionados usam VPNs diferentes. Execute-os separadamente, pois o FortiClient mantém apenas um túnel automático por vez.");
  }
}
