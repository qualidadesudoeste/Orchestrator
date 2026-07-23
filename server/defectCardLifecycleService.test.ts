import { describe, expect, it } from "vitest";
import {
  DefectCardTransitionError,
  assertDefectCardTransition,
  availableDefectCardTransitions,
  canTransitionDefectCard,
} from "./defectCardLifecycleService";

describe("ciclo de vida dos cards de defeito", () => {
  it("permite o fluxo normal até a resolução", () => {
    expect(canTransitionDefectCard("ABERTO", "COPIADO")).toBe(true);
    expect(canTransitionDefectCard("COPIADO", "RESOLVIDO")).toBe(true);
  });

  it("permite reabrir cards resolvidos ou descartados", () => {
    expect(availableDefectCardTransitions("RESOLVIDO")).toEqual(["REABERTO"]);
    expect(availableDefectCardTransitions("DESCARTADO")).toEqual(["REABERTO"]);
  });

  it("não permite voltar diretamente de resolvido para aberto", () => {
    expect(() =>
      assertDefectCardTransition("RESOLVIDO", "ABERTO"),
    ).toThrow(DefectCardTransitionError);
  });

  it("trata a repetição do mesmo estado como operação idempotente", () => {
    expect(canTransitionDefectCard("COPIADO", "COPIADO")).toBe(true);
  });
});
