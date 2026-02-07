use std::path::Path;
use std::process::Command;

pub struct PostCodeValidator {
    strict_mode: bool,
}

impl PostCodeValidator {
    pub fn new() -> Self {
        Self { strict_mode: true }
    }

    pub fn with_strict_mode(strict: bool) -> Self {
        Self {
            strict_mode: strict,
        }
    }

    /// Validate code changes before reporting completion
    pub async fn validate_changes(
        &self,
        files_changed: &[String],
    ) -> Result<ValidationReport, String> {
        let mut report = ValidationReport::new();

        println!("\n╔══════════════════════════════════════════╗");
        println!("║   RUNNING POST-CODE VALIDATION CHECKS    ║");
        println!("╚══════════════════════════════════════════╝\n");

        // Step 1: Syntax Check
        report.add_check(
            "Syntax Check",
            self.check_syntax(files_changed).await?,
        );

        // Step 2: TODO/FIXME Scan
        report.add_check(
            "Incomplete Markers Scan",
            self.scan_for_incomplete_markers(files_changed).await?,
        );

        // Step 3: Integration/Wiring Check
        report.add_check(
            "Component Wiring Check",
            self.verify_wiring(files_changed).await?,
        );

        // Step 4: Lint Check
        report.add_check("Lint Check", self.run_linters(files_changed).await?);

        // Step 5: Type Check
        report.add_check("Type Check", self.check_types(files_changed).await?);

        // Step 6: Build Check
        if self.strict_mode {
            report.add_check("Build Check", self.attempt_build().await?);
        }

        Ok(report)
    }

    async fn check_syntax(&self, files: &[String]) -> Result<CheckResult, String> {
        println!("🔍 Checking syntax...");
        let mut issues = Vec::new();

        for file in files {
            if file.ends_with(".ts") || file.ends_with(".tsx") {
                let output = Command::new("npx")
                    .args(["tsc", "--noEmit", file])
                    .current_dir("ui/desktop")
                    .output();

                if let Ok(output) = output {
                    if !output.status.success() {
                        issues.push(format!(
                            "{}: {}",
                            file,
                            String::from_utf8_lossy(&output.stderr)
                        ));
                    }
                }
            } else if file.ends_with(".rs") {
                let output = Command::new("rustc")
                    .args(["--parse-only", file])
                    .output();

                if let Ok(output) = output {
                    if !output.status.success() {
                        issues.push(format!(
                            "{}: {}",
                            file,
                            String::from_utf8_lossy(&output.stderr)
                        ));
                    }
                }
            }
        }

        if issues.is_empty() {
            Ok(CheckResult::Pass)
        } else {
            Ok(CheckResult::Fail {
                reason: format!("Found {} syntax errors", issues.len()),
                details: issues,
            })
        }
    }

    async fn scan_for_incomplete_markers(&self, files: &[String]) -> Result<CheckResult, String> {
        println!("🔍 Scanning for incomplete markers...");
        let markers = vec!["TODO", "FIXME", "HACK", "XXX", "STUB", "PLACEHOLDER"];
        let mut issues = Vec::new();

        for file in files {
            if let Ok(content) = std::fs::read_to_string(file) {
                for (line_num, line) in content.lines().enumerate() {
                    for marker in &markers {
                        // Look for markers in comments
                        if line.contains(&format!("//{}", marker))
                            || line.contains(&format!("/*{}", marker))
                            || line.contains(&format!("#{}", marker))
                        {
                            issues.push(format!(
                                "{}:{}: {}",
                                file,
                                line_num + 1,
                                line.trim()
                            ));
                        }
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
        println!("🔍 Checking component wiring...");
        let mut issues = Vec::new();

        for file in files {
            if file.ends_with(".tsx") || file.ends_with(".ts") {
                if let Ok(content) = std::fs::read_to_string(file) {
                    // Check for event handlers without implementation
                    if self.has_empty_handlers(&content) {
                        issues.push(format!(
                            "{}: Event handlers defined but not implemented",
                            file
                        ));
                    }

                    // Check for state that's never updated
                    if self.has_unused_state(&content) {
                        issues.push(format!(
                            "{}: State defined but never updated",
                            file
                        ));
                    }

                    // Check for imports that aren't used
                    if self.has_unused_imports(&content) {
                        issues.push(format!("{}: Unused imports detected", file));
                    }
                }
            }
        }

        if issues.is_empty() {
            Ok(CheckResult::Pass)
        } else {
            Ok(CheckResult::Warning {
                reason: "Some components may not be properly wired".to_string(),
                details: issues,
            })
        }
    }

    async fn run_linters(&self, files: &[String]) -> Result<CheckResult, String> {
        println!("🔍 Running linters...");
        let mut issues = Vec::new();

        // TypeScript/JavaScript linting
        let ts_files: Vec<&str> = files
            .iter()
            .filter(|f| f.ends_with(".ts") || f.ends_with(".tsx"))
            .map(|s| s.as_str())
            .collect();

        if !ts_files.is_empty() {
            let output = Command::new("npm")
                .args(["run", "lint:check"])
                .current_dir("ui/desktop")
                .output();

            if let Ok(output) = output {
                if !output.status.success() {
                    issues.push(format!(
                        "TypeScript linting failed:\n{}",
                        String::from_utf8_lossy(&output.stdout)
                    ));
                }
            }
        }

        // Rust linting
        let rs_files: Vec<&str> = files
            .iter()
            .filter(|f| f.ends_with(".rs"))
            .map(|s| s.as_str())
            .collect();

        if !rs_files.is_empty() {
            let output = Command::new("cargo")
                .args(["clippy", "--all-targets", "--", "-D", "warnings"])
                .output();

            if let Ok(output) = output {
                if !output.status.success() {
                    issues.push(format!(
                        "Rust clippy failed:\n{}",
                        String::from_utf8_lossy(&output.stderr)
                    ));
                }
            }
        }

        if issues.is_empty() {
            Ok(CheckResult::Pass)
        } else {
            Ok(CheckResult::Fail {
                reason: "Linting errors found".to_string(),
                details: issues,
            })
        }
    }

    async fn check_types(&self, files: &[String]) -> Result<CheckResult, String> {
        println!("🔍 Running type checks...");
        let mut issues = Vec::new();

        // TypeScript type checking
        let has_ts = files.iter().any(|f| f.ends_with(".ts") || f.ends_with(".tsx"));

        if has_ts {
            let output = Command::new("npx")
                .args(["tsc", "--noEmit"])
                .current_dir("ui/desktop")
                .output();

            if let Ok(output) = output {
                if !output.status.success() {
                    issues.push(format!(
                        "TypeScript type errors:\n{}",
                        String::from_utf8_lossy(&output.stdout)
                    ));
                }
            }
        }

        // Rust type checking is done by cargo check
        let has_rs = files.iter().any(|f| f.ends_with(".rs"));

        if has_rs {
            let output = Command::new("cargo").args(["check"]).output();

            if let Ok(output) = output {
                if !output.status.success() {
                    issues.push(format!(
                        "Rust type errors:\n{}",
                        String::from_utf8_lossy(&output.stderr)
                    ));
                }
            }
        }

        if issues.is_empty() {
            Ok(CheckResult::Pass)
        } else {
            Ok(CheckResult::Fail {
                reason: "Type checking failed".to_string(),
                details: issues,
            })
        }
    }

    async fn attempt_build(&self) -> Result<CheckResult, String> {
        println!("🔍 Attempting build...");
        let mut issues = Vec::new();

        // Try TypeScript build
        if Path::new("ui/desktop/package.json").exists() {
            let output = Command::new("npm")
                .args(["run", "build"])
                .current_dir("ui/desktop")
                .output();

            if let Ok(output) = output {
                if !output.status.success() {
                    issues.push(format!(
                        "TypeScript build failed:\n{}",
                        String::from_utf8_lossy(&output.stderr)
                    ));
                }
            }
        }

        // Try Rust build
        if Path::new("Cargo.toml").exists() {
            let output = Command::new("cargo")
                .args(["build", "--release"])
                .output();

            if let Ok(output) = output {
                if !output.status.success() {
                    issues.push(format!(
                        "Rust build failed:\n{}",
                        String::from_utf8_lossy(&output.stderr)
                    ));
                }
            }
        }

        if issues.is_empty() {
            Ok(CheckResult::Pass)
        } else {
            Ok(CheckResult::Fail {
                reason: "Build failed".to_string(),
                details: issues,
            })
        }
    }

    // Helper methods

    fn has_empty_handlers(&self, content: &str) -> bool {
        // Check for handlers like: onClick={() => {}}
        content.contains("=> {}") || content.contains("=> { }")
    }

    fn has_unused_state(&self, content: &str) -> bool {
        // Simple heuristic: check if useState is present but no set calls
        if content.contains("useState") {
            let set_call_count = content.matches("set").count();
            let use_state_count = content.matches("useState").count();
            return set_call_count < use_state_count;
        }
        false
    }

    fn has_unused_imports(&self, content: &str) -> bool {
        // Very basic check - just warn if we see unused import patterns
        content.contains("import {") && content.contains("// eslint-disable-line no-unused-vars")
    }
}

impl Default for PostCodeValidator {
    fn default() -> Self {
        Self::new()
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
        self.checks
            .iter()
            .any(|(_, result)| matches!(result, CheckResult::Fail { .. }))
    }

    pub fn has_warnings(&self) -> bool {
        self.checks
            .iter()
            .any(|(_, result)| matches!(result, CheckResult::Warning { .. }))
    }

    pub fn print_summary(&self) {
        println!("\n╔══════════════════════════════════════════╗");
        println!("║        VALIDATION REPORT SUMMARY         ║");
        println!("╚══════════════════════════════════════════╝\n");

        let mut passed = 0;
        let mut failed = 0;
        let mut warned = 0;

        for (name, result) in &self.checks {
            match result {
                CheckResult::Pass => {
                    println!("✅ {}: PASS", name);
                    passed += 1;
                }
                CheckResult::Fail { reason, details } => {
                    println!("❌ {}: FAIL - {}", name, reason);
                    for detail in details.iter().take(5) {
                        println!("   {}", detail);
                    }
                    if details.len() > 5 {
                        println!("   ... and {} more issues", details.len() - 5);
                    }
                    failed += 1;
                }
                CheckResult::Warning { reason, details } => {
                    println!("⚠️  {}: WARNING - {}", name, reason);
                    for detail in details.iter().take(3) {
                        println!("   {}", detail);
                    }
                    if details.len() > 3 {
                        println!("   ... and {} more warnings", details.len() - 3);
                    }
                    warned += 1;
                }
            }
        }

        println!("\n────────────────────────────────────────────");
        println!(
            "Summary: {} passed, {} warnings, {} failed",
            passed, warned, failed
        );
        println!("────────────────────────────────────────────\n");

        if failed > 0 {
            println!("⛔ VALIDATION FAILED - Fix issues above before proceeding!");
        } else if warned > 0 {
            println!("⚠️  VALIDATION PASSED WITH WARNINGS - Review warnings above");
        } else {
            println!("✅ ALL CHECKS PASSED!");
        }
    }
}

impl Default for ValidationReport {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_has_empty_handlers() {
        let validator = PostCodeValidator::new();
        assert!(validator.has_empty_handlers("onClick={() => {}}"));
        assert!(!validator.has_empty_handlers("onClick={() => { doSomething(); }}"));
    }

    #[test]
    fn test_validation_report() {
        let mut report = ValidationReport::new();
        report.add_check("Test", CheckResult::Pass);
        assert!(!report.has_failures());
        assert!(!report.has_warnings());
    }
}
