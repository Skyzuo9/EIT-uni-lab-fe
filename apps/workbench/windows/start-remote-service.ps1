[CmdletBinding()]
param(
  [string] $ConfigFile = 'C:\ProgramData\UniLab\Workbench\workbench.env'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $ConfigFile -PathType Leaf)) {
  throw "UniLab Workbench config is not readable: $ConfigFile"
}

foreach ($line in Get-Content -LiteralPath $ConfigFile) {
  $entry = $line.Trim()
  if ($entry.Length -eq 0 -or $entry.StartsWith('#')) {
    continue
  }
  $parts = $entry.Split('=', 2)
  if ($parts.Count -ne 2 -or $parts[0] -notmatch '^[A-Z][A-Z0-9_]*$') {
    throw "Invalid UniLab Workbench config entry: $entry"
  }
  $name = $parts[0]
  $value = $parts[1].Trim()
  if (
    $value.Length -ge 2 -and
    (($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'")))
  ) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}

$required = @(
  'UNILAB_NODE',
  'UNILAB_WORKBENCH_ROOT',
  'THEIA_WORKSPACE',
  'UNILAB_PYTHON_ENV',
  'UNILAB_REMOTE_ACCESS_URL_FILE'
)
foreach ($name in $required) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
    throw "$name is required"
  }
}

$runtimeDirectory = Split-Path -Parent $env:UNILAB_REMOTE_ACCESS_URL_FILE
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
& icacls.exe $runtimeDirectory /inheritance:r `
  /grant:r 'SYSTEM:(OI)(CI)(F)' 'Administrators:(OI)(CI)(F)' | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Failed to secure remote access runtime directory: $runtimeDirectory"
}
$entrypoint = Join-Path `
  $env:UNILAB_WORKBENCH_ROOT `
  'apps\workbench\scripts\start-workbench.mjs'

& $env:UNILAB_NODE $entrypoint --remote
exit $LASTEXITCODE
