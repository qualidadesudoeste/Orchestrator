import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";

type Lookup = typeof dnsLookup;

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part)))
    return true;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

export function normalizedHttpOrigin(value: string): string {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol))
    throw new Error("A URL deve usar HTTP ou HTTPS.");
  if (url.username || url.password)
    throw new Error("A URL não pode conter credenciais.");
  return url.origin;
}

export function assertConfiguredTargetUrl(
  value: string,
  configuredUrls: string[]
): void {
  const targetOrigin = normalizedHttpOrigin(value);
  const configuredOrigins = new Set(configuredUrls.map(normalizedHttpOrigin));
  if (!configuredOrigins.has(targetOrigin)) {
    throw new Error(
      "A URL deve pertencer a um ambiente previamente aprovado para o projeto."
    );
  }
}

export async function assertSafeManualTargetUrl(
  value: string,
  lookup: Lookup = dnsLookup
): Promise<void> {
  const url = new URL(value);
  normalizedHttpOrigin(value);
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error(
      "Endereços locais não são permitidos em execuções manuais."
    );
  }
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (
    !addresses.length ||
    addresses.some(item => isPrivateAddress(item.address))
  ) {
    throw new Error(
      "A URL manual resolve para uma rede privada, reservada ou não verificável."
    );
  }
}
