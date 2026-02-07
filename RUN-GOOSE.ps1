# Quick Launcher for Goose Desktop App
# Double-click to run or execute from PowerShell

$goosePath = "C:\Users\Admin\Downloads\projects\goose\ui\desktop\out\Goose-win32-x64\Goose.exe"

if (Test-Path $goosePath) {
    Write-Host "🚀 Launching Goose Desktop App..." -ForegroundColor Cyan
    Write-Host "   Location: $goosePath" -ForegroundColor Gray
    Write-Host ""

    Start-Process -FilePath $goosePath

    Write-Host "✅ Goose started!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Tip: Check the system tray if the window doesn't appear." -ForegroundColor Yellow
} else {
    Write-Host "❌ Goose executable not found!" -ForegroundColor Red
    Write-Host "   Expected location: $goosePath" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Please run the build script first:" -ForegroundColor Yellow
    Write-Host "   powershell -ExecutionPolicy Bypass -File build-goose-installer.ps1" -ForegroundColor White
}

# Keep window open for 3 seconds to show message
Start-Sleep -Seconds 3
