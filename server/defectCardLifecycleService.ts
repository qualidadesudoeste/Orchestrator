export const DEFECT_CARD_STATUSES = [
  "ABERTO",
  "COPIADO",
  "RESOLVIDO",
  "REABERTO",
  "DESCARTADO",
] as const;

export type DefectCardStatus = (typeof DEFECT_CARD_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<DefectCardStatus, DefectCardStatus[]> = {
  ABERTO: ["COPIADO", "RESOLVIDO", "DESCARTADO"],
  COPIADO: ["RESOLVIDO", "DESCARTADO"],
  RESOLVIDO: ["REABERTO"],
  REABERTO: ["COPIADO", "RESOLVIDO", "DESCARTADO"],
  DESCARTADO: ["REABERTO"],
};

export class DefectCardTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DefectCardTransitionError";
  }
}

export function canTransitionDefectCard(
  from: DefectCardStatus,
  to: DefectCardStatus,
): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertDefectCardTransition(
  from: DefectCardStatus,
  to: DefectCardStatus,
): void {
  if (!canTransitionDefectCard(from, to)) {
    throw new DefectCardTransitionError(
      `Não é possível alterar um card de ${from} para ${to}.`,
    );
  }
}

export function availableDefectCardTransitions(
  status: DefectCardStatus,
): DefectCardStatus[] {
  return [...ALLOWED_TRANSITIONS[status]];
}
