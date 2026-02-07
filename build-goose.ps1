# Build Goose Desktop App
# Handles process cleanup and locked files

Write-Host "=== Goose Desktop Build Script ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Kill all Goose and Electron processes
Write-Host "Step 1: Stopping Goose and Electron processes..." -ForegroundColor Yellow
Get-Process | Where-Object {
    $_.ProcessName -match "Goose" -or
    $_.ProcessName -match "electron"
} | ForEach-Object {
    Write-Host "  Killing process: $($_.ProcessName) (PID: $($_.Id))" -ForegroundColor Gray
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}
Write-Host "  Done" -ForegroundColor Green
Write-Host ""

# Step 2: Wait for file handles to release
Write-Host "Step 2: Waiting for file handles to release..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
Write-Host "  Done" -ForegroundColor Green
Write-Host ""

# Step 3: Clean output directory
Write-Host "Step 3: Cleaning output directory..." -ForegroundColor Yellow
$outPath = "C:\Users\Admin\Downloads\projects\goose\ui\desktop\out"
if (Test-Path $outPath) {
    Write-Host "  Removing $outPath" -ForegroundColor Gray
    Remove-Item -Path $outPath -Recurse -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    # If still exists, try again
    if (Test-Path $outPath) {
        Write-Host "  Retrying removal..." -ForegroundColor Gray
        Remove-Item -Path $outPath -Recurse -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
    }
}
Write-Host "  Done" -ForegroundColor Green
Write-Host ""

# Step 4: Build with npm
Write-Host "Step 4: Building Goose desktop app..." -ForegroundColor Yellow
Set-Location "C:\Users\Admin\Downloads\projects\goose\ui\desktop"
npm run make

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=== BUILD SUCCESSFUL ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "Installer location:" -ForegroundColor Cyan
    Get-ChildItem -Path "out\make" -Recurse -Include "*.exe" | ForEach-Object {
        Write-Host "  $($_.FullName)" -ForegroundColor White
        $size = [math]::Round($_.Length / 1MB, 2)
        Write-Host "  Size: $size MB" -ForegroundColor Gray
    }
} else {
    Write-Host ""
    Write-Host "=== BUILD FAILED ===" -ForegroundColor Red
    Write-Host "Exit code: $LASTEXITCODE" -ForegroundColor Red
}
