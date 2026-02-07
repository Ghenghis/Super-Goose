# 🧪 Complete Testing Guide for SonarQube & Multi-Pass Validation System

## 🎯 Executive Summary

This guide provides comprehensive testing procedures for:
1. **SonarQube Integration** - Quality gate enforcement
2. **Multi-Pass Validation System** - State-of-the-art recursive validation
3. **Robust Logging System** - Smart logging showing issues, relationships, and affected components

---

## 📋 Table of Contents

1. [Testing Prerequisites](#testing-prerequisites)
2. [SonarQube Integration Testing](#sonarqube-integration-testing)
3. [Multi-Pass Validation System Testing](#multi-pass-validation-system-testing)
4. [Robust Logging System](#robust-logging-system)
5. [Windows Build Testing](#windows-build-testing)
6. [End-to-End Integration Testing](#end-to-end-integration-testing)
7. [Performance Testing](#performance-testing)
8. [Troubleshooting Guide](#troubleshooting-guide)

---

## 🔧 Testing Prerequisites

### 1. Environment Setup

```powershell
# Verify all tools are installed
docker --version          # Should show Docker version
sonar-scanner --version   # Should show SonarScanner CLI version
cargo --version           # Should show Rust version
node --version            # Should show Node.js version
npm --version             # Should show npm version
```

### 2. Start SonarQube Server

```powershell
# Start SonarQube container
cd C:\Users\Admin\Downloads\projects\goose
docker start sonarqube

# Wait 60 seconds for startup
Start-Sleep -Seconds 60

# Verify server is running
curl http://localhost:9000/api/system/status
# Should return: {"status":"UP"}
```

### 3. Environment Variables

```powershell
# Set required environment variables
$env:SONAR_TOKEN = "squ_5ace7604663a5576e548d3e2ee222616b1a30f0a"
$env:SONAR_HOST_URL = "http://localhost:9000"
$env:RUST_LOG = "debug"  # Enable detailed Rust logging
$env:NODE_ENV = ""       # Ensure development mode
```

---

## 🔍 SonarQube Integration Testing

### Test 1: Basic SonarQube Analysis

```powershell
# Test 1.1: Desktop UI Analysis
cd C:\Users\Admin\Downloads\projects\goose\ui\desktop
sonar-scanner

# EXPECTED RESULT:
# - Analysis completes successfully
# - Quality gate status returned
# - Metrics uploaded to server
# - Log file created: .scannerwork/report-task.txt

# Verify results
curl -u "$env:SONAR_TOKEN:" "http://localhost:9000/api/qualitygates/project_status?projectKey=goose-ui"
# Should return: {"projectStatus":{"status":"OK"}} or {"projectStatus":{"status":"ERROR"}}
```

### Test 1.2: Backend Rust Analysis

```powershell
# Generate coverage for Rust code
cd C:\Users\Admin\Downloads\projects\goose
cargo install cargo-llvm-cov
cargo llvm-cov --all-features --workspace --lcov --output-path=lcov.info

# Run SonarScanner on root
sonar-scanner

# EXPECTED RESULT:
# - Rust files analyzed
# - Coverage data uploaded
# - Quality gate evaluated
```

### Test 2: Quality Gate Enforcement

```powershell
# Test 2.1: Intentionally Introduce Issue
cd C:\Users\Admin\Downloads\projects\goose\ui\desktop\src

# Create test file with issues
@"
// TODO: Fix this later
function badFunction() {
  var x = 1;  // var instead of const/let
  console.log(x);
  console.log(x);  // Duplicate code
  console.log(x);  // Duplicate code
}
"@ | Out-File -FilePath "test-quality-fail.ts"

# Run analysis
cd C:\Users\Admin\Downloads\projects\goose\ui\desktop
sonar-scanner

# Check quality gate
curl -u "$env:SONAR_TOKEN:" "http://localhost:9000/api/qualitygates/project_status?projectKey=goose-ui"

# EXPECTED RESULT:
# - Quality gate should FAIL
# - Response: {"projectStatus":{"status":"ERROR"}}
# - Issues should be visible in SonarQube UI

# Clean up test file
Remove-Item "src\test-quality-fail.ts"
```

### Test 3: Quality Metrics Retrieval

```powershell
# Test Rust quality module's SonarQube integration
cd C:\Users\Admin\Downloads\projects\goose

# Create test script
@"
use goose::quality::{SonarQubeConfig, QualityGateStatus};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = SonarQubeConfig {
        host_url: "http://localhost:9000".to_string(),
        token: "squ_5ace7604663a5576e548d3e2ee222616b1a30f0a".to_string(),
        project_key: "goose-ui".to_string(),
    };

    println!("🔍 Testing SonarQube Integration...");

    // Test 1: Get Quality Gate Status
    match config.check_quality_gate().await {
        Ok(status) => {
            println!("✅ Quality Gate Status: {:?}", status);
        },
        Err(e) => {
            println!("❌ Failed to check quality gate: {}", e);
        }
    }

    // Test 2: Get Metrics
    match config.get_metrics(&["bugs", "vulnerabilities", "code_smells", "coverage", "duplicated_lines_density"]).await {
        Ok(metrics) => {
            println!("📊 Metrics Retrieved:");
            for (key, value) in metrics {
                println!("   - {}: {}", key, value);
            }
        },
        Err(e) => {
            println!("❌ Failed to get metrics: {}", e);
        }
    }

    Ok(())
}
"@ | Out-File -FilePath "crates\goose\examples\test_sonarqube.rs"

# Run test
cargo run --example test_sonarqube

# EXPECTED OUTPUT:
# 🔍 Testing SonarQube Integration...
# ✅ Quality Gate Status: OK (or ERROR)
# 📊 Metrics Retrieved:
#    - bugs: 0
#    - vulnerabilities: 0
#    - code_smells: 15
#    - coverage: 12.2
#    - duplicated_lines_density: 0.0
```

---

## 🔄 Multi-Pass Validation System Testing

### Test 4: Quick Validation Script (Baseline)

```powershell
# Test the working validation script first
cd C:\Users\Admin\Downloads\projects\goose
.\scripts\quick-validate.ps1

# EXPECTED RESULT:
# ===== GOOSE QUALITY VALIDATION =====
# [1/5] Scanning for TODO/FIXME/HACK markers...
#       FAIL - Found incomplete markers in 216 files
# [2/5] Running TypeScript lint...
#       PASS - No lint errors
# [3/5] Running TypeScript type check...
#       PASS - No type errors
# [4/5] Running Rust clippy...
#       PASS - No clippy warnings
# [5/5] Checking git status...
#       INFO - Uncommitted changes detected
#
# VALIDATION FAILED - Fix issues before proceeding

# Log location: Console output only (no file)
```

### Test 5: Ultimate Validation Script (25 Checks)

```powershell
# Run comprehensive 25-check validation
cd C:\Users\Admin\Downloads\projects\goose
.\scripts\ultimate-validation.ps1 -Verbose

# EXPECTED RESULT:
#
# ╔════════════════════════════════════════════╗
# ║  ULTIMATE VALIDATION SYSTEM v1.0           ║
# ║  25 Comprehensive Checks                   ║
# ╚════════════════════════════════════════════╝
#
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASE 1: BASIC QUALITY (8 checks)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# [1/25] Incomplete markers scan...
#        ❌ FAIL - 216 files with TODO/FIXME/HACK
#        Log: validation-logs\incomplete-markers-2025-02-06-20-15-30.log
#
# [2/25] Syntax validation...
#        ✅ PASS
#
# ... (all 25 checks)
#
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SUMMARY
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Total Checks:  25
# Passed:        18
# Failed:         7
# Warnings:       0
#
# ❌ VALIDATION FAILED
#
# Log directory: C:\Users\Admin\Downloads\projects\goose\validation-logs

# Check log files
ls validation-logs\
```

### Test 6: Multi-Pass Validator (Rust Module)

```powershell
# Create test example for multi-pass validator
cd C:\Users\Admin\Downloads\projects\goose

@"
use goose::quality::MultiPassValidator;
use std::path::PathBuf;

#[tokio::main]
async fn main() -> Result<(), String> {
    env_logger::init();

    println!("🔄 Testing Multi-Pass Validation System...\n");

    // Test files (using real project files)
    let files = vec![
        "ui/desktop/src/main.ts".to_string(),
        "ui/desktop/src/App.tsx".to_string(),
        "crates/goose/src/lib.rs".to_string(),
    ];

    let mut validator = MultiPassValidator::new();

    println!("📝 Starting multi-pass validation on {} files...", files.len());
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    match validator.validate_with_fixes(&files).await {
        Ok(report) => {
            println!("✅ Validation Complete!\n");
            println!("📊 FINAL REPORT:");
            println!("   Iterations: {}", report.iterations);
            println!("   Total Time: {:?}", report.total_duration);
            println!("   Passes: {}", report.verification.passes.len());
            println!("   Clean: {}", report.verification.is_clean());
            println!("\n   Pass Results:");
            for (name, result) in &report.verification.passes {
                let status = if result.is_ok() { "✅" } else { "❌" };
                println!("      {} {}: {} failures", status, name,
                         result.as_ref().map_or(0, |r| r.failures));
            }
        },
        Err(e) => {
            println!("❌ Validation Failed: {}\n", e);
        }
    }

    Ok(())
}
"@ | Out-File -FilePath "crates\goose\examples\test_multipass.rs"

# Build and run test
cargo build --example test_multipass
cargo run --example test_multipass

# EXPECTED OUTPUT:
# 🔄 Testing Multi-Pass Validation System...
#
# 📝 Starting multi-pass validation on 3 files...
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# [DEBUG] ITERATION 1 starting...
# [DEBUG] Pass 1: Pre-flight check... ✅ PASS
# [DEBUG] Pass 2: Syntax validation... ❌ FAIL (15 issues)
# [DEBUG] Pass 3: Integration check... ❌ FAIL (20 issues)
# [DEBUG] Pass 4: Quality check... ❌ FAIL (10 issues)
# [DEBUG] Pass 5: Build check... ❌ FAIL (5 issues)
# [DEBUG] Auto-fixing 30 issues...
# [DEBUG] Fixed 20 issues successfully
#
# [DEBUG] ITERATION 2 starting...
# [DEBUG] Regression check: ✅ NO REGRESSION
# [DEBUG] Pass 1-5: Running all passes...
# [DEBUG] Found 10 remaining issues
# [DEBUG] Auto-fixing...
#
# [DEBUG] ITERATION 3 starting...
# [DEBUG] All passes clean!
# [DEBUG] Pass 6: Final verification... ✅ CLEAN
#
# ✅ Validation Complete!
#
# 📊 FINAL REPORT:
#    Iterations: 3
#    Total Time: 45.2s
#    Passes: 6
#    Clean: true
#
#    Pass Results:
#       ✅ pre_flight: 0 failures
#       ✅ syntax: 0 failures
#       ✅ integration: 0 failures
#       ✅ quality: 0 failures
#       ✅ build: 0 failures
#       ✅ verification: 0 failures
```

---

## 📝 Robust Logging System

### Enhanced Logging Configuration

Create `crates\goose\src\quality\logger.rs`:

```rust
//! Smart Logging System for Quality Validation
//! Provides detailed, structured logging with issue tracking and relationship mapping

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use chrono::Local;

pub struct ValidationLogger {
    log_dir: PathBuf,
    current_log_file: Option<File>,
    issues: HashMap<String, Vec<IssueDetail>>,
}

#[derive(Debug, Clone)]
pub struct IssueDetail {
    pub file: String,
    pub line: Option<usize>,
    pub issue_type: String,
    pub severity: Severity,
    pub message: String,
    pub related_files: Vec<String>,
    pub affected_components: Vec<String>,
    pub fix_suggestion: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Severity {
    Critical,  // Blocks release
    High,      // Must fix before merge
    Medium,    // Should fix soon
    Low,       // Nice to have
    Info,      // Informational only
}

impl ValidationLogger {
    pub fn new() -> Result<Self, String> {
        let log_dir = PathBuf::from("validation-logs");
        fs::create_dir_all(&log_dir)
            .map_err(|e| format!("Failed to create log directory: {}", e))?;

        Ok(Self {
            log_dir,
            current_log_file: None,
            issues: HashMap::new(),
        })
    }

    /// Start a new validation run with timestamped log file
    pub fn start_validation_run(&mut self, run_name: &str) -> Result<(), String> {
        let timestamp = Local::now().format("%Y-%m-%d-%H-%M-%S");
        let log_file_path = self.log_dir.join(format!("{}-{}.log", run_name, timestamp));

        let mut file = File::create(&log_file_path)
            .map_err(|e| format!("Failed to create log file: {}", e))?;

        writeln!(file, "╔════════════════════════════════════════════════════════════════╗")
            .map_err(|e| e.to_string())?;
        writeln!(file, "║  GOOSE VALIDATION LOG                                          ║")
            .map_err(|e| e.to_string())?;
        writeln!(file, "║  Run: {}                                           ║", run_name)
            .map_err(|e| e.to_string())?;
        writeln!(file, "║  Started: {}                           ║", Local::now().format("%Y-%m-%d %H:%M:%S"))
            .map_err(|e| e.to_string())?;
        writeln!(file, "╚════════════════════════════════════════════════════════════════╝")
            .map_err(|e| e.to_string())?;
        writeln!(file).map_err(|e| e.to_string())?;

        self.current_log_file = Some(file);
        self.issues.clear();

        println!("📝 Log file created: {}", log_file_path.display());
        Ok(())
    }

    /// Log an issue with full context
    pub fn log_issue(&mut self, detail: IssueDetail) -> Result<(), String> {
        let severity_icon = match detail.severity {
            Severity::Critical => "🔴",
            Severity::High => "🟠",
            Severity::Medium => "🟡",
            Severity::Low => "🔵",
            Severity::Info => "ℹ️",
        };

        // Add to issues collection
        self.issues.entry(detail.issue_type.clone())
            .or_insert_with(Vec::new)
            .push(detail.clone());

        // Write to log file
        if let Some(file) = &mut self.current_log_file {
            writeln!(file, "{} {} - {}", severity_icon, detail.issue_type, detail.file)
                .map_err(|e| e.to_string())?;

            if let Some(line) = detail.line {
                writeln!(file, "   Line: {}", line).map_err(|e| e.to_string())?;
            }

            writeln!(file, "   Message: {}", detail.message).map_err(|e| e.to_string())?;

            if !detail.related_files.is_empty() {
                writeln!(file, "   Related Files:").map_err(|e| e.to_string())?;
                for related in &detail.related_files {
                    writeln!(file, "      - {}", related).map_err(|e| e.to_string())?;
                }
            }

            if !detail.affected_components.is_empty() {
                writeln!(file, "   Affected Components:").map_err(|e| e.to_string())?;
                for component in &detail.affected_components {
                    writeln!(file, "      - {}", component).map_err(|e| e.to_string())?;
                }
            }

            if let Some(fix) = &detail.fix_suggestion {
                writeln!(file, "   💡 Suggested Fix: {}", fix).map_err(|e| e.to_string())?;
            }

            writeln!(file).map_err(|e| e.to_string())?;
        }

        // Also print to console with color
        println!("{} {} in {}", severity_icon, detail.issue_type, detail.file);
        if !detail.affected_components.is_empty() {
            println!("   Affects: {}", detail.affected_components.join(", "));
        }

        Ok(())
    }

    /// Generate summary report showing relationships and impact
    pub fn generate_summary(&mut self) -> Result<(), String> {
        if let Some(file) = &mut self.current_log_file {
            writeln!(file, "\n╔════════════════════════════════════════════════════════════════╗")
                .map_err(|e| e.to_string())?;
            writeln!(file, "║  VALIDATION SUMMARY                                            ║")
                .map_err(|e| e.to_string())?;
            writeln!(file, "╚════════════════════════════════════════════════════════════════╝\n")
                .map_err(|e| e.to_string())?;

            // Count by severity
            let mut severity_counts: HashMap<Severity, usize> = HashMap::new();
            for issues_list in self.issues.values() {
                for issue in issues_list {
                    *severity_counts.entry(issue.severity.clone()).or_insert(0) += 1;
                }
            }

            writeln!(file, "Issues by Severity:").map_err(|e| e.to_string())?;
            writeln!(file, "  🔴 Critical:  {}", severity_counts.get(&Severity::Critical).unwrap_or(&0))
                .map_err(|e| e.to_string())?;
            writeln!(file, "  🟠 High:      {}", severity_counts.get(&Severity::High).unwrap_or(&0))
                .map_err(|e| e.to_string())?;
            writeln!(file, "  🟡 Medium:    {}", severity_counts.get(&Severity::Medium).unwrap_or(&0))
                .map_err(|e| e.to_string())?;
            writeln!(file, "  🔵 Low:       {}", severity_counts.get(&Severity::Low).unwrap_or(&0))
                .map_err(|e| e.to_string())?;
            writeln!(file, "  ℹ️  Info:      {}", severity_counts.get(&Severity::Info).unwrap_or(&0))
                .map_err(|e| e.to_string())?;
            writeln!(file).map_err(|e| e.to_string())?;

            // Issues by type
            writeln!(file, "Issues by Type:").map_err(|e| e.to_string())?;
            for (issue_type, issues_list) in &self.issues {
                writeln!(file, "  {}: {} issues", issue_type, issues_list.len())
                    .map_err(|e| e.to_string())?;
            }
            writeln!(file).map_err(|e| e.to_string())?;

            // Component impact analysis
            let mut component_impact: HashMap<String, usize> = HashMap::new();
            for issues_list in self.issues.values() {
                for issue in issues_list {
                    for component in &issue.affected_components {
                        *component_impact.entry(component.clone()).or_insert(0) += 1;
                    }
                }
            }

            if !component_impact.is_empty() {
                writeln!(file, "Component Impact Analysis:").map_err(|e| e.to_string())?;
                let mut sorted: Vec<_> = component_impact.iter().collect();
                sorted.sort_by(|a, b| b.1.cmp(a.1));
                for (component, count) in sorted.iter().take(10) {
                    writeln!(file, "  {} - {} issues", component, count)
                        .map_err(|e| e.to_string())?;
                }
            }

            writeln!(file, "\n╔════════════════════════════════════════════════════════════════╗")
                .map_err(|e| e.to_string())?;
            writeln!(file, "║  END OF VALIDATION LOG                                         ║")
                .map_err(|e| e.to_string())?;
            writeln!(file, "║  Completed: {}                         ║",
                     Local::now().format("%Y-%m-%d %H:%M:%S"))
                .map_err(|e| e.to_string())?;
            writeln!(file, "╚════════════════════════════════════════════════════════════════╝")
                .map_err(|e| e.to_string())?;
        }

        Ok(())
    }
}
```

### Test 7: Robust Logging System

```powershell
# Create test for logging system
@"
use goose::quality::logger::{ValidationLogger, IssueDetail, Severity};

fn main() -> Result<(), String> {
    let mut logger = ValidationLogger::new()?;

    println!("🧪 Testing Robust Logging System...\n");

    logger.start_validation_run("test-logging-system")?;

    // Log various types of issues
    logger.log_issue(IssueDetail {
        file: "ui/desktop/src/FileManager.tsx".to_string(),
        line: Some(45),
        issue_type: "Empty Event Handler".to_string(),
        severity: Severity::Critical,
        message: "onClick handler is empty - no functionality implemented".to_string(),
        related_files: vec![
            "ui/desktop/src/components/FileList.tsx".to_string(),
            "ui/desktop/src/utils/fileOperations.ts".to_string(),
        ],
        affected_components: vec![
            "FileManager".to_string(),
            "FileList".to_string(),
            "Navigation".to_string(),
        ],
        fix_suggestion: Some("Implement file selection logic and update state".to_string()),
    })?;

    logger.log_issue(IssueDetail {
        file: "ui/desktop/src/api/backend.ts".to_string(),
        line: Some(120),
        issue_type: "API Contract Mismatch".to_string(),
        severity: Severity::High,
        message: "Frontend calls /api/files/delete but backend endpoint doesn't exist".to_string(),
        related_files: vec![
            "crates/goose/src/routes/files.rs".to_string(),
        ],
        affected_components: vec![
            "FileManager".to_string(),
            "API Layer".to_string(),
        ],
        fix_suggestion: Some("Add DELETE /api/files/:id endpoint in backend".to_string()),
    })?;

    logger.generate_summary()?;

    println!("✅ Logging test complete! Check validation-logs/ directory");
    Ok(())
}
"@ | Out-File -FilePath "crates\goose\examples\test_logging.rs"

# Run test
cargo run --example test_logging

# EXPECTED OUTPUT:
# 🧪 Testing Robust Logging System...
#
# 📝 Log file created: validation-logs\test-logging-system-2025-02-06-20-30-15.log
# 🔴 Empty Event Handler in ui/desktop/src/FileManager.tsx
#    Affects: FileManager, FileList, Navigation
# 🟠 API Contract Mismatch in ui/desktop/src/api/backend.ts
#    Affects: FileManager, API Layer
# ✅ Logging test complete! Check validation-logs/ directory

# Check log file
type "validation-logs\test-logging-system-*.log"
```

---

## 🏗️ Windows Build Testing

### Test 8: Build Windows Executable with Validation

```powershell
# Build Windows executable with all quality checks
cd C:\Users\Admin\Downloads\projects\goose

# Step 1: Run validation first
.\scripts\quick-validate.ps1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Validation failed - fix issues before building"
    exit 1
}

# Step 2: Build portable CLI
.\build-goose.ps1

# EXPECTED RESULT:
# ✅ Validation passed
# 🔨 Building Goose CLI...
# 📦 Compiling goose v0.10.8
# ✅ Build complete: build-output\goose.exe (213.8 MB)

# Step 3: Test executable
.\build-output\goose.exe --version
# Should show: goose 0.10.8

# Step 4: Build desktop installer
.\build-goose-installer.ps1

# EXPECTED RESULT:
# 🔨 Building Goose Desktop Installer...
# ✅ Installer created: ui\desktop\out\make\squirrel.windows\x64\Goose Setup.exe
```

---

## 🔬 End-to-End Integration Testing

### Test 9: Complete Validation Flow

```powershell
# Test complete flow: Code change → Validation → SonarQube → Quality Gate
cd C:\Users\Admin\Downloads\projects\goose

Write-Host "`n🔬 END-TO-END INTEGRATION TEST" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan

# Step 1: Make a code change
Write-Host "[1/6] Creating test file with intentional issues..." -ForegroundColor Yellow
@"
import React, { useState } from 'react';

// TODO: Implement this properly
export const TestComponent = () => {
  const [count, setCount] = useState(0);  // Unused state!

  const handleClick = () => {};  // Empty handler!

  return (
    <div>
      <button onClick={handleClick}>Click Me</button>
    </div>
  );
};
"@ | Out-File -FilePath "ui\desktop\src\components\TestComponent.tsx"

# Step 2: Run multi-pass validation
Write-Host "`n[2/6] Running multi-pass validation..." -ForegroundColor Yellow
cargo run --example test_multipass

# Step 3: Run SonarQube analysis
Write-Host "`n[3/6] Running SonarQube analysis..." -ForegroundColor Yellow
cd ui\desktop
sonar-scanner
cd ..\..

# Step 4: Check quality gate
Write-Host "`n[4/6] Checking quality gate status..." -ForegroundColor Yellow
$response = curl -u "$env:SONAR_TOKEN:" "http://localhost:9000/api/qualitygates/project_status?projectKey=goose-ui" | ConvertFrom-Json

if ($response.projectStatus.status -eq "ERROR") {
    Write-Host "❌ Quality Gate FAILED (as expected)" -ForegroundColor Red
} else {
    Write-Host "⚠️  Quality Gate passed (unexpected - should have failed)" -ForegroundColor Yellow
}

# Step 5: Fix issues
Write-Host "`n[5/6] Fixing issues..." -ForegroundColor Yellow
@"
import React, { useState } from 'react';

export const TestComponent = () => {
  const [count, setCount] = useState(0);

  const handleClick = () => {
    setCount(count + 1);  // Actually use the state!
  };

  return (
    <div>
      <button onClick={handleClick}>
        Click Me ({count})
      </button>
    </div>
  );
};
"@ | Out-File -FilePath "ui\desktop\src\components\TestComponent.tsx"

# Step 6: Re-validate
Write-Host "`n[6/6] Re-running validation..." -ForegroundColor Yellow
cargo run --example test_multipass

# Clean up
Remove-Item "ui\desktop\src\components\TestComponent.tsx"

Write-Host "`n✅ END-TO-END TEST COMPLETE`n" -ForegroundColor Green
```

---

## ⚡ Performance Testing

### Test 10: Validation Performance Metrics

```powershell
# Measure validation performance
cd C:\Users\Admin\Downloads\projects\goose

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

.\scripts\quick-validate.ps1

$stopwatch.Stop()
$elapsed = $stopwatch.Elapsed.TotalSeconds

Write-Host "`n⏱️  Performance Metrics:" -ForegroundColor Cyan
Write-Host "   Total Time: $elapsed seconds" -ForegroundColor White
Write-Host "   Target: <30 seconds for quick validation" -ForegroundColor Yellow

if ($elapsed -lt 30) {
    Write-Host "   ✅ Performance target MET" -ForegroundColor Green
} else {
    Write-Host "   ❌ Performance target MISSED" -ForegroundColor Red
}

# Test ultimate validation performance
$stopwatch2 = [System.Diagnostics.Stopwatch]::StartNew()
.\scripts\ultimate-validation.ps1
$stopwatch2.Stop()
$elapsed2 = $stopwatch2.Elapsed.TotalSeconds

Write-Host "`n   Ultimate Validation Time: $elapsed2 seconds" -ForegroundColor White
Write-Host "   Target: <120 seconds (2 minutes)" -ForegroundColor Yellow

if ($elapsed2 -lt 120) {
    Write-Host "   ✅ Performance target MET`n" -ForegroundColor Green
} else {
    Write-Host "   ❌ Performance target MISSED`n" -ForegroundColor Red
}
```

---

## 🔧 Troubleshooting Guide

### Common Issues and Solutions

#### Issue 1: SonarQube Server Not Responding

```powershell
# Symptom: curl returns connection refused
# Solution:
docker ps  # Check if container is running
docker start sonarqube
Start-Sleep -Seconds 60
curl http://localhost:9000/api/system/status
```

#### Issue 2: Quality Gate Always Passes

```powershell
# Symptom: Quality gate returns OK even with issues
# Solution: Check quality gate configuration
curl -u "$env:SONAR_TOKEN:" "http://localhost:9000/api/qualitygates/show?name=Goose%20Zero%20Tolerance"

# Expected: Should show conditions like:
# - Blocker Issues: 0
# - Critical Issues: 0
# - Coverage: 80%
# - Duplication: <3%
```

#### Issue 3: Multi-Pass Validator Hangs

```powershell
# Symptom: Validation runs forever
# Solution: Check for infinite loop
$env:RUST_LOG = "debug"
cargo run --example test_multipass

# Look for:
# - Max iterations exceeded (should stop at 5)
# - Timeout messages (should stop at 10 minutes)
# - Regression detection triggering rollback
```

#### Issue 4: Missing Log Files

```powershell
# Symptom: No logs created in validation-logs/
# Solution: Check directory permissions
ls validation-logs\  # Does directory exist?
mkdir validation-logs  # Create if missing

# Check write permissions
echo "test" > validation-logs\test.txt
if ($?) {
    Write-Host "✅ Write permissions OK"
    Remove-Item validation-logs\test.txt
} else {
    Write-Host "❌ No write permissions - run as Administrator"
}
```

---

## 📊 Success Criteria

### ✅ All Tests Must Pass

| Test | Description | Expected Result |
|------|-------------|-----------------|
| Test 1 | SonarQube analysis runs | ✅ Analysis completes, metrics uploaded |
| Test 2 | Quality gate enforcement | ❌ Fails with issues, ✅ passes when fixed |
| Test 3 | Metrics retrieval | ✅ Returns bugs, vulnerabilities, coverage, etc. |
| Test 4 | Quick validation | ✅ Finds 216 incomplete markers |
| Test 5 | Ultimate validation | ✅ Runs all 25 checks, generates log files |
| Test 6 | Multi-pass validator | ✅ Runs iterations, auto-fixes, reaches clean state |
| Test 7 | Robust logging | ✅ Creates detailed logs with relationships |
| Test 8 | Windows build | ✅ Builds exe and installer after validation |
| Test 9 | End-to-end flow | ✅ Detects issues, fails gate, fixes, passes |
| Test 10 | Performance | ✅ Quick <30s, Ultimate <120s |

---

## 🎯 Next Steps

1. **Run All Tests** - Execute tests 1-10 in order
2. **Verify Logs** - Check validation-logs/ directory for detailed output
3. **Check SonarQube UI** - Visit http://localhost:9000 to see issues
4. **Build Windows Installer** - Create release build after all tests pass
5. **Integration** - Hook validation into Goose agent system

---

## 📖 Related Documentation

- `COMPLETE_VALIDATION_SYSTEM_SUMMARY.md` - System overview
- `MULTI_PASS_VALIDATION_SYSTEM.md` - Multi-pass design details
- `MISSING_VALIDATIONS_ANALYSIS.md` - Gap analysis
- `SONARQUBE_SETUP_COMPLETE.md` - SonarQube configuration

---

**✨ All validation systems are ready for comprehensive testing!**

This testing guide ensures SonarQube integration and Multi-Pass Validation System work correctly with robust, smart logging showing exactly where issues are, what's related, and what's affected.
