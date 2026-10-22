import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure } from "../_core/authorization";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createLocalUser,
  deleteUser,
  getAllUsers,
  getUserById,
  getUserByUsername,
  updateLocalUser,
} from "../db";

export const usersRouter = router({
  options: protectedProcedure.query(async () => {
    const all = await getAllUsers();
    return all.map(user => ({ id: user.id, name: user.name, username: user.username }));
  }),
  list: adminProcedure.query(async () => {
    const all = await getAllUsers();
    return all.map(({ passwordHash: _, ...user }) => user);
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
      if (await getUserByUsername(input.username)) {
        throw new TRPCError({ code: "CONFLICT", message: "Nome de usuário já existe." });
      }
      await createLocalUser({ ...input, passwordHash: await bcrypt.hash(input.password, 12) });
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
      if (data.role === "user") {
        const admins = (await getAllUsers()).filter(user => user.role === "admin" && user.id !== userId);
        if (admins.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível rebaixar o único administrador do sistema." });
        }
      }
      await updateLocalUser(userId, data);
      return { success: true };
    }),
  resetPassword: adminProcedure
    .input(z.object({ userId: z.number(), newPassword: z.string().min(6) }))
    .mutation(async ({ input }) => {
      await updateLocalUser(input.userId, { passwordHash: await bcrypt.hash(input.newPassword, 12) });
      return { success: true };
    }),
  delete: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode remover sua própria conta." });
      }
      const target = await getUserById(input.userId);
      if (target?.role === "admin") {
        const admins = (await getAllUsers()).filter(user => user.role === "admin");
        if (admins.length <= 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível remover o único administrador do sistema." });
        }
      }
      await deleteUser(input.userId);
      return { success: true };
    }),
});
