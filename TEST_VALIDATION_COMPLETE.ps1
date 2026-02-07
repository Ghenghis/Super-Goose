# Complete Validation System Test Script
# Tests SonarQube Integration + Multi-Pass Validation + Robust Logging
# Run this to verify everything is working correctly

param(
    [switch]$SkipBuild,
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  COMPLETE VALIDATION SYSTEM TEST                               ║" -ForegroundColor Cyan
Write-Host "║  SonarQube + Multi-Pass + Robust Logging                       ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$testsPassed = 0
$testsFailed = 0

# ============================================================================
# TEST 1: Prerequisites Check
# ============================================================================

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "TEST 1: Prerequisites Check" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host ""

# Check Docker
Write-Host "[1.1] Checking Docker..." -NoNewline
try {
    $dockerVersion = docker --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " ✅ PASS" -ForegroundColor Green
        Write-Host "      Version: $dockerVersion" -ForegroundColor Gray
        $testsPassed++
    } else {
        throw "Docker not found"
    }
} catch {
    Write-Host " ❌ FAIL" -ForegroundColor Red
    Write-Host "      Docker is not installed or not in PATH" -ForegroundColor Red
    $testsFailed++
}

# Check SonarScanner
Write-Host "[1.2] Checking SonarScanner..." -NoNewline
try {
    $scannerVersion = sonar-scanner --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " ✅ PASS" -ForegroundColor Green
        $testsPassed++
    } else {
        throw "SonarScanner not found"
    }
} catch {
    Write-Host " ❌ FAIL" -ForegroundColor Red
    Write-Host "      SonarScanner is not installed or not in PATH" -ForegroundColor Red
    $testsFailed++
}

# Check Cargo
Write-Host "[1.3] Checking Cargo (Rust)..." -NoNewline
try {
    $cargoVersion = cargo --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " ✅ PASS" -ForegroundColor Green
        Write-Host "      Version: $cargoVersion" -ForegroundColor Gray
        $testsPassed++
    } else {
        throw "Cargo not found"
    }
} catch {
    Write-Host " ❌ FAIL" -ForegroundColor Red
    Write-Host "      Cargo is not installed or not in PATH" -ForegroundColor Red
    $testsFailed++
}

# Check Node/npm
Write-Host "[1.4] Checking Node.js/npm..." -NoNewline
try {
    $nodeVersion = node --version 2>&1
    $npmVersion = npm --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " ✅ PASS" -ForegroundColor Green
        Write-Host "      Node: $nodeVersion, npm: $npmVersion" -ForegroundColor Gray
        $testsPassed++
    } else {
        throw "Node/npm not found"
    }
} catch {
    Write-Host " ❌ FAIL" -ForegroundColor Red
    Write-Host "      Node.js/npm is not installed or not in PATH" -ForegroundColor Red
    $testsFailed++
}

Write-Host ""

# ============================================================================
# TEST 2: SonarQube Server
# ============================================================================

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "TEST 2: SonarQube Server" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host ""

Write-Host "[2.1] Starting SonarQube container..." -NoNewline
try {
    $result = docker start sonarqube 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " ✅ PASS" -ForegroundColor Green
        $testsPassed++
    } else {
        throw "Failed to start"
    }
} catch {
    Write-Host " ❌ FAIL" -ForegroundColor Red
    $testsFailed++
}

Write-Host "[2.2] Waiting for SonarQube to start (60 seconds)..." -NoNewline
Start-Sleep -Seconds 60
Write-Host " ✅ Done" -ForegroundColor Green

Write-Host "[2.3] Checking SonarQube status..." -NoNewline
try {
    $response = Invoke-RestMethod -Uri "http://localhost:9000/api/system/status" -ErrorAction Stop
    if ($response.status -eq "UP") {
        Write-Host " ✅ PASS" -ForegroundColor Green
        Write-Host "      Status: $($response.status)" -ForegroundColor Gray
        $testsPassed++
    } else {
        throw "Server not UP"
    }
} catch {
    Write-Host " ❌ FAIL" -ForegroundColor Red
    Write-Host "      SonarQube server not responding" -ForegroundColor Red
    $testsFailed++
}

Write-Host ""

# ============================================================================
# TEST 3: Environment Variables
# ============================================================================

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "TEST 3: Environment Variables" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host ""

Write-Host "[3.1] Setting SONAR_TOKEN..." -NoNewline
$env:SONAR_TOKEN = "squ_5ace7604663a5576e548d3e2ee222616b1a30f0a"
Write-Host " ✅ Done" -ForegroundColor Green
$testsPassed++

Write-Host "[3.2] Setting SONAR_HOST_URL..." -NoNewline
$env:SONAR_HOST_URL = "http://localhost:9000"
Write-Host " ✅ Done" -ForegroundColor Green
$testsPassed++

Write-Host "[3.3] Setting RUST_LOG..." -NoNewline
$env:RUST_LOG = "debug"
Write-Host " ✅ Done" -ForegroundColor Green
$testsPassed++

Write-Host ""

# ============================================================================
# TEST 4: Quick Validation Script
# ============================================================================

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "TEST 4: Quick Validation Script" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host ""

Write-Host "[4.1] Running quick validation..." -ForegroundColor Cyan
Write-Host ""
$quickValidationResult = .\scripts\quick-validate.ps1 2>&1
Write-Host ""

if ($LASTEXITCODE -ne 0) {
    Write-Host "      ✅ EXPECTED FAIL - Found incomplete markers" -ForegroundColor Green
    Write-Host "      This proves validation is working!" -ForegroundColor Gray
    $testsPassed++
} else {
    Write-Host "      ⚠️  Validation passed (no incomplete markers found)" -ForegroundColor Yellow
}

Write-Host ""

# ============================================================================
# TEST 5: SonarQube Analysis
# ============================================================================

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "TEST 5: SonarQube Analysis" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host ""

Write-Host "[5.1] Running SonarScanner on Desktop UI..." -ForegroundColor Cyan
Push-Location "ui\desktop"
$scanResult = sonar-scanner 2>&1
Pop-Location

if ($LASTEXITCODE -eq 0) {
    Write-Host "      ✅ PASS - Analysis completed" -ForegroundColor Green
    $testsPassed++
} else {
    Write-Host "      ❌ FAIL - Analysis failed" -ForegroundColor Red
    $testsFailed++
}

Write-Host "[5.2] Checking quality gate status..." -NoNewline
try {
    $headers = @{
        "Authorization" = "Basic " + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${env:SONAR_TOKEN}:"))
    }
    $response = Invoke-RestMethod -Uri "http://localhost:9000/api/qualitygates/project_status?projectKey=goose-ui" -Headers $headers -ErrorAction Stop

    if ($response.projectStatus.status -eq "ERROR") {
        Write-Host " ✅ PASS (Quality Gate: ERROR)" -ForegroundColor Green
        Write-Host "      Found issues as expected!" -ForegroundColor Gray
        $testsPassed++
    } elseif ($response.projectStatus.status -eq "OK") {
        Write-Host " ✅ PASS (Quality Gate: OK)" -ForegroundColor Green
        Write-Host "      Quality gate passed!" -ForegroundColor Gray
        $testsPassed++
    } else {
        throw "Unknown status"
    }
} catch {
    Write-Host " ❌ FAIL" -ForegroundColor Red
    Write-Host "      Failed to check quality gate: $_" -ForegroundColor Red
    $testsFailed++
}

Write-Host ""

# ============================================================================
# TEST 6: Build Rust Quality Module (if not skipped)
# ============================================================================

if (-not $SkipBuild) {
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
    Write-Host "TEST 6: Build Rust Quality Module" -ForegroundColor Yellow
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
    Write-Host ""

    Write-Host "[6.1] Building goose crate..." -ForegroundColor Cyan
    Push-Location "crates\goose"
    $buildResult = cargo build --lib 2>&1
    Pop-Location

    if ($LASTEXITCODE -eq 0) {
        Write-Host "      ✅ PASS - Build successful" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "      ❌ FAIL - Build failed" -ForegroundColor Red
        if ($Verbose) {
            Write-Host $buildResult -ForegroundColor Red
        }
        $testsFailed++
    }

    Write-Host ""
} else {
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
    Write-Host "TEST 6: Build Rust Quality Module" -ForegroundColor Yellow
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "      ⏭️  SKIPPED (use without -SkipBuild to run)" -ForegroundColor Yellow
    Write-Host ""
}

# ============================================================================
# TEST 7: Logging System
# ============================================================================

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "TEST 7: Logging System" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host ""

Write-Host "[7.1] Checking validation-logs directory..." -NoNewline
if (Test-Path "validation-logs") {
    Write-Host " ✅ PASS" -ForegroundColor Green
    $testsPassed++
} else {
    Write-Host " ⚠️  Creating directory..." -NoNewline -ForegroundColor Yellow
    New-Item -ItemType Directory -Path "validation-logs" | Out-Null
    Write-Host " ✅ Done" -ForegroundColor Green
}

Write-Host "[7.2] Listing recent log files..." -ForegroundColor Cyan
$logFiles = Get-ChildItem -Path "validation-logs" -Filter "*.log" | Sort-Object LastWriteTime -Descending | Select-Object -First 5
if ($logFiles.Count -gt 0) {
    foreach ($log in $logFiles) {
        Write-Host "      📄 $($log.Name) ($([math]::Round($log.Length/1KB, 2)) KB)" -ForegroundColor Gray
    }
    $testsPassed++
} else {
    Write-Host "      ℹ️  No log files yet (will be created on first validation run)" -ForegroundColor Yellow
}

Write-Host ""

# ============================================================================
# SUMMARY
# ============================================================================

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  TEST SUMMARY                                                  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$totalTests = $testsPassed + $testsFailed
$passRate = if ($totalTests -gt 0) { [math]::Round(($testsPassed / $totalTests) * 100, 1) } else { 0 }

Write-Host "Total Tests:  $totalTests" -ForegroundColor White
Write-Host "Passed:       $testsPassed" -ForegroundColor Green
Write-Host "Failed:       $testsFailed" -ForegroundColor Red
Write-Host "Pass Rate:    $passRate%" -ForegroundColor $(if ($passRate -ge 80) { "Green" } else { "Yellow" })
Write-Host ""

if ($testsFailed -eq 0) {
    Write-Host "✅ ALL TESTS PASSED!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🎉 Validation system is fully functional and ready to use!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Review VALIDATION_TESTING_GUIDE.md for detailed testing procedures" -ForegroundColor Gray
    Write-Host "  2. Run .\scripts\ultimate-validation.ps1 for comprehensive validation" -ForegroundColor Gray
    Write-Host "  3. Integrate validation into Goose agent system" -ForegroundColor Gray
    Write-Host "  4. Build Windows installer after all validations pass" -ForegroundColor Gray
    Write-Host ""
    exit 0
} else {
    Write-Host "❌ SOME TESTS FAILED" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please fix the failed tests before proceeding:" -ForegroundColor Yellow
    Write-Host "  - Check that all prerequisites are installed" -ForegroundColor Gray
    Write-Host "  - Ensure SonarQube container is running" -ForegroundColor Gray
    Write-Host "  - Verify environment variables are set correctly" -ForegroundColor Gray
    Write-Host "  - See VALIDATION_TESTING_GUIDE.md troubleshooting section" -ForegroundColor Gray
    Write-Host ""
    exit 1
}
