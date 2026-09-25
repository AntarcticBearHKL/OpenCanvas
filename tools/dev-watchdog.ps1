<#
.SYNOPSIS
  OpenCanvas dev-process watchdog. Reaps ONLY this project's own dev processes.

.DESCRIPTION
  Why this exists: delegated background tasks (builds, debug hosts, mock servers)
  leave long-running processes behind. Real incident: vst-host.exe sat listening on
  127.0.0.1:3211 for 4 hours, causing port conflicts and resource leaks.

  Detection is ALWAYS allowlist-based. Never a blanket kill by process name:
    - vst-host.exe / vst3probe.exe / validator.exe
    - any executable under <repo>\vst-host\build\  (covers future debug binaries)
    - node.exe ONLY when its command line matches vst-mock-host
      (your dev server on :3000 / :5173 is never touched)

  Modes:
    Report  list only (default, safe, changes nothing)
    Reap    kill guarded processes older than -MaxAgeMinutes, freeing their ports
    Watch   loop Reap every -IntervalSeconds and append to a log file

  Also installs/uninstalls a Windows scheduled task (schtasks) that Reaps every
  -TaskIntervalMinutes minutes.

.NOTE
  Keep this file ASCII-only. PowerShell 5.1 reads .ps1 as the ANSI code page (GBK on
  this machine); a UTF-8-no-BOM script containing non-ASCII text is mis-parsed and
  fails with confusing syntax errors. See AGENTS.md.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\dev-watchdog.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\dev-watchdog.ps1 -Mode Reap -MaxAgeMinutes 30
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\dev-watchdog.ps1 -InstallTask
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\dev-watchdog.ps1 -UninstallTask
#>
[CmdletBinding()]
param(
    [ValidateSet("Report", "Reap", "Watch")]
    [string]$Mode = "Report",

    # Only reap processes older than this (never kill a fresh, legitimate build).
    [int]$MaxAgeMinutes = 60,

    # Watch mode poll interval.
    [int]$IntervalSeconds = 60,

    # Scheduled task interval.
    [int]$TaskIntervalMinutes = 30,

    [string]$TaskName = "OpenCanvas-DevWatchdog",

    [switch]$InstallTask,
    [switch]$UninstallTask,

    # Defaults to <repo> derived from this file's location (<repo>\tools\).
    [string]$RepoRoot = ""
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
}
$BuildRoot = Join-Path $RepoRoot "vst-host\build"
$LogDir = Join-Path $env:LOCALAPPDATA "OpenCanvas"
$LogFile = Join-Path $LogDir "dev-watchdog.log"

# Reported for information only; nothing is done to non-guarded holders.
$DevPorts = @(3211, 3212)

function Test-Guarded {
    param($Proc)

    $name = $Proc.Name
    $path = $Proc.ExecutablePath
    $cmd = $Proc.CommandLine

    # node.exe only counts when it runs our mock host.
    if ($name -eq "node.exe") {
        return [bool]($cmd -and $cmd -match "vst-mock-host")
    }

    if ($name -match "^(vst-host|vst3probe|validator)\.exe$") { return $true }

    # Covers binaries added later, as long as they live in the build dir.
    if ($path -and $path.StartsWith($BuildRoot, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }

    return $false
}

function Write-Log {
    param([string]$Line)
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    # UTF-8 without BOM; explicit encoding so PS 5.1 never falls back to GBK.
    [System.IO.File]::AppendAllText($LogFile, "$stamp  $Line`r`n", (New-Object System.Text.UTF8Encoding($false)))
}

function Get-Targets {
    $procs = Get-CimInstance Win32_Process | Where-Object { Test-Guarded $_ }
    $now = Get-Date

    $listen = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Group-Object OwningProcess -AsHashTable -AsString

    foreach ($p in $procs) {
        $ports = @()
        $key = [string]$p.ProcessId
        if ($listen -and $listen.ContainsKey($key)) {
            $ports = @($listen[$key] | ForEach-Object { $_.LocalPort } | Sort-Object -Unique)
        }
        $age = if ($p.CreationDate) { [math]::Round(($now - $p.CreationDate).TotalMinutes, 1) } else { $null }

        [pscustomobject]@{
            Pid    = $p.ProcessId
            Name   = $p.Name
            AgeMin = $age
            Ports  = ($ports -join ",")
            Path   = $p.ExecutablePath
        }
    }
}

function Show-Report {
    param($Targets)

    # @() so a single result still has .Count; drop the $null an empty call
    # produces, because @($null) would otherwise count as one target.
    $Targets = @(@($Targets) | Where-Object { $null -ne $_ })
    if ($Targets.Count -eq 0) {
        Write-Output "[watchdog] clean: no dev processes of this project are running"
    }
    else {
        Write-Output "[watchdog] $($Targets.Count) guarded process(es) found:"
        $Targets | Sort-Object AgeMin -Descending |
            Format-Table Pid, Name, AgeMin, Ports, Path -AutoSize | Out-String -Width 200 | Write-Output
    }

    # Safety proof: whatever holds a dev port but is NOT guarded stays untouched.
    $holders = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $DevPorts -contains $_.LocalPort } |
        ForEach-Object {
            $pr = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
            "  port $($_.LocalPort) held by $($pr.ProcessName) (pid $($_.OwningProcess))"
        }
    if ($holders) {
        Write-Output "[watchdog] dev port holders (informational, not acted on):"
        $holders | Write-Output
    }
}

function Invoke-Reap {
    param([switch]$Quiet)

    $targets = @(Get-Targets)
    $dead = @()

    foreach ($t in $targets) {
        if ($null -eq $t.AgeMin -or $t.AgeMin -lt $MaxAgeMinutes) { continue }
        try {
            Stop-Process -Id $t.Pid -Force -ErrorAction Stop
            $dead += $t
        }
        catch {
            Write-Log "failed to kill pid=$($t.Pid) $($t.Name): $($_.Exception.Message)"
        }
        if (-not $Quiet) { Write-Output "[watchdog] killed pid=$($t.Pid) $($t.Name) age=$($t.AgeMin)min ports=[$($t.Ports)]" }
    }

    if ($dead.Count -eq 0) {
        if (-not $Quiet) { Write-Output "[watchdog] nothing to reap (threshold ${MaxAgeMinutes}min, $($targets.Count) candidate(s))" }
        Write-Log "reap: nothing over ${MaxAgeMinutes}min ($($targets.Count) candidates)"
    }
    else {
        Write-Log "reap: killed $(($dead | ForEach-Object { "$($_.Name)#$($_.Pid)@$($_.AgeMin)min" }) -join ' ')"
    }
    return $dead.Count
}

# --------------------------------------------------------------- scheduled task
$TaskCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Mode Reap -MaxAgeMinutes $MaxAgeMinutes"

function Install-WatchdogTask {
    # schtasks instead of Register-ScheduledTask: /SC MINUTE repeats indefinitely
    # with no RepetitionDuration fiddling.
    $out = & schtasks.exe /Create /SC MINUTE /MO $TaskIntervalMinutes /TN $TaskName /TR $TaskCommand /F 2>&1
    $code = $LASTEXITCODE
    $out | Write-Output
    if ($code -ne 0) {
        Write-Output "[watchdog] task creation failed (exit $code). May need admin rights, or use -Mode Watch in the foreground."
        return
    }
    Write-Output "[watchdog] installed task '$TaskName': reaps this project's dev processes older than ${MaxAgeMinutes}min every $TaskIntervalMinutes min."
    Write-Output "[watchdog] remove it with: powershell -File tools\dev-watchdog.ps1 -UninstallTask"
}

function Uninstall-WatchdogTask {
    $out = & schtasks.exe /Delete /TN $TaskName /F 2>&1
    $code = $LASTEXITCODE
    $out | Write-Output
    if ($code -eq 0) { Write-Output "[watchdog] removed task '$TaskName'." } else { Write-Output "[watchdog] removal failed (exit $code)." }
}

# ------------------------------------------------------------------- entrypoint
if ($InstallTask) { Install-WatchdogTask; return }
if ($UninstallTask) { Uninstall-WatchdogTask; return }

switch ($Mode) {
    "Report" {
        Show-Report (Get-Targets)
    }
    "Reap" {
        Invoke-Reap | Out-Null
    }
    "Watch" {
        Write-Output "[watchdog] watching: reaping processes older than ${MaxAgeMinutes}min every $IntervalSeconds s. Ctrl+C to stop."
        Write-Log "watch: started interval=${IntervalSeconds}s maxAge=${MaxAgeMinutes}min"
        while ($true) {
            Invoke-Reap -Quiet | Out-Null
            Start-Sleep -Seconds $IntervalSeconds
        }
    }
}
