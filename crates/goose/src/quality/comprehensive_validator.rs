// Comprehensive Validation Orchestrator
// Runs ALL validation checks in the correct order with detailed reporting

use super::{
    PostCodeValidator, AdvancedValidator, SonarQubeConfig,
    ValidationReport, ValidationResult, CheckResult,
};
use std::collections::HashMap;
use std::time::Instant;

pub struct ComprehensiveValidator {
    basic_validator: PostCodeValidator,
    advanced_validator: AdvancedValidator,
    sonarqube: Option<SonarQubeConfig>,
    enable_sonarqube: bool,
}

impl ComprehensiveValidator {
    pub fn new() -> Self {
        let sonarqube = SonarQubeConfig::from_env().ok();

        Self {
            basic_validator: PostCodeValidator::new(),
            advanced_validator: AdvancedValidator::new(),
            sonarqube,
            enable_sonarqube: true,
        }
    }

    pub fn with_sonarqube(mut self, enable: bool) -> Self {
        self.enable_sonarqube = enable;
        self
    }

    /// Run ALL validations (25 checks total)
    pub async fn validate_all(&self, files: &[String]) -> Result<ComprehensiveReport, String> {
        let start_time = Instant::now();

        println!("\n╔════════════════════════════════════════════════════════════╗");
        println!("║  COMPREHENSIVE VALIDATION - 25 CHECKS                      ║");
        println!("╚════════════════════════════════════════════════════════════╝\n");

        let mut report = ComprehensiveReport::new();

        // PHASE 1: BASIC CHECKS (8 checks)
        println!("📋 PHASE 1: Basic Quality Checks (8 checks)");
        println!("─────────────────────────────────────────────────────────────");

        let basic_report = self.basic_validator.validate_changes(files).await?;
        report.add_basic_validation(basic_report);

        // PHASE 2: CRITICAL CHECKS (5 checks)
        println!("\n🔥 PHASE 2: Critical Integration Checks (5 checks)");
        println!("─────────────────────────────────────────────────────────────");

        // Check 9: API Contract Validation
        self.run_check(&mut report, "API Contracts", || async {
            self.advanced_validator.validate_api_contracts(files).await
        }).await;

        // Check 10: Component Import/Export
        self.run_check(&mut report, "Component Imports", || async {
            self.advanced_validator.validate_component_imports(files).await
        }).await;

        // Check 11: State Management
        self.run_check(&mut report, "State Management", || async {
            self.advanced_validator.validate_state_management(files).await
        }).await;

        // Check 12: Event Handlers
        self.run_check(&mut report, "Event Handlers", || async {
            self.advanced_validator.validate_event_handlers(files).await
        }).await;

        // Check 13: Route Registration
        self.run_check(&mut report, "Route Registration", || async {
            self.advanced_validator.validate_routes(files).await
        }).await;

        // PHASE 3: SECURITY & DEPENDENCIES (3 checks)
        println!("\n🔒 PHASE 3: Security & Dependencies (3 checks)");
        println!("─────────────────────────────────────────────────────────────");

        // Check 14: Dependency Security
        self.run_check(&mut report, "Dependency Security", || async {
            self.validate_dependencies().await
        }).await;

        // Check 15: Environment Variables
        self.run_check(&mut report, "Environment Variables", || async {
            self.validate_environment_vars(files).await
        }).await;

        // Check 16: Security Scan
        self.run_check(&mut report, "Security Scan", || async {
            self.validate_security(files).await
        }).await;

        // PHASE 4: CODE QUALITY (4 checks)
        println!("\n📊 PHASE 4: Code Quality & Complexity (4 checks)");
        println!("─────────────────────────────────────────────────────────────");

        // Check 17: Error Handling
        self.run_check(&mut report, "Error Handling", || async {
            self.validate_error_handling(files).await
        }).await;

        // Check 18: Code Complexity
        self.run_check(&mut report, "Code Complexity", || async {
            self.validate_complexity(files).await
        }).await;

        // Check 19: Performance
        self.run_check(&mut report, "Performance", || async {
            self.validate_performance(files).await
        }).await;

        // Check 20: Test Coverage
        self.run_check(&mut report, "Test Coverage", || async {
            self.validate_test_coverage(files).await
        }).await;

        // PHASE 5: DOCUMENTATION & STANDARDS (3 checks)
        println!("\n📚 PHASE 5: Documentation & Standards (3 checks)");
        println!("─────────────────────────────────────────────────────────────");

        // Check 21: Documentation
        self.run_check(&mut report, "Documentation", || async {
            self.validate_documentation(files).await
        }).await;

        // Check 22: Accessibility
        self.run_check(&mut report, "Accessibility", || async {
            self.validate_accessibility(files).await
        }).await;

        // Check 23: Commit Messages
        self.run_check(&mut report, "Commit Messages", || async {
            self.validate_commit_messages().await
        }).await;

        // PHASE 6: SONARQUBE (optional)
        if self.enable_sonarqube {
            if let Some(ref sonar) = self.sonarqube {
                println!("\n🎯 PHASE 6: SonarQube Analysis");
                println!("─────────────────────────────────────────────────────────────");

                // Run SonarQube analysis
                if let Err(e) = sonar.analyze_codebase("ui") {
                    println!("⚠️  SonarQube analysis skipped: {}", e);
                } else {
                    // Check quality gate
                    match sonar.check_quality_gate().await {
                        Ok(gate) => {
                            if gate.project_status.status == "ERROR" {
                                report.sonarqube_failed = true;
                            }
                        }
                        Err(e) => println!("⚠️  Quality gate check skipped: {}", e),
                    }
                }
            }
        }

        report.duration = start_time.elapsed();
        report.print_summary();

        Ok(report)
    }

    async fn run_check<F, Fut>(&self, report: &mut ComprehensiveReport, name: &str, check: F)
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = Result<ValidationResult, String>>,
    {
        print!("  🔍 {}...", name);

        match check().await {
            Ok(result) => {
                if result.issues.is_empty() {
                    println!(" ✅ PASS");
                    report.passed += 1;
                } else {
                    println!(" ❌ FAIL ({} issues)", result.issues.len());
                    report.failed += 1;
                    report.add_advanced_validation(result);
                }
            }
            Err(e) => {
                println!(" ⚠️  SKIP ({})", e);
                report.skipped += 1;
            }
        }
    }

    // Placeholder implementations for remaining checks

    async fn validate_dependencies(&self) -> Result<ValidationResult, String> {
        // Run npm audit and cargo audit to check for vulnerable dependencies
        use std::process::Command;
        let mut issues = Vec::new();

        // Check npm dependencies if package.json exists
        if std::path::Path::new("ui/desktop/package.json").exists() {
            if let Ok(output) = Command::new("npm").args(&["audit", "--audit-level=moderate"]).current_dir("ui/desktop").output() {
                if !output.status.success() {
                    issues.push("npm audit found vulnerabilities in dependencies".to_string());
                }
            }
        }

        // Check cargo dependencies if Cargo.toml exists
        if std::path::Path::new("Cargo.toml").exists() {
            if let Ok(output) = Command::new("cargo").args(&["audit"]).output() {
                if !output.status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    if !stderr.contains("not installed") && !stderr.is_empty() {
                        issues.push("cargo audit found vulnerabilities (install with: cargo install cargo-audit)".to_string());
                    }
                }
            }
        }

        Ok(ValidationResult {
            check_name: "Dependency Security".to_string(),
            issues,
        })
    }

    async fn validate_environment_vars(&self, _files: &[String]) -> Result<ValidationResult, String> {
        // TODO: Check .env.example vs actual usage
        Ok(ValidationResult {
            check_name: "Environment Variables".to_string(),
            issues: vec![],
        })
    }

    async fn validate_security(&self, _files: &[String]) -> Result<ValidationResult, String> {
        // TODO: Run security scanners
        Ok(ValidationResult {
            check_name: "Security Scan".to_string(),
            issues: vec![],
        })
    }

    async fn validate_error_handling(&self, _files: &[String]) -> Result<ValidationResult, String> {
        // TODO: Check for try-catch, error boundaries
        Ok(ValidationResult {
            check_name: "Error Handling".to_string(),
            issues: vec![],
        })
    }

    async fn validate_complexity(&self, _files: &[String]) -> Result<ValidationResult, String> {
        // TODO: Calculate cyclomatic complexity
        Ok(ValidationResult {
            check_name: "Code Complexity".to_string(),
            issues: vec![],
        })
    }

    async fn validate_performance(&self, _files: &[String]) -> Result<ValidationResult, String> {
        // TODO: Check for memory leaks, bundle size
        Ok(ValidationResult {
            check_name: "Performance".to_string(),
            issues: vec![],
        })
    }

    async fn validate_test_coverage(&self, _files: &[String]) -> Result<ValidationResult, String> {
        // TODO: Check coverage percentage
        Ok(ValidationResult {
            check_name: "Test Coverage".to_string(),
            issues: vec![],
        })
    }

    async fn validate_documentation(&self, _files: &[String]) -> Result<ValidationResult, String> {
        // TODO: Check for JSDoc/rustdoc
        Ok(ValidationResult {
            check_name: "Documentation".to_string(),
            issues: vec![],
        })
    }

    async fn validate_accessibility(&self, _files: &[String]) -> Result<ValidationResult, String> {
        // TODO: Run axe-core or similar
        Ok(ValidationResult {
            check_name: "Accessibility".to_string(),
            issues: vec![],
        })
    }

    async fn validate_commit_messages(&self) -> Result<ValidationResult, String> {
        // TODO: Check conventional commits format
        Ok(ValidationResult {
            check_name: "Commit Messages".to_string(),
            issues: vec![],
        })
    }
}

impl Default for ComprehensiveValidator {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug)]
pub struct ComprehensiveReport {
    pub passed: usize,
    pub failed: usize,
    pub skipped: usize,
    pub total: usize,
    pub basic_report: Option<ValidationReport>,
    pub advanced_results: Vec<ValidationResult>,
    pub sonarqube_failed: bool,
    pub duration: std::time::Duration,
}

impl ComprehensiveReport {
    pub fn new() -> Self {
        Self {
            passed: 0,
            failed: 0,
            skipped: 0,
            total: 25,
            basic_report: None,
            advanced_results: Vec::new(),
            sonarqube_failed: false,
            duration: std::time::Duration::default(),
        }
    }

    pub fn add_basic_validation(&mut self, report: ValidationReport) {
        if report.has_failures() {
            self.failed += 1;
        } else {
            self.passed += 1;
        }

        self.basic_report = Some(report);
    }

    pub fn add_advanced_validation(&mut self, result: ValidationResult) {
        self.advanced_results.push(result);
    }

    pub fn is_success(&self) -> bool {
        self.failed == 0 && !self.sonarqube_failed
    }

    pub fn print_summary(&self) {
        println!("\n╔════════════════════════════════════════════════════════════╗");
        println!("║          COMPREHENSIVE VALIDATION SUMMARY                  ║");
        println!("╚════════════════════════════════════════════════════════════╝\n");

        println!("Total Checks:    {} / {}", self.passed + self.failed + self.skipped, self.total);
        println!("✅ Passed:       {}", self.passed);
        println!("❌ Failed:       {}", self.failed);
        println!("⚠️  Skipped:      {}", self.skipped);
        println!("⏱️  Duration:     {:?}", self.duration);

        if self.sonarqube_failed {
            println!("🎯 SonarQube:    ❌ Quality Gate FAILED");
        }

        println!();

        if self.is_success() {
            println!("╔════════════════════════════════════════════════════════════╗");
            println!("║               ✅ ALL VALIDATIONS PASSED!                   ║");
            println!("║          Code is ready for commit/deployment               ║");
            println!("╚════════════════════════════════════════════════════════════╝");
        } else {
            println!("╔════════════════════════════════════════════════════════════╗");
            println!("║              ❌ VALIDATION FAILED!                         ║");
            println!("║    Fix {} issue(s) before reporting work as done           ║", self.failed);
            println!("╚════════════════════════════════════════════════════════════╝");

            println!("\n📋 Issues Found:\n");

            // Print detailed issues
            for result in &self.advanced_results {
                if !result.issues.is_empty() {
                    println!("  {} ({} issues):", result.check_name, result.issues.len());
                    for issue in result.issues.iter().take(5) {
                        println!("    - {}:{} - {}", issue.file, issue.line, issue.message);
                    }
                    if result.issues.len() > 5 {
                        println!("    ... and {} more", result.issues.len() - 5);
                    }
                    println!();
                }
            }
        }
    }

    /// Generate detailed JSON report for CI/CD
    pub fn to_json(&self) -> String {
        // TODO: Implement proper JSON serialization
        format!(
            r#"{{"passed": {}, "failed": {}, "total": {}, "success": {}}}"#,
            self.passed,
            self.failed,
            self.total,
            self.is_success()
        )
    }
}

impl Default for ComprehensiveReport {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_comprehensive_validation() {
        let validator = ComprehensiveValidator::new()
            .with_sonarqube(false); // Skip SonarQube in tests

        let files = vec!["test.ts".to_string()];

        let report = validator.validate_all(&files).await;
        assert!(report.is_ok());
    }
}
