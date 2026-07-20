import bcrypt from "bcryptjs";
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
  getProgressBySprints,
  getUserByUsername,
  getUserById,
  createLocalUser,
  updateLocalUser,
  deleteUser,
  updateLastSignedIn,
} from "./db";
import {
  getTrailProgress,
  upsertTrailProgress,
  getAllTrailProgress,
} from "./db";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao Administrador." });
  return next({ ctx });
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
  clients: router({
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
      .input(z.object({ id: z.number(), name: z.string().min(1).optional(), description: z.string().optional() }))
      .mutation(async ({ input }) => { const { id, ...data } = input; await updateProject(id, data); return { success: true }; }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => { await deleteProject(input.id); return { success: true }; }),
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
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await upsertChecklist({ ...input, analystId: ctx.user.id });
        return { success: true, id };
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
});

export type AppRouter = typeof appRouter;
