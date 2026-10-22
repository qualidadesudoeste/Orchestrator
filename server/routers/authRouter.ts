import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";
import { publicProcedure, router } from "../_core/trpc";
import { getUserByUsername, updateLastSignedIn } from "../db";

export const authRouter = router({
  login: publicProcedure
    .input(z.object({ username: z.string().min(1), password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const user = await getUserByUsername(input.username);
      if (!user?.passwordHash || !(await bcrypt.compare(input.password, user.passwordHash))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos." });
      }
      const token = await sdk.signSession(
        { openId: `local:${user.id}`, appId: "qa-local", name: user.name ?? user.username ?? "" },
        { expiresInMs: 365 * 24 * 60 * 60 * 1000 },
      );
      ctx.res.cookie(COOKIE_NAME, token, getSessionCookieOptions(ctx.req));
      await updateLastSignedIn(user.id);
      const { passwordHash: _, ...safeUser } = user;
      return { success: true, user: safeUser };
    }),
  me: publicProcedure.query(({ ctx }) => {
    if (!ctx.user) return null;
    const { passwordHash: _, ...safeUser } = ctx.user;
    return safeUser;
  }),
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),
});
