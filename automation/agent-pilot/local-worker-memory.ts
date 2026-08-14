import "dotenv/config";
import { listExecutionWorkers, updateExecutionWorkerSettings } from "../../server/db";
import { wakeExecutionQueue } from "../../server/executionQueueService";

const index = process.argv.indexOf("--min-mb");
const minFreeMemoryMb = Number(index >= 0 ? process.argv[index + 1] : 0);
if (!Number.isInteger(minFreeMemoryMb) || minFreeMemoryMb < 128) {
  throw new Error("Use --min-mb <valor inteiro maior ou igual a 128>.");
}
const worker = (await listExecutionWorkers()).find(item => item.code === "LOCAL-01");
if (!worker) throw new Error("Worker local nao encontrado.");
await updateExecutionWorkerSettings(worker.id, { minFreeMemoryMb });
wakeExecutionQueue();
console.log(JSON.stringify({ workerId: worker.id, previousMinFreeMemoryMb: worker.minFreeMemoryMb, minFreeMemoryMb }));
process.exit(0);
