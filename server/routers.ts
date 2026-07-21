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
import {
  insertQAPlanDocument,
  listQAPlanDocuments,
  getQAPlanDocument,
  deleteQAPlanDocument,
} from "./db";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";

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

  qaPlanner: router({
    // ── Gerar casos de teste via IA ───────────────────────────────────────────
    generateCases: protectedProcedure
      .input(z.object({
        userStory: z.string().min(10),
        systemType: z.string().default("web"),
        criticality: z.enum(["low", "medium", "high", "critical"]).default("medium"),
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

        const systemPrompt = `Você é um especialista em Quality Assurance. Analise a História de Usuário e gere casos de teste BDD (Dado/Quando/Então).
Seja conciso: máximo 3 categorias, máximo 4 casos por categoria (total máximo: 12 casos).
Campos de texto devem ter no máximo 120 caracteres cada.`;

        const userMessage = `HU: ${truncatedStory}
Sistema: ${input.systemType} | Criticidade: ${critMap[input.criticality] || input.criticality}${input.projectContext ? ` | Contexto: ${input.projectContext}` : ""}`;

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
            model: "gpt-5-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            maxTokens: 8192,
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
          return JSON.parse(jsonStr);
        } catch (err: any) {
          if (err instanceof TRPCError) throw err;
          console.error("[qaPlanner.generateCases] Error:", err?.message);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao gerar casos de teste. Tente novamente." });
        }
      }),

    // ── Gerar documento LaTeX/PDF de evidências ───────────────────────────────
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
