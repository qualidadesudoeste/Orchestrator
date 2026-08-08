import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { decryptCredential, encryptCredential } from "./credentialCrypto";
import {
  createSigMcpSetting,
  deleteSigMcpSetting,
  getActiveSigMcpSetting,
  getSigMapping,
  getSigMcpSetting,
  listSigMcpSettings,
  listSigMappings,
  saveSigMapping,
  updateSigMcpSetting,
} from "./sigIntegrationRepository";
import { fetchSigCards, fetchSigTestQueue, listSigMcpTools, type SigMcpConnection } from "./sigMcpService";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao Administrador." });
  }
  return next({ ctx });
});

const endpointSchema = z.string().trim().url().max(1000).refine(value => value.startsWith("https://"), {
  message: "A URL do MCP do SIG deve usar HTTPS.",
});

function connectionFor(input: {
  endpointUrl: string;
  username: string;
  passwordEncrypted: string | null;
  projectId: string;
  sprintId: string;
}): SigMcpConnection {
  if (!input.passwordEncrypted) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A senha do SIG ainda não foi cadastrada." });
  }
  return {
    endpointUrl: input.endpointUrl,
    username: input.username,
    password: decryptCredential(input.passwordEncrypted),
    projectId: input.projectId,
    sprintId: input.sprintId,
  };
}

function sigError(error: unknown): TRPCError {
  return new TRPCError({
    code: "BAD_GATEWAY",
    message: error instanceof Error ? error.message : "Não foi possível consultar o SIG MCP.",
  });
}

export const sigRouter = router({
  settings: adminProcedure.query(() => listSigMcpSettings()),

  createSetting: adminProcedure.input(z.object({
    name: z.string().trim().min(1).max(120),
    endpointUrl: endpointSchema,
    username: z.string().trim().min(1).max(320),
    password: z.string().min(1).max(512),
    cardsToolName: z.string().trim().max(255).optional(),
    queueToolName: z.string().trim().max(255).optional(),
    isActive: z.boolean().default(true),
  })).mutation(async ({ ctx, input }) => {
    const id = await createSigMcpSetting({
      name: input.name,
      endpointUrl: input.endpointUrl,
      username: input.username,
      passwordEncrypted: encryptCredential(input.password),
      cardsToolName: input.cardsToolName || null,
      queueToolName: input.queueToolName || null,
      isActive: input.isActive ? 1 : 0,
      createdById: ctx.user.id,
    });
    return { success: true as const, id };
  }),

  updateSetting: adminProcedure.input(z.object({
    id: z.number().int().positive(),
    name: z.string().trim().min(1).max(120).optional(),
    endpointUrl: endpointSchema.optional(),
    username: z.string().trim().min(1).max(320).optional(),
    password: z.string().max(512).nullable().optional(),
    cardsToolName: z.string().trim().max(255).nullable().optional(),
    queueToolName: z.string().trim().max(255).nullable().optional(),
    isActive: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    const { id, password, isActive, ...data } = input;
    await updateSigMcpSetting(id, {
      ...data,
      ...(password === undefined ? {} : { passwordEncrypted: password ? encryptCredential(password) : null }),
      ...(isActive === undefined ? {} : { isActive: isActive ? 1 : 0 }),
    });
    return { success: true as const };
  }),

  deleteSetting: adminProcedure.input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await deleteSigMcpSetting(input.id);
      return { success: true as const };
    }),

  testSetting: adminProcedure.input(z.object({
    id: z.number().int().positive(),
    sigProjectId: z.string().trim().min(1).max(128).default("0"),
    sigSprintId: z.string().trim().min(1).max(128).default("0"),
  })).mutation(async ({ input }) => {
    const setting = await getSigMcpSetting(input.id);
    if (!setting) throw new TRPCError({ code: "NOT_FOUND", message: "Configuração do SIG não encontrada." });
    try {
      const result = await listSigMcpTools(connectionFor({
        ...setting,
        projectId: input.sigProjectId,
        sprintId: input.sigSprintId,
      }));
      return {
        success: true as const,
        serverInfo: result.serverInfo,
        protocolVersion: result.protocolVersion,
        tools: result.tools.map(tool => ({ name: tool.name, description: tool.description ?? "" })),
      };
    } catch (error) {
      throw sigError(error);
    }
  }),

  context: protectedProcedure.input(z.object({
    projectId: z.number().int().positive(),
    sprintId: z.number().int().positive(),
  })).query(async ({ input }) => {
    const [setting, mapping] = await Promise.all([
      getActiveSigMcpSetting(),
      getSigMapping(input.projectId, input.sprintId),
    ]);
    if (!mapping) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto ou sprint não encontrado." });
    return {
      configured: Boolean(setting),
      setting: setting ? {
        id: setting.id,
        name: setting.name,
        endpointUrl: setting.endpointUrl,
        username: setting.username,
        cardsToolName: setting.cardsToolName,
        queueToolName: setting.queueToolName,
        hasPassword: Boolean(setting.passwordEncrypted),
      } : null,
      sigProjectId: mapping.project.sigProjectId ?? "",
      sigSprintId: mapping.sprint.sigSprintId ?? "",
    };
  }),

  saveMapping: protectedProcedure.input(z.object({
    projectId: z.number().int().positive(),
    sprintId: z.number().int().positive(),
    sigProjectId: z.string().trim().min(1).max(128),
    sigSprintId: z.string().trim().min(1).max(128),
  })).mutation(async ({ input }) => {
    await saveSigMapping(input);
    return { success: true as const };
  }),

  listCards: protectedProcedure.input(z.object({
    projectId: z.number().int().positive(),
    sprintId: z.number().int().positive(),
  })).mutation(async ({ input }) => {
    const [setting, mapping] = await Promise.all([
      getActiveSigMcpSetting(),
      getSigMapping(input.projectId, input.sprintId),
    ]);
    if (!setting) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configure e ative o MCP do SIG em Parâmetros." });
    }
    if (!mapping) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto ou sprint não encontrado." });
    if (!mapping.project.sigProjectId || !mapping.sprint.sigSprintId) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Informe os IDs do projeto e da sprint no SIG antes de importar." });
    }
    try {
      const result = await fetchSigCards({
        connection: connectionFor({
          ...setting,
          projectId: mapping.project.sigProjectId,
          sprintId: mapping.sprint.sigSprintId,
        }),
        cardsToolName: setting.cardsToolName,
      });
      return {
        toolName: result.toolName,
        cards: result.cards,
        availableTools: result.tools.map(tool => ({ name: tool.name, description: tool.description ?? "" })),
      };
    } catch (error) {
      throw sigError(error);
    }
  }),

  testQueue: protectedProcedure.query(async () => {
    const setting = await getActiveSigMcpSetting();
    if (!setting) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configure e ative o MCP do SIG em Parâmetros." });
    }
    try {
      const [result, mappings] = await Promise.all([
        fetchSigTestQueue({
          connection: connectionFor({ ...setting, projectId: "0", sprintId: "0" }),
          queueToolName: setting.queueToolName,
        }),
        listSigMappings(),
      ]);
      return {
        toolName: result.toolName,
        items: result.items.map(item => {
          const local = mappings.find(mapping =>
            Boolean(item.sprintId) && String(mapping.sigSprintId ?? "") === item.sprintId &&
            (!item.projectId || String(mapping.sigProjectId ?? "") === item.projectId),
          );
          return {
            ...item,
            localProjectId: local?.projectId ?? null,
            localProjectName: local?.projectName ?? null,
            localSprintId: local?.sprintId ?? null,
            localSprintName: local?.sprintName ?? null,
            localClientId: local?.clientId ?? null,
            localClientName: local?.clientName ?? null,
          };
        }),
        availableTools: result.tools.map(tool => ({ name: tool.name, description: tool.description ?? "" })),
      };
    } catch (error) {
      throw sigError(error);
    }
  }),
});
