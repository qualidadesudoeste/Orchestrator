import "dotenv/config";
import path from "node:path";
import { promises as fs } from "node:fs";
import mysql from "mysql2/promise";
import { decryptCredential } from "../../server/credentialCrypto";
import { runQaPilotAgent, type QaPilotEnvironment, type QaPilotResult } from "../../server/qaPilotAgent";
import { ensureVpnConnection, type VpnConnectionStrategy, type VpnProvider } from "../../server/vpnService";
import { closeDatabaseConnection } from "../../server/database/client";

type ExecutionRow = {
  id: number;
  externalExecutionId: string;
  projectId: number;
  projectName: string;
};

type ScenarioRow = {
  id: number;
  externalScenarioId: string;
  title: string;
  gherkin: string;
  status: "PASSOU" | "FALHOU" | "BLOQUEADO" | "ERRO_AUTOMACAO";
};

type EnvironmentRow = {
  name: string;
  loginUrl: string;
  username: string | null;
  passwordEncrypted: string | null;
  vpnProvider: VpnProvider;
  vpnProfileName: string | null;
  vpnUsername: string | null;
  vpnPasswordEncrypted: string | null;
  vpnAutoConnect: number;
  vpnConnectionStrategy: VpnConnectionStrategy;
  vpnConfigFileName: string | null;
  vpnConfigEncrypted: string | null;
  vpnConfigPasswordEncrypted: string | null;
  vpnConfigImportedAt: Date | null;
  vpnInstallerUrl: string | null;
  vpnInstallerSha256: string | null;
  vpnVerificationUrl: string | null;
};

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArgument(name: string): boolean {
  return process.argv.includes(name);
}

function chooseRepresentativeScenarios(rows: ScenarioRow[]): ScenarioRow[] {
  const chosen: ScenarioRow[] = [];
  for (const status of ["PASSOU", "ERRO_AUTOMACAO", "BLOQUEADO"] as const) {
    const candidate = rows.find(item => item.status === status && !chosen.includes(item));
    if (candidate) chosen.push(candidate);
  }
  return chosen.slice(0, 3);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const requestedId = Number(argument("--execution-id") || 0);
    const [executionRows] = await connection.query(
      requestedId > 0
        ? "SELECT id,externalExecutionId,projectId,projectName FROM test_executions WHERE id=? LIMIT 1"
        : "SELECT id,externalExecutionId,projectId,projectName FROM test_executions WHERE projectId IS NOT NULL ORDER BY id DESC LIMIT 1",
      requestedId > 0 ? [requestedId] : [],
    );
    const execution = (executionRows as ExecutionRow[])[0];
    if (!execution) throw new Error("Execução de referência não encontrada.");

    const [scenarioRows, environmentRows, projectRows, memoryRows] = await Promise.all([
      connection.query(
        "SELECT id,externalScenarioId,title,gherkin,status FROM test_results WHERE executionId=? ORDER BY id",
        [execution.id],
      ),
      connection.query(
        `SELECT environment.name,environment.loginUrl,environment.username,environment.passwordEncrypted,
          COALESCE(profile.provider,environment.vpnProvider) vpnProvider,
          COALESCE(profile.profileName,environment.vpnProfileName) vpnProfileName,
          COALESCE(profile.username,environment.vpnUsername) vpnUsername,
          COALESCE(profile.passwordEncrypted,environment.vpnPasswordEncrypted) vpnPasswordEncrypted,
          COALESCE(profile.autoConnect,environment.vpnAutoConnect) vpnAutoConnect,
          COALESCE(profile.connectionStrategy,environment.vpnConnectionStrategy) vpnConnectionStrategy,
          COALESCE(profile.configFileName,environment.vpnConfigFileName) vpnConfigFileName,
          COALESCE(profile.configEncrypted,environment.vpnConfigEncrypted) vpnConfigEncrypted,
          COALESCE(profile.configPasswordEncrypted,environment.vpnConfigPasswordEncrypted) vpnConfigPasswordEncrypted,
          COALESCE(profile.configImportedAt,environment.vpnConfigImportedAt) vpnConfigImportedAt,
          COALESCE(profile.installerUrl,environment.vpnInstallerUrl) vpnInstallerUrl,
          COALESCE(profile.installerSha256,environment.vpnInstallerSha256) vpnInstallerSha256,
          COALESCE(profile.verificationUrl,environment.vpnVerificationUrl) vpnVerificationUrl
        FROM project_test_environments environment
        LEFT JOIN vpn_profiles profile ON profile.id=environment.vpnProfileId AND profile.isActive=1
        WHERE environment.projectId=? AND environment.isActive=1 ORDER BY environment.id`,
        [execution.projectId],
      ),
      connection.query("SELECT sourceCodeSummary FROM projects WHERE id=? LIMIT 1", [execution.projectId]),
      connection.query(
        "SELECT category,title,content,confidence,occurrences FROM qa_agent_memories WHERE projectId=? AND status='ACTIVE' ORDER BY confidence DESC,lastSeenAt DESC LIMIT 15",
        [execution.projectId],
      ),
    ]);
    const scenarios = scenarioRows[0] as ScenarioRow[];
    const requestedTitle = argument("--scenario");
    const selected = requestedTitle
      ? scenarios.filter(item => item.title.toLowerCase().includes(requestedTitle.toLowerCase())).slice(0, 1)
      : chooseRepresentativeScenarios(scenarios);
    if (!selected.length) throw new Error("Nenhum cenário foi selecionado para o piloto.");

    const configuredEnvironmentRows = environmentRows[0] as EnvironmentRow[];
    for (const item of configuredEnvironmentRows) {
      if (item.vpnProvider === "NONE") continue;
      console.log(`Verificando VPN ${item.vpnProvider} (${item.vpnProfileName || "sem perfil"})...`);
      await ensureVpnConnection({
        provider: item.vpnProvider,
        profileName: item.vpnProfileName ?? "",
        username: item.vpnUsername,
        password: item.vpnPasswordEncrypted ? decryptCredential(item.vpnPasswordEncrypted) : null,
        autoConnect: Boolean(item.vpnAutoConnect),
        targetUrl: item.loginUrl,
        verificationUrl: item.vpnVerificationUrl,
        connectionStrategy: item.vpnConnectionStrategy,
        configFileName: item.vpnConfigFileName,
        configContent: item.vpnConfigEncrypted ? decryptCredential(item.vpnConfigEncrypted) : null,
        configPassword: item.vpnConfigPasswordEncrypted ? decryptCredential(item.vpnConfigPasswordEncrypted) : null,
        configImported: Boolean(item.vpnConfigImportedAt),
        installerUrl: item.vpnInstallerUrl,
        installerSha256: item.vpnInstallerSha256,
      });
    }

    const environments: QaPilotEnvironment[] = configuredEnvironmentRows.map(item => ({
      name: item.name,
      url: item.loginUrl,
      username: item.username ?? undefined,
      password: item.passwordEncrypted ? decryptCredential(item.passwordEncrypted) : undefined,
    }));
    if (!environments.length) throw new Error("O projeto não possui ambiente ativo parametrizado.");

    const sourceContext = String((projectRows[0] as Array<{ sourceCodeSummary?: string }>)[0]?.sourceCodeSummary ?? "");
    const memoryContext = (memoryRows[0] as Array<Record<string, unknown>>)
      .map(item => `[${item.category}] ${item.title}: ${item.content} (confiança ${item.confidence}, ocorrências ${item.occurrences})`)
      .join("\n");
    const runId = `pilot-${execution.externalExecutionId}-${Date.now()}`;
    const outputDirectory = path.resolve(
      argument("--output") || path.join("artifacts", "agent-pilot", runId),
    );
    await fs.mkdir(outputDirectory, { recursive: true });
    const results: QaPilotResult[] = [];
    for (const scenario of selected) {
      console.log(`Executando piloto: ${scenario.externalScenarioId} — ${scenario.title}`);
      const scenarioDirectory = path.join(outputDirectory, scenario.externalScenarioId);
      const result = await runQaPilotAgent({
        runId,
        scenarioId: scenario.externalScenarioId,
        title: scenario.title,
        gherkin: scenario.gherkin,
        environments,
        sourceContext,
        memoryContext,
        outputDirectory: scenarioDirectory,
        headless: !hasArgument("--headed"),
        maxIterations: Number(argument("--max-iterations") || 28),
      });
      results.push(result);
      console.log(`${scenario.externalScenarioId}: ${result.final.status} — ${result.final.summary}`);
    }
    const summaryFile = path.join(outputDirectory, "pilot-summary.json");
    await fs.writeFile(summaryFile, JSON.stringify({
      runId,
      sourceExecutionId: execution.id,
      project: execution.projectName,
      createdAt: new Date().toISOString(),
      results: results.map(item => ({
        scenarioId: item.scenarioId,
        status: item.final.status,
        verifier: item.verifier,
        iterations: item.iterations,
        usage: item.usage,
        traceFile: item.traceFile,
      })),
    }, null, 2), "utf8");
    console.log(`Resumo do piloto: ${summaryFile}`);
  } finally {
    await connection.end();
    await closeDatabaseConnection();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
