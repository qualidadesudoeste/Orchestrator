$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$envPath = Join-Path $projectRoot ".env"
$composePath = Join-Path $PSScriptRoot "docker-compose.yml"
$workflowPath = Join-Path $PSScriptRoot "Agente_QA_Playwright_MCP.json"
$workflowId = "mrqcEZGkwBYN132M"

$keyLine = Get-Content -LiteralPath $envPath -Encoding UTF8 |
  Where-Object { $_ -match '^OPENAI_API_KEY=' } |
  Select-Object -Last 1
$apiKey = if ($keyLine) { ($keyLine -split '=', 2)[1].Trim() } else { "" }

if ($apiKey.Length -lt 20) {
  throw "Preencha OPENAI_API_KEY no arquivo .env antes de configurar a OpenAI."
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Desktop não está disponível. Inicie-o e tente novamente."
}

$credentialObject = @{
  id = "orchestrator-openai"
  name = "OpenAI Orchestrator"
  type = "openAiApi"
  data = @{
    apiKey = $apiKey
    organizationId = ""
    url = "https://api.openai.com/v1"
    header = $false
  }
}
$credential = ConvertTo-Json -InputObject @($credentialObject) -Depth 5 -Compress
$temporaryCredential = Join-Path ([IO.Path]::GetTempPath()) (
  "orchestrator-openai-{0}.json" -f [guid]::NewGuid()
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
    -v "${temporaryCredential}:/tmp/openai-credential.json:ro" `
    n8n import:credentials --input=/tmp/openai-credential.json
  if ($LASTEXITCODE -ne 0) { throw "Falha ao importar a credencial OpenAI." }

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

Write-Host "OpenAI configurada no n8n sem expor a chave nos logs."
