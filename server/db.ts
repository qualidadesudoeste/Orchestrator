import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { Checklist, InsertUser, Sprint, checklists, clients, projects, sprints, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); } catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; }
  }
  return _db;
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

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
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
