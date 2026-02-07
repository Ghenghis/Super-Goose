//! Handoff Validation System for ALMAS Role Transitions
//!
//! This module manages transitions between ALMAS specialist roles, ensuring
//! proper validation, artifact transfer, and workflow continuity.

use super::enforcer::{CapabilityEnforcer, EnforcementResult, Operation};
use super::roles::{AlmasRole, RoleConfig};
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tracing::{debug, info, warn};

/// Represents a handoff from one role to another
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Handoff {
    pub from_role: AlmasRole,
    pub to_role: AlmasRole,
    pub artifacts: Vec<HandoffArtifact>,
    pub validation_rules: Vec<ValidationRule>,
    pub context: HandoffContext,
}

/// Artifact transferred during a handoff
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandoffArtifact {
    pub name: String,
    pub path: PathBuf,
    pub artifact_type: ArtifactType,
    pub required: bool,
    pub metadata: HashMap<String, String>,
}

/// Type of artifact being transferred
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ArtifactType {
    Plan,
    Code,
    Test,
    Documentation,
    SecurityReport,
    BuildArtifact,
    DeploymentConfig,
}

/// Validation rule for handoffs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationRule {
    pub rule_type: ValidationRuleType,
    pub description: String,
    pub required: bool,
}

/// Type of validation rule
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ValidationRuleType {
    AllTestsPass,
    NoCompilationErrors,
    SecurityScanClean,
    CodeCoverageMinimum,
    DocumentationComplete,
    NoTodoComments,
    LintChecksPassed,
    ArtifactsPresent,
}

/// Context information for a handoff
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandoffContext {
    pub task_id: String,
    pub task_description: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub metadata: HashMap<String, String>,
}

/// Result of a handoff validation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandoffValidationResult {
    pub valid: bool,
    pub from_role: AlmasRole,
    pub to_role: AlmasRole,
    pub passed_rules: Vec<String>,
    pub failed_rules: Vec<String>,
    pub warnings: Vec<String>,
    pub artifacts_transferred: usize,
}

/// Manages handoffs between ALMAS roles
#[derive(Debug)]
pub struct HandoffManager {
    current_role: AlmasRole,
    enforcer: CapabilityEnforcer,
    handoff_history: Vec<Handoff>,
}

impl HandoffManager {
    /// Create a new handoff manager for the specified role
    pub fn new(initial_role: AlmasRole) -> Self {
        Self {
            current_role: initial_role,
            enforcer: CapabilityEnforcer::new(initial_role),
            handoff_history: Vec::new(),
        }
    }

    /// Get the current role
    pub fn current_role(&self) -> AlmasRole {
        self.current_role
    }

    /// Get handoff history
    pub fn handoff_history(&self) -> &[Handoff] {
        &self.handoff_history
    }

    /// Validate a handoff from current role to target role
    pub fn validate_handoff(&self, handoff: &Handoff) -> Result<HandoffValidationResult> {
        if handoff.from_role != self.current_role {
            return Err(anyhow!(
                "Invalid handoff: current role is {:?}, but handoff specifies {:?}",
                self.current_role,
                handoff.from_role
            ));
        }

        if !self.is_valid_transition(handoff.from_role, handoff.to_role) {
            return Err(anyhow!(
                "Invalid transition from {:?} to {:?}",
                handoff.from_role,
                handoff.to_role
            ));
        }

        let mut passed_rules = Vec::new();
        let mut failed_rules = Vec::new();
        let mut warnings = Vec::new();

        // Validate all rules
        for rule in &handoff.validation_rules {
            match self.validate_rule(rule, handoff) {
                Ok(true) => {
                    passed_rules.push(rule.description.clone());
                }
                Ok(false) => {
                    if rule.required {
                        failed_rules.push(rule.description.clone());
                    } else {
                        warnings.push(format!("Optional rule failed: {}", rule.description));
                    }
                }
                Err(e) => {
                    if rule.required {
                        failed_rules.push(format!("{}: {}", rule.description, e));
                    } else {
                        warnings.push(format!(
                            "Optional rule error: {}: {}",
                            rule.description, e
                        ));
                    }
                }
            }
        }

        // Validate required artifacts
        let mut artifacts_transferred = 0;
        for artifact in &handoff.artifacts {
            if artifact.required && !artifact.path.exists() {
                failed_rules.push(format!(
                    "Required artifact missing: {} at {}",
                    artifact.name,
                    artifact.path.display()
                ));
            } else if artifact.path.exists() {
                artifacts_transferred += 1;
            }
        }

        let valid = failed_rules.is_empty();

        Ok(HandoffValidationResult {
            valid,
            from_role: handoff.from_role,
            to_role: handoff.to_role,
            passed_rules,
            failed_rules,
            warnings,
            artifacts_transferred,
        })
    }

    /// Execute a handoff after validation
    pub fn execute_handoff(&mut self, handoff: Handoff) -> Result<HandoffValidationResult> {
        let validation_result = self.validate_handoff(&handoff)?;

        if !validation_result.valid {
            warn!(
                from_role = ?handoff.from_role,
                to_role = ?handoff.to_role,
                failed_rules = ?validation_result.failed_rules,
                "Handoff validation failed"
            );
            return Err(anyhow!(
                "Handoff validation failed: {:?}",
                validation_result.failed_rules
            ));
        }

        info!(
            from_role = ?handoff.from_role,
            to_role = ?handoff.to_role,
            artifacts = validation_result.artifacts_transferred,
            "Executing handoff"
        );

        // Switch to new role
        self.current_role = handoff.to_role;
        self.enforcer.switch_role(handoff.to_role);

        // Record handoff
        self.handoff_history.push(handoff);

        Ok(validation_result)
    }

    /// Check if a transition between roles is valid
    fn is_valid_transition(&self, from: AlmasRole, to: AlmasRole) -> bool {
        match from {
            AlmasRole::Architect => matches!(to, AlmasRole::Developer),
            AlmasRole::Developer => matches!(to, AlmasRole::Qa | AlmasRole::Architect),
            AlmasRole::Qa => matches!(to, AlmasRole::Security | AlmasRole::Developer),
            AlmasRole::Security => matches!(to, AlmasRole::Deployer | AlmasRole::Developer),
            AlmasRole::Deployer => false, // Final role, no handoffs
        }
    }

    /// Validate a specific rule
    fn validate_rule(&self, rule: &ValidationRule, _handoff: &Handoff) -> Result<bool> {
        match rule.rule_type {
            ValidationRuleType::ArtifactsPresent => {
                // This is validated separately
                Ok(true)
            }
            ValidationRuleType::AllTestsPass => {
                // Placeholder: Would integrate with actual test runner
                debug!("Validating: All tests pass");
                Ok(true)
            }
            ValidationRuleType::NoCompilationErrors => {
                // Placeholder: Would integrate with cargo check
                debug!("Validating: No compilation errors");
                Ok(true)
            }
            ValidationRuleType::SecurityScanClean => {
                // Placeholder: Would integrate with cargo audit
                debug!("Validating: Security scan clean");
                Ok(true)
            }
            ValidationRuleType::CodeCoverageMinimum => {
                // Placeholder: Would integrate with coverage tools
                debug!("Validating: Code coverage minimum");
                Ok(true)
            }
            ValidationRuleType::DocumentationComplete => {
                // Placeholder: Would check for doc comments
                debug!("Validating: Documentation complete");
                Ok(true)
            }
            ValidationRuleType::NoTodoComments => {
                // Placeholder: Would grep for TODO/FIXME
                debug!("Validating: No TODO comments");
                Ok(true)
            }
            ValidationRuleType::LintChecksPassed => {
                // Placeholder: Would integrate with cargo clippy
                debug!("Validating: Lint checks passed");
                Ok(true)
            }
        }
    }

    /// Create a standard handoff from Architect to Developer
    pub fn architect_to_developer(
        task_id: impl Into<String>,
        task_description: impl Into<String>,
        plan_path: PathBuf,
    ) -> Handoff {
        Handoff {
            from_role: AlmasRole::Architect,
            to_role: AlmasRole::Developer,
            artifacts: vec![HandoffArtifact {
                name: "Architecture Plan".to_string(),
                path: plan_path,
                artifact_type: ArtifactType::Plan,
                required: true,
                metadata: HashMap::new(),
            }],
            validation_rules: vec![
                ValidationRule {
                    rule_type: ValidationRuleType::ArtifactsPresent,
                    description: "Architecture plan document exists".to_string(),
                    required: true,
                },
                ValidationRule {
                    rule_type: ValidationRuleType::DocumentationComplete,
                    description: "Plan includes all required sections".to_string(),
                    required: true,
                },
            ],
            context: HandoffContext {
                task_id: task_id.into(),
                task_description: task_description.into(),
                timestamp: chrono::Utc::now(),
                metadata: HashMap::new(),
            },
        }
    }

    /// Create a standard handoff from Developer to QA
    pub fn developer_to_qa(
        task_id: impl Into<String>,
        task_description: impl Into<String>,
        code_paths: Vec<PathBuf>,
    ) -> Handoff {
        let artifacts = code_paths
            .into_iter()
            .map(|path| HandoffArtifact {
                name: format!("Code: {}", path.display()),
                path,
                artifact_type: ArtifactType::Code,
                required: true,
                metadata: HashMap::new(),
            })
            .collect();

        Handoff {
            from_role: AlmasRole::Developer,
            to_role: AlmasRole::Qa,
            artifacts,
            validation_rules: vec![
                ValidationRule {
                    rule_type: ValidationRuleType::NoCompilationErrors,
                    description: "Code compiles without errors".to_string(),
                    required: true,
                },
                ValidationRule {
                    rule_type: ValidationRuleType::NoTodoComments,
                    description: "No TODO/FIXME comments in production code".to_string(),
                    required: true,
                },
                ValidationRule {
                    rule_type: ValidationRuleType::LintChecksPassed,
                    description: "All lint checks pass".to_string(),
                    required: true,
                },
            ],
            context: HandoffContext {
                task_id: task_id.into(),
                task_description: task_description.into(),
                timestamp: chrono::Utc::now(),
                metadata: HashMap::new(),
            },
        }
    }

    /// Create a standard handoff from QA to Security
    pub fn qa_to_security(
        task_id: impl Into<String>,
        task_description: impl Into<String>,
        test_paths: Vec<PathBuf>,
    ) -> Handoff {
        let artifacts = test_paths
            .into_iter()
            .map(|path| HandoffArtifact {
                name: format!("Test: {}", path.display()),
                path,
                artifact_type: ArtifactType::Test,
                required: true,
                metadata: HashMap::new(),
            })
            .collect();

        Handoff {
            from_role: AlmasRole::Qa,
            to_role: AlmasRole::Security,
            artifacts,
            validation_rules: vec![
                ValidationRule {
                    rule_type: ValidationRuleType::AllTestsPass,
                    description: "All tests pass".to_string(),
                    required: true,
                },
                ValidationRule {
                    rule_type: ValidationRuleType::CodeCoverageMinimum,
                    description: "Code coverage meets minimum threshold".to_string(),
                    required: true,
                },
            ],
            context: HandoffContext {
                task_id: task_id.into(),
                task_description: task_description.into(),
                timestamp: chrono::Utc::now(),
                metadata: HashMap::new(),
            },
        }
    }

    /// Create a standard handoff from Security to Deployer
    pub fn security_to_deployer(
        task_id: impl Into<String>,
        task_description: impl Into<String>,
        security_report_path: PathBuf,
    ) -> Handoff {
        Handoff {
            from_role: AlmasRole::Security,
            to_role: AlmasRole::Deployer,
            artifacts: vec![HandoffArtifact {
                name: "Security Report".to_string(),
                path: security_report_path,
                artifact_type: ArtifactType::SecurityReport,
                required: true,
                metadata: HashMap::new(),
            }],
            validation_rules: vec![ValidationRule {
                rule_type: ValidationRuleType::SecurityScanClean,
                description: "Security scan shows no critical vulnerabilities".to_string(),
                required: true,
            }],
            context: HandoffContext {
                task_id: task_id.into(),
                task_description: task_description.into(),
                timestamp: chrono::Utc::now(),
                metadata: HashMap::new(),
            },
        }
    }

    /// Create a failure handoff (back to Developer for fixes)
    pub fn failure_handoff(
        from_role: AlmasRole,
        task_id: impl Into<String>,
        task_description: impl Into<String>,
        failure_reason: impl Into<String>,
    ) -> Handoff {
        let mut metadata = HashMap::new();
        metadata.insert("failure_reason".to_string(), failure_reason.into());

        Handoff {
            from_role,
            to_role: AlmasRole::Developer,
            artifacts: Vec::new(),
            validation_rules: Vec::new(),
            context: HandoffContext {
                task_id: task_id.into(),
                task_description: task_description.into(),
                timestamp: chrono::Utc::now(),
                metadata,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_handoff_manager_creation() {
        let manager = HandoffManager::new(AlmasRole::Architect);
        assert_eq!(manager.current_role(), AlmasRole::Architect);
        assert_eq!(manager.handoff_history().len(), 0);
    }

    #[test]
    fn test_valid_transitions() {
        let manager = HandoffManager::new(AlmasRole::Architect);

        assert!(manager.is_valid_transition(AlmasRole::Architect, AlmasRole::Developer));
        assert!(manager.is_valid_transition(AlmasRole::Developer, AlmasRole::Qa));
        assert!(manager.is_valid_transition(AlmasRole::Qa, AlmasRole::Security));
        assert!(manager.is_valid_transition(AlmasRole::Security, AlmasRole::Deployer));

        // Test invalid transitions
        assert!(!manager.is_valid_transition(AlmasRole::Architect, AlmasRole::Qa));
        assert!(!manager.is_valid_transition(AlmasRole::Deployer, AlmasRole::Architect));
    }

    #[test]
    fn test_architect_to_developer_handoff() {
        let temp_dir = TempDir::new().unwrap();
        let plan_path = temp_dir.path().join("PLAN.md");
        fs::write(&plan_path, "# Architecture Plan").unwrap();

        let mut manager = HandoffManager::new(AlmasRole::Architect);
        let handoff = HandoffManager::architect_to_developer("task1", "Build feature", plan_path);

        let result = manager.execute_handoff(handoff);
        assert!(result.is_ok());

        let validation = result.unwrap();
        assert!(validation.valid);
        assert_eq!(manager.current_role(), AlmasRole::Developer);
        assert_eq!(manager.handoff_history().len(), 1);
    }

    #[test]
    fn test_developer_to_qa_handoff() {
        let temp_dir = TempDir::new().unwrap();
        let code_path = temp_dir.path().join("main.rs");
        fs::write(&code_path, "fn main() {}").unwrap();

        let mut manager = HandoffManager::new(AlmasRole::Developer);
        let handoff =
            HandoffManager::developer_to_qa("task1", "Test feature", vec![code_path]);

        let result = manager.execute_handoff(handoff);
        assert!(result.is_ok());

        let validation = result.unwrap();
        assert!(validation.valid);
        assert_eq!(manager.current_role(), AlmasRole::Qa);
    }

    #[test]
    fn test_missing_artifact_fails_validation() {
        let non_existent_path = PathBuf::from("/tmp/does_not_exist.md");

        let mut manager = HandoffManager::new(AlmasRole::Architect);
        let handoff = HandoffManager::architect_to_developer(
            "task1",
            "Build feature",
            non_existent_path,
        );

        let result = manager.execute_handoff(handoff);
        assert!(result.is_err());

        // Role should not change on failed handoff
        assert_eq!(manager.current_role(), AlmasRole::Architect);
        assert_eq!(manager.handoff_history().len(), 0);
    }

    #[test]
    fn test_invalid_transition_fails() {
        let temp_dir = TempDir::new().unwrap();
        let plan_path = temp_dir.path().join("PLAN.md");
        fs::write(&plan_path, "# Plan").unwrap();

        let mut manager = HandoffManager::new(AlmasRole::Architect);

        // Try to skip Developer and go directly to QA
        let invalid_handoff = Handoff {
            from_role: AlmasRole::Architect,
            to_role: AlmasRole::Qa,
            artifacts: vec![HandoffArtifact {
                name: "Plan".to_string(),
                path: plan_path,
                artifact_type: ArtifactType::Plan,
                required: true,
                metadata: HashMap::new(),
            }],
            validation_rules: Vec::new(),
            context: HandoffContext {
                task_id: "task1".to_string(),
                task_description: "Invalid transition".to_string(),
                timestamp: chrono::Utc::now(),
                metadata: HashMap::new(),
            },
        };

        let result = manager.execute_handoff(invalid_handoff);
        assert!(result.is_err());
    }

    #[test]
    fn test_failure_handoff() {
        let mut manager = HandoffManager::new(AlmasRole::Qa);

        let handoff = HandoffManager::failure_handoff(
            AlmasRole::Qa,
            "task1",
            "Feature implementation",
            "Tests failed: 3 assertions",
        );

        let result = manager.execute_handoff(handoff);
        assert!(result.is_ok());

        assert_eq!(manager.current_role(), AlmasRole::Developer);
        assert_eq!(manager.handoff_history().len(), 1);

        let last_handoff = &manager.handoff_history()[0];
        assert_eq!(
            last_handoff.context.metadata.get("failure_reason").unwrap(),
            "Tests failed: 3 assertions"
        );
    }

    #[test]
    fn test_handoff_validation_result_structure() {
        let temp_dir = TempDir::new().unwrap();
        let plan_path = temp_dir.path().join("PLAN.md");
        fs::write(&plan_path, "# Plan").unwrap();

        let manager = HandoffManager::new(AlmasRole::Architect);
        let handoff = HandoffManager::architect_to_developer("task1", "Build", plan_path);

        let result = manager.validate_handoff(&handoff).unwrap();

        assert!(result.valid);
        assert_eq!(result.from_role, AlmasRole::Architect);
        assert_eq!(result.to_role, AlmasRole::Developer);
        assert!(result.passed_rules.len() > 0);
        assert_eq!(result.failed_rules.len(), 0);
        assert_eq!(result.artifacts_transferred, 1);
    }
}
