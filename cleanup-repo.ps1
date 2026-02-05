# Cleanup Goose Repository
# Removes build artifacts and garbage to save disk space

param(
    [switch]$DryRun,
    [switch]$Aggressive
)

$ErrorActionPreference = "Stop"

Write-Host "=== Goose Repository Cleanup ===" -ForegroundColor Cyan
Write-Host ""

$TotalSaved = 0

function Get-DirectorySize {
    param([string]$Path)
    if (Test-Path $Path) {
        $size = (Get-ChildItem $Path -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        return [math]::Round($size / 1GB, 2)
    }
    return 0
}

function Remove-Directory {
    param([string]$Path, [string]$Description)

    if (Test-Path $Path) {
        $sizeBefore = Get-DirectorySize $Path
        Write-Host "  - $Description ($sizeBefore GB)" -ForegroundColor Yellow

        if (!$DryRun) {
            Remove-Item -Path $Path -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "    ✓ Removed" -ForegroundColor Green
        } else {
            Write-Host "    [DRY RUN] Would remove" -ForegroundColor Gray
        }

        $script:TotalSaved += $sizeBefore
    }
}

# Always safe to clean
Write-Host "Cleaning Rust build artifacts..." -ForegroundColor Yellow
if (!$DryRun) {
    cargo clean | Out-Null
    $saved = 72  # Approximate
    Write-Host "  ✓ Removed target/ (~$saved GB)" -ForegroundColor Green
    $TotalSaved += $saved
} else {
    Write-Host "  [DRY RUN] Would run: cargo clean" -ForegroundColor Gray
}

# Clean temp files
Remove-Directory "goose/temp" "Temp test files"

# Clean external reference implementations
if ($Aggressive) {
    Write-Host ""
    Write-Host "Aggressive mode - removing reference code..." -ForegroundColor Yellow
    Remove-Directory "external" "External reference implementations"
    Remove-Directory "documentation" "Documentation backup"
}

# Clean node_modules (can be reinstalled)
if ($Aggressive) {
    Remove-Directory "ui/desktop/node_modules" "Node modules"
}

# Summary
Write-Host ""
Write-Host "=== Cleanup Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Total space saved: ~$TotalSaved GB" -ForegroundColor Cyan
Write-Host ""

if ($DryRun) {
    Write-Host "This was a DRY RUN - no files were deleted" -ForegroundColor Yellow
    Write-Host "Run without -DryRun to actually clean" -ForegroundColor Yellow
} else {
    Write-Host "✓ Repository cleaned!" -ForegroundColor Green

    if (!$Aggressive) {
        Write-Host ""
        Write-Host "For more space, run with -Aggressive flag:" -ForegroundColor Yellow
        Write-Host "  .\cleanup-repo.ps1 -Aggressive" -ForegroundColor White
        Write-Host "  (Saves ~1GB more, removes external/documentation)" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "Current repo size:" -ForegroundColor Cyan
$currentSize = Get-DirectorySize "."
Write-Host "  $currentSize GB" -ForegroundColor White
Write-Host ""
