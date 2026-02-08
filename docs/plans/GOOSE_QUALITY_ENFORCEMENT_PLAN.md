# Goose Quality Enforcement Plan
## Professional Standards & Self-Checking System

**Problem Identified:**
- Goose creates UI mockups without wiring functionality
- Doesn't verify its own work before reporting completion
- Needs reminders about incomplete TODOs/stubs
- Missing multi-stage validation gates

**Solution: 7-Layer Quality Enforcement System**

---

## Layer 1: SonarQube CLI Integration for Real-Time Analysis

### Implementation in Goose Agent System

**Location:** `crates/goose/src/quality/sonarqube.rs`

```rust
use std::process::Command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SonarQubeConfig {
    pub host_url: String,
    pub token: String,
    pub project_key: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QualityGateStatus {
    pub status: String,
    pub conditions: Vec<QualityCondition>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QualityCondition {
    pub metric: String,
    pub status: String,
    pub actual_value: String,
    pub error_threshold: String,
}

impl SonarQubeConfig {
    /// Run SonarQube analysis on current codebase
    pub async fn analyze_codebase(&self, path: &str) -> Result<(), String> {
        println!("🔍 Running SonarQube analysis...");

        let output = Command::new("sonar-scanner")
            .arg(format!("-Dsonar.projectKey={}", self.project_key))
            .arg(format!("-Dsonar.host.url={}", self.host_url))
            .arg(format!("-Dsonar.login={}", self.token))
            .arg(format!("-Dsonar.sources={}", path))
            .output()
            .map_err(|e| format!("Failed to run sonar-scanner: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "SonarQube analysis failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        println!("✅ SonarQube analysis complete");
        Ok(())
    }

    /// Check if quality gate passed
    pub async fn check_quality_gate(&self) -> Result<QualityGateStatus, String> {
        println!("🚦 Checking quality gate status...");

        let url = format!(
            "{}/api/qualitygates/project_status?projectKey={}",
            self.host_url, self.project_key
        );

        let client = reqwest::Client::new();
        let response = client
            .get(&url)
            .basic_auth(&self.token, Some(""))
            .send()
            .await
            .map_err(|e| format!("Failed to check quality gate: {}", e))?;

        let status: QualityGateStatus = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse quality gate response: {}", e))?;

        if status.status == "ERROR" {
            println!("❌ Quality gate FAILED!");
            for condition in &status.conditions {
                if condition.status == "ERROR" {
                    println!(
                        "  ❌ {}: {} (threshold: {})",
                        condition.metric, condition.actual_value, condition.error_threshold
                    );
                }
            }
        } else {
            println!("✅ Quality gate PASSED!");
        }

        Ok(status)
    }
}
```

---

## Layer 2: Pre-Code-Generation Checklist

**Before Goose writes ANY code, it MUST:**

```yaml
pre_code_checklist:
  - name: "Understand Requirements"
    verification:
      - Read user request completely
      - Identify all features requested
      - List dependencies between features
      - Ask clarifying questions if ambiguous

  - name: "Plan Implementation"
    verification:
      - List all files to be created/modified
      - Identify integration points
      - Note event handlers and data flow
      - Create task breakdown with acceptance criteria

  - name: "Check Existing Code"
    verification:
      - Read current implementation
      - Identify existing patterns
      - Check for conflicts with new code
      - Review dependencies

  - name: "Design Architecture"
    verification:
      - Define data structures
      - Plan API contracts
      - Map component hierarchy
      - Document state management
```

---

## Layer 3: Post-Code-Generation Validation

**After Goose writes code, AUTOMATICALLY:**

```rust
// crates/goose/src/quality/post_code_validator.rs

pub struct PostCodeValidator;

impl PostCodeValidator {
    /// Validate code changes before reporting completion
    pub async fn validate_changes(&self, files_changed: Vec<String>) -> Result<ValidationReport, String> {
        let mut report = ValidationReport::new();

        // Step 1: Static Analysis
        report.add_check("Static Analysis", self.run_static_analysis(&files_changed).await?);

        // Step 2: Syntax Check
        report.add_check("Syntax Check", self.check_syntax(&files_changed).await?);

        // Step 3: Type Check (TypeScript/Rust)
        report.add_check("Type Check", self.check_types(&files_changed).await?);

        // Step 4: Lint Check
        report.add_check("Lint Check", self.run_linters(&files_changed).await?);

        // Step 5: Test Existence
        report.add_check("Test Coverage", self.verify_tests_exist(&files_changed).await?);

        // Step 6: TODO/FIXME Scan
        report.add_check("TODO Scan", self.scan_for_incomplete_markers(&files_changed).await?);

        // Step 7: Integration Check
        report.add_check("Integration Check", self.verify_wiring(&files_changed).await?);

        // Step 8: Build Check
        report.add_check("Build Check", self.attempt_build().await?);

        // Step 9: SonarQube Analysis
        report.add_check("SonarQube", self.run_sonarqube_analysis().await?);

        Ok(report)
    }

    async fn scan_for_incomplete_markers(&self, files: &[String]) -> Result<CheckResult, String> {
        let markers = vec!["TODO", "FIXME", "HACK", "XXX", "STUB", "PLACEHOLDER"];
        let mut issues = Vec::new();

        for file in files {
            let content = std::fs::read_to_string(file)
                .map_err(|e| format!("Failed to read {}: {}", file, e))?;

            for (line_num, line) in content.lines().enumerate() {
                for marker in &markers {
                    if line.contains(marker) {
                        issues.push(format!(
                            "{}:{}: Found incomplete marker: {}",
                            file,
                            line_num + 1,
                            line.trim()
                        ));
                    }
                }
            }
        }

        if issues.is_empty() {
            Ok(CheckResult::Pass)
        } else {
            Ok(CheckResult::Fail {
                reason: format!("Found {} incomplete markers", issues.len()),
                details: issues,
            })
        }
    }

    async fn verify_wiring(&self, files: &[String]) -> Result<CheckResult, String> {
        let mut issues = Vec::new();

        for file in files {
            // Check if component is imported/exported
            if file.ends_with(".tsx") || file.ends_with(".ts") {
                let content = std::fs::read_to_string(file)
                    .map_err(|e| format!("Failed to read {}: {}", file, e))?;

                // Check for event handlers
                if content.contains("onClick") || content.contains("onChange") {
                    if !self.has_handler_implementation(&content) {
                        issues.push(format!(
                            "{}: Event handlers defined but not implemented",
                            file
                        ));
                    }
                }

                // Check for state usage
                if content.contains("useState") || content.contains("useReducer") {
                    if !self.has_state_updates(&content) {
                        issues.push(format!(
                            "{}: State defined but never updated",
                            file
                        ));
                    }
                }
            }
        }

        if issues.is_empty() {
            Ok(CheckResult::Pass)
        } else {
            Ok(CheckResult::Fail {
                reason: "Components not properly wired".to_string(),
                details: issues,
            })
        }
    }

    fn has_handler_implementation(&self, content: &str) -> bool {
        // Check if handlers are more than just arrow functions with no body
        content.contains("=>") && content.contains("{") && !content.contains("=> {}")
    }

    fn has_state_updates(&self, content: &str) -> bool {
        // Check for setState calls
        content.contains("set") && (content.contains("(") || content.contains("["))
    }
}

#[derive(Debug)]
pub struct ValidationReport {
    checks: Vec<(String, CheckResult)>,
}

#[derive(Debug)]
pub enum CheckResult {
    Pass,
    Fail { reason: String, details: Vec<String> },
    Warning { reason: String, details: Vec<String> },
}

impl ValidationReport {
    pub fn new() -> Self {
        Self { checks: Vec::new() }
    }

    pub fn add_check(&mut self, name: &str, result: CheckResult) {
        self.checks.push((name.to_string(), result));
    }

    pub fn has_failures(&self) -> bool {
        self.checks.iter().any(|(_, result)| matches!(result, CheckResult::Fail { .. }))
    }

    pub fn print_summary(&self) {
        println!("\n═══════════════════════════════════════");
        println!("      VALIDATION REPORT");
        println!("═══════════════════════════════════════");

        for (name, result) in &self.checks {
            match result {
                CheckResult::Pass => println!("✅ {}: PASS", name),
                CheckResult::Fail { reason, details } => {
                    println!("❌ {}: FAIL - {}", name, reason);
                    for detail in details {
                        println!("   {}", detail);
                    }
                }
                CheckResult::Warning { reason, details } => {
                    println!("⚠️  {}: WARNING - {}", name, reason);
                    for detail in details {
                        println!("   {}", detail);
                    }
                }
            }
        }

        println!("═══════════════════════════════════════\n");
    }
}
```

---

## Layer 4: Mandatory Self-Review Protocol

**Before reporting "Done", Goose MUST:**

```markdown
## Self-Review Checklist

### 1. Completeness Check
- [ ] All requested features implemented (not just UI)
- [ ] All event handlers have working implementations
- [ ] All state management wired correctly
- [ ] All API calls implemented (not stubbed)
- [ ] All data flows from UI to backend work

### 2. Integration Check
- [ ] New components imported in parent files
- [ ] New routes registered in router
- [ ] New API endpoints added to client
- [ ] New state slices added to store
- [ ] New types exported from modules

### 3. Quality Check
- [ ] No console.log() statements (use proper logging)
- [ ] No TODO/FIXME/HACK markers
- [ ] No empty catch blocks
- [ ] No any types (TypeScript)
- [ ] No unwrap() calls without error handling (Rust)

### 4. Testing Check
- [ ] Unit tests written for new functions
- [ ] Integration tests for new features
- [ ] E2E tests for user flows
- [ ] All tests passing

### 5. Documentation Check
- [ ] JSDoc/rustdoc comments for public APIs
- [ ] README updated if user-facing changes
- [ ] CHANGELOG.md updated
- [ ] Migration guide if breaking changes

### 6. Build Check
- [ ] TypeScript build passes (npm run build)
- [ ] Rust build passes (cargo build)
- [ ] No warnings
- [ ] Bundle size acceptable

### 7. SonarQube Check
- [ ] Quality gate status: PASS
- [ ] No new bugs introduced
- [ ] No new vulnerabilities
- [ ] Code coverage maintained/improved
```

---

## Layer 5: Automated Quality Gates (CI/CD)

**GitLab CI Pipeline Enhancement:**

```yaml
# .gitlab-ci.yml - Enhanced with SonarQube integration

stages:
  - validate
  - lint
  - test
  - analyze
  - quality-gate
  - build
  - deploy

variables:
  SONAR_HOST_URL: "http://localhost:9000"
  SONAR_TOKEN: "squ_5ace7604663a5576e548d3e2ee222616b1a30f0a"

validate-completeness:
  stage: validate
  script:
    - echo "🔍 Checking for incomplete code markers..."
    - |
      if grep -r "TODO\|FIXME\|HACK\|XXX\|STUB\|PLACEHOLDER" \
         --include="*.ts" --include="*.tsx" --include="*.rs" \
         --exclude-dir="node_modules" --exclude-dir="target" .; then
        echo "❌ ERROR: Found incomplete code markers!"
        exit 1
      fi
    - echo "✅ No incomplete markers found"

validate-wiring:
  stage: validate
  script:
    - echo "🔍 Checking component wiring..."
    - cd ui/desktop
    - npm run validate:wiring  # Custom script to check imports/exports

lint-typescript:
  stage: lint
  script:
    - cd ui/desktop
    - npm run lint:check
    - npm run type-check

lint-rust:
  stage: lint
  script:
    - cargo clippy --all-targets --all-features -- -D warnings

test-typescript:
  stage: test
  script:
    - cd ui/desktop
    - npm test -- --coverage --passWithNoTests=false

test-rust:
  stage: test
  script:
    - cargo test --all-features

sonarqube-analysis:
  stage: analyze
  script:
    - cd ui
    - sonar-scanner \
        -Dsonar.projectKey=goose-ui \
        -Dsonar.host.url=$SONAR_HOST_URL \
        -Dsonar.login=$SONAR_TOKEN
    - cd ../
    # TODO: Add Rust SonarQube scanner when available

quality-gate-check:
  stage: quality-gate
  script:
    - |
      STATUS=$(curl -s -u "$SONAR_TOKEN:" \
        "$SONAR_HOST_URL/api/qualitygates/project_status?projectKey=goose-ui" \
        | jq -r '.projectStatus.status')
    - |
      if [ "$STATUS" = "ERROR" ]; then
        echo "❌ Quality gate FAILED!"
        curl -s -u "$SONAR_TOKEN:" \
          "$SONAR_HOST_URL/api/qualitygates/project_status?projectKey=goose-ui" \
          | jq '.projectStatus.conditions[] | select(.status=="ERROR")'
        exit 1
      fi
    - echo "✅ Quality gate PASSED!"

build-check:
  stage: build
  script:
    - cd ui/desktop
    - npm run build
    - cargo build --release
  artifacts:
    paths:
      - ui/desktop/dist/
      - target/release/
```

---

## Layer 6: Goose Agent Behavioral Rules

**Add to `~/.goosehints`:**

```
# === QUALITY ENFORCEMENT RULES ===

## NEVER Report "Done" Until ALL These Pass:

1. **Code Completeness:**
   - All features fully implemented (not just UI mockups)
   - All event handlers have working logic
   - All data flows end-to-end
   - No TODO/FIXME/HACK/XXX/STUB markers

2. **Integration Verification:**
   - All components imported where used
   - All routes registered
   - All API calls wired to backend
   - All state management connected

3. **Quality Checks:**
   - Run `npm run lint:check` (TypeScript)
   - Run `cargo clippy` (Rust)
   - Run `npm test` (all tests passing)
   - Run `cargo test` (all tests passing)
   - Run SonarQube analysis
   - Check quality gate status

4. **Build Verification:**
   - Run `npm run build` (no errors)
   - Run `cargo build` (no warnings)
   - Test the built application manually

5. **Self-Review:**
   - Re-read all changed files
   - Verify each feature works as requested
   - Check that nothing was forgotten
   - Confirm no shortcuts were taken

## If ANY Check Fails:
- FIX the issues immediately
- Re-run ALL checks
- Only report completion after EVERYTHING passes

## SonarQube Integration:
- Run analysis before EVERY commit
- Check quality gate status
- Fix any new issues immediately
- Maintain 0 blockers, 0 critical issues
```

---

## Layer 7: Implementation Stages & Gates

**Stage-Gate Process for Every Feature:**

```
┌──────────────────────────────────────────────────────┐
│ STAGE 1: REQUIREMENTS & PLANNING                     │
├──────────────────────────────────────────────────────┤
│ ✓ Read user request completely                       │
│ ✓ List all features                                  │
│ ✓ Create implementation plan                         │
│ ✓ Identify integration points                        │
│ GATE: User approval of plan                          │
└──────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────┐
│ STAGE 2: IMPLEMENTATION                              │
├──────────────────────────────────────────────────────┤
│ ✓ Write code following plan                          │
│ ✓ Implement ALL features (no stubs)                  │
│ ✓ Wire all components properly                       │
│ ✓ Add error handling                                 │
│ GATE: Code review (self or automated)                │
└──────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────┐
│ STAGE 3: VALIDATION                                  │
├──────────────────────────────────────────────────────┤
│ ✓ Run all linters                                    │
│ ✓ Run all tests                                      │
│ ✓ Run SonarQube analysis                             │
│ ✓ Check quality gate                                 │
│ GATE: All checks PASS                                │
└──────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────┐
│ STAGE 4: BUILD & INTEGRATION                         │
├──────────────────────────────────────────────────────┤
│ ✓ Build TypeScript (npm run build)                   │
│ ✓ Build Rust (cargo build)                           │
│ ✓ Test built application                             │
│ ✓ Verify all features work                           │
│ GATE: Manual testing PASS                            │
└──────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────┐
│ STAGE 5: DOCUMENTATION                               │
├──────────────────────────────────────────────────────┤
│ ✓ Update README if needed                            │
│ ✓ Add code comments                                  │
│ ✓ Update CHANGELOG                                   │
│ ✓ Create migration guide if breaking                 │
│ GATE: Documentation complete                         │
└──────────────────────────────────────────────────────┘
                      ↓
         ✅ READY FOR USER TESTING
```

---

## Immediate Actions Required

### Action 1: Install SonarQube Scanner CLI in Goose Project

```bash
# Add SonarQube CLI to Goose dependencies
cd crates/goose
cargo add reqwest --features json
cargo add serde --features derive
cargo add serde_json
```

### Action 2: Create Quality Module

```bash
mkdir -p crates/goose/src/quality
touch crates/goose/src/quality/mod.rs
touch crates/goose/src/quality/sonarqube.rs
touch crates/goose/src/quality/validator.rs
```

### Action 3: Update Goose Agent to Use Quality Checks

```rust
// In crates/goose/src/agent.rs

use crate::quality::validator::PostCodeValidator;
use crate::quality::sonarqube::SonarQubeConfig;

impl Agent {
    pub async fn generate_code(&mut self, request: &str) -> Result<String, String> {
        // ... existing code generation logic ...

        // NEW: Validate changes before reporting completion
        let validator = PostCodeValidator::new();
        let report = validator.validate_changes(self.get_modified_files()).await?;

        if report.has_failures() {
            report.print_summary();
            return Err("Validation failed. Please review issues above.".to_string());
        }

        // NEW: Run SonarQube analysis
        let sonar_config = SonarQubeConfig::from_env()?;
        sonar_config.analyze_codebase(".")?;

        let gate_status = sonar_config.check_quality_gate().await?;
        if gate_status.status == "ERROR" {
            return Err("Quality gate failed. Please fix issues and try again.".to_string());
        }

        Ok("✅ Code generation complete and validated!".to_string())
    }
}
```

---

## Summary

This 7-layer system ensures:

1. **SonarQube runs automatically** on every code change
2. **Multi-stage validation** catches incomplete work
3. **Self-review protocol** forces Goose to check its work
4. **Quality gates** block commits/pushes if standards not met
5. **Stage-gate process** ensures nothing is skipped
6. **Behavioral rules** in .goosehints prevent shortcuts
7. **CI/CD pipeline** enforces all checks automatically

**Result:** Goose will NEVER report "done" until everything is properly wired, tested, and passes quality gates!
