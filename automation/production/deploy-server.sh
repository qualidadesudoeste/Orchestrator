#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="${1:-/opt/orchestrator}"
ENV_FILE="${PRODUCTION_ENV_FILE:-${ROOT_DIR}/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-${ROOT_DIR}/docker-compose.production.yml}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/readyz}"

if [[ ! -d "${ROOT_DIR}" ]]; then
  echo "Diretório da aplicação não encontrado: ${ROOT_DIR}" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Arquivo de ambiente não encontrado: ${ENV_FILE}" >&2
  exit 1
fi

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "Arquivo Compose não encontrado: ${COMPOSE_FILE}" >&2
  exit 1
fi

cd "${ROOT_DIR}"

compose=(
  docker compose
  --env-file "${ENV_FILE}"
  -f "${COMPOSE_FILE}"
)

"${compose[@]}" config --quiet
"${compose[@]}" pull mysql migrate app
"${compose[@]}" up -d --no-build --remove-orphans

for attempt in {1..30}; do
  if curl --fail --silent --show-error --max-time 5 "${HEALTH_URL}" >/dev/null; then
    echo "Implantação concluída: ${HEALTH_URL} está pronta."
    "${compose[@]}" ps
    exit 0
  fi

  if [[ "${attempt}" -lt 30 ]]; then
    sleep 5
  fi
done

echo "A aplicação não ficou pronta dentro do prazo." >&2
"${compose[@]}" ps >&2
"${compose[@]}" logs --tail 100 app migrate >&2
exit 1
