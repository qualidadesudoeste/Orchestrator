param(
  [string]$Container = "orchestrator-platform-mysql-1",
  [string]$Database = "",
  [string]$OutputDirectory = ".\artifacts\backups",
  [int]$RetentionDays = 14
)

$ErrorActionPreference = "Stop"
if ($RetentionDays -lt 1) {
  throw "RetentionDays deve ser maior que zero."
}
if ($Database -and $Database -notmatch "^[A-Za-z0-9_]+$") {
  throw "Database contém caracteres inválidos."
}
if ($Container -notmatch "^[A-Za-z0-9_.-]+$") {
  throw "Container contém caracteres inválidos."
}

function Join-ProcessArguments([string[]]$Values) {
  return ($Values | ForEach-Object {
    '"' + $_.Replace('"', '\"') + '"'
  }) -join " "
}

$outputPath = if ([System.IO.Path]::IsPathRooted($OutputDirectory)) {
  $OutputDirectory
} else {
  Join-Path (Get-Location) $OutputDirectory
}
$resolvedOutput = [System.IO.Path]::GetFullPath($outputPath)
[System.IO.Directory]::CreateDirectory($resolvedOutput) | Out-Null

$running = docker inspect --format="{{.State.Running}}" $Container 2>$null
if ($LASTEXITCODE -ne 0 -or $running -ne "true") {
  throw "Container MySQL '$Container' não está em execução."
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$sqlPath = Join-Path $resolvedOutput "orchestrator_$timestamp.sql"
$zipPath = Join-Path $resolvedOutput "orchestrator_$timestamp.zip"

$startInfo = [System.Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = "docker"
$startInfo.UseShellExecute = $false
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.Arguments = Join-ProcessArguments @(
  "exec",
  "-e",
  "ORCHESTRATOR_TARGET_DB=$Database",
  $Container,
  "sh",
  "-c",
  'exec mysqldump --single-transaction --routines --triggers --set-gtid-purged=OFF -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "${ORCHESTRATOR_TARGET_DB:-$MYSQL_DATABASE}"'
)

$process = [System.Diagnostics.Process]::new()
$process.StartInfo = $startInfo
try {
  $process.Start() | Out-Null
  $file = [System.IO.File]::Create($sqlPath)
  try {
    $process.StandardOutput.BaseStream.CopyTo($file)
  } finally {
    $file.Dispose()
  }
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "mysqldump falhou: $($process.StandardError.ReadToEnd())"
  }

  Compress-Archive -LiteralPath $sqlPath -DestinationPath $zipPath -CompressionLevel Optimal
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash
  Set-Content -LiteralPath "$zipPath.sha256" -Value "$hash  $([IO.Path]::GetFileName($zipPath))" -Encoding ascii
} finally {
  if (Test-Path -LiteralPath $sqlPath) {
    Remove-Item -LiteralPath $sqlPath -Force
  }
}

$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -LiteralPath $resolvedOutput -File |
  Where-Object {
    $_.LastWriteTime -lt $cutoff -and
    ($_.Extension -eq ".zip" -or $_.Name.EndsWith(".zip.sha256"))
  } |
  Remove-Item -Force

Write-Output "Backup concluído: $zipPath"
Write-Output "SHA-256: $hash"
