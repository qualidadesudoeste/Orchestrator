import { describe, expect, it } from "vitest";
import {
  assertConfiguredTargetUrl,
  assertSafeManualTargetUrl,
  isPrivateAddress,
} from "./urlPolicy";

describe("politica de URL do executor", () => {
  it("aceita somente origens cadastradas", () => {
    expect(() =>
      assertConfiguredTargetUrl("https://qa.example.com/login", [
        "https://qa.example.com/app",
      ])
    ).not.toThrow();
    expect(() =>
      assertConfiguredTargetUrl("https://evil.example.com", [
        "https://qa.example.com",
      ])
    ).toThrow(/ambiente previamente aprovado/);
  });

  it("identifica redes privadas e reservadas", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("10.20.30.40")).toBe(true);
    expect(isPrivateAddress("192.168.1.2")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });

  it("rejeita destino manual que resolve internamente", async () => {
    await expect(
      assertSafeManualTargetUrl(
        "https://public.example",
        async () => [{ address: "10.0.0.2", family: 4 }] as never
      )
    ).rejects.toThrow(/rede privada/);
  });
});
