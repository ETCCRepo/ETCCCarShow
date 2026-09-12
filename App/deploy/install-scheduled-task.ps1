# Registers (or re-registers) the Windows scheduled task that runs the CarShow
# import loop -- the replacement for the Claude Code scheduled task
# `carshow-sync-registrations`. Ported from the Vette Fest app's installer.
# Run once per machine:
#
#   powershell -ExecutionPolicy Bypass -File deploy\install-scheduled-task.ps1 -Interactive
#
# Switches:
#   -Interactive       run only while the user is logged on. ON THIS MACHINE
#                      (NBKFF3A-BEELINK) THIS IS THE MODE THAT WORKS -- S4U
#                      registration below was refused with "Access denied" for
#                      the Vette Fest task, both unelevated and from an elevated
#                      window (which runs as a different admin account).
#   -IntervalMinutes N poll interval (default 15, matching the old task).
#   -UserId DOMAIN\name  the account the task RUNS AS (default: whoever runs
#                      this script). Must be the account that owns the
#                      ClubExpress profile and CARSHOW_SITE_PASSWORD -- e.g.
#                      from an elevated "user" window: -UserId NBKFF3A-BEELINK\Admin
#   -Uninstall         remove the task.
#
# Principal without -Interactive: S4U ("run whether the user is logged on or
# not", WITHOUT storing a password). That works in principle here -- Z: is a
# local volume, the only network access is plain HTTPS, and Chrome runs
# headless -- and would let imports keep running after sign-out.
[CmdletBinding()]
param(
  [switch]$Interactive,
  [int]$IntervalMinutes = 15,
  [string]$UserId = "$env:USERDOMAIN\$env:USERNAME",
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$TaskName = "carshow-sync-registrations"
$AppDir = Split-Path -Parent $PSScriptRoot            # ...\CarShow\App
$Script = Join-Path $PSScriptRoot "sync-registrations.js"
$NodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source

if ($Uninstall) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed scheduled task '$TaskName'."
  } else {
    Write-Host "No scheduled task named '$TaskName' to remove."
  }
  return
}

# ---- preflight: fail here rather than silently every 15 minutes forever -----
if (-not $NodeExe) { throw "node.exe is not on PATH. Install Node.js first." }
if (-not (Test-Path $Script)) { throw "Cannot find $Script" }
if (-not (Test-Path (Join-Path $AppDir "node_modules\playwright-core"))) {
  throw "playwright-core is not installed. Run 'npm install' in $AppDir first."
}
# Check the TARGET account's environment and profile, not the account running
# this script -- when UAC elevates into a different admin, [Environment]'s
# "User" scope is the wrong person's registry hive.
try {
  $sid = (New-Object System.Security.Principal.NTAccount($UserId)).Translate(
    [System.Security.Principal.SecurityIdentifier]).Value
} catch {
  throw "Unknown account '$UserId'. Pass -UserId DOMAIN\name for the account that owns the ClubExpress profile."
}
$targetPw = $null
if (Test-Path "Registry::HKEY_USERS\$sid\Environment") {
  $targetPw = (Get-ItemProperty "Registry::HKEY_USERS\$sid\Environment" -ErrorAction SilentlyContinue).CARSHOW_SITE_PASSWORD
}
if (-not $targetPw) {
  throw "CARSHOW_SITE_PASSWORD is not set as a persistent user environment variable for $UserId (or that account is not signed in, so its registry hive isn't loaded). Set it while signed in as $UserId, then re-run."
}
$profileRoot = (Get-ItemProperty "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$sid" -ErrorAction SilentlyContinue).ProfileImagePath
if (-not $profileRoot -or -not (Test-Path (Join-Path $profileRoot "AppData\Local\ETCC\clubexpress-profile"))) {
  throw "No ClubExpress profile for $UserId (expected under $profileRoot\AppData\Local\ETCC\clubexpress-profile). Run deploy\clubexpress-login.js as $UserId first."
}

Write-Host "node    : $NodeExe"
Write-Host "script  : $Script"
Write-Host "interval: every $IntervalMinutes minutes"

if ($Interactive) {
  # An Interactive task runs in the logged-on desktop, so launching node.exe
  # directly flashes a console window every poll. conhost --headless (Windows
  # 10 1809+/11) hosts the console without ever showing it.
  $action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\conhost.exe" `
    -Argument "--headless `"$NodeExe`" `"$Script`"" -WorkingDirectory $AppDir
} else {
  $action = New-ScheduledTaskAction -Execute $NodeExe -Argument "`"$Script`"" -WorkingDirectory $AppDir
}

# Repetition with no explicit duration = indefinitely. Start a minute out so the
# very first fire isn't racing this script's own registration.
$startAt = (Get-Date).AddMinutes(1)

# STAGGER AGAINST THE VETTE FEST TASK. Both syncs drive the same shared
# ClubExpress Chrome profile, and Chrome allows one process per profile. Left
# alone, each task's phase is just "whenever it was installed" -- the first
# install here landed 11 seconds behind Vette Fest's, every 15 minutes, forever,
# so two imports due on the same hour would open the profile ~6s apart.
# Both apps' clubexpress.js retry a busy profile, but keeping the runs far
# apart means that retry should never be needed: start this one half an
# interval after Vette Fest's next fire, the maximum separation possible.
# (Vette Fest's installer does the mirror image against this task.)
$sibling = Get-ScheduledTask -TaskName "vettefest-sync-registrations" -ErrorAction SilentlyContinue
if ($sibling) {
  $siblingNext = (Get-ScheduledTaskInfo -TaskName "vettefest-sync-registrations").NextRunTime
  if ($siblingNext) {
    $candidate = $siblingNext.AddMinutes($IntervalMinutes / 2)
    # Walk back/forward by whole intervals to the first slot at least a minute out.
    while ($candidate -gt (Get-Date).AddMinutes(1 + $IntervalMinutes)) { $candidate = $candidate.AddMinutes(-$IntervalMinutes) }
    while ($candidate -lt (Get-Date).AddMinutes(1)) { $candidate = $candidate.AddMinutes($IntervalMinutes) }
    $startAt = $candidate
    Write-Host ("stagger : Vette Fest next fires {0:h:mm:ss tt}; this task starts {1:h:mm:ss tt} (half an interval apart)" -f $siblingNext, $startAt)
  }
}

$trigger = New-ScheduledTaskTrigger -Once -At $startAt `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)

# MultipleInstances IgnoreNew: a slow ClubExpress export must never stack a
# second browser on top of the first. ExecutionTimeLimit is the backstop for a
# run that hangs entirely.
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

if ($Interactive) {
  $principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Limited
  Write-Host "principal: $UserId (Interactive -- runs only while logged on)"
} else {
  $principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType S4U -RunLevel Limited
  Write-Host "principal: $UserId (S4U -- runs logged on or off, no stored password)"
}

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Replaced the existing '$TaskName' task."
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal `
  -Description "Polls the CarShow app's import schedule and runs the ClubExpress import when one is due. Replaces the Claude Code scheduled task of the same name." | Out-Null

Write-Host ""
Write-Host "Registered '$TaskName'."
Write-Host ""
Write-Host "Verify with:"
Write-Host "  Start-ScheduledTask -TaskName $TaskName"
Write-Host "  Get-ScheduledTaskInfo -TaskName $TaskName | Select LastRunTime,LastTaskResult,NextRunTime"
Write-Host ""
Write-Host "LastTaskResult 0 = ran fine (including the common 'nothing was due' no-op)."
Write-Host "Anything non-zero means a real failure -- check the History tab in the app,"
Write-Host "or deploy\sync-registrations.local.log on this machine."
