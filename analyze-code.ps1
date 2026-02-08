# Super-Goose Complete Analysis
# This runs all code quality checks

$ErrorActionPreference = "Continue"
$projectRoot = $PSScriptRoot

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Super-Goose Code Quality Analysis" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Check if cargo exists
try {
    $cargoVersion = cargo --version
    Write-Host "[OK] Cargo: $cargoVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Cargo not found. Install Rust from https://rustup.rs/" -ForegroundColor Red
    exit 1
}

# Check if node exists
try {
    $nodeVersion = node --version
    Write-Host "[OK] Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js not found. Install from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Installing analysis tools..." -ForegroundColor Yellow

# Install cargo tools
Write-Host "  - Installing cargo-tarpaulin..." -ForegroundColor Gray
cargo install cargo-tarpaulin --quiet 2>&1 | Out-Null

Write-Host "  - Installing cargo-audit..." -ForegroundColor Gray
cargo install cargo-audit --quiet 2>&1 | Out-Null

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Analyzing Rust Code" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

Set-Location "$projectRoot\crates"

# Run Clippy
Write-Host "Running Clippy..." -ForegroundColor Yellow
cargo clippy --all-targets --all-features --message-format=json 2>&1 | Out-File -FilePath "clippy-output.json" -Encoding utf8

# Count warnings
$clippyOutput = Get-Content "clippy-output.json" -Raw
$warningCount = ([regex]::Matches($clippyOutput, '"level":"warning"')).Count
Write-Host "  Clippy warnings: $warningCount" -ForegroundColor $(if($warningCount -eq 0){"Green"}else{"Red"})

# Run tests
Write-Host ""
Write-Host "Running tests..." -ForegroundColor Yellow
cargo test --all-features 2>&1 | Tee-Object -FilePath "test-output.txt"

# Run coverage
Write-Host ""
Write-Host "Generating coverage (this may take 10-15 minutes)..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "coverage" | Out-Null

cargo tarpaulin `
    --out Xml `
    --output-dir coverage `
    --all-features `
    --timeout 300 `
    --skip-clean 2>&1 | Tee-Object -FilePath "coverage\tarpaulin-output.txt"

if (Test-Path "coverage\cobertura.xml") {
    $coverageXml = [xml](Get-Content "coverage\cobertura.xml")
    $lineRate = $coverageXml.'coverage'.'line-rate'
    $coveragePct = [math]::Round([double]$lineRate * 100, 2)
    Write-Host "  Code Coverage: $coveragePct%" -ForegroundColor $(if($coveragePct -ge 97){"Green"}elseif($coveragePct -ge 80){"Yellow"}else{"Red"})
} else {
    Write-Host "  Coverage file not generated" -ForegroundColor Red
}

# Run security audit
Write-Host ""
Write-Host "Running security audit..." -ForegroundColor Yellow
cargo audit --json > audit-report.json 2>&1
$auditOutput = Get-Content "audit-report.json" -Raw | ConvertFrom-Json
$vulnCount = 0
if ($auditOutput.vulnerabilities) {
    $vulnCount = $auditOutput.vulnerabilities.found.Count
}
Write-Host "  Vulnerabilities: $vulnCount" -ForegroundColor $(if($vulnCount -eq 0){"Green"}else{"Red"})

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Analyzing TypeScript Code" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

Set-Location "$projectRoot\ui\desktop"

# Install dependencies
Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
npm ci --silent

# Run ESLint
Write-Host ""
Write-Host "Running ESLint..." -ForegroundColor Yellow
npm run lint:report 2>&1 | Out-Null

if (Test-Path "eslint-report.json") {
    $eslintReport = Get-Content "eslint-report.json" -Raw | ConvertFrom-Json
    $eslintErrors = ($eslintReport | ForEach-Object { $_.errorCount } | Measure-Object -Sum).Sum
    $eslintWarnings = ($eslintReport | ForEach-Object { $_.warningCount } | Measure-Object -Sum).Sum
    Write-Host "  ESLint errors: $eslintErrors" -ForegroundColor $(if($eslintErrors -eq 0){"Green"}else{"Red"})
    Write-Host "  ESLint warnings: $eslintWarnings" -ForegroundColor $(if($eslintWarnings -eq 0){"Green"}else{"Red"})
} else {
    Write-Host "  ESLint report not generated" -ForegroundColor Red
}

# Run tests with coverage
Write-Host ""
Write-Host "Running TypeScript tests..." -ForegroundColor Yellow
npm run test:coverage 2>&1 | Tee-Object -FilePath "test-output.txt"

# Run npm audit
Write-Host ""
Write-Host "Running npm security audit..." -ForegroundColor Yellow
npm audit --json > npm-audit-report.json 2>&1
$npmAuditOutput = Get-Content "npm-audit-report.json" -Raw | ConvertFrom-Json
$npmVulns = 0
if ($npmAuditOutput.metadata) {
    $npmVulns = $npmAuditOutput.metadata.vulnerabilities.total
}
Write-Host "  npm vulnerabilities: $npmVulns" -ForegroundColor $(if($npmVulns -eq 0){"Green"}else{"Red"})

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Analysis Complete" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $projectRoot

Write-Host "Reports generated:" -ForegroundColor Yellow
Write-Host "  - crates/clippy-output.json" -ForegroundColor Gray
Write-Host "  - crates/coverage/cobertura.xml" -ForegroundColor Gray
Write-Host "  - crates/audit-report.json" -ForegroundColor Gray
Write-Host "  - ui/desktop/eslint-report.json" -ForegroundColor Gray
Write-Host "  - ui/desktop/npm-audit-report.json" -ForegroundColor Gray
Write-Host ""
Write-Host "Next: Review reports and start fixing issues" -ForegroundColor Cyan
Write-Host ""
