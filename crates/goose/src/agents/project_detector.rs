//! Smart Project Auto-Detection
//!
//! Scans the working directory for project manifest files and auto-generates
//! context that helps the agent understand the project structure. This provides
//! a first-run experience where the agent immediately knows the language,
//! framework, build tools, and test commands without user configuration.

use std::path::Path;

/// Detected project context
#[derive(Debug, Clone, Default)]
pub struct ProjectContext {
    pub language: Option<String>,
    pub framework: Option<String>,
    pub build_tool: Option<String>,
    pub test_command: Option<String>,
    pub package_manager: Option<String>,
    pub key_directories: Vec<String>,
    pub project_name: Option<String>,
    pub manifest_files: Vec<String>,
}

impl ProjectContext {
    /// Generate a system prompt section from the detected context
    pub fn to_system_prompt(&self) -> String {
        if self.language.is_none() && self.framework.is_none() {
            return String::new();
        }

        let mut parts = Vec::new();
        parts.push("[PROJECT CONTEXT — Auto-detected]:".to_string());

        if let Some(ref name) = self.project_name {
            parts.push(format!("  Project: {}", name));
        }
        if let Some(ref lang) = self.language {
            parts.push(format!("  Language: {}", lang));
        }
        if let Some(ref fw) = self.framework {
            parts.push(format!("  Framework: {}", fw));
        }
        if let Some(ref bt) = self.build_tool {
            parts.push(format!("  Build: {}", bt));
        }
        if let Some(ref tc) = self.test_command {
            parts.push(format!("  Test: {}", tc));
        }
        if let Some(ref pm) = self.package_manager {
            parts.push(format!("  Package Manager: {}", pm));
        }
        if !self.key_directories.is_empty() {
            parts.push(format!("  Key Dirs: {}", self.key_directories.join(", ")));
        }

        parts.join("\n")
    }

    /// Format as a human-readable summary
    pub fn summary(&self) -> String {
        let mut s = String::new();
        if let Some(ref lang) = self.language {
            s.push_str(lang);
        }
        if let Some(ref fw) = self.framework {
            if !s.is_empty() {
                s.push_str(" + ");
            }
            s.push_str(fw);
        }
        if s.is_empty() {
            "Unknown project type".to_string()
        } else {
            s
        }
    }
}

/// Detect project context from the working directory
pub fn detect_project(working_dir: &Path) -> ProjectContext {
    let mut ctx = ProjectContext::default();

    // Detect Rust projects
    if let Some(rust_ctx) = detect_rust(working_dir) {
        ctx = rust_ctx;
    }
    // Detect Node/TypeScript projects
    else if let Some(node_ctx) = detect_node(working_dir) {
        ctx = node_ctx;
    }
    // Detect Python projects
    else if let Some(python_ctx) = detect_python(working_dir) {
        ctx = python_ctx;
    }
    // Detect Go projects
    else if let Some(go_ctx) = detect_go(working_dir) {
        ctx = go_ctx;
    }

    // Detect common directories
    detect_common_dirs(working_dir, &mut ctx);

    ctx
}

fn detect_rust(dir: &Path) -> Option<ProjectContext> {
    let cargo_toml = dir.join("Cargo.toml");
    if !cargo_toml.exists() {
        return None;
    }

    let mut ctx = ProjectContext {
        language: Some("Rust".to_string()),
        build_tool: Some("cargo".to_string()),
        test_command: Some("cargo test".to_string()),
        manifest_files: vec!["Cargo.toml".to_string()],
        ..Default::default()
    };

    if let Ok(content) = std::fs::read_to_string(&cargo_toml) {
        // Check for workspace
        if content.contains("[workspace]") {
            ctx.framework = Some("Cargo workspace".to_string());
        }
        // Extract package name
        for line in content.lines() {
            if line.starts_with("name") {
                if let Some(name) = line.split('=').nth(1) {
                    ctx.project_name = Some(name.trim().trim_matches('"').to_string());
                }
                break;
            }
        }
        // Detect common frameworks
        if content.contains("axum") {
            ctx.framework = Some("Axum".to_string());
        } else if content.contains("actix") {
            ctx.framework = Some("Actix".to_string());
        } else if content.contains("rocket") {
            ctx.framework = Some("Rocket".to_string());
        } else if content.contains("tauri") {
            ctx.framework = Some("Tauri".to_string());
        }
    }

    Some(ctx)
}

fn detect_node(dir: &Path) -> Option<ProjectContext> {
    let package_json = dir.join("package.json");
    if !package_json.exists() {
        return None;
    }

    let mut ctx = ProjectContext {
        language: Some("JavaScript/TypeScript".to_string()),
        manifest_files: vec!["package.json".to_string()],
        ..Default::default()
    };

    // Detect package manager
    if dir.join("pnpm-lock.yaml").exists() {
        ctx.package_manager = Some("pnpm".to_string());
    } else if dir.join("yarn.lock").exists() {
        ctx.package_manager = Some("yarn".to_string());
    } else if dir.join("bun.lockb").exists() {
        ctx.package_manager = Some("bun".to_string());
    } else {
        ctx.package_manager = Some("npm".to_string());
    }

    if dir.join("tsconfig.json").exists() {
        ctx.language = Some("TypeScript".to_string());
        ctx.manifest_files.push("tsconfig.json".to_string());
    }

    if let Ok(content) = std::fs::read_to_string(&package_json) {
        // Extract name
        if let Some(start) = content.find("\"name\"") {
            if let Some(val_start) = content[start..].find(':') {
                let rest = &content[start + val_start + 1..];
                if let Some(q1) = rest.find('"') {
                    if let Some(q2) = rest[q1 + 1..].find('"') {
                        ctx.project_name = Some(rest[q1 + 1..q1 + 1 + q2].to_string());
                    }
                }
            }
        }

        // Detect frameworks
        if content.contains("\"next\"") {
            ctx.framework = Some("Next.js".to_string());
        } else if content.contains("\"react\"") {
            ctx.framework = Some("React".to_string());
        } else if content.contains("\"vue\"") {
            ctx.framework = Some("Vue".to_string());
        } else if content.contains("\"express\"") {
            ctx.framework = Some("Express".to_string());
        } else if content.contains("\"electron\"") {
            ctx.framework = Some("Electron".to_string());
        }

        // Detect test command
        if content.contains("\"jest\"") || content.contains("\"@jest") {
            ctx.test_command = Some("npm test".to_string());
        } else if content.contains("\"vitest\"") {
            ctx.test_command = Some("npx vitest".to_string());
        } else if content.contains("\"mocha\"") {
            ctx.test_command = Some("npm test".to_string());
        }

        ctx.build_tool = Some(ctx.package_manager.clone().unwrap_or("npm".to_string()));
    }

    Some(ctx)
}

fn detect_python(dir: &Path) -> Option<ProjectContext> {
    let pyproject = dir.join("pyproject.toml");
    let setup_py = dir.join("setup.py");
    let requirements = dir.join("requirements.txt");

    if !pyproject.exists() && !setup_py.exists() && !requirements.exists() {
        return None;
    }

    let mut ctx = ProjectContext {
        language: Some("Python".to_string()),
        test_command: Some("pytest".to_string()),
        ..Default::default()
    };

    if pyproject.exists() {
        ctx.manifest_files.push("pyproject.toml".to_string());
        ctx.build_tool = Some("pip/pyproject".to_string());

        if let Ok(content) = std::fs::read_to_string(&pyproject) {
            if content.contains("[tool.poetry]") {
                ctx.package_manager = Some("poetry".to_string());
                ctx.build_tool = Some("poetry".to_string());
            } else if content.contains("[tool.hatch]") {
                ctx.package_manager = Some("hatch".to_string());
            }
            if content.contains("django") {
                ctx.framework = Some("Django".to_string());
            } else if content.contains("fastapi") {
                ctx.framework = Some("FastAPI".to_string());
            } else if content.contains("flask") {
                ctx.framework = Some("Flask".to_string());
            }
        }
    }

    if requirements.exists() {
        ctx.manifest_files.push("requirements.txt".to_string());
        ctx.package_manager = ctx.package_manager.or(Some("pip".to_string()));
    }

    Some(ctx)
}

fn detect_go(dir: &Path) -> Option<ProjectContext> {
    let go_mod = dir.join("go.mod");
    if !go_mod.exists() {
        return None;
    }

    let mut ctx = ProjectContext {
        language: Some("Go".to_string()),
        build_tool: Some("go build".to_string()),
        test_command: Some("go test ./...".to_string()),
        manifest_files: vec!["go.mod".to_string()],
        ..Default::default()
    };

    if let Ok(content) = std::fs::read_to_string(&go_mod) {
        // Extract module name
        for line in content.lines() {
            if line.starts_with("module ") {
                ctx.project_name = Some(line.trim_start_matches("module ").trim().to_string());
                break;
            }
        }
        if content.contains("gin-gonic") {
            ctx.framework = Some("Gin".to_string());
        } else if content.contains("gorilla/mux") {
            ctx.framework = Some("Gorilla".to_string());
        } else if content.contains("fiber") {
            ctx.framework = Some("Fiber".to_string());
        }
    }

    Some(ctx)
}

fn detect_common_dirs(dir: &Path, ctx: &mut ProjectContext) {
    let common = [
        "src", "lib", "test", "tests", "spec", "docs", "scripts",
        "ui", "api", "crates", "packages", "cmd", "internal",
    ];
    for name in common {
        if dir.join(name).is_dir() {
            ctx.key_directories.push(name.to_string());
        }
    }

    // Detect CI/CD
    if dir.join(".github/workflows").is_dir() {
        ctx.key_directories.push(".github/workflows".to_string());
    }
    if dir.join("Dockerfile").exists() || dir.join("docker-compose.yml").exists() {
        ctx.key_directories.push("docker".to_string());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_context() {
        let ctx = ProjectContext::default();
        assert!(ctx.to_system_prompt().is_empty());
        assert_eq!(ctx.summary(), "Unknown project type");
    }

    #[test]
    fn test_rust_context_prompt() {
        let ctx = ProjectContext {
            language: Some("Rust".to_string()),
            framework: Some("Axum".to_string()),
            build_tool: Some("cargo".to_string()),
            test_command: Some("cargo test".to_string()),
            project_name: Some("super-goose".to_string()),
            ..Default::default()
        };
        let prompt = ctx.to_system_prompt();
        assert!(prompt.contains("Rust"));
        assert!(prompt.contains("Axum"));
        assert!(prompt.contains("cargo test"));
    }

    #[test]
    fn test_summary() {
        let ctx = ProjectContext {
            language: Some("TypeScript".to_string()),
            framework: Some("Next.js".to_string()),
            ..Default::default()
        };
        assert_eq!(ctx.summary(), "TypeScript + Next.js");
    }
}
