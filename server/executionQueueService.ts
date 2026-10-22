import os from "node:os";
import { decryptCredential } from "./credentialCrypto";
import { logError } from "./_core/logger";
import { safeErrorMessage } from "./_core/sensitiveData";
import {
  claimExecutionJob,
  ensureLocalExecutionWorker,
  failExpiredExecutionJobs,
  listActiveExecutionJobs,
  listQueuedExecutionJobs,
  markQueuedExecutionsWaitingForResources,
  pauseExecutionForManualVpn,
  markTestExecutionStartFailure,
  returnExecutionJobToQueue,
  updateExecutionWorkerHeartbeat,
  updateVpnProfile,
} from "./db";
import { ensureVpnConnection, VpnManualActionRequiredError } from "./vpnService";
import { runDirectQaExecution } from "./directQaExecutionService";
import type {
  ExecutionQueuePool,
  QueuedExecutionDispatchPayload,
} from "./executionQueueTypes";
export { queuePoolForProvider } from "./executionQueueTypes";

type CpuSnapshot = { idle: number; total: number };

let timer: NodeJS.Timeout | null = null;
let tickRunning = false;

function cpuSnapshot(): CpuSnapshot {
  return os.cpus().reduce((result, cpu) => {
    const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
    return { idle: result.idle + cpu.times.idle, total: result.total + total };
  }, { idle: 0, total: 0 });
}

async function resourceSnapshot() {
  const before = cpuSnapshot();
  await new Promise(resolve => setTimeout(resolve, 200));
  const after = cpuSnapshot();
  const totalDelta = Math.max(1, after.total - before.total);
  const idleDelta = Math.max(0, after.idle - before.idle);
  return {
    freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
    cpuPercent: Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100))),
  };
}

export function workerCanRunPool(
  configuredPool: "ANY" | ExecutionQueuePool,
  activePool: ExecutionQueuePool | null,
  requestedPool: ExecutionQueuePool,
) {
  if (configuredPool !== "ANY" && configuredPool !== requestedPool) return false;
  return activePool === null || activePool === requestedPool;
}

async function dispatchClaimedJob(job: Awaited<ReturnType<typeof listQueuedExecutionJobs>>[number]) {
  try {
    if (!job.dispatchPayloadEncrypted) throw new Error("A execucao nao possui carga de despacho.");
    const payload = JSON.parse(decryptCredential(job.dispatchPayloadEncrypted)) as QueuedExecutionDispatchPayload;
    const requirement = payload.vpnRequirement;
    const vpnResult = requirement
      ? await ensureVpnConnection(requirement)
      : await ensureVpnConnection({ provider: "NONE", profileName: "", autoConnect: false, targetUrl: job.systemUrl ?? "" });

    if (vpnResult.configurationImported && requirement?.globalProfileId) {
      await updateVpnProfile(requirement.globalProfileId, { configImportedAt: new Date() });
    }

    payload.webhookBody.vpn = {
      requerida: vpnResult.required,
      provedor: vpnResult.provider,
      perfil: vpnResult.profileName ?? "",
      conectada_automaticamente: vpnResult.connectedAutomatically,
      verificacao: vpnResult.verification,
    };
    await runDirectQaExecution(job.externalExecutionId, payload);
  } catch (error) {
    const reason = safeErrorMessage(error || "Falha desconhecida ao iniciar o agente.");
    if (error instanceof VpnManualActionRequiredError) {
      await pauseExecutionForManualVpn(
        job.externalExecutionId,
        reason,
        job.dispatchPayloadEncrypted,
      );
    } else if (job.dispatchAttempts < 2) {
      await returnExecutionJobToQueue(
        job.externalExecutionId,
        `Tentativa ${job.dispatchAttempts + 1} falhou. Aguardando nova tentativa: ${reason}`,
        job.dispatchPayloadEncrypted,
      );
    } else {
      await markTestExecutionStartFailure(job.externalExecutionId, reason);
    }
  }
}

export async function processExecutionQueueOnce() {
  if (tickRunning) return;
  tickRunning = true;
  try {
    const worker = await ensureLocalExecutionWorker();
    await failExpiredExecutionJobs();
    const activeJobs = await listActiveExecutionJobs(worker.id);
    const activePool = activeJobs[0]?.queuePool ?? null;
    let resources = await resourceSnapshot();
    await updateExecutionWorkerHeartbeat(worker.id, {
      currentPool: activePool,
      freeMemoryMb: resources.freeMemoryMb,
      cpuPercent: resources.cpuPercent,
    });

    if (worker.status !== "ONLINE") {
      await markQueuedExecutionsWaitingForResources("O worker local está pausado ou offline. Um administrador precisa reativá-lo em Parâmetros.");
      return;
    }
    if (resources.freeMemoryMb < worker.minFreeMemoryMb) {
      await markQueuedExecutionsWaitingForResources(
        `Worker livre, mas aguardando memória: ${resources.freeMemoryMb} MB disponíveis; mínimo configurado de ${worker.minFreeMemoryMb} MB.`,
      );
      return;
    }
    if (resources.cpuPercent > worker.maxCpuPercent) {
      await markQueuedExecutionsWaitingForResources(
        `Worker livre, mas aguardando CPU: uso atual de ${resources.cpuPercent}%; limite configurado de ${worker.maxCpuPercent}%.`,
      );
      return;
    }

    let availableSlots = Math.max(0, worker.maxConcurrency - activeJobs.length);
    if (availableSlots === 0) return;
    const queued = await listQueuedExecutionJobs(50);
    let selectedPool = activePool;
    let dispatchedThisTick = 0;

    for (const job of queued) {
      if (availableSlots === 0) break;
      if (dispatchedThisTick > 0) {
        await new Promise(resolve => setTimeout(resolve, 1_000));
        resources = await resourceSnapshot();
        await updateExecutionWorkerHeartbeat(worker.id, {
          currentPool: selectedPool,
          freeMemoryMb: resources.freeMemoryMb,
          cpuPercent: resources.cpuPercent,
        });
        if (resources.freeMemoryMb < worker.minFreeMemoryMb || resources.cpuPercent > worker.maxCpuPercent) break;
      }
      if (!workerCanRunPool(worker.networkPool, selectedPool, job.queuePool)) continue;
      if (!(await claimExecutionJob(job.id, worker.id))) continue;
      selectedPool ??= job.queuePool;
      availableSlots -= 1;
      void dispatchClaimedJob(job).finally(() => wakeExecutionQueue());
      dispatchedThisTick += 1;
    }

    await updateExecutionWorkerHeartbeat(worker.id, {
      currentPool: selectedPool,
      freeMemoryMb: resources.freeMemoryMb,
      cpuPercent: resources.cpuPercent,
    });
  } catch (error) {
    logError("execution_queue_tick_failed", error);
  } finally {
    tickRunning = false;
  }
}

export function wakeExecutionQueue() {
  setTimeout(() => void processExecutionQueueOnce(), 0).unref();
}

export function startExecutionQueueScheduler() {
  if (timer) return;
  wakeExecutionQueue();
  timer = setInterval(() => void processExecutionQueueOnce(), 5_000);
}

export function stopExecutionQueueScheduler() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
