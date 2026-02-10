//! Phase 7: Skill Registry — Composable, Discoverable Skill System
//!
//! Extends the existing skills_extension with composability, versioning,
//! dependency resolution, and a discovery API. Skills can invoke other skills,
//! declare input/output schemas, and be searched by category or capability.
//!
//! # Architecture
//!
//! - **SkillMetadata** — rich metadata for a skill (version, tags, inputs, outputs)
//! - **SkillRegistry** — central registry for all available skills
//! - **SkillDependency** — declares dependencies between skills
//! - **SkillComposer** — chains skills together into pipelines
//! - **SkillSearchQuery** — flexible search/discovery interface

use std::collections::HashMap;
use std::fmt;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Skill Metadata
// ---------------------------------------------------------------------------

/// Rich metadata for a registered skill.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillMetadata {
    /// Unique skill name (e.g., "code-review", "test-runner")
    pub name: String,
    /// Human-readable description
    pub description: String,
    /// Semantic version
    pub version: String,
    /// Author or source
    pub author: String,
    /// Category tags for discovery
    #[serde(default)]
    pub tags: Vec<String>,
    /// Category classification
    pub category: SkillCategory,
    /// Input parameters this skill accepts
    #[serde(default)]
    pub inputs: Vec<SkillParam>,
    /// Outputs this skill produces
    #[serde(default)]
    pub outputs: Vec<SkillParam>,
    /// Skills this depends on
    #[serde(default)]
    pub dependencies: Vec<SkillDependency>,
    /// Whether this is a builtin skill
    #[serde(default)]
    pub builtin: bool,
    /// Source location (file path or "builtin")
    pub source: String,
}

/// Skill categories for classification and discovery.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SkillCategory {
    Coding,
    Testing,
    DevOps,
    Documentation,
    Security,
    DataAnalysis,
    Communication,
    Workflow,
    Utility,
    Custom,
}

impl fmt::Display for SkillCategory {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SkillCategory::Coding => write!(f, "coding"),
            SkillCategory::Testing => write!(f, "testing"),
            SkillCategory::DevOps => write!(f, "devops"),
            SkillCategory::Documentation => write!(f, "documentation"),
            SkillCategory::Security => write!(f, "security"),
            SkillCategory::DataAnalysis => write!(f, "data_analysis"),
            SkillCategory::Communication => write!(f, "communication"),
            SkillCategory::Workflow => write!(f, "workflow"),
            SkillCategory::Utility => write!(f, "utility"),
            SkillCategory::Custom => write!(f, "custom"),
        }
    }
}

/// Input/output parameter definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillParam {
    pub name: String,
    pub description: String,
    pub param_type: ParamType,
    pub required: bool,
    pub default_value: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParamType {
    String,
    Number,
    Boolean,
    FilePath,
    Json,
    List,
}

/// Dependency on another skill.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillDependency {
    /// Name of the required skill
    pub skill_name: String,
    /// Version constraint (e.g., ">=1.0.0", "^2.0")
    pub version_constraint: Option<String>,
    /// Whether this dependency is optional
    pub optional: bool,
}

// ---------------------------------------------------------------------------
// Skill Registry
// ---------------------------------------------------------------------------

/// Central registry for all available skills with discovery capabilities.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillRegistry {
    skills: HashMap<String, RegisteredSkill>,
}

/// A skill entry in the registry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisteredSkill {
    pub metadata: SkillMetadata,
    /// The skill body/instructions content
    pub body: String,
    /// Usage count for popularity tracking
    pub usage_count: u64,
}

impl SkillRegistry {
    pub fn new() -> Self {
        Self {
            skills: HashMap::new(),
        }
    }

    /// Register a skill.
    pub fn register(&mut self, metadata: SkillMetadata, body: String) {
        let name = metadata.name.clone();
        self.skills.insert(name, RegisteredSkill {
            metadata,
            body,
            usage_count: 0,
        });
    }

    /// Unregister a skill by name.
    pub fn unregister(&mut self, name: &str) -> Option<RegisteredSkill> {
        self.skills.remove(name)
    }

    /// Get a skill by name.
    pub fn get(&self, name: &str) -> Option<&RegisteredSkill> {
        self.skills.get(name)
    }

    /// Check if a skill exists.
    pub fn contains(&self, name: &str) -> bool {
        self.skills.contains_key(name)
    }

    /// Total number of registered skills.
    pub fn count(&self) -> usize {
        self.skills.len()
    }

    /// List all skill names.
    pub fn list_names(&self) -> Vec<&str> {
        self.skills.keys().map(|s| s.as_str()).collect()
    }

    /// List all skills with metadata.
    pub fn list_all(&self) -> Vec<&RegisteredSkill> {
        self.skills.values().collect()
    }

    /// Search skills by query.
    pub fn search(&self, query: &SkillSearchQuery) -> Vec<&RegisteredSkill> {
        self.skills
            .values()
            .filter(|skill| query.matches(&skill.metadata))
            .collect()
    }

    /// Get skills by category.
    pub fn by_category(&self, category: SkillCategory) -> Vec<&RegisteredSkill> {
        self.skills
            .values()
            .filter(|s| s.metadata.category == category)
            .collect()
    }

    /// Get skills by tag.
    pub fn by_tag(&self, tag: &str) -> Vec<&RegisteredSkill> {
        self.skills
            .values()
            .filter(|s| s.metadata.tags.iter().any(|t| t == tag))
            .collect()
    }

    /// Increment usage count for a skill.
    pub fn record_usage(&mut self, name: &str) {
        if let Some(skill) = self.skills.get_mut(name) {
            skill.usage_count += 1;
        }
    }

    /// Get most popular skills (by usage).
    pub fn most_popular(&self, limit: usize) -> Vec<&RegisteredSkill> {
        let mut sorted: Vec<_> = self.skills.values().collect();
        sorted.sort_by(|a, b| b.usage_count.cmp(&a.usage_count));
        sorted.truncate(limit);
        sorted
    }

    /// Resolve dependencies for a skill — returns ordered list of skills needed.
    pub fn resolve_dependencies(&self, skill_name: &str) -> Result<Vec<String>, DependencyError> {
        let mut resolved = Vec::new();
        let mut visited = std::collections::HashSet::new();
        let mut in_stack = std::collections::HashSet::new();

        self.resolve_deps_recursive(skill_name, &mut resolved, &mut visited, &mut in_stack)?;
        Ok(resolved)
    }

    fn resolve_deps_recursive(
        &self,
        name: &str,
        resolved: &mut Vec<String>,
        visited: &mut std::collections::HashSet<String>,
        in_stack: &mut std::collections::HashSet<String>,
    ) -> Result<(), DependencyError> {
        if in_stack.contains(name) {
            return Err(DependencyError::CircularDependency(name.to_string()));
        }
        if visited.contains(name) {
            return Ok(());
        }

        let skill = self.skills.get(name).ok_or_else(|| {
            DependencyError::NotFound(name.to_string())
        })?;

        in_stack.insert(name.to_string());

        for dep in &skill.metadata.dependencies {
            if !dep.optional || self.contains(&dep.skill_name) {
                self.resolve_deps_recursive(&dep.skill_name, resolved, visited, in_stack)?;
            }
        }

        in_stack.remove(name);
        visited.insert(name.to_string());
        resolved.push(name.to_string());

        Ok(())
    }

    /// Create a registry with some builtin skills.
    pub fn with_builtins() -> Self {
        let mut registry = Self::new();

        registry.register(
            SkillMetadata {
                name: "code-review".into(),
                description: "Review code for bugs, style issues, and best practices".into(),
                version: "1.0.0".into(),
                author: "goose".into(),
                tags: vec!["coding".into(), "review".into(), "quality".into()],
                category: SkillCategory::Coding,
                inputs: vec![SkillParam {
                    name: "file_path".into(),
                    description: "Path to the file to review".into(),
                    param_type: ParamType::FilePath,
                    required: true,
                    default_value: None,
                }],
                outputs: vec![SkillParam {
                    name: "review".into(),
                    description: "Review findings and suggestions".into(),
                    param_type: ParamType::String,
                    required: true,
                    default_value: None,
                }],
                dependencies: vec![],
                builtin: true,
                source: "builtin".into(),
            },
            "Review the provided code file for:\n- Bugs and logic errors\n- Style and formatting issues\n- Security vulnerabilities\n- Performance concerns\n- Best practice violations".into(),
        );

        registry.register(
            SkillMetadata {
                name: "test-generator".into(),
                description: "Generate unit tests for code".into(),
                version: "1.0.0".into(),
                author: "goose".into(),
                tags: vec!["testing".into(), "coding".into(), "automation".into()],
                category: SkillCategory::Testing,
                inputs: vec![SkillParam {
                    name: "source_file".into(),
                    description: "Path to the source file to test".into(),
                    param_type: ParamType::FilePath,
                    required: true,
                    default_value: None,
                }],
                outputs: vec![SkillParam {
                    name: "test_file".into(),
                    description: "Generated test file path".into(),
                    param_type: ParamType::FilePath,
                    required: true,
                    default_value: None,
                }],
                dependencies: vec![],
                builtin: true,
                source: "builtin".into(),
            },
            "Generate comprehensive unit tests for the source file:\n- Cover all public functions\n- Include edge cases\n- Test error handling\n- Use the project's test framework".into(),
        );

        registry.register(
            SkillMetadata {
                name: "docs-generator".into(),
                description: "Generate documentation from code".into(),
                version: "1.0.0".into(),
                author: "goose".into(),
                tags: vec!["documentation".into(), "coding".into()],
                category: SkillCategory::Documentation,
                inputs: vec![SkillParam {
                    name: "source_path".into(),
                    description: "Path to source code".into(),
                    param_type: ParamType::FilePath,
                    required: true,
                    default_value: None,
                }],
                outputs: vec![SkillParam {
                    name: "docs".into(),
                    description: "Generated documentation".into(),
                    param_type: ParamType::String,
                    required: true,
                    default_value: None,
                }],
                dependencies: vec![],
                builtin: true,
                source: "builtin".into(),
            },
            "Generate clear, comprehensive documentation:\n- Module overview\n- Public API documentation\n- Usage examples\n- Architecture notes".into(),
        );

        registry.register(
            SkillMetadata {
                name: "security-audit".into(),
                description: "Audit code for security vulnerabilities".into(),
                version: "1.0.0".into(),
                author: "goose".into(),
                tags: vec!["security".into(), "audit".into(), "vulnerability".into()],
                category: SkillCategory::Security,
                inputs: vec![SkillParam {
                    name: "target".into(),
                    description: "File or directory to audit".into(),
                    param_type: ParamType::FilePath,
                    required: true,
                    default_value: None,
                }],
                outputs: vec![SkillParam {
                    name: "findings".into(),
                    description: "Security findings report".into(),
                    param_type: ParamType::String,
                    required: true,
                    default_value: None,
                }],
                dependencies: vec![SkillDependency {
                    skill_name: "code-review".into(),
                    version_constraint: Some(">=1.0.0".into()),
                    optional: false,
                }],
                builtin: true,
                source: "builtin".into(),
            },
            "Perform a thorough security audit:\n- OWASP Top 10 checks\n- Dependency vulnerability scan\n- Secret/credential detection\n- Input validation review\n- Authentication/authorization check".into(),
        );

        registry
    }
}

impl Default for SkillRegistry {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Skill Search
// ---------------------------------------------------------------------------

/// Flexible query for skill discovery.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SkillSearchQuery {
    /// Text to search in name and description
    pub text: Option<String>,
    /// Filter by category
    pub category: Option<SkillCategory>,
    /// Filter by tags (any match)
    pub tags: Vec<String>,
    /// Only return builtin skills
    pub builtin_only: bool,
    /// Filter by required input parameter types
    pub requires_input: Option<ParamType>,
    /// Filter by output parameter types
    pub produces_output: Option<ParamType>,
}

impl SkillSearchQuery {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_text(mut self, text: impl Into<String>) -> Self {
        self.text = Some(text.into());
        self
    }

    pub fn with_category(mut self, category: SkillCategory) -> Self {
        self.category = Some(category);
        self
    }

    pub fn with_tag(mut self, tag: impl Into<String>) -> Self {
        self.tags.push(tag.into());
        self
    }

    pub fn builtin_only(mut self) -> Self {
        self.builtin_only = true;
        self
    }

    /// Check if a skill matches this query.
    pub fn matches(&self, metadata: &SkillMetadata) -> bool {
        // Text search in name and description
        if let Some(text) = &self.text {
            let lower = text.to_lowercase();
            if !metadata.name.to_lowercase().contains(&lower)
                && !metadata.description.to_lowercase().contains(&lower)
            {
                return false;
            }
        }

        // Category filter
        if let Some(category) = &self.category {
            if metadata.category != *category {
                return false;
            }
        }

        // Tag filter (any match)
        if !self.tags.is_empty() {
            let has_matching_tag = self
                .tags
                .iter()
                .any(|t| metadata.tags.iter().any(|mt| mt == t));
            if !has_matching_tag {
                return false;
            }
        }

        // Builtin filter
        if self.builtin_only && !metadata.builtin {
            return false;
        }

        // Input type filter
        if let Some(input_type) = &self.requires_input {
            let has_input = metadata.inputs.iter().any(|p| p.param_type == *input_type);
            if !has_input {
                return false;
            }
        }

        // Output type filter
        if let Some(output_type) = &self.produces_output {
            let has_output = metadata.outputs.iter().any(|p| p.param_type == *output_type);
            if !has_output {
                return false;
            }
        }

        true
    }
}

// ---------------------------------------------------------------------------
// Skill Composer (Pipeline)
// ---------------------------------------------------------------------------

/// Chains multiple skills together into a pipeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillPipeline {
    pub name: String,
    pub description: String,
    pub steps: Vec<PipelineStep>,
}

/// A step in a skill pipeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineStep {
    /// Skill to invoke
    pub skill_name: String,
    /// Parameter mappings (pipeline context key → skill input name)
    pub input_mapping: HashMap<String, String>,
    /// Output mappings (skill output name → pipeline context key)
    pub output_mapping: HashMap<String, String>,
    /// Condition for executing this step (optional)
    pub condition: Option<String>,
    /// Continue pipeline on step failure?
    pub continue_on_error: bool,
}

impl SkillPipeline {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            description: String::new(),
            steps: Vec::new(),
        }
    }

    pub fn with_description(mut self, desc: impl Into<String>) -> Self {
        self.description = desc.into();
        self
    }

    pub fn add_step(&mut self, step: PipelineStep) {
        self.steps.push(step);
    }

    pub fn step_count(&self) -> usize {
        self.steps.len()
    }

    /// Get all skill names used in this pipeline.
    pub fn skill_names(&self) -> Vec<&str> {
        self.steps.iter().map(|s| s.skill_name.as_str()).collect()
    }

    /// Validate that all referenced skills exist in the registry.
    pub fn validate(&self, registry: &SkillRegistry) -> Vec<PipelineValidationError> {
        let mut errors = Vec::new();

        for (i, step) in self.steps.iter().enumerate() {
            if !registry.contains(&step.skill_name) {
                errors.push(PipelineValidationError::SkillNotFound {
                    step: i,
                    skill_name: step.skill_name.clone(),
                });
            }
        }

        if self.steps.is_empty() {
            errors.push(PipelineValidationError::EmptyPipeline);
        }

        errors
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PipelineValidationError {
    SkillNotFound { step: usize, skill_name: String },
    EmptyPipeline,
    InvalidMapping { step: usize, details: String },
}

impl fmt::Display for PipelineValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PipelineValidationError::SkillNotFound { step, skill_name } => {
                write!(f, "Step {}: skill '{}' not found in registry", step, skill_name)
            }
            PipelineValidationError::EmptyPipeline => write!(f, "Pipeline has no steps"),
            PipelineValidationError::InvalidMapping { step, details } => {
                write!(f, "Step {}: invalid mapping - {}", step, details)
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Dependency Resolution Errors
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DependencyError {
    NotFound(String),
    CircularDependency(String),
    VersionMismatch { skill: String, required: String, found: String },
}

impl fmt::Display for DependencyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DependencyError::NotFound(name) => write!(f, "Skill '{}' not found", name),
            DependencyError::CircularDependency(name) => {
                write!(f, "Circular dependency involving '{}'", name)
            }
            DependencyError::VersionMismatch { skill, required, found } => {
                write!(f, "Skill '{}': requires {}, found {}", skill, required, found)
            }
        }
    }
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn test_registry() -> SkillRegistry {
        SkillRegistry::with_builtins()
    }

    #[test]
    fn test_registry_creation() {
        let registry = test_registry();
        assert_eq!(registry.count(), 4);
        assert!(registry.contains("code-review"));
        assert!(registry.contains("test-generator"));
        assert!(registry.contains("docs-generator"));
        assert!(registry.contains("security-audit"));
    }

    #[test]
    fn test_register_and_get() {
        let mut registry = SkillRegistry::new();
        let meta = SkillMetadata {
            name: "my-skill".into(),
            description: "A custom skill".into(),
            version: "1.0.0".into(),
            author: "user".into(),
            tags: vec!["custom".into()],
            category: SkillCategory::Custom,
            inputs: vec![],
            outputs: vec![],
            dependencies: vec![],
            builtin: false,
            source: "/path/to/skill.md".into(),
        };
        registry.register(meta, "Do something cool".into());

        assert!(registry.contains("my-skill"));
        let skill = registry.get("my-skill").unwrap();
        assert_eq!(skill.metadata.version, "1.0.0");
        assert_eq!(skill.body, "Do something cool");
    }

    #[test]
    fn test_unregister() {
        let mut registry = test_registry();
        assert!(registry.contains("code-review"));
        registry.unregister("code-review");
        assert!(!registry.contains("code-review"));
        assert_eq!(registry.count(), 3);
    }

    #[test]
    fn test_search_by_text() {
        let registry = test_registry();
        let query = SkillSearchQuery::new().with_text("security");
        let results = registry.search(&query);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].metadata.name, "security-audit");
    }

    #[test]
    fn test_search_by_category() {
        let registry = test_registry();
        let query = SkillSearchQuery::new().with_category(SkillCategory::Coding);
        let results = registry.search(&query);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].metadata.name, "code-review");
    }

    #[test]
    fn test_search_by_tag() {
        let registry = test_registry();
        let query = SkillSearchQuery::new().with_tag("coding");
        let results = registry.search(&query);
        assert!(results.len() >= 2); // code-review and test-generator have "coding" tag
    }

    #[test]
    fn test_search_builtin_only() {
        let mut registry = test_registry();
        registry.register(
            SkillMetadata {
                name: "custom".into(),
                description: "Custom".into(),
                version: "1.0.0".into(),
                author: "user".into(),
                tags: vec![],
                category: SkillCategory::Custom,
                inputs: vec![],
                outputs: vec![],
                dependencies: vec![],
                builtin: false,
                source: "local".into(),
            },
            "Custom body".into(),
        );

        let query = SkillSearchQuery::new().builtin_only();
        let results = registry.search(&query);
        assert!(results.iter().all(|s| s.metadata.builtin));
    }

    #[test]
    fn test_by_category() {
        let registry = test_registry();
        let testing = registry.by_category(SkillCategory::Testing);
        assert_eq!(testing.len(), 1);
        assert_eq!(testing[0].metadata.name, "test-generator");
    }

    #[test]
    fn test_usage_tracking() {
        let mut registry = test_registry();
        assert_eq!(registry.get("code-review").unwrap().usage_count, 0);

        registry.record_usage("code-review");
        registry.record_usage("code-review");
        registry.record_usage("code-review");

        assert_eq!(registry.get("code-review").unwrap().usage_count, 3);
    }

    #[test]
    fn test_most_popular() {
        let mut registry = test_registry();
        registry.record_usage("test-generator");
        registry.record_usage("test-generator");
        registry.record_usage("test-generator");
        registry.record_usage("code-review");
        registry.record_usage("code-review");
        registry.record_usage("docs-generator");

        let popular = registry.most_popular(2);
        assert_eq!(popular.len(), 2);
        assert_eq!(popular[0].metadata.name, "test-generator");
        assert_eq!(popular[1].metadata.name, "code-review");
    }

    #[test]
    fn test_dependency_resolution() {
        let registry = test_registry();
        // security-audit depends on code-review
        let deps = registry.resolve_dependencies("security-audit").unwrap();
        assert_eq!(deps, vec!["code-review", "security-audit"]);
    }

    #[test]
    fn test_dependency_resolution_no_deps() {
        let registry = test_registry();
        let deps = registry.resolve_dependencies("code-review").unwrap();
        assert_eq!(deps, vec!["code-review"]);
    }

    #[test]
    fn test_circular_dependency_detection() {
        let mut registry = SkillRegistry::new();
        registry.register(
            SkillMetadata {
                name: "a".into(), description: "A".into(), version: "1.0.0".into(),
                author: "test".into(), tags: vec![], category: SkillCategory::Custom,
                inputs: vec![], outputs: vec![],
                dependencies: vec![SkillDependency {
                    skill_name: "b".into(), version_constraint: None, optional: false,
                }],
                builtin: false, source: "test".into(),
            },
            "A body".into(),
        );
        registry.register(
            SkillMetadata {
                name: "b".into(), description: "B".into(), version: "1.0.0".into(),
                author: "test".into(), tags: vec![], category: SkillCategory::Custom,
                inputs: vec![], outputs: vec![],
                dependencies: vec![SkillDependency {
                    skill_name: "a".into(), version_constraint: None, optional: false,
                }],
                builtin: false, source: "test".into(),
            },
            "B body".into(),
        );

        let result = registry.resolve_dependencies("a");
        assert!(matches!(result, Err(DependencyError::CircularDependency(_))));
    }

    #[test]
    fn test_pipeline_creation() {
        let mut pipeline = SkillPipeline::new("review-and-test")
            .with_description("Review code then generate tests");

        pipeline.add_step(PipelineStep {
            skill_name: "code-review".into(),
            input_mapping: [("file".into(), "file_path".into())].into(),
            output_mapping: [("review".into(), "review_output".into())].into(),
            condition: None,
            continue_on_error: false,
        });

        pipeline.add_step(PipelineStep {
            skill_name: "test-generator".into(),
            input_mapping: [("file".into(), "source_file".into())].into(),
            output_mapping: [("test_file".into(), "generated_tests".into())].into(),
            condition: None,
            continue_on_error: false,
        });

        assert_eq!(pipeline.step_count(), 2);
        assert_eq!(pipeline.skill_names(), vec!["code-review", "test-generator"]);
    }

    #[test]
    fn test_pipeline_validation() {
        let registry = test_registry();
        let mut pipeline = SkillPipeline::new("valid-pipeline");

        pipeline.add_step(PipelineStep {
            skill_name: "code-review".into(),
            input_mapping: HashMap::new(),
            output_mapping: HashMap::new(),
            condition: None,
            continue_on_error: false,
        });

        let errors = pipeline.validate(&registry);
        assert!(errors.is_empty());
    }

    #[test]
    fn test_pipeline_validation_missing_skill() {
        let registry = test_registry();
        let mut pipeline = SkillPipeline::new("invalid-pipeline");

        pipeline.add_step(PipelineStep {
            skill_name: "nonexistent-skill".into(),
            input_mapping: HashMap::new(),
            output_mapping: HashMap::new(),
            condition: None,
            continue_on_error: false,
        });

        let errors = pipeline.validate(&registry);
        assert!(!errors.is_empty());
        assert!(matches!(errors[0], PipelineValidationError::SkillNotFound { .. }));
    }

    #[test]
    fn test_empty_pipeline_validation() {
        let registry = test_registry();
        let pipeline = SkillPipeline::new("empty");
        let errors = pipeline.validate(&registry);
        assert!(errors.iter().any(|e| matches!(e, PipelineValidationError::EmptyPipeline)));
    }

    #[test]
    fn test_category_display() {
        assert_eq!(SkillCategory::Coding.to_string(), "coding");
        assert_eq!(SkillCategory::DevOps.to_string(), "devops");
        assert_eq!(SkillCategory::DataAnalysis.to_string(), "data_analysis");
    }

    #[test]
    fn test_serialization() {
        let registry = test_registry();
        let json = serde_json::to_string(&registry).unwrap();
        let deserialized: SkillRegistry = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.count(), registry.count());
    }

    #[test]
    fn test_list_names() {
        let registry = test_registry();
        let names = registry.list_names();
        assert_eq!(names.len(), 4);
        assert!(names.contains(&"code-review"));
    }
}
