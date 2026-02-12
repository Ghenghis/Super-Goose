//! DocsGenerator — Auto-generate README sections, Docusaurus pages, and Mermaid diagrams.
//!
//! Takes structured data (module info, architecture descriptions, feature lists)
//! and produces formatted Markdown documentation.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tracing::info;

/// A section of documentation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocSection {
    /// The section title (used as heading).
    pub title: String,
    /// The section body (Markdown content).
    pub body: String,
    /// Heading level (1-6).
    pub level: u8,
    /// Optional subsections.
    pub subsections: Vec<DocSection>,
}

impl DocSection {
    /// Create a new doc section.
    pub fn new(title: impl Into<String>, body: impl Into<String>, level: u8) -> Self {
        Self {
            title: title.into(),
            body: body.into(),
            level: level.clamp(1, 6),
            subsections: Vec::new(),
        }
    }

    /// Add a subsection.
    pub fn with_subsection(mut self, sub: DocSection) -> Self {
        self.subsections.push(sub);
        self
    }

    /// Render to Markdown.
    pub fn to_markdown(&self) -> String {
        let mut md = String::new();
        let hashes = "#".repeat(self.level as usize);
        md.push_str(&format!("{} {}\n\n", hashes, self.title));
        if !self.body.is_empty() {
            md.push_str(&self.body);
            md.push_str("\n\n");
        }
        for sub in &self.subsections {
            md.push_str(&sub.to_markdown());
        }
        md
    }
}

/// A module description for architecture docs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleInfo {
    /// Module name.
    pub name: String,
    /// Short description.
    pub description: String,
    /// Source file path (relative).
    pub source_path: String,
    /// List of public types/functions.
    pub exports: Vec<String>,
    /// Dependencies (other module names).
    pub dependencies: Vec<String>,
}

/// A feature entry for feature matrix tables.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureEntry {
    pub name: String,
    pub status: FeatureStatus,
    pub description: String,
}

/// Feature status for documentation tables.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum FeatureStatus {
    Working,
    Partial,
    Planned,
    Deprecated,
}

impl std::fmt::Display for FeatureStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FeatureStatus::Working => write!(f, "WORKING"),
            FeatureStatus::Partial => write!(f, "PARTIAL"),
            FeatureStatus::Planned => write!(f, "PLANNED"),
            FeatureStatus::Deprecated => write!(f, "DEPRECATED"),
        }
    }
}

/// Mermaid diagram types.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum DiagramType {
    Flowchart,
    Sequence,
    ClassDiagram,
    StateDiagram,
}

/// A Mermaid diagram specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MermaidDiagram {
    pub title: String,
    pub diagram_type: DiagramType,
    pub content: String,
}

impl MermaidDiagram {
    /// Create a new Mermaid diagram.
    pub fn new(
        title: impl Into<String>,
        diagram_type: DiagramType,
        content: impl Into<String>,
    ) -> Self {
        Self {
            title: title.into(),
            diagram_type,
            content: content.into(),
        }
    }

    /// Render as a Markdown code block.
    pub fn to_markdown(&self) -> String {
        format!(
            "### {}\n\n```mermaid\n{}\n```\n\n",
            self.title, self.content
        )
    }
}

/// Result of a documentation generation operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocGenResult {
    /// The generated content.
    pub content: String,
    /// The target file path.
    pub target_path: PathBuf,
    /// When the doc was generated.
    pub generated_at: String,
    /// Number of sections generated.
    pub section_count: usize,
}

/// Generates documentation from structured data.
pub struct DocsGenerator {
    /// Project name.
    project_name: String,
    /// Base output directory.
    output_dir: PathBuf,
    /// Generated docs history.
    history: Vec<DocGenResult>,
}

impl DocsGenerator {
    /// Create a new docs generator.
    pub fn new(project_name: impl Into<String>, output_dir: PathBuf) -> Self {
        Self {
            project_name: project_name.into(),
            output_dir,
            history: Vec::new(),
        }
    }

    /// Generate a feature matrix table.
    pub fn generate_feature_table(&self, features: &[FeatureEntry]) -> String {
        let mut table = String::from("| # | Feature | Status | Description |\n");
        table.push_str("|---|---------|--------|-------------|\n");

        for (i, feature) in features.iter().enumerate() {
            let status_badge = match feature.status {
                FeatureStatus::Working => "**WORKING**",
                FeatureStatus::Partial => "**PARTIAL**",
                FeatureStatus::Planned => "PLANNED",
                FeatureStatus::Deprecated => "~~DEPRECATED~~",
            };
            table.push_str(&format!(
                "| {} | {} | {} | {} |\n",
                i + 1,
                feature.name,
                status_badge,
                feature.description
            ));
        }

        table
    }

    /// Generate a module architecture page.
    pub fn generate_architecture_page(&self, modules: &[ModuleInfo]) -> String {
        let mut page = format!("# {} Architecture\n\n", self.project_name);
        page.push_str(&format!(
            "> Auto-generated on {}\n\n",
            Utc::now().format("%Y-%m-%d")
        ));

        for module in modules {
            page.push_str(&format!("## {}\n\n", module.name));
            page.push_str(&format!("{}\n\n", module.description));
            page.push_str(&format!("**Source:** `{}`\n\n", module.source_path));

            if !module.exports.is_empty() {
                page.push_str("**Exports:**\n\n");
                for export in &module.exports {
                    page.push_str(&format!("- `{}`\n", export));
                }
                page.push('\n');
            }

            if !module.dependencies.is_empty() {
                page.push_str(&format!(
                    "**Dependencies:** {}\n\n",
                    module
                        .dependencies
                        .iter()
                        .map(|d| format!("`{}`", d))
                        .collect::<Vec<_>>()
                        .join(", ")
                ));
            }
        }

        page
    }

    /// Generate a Docusaurus-compatible page with frontmatter.
    pub fn generate_docusaurus_page(
        &self,
        title: &str,
        sidebar_label: &str,
        sidebar_position: u32,
        content: &str,
    ) -> String {
        format!(
            "---\ntitle: \"{}\"\nsidebar_label: \"{}\"\nsidebar_position: {}\n---\n\n{}\n",
            title, sidebar_label, sidebar_position, content
        )
    }

    /// Generate a Mermaid flowchart from module dependencies.
    pub fn generate_dependency_diagram(&self, modules: &[ModuleInfo]) -> MermaidDiagram {
        let mut lines = vec!["graph TD".to_string()];

        for module in modules {
            let node_id = module.name.replace('-', "_").replace(' ', "_");
            lines.push(format!("    {}[{}]", node_id, module.name));

            for dep in &module.dependencies {
                let dep_id = dep.replace('-', "_").replace(' ', "_");
                lines.push(format!("    {} --> {}", node_id, dep_id));
            }
        }

        MermaidDiagram::new(
            format!("{} Module Dependencies", self.project_name),
            DiagramType::Flowchart,
            lines.join("\n"),
        )
    }

    /// Generate a complete documentation set and record the result.
    pub fn generate_page(
        &mut self,
        filename: &str,
        sections: Vec<DocSection>,
    ) -> DocGenResult {
        let mut content = String::new();
        for section in &sections {
            content.push_str(&section.to_markdown());
        }

        let target = self.output_dir.join(filename);
        let result = DocGenResult {
            content,
            target_path: target,
            generated_at: Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string(),
            section_count: sections.len(),
        };

        info!(
            file = filename,
            sections = result.section_count,
            "Generated documentation page"
        );

        self.history.push(result.clone());
        result
    }

    /// Get generation history.
    pub fn history(&self) -> &[DocGenResult] {
        &self.history
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_doc_section_to_markdown() {
        let section = DocSection::new("Overview", "This is the overview.", 1);
        let md = section.to_markdown();
        assert!(md.starts_with("# Overview\n"));
        assert!(md.contains("This is the overview."));
    }

    #[test]
    fn test_doc_section_with_subsections() {
        let section = DocSection::new("Parent", "Parent body.", 1)
            .with_subsection(DocSection::new("Child", "Child body.", 2));

        let md = section.to_markdown();
        assert!(md.contains("# Parent"));
        assert!(md.contains("## Child"));
        assert!(md.contains("Child body."));
    }

    #[test]
    fn test_feature_table() {
        let gen = DocsGenerator::new("TestProject", PathBuf::from("/tmp"));
        let features = vec![
            FeatureEntry {
                name: "Auth".into(),
                status: FeatureStatus::Working,
                description: "Authentication system".into(),
            },
            FeatureEntry {
                name: "Search".into(),
                status: FeatureStatus::Partial,
                description: "Full-text search".into(),
            },
        ];

        let table = gen.generate_feature_table(&features);
        assert!(table.contains("| 1 | Auth | **WORKING** |"));
        assert!(table.contains("| 2 | Search | **PARTIAL** |"));
    }

    #[test]
    fn test_architecture_page() {
        let gen = DocsGenerator::new("SuperGoose", PathBuf::from("/tmp"));
        let modules = vec![
            ModuleInfo {
                name: "Core".into(),
                description: "Core module".into(),
                source_path: "src/core/mod.rs".into(),
                exports: vec!["AgentCore".into(), "CoreType".into()],
                dependencies: vec![],
            },
            ModuleInfo {
                name: "Learning".into(),
                description: "Learning engine".into(),
                source_path: "src/agents/experience_store.rs".into(),
                exports: vec!["ExperienceStore".into()],
                dependencies: vec!["Core".into()],
            },
        ];

        let page = gen.generate_architecture_page(&modules);
        assert!(page.contains("# SuperGoose Architecture"));
        assert!(page.contains("## Core"));
        assert!(page.contains("## Learning"));
        assert!(page.contains("`AgentCore`"));
        assert!(page.contains("**Dependencies:** `Core`"));
    }

    #[test]
    fn test_docusaurus_page() {
        let gen = DocsGenerator::new("Test", PathBuf::from("/tmp"));
        let page = gen.generate_docusaurus_page(
            "My Page",
            "My Label",
            3,
            "# Content\n\nHello world.",
        );

        assert!(page.starts_with("---\n"));
        assert!(page.contains("title: \"My Page\""));
        assert!(page.contains("sidebar_label: \"My Label\""));
        assert!(page.contains("sidebar_position: 3"));
        assert!(page.contains("# Content"));
    }

    #[test]
    fn test_mermaid_diagram() {
        let diagram = MermaidDiagram::new(
            "Test Diagram",
            DiagramType::Flowchart,
            "graph TD\n    A --> B",
        );
        let md = diagram.to_markdown();
        assert!(md.contains("### Test Diagram"));
        assert!(md.contains("```mermaid"));
        assert!(md.contains("graph TD"));
    }

    #[test]
    fn test_dependency_diagram() {
        let gen = DocsGenerator::new("Test", PathBuf::from("/tmp"));
        let modules = vec![
            ModuleInfo {
                name: "Core".into(),
                description: "Core module".into(),
                source_path: "src/core.rs".into(),
                exports: vec![],
                dependencies: vec![],
            },
            ModuleInfo {
                name: "Learning".into(),
                description: "Learning engine".into(),
                source_path: "src/learning.rs".into(),
                exports: vec![],
                dependencies: vec!["Core".into()],
            },
        ];

        let diagram = gen.generate_dependency_diagram(&modules);
        assert_eq!(diagram.diagram_type, DiagramType::Flowchart);
        assert!(diagram.content.contains("Learning --> Core"));
    }

    #[test]
    fn test_generate_page() {
        let mut gen = DocsGenerator::new("Test", PathBuf::from("/tmp/docs"));
        let sections = vec![
            DocSection::new("Title", "Body content.", 1),
            DocSection::new("Another", "More content.", 2),
        ];

        let result = gen.generate_page("test.md", sections);
        assert_eq!(result.section_count, 2);
        assert!(result.content.contains("# Title"));
        assert!(result.content.contains("## Another"));
        assert_eq!(result.target_path, PathBuf::from("/tmp/docs/test.md"));
        assert_eq!(gen.history().len(), 1);
    }

    #[test]
    fn test_feature_status_display() {
        assert_eq!(FeatureStatus::Working.to_string(), "WORKING");
        assert_eq!(FeatureStatus::Partial.to_string(), "PARTIAL");
        assert_eq!(FeatureStatus::Planned.to_string(), "PLANNED");
        assert_eq!(FeatureStatus::Deprecated.to_string(), "DEPRECATED");
    }
}
