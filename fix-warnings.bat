@echo off
REM Batch script to auto-fix all Clippy warnings
REM Runs cargo clippy --fix to automatically fix warnings

echo ============================================================
echo  Auto-Fix All Clippy Warnings
echo ============================================================
echo.

cd /d "%~dp0crates"

echo [1/3] Running clippy --fix to auto-fix warnings...
echo.

C:\Users\Admin\.cargo\bin\cargo.exe clippy --fix --allow-dirty --allow-staged --tests --lib 2>&1 > "%~dp0clippy-fix.log"

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Clippy fix failed! Check clippy-fix.log
    echo.
    type "%~dp0clippy-fix.log"
    pause
    exit /b 1
)

echo [2/3] Verifying fixes with clippy check...
echo.

C:\Users\Admin\.cargo\bin\cargo.exe clippy --all-targets -- -D warnings 2>&1 > "%~dp0clippy-verify.log"

if %ERRORLEVEL% NEQ 0 (
    echo Warnings still remain. See clippy-verify.log
    echo.
    type "%~dp0clippy-verify.log"
) else (
    echo SUCCESS: Zero warnings! ✓
)

echo.
echo [3/3] Running tests to verify nothing broke...
echo.

C:\Users\Admin\.cargo\bin\cargo.exe test --lib agents::team::enforcer_fix_validation_tests 2>&1 > "%~dp0test-verify.log"

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Tests failed! Check test-verify.log
    pause
    exit /b 1
) else (
    echo SUCCESS: All tests pass! ✓
)

echo.
echo ============================================================
echo  COMPLETE
echo ============================================================
echo.
echo Logs created:
echo   - clippy-fix.log (auto-fix output)
echo   - clippy-verify.log (verification)
echo   - test-verify.log (test results)
echo.

pause
