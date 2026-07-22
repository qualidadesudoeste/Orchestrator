$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$configPath = Join-Path $PSScriptRoot "playwright-mcp.config.json"
$outputDir = Join-Path $projectRoot "artifacts\playwright-mcp"

Set-Location $projectRoot
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

Write-Host "Iniciando Playwright MCP em http://localhost:8931/mcp"
& npx.cmd -y "@playwright/mcp@latest" --config $configPath --output-dir $outputDir
