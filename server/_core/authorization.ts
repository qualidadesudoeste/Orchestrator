import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "./trpc";

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Acesso restrito ao Administrador.",
    });
  }
  return next({ ctx });
});
