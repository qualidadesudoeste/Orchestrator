import type { AutomationSkill, CompiledBddStep } from "./types";

const universalSkills: AutomationSkill[] = [
  { id: "universal.login", name: "Autenticação semântica", action: "LOGIN", patterns: [/login|autenticad|autenticar|credencia|sess[aã]o/i], priority: 100, deterministic: true },
  { id: "universal.navigate", name: "Navegação autorizada", action: "NAVIGATE", patterns: [/acessar|navegar|abrir|p[aá]gina|tela|portal|site|\/[-a-z0-9/]+/i], priority: 90, deterministic: true },
  { id: "universal.form", name: "Preenchimento com dados sintéticos", action: "FILL_FORM", patterns: [/preencher|informar|dados v[aá]lidos|formul[aá]rio|cadastro/i], priority: 80, deterministic: true },
  { id: "universal.click", name: "Interação semântica", action: "CLICK", patterns: [/clicar|acionar|enviar|confirmar|salvar|selecionar/i], priority: 70, deterministic: false },
  { id: "universal.check", name: "Marcação idempotente", action: "CHECK", patterns: [/aceite|checkbox|termo|consentimento|privacidade|lgpd/i], priority: 85, deterministic: true },
  { id: "universal.search", name: "Pesquisa e filtro", action: "SEARCH", patterns: [/buscar|pesquisar|filtrar|consultar/i], priority: 75, deterministic: false },
  { id: "universal.download", name: "Download rastreável", action: "DOWNLOAD", patterns: [/download|baixar|exportar|arquivo/i], priority: 85, deterministic: false },
  { id: "universal.capture", name: "Captura de identificador", action: "CAPTURE_VALUE", patterns: [/protocolo|identificador|c[oó]digo|capturar/i], priority: 70, deterministic: false },
  { id: "universal.assert", name: "Asserção observável", action: "ASSERT_VISIBLE", patterns: [/exib|visualiz|apresent|retorn|deve|situa[cç][aã]o|resultado|aprovad|conclu[ií]d|sucesso/i], priority: 60, deterministic: false },
];

export function allAutomationSkills(learned: AutomationSkill[] = []): AutomationSkill[] {
  return [...learned, ...universalSkills].sort((a, b) => b.priority - a.priority);
}

export function matchAutomationSkills(step: CompiledBddStep, learned: AutomationSkill[] = []): AutomationSkill[] {
  return allAutomationSkills(learned).filter(skill => skill.patterns.some(pattern => pattern.test(step.text)));
}
