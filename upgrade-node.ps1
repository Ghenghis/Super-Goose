# Upgrade Node.js to v24
# Fixes the desktop build dependency issues

$NodeVersion = "24.13.0"
$NodeUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-x64.msi"
$TempFile = "$env:TEMP\node-v$NodeVersion-x64.msi"

Write-Host "=== Upgrading Node.js to v$NodeVersion ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "Current version:" -ForegroundColor Yellow
node --version
npm --version

Write-Host ""
Write-Host "Downloading Node.js v$NodeVersion..." -ForegroundColor Yellow
Invoke-WebRequest -Uri $NodeUrl -OutFile $TempFile

Write-Host "Installing..." -ForegroundColor Yellow
Start-Process msiexec.exe -ArgumentList "/i `"$TempFile`" /quiet /norestart" -Wait -NoNewWindow

Write-Host ""
Write-Host "SUCCESS: Node.js v$NodeVersion installed!" -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANT: Restart your terminal to use Node 24!" -ForegroundColor Yellow
Write-Host ""

# Clean up
Remove-Item $TempFile -ErrorAction SilentlyContinue
