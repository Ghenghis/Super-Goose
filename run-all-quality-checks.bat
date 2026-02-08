@echo off
REM Master script to run all quality checks in sequence

echo ============================================================
echo  SUPER-GOOSE QUALITY AUTOMATION
echo  Complete Quality Check Pipeline
echo ============================================================
echo.

cd /d "%~dp0"

echo This will run:
echo   1. Fix all Clippy warnings
echo   2. Verify tests pass
echo   3. Measure code coverage
echo.
echo Total estimated time: 30-45 minutes
echo.
pause

echo.
echo ============================================================
echo  STEP 1: FIX WARNINGS
echo ============================================================
echo.

call fix-warnings.bat

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Warning fixes failed!
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  STEP 2: MEASURE COVERAGE
echo ============================================================
echo.

call measure-coverage.bat

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Coverage measurement failed!
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  ALL STEPS COMPLETE!
echo ============================================================
echo.
echo Summary:
echo   ✓ Warnings fixed
echo   ✓ Tests verified
echo   ✓ Coverage measured
echo.
echo Next steps:
echo   1. Open coverage\index.html to see coverage report
echo   2. Read coverage-summary.log for overall percentage
echo   3. Identify files with low coverage
echo   4. Write targeted tests to reach 97%%+
echo.
echo Logs created in project root:
dir /b *-*.log 2>nul

echo.
pause
