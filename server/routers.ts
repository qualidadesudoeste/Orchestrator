import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { sdk } from "./_core/sdk";
import {
  createClient, createProject, createSprint,
  deleteClient, deleteProject, deleteSprint,
  getAllChecklists, getAllUsers,
  getChecklist, getChecklistsByAnalyst,
  getClients, getProjects, getSprints,
  updateClient, updateProject, updateSprint,
  upsertChecklist,
  updateChecklistResponsible,
  getProgressBySprints,
  getUserByUsername,
  getUserById,
  createLocalUser,
  updateLocalUser,
  deleteUser,
  updateLastSignedIn,
  getDashboardMetrics,
  listTestExecutionHistory,
  listExecutionQueue,
  controlTestExecution,
  getDefectCardHistory,
  updateDefectCardStatus,
  createPendingTestExecution,
  getTestExecutionProgress,
  markTestExecutionQueued,
  markTestExecutionStartFailure,
  listProjectTestEnvironments,
  getProjectTestEnvironment,
  createProjectTestEnvironment,
  updateProjectTestEnvironment,
  deleteProjectTestEnvironment,
  listVpnProfiles,
  getVpnProfile,
  createVpnProfile,
  updateVpnProfile,
  deleteVpnProfile,
  listAiProviderSettings,
  getAiProviderSetting,
  createAiProviderSetting,
  updateAiProviderSetting,
  deleteAiProviderSetting,
  ensureLocalExecutionWorker,
  getExecutionQueueOverview,
  updateExecutionWorkerSettings,
} from "./db";
import {
  getTrailProgress,
  upsertTrailProgress,
  getAllTrailProgress,
} from "./db";
import {
  insertQAPlanDocument,
  listQAPlanDocuments,
  getQAPlanDocument,
  deleteQAPlanDocument,
  insertQATestPlan,
  listQATestPlans,
  getQATestPlan,
  deleteQATestPlan,
  updateQATestPlanResponsible,
} from "./db";
import { invokeLLM, testLLMProviderConfig } from "./_core/llm";
import { storagePut } from "./storage";
import {
  DEFECT_CARD_STATUSES,
  DefectCardTransitionError,
} from "./defectCardLifecycleService";
import { ENV } from "./_core/env";
import {
  analyzeCoverageWithQaRules,
  buildRuleBasedPlan,
  enhancePlanWithQaRules,
} from "./qaScenarioRules";
import { indexProjectSource } from "./sourceCodeService";
import { decryptCredential, encryptCredential } from "./credentialCrypto";
import { assertCompatibleVpnRequirements, ensureVpnConnection, type VpnRequirement } from "./vpnService";
import { queuePoolForProvider, wakeExecutionQueue, type QueuedExecutionDispatchPayload } from "./executionQueueService";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao Administrador." });
  return next({ ctx });
});

function decodeVpnConfig(fileName: string | null | undefined, base64: string | null | undefined): string | null {
  if (!base64) return null;
  const normalizedName = String(fileName ?? "").trim();
  if (!/\.(?:conf|xml)$/i.test(normalizedName)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O arquivo da VPN deve possuir extensão .conf ou .xml." });
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O arquivo de configuração da VPN é inválido." });
  }
  if (buffer.length === 0 || buffer.length > 1024 * 1024) {
    throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "O arquivo de configuração da VPN deve possuir no máximo 1 MB." });
  }
  return buffer.toString("base64");
}

function validateVpnInstallerPair(installerUrl?: string | null, installerSha256?: string | null): void {
  if (Boolean(installerUrl) !== Boolean(installerSha256)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Informe juntos a URL oficial e o SHA-256 do instalador da VPN." });
  }
  if (installerUrl && !installerUrl.startsWith("https://")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A URL do instalador da VPN deve usar HTTPS." });
  }
  if (installerSha256 && !/^[a-f0-9]{64}$/i.test(installerSha256)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O SHA-256 do instalador deve possuir 64 caracteres hexadecimais." });
  }
}

async function vpnRequirementForEnvironment(environment: NonNullable<Awaited<ReturnType<typeof getProjectTestEnvironment>>>): Promise<VpnRequirement & { globalProfileId: number | null }> {
  if (environment.vpnProfileId) {
    const profile = await getVpnProfile(environment.vpnProfileId);
    if (!profile || !profile.isActive) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: `A VPN global associada ao ambiente ${environment.name} não existe ou está inativa.` });
    }
    return {
      provider: profile.provider,
      profileName: profile.profileName,
      username: profile.username,
      password: profile.passwordEncrypted ? decryptCredential(profile.passwordEncrypted) : null,
      autoConnect: Boolean(profile.autoConnect),
      targetUrl: environment.loginUrl,
      verificationUrl: profile.verificationUrl,
      connectionStrategy: profile.connectionStrategy,
      configFileName: profile.configFileName,
      configContent: profile.configEncrypted ? decryptCredential(profile.configEncrypted) : null,
      configPassword: profile.configPasswordEncrypted ? decryptCredential(profile.configPasswordEncrypted) : null,
      configImported: Boolean(profile.configImportedAt),
      installerUrl: profile.installerUrl,
      installerSha256: profile.installerSha256,
      globalProfileId: profile.id,
    };
  }
  return {
    provider: environment.vpnProvider,
    profileName: environment.vpnProfileName ?? "",
    username: environment.vpnUsername,
    password: environment.vpnPasswordEncrypted ? decryptCredential(environment.vpnPasswordEncrypted) : null,
    autoConnect: Boolean(environment.vpnAutoConnect),
    targetUrl: environment.loginUrl,
    verificationUrl: environment.vpnVerificationUrl,
    connectionStrategy: environment.vpnConnectionStrategy,
    configFileName: environment.vpnConfigFileName,
    configContent: environment.vpnConfigEncrypted ? decryptCredential(environment.vpnConfigEncrypted) : null,
    configPassword: environment.vpnConfigPasswordEncrypted ? decryptCredential(environment.vpnConfigPasswordEncrypted) : null,
    configImported: Boolean(environment.vpnConfigImportedAt),
    installerUrl: environment.vpnInstallerUrl,
    installerSha256: environment.vpnInstallerSha256,
    globalProfileId: null,
  };
}
const qaGeneratedCasesSchema = z.object({
  resumo: z.string().default(""),
  cobertura: z.object({
    funcional: z.array(z.string()).default([]),
    naoFuncional: z.array(z.string()).default([]),
    heuristicas: z.array(z.string()).default([]),
  }).default({ funcional: [], naoFuncional: [], heuristicas: [] }),
  cards: z.array(z.object({
    categoria: z.string().default("Casos de teste"),
    casos: z.array(z.object({
      id: z.string().default(""),
      titulo: z.string().default("Caso de teste"),
      prioridade: z.string().default("média"),
      dado: z.string().default(""),
      quando: z.string().default(""),
      entao: z.string().default(""),
      resultado_esperado: z.string().default(""),
      tipo: z.string().default("funcional"),
    })).default([]),
  })).default([]),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    login: publicProcedure
      .input(z.object({ username: z.string().min(1), password: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const user = await getUserByUsername(input.username);
        if (!user || !user.passwordHash) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos." });
        }
        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos." });
        }
        // Criar sessão JWT com userId como identificador
        const token = await sdk.signSession(
          { openId: `local:${user.id}`, appId: "qa-local", name: user.name ?? user.username ?? "" },
          { expiresInMs: 365 * 24 * 60 * 60 * 1000 }
        );
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, cookieOptions);
        await updateLastSignedIn(user.id);
        // Retornar usuário sem passwordHash
        const { passwordHash: _, ...safeUser } = user;
        return { success: true, user: safeUser };
      }),
    me: publicProcedure.query(opts => {
      if (!opts.ctx.user) return null;
      const { passwordHash: _, ...safeUser } = opts.ctx.user as any;
      return safeUser;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  users: router({
    options: protectedProcedure.query(async () => {
      const all = await getAllUsers();
      return all.map(user => ({ id: user.id, name: user.name, username: user.username }));
    }),
    list: adminProcedure.query(async () => {
      const all = await getAllUsers();
      return all.map(({ passwordHash: _, ...u }) => u);
    }),
    create: adminProcedure
      .input(z.object({
        username: z.string().min(3).max(64),
        password: z.string().min(6),
        name: z.string().min(1),
        email: z.string().email().optional(),
        role: z.enum(["user", "admin"]),
      }))
      .mutation(async ({ input }) => {
        const existing = await getUserByUsername(input.username);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "Nome de usuário já existe." });
        const passwordHash = await bcrypt.hash(input.password, 12);
        await createLocalUser({ ...input, passwordHash });
        return { success: true };
      }),
    update: adminProcedure
      .input(z.object({
        userId: z.number(),
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
        role: z.enum(["user", "admin"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const { userId, ...data } = input;
        // Proteger: não rebaixar o último admin
        if (data.role === "user") {
          const allUsers = await getAllUsers();
          const admins = allUsers.filter(u => u.role === "admin" && u.id !== userId);
          if (admins.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível rebaixar o único administrador do sistema." });
        }
        await updateLocalUser(userId, data);
        return { success: true };
      }),
    resetPassword: adminProcedure
      .input(z.object({ userId: z.number(), newPassword: z.string().min(6) }))
      .mutation(async ({ input }) => {
        const passwordHash = await bcrypt.hash(input.newPassword, 12);
        await updateLocalUser(input.userId, { passwordHash });
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode remover sua própria conta." });
        const target = await getUserById(input.userId);
        if (target?.role === "admin") {
          const allUsers = await getAllUsers();
          const admins = allUsers.filter(u => u.role === "admin");
          if (admins.length <= 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível remover o único administrador do sistema." });
        }
        await deleteUser(input.userId);
        return { success: true };
      }),
  }),
  parameters: router({
    vpnProfiles: adminProcedure.query(() => listVpnProfiles()),
    createVpnProfile: adminProcedure.input(z.object({
      name: z.string().trim().min(1).max(160), provider: z.enum(["COGEL", "SEFAZ", "OUTRA"]),
      profileName: z.string().trim().min(1).max(160), username: z.string().trim().max(320).optional(), password: z.string().max(512).optional(),
      autoConnect: z.boolean().default(true), connectionStrategy: z.enum(["AUTO", "CLI", "AUTOCONNECT"]).default("AUTO"),
      configFileName: z.string().trim().max(255).optional(), configBase64: z.string().max(1_500_000).optional(), configPassword: z.string().max(512).optional(),
      installerUrl: z.string().trim().url().max(2000).optional(), installerSha256: z.string().trim().max(64).optional(),
      verificationUrl: z.string().trim().url().max(1000).optional(), isActive: z.boolean().default(true),
    })).mutation(async ({ ctx, input }) => {
      const { password, configBase64, configPassword, autoConnect, isActive, ...data } = input;
      const configContent = decodeVpnConfig(data.configFileName, configBase64);
      validateVpnInstallerPair(data.installerUrl, data.installerSha256);
      const id = await createVpnProfile({ ...data, username: data.username || null, passwordEncrypted: password ? encryptCredential(password) : null,
        autoConnect: autoConnect ? 1 : 0, configEncrypted: configContent ? encryptCredential(configContent) : null,
        configPasswordEncrypted: configPassword ? encryptCredential(configPassword) : null, installerUrl: data.installerUrl || null,
        installerSha256: data.installerSha256?.toLowerCase() || null, verificationUrl: data.verificationUrl || null,
        isActive: isActive ? 1 : 0, createdById: ctx.user.id });
      return { success: true as const, id };
    }),
    updateVpnProfile: adminProcedure.input(z.object({
      id: z.number().int().positive(), name: z.string().trim().min(1).max(160).optional(), provider: z.enum(["COGEL", "SEFAZ", "OUTRA"]).optional(),
      profileName: z.string().trim().min(1).max(160).optional(), username: z.string().trim().max(320).nullable().optional(), password: z.string().max(512).nullable().optional(),
      autoConnect: z.boolean().optional(), connectionStrategy: z.enum(["AUTO", "CLI", "AUTOCONNECT"]).optional(),
      configFileName: z.string().trim().max(255).nullable().optional(), configBase64: z.string().max(1_500_000).nullable().optional(), configPassword: z.string().max(512).nullable().optional(), clearConfig: z.boolean().optional(),
      installerUrl: z.string().trim().url().max(2000).nullable().optional(), installerSha256: z.string().trim().max(64).nullable().optional(),
      verificationUrl: z.string().trim().url().max(1000).nullable().optional(), isActive: z.boolean().optional(),
    })).mutation(async ({ input }) => {
      const { id, password, configBase64, configPassword, clearConfig, autoConnect, isActive, ...data } = input;
      const configContent = configBase64 ? decodeVpnConfig(data.configFileName, configBase64) : null;
      validateVpnInstallerPair(data.installerUrl, data.installerSha256);
      await updateVpnProfile(id, { ...data,
        ...(password === undefined ? {} : { passwordEncrypted: password ? encryptCredential(password) : null }),
        ...(autoConnect === undefined ? {} : { autoConnect: autoConnect ? 1 : 0 }),
        ...(configBase64 === undefined ? {} : { configFileName: data.configFileName || null, configEncrypted: configContent ? encryptCredential(configContent) : null, configImportedAt: null }),
        ...(configPassword === undefined ? {} : { configPasswordEncrypted: configPassword ? encryptCredential(configPassword) : null }),
        ...(clearConfig ? { configFileName: null, configEncrypted: null, configPasswordEncrypted: null, configImportedAt: null } : {}),
        ...(data.installerSha256 === undefined ? {} : { installerSha256: data.installerSha256?.toLowerCase() || null }),
        ...(isActive === undefined ? {} : { isActive: isActive ? 1 : 0 }),
      }); return { success: true as const };
    }),
    deleteVpnProfile: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      try { await deleteVpnProfile(input.id); return { success: true as const }; }
      catch (error) { throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Não foi possível excluir a VPN." }); }
    }),
    testVpnProfile: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const profile = await getVpnProfile(input.id); if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "VPN não encontrada." });
      if (!profile.verificationUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a URL interna de validação antes de testar esta VPN." });
      try {
        const result = await ensureVpnConnection({ provider: profile.provider, profileName: profile.profileName, username: profile.username,
          password: profile.passwordEncrypted ? decryptCredential(profile.passwordEncrypted) : null, autoConnect: true,
          verificationUrl: profile.verificationUrl, targetUrl: profile.verificationUrl, connectionStrategy: profile.connectionStrategy,
          configFileName: profile.configFileName, configContent: profile.configEncrypted ? decryptCredential(profile.configEncrypted) : null,
          configPassword: profile.configPasswordEncrypted ? decryptCredential(profile.configPasswordEncrypted) : null,
          configImported: Boolean(profile.configImportedAt), installerUrl: profile.installerUrl, installerSha256: profile.installerSha256 });
        if (result.configurationImported) await updateVpnProfile(profile.id, { configImportedAt: new Date() }); return result;
      } catch (error) { throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Falha ao testar VPN." }); }
    }),
    executionQueue: adminProcedure.query(async () => {
      await ensureLocalExecutionWorker();
      const overview = await getExecutionQueueOverview();
      return {
        ...overview,
        workers: overview.workers.map(({ apiTokenEncrypted: _secret, ...worker }) => worker),
      };
    }),
    updateExecutionWorker: adminProcedure.input(z.object({
      id: z.number().int().positive(),
      name: z.string().trim().min(1).max(160).optional(),
      status: z.enum(["ONLINE", "OFFLINE", "PAUSED"]).optional(),
      networkPool: z.enum(["ANY", "PUBLIC", "COGEL", "SEFAZ", "OUTRA"]).optional(),
      maxConcurrency: z.number().int().min(1).max(20).optional(),
      minFreeMemoryMb: z.number().int().min(1024).max(131072).optional(),
      maxCpuPercent: z.number().int().min(20).max(95).optional(),
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateExecutionWorkerSettings(id, data);
      wakeExecutionQueue();
      return { success: true as const };
    }),    aiProviders: adminProcedure.query(() => listAiProviderSettings()),
    createAiProvider: adminProcedure.input(z.object({ name: z.string().trim().min(1).max(120), provider: z.enum(["OPENAI", "GEMINI", "GROQ", "CUSTOM"]), apiUrl: z.string().trim().url().max(1000), model: z.string().trim().min(1).max(255), apiKey: z.string().max(1000).optional(), isActive: z.boolean().default(true) })).mutation(async ({ ctx, input }) => {
      const { apiKey, isActive, ...data } = input; const id = await createAiProviderSetting({ ...data, apiKeyEncrypted: apiKey ? encryptCredential(apiKey) : null, isActive: isActive ? 1 : 0, createdById: ctx.user.id }); return { success: true as const, id };
    }),
    updateAiProvider: adminProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(120).optional(), provider: z.enum(["OPENAI", "GEMINI", "GROQ", "CUSTOM"]).optional(), apiUrl: z.string().trim().url().max(1000).optional(), model: z.string().trim().min(1).max(255).optional(), apiKey: z.string().max(1000).nullable().optional(), isActive: z.boolean().optional() })).mutation(async ({ input }) => {
      const { id, apiKey, isActive, ...data } = input; await updateAiProviderSetting(id, { ...data, ...(apiKey === undefined ? {} : { apiKeyEncrypted: apiKey ? encryptCredential(apiKey) : null }), ...(isActive === undefined ? {} : { isActive: isActive ? 1 : 0 }) }); return { success: true as const };
    }),
    deleteAiProvider: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => { await deleteAiProviderSetting(input.id); return { success: true as const }; }),
    testAiProvider: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const setting = await getAiProviderSetting(input.id); if (!setting) throw new TRPCError({ code: "NOT_FOUND", message: "Provedor não encontrado." });
      try { return await testLLMProviderConfig({ apiUrl: setting.apiUrl, apiKey: setting.apiKeyEncrypted ? decryptCredential(setting.apiKeyEncrypted) : "", model: setting.model }); }
      catch (error) { throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Falha ao testar API." }); }
    }),
  }),  clients: router({
    list: protectedProcedure.query(async () => getClients()),
    create: adminProcedure
      .input(z.object({ name: z.string().min(1), description: z.string().optional() }))
      .mutation(async ({ ctx, input }) => { await createClient({ ...input, createdById: ctx.user.id }); return { success: true }; }),
    update: adminProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).optional(), description: z.string().optional() }))
      .mutation(async ({ input }) => { const { id, ...data } = input; await updateClient(id, data); return { success: true }; }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => { await deleteClient(input.id); return { success: true }; }),
  }),
  projects: router({
    list: protectedProcedure
      .input(z.object({ clientId: z.number().optional() }))
      .query(async ({ input }) => getProjects(input.clientId)),
    create: adminProcedure
      .input(z.object({ name: z.string().min(1), description: z.string().optional(), clientId: z.number() }))
      .mutation(async ({ ctx, input }) => { await createProject({ ...input, createdById: ctx.user.id }); return { success: true }; }),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        repositoryUrl: z.string().trim().url().max(1000).nullable().optional(),
        repositoryBranch: z.string().trim().max(255).nullable().optional(),
        sourceCodePath: z.string().trim().max(1000).nullable().optional(),
      }))
      .mutation(async ({ input }) => { const { id, ...data } = input; await updateProject(id, data); return { success: true }; }),
    indexSource: adminProcedure
      .input(z.object({
        id: z.number().int().positive(),
        sourceCodePath: z.string().trim().min(1).max(1000),
      }))
      .mutation(async ({ input }) => {
        const project = (await getProjects()).find(item => item.id === input.id);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado." });
        try {
          const index = await indexProjectSource(input.sourceCodePath);
          await updateProject(input.id, {
            sourceCodePath: index.absolutePath,
            sourceCodeSummary: index.summary,
            sourceCodeFileCount: index.fileCount,
            sourceCodeIndexedAt: index.indexedAt,
          });
          return {
            success: true as const,
            sourceCodePath: index.absolutePath,
            fileCount: index.fileCount,
            analyzedFileCount: index.analyzedFileCount,
            indexedAt: index.indexedAt,
          };
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Não foi possível analisar o código-fonte.",
          });
        }
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => { await deleteProject(input.id); return { success: true }; }),
  }),
  testEnvironments: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .query(({ input }) => listProjectTestEnvironments(input.projectId)),
    create: adminProcedure
      .input(z.object({
        projectId: z.number().int().positive(),
        name: z.string().trim().min(1).max(120),
        type: z.enum(["PORTAL", "RETAGUARDA", "SITE", "API", "OUTRO"]),
        loginUrl: z.string().trim().url().max(1000),
        username: z.string().trim().max(320).optional(),
        password: z.string().max(512).optional(),
        vpnProfileId: z.number().int().positive().nullable().optional(),
        vpnProvider: z.enum(["NONE", "COGEL", "SEFAZ", "OUTRA"]).default("NONE"),
        vpnProfileName: z.string().trim().max(160).optional(),
        vpnUsername: z.string().trim().max(320).optional(),
        vpnPassword: z.string().max(512).optional(),
        vpnAutoConnect: z.boolean().default(true),
        vpnConnectionStrategy: z.enum(["AUTO", "CLI", "AUTOCONNECT"]).default("AUTO"),
        vpnConfigFileName: z.string().trim().max(255).optional(),
        vpnConfigBase64: z.string().max(1_500_000).optional(),
        vpnConfigPassword: z.string().max(512).optional(),
        vpnInstallerUrl: z.string().trim().url().max(2000).optional(),
        vpnInstallerSha256: z.string().trim().max(64).optional(),
        vpnVerificationUrl: z.string().trim().url().max(1000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { password, vpnPassword, vpnAutoConnect, vpnConfigBase64, vpnConfigPassword, ...data } = input;
        const vpnConfigContent = decodeVpnConfig(data.vpnConfigFileName, vpnConfigBase64);
        validateVpnInstallerPair(data.vpnInstallerUrl, data.vpnInstallerSha256);
        if (data.vpnProvider !== "NONE" && !data.vpnProfileName) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o nome do perfil configurado no FortiClient." });
        }
        const id = await createProjectTestEnvironment({
          ...data,
          username: data.username || null,
          passwordEncrypted: password ? encryptCredential(password) : null,
          vpnProfileName: data.vpnProvider === "NONE" ? null : data.vpnProfileName || null,
          vpnUsername: data.vpnProvider === "NONE" ? null : data.vpnUsername || null,
          vpnPasswordEncrypted: data.vpnProvider !== "NONE" && vpnPassword ? encryptCredential(vpnPassword) : null,
          vpnAutoConnect: vpnAutoConnect ? 1 : 0,
          vpnConfigEncrypted: data.vpnProvider !== "NONE" && vpnConfigContent ? encryptCredential(vpnConfigContent) : null,
          vpnConfigPasswordEncrypted: data.vpnProvider !== "NONE" && vpnConfigPassword ? encryptCredential(vpnConfigPassword) : null,
          vpnConfigImportedAt: null,
          vpnInstallerUrl: data.vpnProvider === "NONE" ? null : data.vpnInstallerUrl || null,
          vpnInstallerSha256: data.vpnProvider === "NONE" ? null : data.vpnInstallerSha256?.toLowerCase() || null,
          vpnVerificationUrl: data.vpnProvider === "NONE" ? null : data.vpnVerificationUrl || null,
          createdById: ctx.user.id,
        });
        return { success: true as const, id };
      }),
    update: adminProcedure
      .input(z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1).max(120).optional(),
        type: z.enum(["PORTAL", "RETAGUARDA", "SITE", "API", "OUTRO"]).optional(),
        loginUrl: z.string().trim().url().max(1000).optional(),
        username: z.string().trim().max(320).nullable().optional(),
        password: z.string().max(512).nullable().optional(),
        vpnProfileId: z.number().int().positive().nullable().optional(),
        vpnProvider: z.enum(["NONE", "COGEL", "SEFAZ", "OUTRA"]).optional(),
        vpnProfileName: z.string().trim().max(160).nullable().optional(),
        vpnUsername: z.string().trim().max(320).nullable().optional(),
        vpnPassword: z.string().max(512).nullable().optional(),
        vpnAutoConnect: z.boolean().optional(),
        vpnConnectionStrategy: z.enum(["AUTO", "CLI", "AUTOCONNECT"]).optional(),
        vpnConfigFileName: z.string().trim().max(255).nullable().optional(),
        vpnConfigBase64: z.string().max(1_500_000).nullable().optional(),
        vpnConfigPassword: z.string().max(512).nullable().optional(),
        clearVpnConfig: z.boolean().optional(),
        vpnInstallerUrl: z.string().trim().url().max(2000).nullable().optional(),
        vpnInstallerSha256: z.string().trim().max(64).nullable().optional(),
        vpnVerificationUrl: z.string().trim().url().max(1000).nullable().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, password, vpnPassword, vpnAutoConnect, vpnConfigBase64, vpnConfigPassword, clearVpnConfig, isActive, ...data } = input;
        const vpnConfigContent = vpnConfigBase64 ? decodeVpnConfig(data.vpnConfigFileName, vpnConfigBase64) : null;
        validateVpnInstallerPair(data.vpnInstallerUrl, data.vpnInstallerSha256);
        const disablingVpn = data.vpnProvider === "NONE";
        await updateProjectTestEnvironment(id, {
          ...data,
          ...(password === undefined ? {} : { passwordEncrypted: password ? encryptCredential(password) : null }),
          ...(vpnPassword === undefined ? {} : { vpnPasswordEncrypted: vpnPassword ? encryptCredential(vpnPassword) : null }),
          ...(vpnAutoConnect === undefined ? {} : { vpnAutoConnect: vpnAutoConnect ? 1 : 0 }),
          ...(vpnConfigBase64 === undefined ? {} : {
            vpnConfigFileName: data.vpnConfigFileName || null,
            vpnConfigEncrypted: vpnConfigContent ? encryptCredential(vpnConfigContent) : null,
            vpnConfigImportedAt: null,
          }),
          ...(vpnConfigPassword === undefined ? {} : { vpnConfigPasswordEncrypted: vpnConfigPassword ? encryptCredential(vpnConfigPassword) : null }),
          ...(clearVpnConfig ? { vpnConfigFileName: null, vpnConfigEncrypted: null, vpnConfigPasswordEncrypted: null, vpnConfigImportedAt: null } : {}),
          ...(data.vpnInstallerSha256 === undefined ? {} : { vpnInstallerSha256: data.vpnInstallerSha256?.toLowerCase() || null }),
          ...(isActive === undefined ? {} : { isActive: isActive ? 1 : 0 }),
          ...(disablingVpn ? {
            vpnProfileName: null,
            vpnUsername: null,
            vpnPasswordEncrypted: null,
            vpnConnectionStrategy: "AUTO",
            vpnConfigFileName: null,
            vpnConfigEncrypted: null,
            vpnConfigPasswordEncrypted: null,
            vpnConfigImportedAt: null,
            vpnInstallerUrl: null,
            vpnInstallerSha256: null,
            vpnVerificationUrl: null,
          } : {}),
        });
        return { success: true as const };
      }),
    prepareVpn: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const environment = await getProjectTestEnvironment(input.id);
        if (!environment) throw new TRPCError({ code: "NOT_FOUND", message: "Ambiente não encontrado." });
        const requirement = await vpnRequirementForEnvironment(environment);
        if (requirement.provider === "NONE") throw new TRPCError({ code: "BAD_REQUEST", message: "Este ambiente não utiliza VPN." });
        try {
          const result = await ensureVpnConnection(requirement);
          if (result.configurationImported) {
            if (requirement.globalProfileId) await updateVpnProfile(requirement.globalProfileId, { configImportedAt: new Date() });
            else await updateProjectTestEnvironment(environment.id, { vpnConfigImportedAt: new Date() });
          }
          return result;
        } catch (error) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Não foi possível preparar a VPN." });
        }
      }),    delete: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        await deleteProjectTestEnvironment(input.id);
        return { success: true as const };
      }),
  }),
  sprints: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number().optional() }))
      .query(async ({ input }) => getSprints(input.projectId)),
    create: adminProcedure
      .input(z.object({ name: z.string().min(1), description: z.string().optional(), projectId: z.number() }))
      .mutation(async ({ ctx, input }) => { await createSprint({ ...input, createdById: ctx.user.id }); return { success: true }; }),
    update: adminProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).optional(), description: z.string().optional(), status: z.enum(["pending", "in_progress", "in_review", "done"]).optional() }))
      .mutation(async ({ input }) => { const { id, ...data } = input; await updateSprint(id, data); return { success: true }; }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => { await deleteSprint(input.id); return { success: true }; }),
  }),
  dashboard: router({
    metrics: protectedProcedure
      .input(z.object({
        clientId: z.number().optional(),
        projectId: z.number().optional(),
        sprintId: z.number().optional(),
      }))
      .query(async ({ input }) => getDashboardMetrics(input)),
  }),
  testExecutions: router({
    queue: protectedProcedure
      .input(z.object({
        state: z.enum(["ALL", "QUEUED", "RUNNING", "PAUSED", "FINISHED", "FAILED", "CANCELLED"]).default("ALL"),
        pool: z.enum(["PUBLIC", "COGEL", "SEFAZ", "OUTRA"]).optional(),
        limit: z.number().int().min(1).max(200).default(100),
      }))
      .query(({ ctx, input }) => listExecutionQueue({
        userId: ctx.user.id,
        isAdmin: ctx.user.role === "admin",
        state: input.state,
        pool: input.pool,
        limit: input.limit,
      })),    control: protectedProcedure
      .input(z.object({
        externalExecutionId: z.string().trim().min(1).max(128),
        action: z.enum(["PAUSE", "RESUME", "CANCEL"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await controlTestExecution({
          ...input,
          userId: ctx.user.id,
          isAdmin: ctx.user.role === "admin",
        });
        if (result.outcome === "NOT_FOUND") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Execução não encontrada." });
        }
        if (result.outcome === "FORBIDDEN") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Somente quem iniciou a execução ou um administrador pode controlá-la." });
        }
        if (result.outcome === "TERMINAL") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Esta execução já foi finalizada e não pode mais ser alterada." });
        }
        if (input.action === "RESUME") wakeExecutionQueue();
        return { success: true as const, ...result };
      }),
    progress: protectedProcedure
      .input(z.object({ externalExecutionId: z.string().trim().min(1).max(128) }))
      .query(async ({ ctx, input }) => {
        const progress = await getTestExecutionProgress({
          externalExecutionId: input.externalExecutionId,
          userId: ctx.user.id,
          isAdmin: ctx.user.role === "admin",
        });
        if (!progress) throw new TRPCError({ code: "NOT_FOUND", message: "Execução não encontrada." });
        return progress;
      }),
    history: protectedProcedure
      .input(z.object({
        clientId: z.number().int().positive().optional(),
        projectId: z.number().int().positive().optional(),
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        limit: z.number().int().min(1).max(200).default(100),
      }))
      .query(async ({ ctx, input }) => {
        const dateFrom = input.dateFrom
          ? new Date(`${input.dateFrom}T00:00:00`)
          : undefined;
        const dateTo = input.dateTo
          ? new Date(`${input.dateTo}T23:59:59.999`)
          : undefined;
        return listTestExecutionHistory({
          userId: ctx.user.id,
          isAdmin: ctx.user.role === "admin",
          clientId: input.clientId,
          projectId: input.projectId,
          dateFrom,
          dateTo,
          limit: input.limit,
        });
      }),
  }),
  defectCards: router({
    history: protectedProcedure
      .input(z.object({ externalCardId: z.string().min(1).max(64) }))
      .query(async ({ input }) =>
        getDefectCardHistory(input.externalCardId.toUpperCase()),
      ),
    updateStatus: protectedProcedure
      .input(z.object({
        externalCardId: z.string().min(1).max(64),
        status: z.enum(DEFECT_CARD_STATUSES),
        reason: z.string().trim().max(1000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const card = await updateDefectCardStatus({
            externalCardId: input.externalCardId.toUpperCase(),
            status: input.status,
            reason: input.reason,
            changedById: ctx.user.id,
            changedByName: ctx.user.name ?? ctx.user.username ?? "Usuário",
            source: "USUARIO",
          });
          if (!card) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Card de defeito não encontrado.",
            });
          }
          return card;
        } catch (error) {
          if (error instanceof DefectCardTransitionError) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: error.message,
            });
          }
          throw error;
        }
      }),
  }),
  checklists: router({
    get: protectedProcedure
      .input(z.object({ sprintId: z.number() }))
      .query(async ({ ctx, input }) => {
        const result = await getChecklist(input.sprintId, ctx.user.id);
        return result ?? null;
      }),
    save: protectedProcedure
      .input(z.object({
        sprintId: z.number(),
        checkedItems: z.string(),
        totalItems: z.number(),
        completedItems: z.number(),
        status: z.enum(["in_progress", "completed"]),
        completedAt: z.date().optional().nullable(),
        responsibleUserId: z.number().int().positive().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const responsibleUserId = input.responsibleUserId ?? ctx.user.id;
        if (!(await getUserById(responsibleUserId))) throw new TRPCError({ code: "BAD_REQUEST", message: "Responsável não encontrado." });
        const id = await upsertChecklist({ ...input, analystId: ctx.user.id, responsibleUserId });
        return { success: true, id };
      }),
    updateResponsible: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), responsibleUserId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        if (!(await getUserById(input.responsibleUserId))) throw new TRPCError({ code: "BAD_REQUEST", message: "Responsável não encontrado." });
        await updateChecklistResponsible(input.id, input.responsibleUserId);
        return { success: true };
      }),
    myHistory: protectedProcedure.query(async ({ ctx }) => getChecklistsByAnalyst(ctx.user.id)),
    allHistory: adminProcedure.query(async () => getAllChecklists()),
    progressBySprints: protectedProcedure.query(async ({ ctx }) => getProgressBySprints(ctx.user.id)),
  }),
  trail: router({
    myProgress: protectedProcedure.query(async ({ ctx }) => {
      const result = await getTrailProgress(ctx.user.id);
      return result ?? null;
    }),
    saveProgress: protectedProcedure
      .input(z.object({ completedTopics: z.array(z.string()) }))
      .mutation(async ({ ctx, input }) => {
        await upsertTrailProgress(ctx.user.id, input.completedTopics);
        return { success: true };
      }),
    allProgress: adminProcedure.query(async () => getAllTrailProgress()),
  }),

  qaPlanner: router({
    savePlan: protectedProcedure
      .input(z.object({
        projectId: z.number().int().positive(),
        sprintId: z.number().int().positive(),
        userStory: z.string().min(10).max(2_000_000, "A História de Usuário deve possuir no máximo 2 milhões de caracteres."),
        systemType: z.string().trim().min(1).max(80),
        criticality: z.enum(["low", "medium", "high", "critical"]),
        result: qaGeneratedCasesSchema,
      }))
      .mutation(async ({ ctx, input }) => {
        const project = (await getProjects()).find(item => item.id === input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado." });
        const sprint = (await getSprints(input.projectId)).find(item => item.id === input.sprintId);
        if (!sprint) throw new TRPCError({ code: "BAD_REQUEST", message: "A sprint não pertence ao projeto selecionado." });
        const firstLine = input.userStory.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? "Plano de testes";
        const id = await insertQATestPlan({
          clientId: project.clientId,
          projectId: project.id,
          sprintId: sprint.id,
          createdById: ctx.user.id,
          responsibleUserId: ctx.user.id,
          title: firstLine.replace(/^#+\s*/, "").slice(0, 255),
          userStory: input.userStory,
          systemType: input.systemType,
          criticality: input.criticality,
          resultJson: JSON.stringify(input.result),
        });
        return { id, projectId: project.id, sprintId: sprint.id };
      }),

    listPlans: protectedProcedure
      .input(z.object({
        projectId: z.number().int().positive().optional(),
        sprintId: z.number().int().positive().optional(),
      }))
      .query(({ input }) => listQATestPlans({
        projectId: input.projectId,
        sprintId: input.sprintId,
      })),

    updatePlanResponsible: protectedProcedure
      .input(z.object({
        id: z.number().int().positive(),
        responsibleUserId: z.number().int().positive(),
      }))
      .mutation(async ({ input }) => {
        const [plan, responsible] = await Promise.all([
          getQATestPlan(input.id),
          getUserById(input.responsibleUserId),
        ]);
        if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plano não encontrado." });
        if (!responsible) throw new TRPCError({ code: "BAD_REQUEST", message: "Responsável não encontrado." });
        await updateQATestPlanResponsible(input.id, input.responsibleUserId);
        return { success: true };
      }),

    deletePlan: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const plan = await getQATestPlan(input.id);
        if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plano não encontrado." });
        if (plan.createdById !== ctx.user.id && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await deleteQATestPlan(input.id);
        return { success: true };
      }),

    // ── Gerar casos de teste via IA ───────────────────────────────────────────
    generateCases: protectedProcedure
      .input(z.object({
        userStory: z.string().min(10),
        systemType: z.string().default("web"),
        criticality: z.enum(["low", "medium", "high", "critical"]).default("medium"),
        projectId: z.number().int().positive().optional(),
        projectContext: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const critMap: Record<string, string> = {
          low: "baixa",
          medium: "média",
          high: "alta",
          critical: "crítica",
        };
        // Truncar input para evitar respostas gigantescas que causam truncamento do JSON
        const MAX_HU_CHARS = 4000;
        const truncatedStory = input.userStory.length > MAX_HU_CHARS
          ? input.userStory.substring(0, MAX_HU_CHARS) + "\n\n[... HU truncada para processamento. Gere casos com base no contexto acima.]"
          : input.userStory;

        const project = input.projectId
          ? (await getProjects()).find(item => item.id === input.projectId)
          : undefined;
        const projectEnvironments = project
          ? await listProjectTestEnvironments(project.id)
          : [];
        const sourceContext = project?.sourceCodeSummary?.slice(0, 12_000) ?? "";

        const systemPrompt = `Você é um especialista em Quality Assurance. Analise a História de Usuário e gere casos de teste BDD (Dado/Quando/Então).
Seja conciso: máximo 3 categorias, máximo 4 casos por categoria (total máximo: 12 casos).
Campos de texto devem ter no máximo 120 caracteres cada.
Quando houver um índice de código-fonte, use rotas, campos e seletores para tornar os passos concretos. Não invente comportamento ausente da HU.
Para sistemas web, gere prioritariamente cenários E2E observáveis e executáveis pela interface. Não transforme detalhes internos como transações, rollback, escritas em banco, injeção de falha ou códigos HTTP em cenários de interface, exceto quando a HU descrever como observar esse resultado na tela.
Cada cenário deve declarar no Dado todas as pré-condições e dados necessários. Não presuma uma segunda conta, perfil especial, processo preparado ou mecanismo de falha que não tenha sido informado na HU.
Retorne somente um objeto JSON válido, sem Markdown.`;

        const userMessage = `HU: ${truncatedStory}
Sistema: ${input.systemType} | Criticidade: ${critMap[input.criticality] || input.criticality}${input.projectContext ? ` | Contexto: ${input.projectContext}` : ""}
${sourceContext ? `\nÍNDICE TÉCNICO DO PROJETO:\n${sourceContext}` : ""}`;
        const environmentContext = projectEnvironments.length
          ? `\nAMBIENTES DISPONÍVEIS: ${projectEnvironments.map(item => `${item.name} (${item.type})`).join(", ")}. Quando um cenário depender de mais de um ambiente, mencione explicitamente o nome do ambiente em cada passo.`
          : "";

        // Schema JSON estruturado para garantir saída válida sem markdown
        const outputSchema = {
          name: "qa_cases",
          strict: true,
          schema: {
            type: "object",
            properties: {
              resumo: { type: "string" },
              cobertura: {
                type: "object",
                properties: {
                  funcional: { type: "array", items: { type: "string" } },
                  naoFuncional: { type: "array", items: { type: "string" } },
                  heuristicas: { type: "array", items: { type: "string" } },
                },
                required: ["funcional", "naoFuncional", "heuristicas"],
                additionalProperties: false,
              },
              cards: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    categoria: { type: "string" },
                    casos: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          titulo: { type: "string" },
                          prioridade: { type: "string", enum: ["alta", "média", "baixa"] },
                          dado: { type: "string" },
                          quando: { type: "string" },
                          entao: { type: "string" },
                          resultado_esperado: { type: "string" },
                          tipo: { type: "string", enum: ["funcional", "segurança", "performance", "usabilidade", "regressão"] },
                        },
                        required: ["id", "titulo", "prioridade", "dado", "quando", "entao", "resultado_esperado", "tipo"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["categoria", "casos"],
                  additionalProperties: false,
                },
              },
            },
            required: ["resumo", "cobertura", "cards"],
            additionalProperties: false,
          },
        };

        try {
          const response = await invokeLLM({
            model: ENV.llmModel,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage + environmentContext },
            ],
            // O plano possui no máximo 12 casos concisos. Esse limite reduz
            // latência e mantém a chamada dentro das cotas gratuitas usuais.
            maxTokens: 4096,
            response_format: {
              type: "json_schema",
              json_schema: outputSchema,
            },
          });

          const content = response.choices?.[0]?.message?.content ?? "";
          const raw = String(content).trim();
          if (!raw) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IA retornou resposta vazia. Tente novamente." });

          // json_schema garante JSON puro, mas mantemos fallback
          const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
          const jsonStr = stripped.startsWith("{") ? stripped : (stripped.match(/(\{[\s\S]*\})/)?.[1] ?? "");
          if (!jsonStr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IA retornou resposta inválida. Tente novamente." });
          const parsed = qaGeneratedCasesSchema.parse(JSON.parse(jsonStr));
          const totalCases = parsed.cards.reduce(
            (total, card) => total + card.casos.length,
            0
          );
          if (totalCases === 0) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "A IA não retornou casos de teste no formato esperado. Tente gerar novamente.",
            });
          }
          return enhancePlanWithQaRules(parsed, {
            userStory: input.userStory,
            systemType: input.systemType,
            criticality: input.criticality,
          });
        } catch (err: any) {
          console.error("[qaPlanner.generateCases] Error:", err?.message);
          return buildRuleBasedPlan({
            userStory: input.userStory,
            systemType: input.systemType,
            criticality: input.criticality,
          });
        }
      }),

    // ── Gerar documento LaTeX/PDF de evidências ───────────────────────────────
    startAutomatedTests: protectedProcedure
      .input(z.object({
        projectId: z.number().int().positive(),
        sprintId: z.number().int().positive(),
        environmentId: z.number().int().positive().optional(),
        environmentIds: z.array(z.number().int().positive()).min(1).max(5).optional(),
        systemUrl: z.string().trim().url().max(2048).refine(
          value => value.startsWith("http://") || value.startsWith("https://"),
          "A URL deve começar com http:// ou https://.",
        ).optional(),
        username: z.string().trim().min(1).max(256).optional(),
        password: z.string().min(1).max(512).optional(),
        cases: z.array(z.object({
          id: z.string().max(120),
          titulo: z.string().min(1).max(500),
          prioridade: z.string().max(30),
          dado: z.string().min(1).max(3000),
          quando: z.string().min(1).max(3000),
          entao: z.string().min(1).max(3000),
          resultado_esperado: z.string().max(3000),
          tipo: z.string().max(80),
        })).min(1).max(100),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ENV.n8nQaWebhookUrl || !ENV.qaAgentApiToken) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "A execução automática ainda não está configurada no servidor.",
          });
        }

        const [projects, sprints, clients] = await Promise.all([
          getProjects(),
          getSprints(input.projectId),
          getClients(),
        ]);
        const project = projects.find(item => item.id === input.projectId);
        const sprint = sprints.find(item => item.id === input.sprintId);
        if (!project || !sprint || sprint.projectId !== project.id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Projeto ou sprint inválidos.",
          });
        }
        const client = clients.find(item => item.id === project.clientId);
        const requestedEnvironmentIds = input.environmentIds ?? (input.environmentId ? [input.environmentId] : []);
        const environments = await Promise.all(requestedEnvironmentIds.map(id => getProjectTestEnvironment(id)));
        if (environments.some(item => !item || item.projectId !== project.id)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Um dos ambientes não pertence ao projeto selecionado." });
        }
        if (environments.some(item => !item?.isActive)) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Um dos ambientes selecionados está inativo." });
        }
        const configuredEnvironments = environments.filter((item): item is NonNullable<typeof item> => Boolean(item));
        const primaryEnvironment = configuredEnvironments[0];
        const systemUrl = primaryEnvironment?.loginUrl ?? input.systemUrl;
        const username = primaryEnvironment?.username ?? input.username ?? "";
        const password = primaryEnvironment?.passwordEncrypted
          ? decryptCredential(primaryEnvironment.passwordEncrypted)
          : input.password ?? "";
        if (!systemUrl) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione um ambiente parametrizado." });
        }
        const executionId = `web-${Date.now()}-${randomUUID().slice(0, 8)}`;
        const scenariosGherkin = input.cases.map(testCase => [
          `Cenário: ${testCase.titulo}`,
          `  Dado ${testCase.dado}`,
          `  Quando ${testCase.quando}`,
          `  Então ${testCase.entao}`,
          `  # Resultado esperado: ${testCase.resultado_esperado}`,
          `  # ID: ${testCase.id} | Tipo: ${testCase.tipo} | Prioridade: ${testCase.prioridade}`,
        ].join("\n")).join("\n\n");

        const vpnRequirements = await Promise.all(configuredEnvironments.map(vpnRequirementForEnvironment));
        try {
          assertCompatibleVpnRequirements(vpnRequirements);
        } catch (error) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: error instanceof Error ? error.message : "Os ambientes exigem VPNs incompativeis.",
          });
        }
        const requiredRequirement = vpnRequirements.find(item => item.provider !== "NONE") ?? null;
        const queuePool = queuePoolForProvider(requiredRequirement?.provider);
        const dispatchPayload: QueuedExecutionDispatchPayload = {
          vpnRequirement: requiredRequirement,
          webhookBody: {
            execution_id: executionId,
            projeto: project.name,
            cliente: client?.name ?? "",
            sprint: sprint.name,
            ambiente: primaryEnvironment?.name ?? "Manual",
            ambiente_tipo: primaryEnvironment?.type ?? "OUTRO",
            ambiente_sem_autenticacao: !username || !password,
            ambientes: configuredEnvironments.map((item, index) => ({
              id: item.id,
              nome: item.name,
              tipo: item.type,
              url: item.loginUrl,
              usuario: item.username ?? "",
              senha: item.passwordEncrypted ? decryptCredential(item.passwordEncrypted) : "",
              sem_autenticacao: !item.username || !item.passwordEncrypted,
              vpn_provedor: vpnRequirements[index]?.provider ?? "NONE",
              vpn_perfil: vpnRequirements[index]?.profileName ?? "",
            })),
            sistema_url: systemUrl,
            login_usuario: username,
            login_senha: password,
            cenarios_gherkin: scenariosGherkin,
            repositorio_codigo: project.repositoryUrl ?? "",
            branch_repositorio: project.repositoryBranch ?? "",
            contexto_codigo_fonte: project.sourceCodeSummary?.slice(0, 14_000) ?? "",
            solicitado_por: ctx.user.id,
          },
        };

        await createPendingTestExecution({
          externalExecutionId: executionId,
          createdById: ctx.user.id,
          clientId: client?.id,
          projectId: project.id,
          sprintId: sprint.id,
          clientName: client?.name,
          projectName: project.name,
          sprintName: sprint.name,
          systemUrl,
          totalScenarios: input.cases.length,
          queuePool,
          dispatchPayloadEncrypted: encryptCredential(JSON.stringify(dispatchPayload)),
        });
        await markTestExecutionQueued(
          executionId,
          `Execucao adicionada a fila ${queuePool}. Aguardando vaga no worker.`,
        );
        wakeExecutionQueue();
        return {
          started: true as const,
          queued: true as const,
          queuePool,
          executionId,
          totalScenarios: input.cases.length,
        };
      }),

    generateDocument: protectedProcedure
      .input(z.object({
        projectName: z.string().min(1),
        clientName: z.string().optional(),
        sprintName: z.string().optional(),
        version: z.string().optional(),
        redator: z.string().optional(),
        sprintObjective: z.string().optional(),
        testScope: z.string().optional(),
        scenarios: z.array(z.object({
          id: z.string(),
          title: z.string(),
          bdd: z.string().optional(),
          evidence: z.string().optional(),
          images: z.array(z.object({
            url: z.string(),
            key: z.string().optional(),
            filename: z.string().optional(),
          })).optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const date = new Date().toLocaleDateString("pt-BR");
        const escape = (s?: string) =>
          (s ?? "").replace(/[&%$#_{}~^\\]/g, c => `\\${c}`).replace(/\[/g, "{[}").replace(/\]/g, "{]}");

        const scenariosLatex = input.scenarios.map((s, i) => {
          const images = (s.images ?? []).map(img => {
            // Para imagens no S3 do Manus, não conseguimos incluir diretamente no LaTeX
            // Incluímos uma nota com a URL
            return `\\textit{Evidência visual disponível em: ${escape(img.url)}}`;
          }).join("\n\n");

          return `\\subsection*{Cenário ${i + 1}: ${escape(s.title)}}
${s.bdd ? `\\textbf{Passos BDD:}\n\\begin{verbatim}\n${s.bdd}\n\\end{verbatim}` : ""}
${s.evidence ? `\\textbf{Resultado Observado:} ${escape(s.evidence)}\n` : ""}
${images}
\\vspace{0.5cm}`;
        }).join("\n\n");

        const texContent = `\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[brazil]{babel}
\\usepackage{geometry}
\\usepackage{fancyhdr}
\\usepackage{titlesec}
\\usepackage{xcolor}
\\usepackage{hyperref}
\\usepackage{parskip}
\\geometry{margin=2.5cm}
\\definecolor{qagreen}{RGB}{22,163,74}
\\pagestyle{fancy}
\\fancyhf{}
\\rhead{\\textcolor{qagreen}{${escape(input.projectName)}}}
\\lhead{Evidências de Teste}
\\rfoot{\\thepage}
\\lfoot{${date}}

\\begin{document}

\\begin{center}
{\\LARGE \\textbf{\\textcolor{qagreen}{Evidências de Teste}}}\\\\[0.5cm]
{\\large ${escape(input.projectName)}}\\\\[0.2cm]
${input.clientName ? `{\\normalsize Cliente: ${escape(input.clientName)}}\\\\[0.2cm]` : ""}
${input.sprintName ? `{\\normalsize Sprint: ${escape(input.sprintName)}}\\\\[0.1cm]` : ""}
${input.version ? `{\\normalsize Versão: ${escape(input.version)}}\\\\[0.1cm]` : ""}
{\\normalsize Data: ${date}}\\\\[0.1cm]
${input.redator ? `{\\normalsize Redator: ${escape(input.redator)}}` : ""}
\\end{center}

\\hrule
\\vspace{1cm}

${input.sprintObjective ? `\\section*{Objetivo da Sprint}\n${escape(input.sprintObjective)}\n` : ""}
${input.testScope ? `\\section*{Escopo dos Testes}\n${escape(input.testScope)}\n` : ""}

\\section*{Cenários Testados}

${scenariosLatex}

\\end{document}`;

        const baseName = `evidencias_${input.projectName.replace(/\s+/g, "_")}_${Date.now()}`;
        const texKey = `qa-docs/${baseName}.tex`;
        const { url: texUrl } = await storagePut(texKey, texContent, "text/plain; charset=utf-8");

        const docId = await insertQAPlanDocument({
          createdById: ctx.user.id,
          projectName: input.projectName,
          clientName: input.clientName,
          sprintName: input.sprintName,
          version: input.version,
          redator: input.redator,
          baseName,
          texStorageKey: texKey,
          texUrl,
          pdfError: "PDF não disponível (compilação LaTeX não suportada no servidor cloud). Baixe o .tex e compile no Overleaf.",
          projectJson: JSON.stringify(input),
        });

        return {
          id: docId,
          texUrl,
          pdfUrl: null,
          pdfError: "Baixe o arquivo .tex e compile no Overleaf (overleaf.com) para obter o PDF.",
        };
      }),

    // ── Analisar cobertura dos cenários gerados vs. requisitos da HU ────────────
    analyzeCoverage: protectedProcedure
      .input(z.object({
        userStory: z.string().min(10),
        generatedCases: z.array(z.object({
          id: z.string(),
          titulo: z.string(),
          prioridade: z.string(),
          dado: z.string(),
          quando: z.string(),
          entao: z.string(),
          resultado_esperado: z.string(),
          tipo: z.string(),
        })),
        projectContext: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const casesText = input.generatedCases.map((c, i) =>
          `${i + 1}. [${c.tipo.toUpperCase()}] ${c.titulo} (prioridade: ${c.prioridade})\n   Dado: ${c.dado}\n   Quando: ${c.quando}\n   Então: ${c.entao}`
        ).join("\n\n");

        const systemPrompt = `Você é um especialista sênior em Quality Assurance. Sua tarefa é analisar criticamente um conjunto de cenários de teste gerados para uma História de Usuário e identificar problemas de cobertura.

Analise com rigor e retorne APENAS um JSON válido, sem markdown, com a seguinte estrutura:
{
  "parecer_geral": "string com resumo executivo da análise (máx 200 chars)",
  "score_cobertura": número de 0 a 100 representando % de cobertura estimada,
  "cenarios_faltantes": [
    { "titulo": "string", "justificativa": "string", "risco": "alto|medio|baixo" }
  ],
  "cenarios_repetitivos": [
    { "ids": ["id1", "id2"], "motivo": "string" }
  ],
  "cenarios_irrelevantes": [
    { "id": "string", "motivo": "string" }
  ],
  "classificacao_risco": [
    { "id": "string", "titulo": "string", "risco": "critico|alto|medio|baixo", "justificativa": "string" }
  ],
  "recomendacao_execucao": "string com orientação sobre ordem de execução (máx 200 chars)"
}`;

        const userMessage = `HISTÓRIA DE USUÁRIO:\n${input.userStory.substring(0, 3000)}\n\n${input.projectContext ? `CONTEXTO DO PROJETO: ${input.projectContext}\n\n` : ""}CENÁRIOS GERADOS (${input.generatedCases.length} cenários):\n${casesText}`;

        try {
          const response = await invokeLLM({
            model: ENV.llmModel,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            maxTokens: 4096,
          });
          const content = response.choices?.[0]?.message?.content ?? "";
          const raw = String(content).trim();
          if (!raw) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IA retornou resposta vazia." });
          const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
          const jsonStr = stripped.startsWith("{") ? stripped : (stripped.match(/(\{[\s\S]*\})/)?.[1] ?? "");
          if (!jsonStr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IA retornou formato inválido." });
          return JSON.parse(jsonStr);
        } catch (err: any) {
          console.error("[qaPlanner.analyzeCoverage] Error:", err?.message);
          return analyzeCoverageWithQaRules(input.userStory, input.generatedCases);
        }
      }),

    // ── Listar documentos ─────────────────────────────────────────────────────
    listDocuments: protectedProcedure.query(async ({ ctx }) => {
      return listQAPlanDocuments(ctx.user.id, ctx.user.role === "admin");
    }),

    // ── Deletar documento ─────────────────────────────────────────────────────
    deleteDocument: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getQAPlanDocument(input.id);
        if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
        if (doc.createdById !== ctx.user.id && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await deleteQAPlanDocument(input.id);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
