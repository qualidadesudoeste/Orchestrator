import "dotenv/config";
import mysql from "mysql2/promise";

const index = process.argv.indexOf("--execution-id");
const executionId = String(index >= 0 ? process.argv[index + 1] : "").trim();
if (!executionId || !process.env.DATABASE_URL) throw new Error("Use --execution-id <id> e configure DATABASE_URL.");
const connection = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [rows] = await connection.query(
    `SELECT externalExecutionId,executionState,status,currentStage,progressMessage,
      totalScenarios,completedScenarios,evidenceDocxUrl,reliabilityReportUrl,finishedAt
     FROM test_executions WHERE externalExecutionId=? LIMIT 1`,
    [executionId],
  );
  const [memoryRows] = await connection.query(
    `SELECT category,title,confidence,occurrences FROM qa_agent_memories
     WHERE externalExecutionId=? AND status='ATIVA' ORDER BY category,title`,
    [executionId],
  );
  console.log(JSON.stringify({
    execution: (rows as Array<Record<string, unknown>>)[0] ?? null,
    memories: memoryRows,
  }, null, 2));
} finally {
  await connection.end();
}
