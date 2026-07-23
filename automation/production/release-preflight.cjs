const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function argument(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const baseUrl = argument("--base-url", "http://127.0.0.1:3000").replace(/\/+$/, "");
const image = argument("--image");
const productionEnvFile = argument("--env-file");
const outputDirectory = path.resolve(
  argument("--output", path.join("artifacts", "release")),
);
const checks = [];

function record(name, status, details = "") {
  checks.push({ name, status, details });
}

function command(name, executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    ...options,
  });
  record(
    name,
    result.status === 0 ? "PASSOU" : "FALHOU",
    result.status === 0
      ? "Comando concluído."
      : (result.stderr || result.stdout || "Falha sem saída.").trim().slice(-2000),
  );
}

async function httpCheck() {
  for (const endpoint of ["/healthz", "/readyz"]) {
    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        signal: AbortSignal.timeout(10_000),
      });
      const body = await response.json().catch(() => ({}));
      record(
        `HTTP ${endpoint}`,
        response.ok && body.ok === true ? "PASSOU" : "FALHOU",
        `status=${response.status}; estado=${body.status || "desconhecido"}`,
      );
      if (endpoint === "/healthz") {
        record(
          "Content-Security-Policy",
          response.headers.has("content-security-policy") ? "PASSOU" : "FALHOU",
        );
        record(
          "X-Request-Id",
          response.headers.has("x-request-id") ? "PASSOU" : "FALHOU",
        );
        record(
          "X-Powered-By removido",
          response.headers.has("x-powered-by") ? "FALHOU" : "PASSOU",
        );
      }
    } catch (error) {
      record(`HTTP ${endpoint}`, "FALHOU", error.message);
    }
  }
}

async function main() {
  const npmCli =
    process.env.npm_execpath ||
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  command(
    "Auditoria de dependências de produção",
    process.execPath,
    [npmCli, "audit", "--omit=dev", "--audit-level=high"],
  );
  await httpCheck();

  if (productionEnvFile) {
    command(
      "Configuração Docker Compose",
      "docker",
      [
        "compose",
        "--env-file",
        productionEnvFile,
        "-f",
        "docker-compose.production.yml",
        "config",
        "--quiet",
      ],
      {
        env: {
          ...process.env,
          PRODUCTION_ENV_FILE: productionEnvFile,
        },
      },
    );
  } else {
    record(
      "Configuração Docker Compose",
      "PULADO",
      "Informe --env-file para validar a configuração final.",
    );
  }

  if (image) {
    command("Imagem Docker disponível", "docker", [
      "image",
      "inspect",
      image,
    ]);
  } else {
    record(
      "Imagem Docker disponível",
      "PULADO",
      "Informe --image antes da liberação externa.",
    );
  }

  const failed = checks.filter(check => check.status === "FALHOU").length;
  const skipped = checks.filter(check => check.status === "PULADO").length;
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    result: failed > 0 ? "NO_GO" : skipped > 0 ? "ATENCAO" : "GO",
    summary: {
      passed: checks.filter(check => check.status === "PASSOU").length,
      failed,
      skipped,
    },
    checks,
  };

  fs.mkdirSync(outputDirectory, { recursive: true });
  const filename = `release-preflight-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.json`;
  const outputPath = path.join(outputDirectory, filename);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

  for (const check of checks) {
    console.log(`${check.status.padEnd(7)} ${check.name}${check.details ? ` — ${check.details}` : ""}`);
  }
  console.log(`\nResultado: ${report.result}`);
  console.log(`Relatório: ${outputPath}`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
