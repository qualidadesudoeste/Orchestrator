import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  clients,
  executionWorkers,
  projects,
  sprints,
  testExecutions,
  testResults,
} from "../../drizzle/schema";
import type { NormalizedTestExecution } from "../testExecutionService";
import type { NormalizedExecutionProgress } from "../testExecutionProgressService";
import type { ExecutionQueuePool } from "../executionQueueTypes";
import { getDb } from "../database/client";

export async function createPendingTestExecution(data: {
  externalExecutionId: string;
  createdById: number;
  clientId?: number;
  projectId: number;
  sprintId: number;
  clientName?: string;
  projectName: string;
  sprintName: string;
  systemUrl: string;
  totalScenarios: number;
  queuePool: "PUBLIC" | "COGEL" | "SEFAZ" | "OUTRA";
  dispatchPayloadEncrypted: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(testExecutions).values({
    externalExecutionId: data.externalExecutionId,
    createdById: data.createdById,
    clientId: data.clientId ?? null,
    projectId: data.projectId,
    sprintId: data.sprintId,
    clientName: data.clientName ?? null,
    projectName: data.projectName,
    sprintName: data.sprintName,
    systemUrl: data.systemUrl,
    status: "EM_ANDAMENTO",
    executionState: "QUEUED",
    controlState: "RUN",
    queuePool: data.queuePool,
    dispatchPayloadEncrypted: data.dispatchPayloadEncrypted,
    dispatchAttempts: 0,
    queuedAt: new Date(),
    totalScenarios: data.totalScenarios,
    completedScenarios: 0,
    currentStage: "AGUARDANDO_FILA",
    progressMessage: "Preparando a execução automatizada.",
    liveProgressJson: "[]",
    lastHeartbeatAt: new Date(),
    startedAt: new Date(),
    rawPayload: JSON.stringify({ phase: "STARTED" }),
  });
}

export async function getPersistedScenarioGherkin(
  externalExecutionId: string,
  externalScenarioId: string,
): Promise<string | undefined> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select({ gherkin: testResults.gherkin })
    .from(testResults)
    .innerJoin(testExecutions, eq(testExecutions.id, testResults.executionId))
    .where(and(
      eq(testExecutions.externalExecutionId, externalExecutionId),
      eq(testResults.externalScenarioId, externalScenarioId),
    ))
    .limit(1);
  return rows[0]?.gherkin ?? undefined;
}

export async function markTestExecutionStartFailure(
  externalExecutionId: string,
  reason: string,
) {
  const db = await getDb();
  if (!db) return;
  await db.update(testExecutions).set({
    status: "ERRO_AUTOMACAO",
    executionState: "FAILED",
    automationErrors: 1,
    inconclusiveScenarios: 1,
    finishedAt: new Date(),
    currentStage: "FALHA_AO_INICIAR",
    progressMessage: reason.slice(0, 1000),
    lastHeartbeatAt: new Date(),
    rawPayload: JSON.stringify({ phase: "START_FAILED", reason: reason.slice(0, 1000) }),
    dispatchPayloadEncrypted: null,
    leaseExpiresAt: null,
  }).where(and(
    eq(testExecutions.externalExecutionId, externalExecutionId),
    inArray(testExecutions.executionState, ["QUEUED", "RUNNING", "PAUSED"]),
  ));
}

type LiveScenarioProgress = {
  scenarioIndex: number;
  scenarioId: string;
  scenarioTitle: string;
  environment: string;
  status: "EM_ANDAMENTO" | "PASSOU" | "FALHOU" | "BLOQUEADO" | "ERRO_AUTOMACAO";
  summary?: string;
  startedAt?: string;
  finishedAt?: string;
};

function parseLiveProgress(value: string | null): LiveScenarioProgress[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function updateTestExecutionProgress(progress: NormalizedExecutionProgress) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.transaction(async tx => {
    const rows = await tx.select().from(testExecutions)
      .where(eq(testExecutions.externalExecutionId, progress.externalExecutionId))
      .limit(1);
    const execution = rows[0];
    if (!execution) return null;
    if (execution.executionState === "CANCELLED" || execution.executionState === "FAILED") {
      return { executionId: execution.id, completedScenarios: execution.completedScenarios, progressPercent: execution.coveragePercent };
    }
    const live = parseLiveProgress(execution.liveProgressJson);
    const existingIndex = live.findIndex(item => item.scenarioId === progress.scenarioId);
    const previous = existingIndex >= 0 ? live[existingIndex] : undefined;
    const next: LiveScenarioProgress = {
      scenarioIndex: progress.scenarioIndex,
      scenarioId: progress.scenarioId,
      scenarioTitle: progress.scenarioTitle,
      environment: progress.environment,
      status: progress.event === "SCENARIO_COMPLETED" ? progress.status! : "EM_ANDAMENTO",
      summary: progress.summary ?? previous?.summary,
      startedAt: previous?.startedAt ?? progress.occurredAt.toISOString(),
      finishedAt: progress.event === "SCENARIO_COMPLETED" ? progress.occurredAt.toISOString() : previous?.finishedAt,
    };
    if (existingIndex >= 0) live[existingIndex] = next;
    else live.push(next);
    live.sort((left, right) => left.scenarioIndex - right.scenarioIndex);
    const completed = live.filter(item => item.status !== "EM_ANDAMENTO");
    const counts = {
      passed: completed.filter(item => item.status === "PASSOU").length,
      failed: completed.filter(item => item.status === "FALHOU").length,
      blocked: completed.filter(item => item.status === "BLOQUEADO").length,
      automation: completed.filter(item => item.status === "ERRO_AUTOMACAO").length,
    };
    const completedScenarios = completed.length;
    const progressPercent = execution.totalScenarios > 0
      ? Math.min(100, Math.round((completedScenarios / execution.totalScenarios) * 100))
      : 0;
    const isFinished =
      progress.event === "SCENARIO_COMPLETED" &&
      execution.totalScenarios > 0 &&
      completedScenarios >= execution.totalScenarios;
    const finalStatus = counts.failed > 0
      ? "FALHOU"
      : counts.blocked > 0
        ? "BLOQUEADO"
        : counts.automation > 0
          ? "ERRO_AUTOMACAO"
          : "PASSOU";
    await tx.update(testExecutions).set({
      executionState: isFinished ? "FINISHED" : "RUNNING",
      status: isFinished ? finalStatus : execution.status,
      currentScenarioIndex: progress.scenarioIndex,
      currentScenarioId: progress.scenarioId,
      currentScenarioTitle: progress.scenarioTitle,
      currentEnvironment: progress.environment || null,
      currentStage: isFinished ? "CONCLUIDO" : progress.stage,
      progressMessage: isFinished
        ? `Execução concluída: ${completedScenarios} de ${execution.totalScenarios} cenários processados.`
        : progress.event === "SCENARIO_STARTED"
          ? `Executando cenário ${progress.scenarioIndex} de ${execution.totalScenarios}: ${progress.scenarioTitle}`.slice(0, 1000)
          : `Cenário ${progress.scenarioIndex} concluído com status ${progress.status}.`.slice(0, 1000),
      completedScenarios,
      passedScenarios: counts.passed,
      failedScenarios: counts.failed,
      blockedScenarios: counts.blocked,
      automationErrors: counts.automation,
      coveragePercent: progressPercent,
      liveProgressJson: JSON.stringify(live),
      lastHeartbeatAt: progress.occurredAt,
      leaseExpiresAt: isFinished ? null : new Date(progress.occurredAt.getTime() + 2 * 60 * 60 * 1000),
      finishedAt: isFinished ? progress.occurredAt : execution.finishedAt,
      dispatchPayloadEncrypted: isFinished ? null : execution.dispatchPayloadEncrypted,
      assignedWorkerId: isFinished ? null : execution.assignedWorkerId,
    }).where(eq(testExecutions.id, execution.id));
    return { executionId: execution.id, completedScenarios, progressPercent };
  });
}

export async function markTestExecutionQueued(externalExecutionId: string, message: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(testExecutions).set({
    executionState: "QUEUED",
    controlState: "RUN",
    currentStage: "AGUARDANDO_FILA",
    progressMessage: message.slice(0, 1000),
    lastHeartbeatAt: new Date(),
  }).where(eq(testExecutions.externalExecutionId, externalExecutionId));
}

export type TestExecutionControlAction = "PAUSE" | "RESUME" | "CANCEL";

export async function controlTestExecution(input: {
  externalExecutionId: string;
  userId: number;
  isAdmin: boolean;
  action: TestExecutionControlAction;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.transaction(async tx => {
    const rows = await tx.select().from(testExecutions)
      .where(eq(testExecutions.externalExecutionId, input.externalExecutionId))
      .limit(1);
    const execution = rows[0];
    if (!execution) return { outcome: "NOT_FOUND" as const };
    if (!input.isAdmin && execution.createdById !== input.userId) {
      return { outcome: "FORBIDDEN" as const };
    }
    if (["FINISHED", "FAILED", "CANCELLED"].includes(execution.executionState)) {
      return { outcome: "TERMINAL" as const, executionState: execution.executionState };
    }

    const now = new Date();
    if (input.action === "PAUSE") {
      if (execution.executionState === "PAUSED" && execution.controlState === "PAUSE") {
        return { outcome: "UNCHANGED" as const, executionState: execution.executionState, controlState: execution.controlState };
      }
      const queued = execution.executionState === "QUEUED";
      await tx.update(testExecutions).set({
        executionState: queued ? "PAUSED" : execution.executionState,
        controlState: "PAUSE",
        controlRequestedAt: now,
        controlRequestedById: input.userId,
        currentStage: queued ? "PAUSADO" : "PAUSA_SOLICITADA",
        progressMessage: queued
          ? "Execução pausada antes da reserva de um worker."
          : "Pausa solicitada. O cenário atual será concluído antes da pausa.",
        lastHeartbeatAt: now,
      }).where(eq(testExecutions.id, execution.id));
      return { outcome: "UPDATED" as const, executionState: queued ? "PAUSED" as const : execution.executionState, controlState: "PAUSE" as const };
    }

    if (input.action === "RESUME") {
      const hasWorker = Boolean(execution.assignedWorkerId);
      const executionState = hasWorker ? "RUNNING" as const : "QUEUED" as const;
      await tx.update(testExecutions).set({
        executionState,
        controlState: "RUN",
        controlRequestedAt: now,
        controlRequestedById: input.userId,
        currentStage: hasWorker ? "RETOMANDO" : "AGUARDANDO_FILA",
        progressMessage: hasWorker
          ? "Retomada solicitada. O agente continuará no próximo cenário."
          : "Execução retomada e devolvida à fila.",
        leaseExpiresAt: hasWorker ? new Date(now.getTime() + 2 * 60 * 60 * 1000) : null,
        lastHeartbeatAt: now,
      }).where(eq(testExecutions.id, execution.id));
      return { outcome: "UPDATED" as const, executionState, controlState: "RUN" as const };
    }

    const agentMustStop = Boolean(execution.assignedWorkerId) && ["RUNNING", "PAUSED"].includes(execution.executionState);
    if (agentMustStop) {
      await tx.update(testExecutions).set({
        controlState: "CANCEL",
        controlRequestedAt: now,
        controlRequestedById: input.userId,
        currentStage: "ENCERRAMENTO_SOLICITADO",
        progressMessage: "Encerramento solicitado. O cenário atual será concluído e nenhum novo cenário será iniciado.",
        lastHeartbeatAt: now,
      }).where(eq(testExecutions.id, execution.id));
      return { outcome: "UPDATED" as const, executionState: execution.executionState, controlState: "CANCEL" as const };
    }

    await tx.update(testExecutions).set({
      status: "CANCELADO",
      executionState: "CANCELLED",
      controlState: "CANCEL",
      controlRequestedAt: now,
      controlRequestedById: input.userId,
      currentStage: "ENCERRADO",
      progressMessage: "Execução encerrada pelo usuário antes de iniciar um novo cenário.",
      finishedAt: now,
      lastHeartbeatAt: now,
      assignedWorkerId: null,
      dispatchPayloadEncrypted: null,
      leaseExpiresAt: null,
    }).where(eq(testExecutions.id, execution.id));
    return { outcome: "UPDATED" as const, executionState: "CANCELLED" as const, controlState: "CANCEL" as const };
  });
}

export async function getTestExecutionControlCheckpoint(externalExecutionId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.transaction(async tx => {
    const rows = await tx.select().from(testExecutions)
      .where(eq(testExecutions.externalExecutionId, externalExecutionId))
      .limit(1);
    const execution = rows[0];
    if (!execution) return null;
    const now = new Date();

    if (execution.executionState === "FINISHED") {
      return { action: "RUN" as const, executionState: "FINISHED" as const, pollingMs: 0 };
    }
    if (execution.executionState === "FAILED" || execution.executionState === "CANCELLED" || execution.controlState === "CANCEL") {
      if (execution.executionState !== "CANCELLED") {
        await tx.update(testExecutions).set({
          status: "CANCELADO",
          executionState: "CANCELLED",
          controlState: "CANCEL",
          currentStage: "ENCERRADO",
          progressMessage: "Execução encerrada pelo usuário após a conclusão do cenário atual.",
          finishedAt: now,
          lastHeartbeatAt: now,
          assignedWorkerId: null,
          dispatchPayloadEncrypted: null,
          leaseExpiresAt: null,
        }).where(eq(testExecutions.id, execution.id));
      }
      return { action: "CANCEL" as const, executionState: "CANCELLED" as const, pollingMs: 0 };
    }

    if (execution.controlState === "PAUSE") {
      await tx.update(testExecutions).set({
        executionState: "PAUSED",
        currentStage: "PAUSADO",
        progressMessage: "Execução pausada. Aguardando o comando para retomar ou encerrar.",
        lastHeartbeatAt: now,
        leaseExpiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      }).where(eq(testExecutions.id, execution.id));
      return { action: "PAUSE" as const, executionState: "PAUSED" as const, pollingMs: 5000 };
    }

    if (execution.executionState === "PAUSED") {
      const executionState = execution.assignedWorkerId ? "RUNNING" as const : "QUEUED" as const;
      await tx.update(testExecutions).set({
        executionState,
        currentStage: execution.assignedWorkerId ? "RETOMANDO" : "AGUARDANDO_FILA",
        progressMessage: execution.assignedWorkerId
          ? "Execução retomada. Preparando o próximo cenário."
          : "Execução retomada e aguardando um worker.",
        lastHeartbeatAt: now,
      }).where(eq(testExecutions.id, execution.id));
      return { action: "RUN" as const, executionState, pollingMs: 0 };
    }

    await tx.update(testExecutions).set({
      lastHeartbeatAt: now,
      leaseExpiresAt: execution.assignedWorkerId ? new Date(now.getTime() + 2 * 60 * 60 * 1000) : execution.leaseExpiresAt,
    }).where(eq(testExecutions.id, execution.id));
    return { action: "RUN" as const, executionState: execution.executionState, pollingMs: 0 };
  });
}

export async function ensureLocalExecutionWorker() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db.select().from(executionWorkers)
    .where(eq(executionWorkers.code, "LOCAL-01")).limit(1);
  if (existing[0]) return existing[0];
  await db.insert(executionWorkers).values({
    code: "LOCAL-01",
    name: "Worker local",
    mode: "LOCAL",
    status: "ONLINE",
    networkPool: "ANY",
    maxConcurrency: 1,
    minFreeMemoryMb: 1024,
    maxCpuPercent: 75,
    lastHeartbeatAt: new Date(),
  }).onDuplicateKeyUpdate({ set: { lastHeartbeatAt: new Date() } });
  const created = await db.select().from(executionWorkers)
    .where(eq(executionWorkers.code, "LOCAL-01")).limit(1);
  if (!created[0]) throw new Error("Nao foi possivel registrar o worker local.");
  return created[0];
}

export async function listExecutionWorkers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(executionWorkers).orderBy(executionWorkers.id);
}

export async function updateExecutionWorkerSettings(id: number, data: {
  name?: string;
  status?: "ONLINE" | "OFFLINE" | "PAUSED";
  networkPool?: "ANY" | ExecutionQueuePool;
  maxConcurrency?: number;
  minFreeMemoryMb?: number;
  maxCpuPercent?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(executionWorkers).set(data).where(eq(executionWorkers.id, id));
}

export async function updateExecutionWorkerHeartbeat(id: number, data: {
  currentPool: ExecutionQueuePool | null;
  freeMemoryMb: number;
  cpuPercent: number;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(executionWorkers).set({
    ...data,
    lastHeartbeatAt: new Date(),
  }).where(eq(executionWorkers.id, id));
}

export async function listActiveExecutionJobs(workerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(testExecutions).where(and(
    eq(testExecutions.assignedWorkerId, workerId),
    inArray(testExecutions.executionState, ["RUNNING", "PAUSED"]),
  )).orderBy(testExecutions.dispatchedAt);
}

export async function markQueuedExecutionsWaitingForResources(message: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(testExecutions).set({
    currentStage: "AGUARDANDO_RECURSOS",
    progressMessage: message.slice(0, 1000),
    lastHeartbeatAt: new Date(),
  }).where(and(
    eq(testExecutions.executionState, "QUEUED"),
    eq(testExecutions.controlState, "RUN"),
    isNull(testExecutions.assignedWorkerId),
  ));
}
export async function listQueuedExecutionJobs(limit = 25) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(testExecutions).where(and(
    eq(testExecutions.executionState, "QUEUED"),
    eq(testExecutions.controlState, "RUN"),
    isNull(testExecutions.assignedWorkerId),
  )).orderBy(testExecutions.queuedAt).limit(limit);
}

export async function claimExecutionJob(executionId: number, workerId: number) {
  const db = await getDb();
  if (!db) return false;
  const result = await db.update(testExecutions).set({
    assignedWorkerId: workerId,
    executionState: "RUNNING",
    dispatchedAt: new Date(),
    leaseExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    currentStage: "PREPARANDO_WORKER",
    progressMessage: "Worker reservado. Preparando rede e automacao.",
    lastHeartbeatAt: new Date(),
    dispatchAttempts: sql`${testExecutions.dispatchAttempts} + 1`,
  }).where(and(
    eq(testExecutions.id, executionId),
    eq(testExecutions.executionState, "QUEUED"),
    eq(testExecutions.controlState, "RUN"),
    isNull(testExecutions.assignedWorkerId),
  ));
  const metadata = Array.isArray(result) ? result[0] : result;
  return Number((metadata as { affectedRows?: number } | undefined)?.affectedRows ?? 0) > 0;
}

export async function markExecutionJobDispatched(externalExecutionId: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(testExecutions).set({
    executionState: "RUNNING",
    currentStage: "AGUARDANDO_PRIMEIRO_CENARIO",
    progressMessage: "Execucao aceita pelo agente. Aguardando o primeiro cenario.",
    lastHeartbeatAt: new Date(),
  }).where(and(
    eq(testExecutions.externalExecutionId, externalExecutionId),
    eq(testExecutions.controlState, "RUN"),
  ));
}

export async function returnExecutionJobToQueue(
  externalExecutionId: string,
  message: string,
  dispatchPayloadEncrypted?: string | null,
) {
  const db = await getDb();
  if (!db) return;
  await db.update(testExecutions).set({
    executionState: "QUEUED",
    assignedWorkerId: null,
    dispatchedAt: null,
    leaseExpiresAt: null,
    currentStage: "AGUARDANDO_FILA",
    progressMessage: message.slice(0, 1000),
    lastHeartbeatAt: new Date(),
    ...(dispatchPayloadEncrypted ? { dispatchPayloadEncrypted } : {}),
  }).where(and(
    eq(testExecutions.externalExecutionId, externalExecutionId),
    eq(testExecutions.controlState, "RUN"),
  ));
}

export async function pauseExecutionForManualVpn(
  externalExecutionId: string,
  message: string,
  dispatchPayloadEncrypted?: string | null,
) {
  const db = await getDb();
  if (!db) return;
  await db.update(testExecutions).set({
    status: "EM_ANDAMENTO",
    executionState: "PAUSED",
    controlState: "PAUSE",
    controlRequestedAt: new Date(),
    assignedWorkerId: null,
    dispatchedAt: null,
    leaseExpiresAt: null,
    currentStage: "AGUARDANDO_VPN",
    progressMessage: message.slice(0, 1000),
    lastHeartbeatAt: new Date(),
    rawPayload: JSON.stringify({ phase: "WAITING_FOR_VPN", reason: message.slice(0, 1000) }),
    ...(dispatchPayloadEncrypted ? { dispatchPayloadEncrypted } : {}),
  }).where(and(
    eq(testExecutions.externalExecutionId, externalExecutionId),
    eq(testExecutions.executionState, "RUNNING"),
  ));
}

export async function failExpiredExecutionJobs() {
  const db = await getDb();
  if (!db) return 0;
  const expired = await db.select({ externalExecutionId: testExecutions.externalExecutionId })
    .from(testExecutions)
    .where(and(
      eq(testExecutions.executionState, "RUNNING"),
      lt(testExecutions.leaseExpiresAt, new Date()),
    ));
  for (const job of expired) {
    await markTestExecutionStartFailure(
      job.externalExecutionId,
      "O worker deixou de enviar atualizacoes por mais de duas horas. A execucao foi encerrada como falha de infraestrutura.",
    );
  }
  return expired.length;
}
export async function getExecutionQueueOverview() {
  const db = await getDb();
  if (!db) return { queued: 0, running: 0, workers: [] as Awaited<ReturnType<typeof listExecutionWorkers>> };
  const [workers, rows] = await Promise.all([
    listExecutionWorkers(),
    db.select({ state: testExecutions.executionState, pool: testExecutions.queuePool })
      .from(testExecutions)
      .where(or(eq(testExecutions.executionState, "QUEUED"), eq(testExecutions.executionState, "RUNNING"))),
  ]);
  return {
    queued: rows.filter(item => item.state === "QUEUED").length,
    running: rows.filter(item => item.state === "RUNNING").length,
    byPool: (["PUBLIC", "COGEL", "SEFAZ", "OUTRA"] as const).map(pool => ({
      pool,
      queued: rows.filter(item => item.pool === pool && item.state === "QUEUED").length,
      running: rows.filter(item => item.pool === pool && item.state === "RUNNING").length,
    })),
    workers,
  };
}
export async function getTestExecutionProgress(input: {
  externalExecutionId: string;
  userId: number;
  isAdmin: boolean;
}) {
  const db = await getDb();
  if (!db) return null;
  const conditions = [eq(testExecutions.externalExecutionId, input.externalExecutionId)];
  if (!input.isAdmin) conditions.push(eq(testExecutions.createdById, input.userId));
  const rows = await db.select().from(testExecutions).where(and(...conditions)).limit(1);
  const execution = rows[0];
  if (!execution) return null;
  let scenarios = parseLiveProgress(execution.liveProgressJson);
  if (execution.executionState === "FINISHED" && scenarios.length === 0) {
    const persisted = await db.select().from(testResults)
      .where(eq(testResults.executionId, execution.id))
      .orderBy(testResults.id);
    scenarios = persisted.map((item, index) => ({
      scenarioIndex: index + 1,
      scenarioId: item.externalScenarioId,
      scenarioTitle: item.title,
      environment: "",
      status: item.status,
      summary: item.summary ?? undefined,
      finishedAt: item.executedAt?.toISOString(),
    }));
  }
  return {
    executionId: execution.externalExecutionId,
    executionState: execution.executionState,
    controlState: execution.controlState,
    controlRequestedAt: execution.controlRequestedAt,
    finalStatus: execution.status,
    totalScenarios: execution.totalScenarios,
    completedScenarios: execution.completedScenarios,
    progressPercent: execution.totalScenarios > 0
      ? Math.min(100, Math.round((execution.completedScenarios / execution.totalScenarios) * 100))
      : 0,
    currentScenarioIndex: execution.currentScenarioIndex,
    currentScenarioId: execution.currentScenarioId,
    currentScenarioTitle: execution.currentScenarioTitle,
    currentEnvironment: execution.currentEnvironment,
    currentStage: execution.currentStage,
    progressMessage: execution.progressMessage,
    scenarios,
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt,
    lastHeartbeatAt: execution.lastHeartbeatAt,
  };
}

export async function upsertTestExecution(
  data: NormalizedTestExecution,
): Promise<{ id: number; created: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  let clientId = data.clientId;
  let projectId = data.projectId;
  let sprintId = data.sprintId;
  let clientName = data.clientName;

  if (!projectId) {
    const projectRows = await db
      .select()
      .from(projects)
      .where(eq(projects.name, data.projectName))
      .limit(1);
    const project = projectRows[0];
    if (project) {
      projectId = project.id;
      clientId = clientId ?? project.clientId;
    }
  }
  if (!clientName && clientId) {
    const clientRows = await db
      .select()
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    clientName = clientRows[0]?.name;
  }
  if (!sprintId && data.sprintName) {
    const sprintCondition = projectId
      ? and(
          eq(sprints.name, data.sprintName),
          eq(sprints.projectId, projectId),
        )
      : eq(sprints.name, data.sprintName);
    const sprintRows = await db
      .select()
      .from(sprints)
      .where(sprintCondition)
      .limit(1);
    sprintId = sprintRows[0]?.id;
  }

  const existingRows = await db
    .select({ id: testExecutions.id })
    .from(testExecutions)
    .where(eq(testExecutions.externalExecutionId, data.externalExecutionId))
    .limit(1);
  const existingId = existingRows[0]?.id;

  return db.transaction(async tx => {
    const executionValues = {
      externalExecutionId: data.externalExecutionId,
      createdById: data.createdById,
      clientId: clientId ?? null,
      projectId: projectId ?? null,
      sprintId: sprintId ?? null,
      clientName: clientName ?? null,
      projectName: data.projectName,
      sprintName: data.sprintName ?? null,
      systemUrl: data.systemUrl ?? null,
      status: data.status,
      executionState: "FINISHED" as const,
      totalScenarios: data.totalScenarios,
      completedScenarios: data.totalScenarios,
      currentStage: "CONCLUIDO",
      progressMessage: `Execução concluída com status ${data.status}.`,
      lastHeartbeatAt: data.finishedAt ?? new Date(),
      passedScenarios: data.passedScenarios,
      failedScenarios: data.failedScenarios,
      blockedScenarios: data.blockedScenarios,
      automationErrors: data.automationErrors,
      flakyScenarios: data.flakyScenarios,
      inconclusiveScenarios: data.inconclusiveScenarios,
      coveragePercent: data.coveragePercent,
      defectsFound: data.defectsFound,
      criticalDefects: data.criticalDefects,
      escapedDefects: data.escapedDefects,
      evidenceDocxUrl: data.evidenceDocxUrl ?? null,
      reliabilityReportUrl: data.reliabilityReportUrl ?? null,
      regressionBundleId: data.regressionBundleId ?? null,
      startedAt: data.startedAt ?? null,
      finishedAt: data.finishedAt ?? null,
      rawPayload: data.rawPayload,
      assignedWorkerId: null,
      dispatchPayloadEncrypted: null,
      leaseExpiresAt: null,
    };

    let executionId = existingId;
    if (executionId) {
      await tx
        .update(testExecutions)
        .set(executionValues)
        .where(eq(testExecutions.id, executionId));
      await tx
        .delete(testResults)
        .where(eq(testResults.executionId, executionId));
    } else {
      const [insertResult] = await tx
        .insert(testExecutions)
        .values(executionValues);
      executionId = (insertResult as any).insertId as number;
    }

    if (data.results.length > 0) {
      await tx.insert(testResults).values(
        data.results.map(result => ({
          executionId,
          externalScenarioId: result.externalScenarioId,
          title: result.title,
          moduleName: result.moduleName ?? null,
          gherkin: result.gherkin ?? null,
          status: result.status,
          risk: result.risk,
          summary: result.summary ?? null,
          realDefects: result.realDefects,
          automationFailures: result.automationFailures,
          durationMs: result.durationMs ?? null,
          evidenceJson: result.evidenceJson,
          failuresJson: result.failuresJson,
          reliabilityStatus: result.reliabilityStatus,
          attempts: result.attempts,
          passedAttempts: result.passedAttempts,
          failedAttempts: result.failedAttempts,
          automationErrorAttempts: result.automationErrorAttempts,
          attemptsJson: result.attemptsJson,
          regressionCodeUrl: result.regressionCodeUrl ?? null,
          executedAt: result.executedAt ?? null,
        })),
      );
    }

    return { id: executionId, created: !existingId };
  });
}
