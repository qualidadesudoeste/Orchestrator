import { describe, expect, it, vi } from "vitest";
import { preflightEnvironmentAccess, type EnvironmentProbeResult } from "./environmentPreflightService";

function result(externallyBlocked: boolean): EnvironmentProbeResult {
  return {
    url: "https://example.test/login",
    status: externallyBlocked ? 500 : 200,
    title: externallyBlocked ? "URL Bloqueada" : "Login",
    externallyBlocked,
    detail: externallyBlocked ? "bloqueado" : "acessível",
  };
}

describe("preflightEnvironmentAccess", () => {
  it("confirma o bloqueio externo em duas sondagens antes de interromper o plano", async () => {
    const probe = vi.fn().mockResolvedValue(result(true));
    const preflight = await preflightEnvironmentAccess("https://example.test/login", { probe });
    expect(preflight.externallyBlocked).toBe(true);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("continua quando uma nova sondagem consegue acessar o ambiente", async () => {
    const probe = vi.fn()
      .mockResolvedValueOnce(result(true))
      .mockResolvedValueOnce(result(false));
    const preflight = await preflightEnvironmentAccess("https://example.test/login", { probe });
    expect(preflight.externallyBlocked).toBe(false);
    expect(probe).toHaveBeenCalledTimes(2);
  });
});
