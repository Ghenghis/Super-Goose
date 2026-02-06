# Goose Local CI - Run all checks before pushing
# Usage: .\scripts\local-ci.ps1
# Equivalent to the GitLab CI pipeline but runs on your Windows machine

param(
    [switch]$SkipBuild,
    [switch]$SkipTest,
    [switch]$FixMode
)

$ErrorActionPreference = "Stop"
$exitCode = 0

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Pass($msg) { Write-Host "  PASS: $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "  FAIL: $msg" -ForegroundColor Red; $script:exitCode = 1 }

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Push-Location $projectRoot

try {
    Write-Host "`nGoose Local CI Pipeline" -ForegroundColor Yellow
    Write-Host "======================" -ForegroundColor Yellow

    # 1. Rust Format Check
    Write-Step "1/6 Rust Format Check"
    if ($FixMode) {
        cargo fmt --all
        Write-Pass "cargo fmt applied"
    } else {
        cargo fmt --check
        if ($LASTEXITCODE -eq 0) { Write-Pass "cargo fmt" } else { Write-Fail "cargo fmt --check" }
    }

    # 2. Rust Clippy Lint
    Write-Step "2/6 Rust Clippy Lint"
    if ($FixMode) {
        cargo clippy --no-default-features --all-targets --fix --allow-dirty --allow-staged -- -D warnings
        if ($LASTEXITCODE -eq 0) { Write-Pass "clippy (auto-fixed)" } else { Write-Fail "clippy --fix" }
    } else {
        cargo clippy --no-default-features --all-targets -- -D warnings
        if ($LASTEXITCODE -eq 0) { Write-Pass "clippy" } else { Write-Fail "clippy" }
    }

    # 3. Rust Build
    if (-not $SkipBuild) {
        Write-Step "3/6 Rust Build"
        cargo build --release
        if ($LASTEXITCODE -eq 0) { Write-Pass "cargo build --release" } else { Write-Fail "cargo build" }
    } else {
        Write-Step "3/6 Rust Build (SKIPPED)"
    }

    # 4. Rust Tests
    if (-not $SkipTest) {
        Write-Step "4/6 Rust Tests"
        cargo test --no-default-features -- --skip scenario_tests::scenarios::tests
        if ($LASTEXITCODE -eq 0) { Write-Pass "cargo test" } else { Write-Fail "cargo test" }
    } else {
        Write-Step "4/6 Rust Tests (SKIPPED)"
    }

    # 5. OpenAPI Schema Check
    Write-Step "5/6 OpenAPI Schema Check"
    cargo run -p goose-server --bin generate_schema 2>$null
    if ($LASTEXITCODE -eq 0) {
        $diff = git diff --ignore-space-change --exit-code ui/desktop/openapi.json ui/desktop/src/api/ 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Pass "OpenAPI schema up-to-date"
        } else {
            Write-Fail "OpenAPI schema out of sync - run: just generate-openapi"
        }
    } else {
        Write-Fail "generate_schema failed"
    }

    # 6. TypeScript/UI Lint (if node_modules exists)
    Write-Step "6/6 Desktop UI Lint"
    if (Test-Path "ui/desktop/node_modules") {
        Push-Location ui/desktop
        npm run lint:check
        if ($LASTEXITCODE -eq 0) { Write-Pass "UI lint" } else { Write-Fail "UI lint" }
        Pop-Location
    } else {
        Write-Host "  SKIP: node_modules not installed (run: cd ui/desktop && npm install)" -ForegroundColor Yellow
    }

    # Summary
    Write-Host "`n======================" -ForegroundColor Yellow
    if ($exitCode -eq 0) {
        Write-Host "ALL CHECKS PASSED - safe to push" -ForegroundColor Green
    } else {
        Write-Host "SOME CHECKS FAILED - fix before pushing" -ForegroundColor Red
    }

} finally {
    Pop-Location
}

exit $exitCode
