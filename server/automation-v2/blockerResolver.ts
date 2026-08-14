import type { QaScenarioStep } from "../qaPilotAgent";

export type BlockerCategory =
  | "UI_STATE"
  | "AUTH_SESSION"
  | "NAVIGATION"
  | "SIMPLE_DATA"
  | "BUSINESS_DATA"
  | "PERMISSION"
  | "NETWORK"
  | "EXTERNAL";

export type BlockerStrategy =
  | "PROJECT_PROVISIONER"
  | "DISMISS_OVERLAY_AND_REMAP"
  | "REAUTHENTICATE"
  | "DISCOVER_ROUTE"
  | "FILL_SYNTHETIC_DATA"
  | "FIND_OR_CREATE_RECORD"
  | "SWITCH_OR_CREATE_ACCOUNT"
  | "RELOAD_AND_RETRY"
  | "REPORT_EXTERNAL_DEPENDENCY";

function normalized(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function classifyBlocker(step: QaScenarioStep, observed: unknown): BlockerCategory {
  const text = normalized(`${step.text} ${observed}`);
  if (/captcha|otp|codigo sms|assinatura digital|aprovacao humana/.test(text)) return "EXTERNAL";
  if (/vpn|conexao|network|rede|timeout|indisponivel|fora do ar/.test(text)) return "NETWORK";
  if (/perfil|permissao|visualizador|analista|administrador|segundo usuario|outra conta/.test(text)) return "PERMISSION";
  if (/sessao|login|autentic|credencia|senha/.test(text)) return "AUTH_SESSION";
  if (/modal|overlay|dialog|dropdown|elemento|botao|campo.*intercept/.test(text)) return "UI_STATE";
  if (/cpf|cnpj|email|telefone|cep|nome|data valida|formulario/.test(text)) return "SIMPLE_DATA";
  if (/registro|massa|autorizacao|manifestacao|conteudo|rascunho|vencid|expirad|mais de \d+|arquivo assincrono/.test(text)) return "BUSINESS_DATA";
  if (/rota|pagina|tela|menu|caminho|url|nao.*encontrad/.test(text)) return "NAVIGATION";
  return step.keyword === "DADO" ? "BUSINESS_DATA" : "UI_STATE";
}

export function strategiesForBlocker(category: BlockerCategory): BlockerStrategy[] {
  switch (category) {
    case "UI_STATE": return ["DISMISS_OVERLAY_AND_REMAP"];
    case "AUTH_SESSION": return ["REAUTHENTICATE"];
    case "NAVIGATION": return ["DISCOVER_ROUTE"];
    case "SIMPLE_DATA": return ["FILL_SYNTHETIC_DATA"];
    case "BUSINESS_DATA": return ["PROJECT_PROVISIONER", "FIND_OR_CREATE_RECORD"];
    case "PERMISSION": return ["PROJECT_PROVISIONER", "SWITCH_OR_CREATE_ACCOUNT"];
    case "NETWORK": return ["RELOAD_AND_RETRY"];
    case "EXTERNAL": return ["REPORT_EXTERNAL_DEPENDENCY"];
  }
}
