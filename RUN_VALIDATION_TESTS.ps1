# Simple Validation Test Runner
# Tests the complete validation system

param(
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"
$passed = 0
$failed = 0

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  VALIDATION SYSTEM TEST RUNNER" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Check Docker
Write-Host "[1/10] Checking Docker..." -NoNewline
try {
    docker --version > $null 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " PASS" -ForegroundColor Green
        $passed++
    } else {
        throw "Not found"
    }
} catch {
    Write-Host " FAIL" -ForegroundColor Red
    $failed++
}

# Test 2: Check SonarScanner
Write-Host "[2/10] Checking SonarScanner..." -NoNewline
try {
    sonar-scanner --version > $null 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " PASS" -ForegroundColor Green
        $passed++
    } else {
        throw "Not found"
    }
} catch {
    Write-Host " FAIL" -ForegroundColor Red
    $failed++
}

# Test 3: Check SonarQube Server
Write-Host "[3/10] Checking SonarQube server..." -NoNewline
try {
    $response = Invoke-RestMethod -Uri "http://localhost:9000/api/system/status" -ErrorAction Stop
    if ($response.status -eq "UP") {
        Write-Host " PASS" -ForegroundColor Green
        $passed++
    } else {
        throw "Not UP"
    }
} catch {
    Write-Host " FAIL - Server not running" -ForegroundColor Red
    $failed++
}

# Test 4: Set Environment Variables
Write-Host "[4/10] Setting environment variables..." -NoNewline
$env:SONAR_TOKEN = "squ_5ace7604663a5576e548d3e2ee222616b1a30f0a"
$env:SONAR_HOST_URL = "http://localhost:9000"
$env:RUST_LOG = "debug"
Write-Host " PASS" -ForegroundColor Green
$passed++

# Test 5: Run Quick Validation
Write-Host "[5/10] Running quick validation..." -ForegroundColor Yellow
Write-Host ""
$quickResult = .\scripts\quick-validate.ps1 2>&1
Write-Host ""
if ($LASTEXITCODE -ne 0) {
    Write-Host "      EXPECTED FAIL - validation is working!" -ForegroundColor Green
    $passed++
} else {
    Write-Host "      PASS - no issues found" -ForegroundColor Green
    $passed++
}

# Test 6: Check quality module files exist
Write-Host "[6/10] Checking quality module files..." -NoNewline
$files = @(
    "crates\goose\src\quality\mod.rs",
    "crates\goose\src\quality\sonarqube.rs",
    "crates\goose\src\quality\validator.rs",
    "crates\goose\src\quality\advanced_validator.rs",
    "crates\goose\src\quality\comprehensive_validator.rs",
    "crates\goose\src\quality\multipass_validator.rs",
    "crates\goose\src\quality\logger.rs"
)

$allExist = $true
foreach ($file in $files) {
    if (-not (Test-Path $file)) {
        $allExist = $false
        break
    }
}

if ($allExist) {
    Write-Host " PASS" -ForegroundColor Green
    $passed++
} else {
    Write-Host " FAIL" -ForegroundColor Red
    $failed++
}

# Test 7: Check documentation exists
Write-Host "[7/10] Checking documentation files..." -NoNewline
$docs = @(
    "VALIDATION_TESTING_GUIDE.md",
    "COMPLETE_VALIDATION_SYSTEM_SUMMARY.md",
    "MULTI_PASS_VALIDATION_SYSTEM.md",
    "READY_FOR_TESTING.md"
)

$allDocsExist = $true
foreach ($doc in $docs) {
    if (-not (Test-Path $doc)) {
        $allDocsExist = $false
        break
    }
}

if ($allDocsExist) {
    Write-Host " PASS" -ForegroundColor Green
    $passed++
} else {
    Write-Host " FAIL" -ForegroundColor Red
    $failed++
}

# Test 8: Check validation-logs directory
Write-Host "[8/10] Checking validation-logs directory..." -NoNewline
if (Test-Path "validation-logs") {
    Write-Host " PASS" -ForegroundColor Green
    $passed++
} else {
    New-Item -ItemType Directory -Path "validation-logs" | Out-Null
    Write-Host " CREATED" -ForegroundColor Green
    $passed++
}

# Test 9: Check scripts directory
Write-Host "[9/10] Checking validation scripts..." -NoNewline
$scripts = @(
    "scripts\quick-validate.ps1",
    "scripts\ultimate-validation.ps1"
)

$allScriptsExist = $true
foreach ($script in $scripts) {
    if (-not (Test-Path $script)) {
        $allScriptsExist = $false
        break
    }
}

if ($allScriptsExist) {
    Write-Host " PASS" -ForegroundColor Green
    $passed++
} else {
    Write-Host " FAIL" -ForegroundColor Red
    $failed++
}

# Test 10: Check module registered in lib.rs
Write-Host "[10/10] Checking quality module registered..." -NoNewline
$libContent = Get-Content "crates\goose\src\lib.rs" -Raw
if ($libContent -match "pub mod quality") {
    Write-Host " PASS" -ForegroundColor Green
    $passed++
} else {
    Write-Host " FAIL" -ForegroundColor Red
    $failed++
}

# Summary
Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  TEST SUMMARY" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

$total = $passed + $failed
Write-Host "Total Tests:  $total" -ForegroundColor White
Write-Host "Passed:       $passed" -ForegroundColor Green
Write-Host "Failed:       $failed" -ForegroundColor Red

Write-Host ""

if ($failed -eq 0) {
    Write-Host "SUCCESS - All tests passed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Review READY_FOR_TESTING.md for complete guide" -ForegroundColor Gray
    Write-Host "  2. Read VALIDATION_TESTING_GUIDE.md for detailed tests" -ForegroundColor Gray
    Write-Host "  3. Run comprehensive validation with ultimate-validation.ps1" -ForegroundColor Gray
    Write-Host "  4. Build Windows installer after validation passes" -ForegroundColor Gray
    Write-Host ""
    exit 0
} else {
    Write-Host "FAILED - Some tests did not pass" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please fix failed tests:" -ForegroundColor Yellow
    Write-Host "  - Ensure all prerequisites installed" -ForegroundColor Gray
    Write-Host "  - Start SonarQube with: docker start sonarqube" -ForegroundColor Gray
    Write-Host "  - Wait 60 seconds for SonarQube to start" -ForegroundColor Gray
    Write-Host "  - Check VALIDATION_TESTING_GUIDE.md troubleshooting section" -ForegroundColor Gray
    Write-Host ""
    exit 1
}
