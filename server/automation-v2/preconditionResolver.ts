import { matchAutomationSkills } from "./skillRegistry";
import type { AutomationSkill, CompiledScenario, ExecutableScenarioPlan, StepResolution } from "./types";

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[_-]+/g, " ");
}

function relatedDataKeys(text: string, testData: Record<string, string>): string[] {
  const wanted = normalized(text);
  return Object.keys(testData).filter(key => {
    const words = normalized(key).split(/\s+/).filter(word => word.length >= 3);
    return words.some(word => wanted.includes(word));
  });
}

export function resolveScenarioPlan(input: {
  scenario: CompiledScenario;
  testData?: Record<string, string>;
  learnedSkills?: AutomationSkill[];
}): ExecutableScenarioPlan {
  const testData = input.testData ?? {};
  const resolutions: StepResolution[] = input.scenario.steps.map(step => {
    const skills = matchAutomationSkills(step, input.learnedSkills);
    const dataKeys = relatedDataKeys(step.text, testData);
    const external = /captcha|token externo|aprova[cç][aã]o humana|assinatura digital|otp|c[oó]digo sms/i.test(step.text);
    if (external && !dataKeys.length) {
      return { stepId: step.id, state: "EXTERNAL_BLOCK", skillIds: skills.map(skill => skill.id), availableDataKeys: [], reason: "Dependência externa explícita sem dado ou adaptador disponível." };
    }
    if (skills.some(skill => skill.deterministic) || dataKeys.length) {
      return { stepId: step.id, state: "READY", skillIds: skills.map(skill => skill.id), availableDataKeys: dataKeys, reason: "Habilidade determinística ou dado automático disponível." };
    }
    if (step.keyword === "DADO") {
      return { stepId: step.id, state: "PROVISION_REQUIRED", skillIds: [], availableDataKeys: [], reason: "A pré-condição deve ser criada por adaptador, interface ou descoberta segura." };
    }
    return { stepId: step.id, state: "DISCOVERY_REQUIRED", skillIds: [], availableDataKeys: [], reason: "Passo desconhecido; requer descoberta assistida antes da execução determinística." };
  });
  const unresolved = resolutions.filter(item => item.state !== "READY");
  const mode = unresolved.length === 0 ? "DETERMINISTIC"
    : unresolved.length === resolutions.length ? "DISCOVERY" : "HYBRID";
  return { version: 2, scenario: input.scenario, mode, resolutions };
}
