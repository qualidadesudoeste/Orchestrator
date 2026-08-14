import { describe, expect, it } from "vitest";
import { classifyBlocker, strategiesForBlocker } from "./blockerResolver";

const step = { id: "S1", keyword: "DADO" as const, text: "registro disponível", sourceLine: "Dado registro disponível" };

describe("resolvedor autônomo de bloqueios", () => {
  it("classifica causas sem depender do identificador do cenário", () => {
    expect(classifyBlocker(step, "Falta uma conta com perfil visualizador")).toBe("PERMISSION");
    expect(classifyBlocker(step, "Modal interceptou o botão")).toBe("UI_STATE");
    expect(classifyBlocker(step, "Registro vencido não encontrado")).toBe("BUSINESS_DATA");
    expect(classifyBlocker(step, "CAPTCHA precisa de aprovação humana")).toBe("EXTERNAL");
  });

  it("oferece estratégias executáveis por categoria", () => {
    expect(strategiesForBlocker("BUSINESS_DATA")).toEqual(["PROJECT_PROVISIONER", "FIND_OR_CREATE_RECORD"]);
    expect(strategiesForBlocker("AUTH_SESSION")).toEqual(["REAUTHENTICATE"]);
  });
});
