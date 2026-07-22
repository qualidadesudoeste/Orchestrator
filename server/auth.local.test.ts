import bcrypt from "bcryptjs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getUserByUsername } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getUserByUsername: vi.fn(),
  };
});

const mockedGetUserByUsername = vi.mocked(getUserByUsername);
let passwordHash = "";

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
  beforeAll(async () => {
    passwordHash = await bcrypt.hash("admin123", 4);
  });

  beforeEach(() => {
    mockedGetUserByUsername.mockImplementation(async (username: string) => {
      if (username !== "admin") return undefined;
      return {
        id: 1,
        openId: null,
        username: "admin",
        passwordHash,
        name: "Administrador",
        email: "admin@example.test",
        loginMethod: "local",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };
    });
  });

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
