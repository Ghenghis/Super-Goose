//! Specialist Role Definitions
//!
//! Defines the 6 specialist roles (Code, Test, Review, Deploy, Security, Docs)
//! with curated system prompts and tool filters for each role.
//!
//! These roles are used by the OrchestratorCore and SwarmCore to assign
//! sub-tasks to the right specialist agent. Each role carries:
//!
//! - A curated system prompt that focuses the LLM on the role's domain
//! - A tool filter that restricts which MCP tools the specialist can use
//! - Metadata about the role's strengths and typical task patterns

use serde::{Deserialize, Serialize};

/// The 6 specialist roles available in the multi-agent system.
///
/// Each role maps to a domain of software development expertise.
/// The `Review` role is distinct from `Security` — Review focuses on
/// code quality, architecture, and best practices, while Security
/// focuses on vulnerability detection and compliance.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SpecialistRole {
    /// Code generation, architecture, and implementation
    Code,
    /// Testing, quality assurance, and coverage
    Test,
    /// Code review, architecture review, best practices
    Review,
    /// Deployment, CI/CD, infrastructure
    Deploy,
    /// Security analysis, vulnerability detection, compliance
    Security,
    /// Documentation, README, API docs, inline comments
    Docs,
}

impl SpecialistRole {
    /// All available specialist roles.
    pub fn all() -> &'static [SpecialistRole] {
        &[
            SpecialistRole::Code,
            SpecialistRole::Test,
            SpecialistRole::Review,
            SpecialistRole::Deploy,
            SpecialistRole::Security,
            SpecialistRole::Docs,
        ]
    }

    /// Human-readable name for display.
    pub fn display_name(&self) -> &'static str {
        match self {
            SpecialistRole::Code => "Code Specialist",
            SpecialistRole::Test => "Test Specialist",
            SpecialistRole::Review => "Review Specialist",
            SpecialistRole::Deploy => "Deploy Specialist",
            SpecialistRole::Security => "Security Specialist",
            SpecialistRole::Docs => "Documentation Specialist",
        }
    }

    /// Short identifier string.
    pub fn as_str(&self) -> &'static str {
        match self {
            SpecialistRole::Code => "code",
            SpecialistRole::Test => "test",
            SpecialistRole::Review => "review",
            SpecialistRole::Deploy => "deploy",
            SpecialistRole::Security => "security",
            SpecialistRole::Docs => "docs",
        }
    }

    /// Map this role to the orchestrator's AgentRole.
    ///
    /// The `Review` specialist maps to `AgentRole::Code` since the
    /// orchestrator doesn't have a dedicated review role — review
    /// tasks are handled by the AdversarialCore or by a Code agent
    /// with a review-focused system prompt.
    pub fn to_agent_role(&self) -> crate::agents::orchestrator::AgentRole {
        use crate::agents::orchestrator::AgentRole;
        match self {
            SpecialistRole::Code => AgentRole::Code,
            SpecialistRole::Test => AgentRole::Test,
            SpecialistRole::Review => AgentRole::Code, // Review uses code agent with review prompt
            SpecialistRole::Deploy => AgentRole::Deploy,
            SpecialistRole::Security => AgentRole::Security,
            SpecialistRole::Docs => AgentRole::Docs,
        }
    }
}

impl std::fmt::Display for SpecialistRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for SpecialistRole {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "code" | "coder" | "implement" | "dev" => Ok(SpecialistRole::Code),
            "test" | "tester" | "qa" | "testing" => Ok(SpecialistRole::Test),
            "review" | "reviewer" | "cr" | "code-review" => Ok(SpecialistRole::Review),
            "deploy" | "deployer" | "ops" | "devops" | "infra" => Ok(SpecialistRole::Deploy),
            "security" | "sec" | "audit" | "auditor" => Ok(SpecialistRole::Security),
            "docs" | "doc" | "documentation" | "writer" => Ok(SpecialistRole::Docs),
            _ => Err(format!(
                "Unknown specialist role: '{}'. Available: code, test, review, deploy, security, docs",
                s
            )),
        }
    }
}

/// Configuration for a specialist role.
///
/// Carries the system prompt, tool filter patterns, and metadata
/// that configure a specialist agent for its domain.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoleConfig {
    /// Which specialist role this configures
    pub role: SpecialistRole,
    /// System prompt that focuses the LLM on this role's domain.
    /// This is prepended to the base system prompt when the specialist is active.
    pub system_prompt: String,
    /// Glob patterns for MCP tools this specialist should have access to.
    /// Empty means "all tools" (no filtering).
    /// Example: `["developer__*", "shell"]` for code specialist.
    pub tools_filter: Vec<String>,
    /// Keywords that indicate a task belongs to this specialist.
    /// Used by the decomposer to assign tasks to the right role.
    pub task_keywords: Vec<String>,
    /// Maximum turns this specialist should take before reporting back.
    pub max_turns: u32,
    /// Whether this specialist can spawn sub-tasks to other specialists.
    pub can_delegate: bool,
}

impl RoleConfig {
    /// Create a new RoleConfig with the given role and system prompt.
    pub fn new(role: SpecialistRole, system_prompt: impl Into<String>) -> Self {
        Self {
            role,
            system_prompt: system_prompt.into(),
            tools_filter: Vec::new(),
            task_keywords: Vec::new(),
            max_turns: 20,
            can_delegate: false,
        }
    }

    /// Set the tool filter patterns.
    pub fn with_tools_filter(mut self, filters: Vec<String>) -> Self {
        self.tools_filter = filters;
        self
    }

    /// Set the task keywords.
    pub fn with_keywords(mut self, keywords: Vec<String>) -> Self {
        self.task_keywords = keywords;
        self
    }

    /// Set the maximum turns.
    pub fn with_max_turns(mut self, max: u32) -> Self {
        self.max_turns = max;
        self
    }

    /// Allow this specialist to delegate sub-tasks.
    pub fn with_delegation(mut self) -> Self {
        self.can_delegate = true;
        self
    }
}

/// Returns the default configuration for all 6 specialist roles.
///
/// Each role gets a curated system prompt that focuses the LLM on the
/// role's domain, plus tool filters and task keywords for routing.
pub fn default_specialists() -> Vec<RoleConfig> {
    vec![
        // ── Code Specialist ─────────────────────────────────────────
        RoleConfig::new(
            SpecialistRole::Code,
            "You are a Code Specialist agent focused on software implementation and architecture.\n\
             \n\
             Your responsibilities:\n\
             - Write clean, idiomatic, well-structured code\n\
             - Follow established patterns and conventions in the codebase\n\
             - Design modular architectures with clear separation of concerns\n\
             - Handle error cases gracefully with proper error types\n\
             - Write code that is testable and maintainable\n\
             - Use appropriate design patterns (factory, observer, strategy, etc.)\n\
             - Optimize for readability first, performance second\n\
             \n\
             Guidelines:\n\
             - Always read existing code before writing new code\n\
             - Match the project's style (naming, formatting, patterns)\n\
             - Prefer composition over inheritance\n\
             - Keep functions small and focused (single responsibility)\n\
             - Add TODO comments for known limitations\n\
             - Never introduce breaking changes without flagging them",
        )
        .with_tools_filter(vec![
            "developer__*".to_string(),
            "shell".to_string(),
            "read_file".to_string(),
            "write_file".to_string(),
            "list_directory".to_string(),
            "search".to_string(),
        ])
        .with_keywords(vec![
            "implement".to_string(),
            "create".to_string(),
            "build".to_string(),
            "write".to_string(),
            "add".to_string(),
            "fix".to_string(),
            "refactor".to_string(),
            "update".to_string(),
            "modify".to_string(),
            "change".to_string(),
            "code".to_string(),
            "function".to_string(),
            "class".to_string(),
            "module".to_string(),
            "struct".to_string(),
        ])
        .with_max_turns(30),

        // ── Test Specialist ─────────────────────────────────────────
        RoleConfig::new(
            SpecialistRole::Test,
            "You are a Test Specialist agent focused on quality assurance and testing.\n\
             \n\
             Your responsibilities:\n\
             - Write comprehensive unit tests with good coverage\n\
             - Write integration tests for cross-module interactions\n\
             - Write edge-case and error-path tests\n\
             - Validate that existing tests pass after changes\n\
             - Suggest test improvements and missing test cases\n\
             - Use appropriate test frameworks for the language\n\
             \n\
             Guidelines:\n\
             - Follow the Arrange-Act-Assert pattern\n\
             - Test behavior, not implementation details\n\
             - Use descriptive test names that explain the scenario\n\
             - Mock external dependencies, not internal ones\n\
             - Aim for >80% line coverage on new code\n\
             - Include both happy-path and failure-path tests\n\
             - Test boundary conditions and edge cases\n\
             - Keep tests independent — no shared mutable state",
        )
        .with_tools_filter(vec![
            "developer__*".to_string(),
            "shell".to_string(),
            "read_file".to_string(),
            "write_file".to_string(),
            "list_directory".to_string(),
            "search".to_string(),
        ])
        .with_keywords(vec![
            "test".to_string(),
            "spec".to_string(),
            "coverage".to_string(),
            "verify".to_string(),
            "assert".to_string(),
            "mock".to_string(),
            "fixture".to_string(),
            "unit".to_string(),
            "integration".to_string(),
            "e2e".to_string(),
        ])
        .with_max_turns(25),

        // ── Review Specialist ───────────────────────────────────────
        RoleConfig::new(
            SpecialistRole::Review,
            "You are a Review Specialist agent focused on code quality and architecture review.\n\
             \n\
             Your responsibilities:\n\
             - Review code for correctness, readability, and maintainability\n\
             - Identify potential bugs, race conditions, and logic errors\n\
             - Check adherence to project coding standards and patterns\n\
             - Evaluate architecture decisions and suggest improvements\n\
             - Verify error handling completeness\n\
             - Check for proper logging and observability\n\
             \n\
             Guidelines:\n\
             - Be constructive — suggest fixes, not just problems\n\
             - Prioritize issues by severity (critical > major > minor > style)\n\
             - Check for SOLID principles violations\n\
             - Verify documentation matches implementation\n\
             - Look for performance anti-patterns (N+1 queries, unnecessary clones)\n\
             - Check for proper resource cleanup (file handles, connections)\n\
             - Flag any hardcoded values that should be configurable\n\
             - Verify backward compatibility when public APIs change",
        )
        .with_tools_filter(vec![
            "read_file".to_string(),
            "list_directory".to_string(),
            "search".to_string(),
            "developer__*".to_string(),
        ])
        .with_keywords(vec![
            "review".to_string(),
            "check".to_string(),
            "audit".to_string(),
            "evaluate".to_string(),
            "quality".to_string(),
            "improve".to_string(),
            "pr".to_string(),
            "pull request".to_string(),
            "feedback".to_string(),
        ])
        .with_max_turns(15),

        // ── Deploy Specialist ───────────────────────────────────────
        RoleConfig::new(
            SpecialistRole::Deploy,
            "You are a Deploy Specialist agent focused on deployment and infrastructure.\n\
             \n\
             Your responsibilities:\n\
             - Configure CI/CD pipelines (GitHub Actions, GitLab CI, etc.)\n\
             - Write Dockerfiles and container configurations\n\
             - Set up Kubernetes manifests and Helm charts\n\
             - Configure deployment environments (staging, production)\n\
             - Manage infrastructure as code (Terraform, CloudFormation)\n\
             - Set up monitoring, logging, and alerting\n\
             \n\
             Guidelines:\n\
             - Always use multi-stage Docker builds for smaller images\n\
             - Pin dependency versions in CI/CD configurations\n\
             - Use secrets management — never hardcode credentials\n\
             - Configure health checks and readiness probes\n\
             - Set resource limits on all containers\n\
             - Include rollback procedures in deployment scripts\n\
             - Test deployments in staging before production\n\
             - Use blue-green or canary deployment strategies when possible",
        )
        .with_tools_filter(vec![
            "developer__*".to_string(),
            "shell".to_string(),
            "read_file".to_string(),
            "write_file".to_string(),
            "list_directory".to_string(),
        ])
        .with_keywords(vec![
            "deploy".to_string(),
            "release".to_string(),
            "ship".to_string(),
            "publish".to_string(),
            "ci".to_string(),
            "cd".to_string(),
            "docker".to_string(),
            "kubernetes".to_string(),
            "k8s".to_string(),
            "infrastructure".to_string(),
            "pipeline".to_string(),
            "helm".to_string(),
        ])
        .with_max_turns(20),

        // ── Security Specialist ─────────────────────────────────────
        RoleConfig::new(
            SpecialistRole::Security,
            "You are a Security Specialist agent focused on security analysis and compliance.\n\
             \n\
             Your responsibilities:\n\
             - Scan code for OWASP Top 10 vulnerabilities\n\
             - Detect CWE patterns (injection, XSS, CSRF, etc.)\n\
             - Review authentication and authorization implementations\n\
             - Check for hardcoded secrets and credentials\n\
             - Audit dependency vulnerabilities (CVEs)\n\
             - Verify encryption and hashing implementations\n\
             - Check compliance with security best practices\n\
             \n\
             Guidelines:\n\
             - Classify findings by severity: Critical, High, Medium, Low, Info\n\
             - Reference CWE IDs and OWASP categories when applicable\n\
             - Provide specific remediation steps for each finding\n\
             - Check for principle of least privilege\n\
             - Verify input validation on all user-facing endpoints\n\
             - Ensure sensitive data is encrypted at rest and in transit\n\
             - Flag any use of deprecated or weak cryptographic algorithms\n\
             - Check for proper CORS, CSP, and security header configuration",
        )
        .with_tools_filter(vec![
            "read_file".to_string(),
            "list_directory".to_string(),
            "search".to_string(),
            "shell".to_string(),
            "developer__*".to_string(),
        ])
        .with_keywords(vec![
            "security".to_string(),
            "vulnerability".to_string(),
            "audit".to_string(),
            "secure".to_string(),
            "owasp".to_string(),
            "cwe".to_string(),
            "cve".to_string(),
            "compliance".to_string(),
            "penetration".to_string(),
            "threat".to_string(),
            "risk".to_string(),
        ])
        .with_max_turns(20),

        // ── Docs Specialist ─────────────────────────────────────────
        RoleConfig::new(
            SpecialistRole::Docs,
            "You are a Documentation Specialist agent focused on technical writing.\n\
             \n\
             Your responsibilities:\n\
             - Write clear, accurate README files\n\
             - Generate API documentation from code\n\
             - Write inline code comments and doc-comments\n\
             - Create architecture decision records (ADRs)\n\
             - Write onboarding guides and tutorials\n\
             - Generate changelog entries from commits\n\
             \n\
             Guidelines:\n\
             - Write for the reader, not for yourself\n\
             - Use active voice and concrete examples\n\
             - Include code snippets that actually compile/run\n\
             - Keep documentation close to the code it describes\n\
             - Use consistent terminology throughout\n\
             - Include 'Getting Started' sections with minimal steps\n\
             - Document both the 'what' and the 'why'\n\
             - Use diagrams (Mermaid, ASCII art) for complex flows\n\
             - Keep API docs in sync with implementation",
        )
        .with_tools_filter(vec![
            "read_file".to_string(),
            "write_file".to_string(),
            "list_directory".to_string(),
            "search".to_string(),
            "developer__*".to_string(),
        ])
        .with_keywords(vec![
            "document".to_string(),
            "readme".to_string(),
            "docs".to_string(),
            "comment".to_string(),
            "explain".to_string(),
            "guide".to_string(),
            "tutorial".to_string(),
            "changelog".to_string(),
            "api doc".to_string(),
            "adr".to_string(),
        ])
        .with_max_turns(15),
    ]
}

/// Find the best specialist role for a given task description.
///
/// Scores each role's keywords against the task and returns the best match.
/// Returns `None` if no role's keywords match at all.
pub fn best_role_for_task(task: &str) -> Option<SpecialistRole> {
    let lower = task.to_lowercase();
    let configs = default_specialists();

    let mut best_role = None;
    let mut best_score = 0u32;

    for config in &configs {
        let score: u32 = config
            .task_keywords
            .iter()
            .filter(|kw| lower.contains(kw.as_str()))
            .count() as u32;

        if score > best_score {
            best_score = score;
            best_role = Some(config.role);
        }
    }

    best_role
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── SpecialistRole basics ──────────────────────────────────────

    #[test]
    fn test_specialist_role_all() {
        assert_eq!(SpecialistRole::all().len(), 6);
    }

    #[test]
    fn test_specialist_role_display() {
        assert_eq!(SpecialistRole::Code.to_string(), "code");
        assert_eq!(SpecialistRole::Test.to_string(), "test");
        assert_eq!(SpecialistRole::Review.to_string(), "review");
        assert_eq!(SpecialistRole::Deploy.to_string(), "deploy");
        assert_eq!(SpecialistRole::Security.to_string(), "security");
        assert_eq!(SpecialistRole::Docs.to_string(), "docs");
    }

    #[test]
    fn test_specialist_role_display_name() {
        assert_eq!(SpecialistRole::Code.display_name(), "Code Specialist");
        assert_eq!(SpecialistRole::Review.display_name(), "Review Specialist");
        assert_eq!(SpecialistRole::Security.display_name(), "Security Specialist");
    }

    #[test]
    fn test_specialist_role_from_str() {
        assert_eq!("code".parse::<SpecialistRole>().unwrap(), SpecialistRole::Code);
        assert_eq!("coder".parse::<SpecialistRole>().unwrap(), SpecialistRole::Code);
        assert_eq!("dev".parse::<SpecialistRole>().unwrap(), SpecialistRole::Code);

        assert_eq!("test".parse::<SpecialistRole>().unwrap(), SpecialistRole::Test);
        assert_eq!("qa".parse::<SpecialistRole>().unwrap(), SpecialistRole::Test);
        assert_eq!("tester".parse::<SpecialistRole>().unwrap(), SpecialistRole::Test);

        assert_eq!("review".parse::<SpecialistRole>().unwrap(), SpecialistRole::Review);
        assert_eq!("cr".parse::<SpecialistRole>().unwrap(), SpecialistRole::Review);
        assert_eq!("code-review".parse::<SpecialistRole>().unwrap(), SpecialistRole::Review);

        assert_eq!("deploy".parse::<SpecialistRole>().unwrap(), SpecialistRole::Deploy);
        assert_eq!("ops".parse::<SpecialistRole>().unwrap(), SpecialistRole::Deploy);
        assert_eq!("devops".parse::<SpecialistRole>().unwrap(), SpecialistRole::Deploy);
        assert_eq!("infra".parse::<SpecialistRole>().unwrap(), SpecialistRole::Deploy);

        assert_eq!("security".parse::<SpecialistRole>().unwrap(), SpecialistRole::Security);
        assert_eq!("sec".parse::<SpecialistRole>().unwrap(), SpecialistRole::Security);
        assert_eq!("auditor".parse::<SpecialistRole>().unwrap(), SpecialistRole::Security);

        assert_eq!("docs".parse::<SpecialistRole>().unwrap(), SpecialistRole::Docs);
        assert_eq!("doc".parse::<SpecialistRole>().unwrap(), SpecialistRole::Docs);
        assert_eq!("documentation".parse::<SpecialistRole>().unwrap(), SpecialistRole::Docs);
        assert_eq!("writer".parse::<SpecialistRole>().unwrap(), SpecialistRole::Docs);
    }

    #[test]
    fn test_specialist_role_from_str_invalid() {
        assert!("unknown".parse::<SpecialistRole>().is_err());
        assert!("".parse::<SpecialistRole>().is_err());
        assert!("foobar".parse::<SpecialistRole>().is_err());
    }

    #[test]
    fn test_specialist_role_to_agent_role() {
        use crate::agents::orchestrator::AgentRole;

        assert_eq!(SpecialistRole::Code.to_agent_role(), AgentRole::Code);
        assert_eq!(SpecialistRole::Test.to_agent_role(), AgentRole::Test);
        assert_eq!(SpecialistRole::Review.to_agent_role(), AgentRole::Code); // Review maps to Code
        assert_eq!(SpecialistRole::Deploy.to_agent_role(), AgentRole::Deploy);
        assert_eq!(SpecialistRole::Security.to_agent_role(), AgentRole::Security);
        assert_eq!(SpecialistRole::Docs.to_agent_role(), AgentRole::Docs);
    }

    // ── RoleConfig ─────────────────────────────────────────────────

    #[test]
    fn test_role_config_builder() {
        let config = RoleConfig::new(SpecialistRole::Code, "Test prompt")
            .with_tools_filter(vec!["shell".to_string()])
            .with_keywords(vec!["implement".to_string()])
            .with_max_turns(50)
            .with_delegation();

        assert_eq!(config.role, SpecialistRole::Code);
        assert_eq!(config.system_prompt, "Test prompt");
        assert_eq!(config.tools_filter, vec!["shell"]);
        assert_eq!(config.task_keywords, vec!["implement"]);
        assert_eq!(config.max_turns, 50);
        assert!(config.can_delegate);
    }

    // ── default_specialists ────────────────────────────────────────

    #[test]
    fn test_default_specialists_returns_6() {
        let specialists = default_specialists();
        assert_eq!(specialists.len(), 6);
    }

    #[test]
    fn test_default_specialists_all_roles_present() {
        let specialists = default_specialists();
        let roles: Vec<SpecialistRole> = specialists.iter().map(|s| s.role).collect();

        assert!(roles.contains(&SpecialistRole::Code));
        assert!(roles.contains(&SpecialistRole::Test));
        assert!(roles.contains(&SpecialistRole::Review));
        assert!(roles.contains(&SpecialistRole::Deploy));
        assert!(roles.contains(&SpecialistRole::Security));
        assert!(roles.contains(&SpecialistRole::Docs));
    }

    #[test]
    fn test_default_specialists_have_system_prompts() {
        let specialists = default_specialists();
        for config in &specialists {
            assert!(
                !config.system_prompt.is_empty(),
                "{} has empty system prompt",
                config.role
            );
            assert!(
                config.system_prompt.len() > 100,
                "{} has very short system prompt ({})",
                config.role,
                config.system_prompt.len()
            );
        }
    }

    #[test]
    fn test_default_specialists_have_keywords() {
        let specialists = default_specialists();
        for config in &specialists {
            assert!(
                !config.task_keywords.is_empty(),
                "{} has no task keywords",
                config.role
            );
        }
    }

    #[test]
    fn test_default_specialists_have_tools_filter() {
        let specialists = default_specialists();
        for config in &specialists {
            assert!(
                !config.tools_filter.is_empty(),
                "{} has no tools filter",
                config.role
            );
        }
    }

    #[test]
    fn test_default_specialists_reasonable_max_turns() {
        let specialists = default_specialists();
        for config in &specialists {
            assert!(
                config.max_turns >= 10 && config.max_turns <= 50,
                "{} has unreasonable max_turns: {}",
                config.role,
                config.max_turns
            );
        }
    }

    // ── best_role_for_task ─────────────────────────────────────────

    #[test]
    fn test_best_role_code_task() {
        assert_eq!(
            best_role_for_task("implement a new authentication module"),
            Some(SpecialistRole::Code)
        );
    }

    #[test]
    fn test_best_role_test_task() {
        assert_eq!(
            best_role_for_task("write unit tests for the parser"),
            Some(SpecialistRole::Test)
        );
    }

    #[test]
    fn test_best_role_review_task() {
        assert_eq!(
            best_role_for_task("review the pull request for quality"),
            Some(SpecialistRole::Review)
        );
    }

    #[test]
    fn test_best_role_deploy_task() {
        assert_eq!(
            best_role_for_task("deploy the service to kubernetes"),
            Some(SpecialistRole::Deploy)
        );
    }

    #[test]
    fn test_best_role_security_task() {
        assert_eq!(
            best_role_for_task("scan for security vulnerabilities and CVE issues"),
            Some(SpecialistRole::Security)
        );
    }

    #[test]
    fn test_best_role_docs_task() {
        assert_eq!(
            best_role_for_task("write documentation and a readme for the API"),
            Some(SpecialistRole::Docs)
        );
    }

    #[test]
    fn test_best_role_no_match() {
        assert_eq!(
            best_role_for_task("hello world"),
            None
        );
    }

    // ── Serialization ──────────────────────────────────────────────

    #[test]
    fn test_specialist_role_serde_roundtrip() {
        let role = SpecialistRole::Security;
        let json = serde_json::to_string(&role).unwrap();
        assert_eq!(json, "\"security\"");

        let deserialized: SpecialistRole = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, SpecialistRole::Security);
    }

    #[test]
    fn test_role_config_serde_roundtrip() {
        let config = RoleConfig::new(SpecialistRole::Test, "Test prompt")
            .with_tools_filter(vec!["shell".to_string()])
            .with_keywords(vec!["test".to_string()])
            .with_max_turns(25);

        let json = serde_json::to_string(&config).unwrap();
        let deserialized: RoleConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.role, SpecialistRole::Test);
        assert_eq!(deserialized.system_prompt, "Test prompt");
        assert_eq!(deserialized.tools_filter, vec!["shell"]);
        assert_eq!(deserialized.task_keywords, vec!["test"]);
        assert_eq!(deserialized.max_turns, 25);
        assert!(!deserialized.can_delegate);
    }
}
