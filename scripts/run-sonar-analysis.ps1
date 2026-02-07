# Super-Goose SonarQube Analysis Script
# This script runs complete code quality analysis

Write-Host "🔍 Super-Goose SonarQube Analysis" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Continue"
$projectRoot = Split-Path -Parent $PSScriptRoot

# Colors
function Write-Success { Write-Host "✅ $args" -ForegroundColor Green }
function Write-Error-Msg { Write-Host "❌ $args" -ForegroundColor Red }
function Write-Info { Write-Host "ℹ️  $args" -ForegroundColor Yellow }
function Write-Step { Write-Host "📌 $args" -ForegroundColor Cyan }

# Step 1: Check Prerequisites
Write-Step "Step 1: Checking Prerequisites"
Write-Host ""

$prereqsPassed = $true

# Check Rust
try {
    $rustVersion = cargo --version
    Write-Success "Rust/Cargo: $rustVersion"
} catch {
    Write-Error-Msg "Rust/Cargo not found. Install from https://rustup.rs/"
    $prereqsPassed = $false
}

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Success "Node.js: $nodeVersion"
} catch {
    Write-Error-Msg "Node.js not found. Install from https://nodejs.org/"
    $prereqsPassed = $false
}

# Check npm
try {
    $npmVersion = npm --version
    Write-Success "npm: $npmVersion"
} catch {
    Write-Error-Msg "npm not found. Install Node.js"
    $prereqsPassed = $false
}

if (-not $prereqsPassed) {
    Write-Error-Msg "Prerequisites missing. Please install required tools."
    exit 1
}

Write-Host ""
Write-Step "Step 2: Installing Analysis Tools"
Write-Host ""

# Install cargo-tarpaulin for coverage
Write-Info "Installing cargo-tarpaulin (this may take a few minutes)..."
cargo install cargo-tarpaulin --quiet

# Install cargo-audit for security
Write-Info "Installing cargo-audit..."
cargo install cargo-audit --quiet

Write-Success "Analysis tools installed"
Write-Host ""

# Step 3: Rust Analysis
Write-Step "Step 3: Rust Code Analysis"
Write-Host ""

Set-Location "$projectRoot\crates"

# 3.1 Run Clippy
Write-Info "Running Clippy (Rust linter)..."
$clippyStart = Get-Date
cargo clippy --all-targets --message-format=json 2>&1 | Out-File -FilePath "target\clippy-report.json" -Encoding utf8
$clippyDuration = (Get-Date) - $clippyStart

if ($LASTEXITCODE -eq 0) {
    Write-Success "Clippy completed in $($clippyDuration.TotalSeconds)s"
} else {
    Write-Info "Clippy found issues (see target\clippy-report.json)"
}

# 3.2 Run Tests
Write-Info "Running Rust tests..."
$testStart = Get-Date
cargo test --no-fail-fast -- --skip scenario_tests::scenarios::tests 2>&1 | Tee-Object -FilePath "target\test-results.txt"
$testDuration = (Get-Date) - $testStart

if ($LASTEXITCODE -eq 0) {
    Write-Success "Tests passed in $($testDuration.TotalSeconds)s"
} else {
    Write-Error-Msg "Some tests failed (see target\test-results.txt)"
}

# 3.3 Generate Coverage
Write-Info "Generating code coverage (this may take 5-10 minutes)..."
$coverageStart = Get-Date

# Create coverage directory
New-Item -ItemType Directory -Force -Path "target\coverage" | Out-Null

# Run tarpaulin with proper flags
cargo tarpaulin `
    --out Xml `
    --output-dir target\coverage `
    --skip-clean `
    --timeout 300 `
    --exclude-files "*/tests/*" "*/integration_tests.rs" "*_test.rs" `
    -- --skip scenario_tests::scenarios::tests

$coverageDuration = (Get-Date) - $coverageStart

if ($LASTEXITCODE -eq 0) {
    Write-Success "Coverage generated in $($coverageDuration.TotalSeconds)s"

    # Parse coverage percentage
    $coverageXml = Get-Content "target\coverage\cobertura.xml" -Raw
    if ($coverageXml -match 'line-rate="([0-9.]+)"') {
        $coveragePct = [math]::Round([double]$matches[1] * 100, 2)
        Write-Success "Code Coverage: $coveragePct%"
    }
} else {
    Write-Error-Msg "Coverage generation failed"
}

# 3.4 Security Audit
Write-Info "Running security audit..."
cargo audit --json > target\audit-report.json 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Success "Security audit passed"
} else {
    Write-Info "Security issues found (see target\audit-report.json)"
}

Write-Host ""

# Step 4: TypeScript Analysis
Write-Step "Step 4: TypeScript Code Analysis"
Write-Host ""

Set-Location "$projectRoot\ui\desktop"

# 4.1 Install dependencies
Write-Info "Installing npm dependencies..."
npm ci --silent

# 4.2 Run ESLint
Write-Info "Running ESLint..."
npm run lint:report

if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 1) {
    Write-Success "ESLint completed (see eslint-report.json)"
} else {
    Write-Error-Msg "ESLint failed"
}

# 4.3 Run Tests with Coverage
Write-Info "Running TypeScript tests with coverage..."
npm run test:coverage

if ($LASTEXITCODE -eq 0) {
    Write-Success "TypeScript tests passed"

    # Check if coverage file exists
    if (Test-Path "coverage\lcov.info") {
        Write-Success "Coverage report generated"
    }
} else {
    Write-Error-Msg "TypeScript tests failed"
}

# 4.4 npm audit
Write-Info "Running npm security audit..."
npm audit --json > npm-audit-report.json 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Success "npm security audit passed"
} else {
    Write-Info "Security issues found (see npm-audit-report.json)"
}

Write-Host ""

# Step 5: Generate Summary Report
Write-Step "Step 5: Analysis Summary"
Write-Host ""

Set-Location $projectRoot

# Count total files analyzed
$rustFiles = (Get-ChildItem -Path "crates\goose\src" -Recurse -Filter "*.rs" | Measure-Object).Count
$tsFiles = (Get-ChildItem -Path "ui\desktop\src" -Recurse -Filter "*.ts*" | Measure-Object).Count

Write-Host "📊 Analysis Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Files Analyzed:" -ForegroundColor Cyan
Write-Host "  - Rust files:       $rustFiles" -ForegroundColor White
Write-Host "  - TypeScript files: $tsFiles" -ForegroundColor White
Write-Host ""

Write-Host "Generated Reports:" -ForegroundColor Cyan
Write-Host "  - crates\target\clippy-report.json" -ForegroundColor White
Write-Host "  - crates\target\coverage\cobertura.xml" -ForegroundColor White
Write-Host "  - crates\target\audit-report.json" -ForegroundColor White
Write-Host "  - crates\target\test-results.txt" -ForegroundColor White
Write-Host "  - ui\desktop\eslint-report.json" -ForegroundColor White
Write-Host "  - ui\desktop\coverage\lcov.info" -ForegroundColor White
Write-Host "  - ui\desktop\npm-audit-report.json" -ForegroundColor White
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Review all generated reports" -ForegroundColor White
Write-Host "  2. Fix any critical issues found" -ForegroundColor White
Write-Host "  3. Run SonarQube scanner (requires SONAR_TOKEN)" -ForegroundColor White
Write-Host "  4. Verify quality gates pass" -ForegroundColor White
Write-Host ""

# Step 6: Optional SonarQube Scan
if ($env:SONAR_TOKEN -and $env:SONAR_HOST_URL) {
    Write-Step "Step 6: Running SonarQube Scanner"
    Write-Host ""

    Write-Info "SonarQube credentials found. Running scanner..."

    # Check if sonar-scanner is installed
    try {
        $sonarVersion = sonar-scanner --version
        Write-Success "SonarQube Scanner: $sonarVersion"

        # Run scanner
        sonar-scanner `
            -Dsonar.projectKey=super-goose `
            -Dsonar.sources=crates/goose/src,ui/desktop/src `
            -Dsonar.host.url=$env:SONAR_HOST_URL `
            -Dsonar.token=$env:SONAR_TOKEN

        if ($LASTEXITCODE -eq 0) {
            Write-Success "SonarQube analysis uploaded successfully!"
        } else {
            Write-Error-Msg "SonarQube scanner failed"
        }
    } catch {
        Write-Info "SonarQube Scanner not installed. Download from:"
        Write-Info "https://docs.sonarqube.org/latest/analysis/scan/sonarscanner/"
    }
} else {
    Write-Info "SonarQube scan skipped (SONAR_TOKEN not set)"
    Write-Info "To enable: Set environment variables SONAR_TOKEN and SONAR_HOST_URL"
}

Write-Host ""
Write-Host "✅ Analysis Complete!" -ForegroundColor Green
Write-Host ""
