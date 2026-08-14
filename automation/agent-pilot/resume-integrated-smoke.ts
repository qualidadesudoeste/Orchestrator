import "dotenv/config";
import mysql from "mysql2/promise";
import { controlTestExecution, getTestExecutionProgress } from "../../server/db";
import { wakeExecutionQueue } from "../../server/executionQueueService";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sleep(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL nao configurada.");
  const executionId = String(argument("--execution-id") || "").trim();
  if (!executionId) throw new Error("Use --execution-id <id-da-execucao>.");

  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await connection.query(
      "SELECT createdById,executionState,currentStage FROM test_executions WHERE externalExecutionId=? LIMIT 1",
      [executionId],
    );
    const execution = (rows as Array<Record<string, any>>)[0];
    if (!execution) throw new Error("Execucao nao encontrada.");
    console.log(JSON.stringify({ event: "found", executionId, state: execution.executionState, stage: execution.currentStage }));
    if (["FINISHED", "FAILED", "CANCELLED"].includes(execution.executionState)) {
      throw new Error(`Execucao ja terminal: ${execution.executionState}.`);
    }

    const resumed = await controlTestExecution({
      externalExecutionId: executionId,
      userId: Number(execution.createdById),
      isAdmin: true,
      action: "RESUME",
    });
    console.log(JSON.stringify({ event: "resumed", ...resumed }));
    wakeExecutionQueue();

    const deadline = Date.now() + 45 * 60 * 1000;
    while (Date.now() < deadline) {
      const progress = await getTestExecutionProgress({
        externalExecutionId: executionId,
        userId: Number(execution.createdById),
        isAdmin: true,
      });
      if (!progress) throw new Error("Execucao desapareceu da fila.");
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
    throw new Error("Timeout aguardando conclusao da execucao retomada.");
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
