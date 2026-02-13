<#
.SYNOPSIS
  Process supervisor for goosed with auto-restart and exponential backoff.

.DESCRIPTION
  Monitors the goosed server process and automatically restarts it on crash
  or OTA update (exit code 42). Includes health checks, exponential backoff,
  and optional auto-rebuild support.

.PARAMETER Port
  Server port (default: 3284)

.PARAMETER MaxRestarts
  Maximum restart attempts before giving up (default: 20)

.PARAMETER AutoRebuild
  Run cargo build before restart on crash

.PARAMETER Binary
  Path to goosed binary (auto-detected if omitted)

.PARAMETER LogFile
  Optional log file path

.EXAMPLE
  .\scripts\goose-supervisor.ps1 -Port 3284 -MaxRestarts 20
#>

param(
    [int]$Port = 3284,
    [int]$MaxRestarts = 20,
    [switch]$AutoRebuild,
    [string]$Binary = "",
    [string]$LogFile = ""
)

$ErrorActionPreference = "Stop"

# --- Constants ---------------------------------------------------------------
$OTA_EXIT_CODE = 42
$BACKOFF_BASE = 1
$BACKOFF_CAP = 60
$STABILITY_WINDOW = 600  # seconds
$HEALTH_URL = "http://localhost:${Port}/api/version"

# --- Logging -----------------------------------------------------------------
function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] [supervisor] $Message"
    Write-Host $line
    if ($LogFile) {
        Add-Content -Path $LogFile -Value $line
    }
}

# --- Find binary -------------------------------------------------------------
function Find-GoosedBinary {
    if ($Binary) { return $Binary }

    $candidates = @(
        ".\target\release\goosed.exe",
        ".\ui\desktop\bin\goosed.exe",
        ".\ui\desktop\src\bin\goosed.exe",
        "$env:USERPROFILE\.cargo\bin\goosed.exe",
        "C:\Program Files\goose\goosed.exe"
    )

    # Also check PATH
    $inPath = Get-Command goosed.exe -ErrorAction SilentlyContinue
    if ($inPath) { $candidates = @($inPath.Source) + $candidates }

    foreach ($path in $candidates) {
        if (Test-Path $path) {
            return (Resolve-Path $path).Path
        }
    }

    Write-Log "ERROR: goosed.exe not found"
    exit 1
}

# --- Health check ------------------------------------------------------------
function Test-Health {
    param([int]$MaxAttempts = 30)
    for ($i = 1; $i -le $MaxAttempts; $i++) {
        try {
            $null = Invoke-WebRequest -Uri $HEALTH_URL -UseBasicParsing -TimeoutSec 3
            Write-Log "Health check passed (attempt $i/$MaxAttempts)"
            return $true
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    Write-Log "WARNING: Health check failed after ${MaxAttempts}s"
    return $false
}

# --- Auto rebuild ------------------------------------------------------------
function Invoke-Rebuild {
    if ($AutoRebuild) {
        Write-Log "Auto-rebuilding goosed..."
        try {
            $output = & cargo build --release -p goose-server 2>&1 | Select-Object -Last 3
            Write-Log "Rebuild succeeded"
            Write-Log $output
        } catch {
            Write-Log "WARNING: Rebuild failed, using existing binary"
        }
    }
}

# --- Main --------------------------------------------------------------------
$goosedBin = Find-GoosedBinary
Write-Log "Binary: $goosedBin"
Write-Log "Port: $Port | Max restarts: $MaxRestarts | Auto-rebuild: $AutoRebuild"

$restartCount = 0
$goosedProc = $null

# Cleanup on exit
$cleanupBlock = {
    Write-Log "Supervisor shutting down..."
    if ($goosedProc -and !$goosedProc.HasExited) {
        Stop-Process -Id $goosedProc.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Log "Supervisor exited"
}
Register-EngineEvent PowerShell.Exiting -Action $cleanupBlock | Out-Null

# Ctrl+C handler
[Console]::TreatControlCAsInput = $false
$null = [Console]::CancelKeyPress

try {
    while ($true) {
        if ($restartCount -ge $MaxRestarts) {
            Write-Log "ERROR: Max restarts ($MaxRestarts) reached. Exiting."
            exit 1
        }

        # Start goosed
        $env:GOOSE_PORT = $Port
        Write-Log "Starting goosed (attempt $($restartCount + 1)/$MaxRestarts)..."
        $startTime = Get-Date

        $goosedProc = Start-Process -FilePath $goosedBin -ArgumentList "agent" `
            -PassThru -NoNewWindow -ErrorAction Stop

        Write-Log "goosed started (PID: $($goosedProc.Id))"

        # Health check
        $healthy = Test-Health
        if (-not $healthy) {
            Write-Log "Continuing despite health check failure"
        }

        # Wait for process to exit
        $goosedProc.WaitForExit()
        $exitCode = $goosedProc.ExitCode
        $uptime = ((Get-Date) - $startTime).TotalSeconds

        Write-Log "goosed exited with code $exitCode after $([math]::Round($uptime))s"

        # Reset counter if stable
        if ($uptime -gt $STABILITY_WINDOW) {
            Write-Log "Process was stable for $([math]::Round($uptime))s, resetting restart counter"
            $restartCount = 0
        }

        # Decide restart strategy
        switch ($exitCode) {
            0 {
                Write-Log "Clean shutdown (exit 0). Not restarting."
                exit 0
            }
            $OTA_EXIT_CODE {
                Write-Log "OTA restart requested (exit 42). Restarting in 1s..."
                $restartCount++
                Start-Sleep -Seconds 1
            }
            default {
                $restartCount++
                $delay = [math]::Min($BACKOFF_BASE * [math]::Pow(2, $restartCount - 1), $BACKOFF_CAP)
                Write-Log "Crash (exit $exitCode). Restarting in ${delay}s (attempt $restartCount/$MaxRestarts)..."
                Invoke-Rebuild
                Start-Sleep -Seconds $delay
            }
        }
    }
} finally {
    & $cleanupBlock
}
