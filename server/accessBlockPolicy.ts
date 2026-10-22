export function isExternalAccessBlock(value: unknown): boolean {
  const text = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /url bloqueada|pagina bloqueada|bloquead[ao] por politica de seguranca|access denied|request blocked|web application firewall|forbidden/.test(text);
}
