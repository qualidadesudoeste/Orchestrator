"use strict";

const crypto = require("node:crypto");
const dns = require("node:dns").promises;
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");
const axeSource = require("axe-core").source;

require("dotenv").config({
  path: path.resolve(__dirname, "..", "..", ".env"),
});

const port = Number(process.env.NON_FUNCTIONAL_RUNNER_PORT || 8940);
const runnerToken =
  process.env.NON_FUNCTIONAL_RUNNER_TOKEN ||
  process.env.QA_AGENT_API_TOKEN ||
  "";
const allowPrivateTargets =
  String(process.env.ALLOW_PRIVATE_TARGETS || "").toLowerCase() === "true";
const artifactRoot = path.resolve(
  process.env.NON_FUNCTIONAL_ARTIFACT_DIR ||
    path.join(process.cwd(), "artifacts", "non-functional"),
);
const k6Image = process.env.K6_DOCKER_IMAGE || "grafana/k6:2.1.0";
const zapImage =
  process.env.ZAP_DOCKER_IMAGE || "zaproxy/zap-stable:2.17.0";
const chromeExecutable =
  process.env.CHROME_EXECUTABLE_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const k6ScriptPath = path.resolve(__dirname, "k6-script.js");

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function safeSegment(value) {
  return String(value || "run")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const parts = address.split(".").map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0
    );
  }
  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  );
}

async function validateTarget(value) {
  const target = new URL(String(value || ""));
  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error("A URL deve usar HTTP ou HTTPS.");
  }
  if (!allowPrivateTargets) {
    const records = await dns.lookup(target.hostname, { all: true });
    if (records.length === 0 || records.some(item => isPrivateAddress(item.address))) {
      throw new Error(
        "Alvo local ou privado bloqueado. Defina ALLOW_PRIVATE_TARGETS=true somente em ambiente controlado.",
      );
    }
  }
  return target.toString();
}

function command(executable, args, timeoutMs) {
  return new Promise(resolve => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on("data", chunk => {
      stdout = (stdout + chunk.toString()).slice(-20000);
    });
    child.stderr.on("data", chunk => {
      stderr = (stderr + chunk.toString()).slice(-20000);
    });
    child.on("error", error => {
      clearTimeout(timeout);
      resolve({ code: -1, stdout, stderr: error.message, timedOut });
    });
    child.on("close", code => {
      clearTimeout(timeout);
      resolve({ code: code ?? -1, stdout, stderr, timedOut });
    });
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function runK6(targetUrl, reportDirectory, config) {
  const reportFile = path.join(reportDirectory, "k6-summary.json");
  const dockerDirectory = reportDirectory.replace(/\\/g, "/");
  const dockerScript = k6ScriptPath.replace(/\\/g, "/");
  const result = await command(
    "docker",
    [
      "run",
      "--rm",
      "-e",
      `TARGET_URL=${targetUrl}`,
      "-e",
      `K6_VUS=${Number(config.vus || 3)}`,
      "-e",
      `K6_DURATION=${String(config.duration || "10s")}`,
      "-e",
      `K6_P95_MS=${Number(config.p95_ms || 2000)}`,
      "-e",
      `K6_MAX_FAILURE_RATE=${Number(config.max_failure_rate || 0.05)}`,
      "-v",
      `${dockerDirectory}:/reports`,
      "-v",
      `${dockerScript}:/scripts/k6-script.js:ro`,
      k6Image,
      "run",
      "--summary-export",
      "/reports/k6-summary.json",
      "/scripts/k6-script.js",
    ],
    5 * 60_000,
  );

  if (!fs.existsSync(reportFile)) {
    return {
      status: "ERRO",
      metrics: {},
      findings: [
        {
          severity: "ALTO",
          metric: "k6",
          failure: result.timedOut
            ? "A execução do k6 excedeu cinco minutos."
            : result.stderr || "O k6 não produziu o relatório esperado.",
        },
      ],
    };
  }

  const summary = readJson(reportFile);
  const durationMetric = summary.metrics?.http_req_duration || {};
  const failureMetric = summary.metrics?.http_req_failed || {};
  const requestMetric = summary.metrics?.http_reqs || {};
  const duration = durationMetric.values || durationMetric;
  const failures = failureMetric.values || failureMetric;
  const requests = requestMetric.values || requestMetric;
  const p95 = Number(duration["p(95)"] ?? duration.p95 ?? 0);
  const failureRate = Number(failures.rate ?? failures.value ?? 0);
  const findings = [];
  if (p95 >= Number(config.p95_ms || 2000)) {
    findings.push({
      severity: "ALTO",
      metric: "http_req_duration",
      title: "Tempo de resposta p95 acima do limite",
      failure: `${Math.round(p95)} ms`,
    });
  }
  if (failureRate >= Number(config.max_failure_rate || 0.05)) {
    findings.push({
      severity: "ALTO",
      metric: "http_req_failed",
      title: "Taxa de requisições com falha acima do limite",
      failure: `${Math.round(failureRate * 10000) / 100}%`,
    });
  }
  return {
    status: result.code === 0 ? "PASSOU" : result.code === 99 ? "FALHOU" : "ERRO",
    metrics: {
      http_req_duration_p95_ms: Math.round(p95),
      http_req_failed_rate: failureRate,
      http_req_failed_basis_points: Math.round(failureRate * 10000),
      total_requests: Number(requests.count ?? 0),
    },
    findings,
    report: reportFile,
  };
}

async function runZap(targetUrl, reportDirectory, config) {
  const reportFile = path.join(reportDirectory, "zap-report.json");
  const dockerDirectory = reportDirectory.replace(/\\/g, "/");
  const result = await command(
    "docker",
    [
      "run",
      "--rm",
      "-v",
      `${dockerDirectory}:/zap/wrk:rw`,
      zapImage,
      "zap-baseline.py",
      "-t",
      targetUrl,
      "-J",
      "zap-report.json",
      "-m",
      String(Number(config.spider_minutes || 1)),
      "-I",
    ],
    10 * 60_000,
  );

  if (!fs.existsSync(reportFile)) {
    return {
      status: "ERRO",
      alerts: { high: 0, medium: 0, low: 0 },
      findings: [
        {
          severity: "ALTO",
          alert: "OWASP ZAP",
          description: result.timedOut
            ? "A análise do ZAP excedeu dez minutos."
            : result.stderr || "O ZAP não produziu o relatório esperado.",
        },
      ],
    };
  }

  const report = readJson(reportFile);
  const alerts = (report.site || []).flatMap(site => site.alerts || []);
  const byRisk = { high: 0, medium: 0, low: 0 };
  const findings = alerts.map(alert => {
    const riskCode = Number(alert.riskcode ?? 0);
    const risk =
      riskCode >= 3 ? "high" : riskCode === 2 ? "medium" : riskCode === 1 ? "low" : "informational";
    if (risk in byRisk) byRisk[risk] += 1;
    return {
      risk,
      plugin_id: alert.pluginid,
      alert: alert.alert,
      description: alert.desc,
      reference: alert.reference,
      occurrences: (alert.instances || []).length || 1,
    };
  });
  const failOnMedium = Boolean(config.fail_on_medium);
  const failed = byRisk.high > 0 || (failOnMedium && byRisk.medium > 0);
  return {
    status: failed ? "FALHOU" : "PASSOU",
    alerts: byRisk,
    findings,
    report: reportFile,
  };
}

async function runAxe(targetUrl, reportDirectory, config) {
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: chromeExecutable,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.goto(targetUrl, {
      waitUntil: "networkidle",
      timeout: Number(config.timeout_ms || 60_000),
    });
    await page.addScriptTag({ content: axeSource });
    const report = await page.evaluate(async options => {
      return globalThis.axe.run(globalThis.document, options);
    }, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    });
    const reportFile = path.join(reportDirectory, "axe-report.json");
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    const findings = report.violations.map(violation => {
      const impact = violation.impact || "moderate";
      if (impact in counts) counts[impact] += 1;
      return {
        impact,
        id: violation.id,
        title: violation.help,
        description: violation.description,
        help_url: violation.helpUrl,
        occurrences: violation.nodes.length,
      };
    });
    return {
      status:
        counts.critical > 0 || counts.serious > 0 ? "FALHOU" : "PASSOU",
      violations: counts,
      findings,
      report: reportFile,
    };
  } catch (error) {
    return {
      status: "ERRO",
      violations: { critical: 0, serious: 0, moderate: 0, minor: 0 },
      findings: [
        {
          impact: "serious",
          id: "axe-runner",
          title: "Falha ao executar axe-core",
          description: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

async function execute(body) {
  const targetUrl = await validateTarget(body.target_url ?? body.sistema_url);
  const runId = safeSegment(
    body.run_id || `nf-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  const reportDirectory = path.join(artifactRoot, runId);
  fs.mkdirSync(reportDirectory, { recursive: true });
  const startedAt = new Date().toISOString();
  const enabled = {
    axe: body.tools?.axe !== false,
    zap: body.tools?.zap !== false,
    k6: body.tools?.k6 !== false,
  };

  const axe = enabled.axe
    ? await runAxe(targetUrl, reportDirectory, body.axe || {})
    : { status: "NAO_EXECUTADO", violations: {}, findings: [] };
  const zap = enabled.zap
    ? await runZap(targetUrl, reportDirectory, body.zap || {})
    : { status: "NAO_EXECUTADO", alerts: {}, findings: [] };
  const k6 = enabled.k6
    ? await runK6(targetUrl, reportDirectory, body.k6 || {})
    : { status: "NAO_EXECUTADO", metrics: {}, findings: [] };

  return {
    run_id: runId,
    client_id: body.client_id,
    project_id: body.project_id,
    sprint_id: body.sprint_id,
    cliente: body.cliente,
    projeto: body.projeto || "Projeto não informado",
    sprint: body.sprint,
    target_url: targetUrl,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    report_directory: reportDirectory,
    k6,
    zap,
    axe,
  };
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    json(res, 200, {
      status: "ok",
      runner_token_configured: Boolean(runnerToken),
      artifact_root: artifactRoot,
    });
    return;
  }
  if (req.method !== "POST" || req.url !== "/run") {
    json(res, 404, { error: "Rota não encontrada." });
    return;
  }
  const suppliedToken = String(req.headers.authorization || "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (!runnerToken || !safeEqual(suppliedToken, runnerToken)) {
    json(res, 401, { error: "Token do executor inválido." });
    return;
  }
  const chunks = [];
  let size = 0;
  req.on("data", chunk => {
    size += chunk.length;
    if (size > 1024 * 1024) {
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", async () => {
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      json(res, 200, await execute(body));
    } catch (error) {
      json(res, 400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Executor não funcional ativo em http://localhost:${port}`);
});
