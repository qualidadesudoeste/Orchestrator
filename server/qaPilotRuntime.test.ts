import { describe, expect, it } from "vitest";
import { isActionableNetworkFailure, isExternalAccessBlock, normalizePlaywrightKey } from "./qaPilotRuntime";

describe("PlaywrightPilotRuntime helpers", () => {
  it("normaliza teclas e modificadores para os nomes aceitos pelo Playwright", () => {
    expect(normalizePlaywrightKey("ENTER")).toBe("Enter");
    expect(normalizePlaywrightKey("TAB")).toBe("Tab");
    expect(normalizePlaywrightKey("CTRL+A")).toBe("Control+A");
    expect(normalizePlaywrightKey("Shift+ARROWDOWN")).toBe("Shift+ArrowDown");
  });

  it("reconhece bloqueios externos de acesso", () => {
    expect(isExternalAccessBlock("URL bloqueada por política de segurança")).toBe(true);
    expect(isExternalAccessBlock("Painel executivo carregado normalmente")).toBe(false);
  });

  it("não transforma cancelamentos normais de navegação em falha de rede", () => {
    expect(isActionableNetworkFailure("net::ERR_ABORTED")).toBe(false);
    expect(isActionableNetworkFailure("csp")).toBe(false);
    expect(isActionableNetworkFailure("net::ERR_CONNECTION_REFUSED")).toBe(true);
    expect(isActionableNetworkFailure("net::ERR_NAME_NOT_RESOLVED")).toBe(true);
  });
});
