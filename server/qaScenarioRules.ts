export type QaCase = {
  id: string;
  titulo: string;
  prioridade: string;
  dado: string;
  quando: string;
  entao: string;
  resultado_esperado: string;
  tipo: string;
  produz?: string[];
  consome?: string[];
};

export type QaPlan = {
  resumo: string;
  cobertura: {
    funcional: string[];
    naoFuncional: string[];
    heuristicas: string[];
  };
  cards: Array<{ categoria: string; casos: QaCase[] }>;
};

type PlanContext = {
  userStory: string;
  systemType: string;
  criticality: "low" | "medium" | "high" | "critical";
};

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const BOILERPLATE_TITLES = new Set([
  "executar o fluxo principal com dados validos",
  "validar campos obrigatorios nao preenchidos",
  "impedir acesso com credenciais ou permissao invalida",
  "operar o fluxo principal somente pelo teclado",
]);

const isBoilerplateCase = (item: QaCase) => BOILERPLATE_TITLES.has(normalize(item.titulo));

const allCaseText = (plan: QaPlan) =>
  normalize(plan.cards.flatMap(card => card.casos).map(item =>
    `${item.titulo} ${item.dado} ${item.quando} ${item.entao}`,
  ).join(" "));

const makeCase = (
  id: string,
  titulo: string,
  prioridade: string,
  dado: string,
  quando: string,
  entao: string,
  tipo: string,
): QaCase => ({
  id,
  titulo,
  prioridade,
  dado,
  quando,
  entao,
  resultado_esperado: entao,
  tipo,
  produz: [],
  consome: [],
});

const nextId = (plan: QaPlan) => {
  const count = plan.cards.reduce((total, card) => total + card.casos.length, 0);
  return `CT-${String(count + 1).padStart(3, "0")}`;
};

const addCase = (plan: QaPlan, category: string, item: QaCase) => {
  const card = plan.cards.find(current => current.categoria === category);
  if (card) card.casos.push(item);
  else plan.cards.push({ categoria: category, casos: [item] });
};

/**
 * Complements the local model with a small deterministic QA safety net.
 * The rules deliberately add only broad, reusable checks and cap the plan at
 * 12 cases so a small local model remains practical on low-memory computers.
 */
export function enhancePlanWithQaRules(plan: QaPlan, context: PlanContext): QaPlan {
  const enhanced = structuredClone(plan);
  enhanced.cobertura ||= { funcional: [], naoFuncional: [], heuristicas: [] };
  enhanced.cards = (enhanced.cards ?? [])
    .map(card => ({ ...card, categoria: card.categoria.trim(), casos: card.casos ?? [] }))
    .filter(card => card.categoria && card.casos.length > 0);
  const groundedCaseCount = enhanced.cards.flatMap(card => card.casos)
    .filter(item => !isBoilerplateCase(item)).length;
  if (groundedCaseCount >= 3) {
    enhanced.cards = enhanced.cards
      .map(card => ({ ...card, casos: card.casos.filter(item => !isBoilerplateCase(item)) }))
      .filter(card => card.casos.length > 0);
  }
  let text = allCaseText(enhanced);
  const story = normalize(context.userStory);
  const total = () => enhanced.cards.reduce((sum, card) => sum + card.casos.length, 0);
  const canAdd = () => total() < 12;
  const fallbackMode = total() === 0;

  const hasPositiveOutcome = /(fluxo principal|sucesso|com sucesso|valido|salv|cadastr|registr|criad|exibid|consult|localiz|conclu|confirm|atualiz)/.test(text);
  if (canAdd() && (fallbackMode || total() < 2) && !hasPositiveOutcome) {
    addCase(enhanced, "Fluxo principal", makeCase(
      nextId(enhanced), "Executar o fluxo principal com dados válidos", "alta",
      "que o usuário possui dados válidos e atende às pré-condições da história",
      "executa o fluxo principal descrito na História de Usuário",
      "a operação deve ser concluída com sucesso e apresentar confirmação ao usuário",
      "funcional",
    ));
    enhanced.cobertura.funcional.push("Fluxo principal com dados válidos");
    text = allCaseText(enhanced);
  }

  const hasInput = /(campo|formulario|formulário|preench|cadastr|login|senha|email|salvar|enviar)/.test(story);
  const explicitlyRequiresValidation = /(obrigat|validac|validar|vazio|nao preench|não preench|inval|formato|limite|mensagem de erro)/.test(story);
  if (canAdd() && hasInput && (fallbackMode || explicitlyRequiresValidation) && !/(obrigatorio|obrigatório|vazio|nao preench|não preench)/.test(text)) {
    addCase(enhanced, "Validações", makeCase(
      nextId(enhanced), "Validar campos obrigatórios não preenchidos", "alta",
      "que o usuário acessou o formulário sem preencher os campos obrigatórios",
      "tenta prosseguir com a operação",
      "o sistema deve impedir o envio e identificar os campos que precisam ser preenchidos",
      "funcional",
    ));
    enhanced.cobertura.funcional.push("Validação de obrigatoriedade");
    text = allCaseText(enhanced);
  }

  const hasAccess = /(login|senha|acesso|permiss|perfil|autentic|credencial|autoriz)/.test(story);
  if (canAdd() && hasAccess && !/(permiss|nao autoriz|não autoriz|acesso negado|credencial invalida|credencial inválida)/.test(text)) {
    addCase(enhanced, "Segurança", makeCase(
      nextId(enhanced), "Impedir acesso com credenciais ou permissão inválida", "alta",
      "que o usuário não possui uma credencial ou permissão válida para a operação",
      "tenta acessar ou executar a funcionalidade protegida",
      "o sistema deve negar o acesso sem revelar informações sensíveis",
      "segurança",
    ));
    enhanced.cobertura.naoFuncional.push("Autorização e proteção de dados");
    text = allCaseText(enhanced);
  }

  const needsAccessibility = ["web", "mobile"].includes(context.systemType) &&
    ["high", "critical"].includes(context.criticality) &&
    (fallbackMode || /(acessibilidade|teclado|leitor de tela|foco)/.test(story));
  if (canAdd() && needsAccessibility && !/(teclado|acessibilidade|leitor de tela|foco)/.test(text)) {
    addCase(enhanced, "Usabilidade e acessibilidade", makeCase(
      nextId(enhanced), "Operar o fluxo principal somente pelo teclado", "média",
      "que o usuário acessa a interface sem utilizar o mouse",
      "navega pelos controles e executa a ação principal usando o teclado",
      "todos os controles devem receber foco visível e a operação deve ser concluída",
      "usabilidade",
    ));
    enhanced.cobertura.naoFuncional.push("Navegação por teclado e foco visível");
  }

  enhanced.cobertura.heuristicas = Array.from(new Set([
    ...enhanced.cobertura.heuristicas,
    "Fluxo positivo, validações, permissões e riscos proporcionais à criticidade",
  ]));
  enhanced.cobertura.funcional = Array.from(new Set(enhanced.cobertura.funcional));
  enhanced.cobertura.naoFuncional = Array.from(new Set(enhanced.cobertura.naoFuncional));
  return enhanced;
}

export function buildRuleBasedPlan(context: PlanContext): QaPlan {
  const base: QaPlan = {
    resumo: "Plano local criado pelas regras de QA. Revise os detalhes específicos da regra de negócio antes da execução.",
    cobertura: { funcional: [], naoFuncional: [], heuristicas: [] },
    cards: [],
  };
  return enhancePlanWithQaRules(base, context);
}

export function analyzeCoverageWithQaRules(userStory: string, cases: QaCase[]) {
  const text = normalize(cases.map(item => `${item.titulo} ${item.dado} ${item.quando} ${item.entao}`).join(" "));
  const story = normalize(userStory);
  const gaps: Array<{ titulo: string; justificativa: string; risco: "alto" | "medio" | "baixo" }> = [];
  const checks = [
    { found: /(sucesso|com sucesso|valido|válido)/.test(text), title: "Fluxo principal", why: "Não foi identificado um cenário positivo explícito.", risk: "alto" as const },
    { found: !/(campo|formulario|preench|salvar|enviar)/.test(story) || /(obrigatorio|obrigatório|vazio|invalido|inválido)/.test(text), title: "Validação de entrada", why: "A história possui entrada de dados, mas não há validação negativa clara.", risk: "medio" as const },
    { found: !/(usuario|usuário|acesso|permiss|login|senha)/.test(story) || /(permiss|nao autoriz|não autoriz|credencial|acesso negado)/.test(text), title: "Permissão e acesso", why: "A história envolve acesso, mas não cobre usuário sem autorização.", risk: "alto" as const },
  ];
  checks.filter(check => !check.found).forEach(check => gaps.push({
    titulo: check.title,
    justificativa: check.why,
    risco: check.risk,
  }));

  const score = Math.max(0, Math.round(((checks.length - gaps.length) / checks.length) * 100));
  return {
    parecer_geral: gaps.length === 0
      ? "As regras essenciais de QA foram encontradas no conjunto de cenários."
      : `Foram identificadas ${gaps.length} lacuna(s) de cobertura pelas regras locais.`,
    score_cobertura: score,
    cenarios_faltantes: gaps,
    cenarios_repetitivos: [],
    cenarios_irrelevantes: [],
    classificacao_risco: cases.map(item => ({
      id: item.id,
      titulo: item.titulo,
      risco: item.prioridade === "alta" ? "alto" : item.prioridade === "baixa" ? "baixo" : "medio",
      justificativa: `Risco derivado da prioridade ${item.prioridade || "média"} informada no plano.`,
    })),
    recomendacao_execucao: "Execute primeiro o fluxo principal e os cenários de prioridade alta; depois execute validações e usabilidade.",
  };
}
