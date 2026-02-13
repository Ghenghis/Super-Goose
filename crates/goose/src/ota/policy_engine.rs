//! PolicyEngine — runtime policy enforcement for self-modification operations.
//!
//! Evaluates proposed changes against a configurable set of rules before
//! allowing OTA self-modification to proceed. Blocks dangerous operations
//! like modifying core build files, enforces file size limits, and
//! rate-limits changes per hour.
//!
//! # Rule Types
//!
//! - **FilePathRule** — blocks writes to protected paths (Cargo.toml, .git/, etc.)
//! - **FileSizeRule** — rejects changes exceeding a configurable byte limit
//! - **RiskLevelRule** — gates high/critical risk changes to RequireApproval
//! - **TimeWindowRule** — (reserved) restrict changes to certain time windows
//! - **RateLimitRule** — caps the number of changes per hour

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

/// What the policy engine decides to do about a proposed change.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum PolicyAction {
    /// Change is allowed to proceed.
    Allow,
    /// Change is denied outright.
    Deny,
    /// Change is allowed but emits a warning.
    Warn,
    /// Change requires explicit human approval before proceeding.
    RequireApproval,
}

impl std::fmt::Display for PolicyAction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PolicyAction::Allow => write!(f, "allow"),
            PolicyAction::Deny => write!(f, "deny"),
            PolicyAction::Warn => write!(f, "warn"),
            PolicyAction::RequireApproval => write!(f, "require_approval"),
        }
    }
}

/// Severity level for policy violations.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum Severity {
    /// Informational only.
    Info,
    /// Something to watch.
    Warning,
    /// A real problem.
    Error,
    /// A showstopper — must not proceed.
    Critical,
}

impl std::fmt::Display for Severity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Severity::Info => write!(f, "info"),
            Severity::Warning => write!(f, "warning"),
            Severity::Error => write!(f, "error"),
            Severity::Critical => write!(f, "critical"),
        }
    }
}

/// What kind of check a policy rule performs.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum RuleType {
    /// Matches file paths against a blocked list.
    FilePathRule,
    /// Checks content size against a byte limit.
    FileSizeRule,
    /// Evaluates a risk-level string (low/medium/high/critical).
    RiskLevelRule,
    /// Restricts changes to certain time windows.
    TimeWindowRule,
    /// Limits the number of changes per hour.
    RateLimitRule,
}

/// A single policy rule definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyRule {
    /// Unique rule identifier.
    pub id: String,
    /// Human-readable rule name.
    pub name: String,
    /// What kind of check this rule performs.
    pub rule_type: RuleType,
    /// Longer description of the rule.
    pub description: String,
    /// What happens when the rule is triggered.
    pub action: PolicyAction,
    /// How severe a violation is.
    pub severity: Severity,
    /// Whether the rule is active.
    pub enabled: bool,
}

/// A recorded violation when a rule fires.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyViolation {
    /// ID of the rule that fired.
    pub rule_id: String,
    /// Name of the rule that fired.
    pub rule_name: String,
    /// What the rule decided.
    pub action: PolicyAction,
    /// Severity of the violation.
    pub severity: Severity,
    /// Human-readable explanation.
    pub message: String,
    /// When the violation was recorded.
    pub timestamp: DateTime<Utc>,
}

/// Result of evaluating all applicable rules for a proposed change.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyEvaluation {
    /// All violations that fired.
    pub violations: Vec<PolicyViolation>,
    /// Whether the change is allowed to proceed (no Deny violations).
    pub allowed: bool,
    /// Summary message.
    pub summary: String,
}

impl PolicyEvaluation {
    /// Create an evaluation that allows the change with no violations.
    pub fn allow(summary: impl Into<String>) -> Self {
        Self {
            violations: Vec::new(),
            allowed: true,
            summary: summary.into(),
        }
    }

    /// Create an evaluation from a list of violations.
    pub fn from_violations(violations: Vec<PolicyViolation>) -> Self {
        let has_deny = violations.iter().any(|v| v.action == PolicyAction::Deny);
        let has_approval = violations
            .iter()
            .any(|v| v.action == PolicyAction::RequireApproval);

        let summary = if violations.is_empty() {
            "No policy violations".to_string()
        } else if has_deny {
            let denied: Vec<_> = violations
                .iter()
                .filter(|v| v.action == PolicyAction::Deny)
                .map(|v| v.rule_name.as_str())
                .collect();
            format!("BLOCKED by: {}", denied.join(", "))
        } else if has_approval {
            format!(
                "{} violation(s), approval required",
                violations.len()
            )
        } else {
            format!("{} warning(s)", violations.len())
        };

        Self {
            allowed: !has_deny,
            violations,
            summary,
        }
    }
}

/// Runtime policy engine that evaluates proposed self-modification changes.
pub struct PolicyEngine {
    /// Active policy rules.
    rules: Vec<PolicyRule>,
    /// Log of all violations recorded this session.
    violations_log: Vec<PolicyViolation>,
    /// File paths that are never allowed to be modified.
    blocked_paths: Vec<String>,
    /// Maximum content size in bytes for a single change.
    max_file_size_bytes: u64,
    /// Maximum number of changes allowed per hour.
    max_changes_per_hour: u32,
    /// Counter of changes in the current hour window.
    changes_this_hour: u32,
}

impl PolicyEngine {
    /// Create a new policy engine with the default rule set.
    pub fn new() -> Self {
        Self::with_defaults()
    }

    /// Create a policy engine with sensible defaults for OTA self-modification.
    pub fn with_defaults() -> Self {
        let blocked_paths = vec![
            "Cargo.toml".to_string(),
            "Cargo.lock".to_string(),
            "lib.rs".to_string(),
            "main.rs".to_string(),
            "mod.rs".to_string(),
            ".github/".to_string(),
            ".git/".to_string(),
        ];

        let rules = vec![
            PolicyRule {
                id: "blocked-path".to_string(),
                name: "Blocked File Path".to_string(),
                rule_type: RuleType::FilePathRule,
                description: "Prevents modification of core project files".to_string(),
                action: PolicyAction::Deny,
                severity: Severity::Critical,
                enabled: true,
            },
            PolicyRule {
                id: "file-size-limit".to_string(),
                name: "File Size Limit".to_string(),
                rule_type: RuleType::FileSizeRule,
                description: "Rejects changes larger than the configured byte limit".to_string(),
                action: PolicyAction::Deny,
                severity: Severity::Error,
                enabled: true,
            },
            PolicyRule {
                id: "high-risk-gate".to_string(),
                name: "High Risk Gate".to_string(),
                rule_type: RuleType::RiskLevelRule,
                description: "Requires approval for high/critical risk changes".to_string(),
                action: PolicyAction::RequireApproval,
                severity: Severity::Warning,
                enabled: true,
            },
            PolicyRule {
                id: "rate-limit".to_string(),
                name: "Hourly Rate Limit".to_string(),
                rule_type: RuleType::RateLimitRule,
                description: "Caps the number of self-modifications per hour".to_string(),
                action: PolicyAction::Deny,
                severity: Severity::Error,
                enabled: true,
            },
        ];

        Self {
            rules,
            violations_log: Vec::new(),
            blocked_paths,
            max_file_size_bytes: 100_000,
            max_changes_per_hour: 10,
            changes_this_hour: 0,
        }
    }

    /// Add a custom rule to the engine.
    pub fn add_rule(&mut self, rule: PolicyRule) {
        info!(rule_id = %rule.id, rule_name = %rule.name, "Adding policy rule");
        self.rules.push(rule);
    }

    /// Evaluate whether a file change is allowed.
    ///
    /// Checks blocked paths, file size limits, and rate limits.
    pub fn evaluate_file_change(
        &mut self,
        file_path: &str,
        content_size: usize,
    ) -> PolicyEvaluation {
        let mut violations = Vec::new();

        // Check blocked paths
        if self.is_path_blocked(file_path) {
            let v = PolicyViolation {
                rule_id: "blocked-path".to_string(),
                rule_name: "Blocked File Path".to_string(),
                action: PolicyAction::Deny,
                severity: Severity::Critical,
                message: format!("Path is blocked: {}", file_path),
                timestamp: Utc::now(),
            };
            warn!(path = %file_path, "Policy DENY: blocked path");
            violations.push(v);
        }

        // Check file size
        if content_size as u64 > self.max_file_size_bytes {
            let v = PolicyViolation {
                rule_id: "file-size-limit".to_string(),
                rule_name: "File Size Limit".to_string(),
                action: PolicyAction::Deny,
                severity: Severity::Error,
                message: format!(
                    "Content size {} exceeds limit {}",
                    content_size, self.max_file_size_bytes
                ),
                timestamp: Utc::now(),
            };
            warn!(
                size = content_size,
                limit = self.max_file_size_bytes,
                "Policy DENY: file size exceeded"
            );
            violations.push(v);
        }

        // Check rate limit
        if self.changes_this_hour >= self.max_changes_per_hour {
            let v = PolicyViolation {
                rule_id: "rate-limit".to_string(),
                rule_name: "Hourly Rate Limit".to_string(),
                action: PolicyAction::Deny,
                severity: Severity::Error,
                message: format!(
                    "Rate limit reached: {}/{} changes this hour",
                    self.changes_this_hour, self.max_changes_per_hour
                ),
                timestamp: Utc::now(),
            };
            warn!(
                count = self.changes_this_hour,
                max = self.max_changes_per_hour,
                "Policy DENY: rate limit"
            );
            violations.push(v);
        }

        // Record violations
        for v in &violations {
            self.record_violation(v.clone());
        }

        // Increment change counter if allowed
        let eval = PolicyEvaluation::from_violations(violations);
        if eval.allowed {
            self.changes_this_hour += 1;
        }

        eval
    }

    /// Evaluate a risk level string (low, medium, high, critical).
    pub fn evaluate_risk_level(&self, risk: &str) -> PolicyEvaluation {
        match risk.to_lowercase().as_str() {
            "low" | "none" => PolicyEvaluation::allow("Low risk — allowed"),
            "medium" => {
                let v = PolicyViolation {
                    rule_id: "high-risk-gate".to_string(),
                    rule_name: "High Risk Gate".to_string(),
                    action: PolicyAction::Warn,
                    severity: Severity::Info,
                    message: "Medium risk: proceed with caution".to_string(),
                    timestamp: Utc::now(),
                };
                PolicyEvaluation::from_violations(vec![v])
            }
            "high" => {
                let v = PolicyViolation {
                    rule_id: "high-risk-gate".to_string(),
                    rule_name: "High Risk Gate".to_string(),
                    action: PolicyAction::RequireApproval,
                    severity: Severity::Warning,
                    message: "High risk: requires approval".to_string(),
                    timestamp: Utc::now(),
                };
                PolicyEvaluation::from_violations(vec![v])
            }
            "critical" => {
                let v = PolicyViolation {
                    rule_id: "high-risk-gate".to_string(),
                    rule_name: "High Risk Gate".to_string(),
                    action: PolicyAction::Deny,
                    severity: Severity::Critical,
                    message: "Critical risk: denied".to_string(),
                    timestamp: Utc::now(),
                };
                PolicyEvaluation::from_violations(vec![v])
            }
            _ => PolicyEvaluation::allow(format!("Unknown risk '{}' — defaulting to allow", risk)),
        }
    }

    /// Check whether a path is in the blocked list.
    pub fn is_path_blocked(&self, path: &str) -> bool {
        let normalized = path.replace('\\', "/");
        self.blocked_paths.iter().any(|blocked| {
            // Exact match on filename component
            let file_name = normalized
                .rsplit('/')
                .next()
                .unwrap_or(&normalized);
            if file_name == blocked.trim_end_matches('/') {
                return true;
            }
            // Prefix/contains match for directory patterns
            if blocked.ends_with('/') {
                let dir = blocked.trim_end_matches('/');
                if normalized.contains(&format!("/{}/", dir))
                    || normalized.starts_with(&format!("{}/", dir))
                    || normalized.contains(&format!("\\{}\\", dir))
                {
                    return true;
                }
            }
            false
        })
    }

    /// Record a violation in the session log.
    pub fn record_violation(&mut self, violation: PolicyViolation) {
        info!(
            rule = %violation.rule_id,
            severity = %violation.severity,
            "Recording policy violation"
        );
        self.violations_log.push(violation);
    }

    /// Get all recorded violations.
    pub fn violations(&self) -> &[PolicyViolation] {
        &self.violations_log
    }

    /// Get all configured rules.
    pub fn rules(&self) -> &[PolicyRule] {
        &self.rules
    }

    /// Reset the hourly change counter (call from a scheduler).
    pub fn reset_hourly_counter(&mut self) {
        info!(
            previous = self.changes_this_hour,
            "Resetting hourly change counter"
        );
        self.changes_this_hour = 0;
    }

    /// Get the current hourly change count.
    pub fn changes_this_hour(&self) -> u32 {
        self.changes_this_hour
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_blocked_paths() {
        let engine = PolicyEngine::new();
        assert!(engine.blocked_paths.contains(&"Cargo.toml".to_string()));
        assert!(engine.blocked_paths.contains(&"Cargo.lock".to_string()));
        assert!(engine.blocked_paths.contains(&"lib.rs".to_string()));
        assert!(engine.blocked_paths.contains(&"main.rs".to_string()));
        assert!(engine.blocked_paths.contains(&"mod.rs".to_string()));
        assert!(engine.blocked_paths.contains(&".github/".to_string()));
        assert!(engine.blocked_paths.contains(&".git/".to_string()));
    }

    #[test]
    fn test_path_blocked_cargo_toml() {
        let engine = PolicyEngine::new();
        assert!(engine.is_path_blocked("Cargo.toml"));
        assert!(engine.is_path_blocked("crates/goose/Cargo.toml"));
        assert!(engine.is_path_blocked("some/path/Cargo.lock"));
        assert!(engine.is_path_blocked("src/lib.rs"));
        assert!(engine.is_path_blocked("src/main.rs"));
    }

    #[test]
    fn test_path_allowed_agent_file() {
        let engine = PolicyEngine::new();
        assert!(!engine.is_path_blocked("crates/goose/src/agents/agent.rs"));
        assert!(!engine.is_path_blocked("crates/goose/src/ota/policy_engine.rs"));
        assert!(!engine.is_path_blocked("src/utils/helpers.rs"));
    }

    #[test]
    fn test_file_size_exceeds_limit() {
        let mut engine = PolicyEngine::new();
        // Default limit is 100_000 bytes
        let eval = engine.evaluate_file_change("src/new_file.rs", 200_000);
        assert!(!eval.allowed);
        assert!(!eval.violations.is_empty());
        assert!(eval.summary.contains("BLOCKED"));

        // Under the limit should be fine
        let eval2 = engine.evaluate_file_change("src/small_file.rs", 500);
        assert!(eval2.allowed);
    }

    #[test]
    fn test_risk_level_evaluation() {
        let engine = PolicyEngine::new();

        let low = engine.evaluate_risk_level("low");
        assert!(low.allowed);
        assert!(low.violations.is_empty());

        let medium = engine.evaluate_risk_level("medium");
        assert!(medium.allowed); // warn only
        assert_eq!(medium.violations.len(), 1);
        assert_eq!(medium.violations[0].action, PolicyAction::Warn);

        let high = engine.evaluate_risk_level("high");
        assert!(high.allowed); // RequireApproval is not Deny
        assert_eq!(high.violations[0].action, PolicyAction::RequireApproval);

        let critical = engine.evaluate_risk_level("critical");
        assert!(!critical.allowed); // Deny
        assert_eq!(critical.violations[0].action, PolicyAction::Deny);
    }

    #[test]
    fn test_rate_limiting() {
        let mut engine = PolicyEngine::new();
        // Exhaust the rate limit
        for i in 0..10 {
            let eval = engine.evaluate_file_change(
                &format!("src/file_{}.rs", i),
                100,
            );
            assert!(eval.allowed, "Change {} should be allowed", i);
        }

        // 11th change should be denied
        let eval = engine.evaluate_file_change("src/file_overflow.rs", 100);
        assert!(!eval.allowed);
        assert!(eval.summary.contains("BLOCKED"));

        // Reset and try again
        engine.reset_hourly_counter();
        let eval = engine.evaluate_file_change("src/file_after_reset.rs", 100);
        assert!(eval.allowed);
    }

    #[test]
    fn test_policy_evaluation_summary() {
        // No violations
        let eval = PolicyEvaluation::from_violations(Vec::new());
        assert!(eval.allowed);
        assert_eq!(eval.summary, "No policy violations");

        // Warning only
        let warn_v = PolicyViolation {
            rule_id: "test".to_string(),
            rule_name: "Test Rule".to_string(),
            action: PolicyAction::Warn,
            severity: Severity::Info,
            message: "Just a warning".to_string(),
            timestamp: Utc::now(),
        };
        let eval = PolicyEvaluation::from_violations(vec![warn_v]);
        assert!(eval.allowed);
        assert!(eval.summary.contains("warning"));

        // Deny
        let deny_v = PolicyViolation {
            rule_id: "blocker".to_string(),
            rule_name: "Blocker Rule".to_string(),
            action: PolicyAction::Deny,
            severity: Severity::Critical,
            message: "Blocked".to_string(),
            timestamp: Utc::now(),
        };
        let eval = PolicyEvaluation::from_violations(vec![deny_v]);
        assert!(!eval.allowed);
        assert!(eval.summary.contains("BLOCKED"));
    }

    #[test]
    fn test_serialization() {
        // PolicyAction
        let action = PolicyAction::RequireApproval;
        let json = serde_json::to_string(&action).unwrap();
        let deserialized: PolicyAction = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, PolicyAction::RequireApproval);

        // Severity
        let sev = Severity::Critical;
        let json = serde_json::to_string(&sev).unwrap();
        let deserialized: Severity = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, Severity::Critical);

        // PolicyViolation
        let violation = PolicyViolation {
            rule_id: "test-rule".to_string(),
            rule_name: "Test Rule".to_string(),
            action: PolicyAction::Deny,
            severity: Severity::Error,
            message: "Test violation".to_string(),
            timestamp: Utc::now(),
        };
        let json = serde_json::to_string(&violation).unwrap();
        let deserialized: PolicyViolation = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.rule_id, "test-rule");
        assert_eq!(deserialized.action, PolicyAction::Deny);
        assert_eq!(deserialized.severity, Severity::Error);

        // PolicyRule
        let rule = PolicyRule {
            id: "r1".to_string(),
            name: "Rule One".to_string(),
            rule_type: RuleType::FilePathRule,
            description: "A test rule".to_string(),
            action: PolicyAction::Allow,
            severity: Severity::Info,
            enabled: true,
        };
        let json = serde_json::to_string(&rule).unwrap();
        let deserialized: PolicyRule = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "r1");
        assert!(deserialized.enabled);
    }

    #[test]
    fn test_add_custom_rule() {
        let mut engine = PolicyEngine::new();
        let initial_count = engine.rules().len();

        engine.add_rule(PolicyRule {
            id: "custom-1".to_string(),
            name: "Custom Rule".to_string(),
            rule_type: RuleType::TimeWindowRule,
            description: "No changes on weekends".to_string(),
            action: PolicyAction::Deny,
            severity: Severity::Warning,
            enabled: true,
        });

        assert_eq!(engine.rules().len(), initial_count + 1);
    }

    #[test]
    fn test_policy_action_display() {
        assert_eq!(PolicyAction::Allow.to_string(), "allow");
        assert_eq!(PolicyAction::Deny.to_string(), "deny");
        assert_eq!(PolicyAction::Warn.to_string(), "warn");
        assert_eq!(PolicyAction::RequireApproval.to_string(), "require_approval");
    }

    #[test]
    fn test_severity_display() {
        assert_eq!(Severity::Info.to_string(), "info");
        assert_eq!(Severity::Warning.to_string(), "warning");
        assert_eq!(Severity::Error.to_string(), "error");
        assert_eq!(Severity::Critical.to_string(), "critical");
    }

    #[test]
    fn test_severity_ordering() {
        assert!(Severity::Info < Severity::Warning);
        assert!(Severity::Warning < Severity::Error);
        assert!(Severity::Error < Severity::Critical);
    }

    #[test]
    fn test_blocked_path_git_directory() {
        let engine = PolicyEngine::new();
        assert!(engine.is_path_blocked(".git/config"));
        assert!(engine.is_path_blocked(".github/workflows/ci.yml"));
    }

    #[test]
    fn test_violations_log() {
        let mut engine = PolicyEngine::new();
        assert!(engine.violations().is_empty());

        // Trigger a violation
        engine.evaluate_file_change("Cargo.toml", 100);
        assert!(!engine.violations().is_empty());
    }
}
