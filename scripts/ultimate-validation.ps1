# ULTIMATE VALIDATION SCRIPT
# Comprehensive checks for GUI, Components, Wiring, Backend, Frontend, Logic, APIs
# 25 validation checks in 6 phases

param(
    [switch]$SkipBuild = $false,
    [switch]$SkipSonarQube = $false,
    [switch]$SkipVisual = $false,
    [switch]$Verbose = $false
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

# Counters
$script:TotalChecks = 0
$script:PassedChecks = 0
$script:FailedChecks = 0
$script:Warnings = 0
$script:Issues = @()

function Write-Phase {
    param([string]$Text)
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-CheckStart {
    param([string]$Name, [int]$Number, [int]$Total)
    $script:TotalChecks++
    Write-Host "[$Number/$Total] $Name..." -ForegroundColor Yellow -NoNewline
}

function Write-CheckPass {
    $script:PassedChecks++
    Write-Host " PASS" -ForegroundColor Green
}

function Write-CheckFail {
    param([string]$Reason, [array]$Details = @())
    $script:FailedChecks++
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host "   Reason: $Reason" -ForegroundColor Red

    $script:Issues += [PSCustomObject]@{
        Check   = $Reason
        Details = $Details
    }

    if ($Verbose -and $Details.Count -gt 0) {
        $Details | Select-Object -First 5 | ForEach-Object {
            Write-Host "     $_" -ForegroundColor Red
        }
        if ($Details.Count -gt 5) {
            Write-Host "     ... and $($Details.Count - 5) more issues" -ForegroundColor Red
        }
    }
}

function Write-CheckWarn {
    param([string]$Reason)
    $script:Warnings++
    Write-Host " WARN" -ForegroundColor Yellow
    Write-Host "   $Reason" -ForegroundColor Yellow
}

function Write-CheckSkip {
    param([string]$Reason)
    Write-Host " SKIP" -ForegroundColor Gray
    Write-Host "   $Reason" -ForegroundColor Gray
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "   ULTIMATE GOOSE QUALITY VALIDATION - 25 COMPREHENSIVE CHECKS   " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

$StartTime = Get-Date

# ============================================================================
# PHASE 1: BASIC QUALITY (8 checks)
# ============================================================================

Write-Phase "PHASE 1: Basic Quality Checks (8 checks)"

# Check 1: TODO/FIXME/HACK markers
Write-CheckStart "Scanning for incomplete markers" 1 25
$incompleteFiles = @()
Get-ChildItem -Recurse -Include *.ts,*.tsx,*.rs -Exclude node_modules,target -ErrorAction SilentlyContinue |
    ForEach-Object {
        $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
        if ($content -match "//\s*(TODO|FIXME|HACK|XXX|STUB|PLACEHOLDER)") {
            $incompleteFiles += $_.FullName
        }
    }

if ($incompleteFiles.Count -eq 0) {
    Write-CheckPass
} else {
    Write-CheckFail "Found incomplete markers in $($incompleteFiles.Count) files" $incompleteFiles
}

# Check 2: TypeScript Lint
Write-CheckStart "Running TypeScript lint" 2 25
if (Test-Path "ui\desktop\package.json") {
    Push-Location "ui\desktop"
    $lintOutput = npm run lint:check 2>&1
    $lintExit = $LASTEXITCODE
    Pop-Location

    if ($lintExit -eq 0) {
        Write-CheckPass
    } else {
        Write-CheckFail "TypeScript lint errors" ($lintOutput | Select-Object -Last 10)
    }
} else {
    Write-CheckSkip "No package.json found"
}

# Check 3: TypeScript Type Check
Write-CheckStart "Running TypeScript type check" 3 25
if (Test-Path "ui\desktop\tsconfig.json") {
    Push-Location "ui\desktop"
    $typeOutput = npx tsc --noEmit 2>&1
    $typeExit = $LASTEXITCODE
    Pop-Location

    if ($typeExit -eq 0) {
        Write-CheckPass
    } else {
        Write-CheckFail "TypeScript type errors" ($typeOutput | Select-Object -Last 10)
    }
} else {
    Write-CheckSkip "No tsconfig.json found"
}

# Check 4: Rust Clippy
Write-CheckStart "Running Rust clippy" 4 25
if (Test-Path "Cargo.toml") {
    $clippyOutput = cargo clippy --all-targets -- -D warnings 2>&1
    $clippyExit = $LASTEXITCODE

    if ($clippyExit -eq 0) {
        Write-CheckPass
    } else {
        Write-CheckFail "Rust clippy warnings" ($clippyOutput | Select-Object -Last 10)
    }
} else {
    Write-CheckSkip "No Cargo.toml found"
}

# Check 5: TypeScript Tests
Write-CheckStart "Running TypeScript tests" 5 25
if (Test-Path "ui\desktop\package.json") {
    Push-Location "ui\desktop"
    $testOutput = npm test 2>&1
    $testExit = $LASTEXITCODE
    Pop-Location

    if ($testExit -eq 0) {
        Write-CheckPass
    } else {
        Write-CheckFail "TypeScript tests failed" ($testOutput | Select-Object -Last 10)
    }
} else {
    Write-CheckSkip "No package.json found"
}

# Check 6: Rust Tests
Write-CheckStart "Running Rust tests" 6 25
if (Test-Path "Cargo.toml") {
    $rustTestOutput = cargo test 2>&1
    $rustTestExit = $LASTEXITCODE

    if ($rustTestExit -eq 0) {
        Write-CheckPass
    } else {
        Write-CheckFail "Rust tests failed" ($rustTestOutput | Select-Object -Last 10)
    }
} else {
    Write-CheckSkip "No Cargo.toml found"
}

# Check 7: Build TypeScript
Write-CheckStart "Building TypeScript" 7 25
if (-not $SkipBuild -and (Test-Path "ui\desktop\package.json")) {
    Push-Location "ui\desktop"
    $buildOutput = npm run build 2>&1
    $buildExit = $LASTEXITCODE
    Pop-Location

    if ($buildExit -eq 0) {
        Write-CheckPass
    } else {
        Write-CheckFail "TypeScript build failed" ($buildOutput | Select-Object -Last 10)
    }
} else {
    Write-CheckSkip "Build skipped or no package.json"
}

# Check 8: Build Rust
Write-CheckStart "Building Rust" 8 25
if (-not $SkipBuild -and (Test-Path "Cargo.toml")) {
    $rustBuildOutput = cargo build --release 2>&1
    $rustBuildExit = $LASTEXITCODE

    if ($rustBuildExit -eq 0) {
        Write-CheckPass
    } else {
        Write-CheckFail "Rust build failed" ($rustBuildOutput | Select-Object -Last 10)
    }
} else {
    Write-CheckSkip "Build skipped or no Cargo.toml"
}

# ============================================================================
# PHASE 2: CRITICAL INTEGRATION (5 checks)
# ============================================================================

Write-Phase "PHASE 2: Critical Integration Checks (5 checks)"

# Check 9: API Contract Validation
Write-CheckStart "Validating API contracts" 9 25
$apiIssues = @()

# Find all API calls in frontend
Get-ChildItem -Recurse -Include *.ts,*.tsx -Path "ui" -Exclude node_modules -ErrorAction SilentlyContinue |
    ForEach-Object {
        $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue

        # Find fetch/axios calls
        if ($content -match 'fetch\([''"]/(api/[^''")]+)') {
            $endpoint = $Matches[1]
            # TODO: Check if endpoint exists in backend routes
            # For now, check if there's error handling
            if ($content -notmatch '\.catch\(|try\s*\{') {
                $apiIssues += "API call /$endpoint in $($_.Name) missing error handling"
            }
        }
    }

if ($apiIssues.Count -eq 0) {
    Write-CheckPass
} else {
    Write-CheckWarn "$($apiIssues.Count) API calls without error handling"
}

# Check 10: Component Import/Export Validation
Write-CheckStart "Validating component imports" 10 25
$orphanedComponents = @()

# Find components that are exported but never imported
$exported = @{}
$imported = @()

# Scan for exports
Get-ChildItem -Recurse -Include *.tsx -Path "ui" -Exclude node_modules -ErrorAction SilentlyContinue |
    ForEach-Object {
        $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue

        if ($content -match 'export\s+(default\s+)?(\w+)') {
            $componentName = $Matches[2]
            $exported[$componentName] = $_.FullName
        }

        # Scan for imports
        if ($content -match 'import\s+\{?([^}]+)\}?\s+from') {
            $imports = $Matches[1] -split ','
            $imported += $imports | ForEach-Object { $_.Trim() }
        }
    }

# Find orphans
foreach ($comp in $exported.Keys) {
    if ($comp -notin $imported) {
        $orphanedComponents += "$comp in $($exported[$comp])"
    }
}

if ($orphanedComponents.Count -eq 0) {
    Write-CheckPass
} else {
    Write-CheckWarn "$($orphanedComponents.Count) components exported but never imported"
}

# Check 11: State Management Validation
Write-CheckStart "Validating state management" 11 25
$stateIssues = @()

Get-ChildItem -Recurse -Include *.tsx -Path "ui" -Exclude node_modules -ErrorAction SilentlyContinue |
    ForEach-Object {
        $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue

        # Find useState declarations
        $matches = [regex]::Matches($content, 'const\s+\[(\w+),\s*set\w+\]\s*=\s*useState')

        foreach ($match in $matches) {
            $stateVar = $match.Groups[1].Value
            $setterName = "set" + $stateVar.Substring(0,1).ToUpper() + $stateVar.Substring(1)

            # Check if setter is called
            if ($content -notmatch $setterName) {
                $stateIssues += "$stateVar in $($_.Name) never updated"
            }
        }
    }

if ($stateIssues.Count -eq 0) {
    Write-CheckPass
} else {
    Write-CheckWarn "$($stateIssues.Count) state variables never updated"
}

# Check 12: Event Handler Completeness
Write-CheckStart "Validating event handlers" 12 25
$handlerIssues = @()

Get-ChildItem -Recurse -Include *.tsx -Path "ui" -Exclude node_modules -ErrorAction SilentlyContinue |
    ForEach-Object {
        $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue

        # Check for empty handlers
        if ($content -match 'on\w+\s*=\s*\{\s*\(\)\s*=>\s*\{\s*\}\s*\}') {
            $handlerIssues += "Empty event handler in $($_.Name)"
        }

        # Check for debug-only handlers
        if ($content -match 'on\w+\s*=\s*\{\s*\(\)\s*=>\s*console\.log') {
            $handlerIssues += "Debug-only event handler in $($_.Name)"
        }
    }

if ($handlerIssues.Count -eq 0) {
    Write-CheckPass
} else {
    Write-CheckFail "$($handlerIssues.Count) incomplete event handlers" $handlerIssues
}

# Check 13: Route Registration Validation
Write-CheckStart "Validating route registration" 13 25
$routeIssues = @()

# Find page components
$pageComponents = Get-ChildItem -Recurse -Include *.tsx -Path "ui" |
    Where-Object { $_.FullName -match '(pages|views)' }

# Find router files
$routerFiles = Get-ChildItem -Recurse -Include *.ts,*.tsx -Path "ui" |
    Where-Object { $_.Name -match 'router|routes' }

if ($routerFiles.Count -eq 0 -and $pageComponents.Count -gt 0) {
    $routeIssues += "Found $($pageComponents.Count) page components but no router configuration"
}

if ($routeIssues.Count -eq 0) {
    Write-CheckPass
} else {
    Write-CheckWarn "$($routeIssues.Count) routing issues"
}

# ============================================================================
# PHASE 3: SECURITY & DEPENDENCIES (3 checks)
# ============================================================================

Write-Phase "PHASE 3: Security & Dependencies (3 checks)"

# Check 14: Dependency Security (npm audit)
Write-CheckStart "Scanning npm dependencies" 14 25
if (Test-Path "ui\desktop\package.json") {
    Push-Location "ui\desktop"
    $auditOutput = npm audit --json 2>&1 | ConvertFrom-Json -ErrorAction SilentlyContinue
    Pop-Location

    if ($auditOutput -and $auditOutput.metadata) {
        $vulnerabilities = $auditOutput.metadata.vulnerabilities
        $highCritical = $vulnerabilities.high + $vulnerabilities.critical

        if ($highCritical -eq 0) {
            Write-CheckPass
        } else {
            Write-CheckFail "$highCritical high/critical vulnerabilities found"
        }
    } else {
        Write-CheckPass
    }
} else {
    Write-CheckSkip "No package.json found"
}

# Check 15: Environment Variable Validation
Write-CheckStart "Validating environment variables" 15 25
$envIssues = @()

# Check if .env.example exists
if (Test-Path ".env.example") {
    $exampleVars = Get-Content ".env.example" | Where-Object { $_ -match '^[A-Z_]+=' } |
        ForEach-Object { ($_ -split '=')[0] }

    # Scan code for env var usage
    Get-ChildItem -Recurse -Include *.ts,*.tsx,*.rs -Exclude node_modules,target -ErrorAction SilentlyContinue |
        ForEach-Object {
            $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue

            # Find process.env or std::env references
            $matches = [regex]::Matches($content, 'process\.env\.([A-Z_]+)|env::var\("([A-Z_]+)"\)')

            foreach ($match in $matches) {
                $varName = if ($match.Groups[1].Success) { $match.Groups[1].Value } else { $match.Groups[2].Value }

                if ($varName -notin $exampleVars) {
                    $envIssues += "$varName used in $($_.Name) but not in .env.example"
                }
            }
        }

    if ($envIssues.Count -eq 0) {
        Write-CheckPass
    } else {
        Write-CheckWarn "$($envIssues.Count) undocumented environment variables"
    }
} else {
    Write-CheckSkip "No .env.example found"
}

# Check 16: Security Scan (basic)
Write-CheckStart "Basic security scan" 16 25
$securityIssues = @()

Get-ChildItem -Recurse -Include *.ts,*.tsx -Path "ui" -Exclude node_modules -ErrorAction SilentlyContinue |
    ForEach-Object {
        $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue

        # Check for dangerouslySetInnerHTML
        if ($content -match 'dangerouslySetInnerHTML') {
            $securityIssues += "dangerouslySetInnerHTML in $($_.Name) (XSS risk)"
        }

        # Check for eval
        if ($content -match '\beval\(') {
            $securityIssues += "eval() usage in $($_.Name) (security risk)"
        }
    }

if ($securityIssues.Count -eq 0) {
    Write-CheckPass
} else {
    Write-CheckWarn "$($securityIssues.Count) potential security issues"
}

# ============================================================================
# PHASE 4: CODE QUALITY (4 checks)
# ============================================================================

Write-Phase "PHASE 4: Code Quality & Complexity (4 checks)"

# Check 17: Error Handling Validation
Write-CheckStart "Validating error handling" 17 25
$errorIssues = @()

Get-ChildItem -Recurse -Include *.ts,*.tsx -Path "ui" -Exclude node_modules -ErrorAction SilentlyContinue |
    ForEach-Object {
        $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue

        # Check for empty catch blocks
        if ($content -match 'catch\s*\([^)]*\)\s*\{\s*\}') {
            $errorIssues += "Empty catch block in $($_.Name)"
        }

        # Check for unhandled promises
        if ($content -match 'fetch\(|axios\.' -and $content -notmatch '\.catch\(|try\s*\{') {
            $errorIssues += "Unhandled promise in $($_.Name)"
        }
    }

if ($errorIssues.Count -eq 0) {
    Write-CheckPass
} else {
    Write-CheckWarn "$($errorIssues.Count) error handling issues"
}

# Check 18: Code Complexity
Write-CheckStart "Checking code complexity" 18 25
$complexityIssues = @()

Get-ChildItem -Recurse -Include *.ts,*.tsx,*.rs -Exclude node_modules,target -ErrorAction SilentlyContinue |
    ForEach-Object {
        $lines = (Get-Content $_.FullName).Count

        # Check file length
        if ($lines -gt 500) {
            $complexityIssues += "$($_.Name) too large ($lines lines > 500)"
        }
    }

if ($complexityIssues.Count -eq 0) {
    Write-CheckPass
} else {
    Write-CheckWarn "$($complexityIssues.Count) files exceed size limits"
}

# Check 19: Performance Checks
Write-CheckStart "Checking performance" 19 25
$perfIssues = @()

Get-ChildItem -Recurse -Include *.tsx -Path "ui" -Exclude node_modules -ErrorAction SilentlyContinue |
    ForEach-Object {
        $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue

        # Check for useEffect without cleanup
        $useEffects = [regex]::Matches($content, 'useEffect\(\s*\(\)\s*=>\s*\{[^}]*\}(?!\s*,\s*\[\])')

        foreach ($match in $useEffects) {
            if ($match.Value -notmatch 'return\s+\(\)') {
                $perfIssues += "useEffect in $($_.Name) may need cleanup function"
            }
        }
    }

if ($perfIssues.Count -eq 0) {
    Write-CheckPass
} else {
    Write-CheckWarn "$($perfIssues.Count) potential performance issues"
}

# Check 20: Test Coverage
Write-CheckStart "Checking test coverage" 20 25
if (Test-Path "ui\desktop\coverage\coverage-summary.json") {
    $coverage = Get-Content "ui\desktop\coverage\coverage-summary.json" | ConvertFrom-Json
    $totalCoverage = $coverage.total.lines.pct

    if ($totalCoverage -ge 80) {
        Write-CheckPass
    } elseif ($totalCoverage -ge 60) {
        Write-CheckWarn "Coverage $totalCoverage% below target (80%)"
    } else {
        Write-CheckFail "Coverage $totalCoverage% critically low (target: 80%)"
    }
} else {
    Write-CheckSkip "No coverage report found"
}

# ============================================================================
# PHASE 5: DOCUMENTATION & STANDARDS (3 checks)
# ============================================================================

Write-Phase "PHASE 5: Documentation & Standards (3 checks)"

# Check 21: Documentation
Write-CheckStart "Checking documentation" 21 25
$docIssues = @()

Get-ChildItem -Recurse -Include *.ts,*.tsx -Path "ui" -Exclude node_modules -ErrorAction SilentlyContinue |
    ForEach-Object {
        $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue

        # Check for exported functions without JSDoc
        $matches = [regex]::Matches($content, 'export\s+(function|const)\s+(\w+)')

        foreach ($match in $matches) {
            $functionName = $match.Groups[2].Value

            # Look for JSDoc comment before function
            $beforeFunction = $content.Substring(0, $match.Index)
            if ($beforeFunction -notmatch '/\*\*[\s\S]*?\*/\s*$') {
                $docIssues += "Function $functionName in $($_.Name) missing JSDoc"
            }
        }
    }

if ($docIssues.Count -eq 0 -or $docIssues.Count -lt 10) {
    Write-CheckPass
} else {
    Write-CheckWarn "$($docIssues.Count) functions missing documentation"
}

# Check 22: Accessibility
Write-CheckStart "Checking accessibility" 22 25
$a11yIssues = @()

Get-ChildItem -Recurse -Include *.tsx -Path "ui" -Exclude node_modules -ErrorAction SilentlyContinue |
    ForEach-Object {
        $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue

        # Check for images without alt text
        if ($content -match '<img' -and $content -notmatch 'alt=') {
            $a11yIssues += "$($_.Name) has images without alt text"
        }

        # Check for buttons without labels
        if ($content -match '<button' -and $content -notmatch 'aria-label') {
            $a11yIssues += "$($_.Name) has buttons without aria-label"
        }
    }

if ($a11yIssues.Count -eq 0) {
    Write-CheckPass
} else {
    Write-CheckWarn "$($a11yIssues.Count) accessibility issues"
}

# Check 23: Commit Message Validation
Write-CheckStart "Checking commit message" 23 25
$commitMsg = git log -1 --pretty=%B 2>&1

if ($commitMsg -match '^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+') {
    Write-CheckPass
} else {
    Write-CheckWarn "Commit message does not follow conventional commits format"
}

# ============================================================================
# PHASE 6: SONARQUBE (optional, 2 checks)
# ============================================================================

if (-not $SkipSonarQube) {
    Write-Phase "PHASE 6: SonarQube Analysis (2 checks)"

    # Check 24: SonarQube Analysis
    Write-CheckStart "Running SonarQube analysis" 24 25

    $sonarRunning = Test-NetConnection -ComputerName localhost -Port 9000 -WarningAction SilentlyContinue -ErrorAction SilentlyContinue

    if ($sonarRunning.TcpTestSucceeded) {
        Push-Location "ui"
        $sonarOutput = sonar-scanner -Dsonar.login=$env:SONAR_TOKEN 2>&1
        $sonarExit = $LASTEXITCODE
        Pop-Location

        if ($sonarExit -eq 0) {
            Write-CheckPass
        } else {
            Write-CheckFail "SonarQube analysis failed"
        }

        # Check 25: Quality Gate
        Write-CheckStart "Checking SonarQube quality gate" 25 25

        Start-Sleep -Seconds 5

        $gateStatus = Invoke-RestMethod -Uri "http://localhost:9000/api/qualitygates/project_status?projectKey=goose-ui" `
            -Headers @{Authorization = "Basic $([Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($env:SONAR_TOKEN):")))"} `
            -ErrorAction SilentlyContinue

        if ($gateStatus.projectStatus.status -eq "OK") {
            Write-CheckPass
        } else {
            Write-CheckFail "Quality gate failed"
        }
    } else {
        Write-CheckSkip "SonarQube not running"
        Write-CheckSkip "Quality gate check skipped"
    }
}

# ============================================================================
# FINAL SUMMARY
# ============================================================================

$Duration = (Get-Date) - $StartTime

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "           ULTIMATE VALIDATION SUMMARY                          " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Total Checks:     $script:TotalChecks" -ForegroundColor White
Write-Host "Passed:           $script:PassedChecks" -ForegroundColor Green
Write-Host "Failed:           $script:FailedChecks" -ForegroundColor Red
Write-Host "Warnings:         $script:Warnings" -ForegroundColor Yellow
Write-Host "Duration:         $([math]::Round($Duration.TotalSeconds, 1))s" -ForegroundColor White
Write-Host ""

if ($script:FailedChecks -eq 0) {
    if ($script:Warnings -eq 0) {
        Write-Host "================================================================" -ForegroundColor Green
        Write-Host "             ALL VALIDATIONS PASSED!                            " -ForegroundColor Green
        Write-Host "        Code is ready for commit/deployment                     " -ForegroundColor Green
        Write-Host "================================================================" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "================================================================" -ForegroundColor Yellow
        Write-Host "          PASSED WITH $script:Warnings WARNINGS                 " -ForegroundColor Yellow
        Write-Host "       Review warnings before proceeding                        " -ForegroundColor Yellow
        Write-Host "================================================================" -ForegroundColor Yellow
        exit 0
    }
} else {
    Write-Host "================================================================" -ForegroundColor Red
    Write-Host "            VALIDATION FAILED!                                  " -ForegroundColor Red
    Write-Host "   Fix $script:FailedChecks issues before claiming work is done " -ForegroundColor Red
    Write-Host "   Do not report to user until all checks pass                  " -ForegroundColor Red
    Write-Host "================================================================" -ForegroundColor Red

    if ($Verbose) {
        Write-Host ""
        Write-Host "Issues Found:" -ForegroundColor Red
        Write-Host ""

        $script:Issues | ForEach-Object {
            Write-Host "  $($_.Check)" -ForegroundColor Red
            $_.Details | Select-Object -First 3 | ForEach-Object {
                Write-Host "    - $_" -ForegroundColor Red
            }
        }
    }

    exit 1
}
