import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      cookie: () => {},
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

describe("auth.login (local)", () => {
  it("deve retornar sucesso com credenciais válidas", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.auth.login({ username: "admin", password: "admin123" });
    expect(result.success).toBe(true);
    expect(result.user.role).toBe("admin");
    expect(result.user.username).toBe("admin");
    // passwordHash não deve ser exposto
    expect((result.user as any).passwordHash).toBeUndefined();
  });

  it("deve rejeitar senha incorreta", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.auth.login({ username: "admin", password: "senhaerrada" })
    ).rejects.toThrow("Usuário ou senha inválidos.");
  });

  it("deve rejeitar usuário inexistente", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.auth.login({ username: "naoexiste", password: "qualquer" })
    ).rejects.toThrow("Usuário ou senha inválidos.");
  });
});
