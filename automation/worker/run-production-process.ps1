param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("api", "worker")]
  [string]$Mode
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$entrypoint = if ($Mode -eq "api") { "dist\index.js" } else { "dist\worker.js" }
$logDirectory = Join-Path $projectRoot "artifacts\runtime"
$stdoutLog = Join-Path $logDirectory "$Mode.stdout.log"
$stderrLog = Join-Path $logDirectory "$Mode.stderr.log"
$node = (Get-Command node.exe -ErrorAction Stop).Source

New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
Set-Location -LiteralPath $projectRoot
$env:NODE_ENV = "production"

$process = Start-Process -FilePath $node `
  -ArgumentList $entrypoint `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -PassThru `
  -Wait
exit $process.ExitCode
