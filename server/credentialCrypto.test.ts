import { beforeEach, describe, expect, it } from "vitest";

describe("credential crypto", () => {
  beforeEach(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = "teste-local-credenciais-1234567890-segura";
  });

  it("criptografa e recupera sem armazenar o texto puro", async () => {
    const { decryptCredential, encryptCredential } = await import("./credentialCrypto");
    const encrypted = encryptCredential("Senha-de-teste!123");
    expect(encrypted).not.toContain("Senha-de-teste!123");
    expect(decryptCredential(encrypted)).toBe("Senha-de-teste!123");
  });
});
