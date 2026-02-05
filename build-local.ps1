# Local Build Script for Goose v1.24.0
# Builds Windows binaries without GitHub Actions

param(
    [switch]$PortableCLI,
    [switch]$Desktop,
    [switch]$All,
    [string]$Version = "1.24.0"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Goose Local Build Script v$Version ===" -ForegroundColor Cyan
Write-Host ""

# Create output directory
$OutputDir = ".\build-output"
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

function Build-PortableCLI {
    Write-Host "Building Portable CLI..." -ForegroundColor Yellow

    # Build binaries
    Write-Host "  - Compiling goose.exe and goosed.exe..."
    cargo build --release --bin goose --bin goosed

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Cargo build failed!" -ForegroundColor Red
        exit 1
    }

    # Package
    Write-Host "  - Packaging portable release..."
    $PortableDir = "$OutputDir\goose-portable-windows-x64"
    New-Item -ItemType Directory -Force -Path $PortableDir | Out-Null

    Copy-Item "target\release\goose.exe" "$PortableDir\"
    Copy-Item "target\release\goosed.exe" "$PortableDir\"
    Copy-Item "README.md" "$PortableDir\"
    Copy-Item "LICENSE" "$PortableDir\"

    # Create zip
    $ZipPath = "$OutputDir\goose-portable-windows-x64-v$Version.zip"
    Compress-Archive -Path $PortableDir -DestinationPath $ZipPath -Force

    Write-Host "  ✓ Created: $ZipPath" -ForegroundColor Green
    Write-Host ""
}

function Build-Desktop {
    Write-Host "Building Desktop App..." -ForegroundColor Yellow

    # Check Node version
    $NodeVersion = (node --version).Trim('v')
    if ([version]$NodeVersion -lt [version]"24.0") {
        Write-Host "  WARNING: Node $NodeVersion detected, need Node 24+" -ForegroundColor Yellow
        Write-Host "  Attempting build anyway..." -ForegroundColor Yellow
    }

    # Build server binary
    Write-Host "  - Building goosed.exe server..."
    cargo build --release --bin goosed

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Server build failed!" -ForegroundColor Red
        exit 1
    }

    # Copy to desktop
    Write-Host "  - Copying server to desktop app..."
    New-Item -ItemType Directory -Force -Path "ui\desktop\src\bin" | Out-Null
    Copy-Item "target\release\goosed.exe" "ui\desktop\src\bin\"

    # Install npm dependencies
    Write-Host "  - Installing npm dependencies..."
    Push-Location "ui\desktop"
    npm ci --legacy-peer-deps

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: npm install failed!" -ForegroundColor Red
        Pop-Location
        exit 1
    }

    # Package
    Write-Host "  - Packaging desktop app..."
    npm run package

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Packaging failed!" -ForegroundColor Red
        Pop-Location
        exit 1
    }

    # Create installer
    Write-Host "  - Creating Windows installer..."
    npm run make

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Installer creation failed!" -ForegroundColor Red
        Pop-Location
        exit 1
    }

    Pop-Location

    # Copy outputs
    Write-Host "  - Copying outputs..."
    if (Test-Path "ui\desktop\out\make") {
        Copy-Item "ui\desktop\out\make\*.exe" "$OutputDir\" -ErrorAction SilentlyContinue
        Copy-Item "ui\desktop\out\*.zip" "$OutputDir\" -ErrorAction SilentlyContinue
    }

    Write-Host "  ✓ Desktop app built!" -ForegroundColor Green
    Write-Host ""
}

function Show-Results {
    Write-Host "=== Build Complete ===" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Output files in: $OutputDir" -ForegroundColor Yellow
    Get-ChildItem $OutputDir -Recurse -File | ForEach-Object {
        $Size = [math]::Round($_.Length / 1MB, 2)
        Write-Host "  - $($_.Name) ($Size MB)"
    }
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Test the binaries"
    Write-Host "  2. Upload to GitHub release: gh release upload v$Version build-output\*.exe build-output\*.zip"
    Write-Host ""
}

# Main execution
if ($All -or (!$PortableCLI -and !$Desktop)) {
    Build-PortableCLI
    Build-Desktop
    Show-Results
} else {
    if ($PortableCLI) {
        Build-PortableCLI
    }
    if ($Desktop) {
        Build-Desktop
    }
    Show-Results
}
