# PowerShell script to auto-fix all Clippy warnings
# Runs cargo clippy --fix to automatically fix warnings

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Auto-Fix All Clippy Warnings" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$scriptDir\crates"

Write-Host "[1/3] Running clippy --fix to auto-fix warnings..." -ForegroundColor Yellow
Write-Host ""

C:\Users\Admin\.cargo\bin\cargo.exe clippy --fix --allow-dirty --allow-staged --tests --lib 2>&1 | Tee-Object -FilePath "$scriptDir\clippy-fix.log"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Clippy fix failed! Check clippy-fix.log" -ForegroundColor Red
    Write-Host ""
    Get-Content "$scriptDir\clippy-fix.log"
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "[2/3] Verifying fixes with clippy check..." -ForegroundColor Yellow
Write-Host ""

C:\Users\Admin\.cargo\bin\cargo.exe clippy --all-targets -- -D warnings 2>&1 | Tee-Object -FilePath "$scriptDir\clippy-verify.log"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Warnings still remain. See clippy-verify.log" -ForegroundColor Yellow
    Write-Host ""
    Get-Content "$scriptDir\clippy-verify.log" | Select-Object -First 50
} else {
    Write-Host "SUCCESS: Zero warnings! ✓" -ForegroundColor Green
}

Write-Host ""
Write-Host "[3/3] Running tests to verify nothing broke..." -ForegroundColor Yellow
Write-Host ""

C:\Users\Admin\.cargo\bin\cargo.exe test --lib agents::team::enforcer_fix_validation_tests 2>&1 | Tee-Object -FilePath "$scriptDir\test-verify.log"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Tests failed! Check test-verify.log" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
} else {
    Write-Host "SUCCESS: All tests pass! ✓" -ForegroundColor Green
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " COMPLETE" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Logs created:" -ForegroundColor White
Write-Host "  - clippy-fix.log (auto-fix output)" -ForegroundColor Gray
Write-Host "  - clippy-verify.log (verification)" -ForegroundColor Gray
Write-Host "  - test-verify.log (test results)" -ForegroundColor Gray
Write-Host ""

Read-Host "Press Enter to exit"
