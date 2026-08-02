$ErrorActionPreference = "Stop"

$composePath = Join-Path $PSScriptRoot "docker-compose.yml"
$workflowPath = Join-Path $PSScriptRoot "Agente_QA_Playwright_MCP.json"
$workflowId = "mrqcEZGkwBYN132M"

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Desktop não está disponível. Inicie-o e tente novamente."
}

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 5
} catch {
  throw "O Ollama local não respondeu na porta 11434. Inicie o Ollama e tente novamente."
}

if (-not ($health.models | Where-Object { $_.name -like "qwen3:1.7b*" })) {
  throw "O modelo qwen3:1.7b ainda não foi baixado. Execute: ollama pull qwen3:1.7b"
}

$credentialObject = @{
  id = "orchestrator-ollama"
  name = "Ollama Local Orchestrator"
  type = "ollamaApi"
  data = @{
    baseUrl = "http://host.docker.internal:11434"
    apiKey = ""
  }
}
$credential = ConvertTo-Json -InputObject @($credentialObject) -Depth 5 -Compress
$temporaryCredential = Join-Path ([IO.Path]::GetTempPath()) (
  "orchestrator-ollama-{0}.json" -f [guid]::NewGuid()
)
$n8nStopped = $false

try {
  [IO.File]::WriteAllText(
    $temporaryCredential,
    $credential,
    [Text.UTF8Encoding]::new($false)
  )

  docker compose -f $composePath stop n8n
  if ($LASTEXITCODE -ne 0) { throw "Não foi possível parar o n8n." }
  $n8nStopped = $true

  docker compose -f $composePath run --rm `
    -v "${temporaryCredential}:/tmp/ollama-credential.json:ro" `
    n8n import:credentials --input=/tmp/ollama-credential.json
  if ($LASTEXITCODE -ne 0) { throw "Falha ao importar a conexão local do Ollama." }

  docker compose -f $composePath run --rm `
    -v "${workflowPath}:/tmp/qa-workflow.json:ro" `
    n8n import:workflow --input=/tmp/qa-workflow.json
  if ($LASTEXITCODE -ne 0) { throw "Falha ao importar o workflow do Agente QA." }

  docker compose -f $composePath run --rm `
    n8n publish:workflow --id=$workflowId
  if ($LASTEXITCODE -ne 0) { throw "Falha ao ativar o workflow do Agente QA." }
} finally {
  if (Test-Path -LiteralPath $temporaryCredential) {
    Remove-Item -LiteralPath $temporaryCredential -Force
  }
  if ($n8nStopped) {
    docker compose -f $composePath start n8n | Out-Null
  }
}

Write-Host "Ollama local configurado no n8n. Nenhuma chave de API foi utilizada."
