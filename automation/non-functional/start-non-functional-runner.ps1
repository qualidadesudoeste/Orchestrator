$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$envFile = Join-Path $PSScriptRoot ".env"

if (Test-Path -LiteralPath $envFile) {
  Get-Content -LiteralPath $envFile |
    Where-Object { $_ -and -not $_.StartsWith("#") -and $_.Contains("=") } |
    ForEach-Object {
      $name, $value = $_ -split "=", 2
      [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process")
    }
}

if (-not $env:NON_FUNCTIONAL_RUNNER_TOKEN -and -not (Test-Path -LiteralPath (Join-Path $projectRoot ".env"))) {
  throw "Defina NON_FUNCTIONAL_RUNNER_TOKEN ou QA_AGENT_API_TOKEN."
}

Set-Location -LiteralPath $projectRoot
& "C:\Program Files\nodejs\node.exe" ".\automation\non-functional\non-functional-runner.cjs"
