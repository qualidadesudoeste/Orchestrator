import { describe, expect, it, vi } from "vitest";
import {
  bootstrapInitialAdmin,
  type BootstrapAdminRepository,
} from "./bootstrapAdminService";

function repository(hasUsers = false): BootstrapAdminRepository {
  return {
    hasUsers: vi.fn().mockResolvedValue(hasUsers),
    createAdmin: vi.fn().mockResolvedValue(undefined),
  };
}

describe("bootstrapInitialAdmin", () => {
  it("cria o primeiro usuário como administrador", async () => {
    const store = repository();
    const hashPassword = vi.fn().mockResolvedValue("hash-seguro");

    const result = await bootstrapInitialAdmin(
      {
        username: " qa.admin ",
        password: "senha-muito-forte-123",
        name: " Administradora QA ",
        email: " qa@example.test ",
      },
      store,
      hashPassword,
    );

    expect(result).toEqual({ created: true });
    expect(hashPassword).toHaveBeenCalledWith("senha-muito-forte-123");
    expect(store.createAdmin).toHaveBeenCalledWith({
      username: "qa.admin",
      passwordHash: "hash-seguro",
      name: "Administradora QA",
      email: "qa@example.test",
    });
  });

  it("é idempotente quando já existe qualquer usuário", async () => {
    const store = repository(true);
    const hashPassword = vi.fn();

    const result = await bootstrapInitialAdmin(
      {
        username: "qa.admin",
        password: "senha-muito-forte-123",
        name: "Administradora QA",
      },
      store,
      hashPassword,
    );

    expect(result).toEqual({ created: false, reason: "users_exist" });
    expect(hashPassword).not.toHaveBeenCalled();
    expect(store.createAdmin).not.toHaveBeenCalled();
  });

  it("recusa credenciais iniciais fracas ou inválidas", async () => {
    const store = repository();

    await expect(
      bootstrapInitialAdmin(
        {
          username: "x",
          password: "curta",
          name: "A",
        },
        store,
        vi.fn(),
      ),
    ).rejects.toThrow("ADMIN_USERNAME");
    expect(store.hasUsers).not.toHaveBeenCalled();
  });
});
