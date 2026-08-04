import { describe, expect, it } from "vitest";
import { assertCompatibleVpnRequirements, isTrustedFortinetSignature, parseFortiClientStatus, validateInstallerSettings } from "./vpnService";

describe("vpnService", () => {
  it("identifica um túnel FortiClient conectado", () => {
    expect(parseFortiClientStatus("sslvpn Sefaz :: Connected", "Sefaz")).toBe("CONNECTED");
    expect(parseFortiClientStatus("sslvpn Sefaz :: Disconnected", "Sefaz")).toBe("DISCONNECTED");
  });

  it("identifica versões sem suporte ao FortiVPN CLI", () => {
    expect(parseFortiClientStatus("error parsing options: Option 'cli' does not exist", "Sefaz")).toBe("UNAVAILABLE");
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
