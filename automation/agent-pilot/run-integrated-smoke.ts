import "dotenv/config";
import mysql from "mysql2/promise";
import { appRouter } from "../../server/routers";
import { getTestExecutionProgress, getUserById } from "../../server/db";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sleep(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  const planId = Number(argument("--plan-id") || 0);
  const requestedCaseId = String(argument("--case-id") || "").trim();
  if (!planId || !requestedCaseId) {
    throw new Error("Use --plan-id <id> --case-id <id-do-caso>.");
  }

  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await connection.query(
      "SELECT id,projectId,sprintId,createdById,resultJson FROM qa_test_plans WHERE id=? LIMIT 1",
      [planId],
    );
    const plan = (rows as Array<Record<string, any>>)[0];
    if (!plan) throw new Error("Plano não encontrado.");
    const parsed = JSON.parse(String(plan.resultJson || "{}"));
    const cases = (Array.isArray(parsed.cards) ? parsed.cards : [])
      .flatMap((card: any) => Array.isArray(card.casos) ? card.casos : []);
    const selected = cases.find((item: any) => String(item.id) === requestedCaseId);
    if (!selected) throw new Error(`Caso ${requestedCaseId} não encontrado no plano.`);

    const [environmentRows] = await connection.query(
      "SELECT id FROM project_test_environments WHERE projectId=? AND isActive=1 ORDER BY id",
      [plan.projectId],
    );
    const environmentIds = (environmentRows as Array<{ id: number }>).map(item => item.id);
    if (!environmentIds.length) throw new Error("Projeto sem ambiente ativo.");
    const user = await getUserById(Number(plan.createdById));
    if (!user) throw new Error("Usuário criador do plano não encontrado.");

    const caller = appRouter.createCaller({ user, req: {} as any, res: {} as any });
    const started = await caller.qaPlanner.startAutomatedTests({
      projectId: Number(plan.projectId),
      sprintId: Number(plan.sprintId),
      environmentIds,
      cases: [selected],
    });
    console.log(JSON.stringify({ event: "queued", ...started }));

    const deadline = Date.now() + 45 * 60 * 1000;
    while (Date.now() < deadline) {
      const progress = await getTestExecutionProgress({
        externalExecutionId: started.executionId,
        userId: user.id,
        isAdmin: true,
      });
      if (!progress) throw new Error("Execução desapareceu da fila.");
      console.log(JSON.stringify({
        event: "progress",
        state: progress.executionState,
        stage: progress.currentStage,
        completed: progress.completedScenarios,
        total: progress.totalScenarios,
        message: progress.progressMessage,
      }));
      if (["FINISHED", "FAILED", "CANCELLED"].includes(progress.executionState)) {
        console.log(JSON.stringify({ event: "finished", progress }));
        return;
      }
      await sleep(5_000);
    }
    throw new Error("Timeout aguardando conclusão da execução integrada.");
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
