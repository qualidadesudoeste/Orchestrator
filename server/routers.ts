import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createClient, createProject, createSprint,
  deleteClient, deleteProject, deleteSprint,
  getAllChecklists, getAllUsers,
  getChecklist, getChecklistsByAnalyst,
  getClients, getProjects, getSprints,
  updateClient, updateProject, updateSprint, updateUserRole,
  upsertChecklist,
  getProgressBySprints,
} from "./db";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao Coordenador." });
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  users: router({
    list: adminProcedure.query(async () => getAllUsers()),
    updateRole: adminProcedure
      .input(z.object({ userId: z.number(), role: z.enum(["user", "admin"]) }))
      .mutation(async ({ input }) => { await updateUserRole(input.userId, input.role); return { success: true }; }),
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
});

export type AppRouter = typeof appRouter;
