import type { VpnRequirement } from "./vpnService";

export type ExecutionQueuePool = "PUBLIC" | "COGEL" | "SEFAZ" | "OUTRA";

export type VpnDispatchRequirement = VpnRequirement & {
  globalProfileId?: number | null;
};

export type QueuedExecutionDispatchPayload = {
  vpnRequirement: VpnDispatchRequirement | null;
  webhookBody: Record<string, unknown>;
};

export function queuePoolForProvider(
  provider: string | null | undefined
): ExecutionQueuePool {
  if (provider === "COGEL" || provider === "SEFAZ" || provider === "OUTRA") {
    return provider;
  }
  return "PUBLIC";
}
