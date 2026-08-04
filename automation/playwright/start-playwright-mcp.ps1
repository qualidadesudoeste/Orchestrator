$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$configPath = Join-Path $PSScriptRoot "playwright-mcp.config.json"
$outputDirectory = Join-Path $projectRoot "artifacts\playwright-mcp"

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

Set-Location $projectRoot

Write-Host "Iniciando Playwright MCP em http://localhost:8931/mcp"
& npx.cmd -y "@playwright/mcp@0.0.78" --config $configPath --output-dir $outputDirectory --output-mode stdout
