import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  Checklist,
  InsertQAAgentMemory,
  InsertDefectCard,
  InsertUser,
  QAPlanDocument,
  Sprint,
  TrailProgress,
  checklists,
  clients,
  defectCardHistory,
  defectCards,
  nonFunctionalFindings,
  nonFunctionalRuns,
  projects,
  qaAgentMemories,
  qaPlanDocuments,
  sprints,
  testExecutions,
  testResults,
  trailProgress,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import type { AgentMemoryLearning } from "./agentMemoryService";
import type { NormalizedDefectCard } from "./defectCardService";
import {
  assertDefectCardTransition,
  type DefectCardStatus,
} from "./defectCardLifecycleService";
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
      desc(qaAgentMemories.confidence),
      desc(qaAgentMemories.occurrences),
      desc(qaAgentMemories.lastSeenAt),
    )
    .limit(Math.min(50, Math.max(1, limit)));
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
  const flaky = executions.reduce(
    (total, execution) => total + execution.flakyScenarios,
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
