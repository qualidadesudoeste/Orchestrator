import crypto from "node:crypto";

function digits(seed: string, length: number): number[] {
  const bytes = crypto.createHash("sha256").update(seed).digest();
  return Array.from({ length }, (_, index) => bytes[index % bytes.length] % 10);
}

export function validSyntheticCpf(seed: string): string {
  const base = digits(seed, 9);
  const check = (values: number[], weight: number) => {
    const sum = values.reduce((total, value, index) => total + value * (weight - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  base.push(check(base, 10));
  base.push(check(base, 11));
  return base.join("");
}

export function validSyntheticCnpj(seed: string): string {
  const generated = digits(`${seed}:cnpj`, 7);
  const base = [2, ...generated, 0, 0, 0, 1];
  const digit = (values: number[], weights: number[]) => {
    const remainder = values.reduce((total, value, index) => total + value * weights[index], 0) % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  base.push(digit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  base.push(digit(base, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  return base.join("");
}

function isoDate(offsetDays: number): string {
  const value = new Date();
  value.setHours(12, 0, 0, 0);
  value.setDate(value.getDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

export function buildAutomaticTestData(executionId: string): Record<string, string> {
  const suffix = crypto.createHash("sha256").update(executionId).digest("hex").slice(0, 10);
  return {
    NOME_TESTE: `QA Automacao ${suffix.slice(0, 6)}`,
    CPF_VALIDO: validSyntheticCpf(executionId),
    CNPJ_VALIDO: validSyntheticCnpj(executionId),
    EMAIL_TESTE: `qa.${suffix}@example.com`,
    TELEFONE_TESTE: `719${digits(`${executionId}:phone`, 8).join("")}`,
    CEP_TESTE: `4${digits(`${executionId}:cep`, 7).join("")}`,
    DATA_HOJE: isoDate(0),
    DATA_PASSADA: isoDate(-30),
    DATA_FUTURA: isoDate(30),
    CONTATO_ALTERNATIVO: `qa.alt.${suffix}@example.com`,
    USUARIO_SEGUNDA_CONTA: `qa2.${suffix}@example.com`,
    SENHA_SEGUNDA_CONTA: `Qa!${suffix}a9`,
    TERMO_SEM_RESULTADO: `QA_SEM_RESULTADO_${suffix.toUpperCase()}`,
  };
}
