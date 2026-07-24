#!/usr/bin/env node

const { randomBytes } = require("node:crypto");
const { constants, writeFileSync } = require("node:fs");
const { basename, resolve } = require("node:path");

function parseArgs(argv) {
  const values = {
    output: ".env.production",
    publicUrl: "",
    image: "ghcr.io/qualidadesudoeste/orchestrator",
    version: "1.0.0",
    port: "3000",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === "--output" && next) values.output = next;
    else if (argument === "--public-url" && next) values.publicUrl = next;
    else if (argument === "--image" && next) values.image = next;
    else if (argument === "--version" && next) values.version = next;
    else if (argument === "--port" && next) values.port = next;
    else {
      console.error(`Argumento inválido ou sem valor: ${argument}`);
      process.exit(2);
    }
    index += 1;
  }

  return values;
}

function validatePublicUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("--public-url deve ser uma URL válida.");
  }

  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error(
      "--public-url deve usar HTTPS; HTTP é permitido somente em loopback local.",
    );
  }
  return { url, loopback };
}

function validatePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("--port deve estar entre 1 e 65535.");
  }
  return String(port);
}

function secret(bytes = 32) {
  return randomBytes(bytes).toString("hex");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.publicUrl) {
    throw new Error(
      "Informe --public-url, por exemplo https://qa.seudominio.com.br.",
    );
  }

  const { url, loopback } = validatePublicUrl(options.publicUrl);
  const port = validatePort(options.port);
  const outputPath = resolve(options.output);
  const mysqlPassword = secret(24);
  const rootPassword = secret(24);
  const jwtSecret = secret();
  const agentToken = secret();
  const envFileReference = basename(outputPath);

  const lines = [
    "NODE_ENV=production",
    "HOST=0.0.0.0",
    "PORT=3000",
    "TZ=America/Sao_Paulo",
    "VITE_APP_ID=orchestrator-production",
    "",
    `DATABASE_URL=mysql://orchestrator:${encodeURIComponent(mysqlPassword)}@mysql:3306/orchestrator`,
    `MYSQL_PASSWORD=${mysqlPassword}`,
    `MYSQL_ROOT_PASSWORD=${rootPassword}`,
    "",
    `JWT_SECRET=${jwtSecret}`,
    `QA_AGENT_API_TOKEN=${agentToken}`,
    `ORCHESTRATOR_PUBLIC_URL=${url.toString().replace(/\/$/, "")}`,
    "",
    "BUILT_IN_FORGE_API_URL=https://api.openai.com",
    "BUILT_IN_FORGE_API_KEY=",
    "",
    `TRUST_PROXY=${loopback ? "false" : "1"}`,
    "JSON_BODY_LIMIT=10mb",
    "RATE_LIMIT_WINDOW_MS=900000",
    "RATE_LIMIT_API_MAX=600",
    "RATE_LIMIT_LOGIN_MAX=10",
    "SHUTDOWN_TIMEOUT_MS=10000",
    "",
    "VITE_ANALYTICS_ENDPOINT=",
    "VITE_ANALYTICS_WEBSITE_ID=",
    "",
    "APP_BIND_ADDRESS=127.0.0.1",
    `APP_PORT=${port}`,
    `ORCHESTRATOR_IMAGE=${options.image}`,
    `APP_VERSION=${options.version}`,
    `PRODUCTION_ENV_FILE=${envFileReference}`,
    "",
  ];

  writeFileSync(outputPath, lines.join("\n"), {
    encoding: "utf8",
    flag: constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    mode: 0o600,
  });

  console.log(`Configuração criada em ${outputPath}`);
  console.log("Os segredos não foram exibidos. Guarde o arquivo com acesso restrito.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
