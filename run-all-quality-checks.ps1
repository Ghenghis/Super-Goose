# Master PowerShell script to run all quality checks in sequence

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " SUPER-GOOSE QUALITY AUTOMATION" -ForegroundColor Cyan
Write-Host " Complete Quality Check Pipeline" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "This will run:" -ForegroundColor White
Write-Host "  1. Fix all Clippy warnings" -ForegroundColor Gray
Write-Host "  2. Verify tests pass" -ForegroundColor Gray
Write-Host "  3. Measure code coverage" -ForegroundColor Gray
Write-Host ""
Write-Host "Total estimated time: 30-45 minutes" -ForegroundColor Yellow
Write-Host ""
Read-Host "Press Enter to continue"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " STEP 1: FIX WARNINGS" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

& "$scriptDir\fix-warnings.ps1"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Warning fixes failed!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " STEP 2: MEASURE COVERAGE" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

& "$scriptDir\measure-coverage.ps1"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Coverage measurement failed!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " ALL STEPS COMPLETE!" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor White
Write-Host "  - Warnings fixed" -ForegroundColor Green
Write-Host "  - Tests verified" -ForegroundColor Green
Write-Host "  - Coverage measured" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Open coverage\index.html to see coverage report" -ForegroundColor Gray
Write-Host "  2. Read coverage-summary.log for overall percentage" -ForegroundColor Gray
Write-Host "  3. Identify files with low coverage" -ForegroundColor Gray
Write-Host "  4. Write targeted tests to reach 97%+" -ForegroundColor Gray
Write-Host ""
Write-Host "Logs created in project root:" -ForegroundColor White
Get-ChildItem -Path $scriptDir -Filter "*-*.log" | ForEach-Object { Write-Host "  - $($_.Name)" -ForegroundColor Gray }

Write-Host ""
Read-Host "Press Enter to exit"
