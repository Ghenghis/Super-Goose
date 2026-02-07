# Multi-Pass Validation System - State of the Art Foolproofing

## 🎯 Concept: Multi-Layer, Multi-Pass, Self-Healing Validation

### The Problem with Single-Pass Validation:
- Fixes one issue but breaks another
- Doesn't catch cascading failures
- No verification that fixes actually work
- Can't detect regressions introduced by fixes

### The Solution: 5-Pass Recursive Validation with Fail-Safes

```
┌────────────────────────────────────────────────────────────┐
│  MULTI-PASS VALIDATION LOOP                                │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  PASS 1: PRE-FLIGHT (Safety Checks)                       │
│    ├─ Environment Ready?                                  │
│    ├─ Dependencies Installed?                             │
│    ├─ Git Clean State?                                    │
│    └─ [GATE: Must pass to proceed]                        │
│                                                            │
│  PASS 2: SYNTAX & STRUCTURE                               │
│    ├─ Syntax Valid?                                       │
│    ├─ Imports/Exports Valid?                              │
│    ├─ Type Definitions Correct?                           │
│    └─ [GATE: Fix issues → Re-run Pass 2]                  │
│                                                            │
│  PASS 3: INTEGRATION & WIRING                             │
│    ├─ Components Connected?                               │
│    ├─ APIs Wired?                                         │
│    ├─ Routes Registered?                                  │
│    ├─ State Management Working?                           │
│    └─ [GATE: Fix issues → Re-run Pass 2 + 3]              │
│                                                            │
│  PASS 4: QUALITY & SECURITY                               │
│    ├─ Lint Passes?                                        │
│    ├─ Tests Pass?                                         │
│    ├─ Security Scan Clean?                                │
│    ├─ Performance Acceptable?                             │
│    └─ [GATE: Fix issues → Re-run Pass 2 + 3 + 4]          │
│                                                            │
│  PASS 5: BUILD & RUNTIME                                  │
│    ├─ Build Succeeds?                                     │
│    ├─ Runtime Errors?                                     │
│    ├─ Integration Tests Pass?                             │
│    └─ [GATE: Fix issues → Re-run ALL passes]              │
│                                                            │
│  PASS 6: VERIFICATION (Final Sanity Check)                │
│    ├─ Re-run all checks one more time                     │
│    ├─ Verify no regressions introduced                    │
│    ├─ Generate validation report                          │
│    └─ [GATE: Sign off]                                    │
│                                                            │
│  If PASS 6 fails → ABORT & Report Failure                 │
│  If PASS 6 passes → SUCCESS & Sign off                    │
└────────────────────────────────────────────────────────────┘
```

---

## 🔄 Recursive Validation Logic

### Core Principle: "Fix and Re-Validate"

```rust
pub struct MultiPassValidator {
    max_iterations: usize,
    current_iteration: usize,
    previous_results: Vec<ValidationSnapshot>,
}

impl MultiPassValidator {
    pub async fn validate_with_fixes(&mut self) -> Result<FinalReport, String> {
        let mut iteration = 0;

        loop {
            iteration += 1;

            if iteration > self.max_iterations {
                return Err(format!(
                    "FAIL: Exceeded max iterations ({}) - validation not stabilizing",
                    self.max_iterations
                ));
            }

            println!("\n╔══════════════════════════════════════════════════════════╗");
            println!("║  VALIDATION ITERATION {} / {}                          ║", iteration, self.max_iterations);
            println!("╚══════════════════════════════════════════════════════════╝\n");

            // Run all validation passes
            let snapshot = self.run_validation_passes().await?;

            // Check if validation is stable (no new failures)
            if iteration > 1 {
                if self.has_regressed(&snapshot) {
                    println!("⚠️  REGRESSION DETECTED - fixes introduced new issues!");
                    self.rollback_last_changes()?;
                    continue;
                }
            }

            // Store snapshot
            self.previous_results.push(snapshot.clone());

            // If no failures, run final verification pass
            if snapshot.total_failures == 0 {
                println!("\n✅ All checks passed! Running final verification...\n");

                let verification = self.final_verification_pass().await?;

                if verification.is_clean() {
                    println!("✅ FINAL VERIFICATION PASSED!");
                    return Ok(FinalReport {
                        iterations: iteration,
                        final_snapshot: snapshot,
                        verification_result: verification,
                    });
                } else {
                    println!("❌ Final verification found issues - continuing loop...");
                    continue;
                }
            }

            // Auto-fix issues if possible
            println!("\n🔧 Attempting to auto-fix {} issues...\n", snapshot.total_failures);

            let fixed_count = self.attempt_auto_fix(&snapshot).await?;

            println!("✅ Auto-fixed {} / {} issues\n", fixed_count, snapshot.total_failures);

            // Re-run validation after fixes
            // Loop will continue
        }
    }

    async fn run_validation_passes(&self) -> Result<ValidationSnapshot, String> {
        let mut snapshot = ValidationSnapshot::new();

        // PASS 1: Pre-flight
        snapshot.pass1 = self.preflight_checks().await?;

        // Only proceed if pre-flight passes
        if !snapshot.pass1.all_passed() {
            return Ok(snapshot);
        }

        // PASS 2: Syntax & Structure
        snapshot.pass2 = self.syntax_structure_checks().await?;

        // PASS 3: Integration & Wiring
        snapshot.pass3 = self.integration_wiring_checks().await?;

        // PASS 4: Quality & Security
        snapshot.pass4 = self.quality_security_checks().await?;

        // PASS 5: Build & Runtime
        snapshot.pass5 = self.build_runtime_checks().await?;

        snapshot.calculate_totals();

        Ok(snapshot)
    }

    async fn final_verification_pass(&self) -> Result<VerificationResult, String> {
        // Re-run ALL checks one more time to ensure stability
        println!("🔍 Pass 1/5: Re-checking pre-flight...");
        let pass1 = self.preflight_checks().await?;

        println!("🔍 Pass 2/5: Re-checking syntax...");
        let pass2 = self.syntax_structure_checks().await?;

        println!("🔍 Pass 3/5: Re-checking integration...");
        let pass3 = self.integration_wiring_checks().await?;

        println!("🔍 Pass 4/5: Re-checking quality...");
        let pass4 = self.quality_security_checks().await?;

        println!("🔍 Pass 5/5: Re-checking build...");
        let pass5 = self.build_runtime_checks().await?;

        Ok(VerificationResult {
            pass1,
            pass2,
            pass3,
            pass4,
            pass5,
        })
    }

    fn has_regressed(&self, current: &ValidationSnapshot) -> bool {
        if let Some(previous) = self.previous_results.last() {
            // Check if we introduced new failures
            if current.total_failures > previous.total_failures {
                println!("❌ Regression: {} new failures", current.total_failures - previous.total_failures);
                return true;
            }

            // Check if we broke something that was working
            if current.pass1.failures > previous.pass1.failures ||
               current.pass2.failures > previous.pass2.failures {
                println!("❌ Regression: New failures in early passes");
                return true;
            }
        }

        false
    }

    async fn attempt_auto_fix(&self, snapshot: &ValidationSnapshot) -> Result<usize, String> {
        let mut fixed = 0;

        // Auto-fix patterns:

        // 1. Empty event handlers → Add placeholder implementation
        fixed += self.fix_empty_handlers().await?;

        // 2. Missing imports → Add imports
        fixed += self.fix_missing_imports().await?;

        // 3. Unused state → Remove or use it
        fixed += self.fix_unused_state().await?;

        // 4. Missing error handling → Add try-catch
        fixed += self.fix_missing_error_handling().await?;

        // 5. Incomplete TODOs → Remove or implement
        fixed += self.fix_incomplete_markers().await?;

        Ok(fixed)
    }

    fn rollback_last_changes(&self) -> Result<(), String> {
        println!("🔄 Rolling back last changes...");

        // Use git to rollback
        std::process::Command::new("git")
            .args(&["reset", "--hard", "HEAD~1"])
            .output()
            .map_err(|e| format!("Failed to rollback: {}", e))?;

        println!("✅ Rollback complete");

        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct ValidationSnapshot {
    pass1: PassResult,  // Pre-flight
    pass2: PassResult,  // Syntax
    pass3: PassResult,  // Integration
    pass4: PassResult,  // Quality
    pass5: PassResult,  // Build
    total_failures: usize,
    total_warnings: usize,
}

impl ValidationSnapshot {
    pub fn new() -> Self {
        Self {
            pass1: PassResult::default(),
            pass2: PassResult::default(),
            pass3: PassResult::default(),
            pass4: PassResult::default(),
            pass5: PassResult::default(),
            total_failures: 0,
            total_warnings: 0,
        }
    }

    pub fn calculate_totals(&mut self) {
        self.total_failures = self.pass1.failures +
                               self.pass2.failures +
                               self.pass3.failures +
                               self.pass4.failures +
                               self.pass5.failures;

        self.total_warnings = self.pass1.warnings +
                               self.pass2.warnings +
                               self.pass3.warnings +
                               self.pass4.warnings +
                               self.pass5.warnings;
    }
}

#[derive(Debug, Clone, Default)]
pub struct PassResult {
    passed: usize,
    failures: usize,
    warnings: usize,
    details: Vec<String>,
}

impl PassResult {
    pub fn all_passed(&self) -> bool {
        self.failures == 0
    }
}

#[derive(Debug)]
pub struct VerificationResult {
    pass1: PassResult,
    pass2: PassResult,
    pass3: PassResult,
    pass4: PassResult,
    pass5: PassResult,
}

impl VerificationResult {
    pub fn is_clean(&self) -> bool {
        self.pass1.all_passed() &&
        self.pass2.all_passed() &&
        self.pass3.all_passed() &&
        self.pass4.all_passed() &&
        self.pass5.all_passed()
    }
}

#[derive(Debug)]
pub struct FinalReport {
    iterations: usize,
    final_snapshot: ValidationSnapshot,
    verification_result: VerificationResult,
}
```

---

## 🛡️ Fail-Safe Mechanisms

### 1. Maximum Iteration Limit
```rust
const MAX_ITERATIONS: usize = 5;

if iteration > MAX_ITERATIONS {
    // FAIL-SAFE: Prevent infinite loops
    return Err("Validation not stabilizing - manual intervention required");
}
```

### 2. Regression Detection
```rust
fn detect_regression(current: &Snapshot, previous: &Snapshot) -> bool {
    // FAIL-SAFE: Don't let fixes break working code
    if current.failures > previous.failures {
        rollback_changes();
        return true;
    }
    false
}
```

### 3. Auto-Rollback on Catastrophic Failure
```rust
if snapshot.pass1.failures > 10 {
    // FAIL-SAFE: Too many fundamental failures
    println!("❌ CATASTROPHIC FAILURE - Rolling back all changes");
    rollback_to_last_known_good_state();
    return Err("Too many failures - aborting");
}
```

### 4. Time Limit
```rust
const MAX_VALIDATION_TIME: Duration = Duration::from_secs(600); // 10 minutes

if elapsed > MAX_VALIDATION_TIME {
    // FAIL-SAFE: Prevent hanging
    return Err("Validation timeout - exceeded 10 minutes");
}
```

### 5. Dependency Change Detection
```rust
if package_json_changed() || cargo_toml_changed() {
    // FAIL-SAFE: Dependency changes require re-install
    println!("⚠️  Dependencies changed - re-installing...");
    reinstall_dependencies()?;
}
```

### 6. Circular Dependency Prevention
```rust
let dependency_graph = build_dependency_graph(files);

if dependency_graph.has_cycles() {
    // FAIL-SAFE: Circular dependencies are fatal
    return Err("Circular dependency detected - must fix manually");
}
```

### 7. State Consistency Checks
```rust
// FAIL-SAFE: Ensure git state is clean before validation
if !git_is_clean() {
    return Err("Git state not clean - commit or stash changes first");
}

// FAIL-SAFE: Ensure no background processes interfering
if processes_using_files(files) {
    return Err("Files locked by other processes - close applications");
}
```

---

## 📋 Complete Gap Analysis

### Current System Has:
✅ 25 validation checks
✅ Basic multi-stage validation
✅ SonarQube integration
✅ Pre-commit/pre-push hooks

### GAPS IDENTIFIED (State of the Art Requirements):

#### Gap 1: No Incremental Validation ❌
**Problem:** Re-runs ALL checks even if only 1 file changed
**Solution:** Implement differential validation

```rust
pub struct IncrementalValidator {
    cache: ValidationCache,
}

impl IncrementalValidator {
    pub async fn validate_incremental(&mut self, changed_files: &[String]) -> Result<ValidationResult, String> {
        // Only re-validate changed files and their dependencies
        let affected_files = self.find_affected_files(changed_files)?;

        println!("📊 Incremental validation:");
        println!("   Changed: {} files", changed_files.len());
        println!("   Affected: {} files", affected_files.len());
        println!("   Skipping: {} cached files", self.cache.count() - affected_files.len());

        // Re-use cached results for unchanged files
        let mut results = self.cache.get_cached_results(&affected_files);

        // Only run checks on affected files
        for file in affected_files {
            results.push(self.validate_file(&file).await?);
        }

        Ok(ValidationResult::combine(results))
    }
}
```

#### Gap 2: No Parallel Validation ❌
**Problem:** Checks run sequentially (slow)
**Solution:** Run independent checks in parallel

```rust
pub async fn validate_parallel(&self) -> Result<ValidationSnapshot, String> {
    use tokio::task;

    // Run independent checks in parallel
    let (pass1, pass2, pass3, pass4, pass5) = tokio::join!(
        task::spawn(self.preflight_checks()),
        task::spawn(self.syntax_structure_checks()),
        task::spawn(self.integration_wiring_checks()),
        task::spawn(self.quality_security_checks()),
        task::spawn(self.build_runtime_checks()),
    );

    Ok(ValidationSnapshot {
        pass1: pass1??,
        pass2: pass2??,
        pass3: pass3??,
        pass4: pass4??,
        pass5: pass5??,
        ..Default::default()
    })
}
```

#### Gap 3: No Validation Cache ❌
**Problem:** Re-validates unchanged files
**Solution:** Cache validation results by file hash

```rust
pub struct ValidationCache {
    cache: HashMap<FileHash, ValidationResult>,
    max_age: Duration,
}

impl ValidationCache {
    pub fn is_valid(&self, file: &str) -> bool {
        let hash = calculate_hash(file);

        if let Some(cached) = self.cache.get(&hash) {
            if cached.age() < self.max_age {
                return true;
            }
        }

        false
    }

    pub fn get_cached_result(&self, file: &str) -> Option<ValidationResult> {
        let hash = calculate_hash(file);
        self.cache.get(&hash).cloned()
    }
}
```

#### Gap 4: No Cross-File Dependency Analysis ❌
**Problem:** Doesn't detect when changing file A breaks file B
**Solution:** Build dependency graph and validate affected files

```rust
pub struct DependencyAnalyzer {
    graph: DependencyGraph,
}

impl DependencyAnalyzer {
    pub fn find_affected_files(&self, changed: &[String]) -> Vec<String> {
        let mut affected = HashSet::new();

        for file in changed {
            // Direct dependencies
            affected.extend(self.graph.get_dependencies(file));

            // Reverse dependencies (files that import this one)
            affected.extend(self.graph.get_dependents(file));
        }

        affected.into_iter().collect()
    }

    pub fn detect_breaking_changes(&self, file: &str, old_content: &str, new_content: &str) -> Vec<BreakingChange> {
        let mut breaking_changes = Vec::new();

        // Check if exported API changed
        let old_exports = extract_exports(old_content);
        let new_exports = extract_exports(new_content);

        // Removed exports = breaking change
        for export in &old_exports {
            if !new_exports.contains(export) {
                breaking_changes.push(BreakingChange {
                    file: file.to_string(),
                    change_type: "Removed export".to_string(),
                    affected_files: self.graph.get_dependents(file),
                });
            }
        }

        // Changed function signatures = breaking change
        for (name, old_sig) in extract_signatures(old_content) {
            if let Some(new_sig) = extract_signatures(new_content).get(&name) {
                if old_sig != *new_sig {
                    breaking_changes.push(BreakingChange {
                        file: file.to_string(),
                        change_type: format!("Changed signature: {}", name),
                        affected_files: self.graph.get_dependents(file),
                    });
                }
            }
        }

        breaking_changes
    }
}
```

#### Gap 5: No Live Monitoring/Hot Reload Validation ❌
**Problem:** Only validates on demand, not continuously
**Solution:** Watch for file changes and validate automatically

```rust
pub struct LiveValidator {
    watcher: FileWatcher,
    validator: MultiPassValidator,
}

impl LiveValidator {
    pub async fn watch_and_validate(&mut self) -> Result<(), String> {
        println!("👀 Watching for file changes...");

        loop {
            let events = self.watcher.wait_for_changes().await?;

            for event in events {
                match event {
                    FileEvent::Modified(file) => {
                        println!("\n🔄 File changed: {}", file);

                        let result = self.validator.validate_file(&file).await?;

                        if result.has_failures() {
                            println!("❌ Validation failed!");
                            result.print_errors();

                            // Send desktop notification
                            notify_user("Validation Failed", &result.summary());
                        } else {
                            println!("✅ Validation passed!");
                        }
                    }
                    FileEvent::Created(file) => {
                        // New file - validate it
                        self.validator.validate_new_file(&file).await?;
                    }
                    FileEvent::Deleted(file) => {
                        // Check if any files depend on deleted file
                        self.check_broken_imports(&file).await?;
                    }
                }
            }
        }
    }
}
```

#### Gap 6: No AI-Powered Auto-Fix ❌
**Problem:** Only detects issues, doesn't suggest fixes
**Solution:** Use LLM to generate fixes

```rust
pub struct AIAutoFixer {
    llm_client: LLMClient,
}

impl AIAutoFixer {
    pub async fn suggest_fix(&self, issue: &ValidationIssue) -> Result<Fix, String> {
        let prompt = format!(
            r#"
            File: {}
            Line: {}
            Issue: {}

            Suggest a fix for this validation error.
            Return the corrected code.
            "#,
            issue.file,
            issue.line,
            issue.message
        );

        let fix = self.llm_client.complete(&prompt).await?;

        Ok(Fix {
            file: issue.file.clone(),
            line: issue.line,
            original: issue.code.clone(),
            fixed: fix,
        })
    }

    pub async fn apply_fix(&self, fix: &Fix) -> Result<(), String> {
        // Apply the fix to the file
        let content = std::fs::read_to_string(&fix.file)?;

        let lines: Vec<&str> = content.lines().collect();
        let mut new_lines = lines.clone();

        new_lines[fix.line - 1] = &fix.fixed;

        let new_content = new_lines.join("\n");

        std::fs::write(&fix.file, new_content)?;

        Ok(())
    }
}
```

#### Gap 7: No Validation Performance Profiling ❌
**Problem:** Don't know which checks are slow
**Solution:** Profile each check and optimize

```rust
pub struct ValidationProfiler {
    timings: HashMap<String, Duration>,
}

impl ValidationProfiler {
    pub async fn profile_check<F, Fut>(&mut self, name: &str, check: F) -> Result<ValidationResult, String>
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = Result<ValidationResult, String>>,
    {
        let start = Instant::now();

        let result = check().await?;

        let duration = start.elapsed();
        self.timings.insert(name.to_string(), duration);

        println!("⏱️  {} took {:?}", name, duration);

        Ok(result)
    }

    pub fn print_summary(&self) {
        println!("\n📊 Validation Performance Profile:");

        let mut sorted: Vec<_> = self.timings.iter().collect();
        sorted.sort_by_key(|(_, duration)| *duration);
        sorted.reverse();

        for (name, duration) in sorted {
            println!("   {:<30} {:?}", name, duration);
        }
    }
}
```

---

## 🎯 Complete State-of-the-Art System

### Architecture:

```
┌──────────────────────────────────────────────────────────────────┐
│ ULTIMATE FOOLPROOF VALIDATION SYSTEM                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 1. FILE WATCHER (Live Monitoring)                       │    │
│  │    ├─ Detects file changes in real-time                 │    │
│  │    ├─ Triggers validation automatically                 │    │
│  │    └─ Sends desktop notifications                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          ↓                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 2. INCREMENTAL VALIDATOR                                │    │
│  │    ├─ Only validates changed files                      │    │
│  │    ├─ Uses dependency graph to find affected files      │    │
│  │    └─ Caches results for unchanged files                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          ↓                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 3. MULTI-PASS VALIDATOR (Recursive Loop)                │    │
│  │    ├─ Pass 1: Pre-flight (fail-fast)                    │    │
│  │    ├─ Pass 2: Syntax & Structure                        │    │
│  │    ├─ Pass 3: Integration & Wiring                      │    │
│  │    ├─ Pass 4: Quality & Security                        │    │
│  │    ├─ Pass 5: Build & Runtime                           │    │
│  │    ├─ Pass 6: Final Verification                        │    │
│  │    └─ Loop until stable OR max iterations               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          ↓                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 4. AI AUTO-FIXER                                        │    │
│  │    ├─ Detects patterns in validation errors             │    │
│  │    ├─ Generates fixes using LLM                         │    │
│  │    ├─ Applies fixes automatically                       │    │
│  │    └─ Re-validates to confirm fix worked                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          ↓                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 5. REGRESSION DETECTOR                                  │    │
│  │    ├─ Compares current vs previous validation           │    │
│  │    ├─ Detects if fixes broke something else             │    │
│  │    ├─ Auto-rolls back bad changes                       │    │
│  │    └─ Maintains history of validation snapshots         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          ↓                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 6. FAIL-SAFE MECHANISMS                                 │    │
│  │    ├─ Max iterations limit (prevent infinite loops)     │    │
│  │    ├─ Timeout limit (prevent hanging)                   │    │
│  │    ├─ Catastrophic failure detection                    │    │
│  │    ├─ Auto-rollback on regression                       │    │
│  │    ├─ Dependency change detection                       │    │
│  │    └─ State consistency checks                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          ↓                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 7. PERFORMANCE PROFILER                                 │    │
│  │    ├─ Times each validation check                       │    │
│  │    ├─ Identifies slow checks                            │    │
│  │    ├─ Suggests optimizations                            │    │
│  │    └─ Caches expensive operations                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          ↓                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 8. COMPREHENSIVE REPORTER                               │    │
│  │    ├─ Generates detailed validation reports             │    │
│  │    ├─ Exports to JSON/HTML/Markdown                     │    │
│  │    ├─ Tracks validation history                         │    │
│  │    └─ Provides actionable recommendations               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## ✅ Summary: State-of-the-Art Features

### Current Implementation: 8/15 features ✅
1. ✅ Basic validation checks (25 checks)
2. ✅ Multi-stage validation
3. ✅ SonarQube integration
4. ✅ Git hooks
5. ✅ PowerShell scripts
6. ✅ Rust validator modules
7. ✅ Error reporting
8. ✅ Basic fail-safes

### Missing for State-of-the-Art: 7 features ❌
9. ❌ Multi-pass recursive validation loop
10. ❌ Incremental validation (only changed files)
11. ❌ Parallel validation (faster)
12. ❌ Validation caching
13. ❌ Live file watching & auto-validation
14. ❌ AI-powered auto-fix
15. ❌ Performance profiling

### Would Make System FOOLPROOF:
- Multi-pass loop with regression detection
- Auto-rollback on bad fixes
- Incremental validation for speed
- Live monitoring for instant feedback
- AI auto-fix for common patterns
- Comprehensive fail-safes preventing all edge cases

**Next Step:** Implement the 7 missing features to achieve state-of-the-art status! 🚀
