import { index, int, mysqlEnum, mysqlTable, longtext, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

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
  repositoryUrl: varchar("repositoryUrl", { length: 1000 }),
  repositoryBranch: varchar("repositoryBranch", { length: 255 }),
  sourceCodePath: varchar("sourceCodePath", { length: 1000 }),
  sourceCodeSummary: text("sourceCodeSummary"),
  sourceCodeFileCount: int("sourceCodeFileCount"),
  sourceCodeIndexedAt: timestamp("sourceCodeIndexedAt"),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Project = typeof projects.$inferSelect;

export const vpnProfiles = mysqlTable("vpn_profiles", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  provider: mysqlEnum("provider", ["COGEL", "SEFAZ", "OUTRA"]).notNull(),
  profileName: varchar("profileName", { length: 160 }).notNull(),
  username: varchar("username", { length: 320 }),
  passwordEncrypted: text("passwordEncrypted"),
  autoConnect: int("autoConnect").notNull().default(1),
  connectionStrategy: mysqlEnum("connectionStrategy", ["AUTO", "CLI", "AUTOCONNECT"]).notNull().default("AUTO"),
  configFileName: varchar("configFileName", { length: 255 }),
  configEncrypted: longtext("configEncrypted"),
  configPasswordEncrypted: text("configPasswordEncrypted"),
  configImportedAt: timestamp("configImportedAt"),
  installerUrl: text("installerUrl"),
  installerSha256: varchar("installerSha256", { length: 64 }),
  verificationUrl: varchar("verificationUrl", { length: 1000 }),
  isActive: int("isActive").notNull().default(1),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  nameUnique: uniqueIndex("vpn_profiles_name_unique").on(table.name),
}));
export type VpnProfile = typeof vpnProfiles.$inferSelect;

export const aiProviderSettings = mysqlTable("ai_provider_settings", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  provider: mysqlEnum("provider", ["OPENAI", "GEMINI", "GROQ", "CUSTOM"]).notNull(),
  apiUrl: varchar("apiUrl", { length: 1000 }).notNull(),
  model: varchar("model", { length: 255 }).notNull(),
  apiKeyEncrypted: text("apiKeyEncrypted"),
  isActive: int("isActive").notNull().default(0),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  nameUnique: uniqueIndex("ai_provider_settings_name_unique").on(table.name),
  activeIndex: index("ai_provider_settings_active_idx").on(table.isActive),
}));
export type AiProviderSetting = typeof aiProviderSettings.$inferSelect;

export const projectTestEnvironments = mysqlTable("project_test_environments", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  type: mysqlEnum("type", ["PORTAL", "RETAGUARDA", "SITE", "API", "OUTRO"]).notNull(),
  loginUrl: varchar("loginUrl", { length: 1000 }).notNull(),
  username: varchar("username", { length: 320 }),
  passwordEncrypted: text("passwordEncrypted"),
  vpnProfileId: int("vpnProfileId"),
  vpnProvider: mysqlEnum("vpnProvider", ["NONE", "COGEL", "SEFAZ", "OUTRA"]).notNull().default("NONE"),
  vpnProfileName: varchar("vpnProfileName", { length: 160 }),
  vpnUsername: varchar("vpnUsername", { length: 320 }),
  vpnPasswordEncrypted: text("vpnPasswordEncrypted"),
  vpnAutoConnect: int("vpnAutoConnect").notNull().default(1),
  vpnConnectionStrategy: mysqlEnum("vpnConnectionStrategy", ["AUTO", "CLI", "AUTOCONNECT"]).notNull().default("AUTO"),
  vpnConfigFileName: varchar("vpnConfigFileName", { length: 255 }),
  vpnConfigEncrypted: longtext("vpnConfigEncrypted"),
  vpnConfigPasswordEncrypted: text("vpnConfigPasswordEncrypted"),
  vpnConfigImportedAt: timestamp("vpnConfigImportedAt"),
  vpnInstallerUrl: text("vpnInstallerUrl"),
  vpnInstallerSha256: varchar("vpnInstallerSha256", { length: 64 }),
  vpnVerificationUrl: varchar("vpnVerificationUrl", { length: 1000 }),
  isActive: int("isActive").notNull().default(1),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  projectIndex: index("project_test_environments_project_idx").on(table.projectId),
  projectNameUnique: uniqueIndex("project_test_environments_project_name_unique").on(table.projectId, table.name),
}));
export type ProjectTestEnvironment = typeof projectTestEnvironments.$inferSelect;

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
  responsibleUserId: int("responsibleUserId"),
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

export const qaTestPlans = mysqlTable("qa_test_plans", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  projectId: int("projectId").notNull(),
  sprintId: int("sprintId").notNull(),
  createdById: int("createdById").notNull(),
  responsibleUserId: int("responsibleUserId"),
  title: varchar("title", { length: 255 }).notNull(),
  userStory: longtext("userStory").notNull(),
  systemType: varchar("systemType", { length: 80 }).notNull(),
  criticality: varchar("criticality", { length: 40 }).notNull(),
  resultJson: longtext("resultJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  sprintIndex: index("qa_test_plans_sprint_idx").on(table.sprintId),
  projectIndex: index("qa_test_plans_project_idx").on(table.projectId),
  userIndex: index("qa_test_plans_user_idx").on(table.createdById),
  responsibleIndex: index("qa_test_plans_responsible_idx").on(table.responsibleUserId),
}));
export type QATestPlan = typeof qaTestPlans.$inferSelect;

// ─── Execuções automatizadas de QA ──────────────────────────────────────────
export const executionWorkers = mysqlTable("execution_workers", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 80 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  mode: mysqlEnum("mode", ["LOCAL", "REMOTE"]).notNull().default("LOCAL"),
  status: mysqlEnum("status", ["ONLINE", "OFFLINE", "PAUSED"]).notNull().default("ONLINE"),
  networkPool: mysqlEnum("networkPool", ["ANY", "PUBLIC", "COGEL", "SEFAZ", "OUTRA"]).notNull().default("ANY"),
  maxConcurrency: int("maxConcurrency").notNull().default(2),
  minFreeMemoryMb: int("minFreeMemoryMb").notNull().default(3072),
  maxCpuPercent: int("maxCpuPercent").notNull().default(75),
  endpointUrl: varchar("endpointUrl", { length: 1000 }),
  apiTokenEncrypted: text("apiTokenEncrypted"),
  currentPool: mysqlEnum("currentPool", ["PUBLIC", "COGEL", "SEFAZ", "OUTRA"]),
  freeMemoryMb: int("freeMemoryMb"),
  cpuPercent: int("cpuPercent"),
  lastHeartbeatAt: timestamp("lastHeartbeatAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  codeUnique: uniqueIndex("execution_workers_code_unique").on(table.code),
  statusIndex: index("execution_workers_status_idx").on(table.status),
  networkPoolIndex: index("execution_workers_network_pool_idx").on(table.networkPool),
}));
export type ExecutionWorker = typeof executionWorkers.$inferSelect;
export const testExecutions = mysqlTable("test_executions", {
  id: int("id").autoincrement().primaryKey(),
  externalExecutionId: varchar("externalExecutionId", { length: 128 }).notNull(),
  clientId: int("clientId"),
  projectId: int("projectId"),
  sprintId: int("sprintId"),
  createdById: int("createdById"),
  clientName: varchar("clientName", { length: 255 }),
  projectName: varchar("projectName", { length: 255 }).notNull(),
  sprintName: varchar("sprintName", { length: 255 }),
  systemUrl: varchar("systemUrl", { length: 1000 }),
  status: mysqlEnum("status", ["EM_ANDAMENTO", "PASSOU", "FALHOU", "BLOQUEADO", "ERRO_AUTOMACAO", "CANCELADO"]).notNull(),
  executionState: mysqlEnum("executionState", ["QUEUED", "RUNNING", "PAUSED", "FINISHED", "FAILED", "CANCELLED"]).notNull().default("QUEUED"),
  controlState: mysqlEnum("controlState", ["RUN", "PAUSE", "CANCEL"]).notNull().default("RUN"),
  controlRequestedAt: timestamp("controlRequestedAt"),
  controlRequestedById: int("controlRequestedById"),
  queuePool: mysqlEnum("queuePool", ["PUBLIC", "COGEL", "SEFAZ", "OUTRA"]).notNull().default("PUBLIC"),
  assignedWorkerId: int("assignedWorkerId"),
  dispatchPayloadEncrypted: longtext("dispatchPayloadEncrypted"),
  dispatchAttempts: int("dispatchAttempts").notNull().default(0),
  queuedAt: timestamp("queuedAt").defaultNow().notNull(),
  dispatchedAt: timestamp("dispatchedAt"),
  leaseExpiresAt: timestamp("leaseExpiresAt"),
  totalScenarios: int("totalScenarios").notNull().default(0),
  completedScenarios: int("completedScenarios").notNull().default(0),
  currentScenarioIndex: int("currentScenarioIndex"),
  currentScenarioId: varchar("currentScenarioId", { length: 160 }),
  currentScenarioTitle: varchar("currentScenarioTitle", { length: 500 }),
  currentEnvironment: varchar("currentEnvironment", { length: 160 }),
  currentStage: varchar("currentStage", { length: 80 }),
  progressMessage: varchar("progressMessage", { length: 1000 }),
  liveProgressJson: text("liveProgressJson"),
  lastHeartbeatAt: timestamp("lastHeartbeatAt"),
  passedScenarios: int("passedScenarios").notNull().default(0),
  failedScenarios: int("failedScenarios").notNull().default(0),
  blockedScenarios: int("blockedScenarios").notNull().default(0),
  automationErrors: int("automationErrors").notNull().default(0),
  flakyScenarios: int("flakyScenarios").notNull().default(0),
  inconclusiveScenarios: int("inconclusiveScenarios").notNull().default(0),
  coveragePercent: int("coveragePercent").notNull().default(0),
  defectsFound: int("defectsFound").notNull().default(0),
  criticalDefects: int("criticalDefects").notNull().default(0),
  escapedDefects: int("escapedDefects").notNull().default(0),
  evidenceDocxUrl: text("evidenceDocxUrl"),
  reliabilityReportUrl: text("reliabilityReportUrl"),
  regressionBundleId: varchar("regressionBundleId", { length: 64 }),
  startedAt: timestamp("startedAt"),
  finishedAt: timestamp("finishedAt"),
  rawPayload: longtext("rawPayload"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  externalExecutionUnique: uniqueIndex("test_executions_external_id_unique").on(table.externalExecutionId),
  projectIndex: index("test_executions_project_idx").on(table.projectId),
  sprintIndex: index("test_executions_sprint_idx").on(table.sprintId),
  createdByIndex: index("test_executions_created_by_idx").on(table.createdById),
  finishedAtIndex: index("test_executions_finished_at_idx").on(table.finishedAt),
  queueIndex: index("test_executions_queue_idx").on(table.executionState, table.queuePool, table.queuedAt),
  workerIndex: index("test_executions_worker_idx").on(table.assignedWorkerId, table.executionState),
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
  reliabilityStatus: mysqlEnum("reliabilityStatus", [
    "ESTAVEL",
    "FLAKY",
    "FALHA_REAL",
    "INCONCLUSIVO",
  ]).default("INCONCLUSIVO").notNull(),
  attempts: int("attempts").notNull().default(1),
  passedAttempts: int("passedAttempts").notNull().default(0),
  failedAttempts: int("failedAttempts").notNull().default(0),
  automationErrorAttempts: int("automationErrorAttempts").notNull().default(0),
  attemptsJson: text("attemptsJson"),
  regressionCodeUrl: text("regressionCodeUrl"),
  executedAt: timestamp("executedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  executionIndex: index("test_results_execution_idx").on(table.executionId),
  statusIndex: index("test_results_status_idx").on(table.status),
  reliabilityIndex: index("test_results_reliability_idx").on(table.reliabilityStatus),
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

// ─── Cards de defeito em Markdown ───────────────────────────────────────────
export const defectCards = mysqlTable("defect_cards", {
  id: int("id").autoincrement().primaryKey(),
  externalCardId: varchar("externalCardId", { length: 64 }).notNull(),
  externalExecutionId: varchar("externalExecutionId", { length: 128 }).notNull(),
  externalScenarioId: varchar("externalScenarioId", { length: 160 }).notNull(),
  clientId: int("clientId"),
  projectId: int("projectId"),
  sprintId: int("sprintId"),
  clientName: varchar("clientName", { length: 255 }),
  projectName: varchar("projectName", { length: 255 }).notNull(),
  sprintName: varchar("sprintName", { length: 255 }),
  systemUrl: varchar("systemUrl", { length: 1000 }),
  scenarioTitle: varchar("scenarioTitle", { length: 500 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  severity: mysqlEnum("severity", ["BAIXO", "MEDIO", "ALTO", "CRITICO"]).notNull(),
  status: mysqlEnum("status", [
    "ABERTO",
    "COPIADO",
    "RESOLVIDO",
    "REABERTO",
    "DESCARTADO",
  ]).default("ABERTO").notNull(),
  summary: text("summary").notNull(),
  expectedResult: text("expectedResult"),
  actualResult: text("actualResult").notNull(),
  reproductionSteps: text("reproductionSteps").notNull(),
  evidenceJson: text("evidenceJson"),
  markdown: text("markdown").notNull(),
  rawPayload: text("rawPayload"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  externalCardUnique: uniqueIndex("defect_cards_external_id_unique").on(table.externalCardId),
  executionIndex: index("defect_cards_execution_idx").on(table.externalExecutionId),
  projectIndex: index("defect_cards_project_idx").on(table.projectId),
  sprintIndex: index("defect_cards_sprint_idx").on(table.sprintId),
  severityIndex: index("defect_cards_severity_idx").on(table.severity),
  statusIndex: index("defect_cards_status_idx").on(table.status),
}));

export type DefectCard = typeof defectCards.$inferSelect;
export type InsertDefectCard = typeof defectCards.$inferInsert;

export const defectCardHistory = mysqlTable("defect_card_history", {
  id: int("id").autoincrement().primaryKey(),
  externalCardId: varchar("externalCardId", { length: 64 }).notNull(),
  fromStatus: mysqlEnum("fromStatus", [
    "ABERTO",
    "COPIADO",
    "RESOLVIDO",
    "REABERTO",
    "DESCARTADO",
  ]),
  toStatus: mysqlEnum("toStatus", [
    "ABERTO",
    "COPIADO",
    "RESOLVIDO",
    "REABERTO",
    "DESCARTADO",
  ]).notNull(),
  source: mysqlEnum("source", ["AGENTE", "USUARIO", "SISTEMA"]).notNull(),
  reason: varchar("reason", { length: 1000 }),
  changedById: int("changedById"),
  changedByName: varchar("changedByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  cardIndex: index("defect_card_history_card_idx").on(table.externalCardId),
  statusIndex: index("defect_card_history_status_idx").on(table.toStatus),
  createdAtIndex: index("defect_card_history_created_idx").on(table.createdAt),
}));

export type DefectCardHistory = typeof defectCardHistory.$inferSelect;
export type InsertDefectCardHistory = typeof defectCardHistory.$inferInsert;

// ─── Memória persistente do Agente QA ───────────────────────────────────────
export const qaAgentMemories = mysqlTable("qa_agent_memories", {
  id: int("id").autoincrement().primaryKey(),
  scopeKey: varchar("scopeKey", { length: 64 }).notNull(),
  fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  clientId: int("clientId"),
  projectId: int("projectId"),
  clientName: varchar("clientName", { length: 255 }),
  projectName: varchar("projectName", { length: 255 }).notNull(),
  systemHost: varchar("systemHost", { length: 255 }).notNull(),
  systemUrl: varchar("systemUrl", { length: 1000 }),
  sourceSprintId: int("sourceSprintId"),
  sourceSprintName: varchar("sourceSprintName", { length: 255 }),
  externalExecutionId: varchar("externalExecutionId", { length: 128 }),
  externalScenarioId: varchar("externalScenarioId", { length: 160 }),
  category: mysqlEnum("category", [
    "REGRA_NEGOCIO",
    "SELETOR",
    "RISCO",
    "DEFEITO",
    "AUTOMACAO",
    "OBSERVACAO",
  ]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  confidence: int("confidence").notNull().default(70),
  occurrences: int("occurrences").notNull().default(1),
  status: mysqlEnum("status", ["ATIVA", "ARQUIVADA"]).default("ATIVA").notNull(),
  firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  scopeFingerprintUnique: uniqueIndex("qa_agent_memory_scope_fingerprint_unique").on(
    table.scopeKey,
    table.fingerprint,
  ),
  scopeIndex: index("qa_agent_memory_scope_idx").on(table.scopeKey),
  projectIndex: index("qa_agent_memory_project_idx").on(table.projectId),
  sprintIndex: index("qa_agent_memory_sprint_idx").on(table.sourceSprintId),
  categoryIndex: index("qa_agent_memory_category_idx").on(table.category),
  statusIndex: index("qa_agent_memory_status_idx").on(table.status),
  lastSeenIndex: index("qa_agent_memory_last_seen_idx").on(table.lastSeenAt),
}));

export type QAAgentMemory = typeof qaAgentMemories.$inferSelect;
export type InsertQAAgentMemory = typeof qaAgentMemories.$inferInsert;
