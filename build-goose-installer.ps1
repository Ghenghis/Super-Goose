# Build Goose Desktop Installer (Squirrel.Windows)
# Skips ZIP maker, creates Windows installer only

Write-Host "=== Goose Desktop Installer Build Script ===" -ForegroundColor Cyan
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
}
Write-Host "  Done" -ForegroundColor Green
Write-Host ""

# Step 4: Package only (no makers)
Write-Host "Step 4: Packaging Goose desktop app..." -ForegroundColor Yellow
Set-Location "C:\Users\Admin\Downloads\projects\goose\ui\desktop"
npm run package

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "=== PACKAGING FAILED ===" -ForegroundColor Red
    Write-Host "Exit code: $LASTEXITCODE" -ForegroundColor Red
    exit 1
}

Write-Host "  Package created successfully" -ForegroundColor Green
Write-Host ""

# Step 5: Create ZIP with 7-Zip (avoiding Node.js API issue)
Write-Host "Step 5: Creating portable ZIP with 7-Zip..." -ForegroundColor Yellow
$packageDir = "C:\Users\Admin\Downloads\projects\goose\ui\desktop\out\Goose-win32-x64"
$zipPath = "C:\Users\Admin\Downloads\projects\goose\ui\desktop\out\Goose-win32-x64-portable.zip"
$sevenZip = "C:\Program Files\7-Zip\7z.exe"

if (Test-Path $sevenZip) {
    Write-Host "  Creating ZIP: $zipPath" -ForegroundColor Gray
    & $sevenZip a -tzip $zipPath "$packageDir\*"

    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ZIP created successfully" -ForegroundColor Green
        $zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
        Write-Host "  Size: $zipSize MB" -ForegroundColor Gray
    } else {
        Write-Host "  ZIP creation failed" -ForegroundColor Red
    }
} else {
    Write-Host "  7-Zip not found at $sevenZip" -ForegroundColor Yellow
    Write-Host "  Skipping ZIP creation" -ForegroundColor Yellow
}
Write-Host ""

# Step 6: Show package location
Write-Host "=== BUILD SUCCESSFUL ===" -ForegroundColor Green
Write-Host ""
Write-Host "Package location:" -ForegroundColor Cyan
Write-Host "  $packageDir" -ForegroundColor White
$packageSize = (Get-ChildItem -Path $packageDir -Recurse | Measure-Object -Property Length -Sum).Sum
$packageSizeMB = [math]::Round($packageSize / 1MB, 2)
Write-Host "  Size: $packageSizeMB MB" -ForegroundColor Gray
Write-Host ""

if (Test-Path $zipPath) {
    Write-Host "Portable ZIP:" -ForegroundColor Cyan
    Write-Host "  $zipPath" -ForegroundColor White
    $zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
    Write-Host "  Size: $zipSize MB" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "To run the app:" -ForegroundColor Cyan
Write-Host "  & '$packageDir\Goose.exe'" -ForegroundColor White
Write-Host ""
