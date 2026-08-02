import { describe, expect, it } from "vitest";
import { assertCompatibleVpnRequirements, parseFortiClientStatus } from "./vpnService";

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
});
