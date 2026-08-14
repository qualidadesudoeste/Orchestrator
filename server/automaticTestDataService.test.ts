import { describe, expect, it } from "vitest";
import { buildAutomaticTestData, validSyntheticCnpj, validSyntheticCpf } from "./automaticTestDataService";

function validatesCpf(value: string) {
  const values = value.split("").map(Number);
  const digit = (length: number, weight: number) => {
    const remainder = (values.slice(0, length).reduce((sum, item, index) => sum + item * (weight - index), 0) * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return values.length === 11 && values[9] === digit(9, 10) && values[10] === digit(10, 11);
}

describe("massa sintética automática", () => {
  it("gera dados determinísticos e CPF matematicamente válido", () => {
    const first = buildAutomaticTestData("exec-1");
    expect(first).toEqual(buildAutomaticTestData("exec-1"));
    expect(validatesCpf(first.CPF_VALIDO)).toBe(true);
    expect(first.EMAIL_TESTE).toContain("@example.com");
    expect(validSyntheticCpf("outro")).not.toBe(first.CPF_VALIDO);
    expect(validSyntheticCnpj("exec-1")).toMatch(/^\d{14}$/);
    expect(first.CEP_TESTE).toMatch(/^\d{8}$/);
    expect(first.DATA_PASSADA).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
