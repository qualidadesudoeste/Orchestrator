import { describe, expect, it } from "vitest";
import {
  safeErrorMessage,
  sanitizeSensitiveData,
  sanitizeSensitiveText,
} from "./sensitiveData";

describe("sanitizacao central", () => {
  it("remove segredos, PII e valores locais conhecidos", () => {
    const result = sanitizeSensitiveText(
      "cpf 123.456.789-00 email qa@example.com telefone (71) 99999-0000 valor abc-123 token=secret-value",
      { knownValues: { PROTOCOLO: "abc-123" } }
    );
    expect(result).toContain("[REDACTED_CPF]");
    expect(result).toContain("[REDACTED_EMAIL]");
    expect(result).toContain("[REDACTED_PHONE]");
    expect(result).toContain("[LOCAL:PROTOCOLO]");
    expect(result).not.toContain("secret-value");
  });

  it("sanitiza objetos recursivamente por nome de chave", () => {
    expect(
      sanitizeSensitiveData({ nested: { password: "123", value: "ok" } })
    ).toEqual({ nested: { password: "[REDACTED]", value: "ok" } });
  });

  it("sanitiza mensagens de erro antes do log", () => {
    expect(
      safeErrorMessage(new Error("Authorization: Bearer abc.def"))
    ).not.toContain("abc.def");
  });
});
