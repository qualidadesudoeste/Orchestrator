import { describe, expect, it } from "vitest";
import { isExternalAccessBlock, normalizePlaywrightKey } from "./qaPilotRuntime";

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
});
