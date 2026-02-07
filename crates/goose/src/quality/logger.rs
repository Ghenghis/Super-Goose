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

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
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
        writeln!(file, "║  Run: {:<54} ║", run_name)
            .map_err(|e| e.to_string())?;
        writeln!(file, "║  Started: {:<49} ║", Local::now().format("%Y-%m-%d %H:%M:%S"))
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
            writeln!(file, "║  Completed: {:<46} ║",
                     Local::now().format("%Y-%m-%d %H:%M:%S"))
                .map_err(|e| e.to_string())?;
            writeln!(file, "╚════════════════════════════════════════════════════════════════╝")
                .map_err(|e| e.to_string())?;
        }

        Ok(())
    }
}

impl Default for ValidationLogger {
    fn default() -> Self {
        Self::new().expect("Failed to create ValidationLogger")
    }
}
