import { desc, eq, sql } from "drizzle-orm";
import { clients, projects, sigMcpSettings, sprints } from "../drizzle/schema";
import { getDb } from "./db";

export async function listSigMcpSettings() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: sigMcpSettings.id,
    name: sigMcpSettings.name,
    endpointUrl: sigMcpSettings.endpointUrl,
    username: sigMcpSettings.username,
    cardsToolName: sigMcpSettings.cardsToolName,
    queueToolName: sigMcpSettings.queueToolName,
    hasPassword: sql<number>`${sigMcpSettings.passwordEncrypted} is not null`,
    isActive: sigMcpSettings.isActive,
    createdAt: sigMcpSettings.createdAt,
    updatedAt: sigMcpSettings.updatedAt,
  }).from(sigMcpSettings).orderBy(desc(sigMcpSettings.isActive), sigMcpSettings.name);
}

export async function getSigMcpSetting(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(sigMcpSettings).where(eq(sigMcpSettings.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getActiveSigMcpSetting() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(sigMcpSettings)
    .where(eq(sigMcpSettings.isActive, 1))
    .orderBy(desc(sigMcpSettings.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function createSigMcpSetting(data: typeof sigMcpSettings.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (data.isActive) await db.update(sigMcpSettings).set({ isActive: 0 });
  const [result] = await db.insert(sigMcpSettings).values(data);
  return Number((result as any).insertId);
}

export async function updateSigMcpSetting(id: number, data: Partial<typeof sigMcpSettings.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (data.isActive) await db.update(sigMcpSettings).set({ isActive: 0 });
  await db.update(sigMcpSettings).set(data).where(eq(sigMcpSettings.id, id));
}

export async function deleteSigMcpSetting(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(sigMcpSettings).where(eq(sigMcpSettings.id, id));
}

export async function getSigMapping(projectId: number, sprintId: number) {
  const db = await getDb();
  if (!db) return null;
  const projectRows = await db.select({
    id: projects.id,
    name: projects.name,
    sigProjectId: projects.sigProjectId,
  }).from(projects).where(eq(projects.id, projectId)).limit(1);
  const sprintRows = await db.select({
    id: sprints.id,
    projectId: sprints.projectId,
    name: sprints.name,
    sigSprintId: sprints.sigSprintId,
  }).from(sprints).where(eq(sprints.id, sprintId)).limit(1);
  const project = projectRows[0];
  const sprint = sprintRows[0];
  if (!project || !sprint || sprint.projectId !== project.id) return null;
  return { project, sprint };
}

export async function saveSigMapping(input: {
  projectId: number;
  sprintId: number;
  sigProjectId: string;
  sigSprintId: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const mapping = await getSigMapping(input.projectId, input.sprintId);
  if (!mapping) throw new Error("Projeto ou sprint não encontrado.");
  await db.update(projects).set({ sigProjectId: input.sigProjectId }).where(eq(projects.id, input.projectId));
  await db.update(sprints).set({ sigSprintId: input.sigSprintId }).where(eq(sprints.id, input.sprintId));
}


export async function listSigMappings() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    projectId: projects.id,
    projectName: projects.name,
    sigProjectId: projects.sigProjectId,
    sprintId: sprints.id,
    sprintName: sprints.name,
    sigSprintId: sprints.sigSprintId,
    clientId: clients.id,
    clientName: clients.name,
  }).from(sprints)
    .innerJoin(projects, eq(sprints.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id));
}
