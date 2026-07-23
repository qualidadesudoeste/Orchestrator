import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  Checklist,
  InsertUser,
  QAPlanDocument,
  Sprint,
  TrailProgress,
  checklists,
  clients,
  nonFunctionalFindings,
  nonFunctionalRuns,
  projects,
  qaPlanDocuments,
  sprints,
  testExecutions,
  testResults,
  trailProgress,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import type { NormalizedNonFunctionalRun } from "./nonFunctionalService";
import type { NormalizedTestExecution } from "./testExecutionService";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); } catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; }
  }
  return _db;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createLocalUser(data: {
  username: string;
  passwordHash: string;
  name: string;
  email?: string;
  role: "user" | "admin";
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(users).values({
    username: data.username,
    passwordHash: data.passwordHash,
    name: data.name,
    email: data.email ?? null,
    loginMethod: "local",
    role: data.role,
    lastSignedIn: new Date(),
  });
}

export async function updateLocalUser(
  userId: number,
  data: { name?: string; email?: string; role?: "user" | "admin"; passwordHash?: string }
) {
  const db = await getDb();
  if (!db) return;
  const set: Record<string, unknown> = {};
  if (data.name !== undefined) set.name = data.name;
  if (data.email !== undefined) set.email = data.email;
  if (data.role !== undefined) set.role = data.role;
  if (data.passwordHash !== undefined) set.passwordHash = data.passwordHash;
  if (Object.keys(set).length === 0) return;
  await db.update(users).set(set).where(eq(users.id, userId));
}

export async function deleteUser(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(users).where(eq(users.id, userId));
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function updateLastSignedIn(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
}

// Mantido para compatibilidade com sdk.ts (OAuth legado)
export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function updateUserRole(userId: number, role: "user" | "admin") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
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

export async function createProject(data: { name: string; description?: string; clientId: number; createdById: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(projects).values(data);
}

export async function updateProject(id: number, data: { name?: string; description?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(projects).set(data).where(eq(projects.id, id));
}

export async function deleteProject(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(projects).where(eq(projects.id, id));
}

// ─── Sprints ─────────────────────────────────────────────────────────────────
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

export async function getChecklistsByAnalyst(analystId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(checklists).where(eq(checklists.analystId, analystId)).orderBy(desc(checklists.startedAt));
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
  const rows = await db.select().from(checklists).where(eq(checklists.analystId, analystId));
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

// ─── Trail Progress ───────────────────────────────────────────────────────────
export async function getTrailProgress(userId: number): Promise<TrailProgress | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(trailProgress).where(eq(trailProgress.userId, userId)).limit(1);
  return result[0] ?? null;
}

export async function upsertTrailProgress(userId: number, completedTopics: string[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await getTrailProgress(userId);
  const topicsJson = JSON.stringify(completedTopics);
  if (existing) {
    await db.update(trailProgress).set({ completedTopics: topicsJson }).where(eq(trailProgress.userId, userId));
  } else {
    await db.insert(trailProgress).values({ userId, completedTopics: topicsJson });
  }
}

export async function getAllTrailProgress() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: trailProgress.id,
    userId: trailProgress.userId,
    completedTopics: trailProgress.completedTopics,
    updatedAt: trailProgress.updatedAt,
  }).from(trailProgress).orderBy(desc(trailProgress.updatedAt));
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

// ─── Execuções e resultados de QA ───────────────────────────────────────────
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
      clientId: clientId ?? null,
      projectId: projectId ?? null,
      sprintId: sprintId ?? null,
      clientName: clientName ?? null,
      projectName: data.projectName,
      sprintName: data.sprintName ?? null,
      systemUrl: data.systemUrl ?? null,
      status: data.status,
      totalScenarios: data.totalScenarios,
      passedScenarios: data.passedScenarios,
      failedScenarios: data.failedScenarios,
      blockedScenarios: data.blockedScenarios,
      automationErrors: data.automationErrors,
      coveragePercent: data.coveragePercent,
      defectsFound: data.defectsFound,
      criticalDefects: data.criticalDefects,
      escapedDefects: data.escapedDefects,
      evidenceDocxUrl: data.evidenceDocxUrl ?? null,
      regressionBundleId: data.regressionBundleId ?? null,
      startedAt: data.startedAt ?? null,
      finishedAt: data.finishedAt ?? null,
      rawPayload: data.rawPayload,
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
          regressionCodeUrl: result.regressionCodeUrl ?? null,
          executedAt: result.executedAt ?? null,
        })),
      );
    }

    return { id: executionId, created: !existingId };
  });
}

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

  if (executions.length === 0) {
    return {
      databaseAvailable: true,
      summary: {
        totalExecutions: 0,
        totalScenarios: 0,
        coveragePercent: 0,
        passRate: 0,
        failRate: 0,
        automationErrorRate: 0,
        defectsFound: 0,
        criticalDefects: 0,
        dre: null as number | null,
      },
      statusDistribution: [
        { status: "Passou", value: 0, color: "#22c55e" },
        { status: "Falhou", value: 0, color: "#ef4444" },
        { status: "Bloqueado", value: 0, color: "#f59e0b" },
        { status: "Erro de automação", value: 0, color: "#64748b" },
      ],
      trend: [],
      modules: [],
      recentExecutions: [],
      nonFunctional,
    };
  }

  const executionIds = executions.map(execution => execution.id);
  const results = await db
    .select()
    .from(testResults)
    .where(inArray(testResults.executionId, executionIds));
  const totalScenarios = executions.reduce(
    (total, execution) => total + execution.totalScenarios,
    0,
  );
  const passed = executions.reduce(
    (total, execution) => total + execution.passedScenarios,
    0,
  );
  const failed = executions.reduce(
    (total, execution) => total + execution.failedScenarios,
    0,
  );
  const blocked = executions.reduce(
    (total, execution) => total + execution.blockedScenarios,
    0,
  );
  const automationErrors = executions.reduce(
    (total, execution) => total + execution.automationErrors,
    0,
  );
  const defectsFound = executions.reduce(
    (total, execution) => total + execution.defectsFound,
    0,
  );
  const criticalDefects = executions.reduce(
    (total, execution) => total + execution.criticalDefects,
    0,
  );
  const escapedDefects = executions.reduce(
    (total, execution) => total + execution.escapedDefects,
    0,
  );
  const percent = (value: number, total: number) =>
    total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
  const executedForCoverage = passed + failed;
  const dreDenominator = defectsFound + escapedDefects;

  const executionById = new Map(
    executions.map(execution => [execution.id, execution]),
  );
  const moduleMap = new Map<
    string,
    { total: number; passed: number; failed: number; defects: number; critical: number }
  >();
  for (const result of results) {
    const execution = executionById.get(result.executionId);
    const moduleName =
      result.moduleName || execution?.projectName || "Não informado";
    const current = moduleMap.get(moduleName) ?? {
      total: 0,
      passed: 0,
      failed: 0,
      defects: 0,
      critical: 0,
    };
    current.total += 1;
    current.passed += result.status === "PASSOU" ? 1 : 0;
    current.failed += result.status === "FALHOU" ? 1 : 0;
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
    { order: number; total: number; passed: number; failed: number; executed: number }
  >();
  for (const execution of [...executions].reverse()) {
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
      executed: 0,
    };
    current.total += execution.totalScenarios;
    current.passed += execution.passedScenarios;
    current.failed += execution.failedScenarios;
    current.executed +=
      execution.passedScenarios + execution.failedScenarios;
    current.order = Math.max(current.order, date.getTime());
    trendMap.set(label, current);
  }
  const trend = Array.from(trendMap.entries())
    .map(([sprint, values]) => ({
      sprint,
      order: values.order,
      passRate: percent(values.passed, values.total),
      failRate: percent(values.failed, values.total),
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
      finishedAt: execution.finishedAt ?? execution.createdAt,
      evidenceDocxUrl: execution.evidenceDocxUrl,
    })),
    nonFunctional,
  };
}
