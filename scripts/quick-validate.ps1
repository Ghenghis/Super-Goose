# Quick Validation Script
# Tests core quality checks

$ErrorActionPreference = "Continue"
Write-Host ""
Write-Host "===== GOOSE QUALITY VALIDATION =====" -ForegroundColor Cyan
Write-Host ""

$TotalChecks = 0
$PassedChecks = 0
$FailedChecks = 0

# Check 1: Scan for incomplete markers
Write-Host "[1/5] Scanning for TODO/FIXME/HACK markers..." -ForegroundColor Yellow
$TotalChecks++
$incompleteFiles = @()

Get-ChildItem -Recurse -Include *.ts,*.tsx,*.rs -Exclude node_modules,target -ErrorAction SilentlyContinue |
    ForEach-Object {
        $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
        if ($content -match "//\s*(TODO|FIXME|HACK|XXX|STUB|PLACEHOLDER)") {
            $incompleteFiles += $_.FullName
        }
    }

if ($incompleteFiles.Count -eq 0) {
    Write-Host "      PASS - No incomplete markers found" -ForegroundColor Green
    $PassedChecks++
} else {
    Write-Host "      FAIL - Found incomplete markers in $($incompleteFiles.Count) files" -ForegroundColor Red
    $FailedChecks++
}

# Check 2: TypeScript Lint
Write-Host "[2/5] Running TypeScript lint..." -ForegroundColor Yellow
$TotalChecks++

if (Test-Path "ui/desktop/package.json") {
    Push-Location "ui/desktop"
    $lintResult = npm run lint:check 2>&1
    $lintExit = $LASTEXITCODE
    Pop-Location

    if ($lintExit -eq 0) {
        Write-Host "      PASS - No lint errors" -ForegroundColor Green
        $PassedChecks++
    } else {
        Write-Host "      FAIL - Lint errors found" -ForegroundColor Red
        $FailedChecks++
    }
} else {
    Write-Host "      SKIP - No package.json found" -ForegroundColor Yellow
}

# Check 3: TypeScript Type Check
Write-Host "[3/5] Running TypeScript type check..." -ForegroundColor Yellow
$TotalChecks++

if (Test-Path "ui/desktop/tsconfig.json") {
    Push-Location "ui/desktop"
    $typeResult = npx tsc --noEmit 2>&1
    $typeExit = $LASTEXITCODE
    Pop-Location

    if ($typeExit -eq 0) {
        Write-Host "      PASS - No type errors" -ForegroundColor Green
        $PassedChecks++
    } else {
        Write-Host "      FAIL - Type errors found" -ForegroundColor Red
        $FailedChecks++
    }
} else {
    Write-Host "      SKIP - No tsconfig.json found" -ForegroundColor Yellow
}

# Check 4: Rust Clippy
Write-Host "[4/5] Running Rust clippy..." -ForegroundColor Yellow
$TotalChecks++

if (Test-Path "Cargo.toml") {
    $clippyResult = cargo clippy --all-targets -- -D warnings 2>&1
    $clippyExit = $LASTEXITCODE

    if ($clippyExit -eq 0) {
        Write-Host "      PASS - No clippy warnings" -ForegroundColor Green
        $PassedChecks++
    } else {
        Write-Host "      FAIL - Clippy warnings found" -ForegroundColor Red
        $FailedChecks++
    }
} else {
    Write-Host "      SKIP - No Cargo.toml found" -ForegroundColor Yellow
}

# Check 5: Git Status Clean
Write-Host "[5/5] Checking git status..." -ForegroundColor Yellow
$TotalChecks++

$gitStatus = git status --porcelain 2>&1
if ($gitStatus.Length -eq 0) {
    Write-Host "      PASS - No uncommitted changes" -ForegroundColor Green
    $PassedChecks++
} else {
    Write-Host "      INFO - Uncommitted changes detected" -ForegroundColor Yellow
}

# Summary
Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "SUMMARY" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Total Checks: $TotalChecks" -ForegroundColor White
Write-Host "Passed:       $PassedChecks" -ForegroundColor Green
Write-Host "Failed:       $FailedChecks" -ForegroundColor Red
Write-Host ""

if ($FailedChecks -eq 0) {
    Write-Host "ALL CHECKS PASSED" -ForegroundColor Green
    exit 0
} else {
    Write-Host "VALIDATION FAILED - Fix issues before proceeding" -ForegroundColor Red
    exit 1
}
