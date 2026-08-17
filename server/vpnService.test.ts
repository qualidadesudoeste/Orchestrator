import { describe, expect, it, vi } from "vitest";

const preflightEnvironmentAccess = vi.hoisted(() => vi.fn());
vi.mock("./environmentPreflightService", () => ({ preflightEnvironmentAccess }));

import { assertCompatibleVpnRequirements, ensureVpnConnection, isTrustedFortinetSignature, parseFortiClientStatus, validateInstallerSettings, VpnManualActionRequiredError } from "./vpnService";

describe("vpnService", () => {
  it("identifica um túnel FortiClient conectado", () => {
    expect(parseFortiClientStatus("sslvpn Sefaz :: Connected", "Sefaz")).toBe("CONNECTED");
    expect(parseFortiClientStatus("sslvpn Sefaz :: Disconnected", "Sefaz")).toBe("DISCONNECTED");
  });

  it("identifica versões sem suporte ao FortiVPN CLI", () => {
    expect(parseFortiClientStatus("error parsing options: Option 'cli' does not exist", "Sefaz")).toBe("UNAVAILABLE");
  });

  it("diferencia espera por acao manual de falha de automacao", () => {
    const error = new VpnManualActionRequiredError("Conecte a VPN e retome.");
    expect(error.name).toBe("VpnManualActionRequiredError");
    expect(error.code).toBe("VPN_MANUAL_ACTION_REQUIRED");
  });

  it("nao confunde uma porta HTTPS aberta com VPN pronta para o navegador", async () => {
    preflightEnvironmentAccess.mockResolvedValue({ externallyBlocked: true });
    await expect(ensureVpnConnection({
      provider: "COGEL",
      profileName: "Cogel",
      autoConnect: false,
      targetUrl: "https://sistema.interno",
    })).rejects.toBeInstanceOf(VpnManualActionRequiredError);
  });

  it("libera a execucao quando o navegador realmente alcanca o sistema", async () => {
    preflightEnvironmentAccess.mockResolvedValue({ externallyBlocked: false });
    await expect(ensureVpnConnection({
      provider: "COGEL",
      profileName: "Cogel",
      autoConnect: false,
      targetUrl: "https://sistema.interno",
    })).resolves.toMatchObject({ connected: true, verification: "TARGET_REACHABLE" });
  });

  it("permite ambientes públicos e uma única VPN na mesma execução", () => {
    expect(() => assertCompatibleVpnRequirements([
      { provider: "NONE", profileName: "", autoConnect: false, targetUrl: "https://portal.local" },
      { provider: "SEFAZ", profileName: "Sefaz", autoConnect: true, targetUrl: "https://retaguarda.local" },
    ])).not.toThrow();
  });

  it("impede duas VPNs incompatíveis na mesma execução", () => {
    expect(() => assertCompatibleVpnRequirements([
      { provider: "COGEL", profileName: "Prodeb", autoConnect: true, targetUrl: "https://a.local" },
      { provider: "SEFAZ", profileName: "Sefaz", autoConnect: true, targetUrl: "https://b.local" },
    ])).toThrow(/VPNs diferentes/);
  });

  it("aceita somente instalador HTTPS com SHA-256 e extensão suportada", () => {
    const settings = validateInstallerSettings(
      "https://downloads.example.org/FortiClientVPN.msi",
      "a".repeat(64),
    );
    expect(settings.extension).toBe(".msi");
    expect(validateInstallerSettings("https://links.fortinet.com/forticlient/win/vpnagent", "b".repeat(64)).extension).toBe(".exe");
    expect(() => validateInstallerSettings("https://example.org/download", "a".repeat(64))).toThrow(/link oficial/);
    expect(() => validateInstallerSettings("http://example.org/client.msi", "a".repeat(64))).toThrow(/HTTPS/);
    expect(() => validateInstallerSettings("https://example.org/client.zip", "a".repeat(64))).toThrow(/msi ou .exe/);
    expect(() => validateInstallerSettings("https://example.org/client.exe", "invalido")).toThrow(/SHA-256/);
  });

  it("confia somente em assinatura válida da Fortinet", () => {
    expect(isTrustedFortinetSignature("Valid", "CN=Fortinet Technologies Inc")).toBe(true);
    expect(isTrustedFortinetSignature("NotSigned", "CN=Fortinet Technologies Inc")).toBe(false);
    expect(isTrustedFortinetSignature("Valid", "CN=Fornecedor desconhecido")).toBe(false);
  });
});
