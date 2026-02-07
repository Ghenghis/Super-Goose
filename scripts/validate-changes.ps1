# Validate Changes Script
# Run before claiming any work is "done"
# This is the automated quality gate

param(
    [switch]$SkipBuild = $false,
    [switch]$SkipSonarQube = $false
)

$ErrorActionPreference = "Continue"
$script:TotalChecks = 0
$script:PassedChecks = 0
$script:FailedChecks = 0
$script:Warnings = 0

function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
}

function Write-CheckStart {
    param([string]$Name)
    $script:TotalChecks++
    Write-Host "🔍 $Name..." -ForegroundColor Yellow -NoNewline
}

function Write-CheckPass {
    $script:PassedChecks++
    Write-Host " ✅ PASS" -ForegroundColor Green
}

function Write-CheckFail {
    param([string]$Reason)
    $script:FailedChecks++
    Write-Host " ❌ FAIL" -ForegroundColor Red
    Write-Host "   Reason: $Reason" -ForegroundColor Red
}

function Write-CheckWarning {
    param([string]$Reason)
    $script:Warnings++
    Write-Host " ⚠️  WARNING" -ForegroundColor Yellow
    Write-Host "   $Reason" -ForegroundColor Yellow
}

Write-Header "GOOSE QUALITY VALIDATION SYSTEM"

# Check 1: Scan for incomplete markers
Write-CheckStart "Scanning for TODO/FIXME/HACK markers"
$incompleteMarkers = @()
Get-ChildItem -Recurse -Include *.ts,*.tsx,*.rs -Exclude node_modules,target |
    ForEach-Object {
        $file = $_.FullName
        $content = Get-Content $file -Raw
        if ($content -match "//\s*(TODO|FIXME|HACK|XXX|STUB|PLACEHOLDER)") {
            $incompleteMarkers += $file
        }
    }

if ($incompleteMarkers.Count -eq 0) {
    Write-CheckPass
} else {
    Write-CheckFail "Found incomplete markers in $($incompleteMarkers.Count) files"
    $incompleteMarkers | ForEach-Object { Write-Host "     $_" -ForegroundColor Red }
}

# Check 2: TypeScript Lint
Write-CheckStart "Running TypeScript lint"
Push-Location "ui\desktop"
$lintOutput = npm run lint:check 2>&1
$lintExit = $LASTEXITCODE
Pop-Location

if ($lintExit -eq 0) {
    Write-CheckPass
} else {
    Write-CheckFail "TypeScript lint failed"
    Write-Host ($lintOutput | Select-Object -Last 20 | Out-String) -ForegroundColor Red
}

# Check 3: TypeScript Type Check
Write-CheckStart "Running TypeScript type check"
Push-Location "ui\desktop"
$typeOutput = npx tsc --noEmit 2>&1
$typeExit = $LASTEXITCODE
Pop-Location

if ($typeExit -eq 0) {
    Write-CheckPass
} else {
    Write-CheckFail "TypeScript type errors found"
    Write-Host ($typeOutput | Select-Object -Last 20 | Out-String) -ForegroundColor Red
}

# Check 4: Rust Clippy
Write-CheckStart "Running Rust clippy"
$clippyOutput = cargo clippy --all-targets -- -D warnings 2>&1
$clippyExit = $LASTEXITCODE

if ($clippyExit -eq 0) {
    Write-CheckPass
} else {
    Write-CheckFail "Clippy warnings found"
    Write-Host ($clippyOutput | Select-Object -Last 20 | Out-String) -ForegroundColor Red
}

# Check 5: TypeScript Tests
Write-CheckStart "Running TypeScript tests"
Push-Location "ui\desktop"
$testOutput = npm test 2>&1
$testExit = $LASTEXITCODE
Pop-Location

if ($testExit -eq 0) {
    Write-CheckPass
} else {
    Write-CheckFail "TypeScript tests failed"
    Write-Host ($testOutput | Select-Object -Last 20 | Out-String) -ForegroundColor Red
}

# Check 6: Rust Tests
Write-CheckStart "Running Rust tests"
$rustTestOutput = cargo test 2>&1
$rustTestExit = $LASTEXITCODE

if ($rustTestExit -eq 0) {
    Write-CheckPass
} else {
    Write-CheckFail "Rust tests failed"
    Write-Host ($rustTestOutput | Select-Object -Last 20 | Out-String) -ForegroundColor Red
}

# Check 7: Build Check (optional)
if (-not $SkipBuild) {
    Write-CheckStart "Building TypeScript"
    Push-Location "ui\desktop"
    $buildOutput = npm run build 2>&1
    $buildExit = $LASTEXITCODE
    Pop-Location

    if ($buildExit -eq 0) {
        Write-CheckPass
    } else {
        Write-CheckFail "TypeScript build failed"
        Write-Host ($buildOutput | Select-Object -Last 20 | Out-String) -ForegroundColor Red
    }

    Write-CheckStart "Building Rust"
    $rustBuildOutput = cargo build --release 2>&1
    $rustBuildExit = $LASTEXITCODE

    if ($rustBuildExit -eq 0) {
        Write-CheckPass
    } else {
        Write-CheckFail "Rust build failed"
        Write-Host ($rustBuildOutput | Select-Object -Last 20 | Out-String) -ForegroundColor Red
    }
}

# Check 8: SonarQube (optional)
if (-not $SkipSonarQube) {
    Write-CheckStart "Running SonarQube analysis"

    # Check if SonarQube is available
    $sonarRunning = Test-NetConnection -ComputerName localhost -Port 9000 -WarningAction SilentlyContinue -ErrorAction SilentlyContinue

    if ($sonarRunning.TcpTestSucceeded) {
        Push-Location "ui"
        $sonarOutput = sonar-scanner -Dsonar.login=$env:SONAR_TOKEN 2>&1
        $sonarExit = $LASTEXITCODE
        Pop-Location

        if ($sonarExit -eq 0) {
            # Check quality gate
            Start-Sleep -Seconds 5  # Wait for analysis to process

            $gateStatus = Invoke-RestMethod -Uri "http://localhost:9000/api/qualitygates/project_status?projectKey=goose-ui" `
                -Headers @{Authorization = "Basic $([Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($env:SONAR_TOKEN):")))"} `
                -ErrorAction SilentlyContinue

            if ($gateStatus.projectStatus.status -eq "OK") {
                Write-CheckPass
            } else {
                Write-CheckFail "Quality gate failed"
                $gateStatus.projectStatus.conditions | Where-Object { $_.status -eq "ERROR" } | ForEach-Object {
                    Write-Host "     $($_.metricKey): $($_.actualValue) (threshold: $($_.errorThreshold))" -ForegroundColor Red
                }
            }
        } else {
            Write-CheckFail "SonarQube analysis failed"
        }
    } else {
        Write-CheckWarning "SonarQube not running on localhost:9000 - skipping"
    }
}

# Final Summary
Write-Host ""
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "                  VALIDATION SUMMARY                 " -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Total Checks:   $script:TotalChecks" -ForegroundColor White
Write-Host "Passed:         $script:PassedChecks" -ForegroundColor Green
Write-Host "Warnings:       $script:Warnings" -ForegroundColor Yellow
Write-Host "Failed:         $script:FailedChecks" -ForegroundColor Red
Write-Host ""

if ($script:FailedChecks -eq 0) {
    if ($script:Warnings -eq 0) {
        Write-Host "✅ ALL CHECKS PASSED!" -ForegroundColor Green
        Write-Host "   Code is ready for commit/deploy" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "⚠️  PASSED WITH WARNINGS" -ForegroundColor Yellow
        Write-Host "   Review warnings above before proceeding" -ForegroundColor Yellow
        exit 0
    }
} else {
    Write-Host "VALIDATION FAILED!" -ForegroundColor Red
    Write-Host "   Fix $script:FailedChecks issue(s) before claiming work is done" -ForegroundColor Red
    Write-Host "   Do not report to user until all checks pass" -ForegroundColor Red
    exit 1
}
