import { index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }),
  username: varchar("username", { length: 64 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  /** "admin" = Coordenador, "user" = Analista */
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Clientes ────────────────────────────────────────────────────────────────
export const clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Client = typeof clients.$inferSelect;

// ─── Projetos ─────────────────────────────────────────────────────────────────
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Project = typeof projects.$inferSelect;

// ─── Sprints ──────────────────────────────────────────────────────────────────
export const sprints = mysqlTable("sprints", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["pending", "in_progress", "in_review", "done"]).default("pending").notNull(),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Sprint = typeof sprints.$inferSelect;

// ─── Checklists ───────────────────────────────────────────────────────────────
export const checklists = mysqlTable("checklists", {
  id: int("id").autoincrement().primaryKey(),
  sprintId: int("sprintId").notNull(),
  analystId: int("analystId").notNull(),
  /** JSON com o estado de cada item: { [itemId]: boolean } */
  checkedItems: text("checkedItems").notNull().default("{}"),
  totalItems: int("totalItems").notNull().default(0),
  completedItems: int("completedItems").notNull().default(0),
  status: mysqlEnum("status", ["in_progress", "completed"]).default("in_progress").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Checklist = typeof checklists.$inferSelect;

export const trailProgress = mysqlTable("trail_progress", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  completedTopics: text("completedTopics").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TrailProgress = typeof trailProgress.$inferSelect;
export type InsertTrailProgress = typeof trailProgress.$inferInsert;

// ─── QA Plan Documents ────────────────────────────────────────────────────────
export const qaPlanDocuments = mysqlTable("qa_plan_documents", {
  id: int("id").autoincrement().primaryKey(),
  createdById: int("createdById").notNull(),
  projectName: varchar("projectName", { length: 255 }).notNull(),
  clientName: varchar("clientName", { length: 255 }),
  sprintName: varchar("sprintName", { length: 100 }),
  version: varchar("version", { length: 50 }).default("1.0"),
  redator: varchar("redator", { length: 255 }),
  baseName: varchar("baseName", { length: 500 }).notNull(),
  texStorageKey: varchar("texStorageKey", { length: 500 }),
  texUrl: varchar("texUrl", { length: 1000 }),
  pdfStorageKey: varchar("pdfStorageKey", { length: 500 }),
  pdfUrl: varchar("pdfUrl", { length: 1000 }),
  pdfError: text("pdfError"),
  /** JSON completo do projeto (cenários, imagens, etc.) para reabrir no editor */
  projectJson: text("projectJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type QAPlanDocument = typeof qaPlanDocuments.$inferSelect;

// ─── Execuções automatizadas de QA ──────────────────────────────────────────
export const testExecutions = mysqlTable("test_executions", {
  id: int("id").autoincrement().primaryKey(),
  externalExecutionId: varchar("externalExecutionId", { length: 128 }).notNull(),
  clientId: int("clientId"),
  projectId: int("projectId"),
  sprintId: int("sprintId"),
  clientName: varchar("clientName", { length: 255 }),
  projectName: varchar("projectName", { length: 255 }).notNull(),
  sprintName: varchar("sprintName", { length: 255 }),
  systemUrl: varchar("systemUrl", { length: 1000 }),
  status: mysqlEnum("status", ["PASSOU", "FALHOU", "BLOQUEADO", "ERRO_AUTOMACAO"]).notNull(),
  totalScenarios: int("totalScenarios").notNull().default(0),
  passedScenarios: int("passedScenarios").notNull().default(0),
  failedScenarios: int("failedScenarios").notNull().default(0),
  blockedScenarios: int("blockedScenarios").notNull().default(0),
  automationErrors: int("automationErrors").notNull().default(0),
  coveragePercent: int("coveragePercent").notNull().default(0),
  defectsFound: int("defectsFound").notNull().default(0),
  criticalDefects: int("criticalDefects").notNull().default(0),
  escapedDefects: int("escapedDefects").notNull().default(0),
  evidenceDocxUrl: text("evidenceDocxUrl"),
  regressionBundleId: varchar("regressionBundleId", { length: 64 }),
  startedAt: timestamp("startedAt"),
  finishedAt: timestamp("finishedAt"),
  rawPayload: text("rawPayload"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  externalExecutionUnique: uniqueIndex("test_executions_external_id_unique").on(table.externalExecutionId),
  projectIndex: index("test_executions_project_idx").on(table.projectId),
  sprintIndex: index("test_executions_sprint_idx").on(table.sprintId),
  finishedAtIndex: index("test_executions_finished_at_idx").on(table.finishedAt),
}));

export type TestExecution = typeof testExecutions.$inferSelect;
export type InsertTestExecution = typeof testExecutions.$inferInsert;

export const testResults = mysqlTable("test_results", {
  id: int("id").autoincrement().primaryKey(),
  executionId: int("executionId").notNull(),
  externalScenarioId: varchar("externalScenarioId", { length: 160 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  moduleName: varchar("moduleName", { length: 255 }),
  gherkin: text("gherkin"),
  status: mysqlEnum("status", ["PASSOU", "FALHOU", "BLOQUEADO", "ERRO_AUTOMACAO"]).notNull(),
  risk: mysqlEnum("risk", ["BAIXO", "MEDIO", "ALTO", "CRITICO"]).default("MEDIO").notNull(),
  summary: text("summary"),
  realDefects: int("realDefects").notNull().default(0),
  automationFailures: int("automationFailures").notNull().default(0),
  durationMs: int("durationMs"),
  evidenceJson: text("evidenceJson"),
  failuresJson: text("failuresJson"),
  regressionCodeUrl: text("regressionCodeUrl"),
  executedAt: timestamp("executedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  executionIndex: index("test_results_execution_idx").on(table.executionId),
  statusIndex: index("test_results_status_idx").on(table.status),
  moduleIndex: index("test_results_module_idx").on(table.moduleName),
}));

export type TestResult = typeof testResults.$inferSelect;
export type InsertTestResult = typeof testResults.$inferInsert;

// ─── Testes não funcionais (k6, OWASP ZAP e axe-core) ───────────────────────
export const nonFunctionalRuns = mysqlTable("non_functional_runs", {
  id: int("id").autoincrement().primaryKey(),
  externalRunId: varchar("externalRunId", { length: 128 }).notNull(),
  clientId: int("clientId"),
  projectId: int("projectId"),
  sprintId: int("sprintId"),
  clientName: varchar("clientName", { length: 255 }),
  projectName: varchar("projectName", { length: 255 }).notNull(),
  sprintName: varchar("sprintName", { length: 255 }),
  targetUrl: varchar("targetUrl", { length: 1000 }).notNull(),
  status: mysqlEnum("status", ["PASSOU", "FALHOU", "PARCIAL", "ERRO"]).notNull(),
  k6Status: mysqlEnum("k6Status", ["PASSOU", "FALHOU", "NAO_EXECUTADO", "ERRO"]).notNull(),
  k6P95Ms: int("k6P95Ms"),
  k6FailureRateBasisPoints: int("k6FailureRateBasisPoints"),
  k6Requests: int("k6Requests").notNull().default(0),
  zapStatus: mysqlEnum("zapStatus", ["PASSOU", "FALHOU", "NAO_EXECUTADO", "ERRO"]).notNull(),
  zapHigh: int("zapHigh").notNull().default(0),
  zapMedium: int("zapMedium").notNull().default(0),
  zapLow: int("zapLow").notNull().default(0),
  axeStatus: mysqlEnum("axeStatus", ["PASSOU", "FALHOU", "NAO_EXECUTADO", "ERRO"]).notNull(),
  axeCritical: int("axeCritical").notNull().default(0),
  axeSerious: int("axeSerious").notNull().default(0),
  axeModerate: int("axeModerate").notNull().default(0),
  axeMinor: int("axeMinor").notNull().default(0),
  reportDirectory: text("reportDirectory"),
  startedAt: timestamp("startedAt"),
  finishedAt: timestamp("finishedAt"),
  rawPayload: text("rawPayload"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  externalRunUnique: uniqueIndex("non_functional_runs_external_id_unique").on(table.externalRunId),
  projectIndex: index("non_functional_runs_project_idx").on(table.projectId),
  sprintIndex: index("non_functional_runs_sprint_idx").on(table.sprintId),
  finishedAtIndex: index("non_functional_runs_finished_at_idx").on(table.finishedAt),
}));

export type NonFunctionalRun = typeof nonFunctionalRuns.$inferSelect;
export type InsertNonFunctionalRun = typeof nonFunctionalRuns.$inferInsert;

export const nonFunctionalFindings = mysqlTable("non_functional_findings", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId").notNull(),
  tool: mysqlEnum("tool", ["K6", "ZAP", "AXE"]).notNull(),
  severity: mysqlEnum("severity", ["INFO", "BAIXO", "MEDIO", "ALTO", "CRITICO"]).notNull(),
  ruleId: varchar("ruleId", { length: 255 }),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  helpUrl: text("helpUrl"),
  occurrences: int("occurrences").notNull().default(1),
  rawPayload: text("rawPayload"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  runIndex: index("non_functional_findings_run_idx").on(table.runId),
  toolIndex: index("non_functional_findings_tool_idx").on(table.tool),
  severityIndex: index("non_functional_findings_severity_idx").on(table.severity),
}));

export type NonFunctionalFinding = typeof nonFunctionalFindings.$inferSelect;
export type InsertNonFunctionalFinding = typeof nonFunctionalFindings.$inferInsert;
