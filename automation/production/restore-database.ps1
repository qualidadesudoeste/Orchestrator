param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$Container = "orchestrator-platform-mysql-1",
  [string]$Database = "",
  [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmRestore) {
  throw "Restauração não executada. Use -ConfirmRestore após confirmar o alvo."
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

$resolvedBackup = (Resolve-Path -LiteralPath $BackupFile).Path
$hashFile = "$resolvedBackup.sha256"
if (Test-Path -LiteralPath $hashFile) {
  $expectedHash = ((Get-Content -LiteralPath $hashFile -Raw).Trim() -split "\s+")[0]
  $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedBackup).Hash
  if ($expectedHash -ne $actualHash) {
    throw "O SHA-256 do backup não corresponde ao arquivo."
  }
}

$running = docker inspect --format="{{.State.Running}}" $Container 2>$null
if ($LASTEXITCODE -ne 0 -or $running -ne "true") {
  throw "Container MySQL '$Container' não está em execução."
}

$temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) (
  "orchestrator_restore_" + [guid]::NewGuid().ToString("N")
)
[IO.Directory]::CreateDirectory($temporaryDirectory) | Out-Null

try {
  Expand-Archive -LiteralPath $resolvedBackup -DestinationPath $temporaryDirectory
  $sqlFiles = @(Get-ChildItem -LiteralPath $temporaryDirectory -Filter "*.sql" -File)
  if ($sqlFiles.Count -ne 1) {
    throw "O backup deve conter exatamente um arquivo SQL."
  }

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = "docker"
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.Arguments = Join-ProcessArguments @(
    "exec",
    "-i",
    "-e",
    "ORCHESTRATOR_TARGET_DB=$Database",
    $Container,
    "sh",
    "-c",
    'exec mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "${ORCHESTRATOR_TARGET_DB:-$MYSQL_DATABASE}"'
  )

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  $process.Start() | Out-Null
  $file = [IO.File]::OpenRead($sqlFiles[0].FullName)
  try {
    $file.CopyTo($process.StandardInput.BaseStream)
    $process.StandardInput.Close()
  } finally {
    $file.Dispose()
  }
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "Restauração falhou: $($process.StandardError.ReadToEnd())"
  }
} finally {
  if (Test-Path -LiteralPath $temporaryDirectory) {
    $resolvedTemporary = (Resolve-Path -LiteralPath $temporaryDirectory).Path
    $expectedRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolvedTemporary.StartsWith($expectedRoot, [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedTemporary -Recurse -Force
    }
  }
}

Write-Output "Restauração concluída. Valide /readyz e execute um teste de fumaça."
