@echo off
REM Super-Goose SonarQube Analysis - Batch Wrapper
REM This script runs the PowerShell analysis script

echo.
echo ================================================
echo  Super-Goose SonarQube Analysis
echo ================================================
echo.

REM Check if PowerShell is available
where pwsh >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Using PowerShell Core...
    pwsh -ExecutionPolicy Bypass -File "%~dp0run-sonar-analysis.ps1"
) else (
    where powershell >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        echo Using Windows PowerShell...
        powershell -ExecutionPolicy Bypass -File "%~dp0run-sonar-analysis.ps1"
    ) else (
        echo ERROR: PowerShell not found!
        echo Please install PowerShell to run this script.
        pause
        exit /b 1
    )
)

echo.
echo Analysis script completed.
echo.
pause
