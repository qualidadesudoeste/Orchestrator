$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$configPath = Join-Path $PSScriptRoot "playwright-mcp.config.json"

Set-Location $projectRoot

Write-Host "Iniciando Playwright MCP em http://localhost:8931/mcp"
& npx.cmd -y "@playwright/mcp@0.0.78" --config $configPath --output-mode stdout
