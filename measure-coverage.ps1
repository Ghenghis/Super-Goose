# PowerShell script to measure code coverage
# Installs cargo-llvm-cov if needed and generates coverage report

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Measure Code Coverage" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$scriptDir\crates"

Write-Host "[1/3] Checking if cargo-llvm-cov is installed..." -ForegroundColor Yellow
Write-Host ""

$result = C:\Users\Admin\.cargo\bin\cargo.exe llvm-cov --version 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "cargo-llvm-cov not found. Installing..." -ForegroundColor Yellow
    Write-Host "This is a one-time installation that takes 10-15 minutes." -ForegroundColor Gray
    Write-Host ""

    C:\Users\Admin\.cargo\bin\cargo.exe install cargo-llvm-cov 2>&1 | Tee-Object -FilePath "$scriptDir\coverage-install.log"

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Installation failed! Check coverage-install.log" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }

    Write-Host "SUCCESS: cargo-llvm-cov installed! ✓" -ForegroundColor Green
} else {
    Write-Host "cargo-llvm-cov already installed ✓" -ForegroundColor Green
}

Write-Host ""
Write-Host "[2/3] Measuring coverage (this takes 5-10 minutes)..." -ForegroundColor Yellow
Write-Host ""

C:\Users\Admin\.cargo\bin\cargo.exe llvm-cov --html --output-dir coverage 2>&1 | Tee-Object -FilePath "$scriptDir\coverage-measure.log"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Coverage measurement failed! Check coverage-measure.log" -ForegroundColor Red
    Write-Host ""
    Get-Content "$scriptDir\coverage-measure.log" | Select-Object -Last 50
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "SUCCESS: Coverage measured! ✓" -ForegroundColor Green
Write-Host ""

Write-Host "[3/3] Extracting coverage summary..." -ForegroundColor Yellow
Write-Host ""

C:\Users\Admin\.cargo\bin\cargo.exe llvm-cov --summary-only 2>&1 | Tee-Object -FilePath "$scriptDir\coverage-summary.log"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Summary extraction failed" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host " COVERAGE SUMMARY" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
    Get-Content "$scriptDir\coverage-summary.log"
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " COMPLETE" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "HTML Report: crates\coverage\index.html" -ForegroundColor White
Write-Host ""
Write-Host "To view the report:" -ForegroundColor Gray
Write-Host "  start coverage\index.html" -ForegroundColor Gray
Write-Host ""
Write-Host "Logs created:" -ForegroundColor White
Write-Host "  - coverage-measure.log (measurement output)" -ForegroundColor Gray
Write-Host "  - coverage-summary.log (summary)" -ForegroundColor Gray
Write-Host ""

Read-Host "Press Enter to exit"
