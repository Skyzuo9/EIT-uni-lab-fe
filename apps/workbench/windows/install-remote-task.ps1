[CmdletBinding(SupportsShouldProcess)]
param(
  [string] $ConfigFile = 'C:\ProgramData\UniLab\Workbench\workbench.env',
  [string] $TaskName = 'UniLab Workbench Remote',
  [switch] $Uninstall
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this installer from an elevated PowerShell session.'
}

if ($Uninstall) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  }
  exit 0
}

if (-not (Test-Path -LiteralPath $ConfigFile -PathType Leaf)) {
  throw "UniLab Workbench config is not readable: $ConfigFile"
}

$runtimeDirectory = Split-Path -Parent $ConfigFile
& icacls.exe $runtimeDirectory /inheritance:r `
  /grant:r 'SYSTEM:(OI)(CI)(F)' 'Administrators:(OI)(CI)(F)' | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Failed to secure $runtimeDirectory"
}

function ConvertTo-QuotedArgument([string] $Value) {
  if ($Value.Contains('"')) {
    throw 'Task paths containing double quotes are not supported.'
  }
  return '"' + $Value + '"'
}

$serviceScript = Join-Path $PSScriptRoot 'start-remote-service.ps1'
$powershell = Join-Path $env:SystemRoot `
  'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = @(
  '-NoLogo',
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  (ConvertTo-QuotedArgument $serviceScript),
  '-ConfigFile',
  (ConvertTo-QuotedArgument $ConfigFile)
) -join ' '

$action = New-ScheduledTaskAction `
  -Execute $powershell `
  -Argument $arguments `
  -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$taskPrincipal = New-ScheduledTaskPrincipal `
  -UserId 'SYSTEM' `
  -LogonType ServiceAccount `
  -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable

if ($PSCmdlet.ShouldProcess($TaskName, 'Register startup task')) {
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $taskPrincipal `
    -Settings $settings `
    -Force | Out-Null
  Start-ScheduledTask -TaskName $TaskName
}
