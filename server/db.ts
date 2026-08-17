import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  Checklist,
  InsertQAAgentMemory,
  InsertDefectCard,
  QAPlanDocument,
  Sprint,
  checklists,
  clients,
  aiProviderSettings,
  defectCardHistory,
  defectCards,
  executionWorkers,
  nonFunctionalFindings,
  nonFunctionalRuns,
  projects,
  projectMembers,
  projectQaProvisioning,
  projectTestEnvironments,
  vpnProfiles,
  qaAgentMemories,
  qaPlanDocuments,
  qaTestPlans,
  sprints,
  testExecutions,
  testResults,
  users,
} from "../drizzle/schema";
import type { AgentMemoryLearning } from "./agentMemoryService";
import type { NormalizedDefectCard } from "./defectCardService";
import {
  assertDefectCardTransition,
  type DefectCardStatus,
} from "./defectCardLifecycleService";
import type { NormalizedNonFunctionalRun } from "./nonFunctionalService";
import type { NormalizedTestExecution } from "./testExecutionService";
import type { NormalizedExecutionProgress } from "./testExecutionProgressService";
import type { ExecutionQueuePool } from "./executionQueueTypes";
import { getDb } from "./database/client";
export { checkDatabaseHealth, getDb } from "./database/client";
export * from "./repositories/userRepository";

export async function listTestExecutionHistory(filters: {
  userId: number;
  isAdmin: boolean;
  clientId?: number;
  projectId?: number;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (!filters.isAdmin) {
    conditions.push(eq(testExecutions.createdById, filters.userId));
  }
  if (filters.clientId) {
    conditions.push(eq(testExecutions.clientId, filters.clientId));
  }
  if (filters.projectId) {
    conditions.push(eq(testExecutions.projectId, filters.projectId));
  }
  if (filters.dateFrom) {
    conditions.push(
      sql`COALESCE(${testExecutions.finishedAt}, ${testExecutions.createdAt}) >= ${filters.dateFrom}`,
    );
  }
  if (filters.dateTo) {
    conditions.push(
      sql`COALESCE(${testExecutions.finishedAt}, ${testExecutions.createdAt}) <= ${filters.dateTo}`,
    );
  }

  const baseQuery = db
    .select({
      id: testExecutions.id,
      externalExecutionId: testExecutions.externalExecutionId,
      createdById: testExecutions.createdById,
      createdByName: users.name,
      createdByUsername: users.username,
      clientId: testExecutions.clientId,
      projectId: testExecutions.projectId,
      clientName: testExecutions.clientName,
      projectName: testExecutions.projectName,
      sprintName: testExecutions.sprintName,
      systemUrl: testExecutions.systemUrl,
      status: testExecutions.status,
      totalScenarios: testExecutions.totalScenarios,
      passedScenarios: testExecutions.passedScenarios,
      failedScenarios: testExecutions.failedScenarios,
      blockedScenarios: testExecutions.blockedScenarios,
      automationErrors: testExecutions.automationErrors,
      flakyScenarios: testExecutions.flakyScenarios,
      coveragePercent: testExecutions.coveragePercent,
      defectsFound: testExecutions.defectsFound,
      evidenceDocxUrl: testExecutions.evidenceDocxUrl,
      reliabilityReportUrl: testExecutions.reliabilityReportUrl,
      startedAt: testExecutions.startedAt,
      finishedAt: testExecutions.finishedAt,
      createdAt: testExecutions.createdAt,
    })
    .from(testExecutions)
    .leftJoin(users, eq(users.id, testExecutions.createdById));

  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 200);
  return conditions.length > 0
    ? baseQuery
        .where(and(...conditions))
        .orderBy(desc(testExecutions.finishedAt), desc(testExecutions.createdAt))
        .limit(limit)
    : baseQuery
        .orderBy(desc(testExecutions.finishedAt), desc(testExecutions.createdAt))
        .limit(limit);
}

export async function listExecutionQueue(filters: {
  userId: number;
  isAdmin: boolean;
  state?: "ALL" | "QUEUED" | "RUNNING" | "PAUSED" | "FINISHED" | "FAILED" | "CANCELLED";
  pool?: "PUBLIC" | "COGEL" | "SEFAZ" | "OUTRA";
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return { items: [], summary: { queued: 0, running: 0, paused: 0, finished: 0, failed: 0, cancelled: 0 } };

  const visibility = [];
  if (filters.pool) visibility.push(eq(testExecutions.queuePool, filters.pool));
  if (filters.state && filters.state !== "ALL") {
    visibility.push(eq(testExecutions.executionState, filters.state));
  }

  const queueOrder = await db.select({ id: testExecutions.id })
    .from(testExecutions)
    .where(eq(testExecutions.executionState, "QUEUED"))
    .orderBy(asc(testExecutions.queuedAt), asc(testExecutions.id));
  const queuePositions = new Map(queueOrder.map((item, index) => [item.id, index + 1]));

  const query = db.select({
    id: testExecutions.id,
    externalExecutionId: testExecutions.externalExecutionId,
    createdById: testExecutions.createdById,
    createdByName: users.name,
    createdByUsername: users.username,
    clientName: testExecutions.clientName,
    projectName: testExecutions.projectName,
    sprintName: testExecutions.sprintName,
    systemUrl: testExecutions.systemUrl,
    status: testExecutions.status,
    executionState: testExecutions.executionState,
    controlState: testExecutions.controlState,
    controlRequestedAt: testExecutions.controlRequestedAt,
    controlRequestedById: testExecutions.controlRequestedById,
    queuePool: testExecutions.queuePool,
    totalScenarios: testExecutions.totalScenarios,
    completedScenarios: testExecutions.completedScenarios,
    currentScenarioIndex: testExecutions.currentScenarioIndex,
    currentScenarioTitle: testExecutions.currentScenarioTitle,
    currentEnvironment: testExecutions.currentEnvironment,
    currentStage: testExecutions.currentStage,
    progressMessage: testExecutions.progressMessage,
    dispatchAttempts: testExecutions.dispatchAttempts,
    queuedAt: testExecutions.queuedAt,
    dispatchedAt: testExecutions.dispatchedAt,
    startedAt: testExecutions.startedAt,
    finishedAt: testExecutions.finishedAt,
    lastHeartbeatAt: testExecutions.lastHeartbeatAt,
    workerCode: executionWorkers.code,
    workerName: executionWorkers.name,
  }).from(testExecutions)
    .leftJoin(users, eq(users.id, testExecutions.createdById))
    .leftJoin(executionWorkers, eq(executionWorkers.id, testExecutions.assignedWorkerId));

  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 200);
  const rows = visibility.length
    ? await query.where(and(...visibility)).orderBy(
        sql`CASE ${testExecutions.executionState} WHEN 'RUNNING' THEN 1 WHEN 'PAUSED' THEN 2 WHEN 'QUEUED' THEN 3 WHEN 'FAILED' THEN 4 WHEN 'CANCELLED' THEN 5 ELSE 6 END`,
        sql`CASE WHEN ${testExecutions.executionState} IN ('RUNNING', 'PAUSED', 'QUEUED') THEN ${testExecutions.queuedAt} END ASC`,
        sql`CASE WHEN ${testExecutions.executionState} IN ('FINISHED', 'FAILED', 'CANCELLED') THEN COALESCE(${testExecutions.finishedAt}, ${testExecutions.updatedAt}) END DESC`,
      ).limit(limit)
    : await query.orderBy(
        sql`CASE ${testExecutions.executionState} WHEN 'RUNNING' THEN 1 WHEN 'PAUSED' THEN 2 WHEN 'QUEUED' THEN 3 WHEN 'FAILED' THEN 4 WHEN 'CANCELLED' THEN 5 ELSE 6 END`,
        sql`CASE WHEN ${testExecutions.executionState} IN ('RUNNING', 'PAUSED', 'QUEUED') THEN ${testExecutions.queuedAt} END ASC`,
        sql`CASE WHEN ${testExecutions.executionState} IN ('FINISHED', 'FAILED', 'CANCELLED') THEN COALESCE(${testExecutions.finishedAt}, ${testExecutions.updatedAt}) END DESC`,
      ).limit(limit);

  const items = rows.map(item => ({
    ...item,
    queuePosition: item.executionState === "QUEUED" ? queuePositions.get(item.id) ?? null : null,
    progressPercent: item.totalScenarios > 0
      ? Math.min(100, Math.round((item.completedScenarios / item.totalScenarios) * 100))
      : 0,
  }));
  return {
    items,
    summary: {
      queued: items.filter(item => item.executionState === "QUEUED").length,
      running: items.filter(item => item.executionState === "RUNNING").length,
      paused: items.filter(item => item.executionState === "PAUSED").length,
      finished: items.filter(item => item.executionState === "FINISHED").length,
      failed: items.filter(item => item.executionState === "FAILED").length,
      cancelled: items.filter(item => item.executionState === "CANCELLED").length,
    },
  };
}
// ─── Clients ─────────────────────────────────────────────────────────────────
export async function getClients() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clients).orderBy(desc(clients.createdAt));
}

export async function createClient(data: { name: string; description?: string; createdById: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(clients).values(data);
}

export async function updateClient(id: number, data: { name?: string; description?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(clients).set(data).where(eq(clients.id, id));
}

export async function deleteClient(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(clients).where(eq(clients.id, id));
}

// ─── Projects ────────────────────────────────────────────────────────────────
export async function getProjects(clientId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (clientId) return db.select().from(projects).where(eq(projects.clientId, clientId)).orderBy(desc(projects.createdAt));
  return db.select().from(projects).orderBy(desc(projects.createdAt));
}

export async function getProjectAccess(projectId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const projectRows = await db.select({ createdById: projects.createdById })
    .from(projects).where(eq(projects.id, projectId)).limit(1);
  if (projectRows[0]?.createdById === userId) return { role: "EXECUTOR" as const, owner: true };
  const rows = await db.select({ role: projectMembers.role }).from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).limit(1);
  return rows[0] ? { role: rows[0].role, owner: false } : null;
}

export async function listProjectMembers(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: projectMembers.id,
    projectId: projectMembers.projectId,
    userId: projectMembers.userId,
    role: projectMembers.role,
    name: users.name,
    username: users.username,
  }).from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(users.name));
}

export async function replaceProjectMembers(input: {
  projectId: number;
  createdById: number;
  members: Array<{ userId: number; role: "VIEWER" | "EXECUTOR" }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.transaction(async tx => {
    await tx.delete(projectMembers).where(eq(projectMembers.projectId, input.projectId));
    if (input.members.length) {
      await tx.insert(projectMembers).values(input.members.map(member => ({
        projectId: input.projectId,
        userId: member.userId,
        role: member.role,
        createdById: input.createdById,
      })));
    }
  });
}

export async function createProject(data: { name: string; description?: string; clientId: number; createdById: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(projects).values(data);
}

export async function updateProject(id: number, data: {
  name?: string;
  description?: string;
  repositoryUrl?: string | null;
  repositoryBranch?: string | null;
  sourceCodePath?: string | null;
  sourceCodeSummary?: string | null;
  sourceCodeFileCount?: number | null;
  sourceCodeIndexedAt?: Date | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(projects).set(data).where(eq(projects.id, id));
}

export async function getProjectQaProvisioning(projectId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(projectQaProvisioning)
    .where(eq(projectQaProvisioning.projectId, projectId)).limit(1);
  return rows[0];
}

export async function upsertProjectQaProvisioning(data: typeof projectQaProvisioning.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(projectQaProvisioning).values(data).onDuplicateKeyUpdate({ set: {
    endpointUrl: data.endpointUrl,
    tokenEncrypted: data.tokenEncrypted,
    isActive: data.isActive,
  } });
}

export async function deleteProject(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.transaction(async tx => {
    await tx.delete(projectTestEnvironments).where(eq(projectTestEnvironments.projectId, id));
    await tx.delete(projectQaProvisioning).where(eq(projectQaProvisioning.projectId, id));
    await tx.delete(projects).where(eq(projects.id, id));
  });
}

export async function listProjectTestEnvironments(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: projectTestEnvironments.id,
    projectId: projectTestEnvironments.projectId,
    name: projectTestEnvironments.name,
    type: projectTestEnvironments.type,
    loginUrl: projectTestEnvironments.loginUrl,
    username: projectTestEnvironments.username,
    vpnProfileId: projectTestEnvironments.vpnProfileId,
    vpnProvider: projectTestEnvironments.vpnProvider,
    vpnProfileName: projectTestEnvironments.vpnProfileName,
    vpnUsername: projectTestEnvironments.vpnUsername,
    vpnAutoConnect: projectTestEnvironments.vpnAutoConnect,
    vpnConnectionStrategy: projectTestEnvironments.vpnConnectionStrategy,
    vpnConfigFileName: projectTestEnvironments.vpnConfigFileName,
    hasVpnConfig: sql<number>`${projectTestEnvironments.vpnConfigEncrypted} is not null`,
    vpnConfigImportedAt: projectTestEnvironments.vpnConfigImportedAt,
    vpnInstallerUrl: projectTestEnvironments.vpnInstallerUrl,
    vpnInstallerSha256: projectTestEnvironments.vpnInstallerSha256,
    vpnVerificationUrl: projectTestEnvironments.vpnVerificationUrl,
    isActive: projectTestEnvironments.isActive,
    createdAt: projectTestEnvironments.createdAt,
    updatedAt: projectTestEnvironments.updatedAt,
  }).from(projectTestEnvironments)
    .where(eq(projectTestEnvironments.projectId, projectId))
    .orderBy(projectTestEnvironments.name);
}

export async function getProjectTestEnvironment(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(projectTestEnvironments)
    .where(eq(projectTestEnvironments.id, id)).limit(1);
  return rows[0];
}

export async function createProjectTestEnvironment(data: typeof projectTestEnvironments.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(projectTestEnvironments).values(data);
  return Number((result as any).insertId);
}

export async function updateProjectTestEnvironment(
  id: number,
  data: Partial<Pick<typeof projectTestEnvironments.$inferInsert,
    "name" | "type" | "loginUrl" | "username" | "passwordEncrypted" | "vpnProfileId" |
    "vpnProvider" | "vpnProfileName" | "vpnUsername" | "vpnPasswordEncrypted" |
    "vpnAutoConnect" | "vpnConnectionStrategy" | "vpnConfigFileName" |
    "vpnConfigEncrypted" | "vpnConfigPasswordEncrypted" | "vpnConfigImportedAt" |
    "vpnInstallerUrl" | "vpnInstallerSha256" | "vpnVerificationUrl" | "isActive">>,
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(projectTestEnvironments).set(data).where(eq(projectTestEnvironments.id, id));
}

export async function deleteProjectTestEnvironment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(projectTestEnvironments).where(eq(projectTestEnvironments.id, id));
}

// ─── Sprints ─────────────────────────────────────────────────────────────────
// â”€â”€â”€ ParÃ¢metros globais â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function listVpnProfiles() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: vpnProfiles.id,
    name: vpnProfiles.name,
    provider: vpnProfiles.provider,
    profileName: vpnProfiles.profileName,
    username: vpnProfiles.username,
    autoConnect: vpnProfiles.autoConnect,
    connectionStrategy: vpnProfiles.connectionStrategy,
    configFileName: vpnProfiles.configFileName,
    hasPassword: sql<number>`${vpnProfiles.passwordEncrypted} is not null`,
    hasConfig: sql<number>`${vpnProfiles.configEncrypted} is not null`,
    hasConfigPassword: sql<number>`${vpnProfiles.configPasswordEncrypted} is not null`,
    configImportedAt: vpnProfiles.configImportedAt,
    installerUrl: vpnProfiles.installerUrl,
    installerSha256: vpnProfiles.installerSha256,
    verificationUrl: vpnProfiles.verificationUrl,
    isActive: vpnProfiles.isActive,
    createdAt: vpnProfiles.createdAt,
    updatedAt: vpnProfiles.updatedAt,
  }).from(vpnProfiles).orderBy(vpnProfiles.name);
}

export async function getVpnProfile(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(vpnProfiles).where(eq(vpnProfiles.id, id)).limit(1);
  return rows[0];
}

export async function createVpnProfile(data: typeof vpnProfiles.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(vpnProfiles).values(data);
  return Number((result as any).insertId);
}

export async function updateVpnProfile(id: number, data: Partial<typeof vpnProfiles.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(vpnProfiles).set(data).where(eq(vpnProfiles.id, id));
}

export async function deleteVpnProfile(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(projectTestEnvironments).where(eq(projectTestEnvironments.vpnProfileId, id));
  if (Number(count) > 0) throw new Error("Esta VPN estÃ¡ associada a um ou mais ambientes e nÃ£o pode ser excluÃ­da.");
  await db.delete(vpnProfiles).where(eq(vpnProfiles.id, id));
}

export async function listAiProviderSettings() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: aiProviderSettings.id,
    name: aiProviderSettings.name,
    provider: aiProviderSettings.provider,
    apiUrl: aiProviderSettings.apiUrl,
    model: aiProviderSettings.model,
    hasApiKey: sql<number>`${aiProviderSettings.apiKeyEncrypted} is not null`,
    isActive: aiProviderSettings.isActive,
    createdAt: aiProviderSettings.createdAt,
    updatedAt: aiProviderSettings.updatedAt,
  }).from(aiProviderSettings).orderBy(desc(aiProviderSettings.isActive), aiProviderSettings.name);
}

export async function getAiProviderSetting(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(aiProviderSettings).where(eq(aiProviderSettings.id, id)).limit(1);
  return rows[0];
}

export async function getActiveAiProviderSetting() {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(aiProviderSettings).where(eq(aiProviderSettings.isActive, 1)).orderBy(desc(aiProviderSettings.updatedAt)).limit(1);
  return rows[0];
}

export async function createAiProviderSetting(data: typeof aiProviderSettings.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.transaction(async tx => {
    if (data.isActive) await tx.update(aiProviderSettings).set({ isActive: 0 });
    const [result] = await tx.insert(aiProviderSettings).values(data);
    return Number((result as any).insertId);
  });
}

export async function updateAiProviderSetting(id: number, data: Partial<typeof aiProviderSettings.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.transaction(async tx => {
    if (data.isActive) await tx.update(aiProviderSettings).set({ isActive: 0 });
    await tx.update(aiProviderSettings).set(data).where(eq(aiProviderSettings.id, id));
  });
}

export async function deleteAiProviderSetting(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(aiProviderSettings).where(eq(aiProviderSettings.id, id));
}
export async function getSprints(projectId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (projectId) return db.select().from(sprints).where(eq(sprints.projectId, projectId)).orderBy(desc(sprints.createdAt));
  return db.select().from(sprints).orderBy(desc(sprints.createdAt));
}

export async function createSprint(data: { name: string; description?: string; projectId: number; createdById: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(sprints).values(data);
}

export async function updateSprint(id: number, data: { name?: string; description?: string; status?: Sprint["status"] }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(sprints).set(data).where(eq(sprints.id, id));
}

export async function deleteSprint(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(sprints).where(eq(sprints.id, id));
}

// ─── Checklists ───────────────────────────────────────────────────────────────
export async function getChecklist(sprintId: number, analystId: number): Promise<Checklist | undefined> {
  const db = await getDb();
  if (!db) return null as any;
  const result = await db.select().from(checklists).where(and(eq(checklists.sprintId, sprintId), eq(checklists.analystId, analystId))).limit(1);
  return result[0] ?? null as any;
}

export async function getChecklistById(id: number): Promise<Checklist | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(checklists).where(eq(checklists.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getChecklistsByAnalyst(analystId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(checklists).where(or(eq(checklists.responsibleUserId, analystId), and(isNull(checklists.responsibleUserId), eq(checklists.analystId, analystId)))).orderBy(desc(checklists.startedAt));
}

export async function getAllChecklists() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(checklists).orderBy(desc(checklists.startedAt));
}

/** Retorna o progresso mais recente de cada sprint para o analista atual */
export async function getProgressBySprints(analystId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(checklists).where(or(eq(checklists.responsibleUserId, analystId), and(isNull(checklists.responsibleUserId), eq(checklists.analystId, analystId))));
  const map = new Map<number, { sprintId: number; completedItems: number; totalItems: number; status: string; startedAt: Date }>();
  for (const row of rows) {
    const existing = map.get(row.sprintId);
    if (!existing || row.startedAt > existing.startedAt) {
      map.set(row.sprintId, { sprintId: row.sprintId, completedItems: row.completedItems, totalItems: row.totalItems, status: row.status, startedAt: row.startedAt });
    }
  }
  return Array.from(map.values()).map(({ startedAt: _, ...rest }) => rest);
}

export async function upsertChecklist(data: {
  sprintId: number;
  analystId: number;
  responsibleUserId: number;
  checkedItems: string;
  totalItems: number;
  completedItems: number;
  status: Checklist["status"];
  completedAt?: Date | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await getChecklist(data.sprintId, data.analystId);
  if (existing) {
    await db.update(checklists).set({
      responsibleUserId: data.responsibleUserId,
      checkedItems: data.checkedItems,
      totalItems: data.totalItems,
      completedItems: data.completedItems,
      status: data.status,
      completedAt: data.completedAt ?? undefined,
    }).where(eq(checklists.id, existing.id));
  return existing.id;
  } else {
    await db.insert(checklists).values({
      sprintId: data.sprintId,
      analystId: data.analystId,
      responsibleUserId: data.responsibleUserId,
      checkedItems: data.checkedItems,
      totalItems: data.totalItems,
      completedItems: data.completedItems,
      status: data.status,
      completedAt: data.completedAt ?? undefined,
    });
    const created = await getChecklist(data.sprintId, data.analystId);
    return created?.id;
  }
}

export async function updateChecklistResponsible(id: number, responsibleUserId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(checklists).set({ responsibleUserId }).where(eq(checklists.id, id));
}

// ─── QA Plan Documents ────────────────────────────────────────────────────────
export async function insertQAPlanDocument(data: {
  createdById: number;
  projectName: string;
  clientName?: string;
  sprintName?: string;
  version?: string;
  redator?: string;
  baseName: string;
  texStorageKey?: string;
  texUrl?: string;
  pdfStorageKey?: string;
  pdfUrl?: string;
  pdfError?: string;
  projectJson?: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(qaPlanDocuments).values(data);
  return (result as any).insertId;
}

export async function listQAPlanDocuments(userId: number, isAdmin: boolean): Promise<QAPlanDocument[]> {
  const db = await getDb();
  if (!db) return [];
  if (isAdmin) {
    return db.select().from(qaPlanDocuments).orderBy(desc(qaPlanDocuments.createdAt)).limit(100);
  }
  return db.select().from(qaPlanDocuments)
    .where(eq(qaPlanDocuments.createdById, userId))
    .orderBy(desc(qaPlanDocuments.createdAt))
    .limit(100);
}

export async function getQAPlanDocument(id: number): Promise<QAPlanDocument | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(qaPlanDocuments).where(eq(qaPlanDocuments.id, id)).limit(1);
  return result[0] ?? null;
}

export async function deleteQAPlanDocument(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(qaPlanDocuments).where(eq(qaPlanDocuments.id, id));
}

export async function insertQATestPlan(data: typeof qaTestPlans.$inferInsert): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(qaTestPlans).values(data);
  return Number((result as any).insertId);
}

export async function listQATestPlans(input: {
  projectId?: number;
  sprintId?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const filters = [];
  if (input.projectId) filters.push(eq(qaTestPlans.projectId, input.projectId));
  if (input.sprintId) filters.push(eq(qaTestPlans.sprintId, input.sprintId));
  return db.select().from(qaTestPlans)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(qaTestPlans.createdAt))
    .limit(100);
}

export async function getQATestPlan(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(qaTestPlans).where(eq(qaTestPlans.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateQATestPlanResponsible(id: number, responsibleUserId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(qaTestPlans)
    .set({ responsibleUserId })
    .where(eq(qaTestPlans.id, id));
}

export async function deleteQATestPlan(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(qaTestPlans).where(eq(qaTestPlans.id, id));
}

// ─── Execuções e resultados de QA ───────────────────────────────────────────
export * from "./repositories/testExecutionRepository";

export async function upsertNonFunctionalRun(
  data: NormalizedNonFunctionalRun,
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
    .select({ id: nonFunctionalRuns.id })
    .from(nonFunctionalRuns)
    .where(eq(nonFunctionalRuns.externalRunId, data.externalRunId))
    .limit(1);
  const existingId = existingRows[0]?.id;

  return db.transaction(async tx => {
    const values = {
      externalRunId: data.externalRunId,
      clientId: clientId ?? null,
      projectId: projectId ?? null,
      sprintId: sprintId ?? null,
      clientName: clientName ?? null,
      projectName: data.projectName,
      sprintName: data.sprintName ?? null,
      targetUrl: data.targetUrl,
      status: data.status,
      k6Status: data.k6Status,
      k6P95Ms: data.k6P95Ms ?? null,
      k6FailureRateBasisPoints: data.k6FailureRateBasisPoints ?? null,
      k6Requests: data.k6Requests,
      zapStatus: data.zapStatus,
      zapHigh: data.zapHigh,
      zapMedium: data.zapMedium,
      zapLow: data.zapLow,
      axeStatus: data.axeStatus,
      axeCritical: data.axeCritical,
      axeSerious: data.axeSerious,
      axeModerate: data.axeModerate,
      axeMinor: data.axeMinor,
      reportDirectory: data.reportDirectory ?? null,
      startedAt: data.startedAt ?? null,
      finishedAt: data.finishedAt,
      rawPayload: data.rawPayload,
    };

    let runId = existingId;
    if (runId) {
      await tx
        .update(nonFunctionalRuns)
        .set(values)
        .where(eq(nonFunctionalRuns.id, runId));
      await tx
        .delete(nonFunctionalFindings)
        .where(eq(nonFunctionalFindings.runId, runId));
    } else {
      const [insertResult] = await tx.insert(nonFunctionalRuns).values(values);
      runId = (insertResult as any).insertId as number;
    }

    if (data.findings.length > 0) {
      await tx.insert(nonFunctionalFindings).values(
        data.findings.map(finding => ({
          runId,
          tool: finding.tool,
          severity: finding.severity,
          ruleId: finding.ruleId ?? null,
          title: finding.title,
          description: finding.description ?? null,
          helpUrl: finding.helpUrl ?? null,
          occurrences: finding.occurrences,
          rawPayload: finding.rawPayload,
        })),
      );
    }

    return { id: runId, created: !existingId };
  });
}

export async function replaceDefectCards(
  externalExecutionId: string,
  cards: NormalizedDefectCard[],
): Promise<Array<{ id: number; externalCardId: string }>> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const existingRows = await db
    .select({
      externalCardId: defectCards.externalCardId,
      status: defectCards.status,
    })
    .from(defectCards)
    .where(eq(defectCards.externalExecutionId, externalExecutionId));
  const statusByExternalId = new Map(
    existingRows.map(card => [card.externalCardId, card.status]),
  );

  const resolvedCards: InsertDefectCard[] = [];
  for (const card of cards) {
    let clientId = card.clientId;
    let projectId = card.projectId;
    let sprintId = card.sprintId;
    let clientName = card.clientName;
    if (!projectId) {
      const projectRows = await db
        .select()
        .from(projects)
        .where(eq(projects.name, card.projectName))
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
    if (!sprintId && card.sprintName) {
      const sprintCondition = projectId
        ? and(
            eq(sprints.name, card.sprintName),
            eq(sprints.projectId, projectId),
          )
        : eq(sprints.name, card.sprintName);
      const sprintRows = await db
        .select()
        .from(sprints)
        .where(sprintCondition)
        .limit(1);
      sprintId = sprintRows[0]?.id;
    }
    resolvedCards.push({
      ...card,
      clientId: clientId ?? null,
      projectId: projectId ?? null,
      sprintId: sprintId ?? null,
      clientName: clientName ?? null,
      systemUrl: card.systemUrl ?? null,
      sprintName: card.sprintName ?? null,
      expectedResult: card.expectedResult ?? null,
      status: statusByExternalId.get(card.externalCardId) ?? "ABERTO",
    });
  }

  await db.transaction(async tx => {
    await tx
      .delete(defectCards)
      .where(eq(defectCards.externalExecutionId, externalExecutionId));
    if (resolvedCards.length > 0) {
      await tx.insert(defectCards).values(resolvedCards);
    }
    const newCards = resolvedCards.filter(
      card => !statusByExternalId.has(card.externalCardId),
    );
    if (newCards.length > 0) {
      await tx.insert(defectCardHistory).values(
        newCards.map(card => ({
          externalCardId: card.externalCardId,
          fromStatus: null,
          toStatus: "ABERTO" as const,
          source: "AGENTE" as const,
          reason: "Card criado automaticamente após falha funcional real.",
        })),
      );
    }
  });

  if (cards.length === 0) return [];
  return db
    .select({
      id: defectCards.id,
      externalCardId: defectCards.externalCardId,
    })
    .from(defectCards)
    .where(eq(defectCards.externalExecutionId, externalExecutionId));
}

export async function getDefectCardByExternalId(externalCardId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select()
    .from(defectCards)
    .where(eq(defectCards.externalCardId, externalCardId))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateDefectCardStatus(input: {
  externalCardId: string;
  status: DefectCardStatus;
  reason?: string;
  changedById?: number;
  changedByName?: string;
  source?: "AGENTE" | "USUARIO" | "SISTEMA";
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  return db.transaction(async tx => {
    const rows = await tx
      .select()
      .from(defectCards)
      .where(eq(defectCards.externalCardId, input.externalCardId))
      .limit(1);
    const card = rows[0];
    if (!card) return null;

    const currentStatus = card.status as DefectCardStatus;
    assertDefectCardTransition(currentStatus, input.status);
    if (currentStatus === input.status) {
      return { ...card, changed: false };
    }

    await tx
      .update(defectCards)
      .set({ status: input.status })
      .where(eq(defectCards.id, card.id));
    await tx.insert(defectCardHistory).values({
      externalCardId: card.externalCardId,
      fromStatus: currentStatus,
      toStatus: input.status,
      source: input.source ?? "USUARIO",
      reason: input.reason?.trim().slice(0, 1000) || null,
      changedById: input.changedById ?? null,
      changedByName: input.changedByName?.trim().slice(0, 255) || null,
    });

    return { ...card, status: input.status, changed: true };
  });
}

export async function getDefectCardHistory(externalCardId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select()
    .from(defectCardHistory)
    .where(eq(defectCardHistory.externalCardId, externalCardId))
    .orderBy(desc(defectCardHistory.createdAt), desc(defectCardHistory.id));
}

export async function getAgentMemories(scopeKey: string, limit = 30) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select()
    .from(qaAgentMemories)
    .where(
      and(
        eq(qaAgentMemories.scopeKey, scopeKey),
        eq(qaAgentMemories.status, "ATIVA"),
      ),
    )
    .orderBy(
      sql`CASE ${qaAgentMemories.category}
        WHEN 'SELETOR' THEN 0
        WHEN 'AUTOMACAO' THEN 1
        WHEN 'REGRA_NEGOCIO' THEN 2
        WHEN 'OBSERVACAO' THEN 3
        WHEN 'RISCO' THEN 4
        ELSE 5
      END`,
      desc(qaAgentMemories.confidence),
      desc(qaAgentMemories.occurrences),
      desc(qaAgentMemories.lastSeenAt),
    )
    .limit(Math.min(50, Math.max(1, limit)));
}

export async function getAgentMemoryByFingerprint(scopeKey: string, fingerprint: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select()
    .from(qaAgentMemories)
    .where(and(
      eq(qaAgentMemories.scopeKey, scopeKey),
      eq(qaAgentMemories.fingerprint, fingerprint),
      eq(qaAgentMemories.status, "ATIVA"),
    ))
    .limit(1);
  return rows[0];
}

export async function upsertAgentMemories(
  learnings: AgentMemoryLearning[],
): Promise<{ received: number; inserted: number; updated: number }> {
  if (learnings.length === 0) {
    return { received: 0, inserted: 0, updated: 0 };
  }
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const first = learnings[0];
  let clientId = first.clientId;
  let projectId = first.projectId;
  let sprintId = first.sprintId;
  let clientName = first.clientName;
  if (!projectId) {
    const projectRows = await db
      .select()
      .from(projects)
      .where(eq(projects.name, first.projectName))
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
  if (!sprintId && first.sprintName) {
    const sprintCondition = projectId
      ? and(
          eq(sprints.name, first.sprintName),
          eq(sprints.projectId, projectId),
        )
      : eq(sprints.name, first.sprintName);
    const sprintRows = await db
      .select()
      .from(sprints)
      .where(sprintCondition)
      .limit(1);
    sprintId = sprintRows[0]?.id;
  }

  const fingerprints = learnings.map(learning => learning.fingerprint);
  const existingRows = await db
    .select({ fingerprint: qaAgentMemories.fingerprint })
    .from(qaAgentMemories)
    .where(
      and(
        eq(qaAgentMemories.scopeKey, first.scopeKey),
        inArray(qaAgentMemories.fingerprint, fingerprints),
      ),
    );
  const existing = new Set(existingRows.map(row => row.fingerprint));
  const now = new Date();

  await db.transaction(async tx => {
    for (const learning of learnings) {
      const values: InsertQAAgentMemory = {
        scopeKey: learning.scopeKey,
        fingerprint: learning.fingerprint,
        clientId: learning.clientId ?? clientId ?? null,
        projectId: learning.projectId ?? projectId ?? null,
        clientName: learning.clientName ?? clientName ?? null,
        projectName: learning.projectName,
        systemHost: learning.systemHost,
        systemUrl: learning.systemUrl ?? null,
        sourceSprintId: learning.sprintId ?? sprintId ?? null,
        sourceSprintName: learning.sprintName ?? null,
        externalExecutionId: learning.externalExecutionId ?? null,
        externalScenarioId: learning.externalScenarioId ?? null,
        category: learning.category,
        title: learning.title,
        content: learning.content,
        confidence: learning.confidence,
        occurrences: 1,
        status: "ATIVA",
        firstSeenAt: now,
        lastSeenAt: now,
      };
      await tx
        .insert(qaAgentMemories)
        .values(values)
        .onDuplicateKeyUpdate({
          set: {
            clientId: values.clientId,
            projectId: values.projectId,
            clientName: values.clientName,
            systemUrl: values.systemUrl,
            sourceSprintId: values.sourceSprintId,
            sourceSprintName: values.sourceSprintName,
            externalExecutionId: values.externalExecutionId,
            externalScenarioId: values.externalScenarioId,
            title: values.title,
            content: values.content,
            confidence: sql`GREATEST(${qaAgentMemories.confidence}, ${learning.confidence})`,
            occurrences: sql`${qaAgentMemories.occurrences} + 1`,
            status: "ATIVA",
            lastSeenAt: now,
          },
        });
    }
  });

  const updated = learnings.filter(learning =>
    existing.has(learning.fingerprint),
  ).length;
  return {
    received: learnings.length,
    inserted: learnings.length - updated,
    updated,
  };
}

export type DashboardMetricFilters = {
  clientId?: number;
  projectId?: number;
  sprintId?: number;
};

function emptyNonFunctionalMetrics() {
  return {
    summary: {
      totalRuns: 0,
      passedRuns: 0,
      failedRuns: 0,
      passRate: 0,
      latestP95Ms: null as number | null,
      latestFailureRatePercent: null as number | null,
      zapHigh: 0,
      zapMedium: 0,
      axeCritical: 0,
      axeSerious: 0,
    },
    recentRuns: [] as Array<{
      id: number;
      externalRunId: string;
      projectName: string;
      sprintName: string | null;
      targetUrl: string;
      status: "PASSOU" | "FALHOU" | "PARCIAL" | "ERRO";
      k6Status: "PASSOU" | "FALHOU" | "NAO_EXECUTADO" | "ERRO";
      k6P95Ms: number | null;
      zapStatus: "PASSOU" | "FALHOU" | "NAO_EXECUTADO" | "ERRO";
      zapHigh: number;
      zapMedium: number;
      axeStatus: "PASSOU" | "FALHOU" | "NAO_EXECUTADO" | "ERRO";
      axeCritical: number;
      axeSerious: number;
      reportDirectory: string | null;
      finishedAt: Date;
    }>,
    topFindings: [] as Array<{
      id: number;
      tool: "K6" | "ZAP" | "AXE";
      severity: "INFO" | "BAIXO" | "MEDIO" | "ALTO" | "CRITICO";
      title: string;
      occurrences: number;
      helpUrl: string | null;
    }>,
  };
}

function emptyDefectCardMetrics() {
  return {
    summary: {
      totalCards: 0,
      openCards: 0,
      criticalOpenCards: 0,
      copiedCards: 0,
      resolvedCards: 0,
      reopenedCards: 0,
      discardedCards: 0,
    },
    recentCards: [] as Array<{
      id: number;
      externalCardId: string;
      externalExecutionId: string;
      externalScenarioId: string;
      projectName: string;
      sprintName: string | null;
      scenarioTitle: string;
      title: string;
      severity: "BAIXO" | "MEDIO" | "ALTO" | "CRITICO";
      status:
        | "ABERTO"
        | "COPIADO"
        | "RESOLVIDO"
        | "REABERTO"
        | "DESCARTADO";
      markdown: string;
      createdAt: Date;
    }>,
  };
}

function emptyAgentMemoryMetrics() {
  return {
    summary: {
      activeMemories: 0,
      systems: 0,
      reinforcedMemories: 0,
      businessRules: 0,
      selectors: 0,
    },
    recentMemories: [] as Array<{
      id: number;
      projectName: string;
      systemHost: string;
      sourceSprintName: string | null;
      category:
        | "REGRA_NEGOCIO"
        | "SELETOR"
        | "RISCO"
        | "DEFEITO"
        | "AUTOMACAO"
        | "OBSERVACAO";
      title: string;
      content: string;
      confidence: number;
      occurrences: number;
      lastSeenAt: Date;
    }>,
  };
}

export async function getDashboardMetrics(filters: DashboardMetricFilters) {
  const db = await getDb();
  if (!db) {
    return {
      databaseAvailable: false,
      summary: {
        totalExecutions: 0,
        totalScenarios: 0,
        coveragePercent: 0,
        passRate: 0,
        failRate: 0,
        flakyRate: 0,
        flakyScenarios: 0,
        automationErrorRate: 0,
        defectsFound: 0,
        criticalDefects: 0,
        dre: null as number | null,
      },
      statusDistribution: [],
      trend: [],
      modules: [],
      recentExecutions: [],
      nonFunctional: emptyNonFunctionalMetrics(),
      defectCards: emptyDefectCardMetrics(),
      agentMemory: emptyAgentMemoryMetrics(),
    };
  }

  const conditions = [];
  if (filters.clientId) {
    conditions.push(eq(testExecutions.clientId, filters.clientId));
  }
  if (filters.projectId) {
    conditions.push(eq(testExecutions.projectId, filters.projectId));
  }
  if (filters.sprintId) {
    conditions.push(eq(testExecutions.sprintId, filters.sprintId));
  }
  const baseQuery = db.select().from(testExecutions);
  const executions =
    conditions.length > 0
      ? await baseQuery
          .where(and(...conditions))
          .orderBy(desc(testExecutions.finishedAt))
          .limit(500)
      : await baseQuery
          .orderBy(desc(testExecutions.finishedAt))
          .limit(500);

  const nonFunctionalConditions = [];
  if (filters.clientId) {
    nonFunctionalConditions.push(
      eq(nonFunctionalRuns.clientId, filters.clientId),
    );
  }
  if (filters.projectId) {
    nonFunctionalConditions.push(
      eq(nonFunctionalRuns.projectId, filters.projectId),
    );
  }
  if (filters.sprintId) {
    nonFunctionalConditions.push(
      eq(nonFunctionalRuns.sprintId, filters.sprintId),
    );
  }
  const nonFunctionalBaseQuery = db.select().from(nonFunctionalRuns);
  const nonFunctionalRunRows =
    nonFunctionalConditions.length > 0
      ? await nonFunctionalBaseQuery
          .where(and(...nonFunctionalConditions))
          .orderBy(desc(nonFunctionalRuns.finishedAt))
          .limit(200)
      : await nonFunctionalBaseQuery
          .orderBy(desc(nonFunctionalRuns.finishedAt))
          .limit(200);
  const nonFunctionalRunIds = nonFunctionalRunRows.map(run => run.id);
  const nonFunctionalFindingRows =
    nonFunctionalRunIds.length > 0
      ? await db
          .select()
          .from(nonFunctionalFindings)
          .where(inArray(nonFunctionalFindings.runId, nonFunctionalRunIds))
      : [];
  const nonFunctionalPassed = nonFunctionalRunRows.filter(
    run => run.status === "PASSOU",
  ).length;
  const nonFunctionalFailed = nonFunctionalRunRows.filter(
    run => run.status === "FALHOU",
  ).length;
  const latestNonFunctional = nonFunctionalRunRows[0];
  const severityOrder = {
    CRITICO: 5,
    ALTO: 4,
    MEDIO: 3,
    BAIXO: 2,
    INFO: 1,
  };
  const consolidatedFindingMap = new Map<
    string,
    (typeof nonFunctionalFindingRows)[number]
  >();
  for (const finding of nonFunctionalFindingRows) {
    const key = `${finding.tool}:${finding.ruleId || finding.title}`;
    const existing = consolidatedFindingMap.get(key);
    if (!existing) {
      consolidatedFindingMap.set(key, { ...finding });
      continue;
    }
    existing.occurrences += finding.occurrences;
    if (severityOrder[finding.severity] > severityOrder[existing.severity]) {
      existing.severity = finding.severity;
    }
    if (!existing.helpUrl && finding.helpUrl) {
      existing.helpUrl = finding.helpUrl;
    }
  }
  const nonFunctional = {
    summary: {
      totalRuns: nonFunctionalRunRows.length,
      passedRuns: nonFunctionalPassed,
      failedRuns: nonFunctionalFailed,
      passRate:
        nonFunctionalRunRows.length > 0
          ? Math.round(
              (nonFunctionalPassed / nonFunctionalRunRows.length) * 1000,
            ) / 10
          : 0,
      latestP95Ms: latestNonFunctional?.k6P95Ms ?? null,
      latestFailureRatePercent:
        latestNonFunctional?.k6FailureRateBasisPoints == null
          ? null
          : Math.round(
              (latestNonFunctional.k6FailureRateBasisPoints / 100) * 100,
            ) / 100,
      zapHigh: nonFunctionalRunRows.reduce(
        (total, run) => total + run.zapHigh,
        0,
      ),
      zapMedium: nonFunctionalRunRows.reduce(
        (total, run) => total + run.zapMedium,
        0,
      ),
      axeCritical: nonFunctionalRunRows.reduce(
        (total, run) => total + run.axeCritical,
        0,
      ),
      axeSerious: nonFunctionalRunRows.reduce(
        (total, run) => total + run.axeSerious,
        0,
      ),
    },
    recentRuns: nonFunctionalRunRows.slice(0, 10).map(run => ({
      id: run.id,
      externalRunId: run.externalRunId,
      projectName: run.projectName,
      sprintName: run.sprintName,
      targetUrl: run.targetUrl,
      status: run.status,
      k6Status: run.k6Status,
      k6P95Ms: run.k6P95Ms,
      zapStatus: run.zapStatus,
      zapHigh: run.zapHigh,
      zapMedium: run.zapMedium,
      axeStatus: run.axeStatus,
      axeCritical: run.axeCritical,
      axeSerious: run.axeSerious,
      reportDirectory: run.reportDirectory,
      finishedAt: run.finishedAt ?? run.createdAt,
    })),
    topFindings: Array.from(consolidatedFindingMap.values())
      .sort(
        (left, right) =>
          severityOrder[right.severity] - severityOrder[left.severity] ||
          right.occurrences - left.occurrences,
      )
      .slice(0, 10)
      .map(finding => ({
        id: finding.id,
        tool: finding.tool,
        severity: finding.severity,
        title: finding.title,
        occurrences: finding.occurrences,
        helpUrl: finding.helpUrl,
      })),
  };

  const defectCardConditions = [];
  if (filters.clientId) {
    defectCardConditions.push(eq(defectCards.clientId, filters.clientId));
  }
  if (filters.projectId) {
    defectCardConditions.push(eq(defectCards.projectId, filters.projectId));
  }
  if (filters.sprintId) {
    defectCardConditions.push(eq(defectCards.sprintId, filters.sprintId));
  }
  const defectCardBaseQuery = db.select().from(defectCards);
  const defectCardRows =
    defectCardConditions.length > 0
      ? await defectCardBaseQuery
          .where(and(...defectCardConditions))
          .orderBy(desc(defectCards.createdAt))
          .limit(200)
      : await defectCardBaseQuery
          .orderBy(desc(defectCards.createdAt))
          .limit(200);
  const defectCardMetrics = {
    summary: {
      totalCards: defectCardRows.length,
      openCards: defectCardRows.filter(card =>
        ["ABERTO", "COPIADO", "REABERTO"].includes(card.status),
      ).length,
      criticalOpenCards: defectCardRows.filter(
        card =>
          ["ABERTO", "COPIADO", "REABERTO"].includes(card.status) &&
          card.severity === "CRITICO",
      ).length,
      copiedCards: defectCardRows.filter(card => card.status === "COPIADO").length,
      resolvedCards: defectCardRows.filter(card => card.status === "RESOLVIDO").length,
      reopenedCards: defectCardRows.filter(card => card.status === "REABERTO").length,
      discardedCards: defectCardRows.filter(card => card.status === "DESCARTADO").length,
    },
    recentCards: defectCardRows.slice(0, 20).map(card => ({
      id: card.id,
      externalCardId: card.externalCardId,
      externalExecutionId: card.externalExecutionId,
      externalScenarioId: card.externalScenarioId,
      projectName: card.projectName,
      sprintName: card.sprintName,
      scenarioTitle: card.scenarioTitle,
      title: card.title,
      severity: card.severity,
      status: card.status,
      markdown: card.markdown,
      createdAt: card.createdAt,
    })),
  };

  const agentMemoryConditions = [eq(qaAgentMemories.status, "ATIVA")];
  if (filters.clientId) {
    agentMemoryConditions.push(
      eq(qaAgentMemories.clientId, filters.clientId),
    );
  }
  if (filters.projectId) {
    agentMemoryConditions.push(
      eq(qaAgentMemories.projectId, filters.projectId),
    );
  }
  if (filters.sprintId) {
    agentMemoryConditions.push(
      eq(qaAgentMemories.sourceSprintId, filters.sprintId),
    );
  }
  const agentMemoryRows = await db
    .select()
    .from(qaAgentMemories)
    .where(and(...agentMemoryConditions))
    .orderBy(desc(qaAgentMemories.lastSeenAt))
    .limit(500);
  const agentMemoryMetrics = {
    summary: {
      activeMemories: agentMemoryRows.length,
      systems: new Set(agentMemoryRows.map(memory => memory.scopeKey)).size,
      reinforcedMemories: agentMemoryRows.filter(
        memory => memory.occurrences > 1,
      ).length,
      businessRules: agentMemoryRows.filter(
        memory => memory.category === "REGRA_NEGOCIO",
      ).length,
      selectors: agentMemoryRows.filter(
        memory => memory.category === "SELETOR",
      ).length,
    },
    recentMemories: agentMemoryRows.slice(0, 20).map(memory => ({
      id: memory.id,
      projectName: memory.projectName,
      systemHost: memory.systemHost,
      sourceSprintName: memory.sourceSprintName,
      category: memory.category,
      title: memory.title,
      content: memory.content,
      confidence: memory.confidence,
      occurrences: memory.occurrences,
      lastSeenAt: memory.lastSeenAt,
    })),
  };

  if (executions.length === 0) {
    return {
      databaseAvailable: true,
      summary: {
        totalExecutions: 0,
        totalScenarios: 0,
        coveragePercent: 0,
        passRate: 0,
        failRate: 0,
        flakyRate: 0,
        flakyScenarios: 0,
        automationErrorRate: 0,
        defectsFound: 0,
        criticalDefects: 0,
        dre: null as number | null,
      },
      statusDistribution: [
        { status: "Passou", value: 0, color: "#22c55e" },
        { status: "Falhou", value: 0, color: "#ef4444" },
        { status: "Flaky", value: 0, color: "#8b5cf6" },
        { status: "Bloqueado", value: 0, color: "#f59e0b" },
        { status: "Erro de automação", value: 0, color: "#64748b" },
      ],
      trend: [],
      modules: [],
      recentExecutions: [],
      nonFunctional,
      defectCards: defectCardMetrics,
      agentMemory: agentMemoryMetrics,
    };
  }

  const completedExecutions = executions.filter(
    execution => execution.status !== "EM_ANDAMENTO" && execution.status !== "CANCELADO",
  );
  const executionIds = completedExecutions.map(execution => execution.id);
  const results = await db
    .select()
    .from(testResults)
    .where(inArray(testResults.executionId, executionIds));
  const totalScenarios = completedExecutions.reduce(
    (total, execution) => total + execution.totalScenarios,
    0,
  );
  const passed = completedExecutions.reduce(
    (total, execution) => total + execution.passedScenarios,
    0,
  );
  const failed = completedExecutions.reduce(
    (total, execution) => total + execution.failedScenarios,
    0,
  );
  const blocked = completedExecutions.reduce(
    (total, execution) => total + execution.blockedScenarios,
    0,
  );
  const automationErrors = completedExecutions.reduce(
    (total, execution) => total + execution.automationErrors,
    0,
  );
  const flaky = completedExecutions.reduce(
    (total, execution) => total + execution.flakyScenarios,
    0,
  );
  const defectsFound = completedExecutions.reduce(
    (total, execution) => total + execution.defectsFound,
    0,
  );
  const criticalDefects = completedExecutions.reduce(
    (total, execution) => total + execution.criticalDefects,
    0,
  );
  const escapedDefects = completedExecutions.reduce(
    (total, execution) => total + execution.escapedDefects,
    0,
  );
  const percent = (value: number, total: number) =>
    total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
  const executedForCoverage = passed + failed + flaky;
  const dreDenominator = defectsFound + escapedDefects;

  const executionById = new Map(
    executions.map(execution => [execution.id, execution]),
  );
  const moduleMap = new Map<
    string,
    {
      total: number;
      passed: number;
      failed: number;
      flaky: number;
      defects: number;
      critical: number;
    }
  >();
  for (const result of results) {
    const execution = executionById.get(result.executionId);
    const moduleName =
      result.moduleName || execution?.projectName || "Não informado";
    const current = moduleMap.get(moduleName) ?? {
      total: 0,
      passed: 0,
      failed: 0,
      flaky: 0,
      defects: 0,
      critical: 0,
    };
    current.total += 1;
    current.passed += result.reliabilityStatus === "ESTAVEL" ? 1 : 0;
    current.failed += result.reliabilityStatus === "FALHA_REAL" ? 1 : 0;
    current.flaky += result.reliabilityStatus === "FLAKY" ? 1 : 0;
    current.defects += result.realDefects;
    current.critical += result.risk === "CRITICO" ? result.realDefects : 0;
    moduleMap.set(moduleName, current);
  }
  const modules = Array.from(moduleMap.entries())
    .map(([moduleName, values]) => {
      const failRate = percent(values.failed, values.total);
      const risk =
        values.critical > 0 || failRate >= 40
          ? "CRITICO"
          : failRate >= 25
            ? "ALTO"
            : failRate >= 10
              ? "MEDIO"
              : "BAIXO";
      return {
        moduleName,
        ...values,
        passRate: percent(values.passed, values.total),
        failRate,
        risk,
      };
    })
    .sort((left, right) => right.failRate - left.failRate)
    .slice(0, 10);

  const trendMap = new Map<
    string,
    {
      order: number;
      total: number;
      passed: number;
      failed: number;
      flaky: number;
      executed: number;
    }
  >();
  for (const execution of [...completedExecutions].reverse()) {
    const date = execution.finishedAt ?? execution.createdAt;
    const label =
      execution.sprintName ||
      new Intl.DateTimeFormat("pt-BR", {
        month: "short",
        year: "2-digit",
      }).format(date);
    const current = trendMap.get(label) ?? {
      order: date.getTime(),
      total: 0,
      passed: 0,
      failed: 0,
      flaky: 0,
      executed: 0,
    };
    current.total += execution.totalScenarios;
    current.passed += execution.passedScenarios;
    current.failed += execution.failedScenarios;
    current.flaky += execution.flakyScenarios;
    current.executed +=
      execution.passedScenarios +
      execution.failedScenarios +
      execution.flakyScenarios;
    current.order = Math.max(current.order, date.getTime());
    trendMap.set(label, current);
  }
  const trend = Array.from(trendMap.entries())
    .map(([sprint, values]) => ({
      sprint,
      order: values.order,
      passRate: percent(values.passed, values.total),
      failRate: percent(values.failed, values.total),
      flakyRate: percent(values.flaky, values.total),
      coveragePercent: percent(values.executed, values.total),
    }))
    .sort((left, right) => left.order - right.order)
    .slice(-12)
    .map(({ order: _order, ...item }) => item);

  return {
    databaseAvailable: true,
    summary: {
      totalExecutions: executions.length,
      totalScenarios,
      coveragePercent: percent(executedForCoverage, totalScenarios),
      passRate: percent(passed, totalScenarios),
      failRate: percent(failed, totalScenarios),
      flakyRate: percent(flaky, totalScenarios),
      flakyScenarios: flaky,
      automationErrorRate: percent(automationErrors, totalScenarios),
      defectsFound,
      criticalDefects,
      dre:
        dreDenominator > 0
          ? percent(defectsFound, dreDenominator)
          : (null as number | null),
    },
    statusDistribution: [
      { status: "Passou", value: passed, color: "#22c55e" },
      { status: "Falhou", value: failed, color: "#ef4444" },
      { status: "Flaky", value: flaky, color: "#8b5cf6" },
      { status: "Bloqueado", value: blocked, color: "#f59e0b" },
      {
        status: "Erro de automação",
        value: automationErrors,
        color: "#64748b",
      },
    ],
    trend,
    modules,
    recentExecutions: executions.slice(0, 10).map(execution => ({
      id: execution.id,
      externalExecutionId: execution.externalExecutionId,
      projectName: execution.projectName,
      sprintName: execution.sprintName,
      status: execution.status,
      totalScenarios: execution.totalScenarios,
      coveragePercent: execution.coveragePercent,
      defectsFound: execution.defectsFound,
      flakyScenarios: execution.flakyScenarios,
      finishedAt: execution.finishedAt ?? execution.createdAt,
      evidenceDocxUrl: execution.evidenceDocxUrl,
      reliabilityReportUrl: execution.reliabilityReportUrl,
    })),
    nonFunctional,
    defectCards: defectCardMetrics,
    agentMemory: agentMemoryMetrics,
  };
}
