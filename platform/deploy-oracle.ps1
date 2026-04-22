param(
  [string]$EnvFile = ".env",
  [switch]$SkipBuild,
  [switch]$SkipRestart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Import-DotEnv {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      return
    }

    $parts = $line -split "=", 2
    if ($parts.Length -ne 2) {
      return
    }

    $name = $parts[0].Trim()
    $value = $parts[1].Trim()

    if ($name.StartsWith("export ")) {
      $name = $name.Substring(7).Trim()
    }

    if ((-not ${env:$name}) -and $value) {
      [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

function Get-OrDefault {
  param(
    [Parameter(Mandatory = $true)][string]$Value,
    [Parameter(Mandatory = $true)][string]$DefaultValue
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $DefaultValue
  }

  return $Value
}

function ConvertTo-BashDoubleQuoted {
  param([Parameter(Mandatory = $true)][string]$Value)
  return $Value
    .Replace("\\", "\\\\")
    .Replace('"', '\\"')
    .Replace("$", "\\$")
}

Import-DotEnv -Path $EnvFile

$requiredVars = @(
  "ORACLE_SSH_HOST",
  "ORACLE_SSH_USER",
  "ORACLE_SSH_PRIVATE_KEY",
  "ORACLE_GIT_REPO_URL"
)

foreach ($name in $requiredVars) {
  if ([string]::IsNullOrWhiteSpace(${env:$name})) {
    throw "Missing required env var: $name"
  }
}

$sshHost = $env:ORACLE_SSH_HOST
$sshPort = Get-OrDefault -Value $env:ORACLE_SSH_PORT -DefaultValue "22"
$sshUser = $env:ORACLE_SSH_USER
$keyPathRaw = $env:ORACLE_SSH_PRIVATE_KEY
$remotePath = Get-OrDefault -Value $env:ORACLE_REMOTE_PATH -DefaultValue "/opt/mini-paas"
$repoUrl = $env:ORACLE_GIT_REPO_URL
$branch = Get-OrDefault -Value $env:ORACLE_GIT_BRANCH -DefaultValue "main"
$units = Get-OrDefault -Value $env:ORACLE_SYSTEMD_UNITS -DefaultValue "mini-paas-backend mini-paas-worker mini-paas-frontend"

if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
  throw "OpenSSH client is not available. Install Windows OpenSSH client first."
}

$keyPathResolved = $keyPathRaw
if (Test-Path -LiteralPath $keyPathRaw) {
  $keyPathResolved = (Resolve-Path -LiteralPath $keyPathRaw).Path
}

$remotePathQ = ConvertTo-BashDoubleQuoted -Value $remotePath
$repoUrlQ = ConvertTo-BashDoubleQuoted -Value $repoUrl
$branchQ = ConvertTo-BashDoubleQuoted -Value $branch
$unitsQ = ConvertTo-BashDoubleQuoted -Value $units
$skipBuildQ = if ($SkipBuild) { "1" } else { "0" }
$skipRestartQ = if ($SkipRestart) { "1" } else { "0" }

$remoteScript = @"
set -euo pipefail

REMOTE_PATH=\"$remotePathQ\"
REPO_URL=\"$repoUrlQ\"
BRANCH=\"$branchQ\"
UNITS=\"$unitsQ\"
SKIP_BUILD=$skipBuildQ
SKIP_RESTART=$skipRestartQ

if [ ! -d "\$REMOTE_PATH/.git" ]; then
  git clone --branch "\$BRANCH" "\$REPO_URL" "\$REMOTE_PATH"
else
  cd "\$REMOTE_PATH"
  git fetch origin "\$BRANCH"
  git checkout "\$BRANCH"
  git pull --ff-only origin "\$BRANCH"
fi

cd "\$REMOTE_PATH"
npm install

if [ "\$SKIP_BUILD" != "1" ]; then
  npm run build
fi

if [ "\$SKIP_RESTART" != "1" ]; then
  sudo systemctl daemon-reload
  sudo systemctl restart \$UNITS
fi

echo "Remote deployment finished successfully."
"@

Write-Host "Connecting to ${sshUser}@${sshHost}:${sshPort} ..."
$target = "$sshUser@$sshHost"

$remoteScript | ssh -i "$keyPathResolved" -p "$sshPort" "$target" "bash -s"

Write-Host "Done."
