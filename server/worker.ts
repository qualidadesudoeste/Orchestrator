import "dotenv/config";
import { assertProductionEnvironment } from "./_core/envValidation";
import { logError, logInfo } from "./_core/logger";
import {
  processExecutionQueueOnce,
  startExecutionQueueScheduler,
  stopExecutionQueueScheduler,
} from "./executionQueueService";
import { resolveWorkerChromeExecutable } from "./workerPreflight";

function assertWindowsWorker(): void {
  if (process.platform !== "win32") {
    throw new Error(
      "O worker Playwright/VPN deve ser executado em Windows. A API Docker nao inicia automacao local."
    );
  }
}

export async function startWorker(): Promise<void> {
  assertProductionEnvironment();
  assertWindowsWorker();
  process.env.PLAYWRIGHT_CHROME_EXECUTABLE_PATH =
    await resolveWorkerChromeExecutable();
  await processExecutionQueueOnce();
  startExecutionQueueScheduler();
  logInfo("qa_worker_started", {
    pollIntervalMs: 5_000,
  });

  const shutdown = (signal: string) => {
    stopExecutionQueueScheduler();
    logInfo("qa_worker_stopped", {
      signal,
    });
    process.exitCode = 0;
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

startWorker().catch(error => {
  logError("qa_worker_start_failed", error);
  process.exitCode = 1;
});
