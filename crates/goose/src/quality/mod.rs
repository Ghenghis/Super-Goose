// Quality enforcement module for Goose
// Ensures code quality through SonarQube integration and validation

pub mod sonarqube;
pub mod validator;
pub mod advanced_validator;
pub mod comprehensive_validator;
pub mod multipass_validator;
pub mod logger;

pub use sonarqube::{SonarQubeConfig, QualityGateStatus};
pub use validator::{PostCodeValidator, ValidationReport, CheckResult};
pub use advanced_validator::{AdvancedValidator, ValidationResult, ValidationIssue, Severity};
pub use comprehensive_validator::{ComprehensiveValidator, ComprehensiveReport};
pub use multipass_validator::{MultiPassValidator, ValidationSnapshot, FinalReport};
pub use logger::{ValidationLogger, IssueDetail, Severity as LogSeverity};
