import { describe, expect, it } from "vitest";
import { compileSingleGherkinScenario } from "./gherkinCompiler";
import { resolveScenarioPlan } from "./preconditionResolver";

describe("resolvedor de cenários V2", () => {
  it("prioriza habilidades determinísticas e dados automáticos", () => {
    const scenario = compileSingleGherkinScenario([
      "Cenário: Cadastro",
      "Dado visitante com CPF válido",
      "Quando preencher o formulário",
      "Então o protocolo é exibido",
    ].join("\n"));
    const plan = resolveScenarioPlan({ scenario, testData: { CPF_VALIDO: "redacted" } });
    expect(plan.mode).toBe("HYBRID");
    expect(plan.resolutions[0].state).toBe("READY");
  });

  it("reserva bloqueio para dependência externa explícita", () => {
    const scenario = compileSingleGherkinScenario([
      "Cenário: Confirmação externa",
      "Dado código OTP enviado ao celular de terceiro",
      "Quando confirmar a operação",
      "Então a solicitação é aprovada",
    ].join("\n"));
    const plan = resolveScenarioPlan({ scenario });
    expect(plan.resolutions[0].state).toBe("EXTERNAL_BLOCK");
    expect(plan.mode).toBe("DISCOVERY");
  });
});
