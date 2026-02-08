@echo off
REM Batch script to measure code coverage
REM Installs cargo-llvm-cov if needed and generates coverage report

echo ============================================================
echo  Measure Code Coverage
echo ============================================================
echo.

cd /d "%~dp0crates"

echo [1/3] Checking if cargo-llvm-cov is installed...
echo.

C:\Users\Admin\.cargo\bin\cargo.exe llvm-cov --version >nul 2>&1

if %ERRORLEVEL% NEQ 0 (
    echo cargo-llvm-cov not found. Installing...
    echo This is a one-time installation that takes 10-15 minutes.
    echo.
    
    C:\Users\Admin\.cargo\bin\cargo.exe install cargo-llvm-cov 2>&1 > "%~dp0coverage-install.log"
    
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Installation failed! Check coverage-install.log
        pause
        exit /b 1
    )
    
    echo SUCCESS: cargo-llvm-cov installed! ✓
) else (
    echo cargo-llvm-cov already installed ✓
)

echo.
echo [2/3] Measuring coverage (this takes 5-10 minutes)...
echo.

C:\Users\Admin\.cargo\bin\cargo.exe llvm-cov --html --output-dir coverage 2>&1 > "%~dp0coverage-measure.log"

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Coverage measurement failed! Check coverage-measure.log
    echo.
    type "%~dp0coverage-measure.log"
    pause
    exit /b 1
)

echo SUCCESS: Coverage measured! ✓
echo.

echo [3/3] Extracting coverage summary...
echo.

C:\Users\Admin\.cargo\bin\cargo.exe llvm-cov --summary-only 2>&1 > "%~dp0coverage-summary.log"

if %ERRORLEVEL% NEQ 0 (
    echo Warning: Summary extraction failed
) else (
    echo.
    echo ============================================================
    echo  COVERAGE SUMMARY
    echo ============================================================
    echo.
    type "%~dp0coverage-summary.log"
)

echo.
echo ============================================================
echo  COMPLETE
echo ============================================================
echo.
echo HTML Report: crates\coverage\index.html
echo.
echo To view the report:
echo   start coverage\index.html
echo.
echo Logs created:
echo   - coverage-measure.log (measurement output)
echo   - coverage-summary.log (summary)
echo.

pause
