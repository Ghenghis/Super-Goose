# TimeWarp: Dependency Versioning, Conflict Detection & Resolution Specification

**Version:** 1.0.0
**Status:** Design Phase
**Target Integration:** Super-Goose TimeWarp Timeline System
**Extends:** `ARCHITECTURE_BLUEPRINT.md`, `RUST_CRATE_ARCHITECTURE.md`, `TIMEWARP_MISSING_FEATURES_GAP_ANALYSIS.md` (Section 3.1)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Data Model](#2-data-model)
3. [Ecosystem Parsers](#3-ecosystem-parsers)
4. [Event Capture Pipeline](#4-event-capture-pipeline)
5. [Conflict Detection Engine](#5-conflict-detection-engine)
6. [Resolution Strategies](#6-resolution-strategies)
7. [Sonatype Integration](#7-sonatype-integration)
8. [Timeline Visual Representation](#8-timeline-visual-representation)
9. [Rust Crate Architecture](#9-rust-crate-architecture)
10. [Configuration](#10-configuration)
11. [Testing Strategy](#11-testing-strategy)

---

## 1. Overview

### 1.1 Purpose

The Dependency Versioning subsystem extends TimeWarp's event-sourced timeline with first-class tracking of dependency changes across all major package ecosystems. Every dependency add, remove, update, constraint change, lock file mutation, security advisory, and license shift becomes an immutable event on the TimeWarp DAG, enabling:

- **Full dependency history**: See exactly when every dependency was added, updated, or removed
- **Cross-ecosystem awareness**: Track Rust, Node, Python, Go, Java, Docker, and system dependencies in a unified model
- **Conflict detection**: Identify version incompatibilities, diamond dependencies, peer mismatches, and feature flag conflicts before they break builds
- **Automated resolution**: Suggest and apply fixes with full rollback capability
- **Security timeline**: Track when CVEs were published, when patches became available, and when your project updated
- **Dependency graph diffing**: Compare the full dependency tree between any two timeline points

### 1.2 Integration with Existing TimeWarp Architecture

This subsystem integrates at three layers of the existing TimeWarp stack:

```
┌──────────────────────────────────────────────────────────────┐
│                    TimeWarp Bar (UI)                          │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Dependency Track (new timeline lane)                    │ │
│  │  [+lodash] ──[^express]── [CVE!] ──[lock sync]── ...   │ │
│  └─────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│               TimeWarp Core (new module)                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │  Dependency   │ │  Conflict    │ │  Resolution          │ │
│  │  Tracker      │ │  Detector    │ │  Engine              │ │
│  │  (parsers +   │ │  (graph      │ │  (auto/manual/       │ │
│  │   watchers)   │ │   analysis)  │ │   rollback)          │ │
│  └──────┬───────┘ └──────┬───────┘ └──────────┬───────────┘ │
│         │                │                     │             │
│  ┌──────▼────────────────▼─────────────────────▼───────────┐ │
│  │              Event Store (existing)                       │ │
│  │  New EventTypes: DepAdd, DepRemove, DepUpdate, ...       │ │
│  └──────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│             External Services                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐ │
│  │ crates.io│ │  npmjs   │ │  PyPI    │ │  Sonatype      │ │
│  │ (audit)  │ │ (audit)  │ │ (audit)  │ │  (trust score) │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 1.3 Relationship to Existing EventType Enum

The existing `EventType` enum (from `RUST_CRATE_ARCHITECTURE.md` Section 2.2) includes `FileWrite`, `CmdExec`, and `Custom(String)`. Dependency events are added as new first-class variants rather than using `Custom`, because:

- They require structured data (package name, version ranges, ecosystem)
- The conflict detection engine must pattern-match on them efficiently
- The timeline UI renders them with specialized visuals

---

## 2. Data Model

All types live in `crates/timewarp/src/dependency/models.rs` and derive `Debug, Clone, Serialize, Deserialize`.

### 2.1 Ecosystem Enum

```rust
/// Supported package ecosystems.
/// Each ecosystem has its own manifest format, lock file format,
/// version constraint syntax, and registry API.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Ecosystem {
    /// Rust: Cargo.toml + Cargo.lock, crates.io
    Cargo,
    /// Node.js: package.json + package-lock.json/yarn.lock/pnpm-lock.yaml
    Npm,
    /// Python: requirements.txt / pyproject.toml / Pipfile / poetry.lock
    Python,
    /// Go: go.mod + go.sum
    Go,
    /// Java/Kotlin: pom.xml (Maven) or build.gradle (Gradle)
    Maven,
    /// Java/Kotlin: build.gradle / build.gradle.kts
    Gradle,
    /// Docker: Dockerfile FROM directives, docker-compose.yml image refs
    Docker,
    /// OS-level packages: apt, yum, brew, choco, winget
    System,
}

impl Ecosystem {
    /// Manifest file names for this ecosystem (detection markers).
    pub fn manifest_files(&self) -> &[&str] {
        match self {
            Self::Cargo => &["Cargo.toml"],
            Self::Npm => &["package.json"],
            Self::Python => &["requirements.txt", "pyproject.toml", "Pipfile", "setup.py", "setup.cfg"],
            Self::Go => &["go.mod"],
            Self::Maven => &["pom.xml"],
            Self::Gradle => &["build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"],
            Self::Docker => &["Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml"],
            Self::System => &[], // Detected via shell commands
        }
    }

    /// Lock file names for this ecosystem.
    pub fn lock_files(&self) -> &[&str] {
        match self {
            Self::Cargo => &["Cargo.lock"],
            Self::Npm => &["package-lock.json", "yarn.lock", "pnpm-lock.yaml"],
            Self::Python => &["poetry.lock", "Pipfile.lock", "requirements.txt"],
            Self::Go => &["go.sum"],
            Self::Maven => &[],
            Self::Gradle => &["gradle.lockfile"],
            Self::Docker => &[], // No lock file concept
            Self::System => &[],
        }
    }

    /// Registry URL for this ecosystem.
    pub fn registry_url(&self) -> Option<&str> {
        match self {
            Self::Cargo => Some("https://crates.io"),
            Self::Npm => Some("https://registry.npmjs.org"),
            Self::Python => Some("https://pypi.org"),
            Self::Go => Some("https://pkg.go.dev"),
            Self::Maven => Some("https://search.maven.org"),
            Self::Gradle => Some("https://plugins.gradle.org"),
            Self::Docker => Some("https://hub.docker.com"),
            Self::System => None,
        }
    }
}
```

### 2.2 Version Constraint Model

```rust
/// A version constraint as specified in a manifest file.
///
/// Each ecosystem has its own constraint syntax. This model normalizes
/// them into a common representation while preserving the original string
/// for display and round-tripping.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VersionConstraint {
    /// The raw constraint string as written in the manifest.
    /// Examples: "^1.2.3", ">=2.0,<3.0", "~=1.4", "1.19", "==3.11.*"
    pub raw: String,

    /// Normalized constraint type.
    pub constraint_type: ConstraintType,

    /// The ecosystem this constraint belongs to (determines parsing rules).
    pub ecosystem: Ecosystem,
}

/// Normalized constraint types across all ecosystems.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ConstraintType {
    /// Exact version pin: "=1.2.3" (Cargo), "1.2.3" (npm with save-exact)
    Exact { version: SemVer },

    /// Caret range: "^1.2.3" — compatible with 1.x.y where x >= 2
    /// Cargo default, npm default
    Caret { version: SemVer },

    /// Tilde range: "~1.2.3" — compatible with 1.2.x where x >= 3
    /// Cargo, npm, Bundler
    Tilde { version: SemVer },

    /// Wildcard: "1.2.*", "1.*", "*"
    Wildcard { major: Option<u64>, minor: Option<u64> },

    /// Greater than or equal: ">=1.2.3"
    GreaterThanOrEqual { version: SemVer },

    /// Less than: "<2.0.0"
    LessThan { version: SemVer },

    /// Range: ">=1.2.3, <2.0.0"  or  "1.2.3 - 2.0.0"
    Range { lower: SemVer, upper: SemVer, upper_inclusive: bool },

    /// Python compatible release: "~=1.4" means >=1.4, <2.0
    CompatibleRelease { version: SemVer },

    /// Git reference (Cargo path/git deps, Go replace directives)
    GitRef { url: String, reference: GitReference },

    /// Local path dependency
    Path { path: String },

    /// Docker tag (can be semver-like or arbitrary: "latest", "alpine", "3.19-slim")
    DockerTag { tag: String },

    /// System package version (OS-specific format)
    SystemVersion { raw: String },

    /// Unparseable — preserve the raw string
    Unknown { raw: String },
}

/// A parsed semantic version.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct SemVer {
    pub major: u64,
    pub minor: u64,
    pub patch: u64,
    pub pre: Option<String>,      // e.g., "alpha.1", "rc.2"
    pub build: Option<String>,    // e.g., "build.123"
}

/// Git reference types for source dependencies.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum GitReference {
    Branch { name: String },
    Tag { name: String },
    Rev { sha: String },
    DefaultBranch,
}
```

### 2.3 Dependency Entry

```rust
/// A single dependency as declared in a manifest file.
///
/// This represents one entry in Cargo.toml [dependencies],
/// one entry in package.json "dependencies", etc.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyEntry {
    /// Package name as declared in the manifest.
    /// Examples: "serde", "lodash", "requests", "github.com/gorilla/mux"
    pub name: String,

    /// The version constraint from the manifest.
    pub constraint: VersionConstraint,

    /// The resolved (locked) version, if a lock file is present.
    pub resolved_version: Option<SemVer>,

    /// Which ecosystem this dependency belongs to.
    pub ecosystem: Ecosystem,

    /// Dependency scope/category.
    pub scope: DependencyScope,

    /// Whether this is a direct dependency or transitive.
    pub is_direct: bool,

    /// Cargo: feature flags enabled for this dep.
    /// npm: N/A. Python: extras. Go: N/A.
    pub features: Vec<String>,

    /// Cargo: `optional = true`. npm: `peerDependenciesMeta.*.optional`.
    pub optional: bool,

    /// Platform/target restrictions.
    /// Cargo: `[target.'cfg(windows)'.dependencies]`
    /// npm: `os`, `cpu`, `engines`
    pub platform_constraints: Vec<PlatformConstraint>,

    /// Source registry override (private registries, mirrors).
    pub registry: Option<String>,

    /// SPDX license identifier(s), if known.
    pub license: Option<String>,
}

/// Dependency scope categories.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DependencyScope {
    /// Runtime production dependency.
    /// Cargo: [dependencies], npm: "dependencies", Python: install_requires
    Production,

    /// Development-only dependency.
    /// Cargo: [dev-dependencies], npm: "devDependencies", Python: dev extras
    Development,

    /// Build-time dependency.
    /// Cargo: [build-dependencies], npm: N/A, Python: build-system.requires
    Build,

    /// Peer dependency (npm-specific concept).
    /// npm: "peerDependencies"
    Peer,

    /// Optional/extras dependency.
    /// Python: extras_require, Cargo: optional deps behind features
    Optional,

    /// Docker base image dependency.
    Docker,

    /// System/OS package dependency.
    System,
}

/// Platform-specific constraint on a dependency.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PlatformConstraint {
    /// Cargo cfg expression: `cfg(target_os = "windows")`
    CargoCfg { expression: String },
    /// npm os field: ["linux", "darwin"]
    NpmOs { allowed: Vec<String> },
    /// npm cpu field: ["x64", "arm64"]
    NpmCpu { allowed: Vec<String> },
    /// npm engines: { "node": ">=18" }
    NpmEngine { engine: String, constraint: String },
    /// Python requires_python: ">=3.8"
    PythonVersion { constraint: String },
    /// Go toolchain directive
    GoToolchain { version: String },
    /// System package architecture
    SystemArch { arch: String },
}
```

### 2.4 Dependency Event Types

These extend the existing `EventType` enum from `RUST_CRATE_ARCHITECTURE.md`:

```rust
/// Dependency-specific event types for the TimeWarp DAG.
///
/// Each variant captures a discrete dependency change that becomes
/// an immutable event in the timeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DepEventType {
    /// A new dependency was added to a manifest.
    DepAdd {
        dependency: DependencyEntry,
        /// The manifest file that was modified.
        manifest_path: PathBuf,
    },

    /// A dependency was removed from a manifest.
    DepRemove {
        /// Name and ecosystem of the removed dependency.
        name: String,
        ecosystem: Ecosystem,
        /// The version constraint that was removed.
        previous_constraint: VersionConstraint,
        manifest_path: PathBuf,
    },

    /// A dependency's version constraint was changed.
    DepUpdate {
        name: String,
        ecosystem: Ecosystem,
        previous_constraint: VersionConstraint,
        new_constraint: VersionConstraint,
        /// If the resolved version also changed.
        previous_resolved: Option<SemVer>,
        new_resolved: Option<SemVer>,
        manifest_path: PathBuf,
    },

    /// A dependency's features/extras were changed (Cargo features, Python extras).
    DepFeatureChange {
        name: String,
        ecosystem: Ecosystem,
        added_features: Vec<String>,
        removed_features: Vec<String>,
        manifest_path: PathBuf,
    },

    /// A lock file was regenerated or updated.
    /// This captures all transitive dependency changes in one event.
    LockFileSync {
        ecosystem: Ecosystem,
        lock_file_path: PathBuf,
        /// Summary of what changed in the lock file.
        changes: LockFileChangeSummary,
    },

    /// A security advisory (CVE) was detected for a dependency.
    SecurityAdvisory {
        name: String,
        ecosystem: Ecosystem,
        advisory: SecurityAdvisoryInfo,
    },

    /// A dependency's license changed (detected via registry check).
    LicenseChange {
        name: String,
        ecosystem: Ecosystem,
        previous_license: Option<String>,
        new_license: String,
    },

    /// A dependency was marked as deprecated upstream.
    DeprecationWarning {
        name: String,
        ecosystem: Ecosystem,
        message: String,
        /// Suggested replacement package, if any.
        replacement: Option<String>,
    },

    /// A breaking change was detected via semver analysis.
    BreakingChange {
        name: String,
        ecosystem: Ecosystem,
        previous_version: SemVer,
        new_version: SemVer,
        /// What kind of breaking change.
        change_type: BreakingChangeType,
    },

    /// A dependency conflict was detected.
    ConflictDetected {
        conflict: DependencyConflict,
    },

    /// A dependency conflict was resolved (manually or automatically).
    ConflictResolved {
        conflict_id: String,
        resolution: ConflictResolution,
    },

    /// Full dependency graph snapshot (periodic or on-demand).
    DependencyGraphSnapshot {
        ecosystem: Ecosystem,
        /// Serialized adjacency list of the full dependency tree.
        graph: DependencyGraph,
    },
}

/// Summary of changes in a lock file update.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockFileChangeSummary {
    pub added: Vec<LockedDep>,
    pub removed: Vec<LockedDep>,
    pub updated: Vec<LockedDepUpdate>,
    /// Total number of transitive dependencies after the change.
    pub total_transitive_count: usize,
}

/// A locked (resolved) dependency from a lock file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockedDep {
    pub name: String,
    pub version: SemVer,
    pub checksum: Option<String>,
}

/// A version change for a locked dependency.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockedDepUpdate {
    pub name: String,
    pub previous_version: SemVer,
    pub new_version: SemVer,
    pub is_major: bool,
    pub is_minor: bool,
    pub is_patch: bool,
}
```

### 2.5 Security Advisory Model

```rust
/// Information about a security advisory affecting a dependency.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityAdvisoryInfo {
    /// CVE identifier (e.g., "CVE-2024-12345").
    pub cve_id: Option<String>,

    /// Advisory database ID (e.g., RUSTSEC-2024-0001, GHSA-xxxx-xxxx-xxxx).
    pub advisory_id: String,

    /// Severity level.
    pub severity: AdvisorySeverity,

    /// CVSS v3 score (0.0 - 10.0).
    pub cvss_score: Option<f64>,

    /// Human-readable title.
    pub title: String,

    /// Detailed description.
    pub description: String,

    /// Affected version ranges.
    pub affected_versions: Vec<String>,

    /// Patched version(s), if available.
    pub patched_versions: Vec<SemVer>,

    /// URL to the advisory.
    pub url: Option<String>,

    /// When the advisory was published.
    pub published_at: DateTime<Utc>,

    /// When the advisory was last updated.
    pub updated_at: Option<DateTime<Utc>>,

    /// CWE identifiers (weakness categories).
    pub cwe_ids: Vec<String>,
}

/// Severity levels for security advisories (aligned with CVSS v3).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AdvisorySeverity {
    None,       // CVSS 0.0
    Low,        // CVSS 0.1-3.9
    Medium,     // CVSS 4.0-6.9
    High,       // CVSS 7.0-8.9
    Critical,   // CVSS 9.0-10.0
}

/// Types of breaking changes detected via semver analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BreakingChangeType {
    /// Major version bump (1.x -> 2.x).
    MajorVersionBump,
    /// API removal (function, type, or export removed).
    ApiRemoval { removed_items: Vec<String> },
    /// Signature change (parameter types, return types).
    SignatureChange { affected_items: Vec<String> },
    /// Behavior change (same API, different semantics — detected via changelogs).
    BehaviorChange { description: String },
    /// Minimum supported runtime/compiler version increased.
    MinimumRuntimeBump { runtime: String, previous: String, new: String },
    /// Peer dependency requirement changed (npm).
    PeerDepChange { peer: String, previous: String, new: String },
}
```

### 2.6 Dependency Graph Model

```rust
/// A complete dependency graph for one ecosystem at one point in time.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyGraph {
    /// Root packages (the project's own packages).
    pub roots: Vec<String>,

    /// All nodes in the graph.
    pub nodes: HashMap<String, DependencyNode>,

    /// Edges: (from_package, to_package) with edge metadata.
    pub edges: Vec<DependencyEdge>,

    /// When this graph was computed.
    pub computed_at: DateTime<Utc>,

    /// Total node count (direct + transitive).
    pub total_count: usize,

    /// Maximum depth of the dependency tree.
    pub max_depth: usize,
}

/// A node in the dependency graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyNode {
    pub name: String,
    pub version: SemVer,
    pub ecosystem: Ecosystem,
    pub scope: DependencyScope,
    pub is_direct: bool,
    pub depth: usize,
    pub license: Option<String>,
    /// Sonatype Developer Trust Score (0-10), if available.
    pub trust_score: Option<f64>,
    /// Known advisories affecting this exact version.
    pub advisories: Vec<SecurityAdvisoryInfo>,
}

/// An edge in the dependency graph (A depends on B).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyEdge {
    pub from: String,
    pub to: String,
    pub constraint: VersionConstraint,
    pub scope: DependencyScope,
    pub features: Vec<String>,
    pub optional: bool,
}
```

---

## 3. Ecosystem Parsers

Each ecosystem has a dedicated parser module that reads manifest and lock files, detects changes, and emits `DepEventType` events.

### 3.1 Parser Trait

```rust
/// Trait implemented by each ecosystem parser.
///
/// Parsers are stateless — they read files and produce structured data.
/// The DependencyTracker holds state and calls parsers when files change.
#[async_trait]
pub trait EcosystemParser: Send + Sync {
    /// Which ecosystem this parser handles.
    fn ecosystem(&self) -> Ecosystem;

    /// Parse a manifest file into a list of declared dependencies.
    fn parse_manifest(&self, path: &Path, content: &str) -> Result<Vec<DependencyEntry>>;

    /// Parse a lock file into a list of resolved dependencies.
    fn parse_lock_file(&self, path: &Path, content: &str) -> Result<Vec<LockedDep>>;

    /// Diff two parsed manifests and produce dependency events.
    fn diff_manifests(
        &self,
        old: &[DependencyEntry],
        new: &[DependencyEntry],
        manifest_path: &Path,
    ) -> Vec<DepEventType>;

    /// Diff two parsed lock files and produce a change summary.
    fn diff_lock_files(
        &self,
        old: &[LockedDep],
        new: &[LockedDep],
    ) -> LockFileChangeSummary;

    /// Build a dependency graph from manifest + lock file.
    async fn build_graph(
        &self,
        manifest_path: &Path,
        lock_path: Option<&Path>,
    ) -> Result<DependencyGraph>;

    /// Check for security advisories against a list of resolved deps.
    async fn audit(&self, deps: &[LockedDep]) -> Result<Vec<SecurityAdvisoryInfo>>;
}
```

### 3.2 Cargo Parser (Rust)

**Manifest:** `Cargo.toml` (TOML format)
**Lock file:** `Cargo.lock` (TOML format)
**Constraint syntax:** Caret `^` (default), tilde `~`, exact `=`, wildcard `*`, comparison `>=`/`<`
**Special features:** Feature flags, optional dependencies, target-specific deps, workspace inheritance

```rust
pub struct CargoParser;

impl CargoParser {
    /// Parse [dependencies], [dev-dependencies], [build-dependencies] sections.
    /// Handles:
    /// - Simple: `serde = "1.0"`
    /// - Table: `serde = { version = "1.0", features = ["derive"] }`
    /// - Workspace inheritance: `serde = { workspace = true }`
    /// - Git deps: `my-lib = { git = "https://...", branch = "main" }`
    /// - Path deps: `my-lib = { path = "../my-lib" }`
    /// - Target-specific: `[target.'cfg(windows)'.dependencies]`
    /// - Feature-gated: `[features] full = ["serde/derive", "tokio/full"]`
    fn parse_cargo_toml(&self, content: &str) -> Result<CargoManifest> { ... }

    /// Parse Cargo.lock to extract all resolved packages.
    /// Each [[package]] entry has: name, version, source, checksum, dependencies.
    fn parse_cargo_lock(&self, content: &str) -> Result<Vec<LockedDep>> { ... }

    /// Detect feature flag conflicts:
    /// - Feature A enables dep X with features ["foo"]
    /// - Feature B enables dep X with features ["bar"]
    /// - If "foo" and "bar" are mutually exclusive, flag the conflict.
    fn detect_feature_conflicts(&self, manifest: &CargoManifest) -> Vec<DependencyConflict> { ... }

    /// Use `cargo audit` database (RustSec Advisory DB) for vulnerability scanning.
    async fn audit_rustsec(&self, deps: &[LockedDep]) -> Result<Vec<SecurityAdvisoryInfo>> { ... }
}
```

### 3.3 Npm Parser (Node.js)

**Manifest:** `package.json` (JSON format)
**Lock files:** `package-lock.json` (JSON), `yarn.lock` (custom format), `pnpm-lock.yaml` (YAML)
**Constraint syntax:** Caret `^` (default), tilde `~`, exact (no prefix), range `>=x <y`, hyphen `x - y`, `||` unions
**Special features:** Peer dependencies, peer dependency metadata, workspaces, overrides/resolutions

```rust
pub struct NpmParser;

impl NpmParser {
    /// Parse package.json sections:
    /// - "dependencies", "devDependencies", "peerDependencies",
    ///   "optionalDependencies", "bundledDependencies"
    /// - "overrides" (npm) / "resolutions" (yarn) for version pinning
    /// - "engines" for runtime constraints
    /// - "workspaces" for monorepo detection
    fn parse_package_json(&self, content: &str) -> Result<NpmManifest> { ... }

    /// Parse package-lock.json v3 format (npm 7+).
    /// Extracts the flattened "packages" map with resolved versions.
    fn parse_package_lock_json(&self, content: &str) -> Result<Vec<LockedDep>> { ... }

    /// Parse yarn.lock format (Yarn Classic and Yarn Berry).
    fn parse_yarn_lock(&self, content: &str) -> Result<Vec<LockedDep>> { ... }

    /// Parse pnpm-lock.yaml format.
    fn parse_pnpm_lock(&self, content: &str) -> Result<Vec<LockedDep>> { ... }

    /// Detect peer dependency mismatches:
    /// Package A declares peerDependencies: { "react": "^18.0.0" }
    /// Package B declares peerDependencies: { "react": "^17.0.0" }
    /// If both are installed, react@18.x satisfies A but not B.
    fn detect_peer_conflicts(
        &self,
        manifest: &NpmManifest,
        lock: &[LockedDep],
    ) -> Vec<DependencyConflict> { ... }

    /// Use npm audit / GitHub Advisory Database for vulnerability scanning.
    async fn audit_npm(&self, lock_path: &Path) -> Result<Vec<SecurityAdvisoryInfo>> { ... }
}
```

### 3.4 Python Parser

**Manifests:** `requirements.txt`, `pyproject.toml` (PEP 621 / Poetry / Flit), `Pipfile`, `setup.py`, `setup.cfg`
**Lock files:** `poetry.lock`, `Pipfile.lock`, `requirements.txt` (when pinned)
**Constraint syntax:** PEP 440 — `==`, `!=`, `~=`, `>=`, `<=`, `>`, `<`, `===` (arbitrary equality)
**Special features:** Extras, environment markers (`; python_version >= "3.8"`), index URLs

```rust
pub struct PythonParser;

impl PythonParser {
    /// Parse requirements.txt (one dep per line, with comments, -r includes, -e editable).
    fn parse_requirements_txt(&self, content: &str) -> Result<Vec<DependencyEntry>> { ... }

    /// Parse pyproject.toml:
    /// - [project].dependencies (PEP 621)
    /// - [project].optional-dependencies (extras)
    /// - [tool.poetry.dependencies] (Poetry format)
    /// - [build-system].requires
    fn parse_pyproject_toml(&self, content: &str) -> Result<Vec<DependencyEntry>> { ... }

    /// Parse Pipfile (TOML format with [packages] and [dev-packages]).
    fn parse_pipfile(&self, content: &str) -> Result<Vec<DependencyEntry>> { ... }

    /// Parse poetry.lock (TOML format with [[package]] entries).
    fn parse_poetry_lock(&self, content: &str) -> Result<Vec<LockedDep>> { ... }

    /// Parse Pipfile.lock (JSON format).
    fn parse_pipfile_lock(&self, content: &str) -> Result<Vec<LockedDep>> { ... }

    /// Use pip-audit or Safety DB for vulnerability scanning.
    async fn audit_python(&self, deps: &[LockedDep]) -> Result<Vec<SecurityAdvisoryInfo>> { ... }
}
```

### 3.5 Go Parser

**Manifest:** `go.mod`
**Lock file:** `go.sum` (checksum database, not a traditional lock file)
**Constraint syntax:** Minimum Version Selection (MVS) — always `v1.2.3` exact, Go selects the minimum satisfying version
**Special features:** `replace` directives, `exclude` directives, `retract` directives, module proxies

```rust
pub struct GoParser;

impl GoParser {
    /// Parse go.mod:
    /// - `require` blocks (direct and indirect)
    /// - `replace` directives (local path or version override)
    /// - `exclude` directives
    /// - `retract` directives
    /// - `go` version directive
    /// - `toolchain` directive (Go 1.21+)
    fn parse_go_mod(&self, content: &str) -> Result<GoManifest> { ... }

    /// Parse go.sum (hash verification, not full lock).
    fn parse_go_sum(&self, content: &str) -> Result<Vec<LockedDep>> { ... }

    /// Use govulncheck for vulnerability scanning.
    async fn audit_go(&self, mod_path: &Path) -> Result<Vec<SecurityAdvisoryInfo>> { ... }
}
```

### 3.6 Maven Parser (Java/Kotlin)

**Manifest:** `pom.xml` (XML format)
**Constraint syntax:** Maven version ranges `[1.0,2.0)`, `[1.0]` (exact), `1.0` (soft requirement)
**Special features:** Parent POMs, BOM (Bill of Materials) imports, property interpolation, profiles, dependency management

```rust
pub struct MavenParser;

impl MavenParser {
    /// Parse pom.xml:
    /// - <dependencies> section
    /// - <dependencyManagement> section (version declarations)
    /// - <parent> POM reference
    /// - <properties> for version interpolation (e.g., ${spring.version})
    /// - <profiles> for conditional dependencies
    /// - <scope> (compile, provided, runtime, test, system, import)
    fn parse_pom_xml(&self, content: &str) -> Result<MavenManifest> { ... }

    /// Use OWASP Dependency-Check or OSS Index for vulnerability scanning.
    async fn audit_maven(&self, deps: &[LockedDep]) -> Result<Vec<SecurityAdvisoryInfo>> { ... }
}
```

### 3.7 Gradle Parser (Java/Kotlin)

**Manifest:** `build.gradle` (Groovy DSL) or `build.gradle.kts` (Kotlin DSL)
**Lock file:** `gradle.lockfile` (optional, opt-in)
**Constraint syntax:** Similar to Maven but with Gradle-specific richVersion: `strictly`, `require`, `prefer`, `reject`
**Special features:** Version catalogs (`libs.versions.toml`), platform/BOM dependencies, configuration inheritance

```rust
pub struct GradleParser;

impl GradleParser {
    /// Parse build.gradle / build.gradle.kts dependency declarations.
    /// NOTE: Gradle files are executable code (Groovy/Kotlin). We parse
    /// common patterns via regex/AST, not full evaluation.
    /// Handles:
    /// - `implementation("group:artifact:version")`
    /// - `testImplementation(libs.junit)` (version catalog reference)
    /// - `platform("group:bom:version")` (BOM imports)
    fn parse_build_gradle(&self, content: &str, is_kotlin_dsl: bool) -> Result<Vec<DependencyEntry>> { ... }

    /// Parse libs.versions.toml (Gradle version catalog).
    fn parse_version_catalog(&self, content: &str) -> Result<GradleVersionCatalog> { ... }

    /// Parse gradle.lockfile.
    fn parse_gradle_lockfile(&self, content: &str) -> Result<Vec<LockedDep>> { ... }
}
```

### 3.8 Docker Parser

**Manifests:** `Dockerfile`, `docker-compose.yml` / `compose.yml`
**Constraint syntax:** Docker tags (semver-like or arbitrary strings: `latest`, `3.19-alpine`, `sha256:abc...`)
**Special features:** Multi-stage builds, build args for version parameterization, compose service images

```rust
pub struct DockerParser;

impl DockerParser {
    /// Parse Dockerfile FROM directives:
    /// - `FROM node:20-alpine AS builder`
    /// - `FROM --platform=linux/amd64 rust:1.75`
    /// - `FROM ${BASE_IMAGE}:${VERSION}` (ARG interpolation)
    /// Multi-stage builds produce multiple base image dependencies.
    fn parse_dockerfile(&self, content: &str) -> Result<Vec<DependencyEntry>> { ... }

    /// Parse docker-compose.yml / compose.yml image references:
    /// - `image: postgres:16`
    /// - `build: .` (references a Dockerfile)
    fn parse_compose_file(&self, content: &str) -> Result<Vec<DependencyEntry>> { ... }

    /// Check Docker Hub / registry for image CVEs using Trivy or Grype data.
    async fn audit_docker(&self, images: &[DependencyEntry]) -> Result<Vec<SecurityAdvisoryInfo>> { ... }
}
```

### 3.9 System Parser

**Sources:** Shell command output (`apt list --installed`, `brew list --versions`, `choco list`, `winget list`)
**Detection:** Invoked when the agent runs package install/update commands via MCP shell execution.

```rust
pub struct SystemParser;

impl SystemParser {
    /// Detect system package manager from the OS.
    fn detect_package_manager(&self) -> Option<SystemPackageManager> { ... }

    /// Parse installed package list from command output.
    fn parse_installed_packages(&self, output: &str, manager: SystemPackageManager)
        -> Result<Vec<DependencyEntry>> { ... }

    /// Detect system package install/update/remove from shell command strings.
    /// Matches patterns like: `apt install foo`, `brew upgrade bar`, `pip install baz`.
    fn detect_package_command(&self, command: &str) -> Option<SystemPackageAction> { ... }
}

#[derive(Debug, Clone, Copy)]
pub enum SystemPackageManager {
    Apt, Yum, Dnf, Pacman, Brew, Choco, Winget, Scoop,
}
```

---

## 4. Event Capture Pipeline

### 4.1 File Watcher Integration

The dependency tracker hooks into TimeWarp's existing MCP middleware (see `RUST_CRATE_ARCHITECTURE.md`, `mcp_middleware.rs`). When a `FileWrite` event touches a manifest or lock file, the dependency tracker is invoked:

```
FileWrite event for "Cargo.toml"
  │
  ▼
DependencyTracker.on_file_change(path, old_content, new_content)
  │
  ├── Identify ecosystem: Cargo (from filename)
  ├── Parse old manifest → Vec<DependencyEntry>
  ├── Parse new manifest → Vec<DependencyEntry>
  ├── Diff → Vec<DepEventType>
  ├── For each DepEventType:
  │     ├── Record as TimeWarp Event (append to DAG)
  │     ├── Run conflict detection
  │     └── If conflict found → emit ConflictDetected event
  └── If lock file also changed:
        ├── Parse old lock → Vec<LockedDep>
        ├── Parse new lock → Vec<LockedDep>
        └── Emit LockFileSync event
```

### 4.2 Command Interception

When the agent runs dependency management commands via MCP shell execution, the tracker intercepts them:

```rust
/// Commands that trigger dependency tracking.
const TRACKED_COMMANDS: &[(&str, Ecosystem)] = &[
    // Cargo
    ("cargo add", Ecosystem::Cargo),
    ("cargo remove", Ecosystem::Cargo),
    ("cargo update", Ecosystem::Cargo),
    ("cargo audit", Ecosystem::Cargo),
    // npm
    ("npm install", Ecosystem::Npm),
    ("npm uninstall", Ecosystem::Npm),
    ("npm update", Ecosystem::Npm),
    ("npm audit", Ecosystem::Npm),
    ("yarn add", Ecosystem::Npm),
    ("yarn remove", Ecosystem::Npm),
    ("pnpm add", Ecosystem::Npm),
    ("pnpm remove", Ecosystem::Npm),
    // Python
    ("pip install", Ecosystem::Python),
    ("pip uninstall", Ecosystem::Python),
    ("poetry add", Ecosystem::Python),
    ("poetry remove", Ecosystem::Python),
    ("pipenv install", Ecosystem::Python),
    // Go
    ("go get", Ecosystem::Go),
    ("go mod tidy", Ecosystem::Go),
    // Maven/Gradle
    ("mvn dependency:", Ecosystem::Maven),
    ("./gradlew dependencies", Ecosystem::Gradle),
    // Docker
    ("docker pull", Ecosystem::Docker),
    ("docker build", Ecosystem::Docker),
    // System
    ("apt install", Ecosystem::System),
    ("apt-get install", Ecosystem::System),
    ("brew install", Ecosystem::System),
    ("choco install", Ecosystem::System),
    ("winget install", Ecosystem::System),
];
```

### 4.3 Periodic Audit Scanning

A background task periodically checks for new security advisories:

```rust
/// Configuration for periodic dependency auditing.
pub struct AuditConfig {
    /// How often to check for new advisories (default: every 6 hours).
    pub interval_hours: u64,
    /// Which ecosystems to audit.
    pub ecosystems: Vec<Ecosystem>,
    /// Minimum severity to report (default: Low — report everything).
    pub min_severity: AdvisorySeverity,
    /// Whether to auto-create events for new advisories.
    pub auto_record_events: bool,
}
```

---

## 5. Conflict Detection Engine

### 5.1 Conflict Model

```rust
/// A detected dependency conflict.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyConflict {
    /// Unique ID for tracking resolution.
    pub conflict_id: String,

    /// Type of conflict detected.
    pub conflict_type: ConflictType,

    /// Severity of the conflict.
    pub severity: ConflictSeverity,

    /// Human-readable description.
    pub description: String,

    /// The packages involved in the conflict.
    pub involved_packages: Vec<ConflictParticipant>,

    /// When the conflict was first detected.
    pub detected_at: DateTime<Utc>,

    /// The TimeWarp event that introduced this conflict.
    pub introducing_event_id: Option<Uuid>,

    /// Suggested resolutions (ordered by preference).
    pub suggested_resolutions: Vec<ConflictResolution>,

    /// Current status.
    pub status: ConflictStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConflictType {
    /// Two direct deps require incompatible versions of a transitive dep.
    VersionIncompatibility,
    /// A -> B -> C and A -> D -> C with different C versions (diamond).
    DiamondDependency,
    /// npm peer dependency not satisfied by installed version.
    PeerDependencyMismatch,
    /// Cargo feature flags that are mutually exclusive or incompatible.
    FeatureFlagConflict,
    /// Dependency requires a platform/OS not available in current environment.
    PlatformIncompatibility,
    /// Two deps have incompatible license requirements.
    LicenseIncompatibility,
    /// A required dependency has been deprecated with no replacement.
    DeprecatedWithNoReplacement,
    /// Lock file is out of sync with manifest.
    LockFileDesync,
    /// Duplicate package at different versions in the tree.
    DuplicateVersions,
    /// Circular dependency detected.
    CircularDependency,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConflictSeverity {
    /// Informational — may not cause issues.
    Info,
    /// Warning — may cause issues in some configurations.
    Warning,
    /// Error — will cause build/runtime failures.
    Error,
    /// Critical — security vulnerability in conflict path.
    Critical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConflictStatus {
    /// Conflict is active and unresolved.
    Active,
    /// User has acknowledged the conflict.
    Acknowledged,
    /// Conflict has been resolved.
    Resolved,
    /// Conflict was a false positive.
    Dismissed,
}

/// A package participating in a conflict.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictParticipant {
    pub name: String,
    pub version: Option<SemVer>,
    pub constraint: Option<VersionConstraint>,
    pub role: ParticipantRole,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParticipantRole {
    /// The package requiring the conflicting version.
    Requirer,
    /// The package whose version is contested.
    Contested,
    /// The package providing a conflicting peer dep.
    PeerProvider,
}
```

### 5.2 Detection Algorithms

#### 5.2.1 Version Incompatibility Detection

```
ALGORITHM: DetectVersionIncompatibilities(graph: DependencyGraph)

1. Build reverse dependency map: for each package P,
   collect all (requirer, constraint) pairs where requirer depends on P.

2. For each package P with 2+ requirers:
   a. Collect all constraints C1, C2, ..., Cn on P.
   b. Compute the intersection of all constraint ranges:
      intersection = C1 ∩ C2 ∩ ... ∩ Cn
   c. If intersection is empty:
      → CONFLICT: VersionIncompatibility
      → Participants: all requirers + P
      → Severity: Error

3. Special case for npm/Cargo "allows duplicates":
   - npm can install multiple versions of the same package in nested node_modules.
   - Cargo can have multiple versions via features or path overrides.
   - If the ecosystem supports deduplication, downgrade severity to Warning.
```

#### 5.2.2 Diamond Dependency Detection

```
ALGORITHM: DetectDiamondDependencies(graph: DependencyGraph)

1. For each package P that appears as a transitive dep of 2+ direct deps:
   a. Trace all paths from each root to P.
   b. Collect the resolved version of P via each path.
   c. If different versions are resolved along different paths:
      → CONFLICT: DiamondDependency
      → Participants: the two direct deps + P at each version
      → Severity:
        - If major versions differ: Error
        - If minor versions differ: Warning
        - If patch versions differ: Info

2. Optimization: Use DFS with memoization. Mark visited nodes to avoid
   re-traversing shared subgraphs.
```

#### 5.2.3 Peer Dependency Mismatch Detection (npm-specific)

```
ALGORITHM: DetectPeerMismatches(manifest: NpmManifest, lock: Vec<LockedDep>)

1. For each package P that declares peerDependencies:
   a. For each peer dep (name: N, constraint: C):
      i.  Find the resolved version V of N in the lock file.
      ii. If V does not satisfy C:
          → CONFLICT: PeerDependencyMismatch
          → Participants: P (requirer), N (contested)
          → Severity: Warning (npm 7+ auto-installs peers, but with warnings)
      iii. Check peerDependenciesMeta for optional markers.
           If optional = true and N is not installed, skip.

2. Cross-check: If two packages both declare peer deps on the same
   package with incompatible ranges:
   → Severity: Error (no version can satisfy both)
```

#### 5.2.4 Feature Flag Conflict Detection (Cargo-specific)

```
ALGORITHM: DetectFeatureConflicts(manifest: CargoManifest)

1. Build a feature dependency map:
   For each feature F, collect all (dep_name, dep_features) it enables.

2. For each pair of features (F1, F2):
   a. If F1 and F2 are both default or commonly co-enabled:
   b. Collect all deps they share.
   c. For each shared dep D:
      i.  Features_F1 = features enabled on D by F1
      ii. Features_F2 = features enabled on D by F2
      iii. Check if the union Features_F1 ∪ Features_F2 triggers any
           known-incompatible feature combinations in D.
      iv. Check if F1 enables D with one version constraint and F2
          with a different constraint (via optional deps).

3. This is a heuristic check — Cargo unifies features at build time,
   which usually works, but can cause surprising behavior.
   Severity: Info or Warning.
```

#### 5.2.5 Lock File Desynchronization Detection

```
ALGORITHM: DetectLockDesync(manifest, lock_file)

1. Parse manifest → Vec<DependencyEntry> (declared deps with constraints)
2. Parse lock → Vec<LockedDep> (resolved deps with exact versions)

3. For each declared dep D in manifest:
   a. Find D in lock file.
   b. If D is not in lock file:
      → CONFLICT: LockFileDesync (dep declared but not locked)
   c. If D's locked version does not satisfy D's constraint:
      → CONFLICT: LockFileDesync (lock out of date after constraint change)

4. For each locked dep L:
   a. If L is a direct dep but not in manifest:
      → CONFLICT: LockFileDesync (orphaned lock entry)

5. Severity: Warning (build may work with stale lock, but is non-deterministic)
```

#### 5.2.6 License Incompatibility Detection

```
ALGORITHM: DetectLicenseIncompatibilities(graph: DependencyGraph, policy: LicensePolicy)

1. For each node N in the graph:
   a. If N.license is in policy.banned_licenses:
      → CONFLICT: LicenseIncompatibility
      → Severity: Error
   b. If N.license is in policy.warn_licenses:
      → Severity: Warning
   c. Copyleft propagation check:
      If N has a copyleft license (GPL, AGPL) and is a dependency of
      a non-copyleft project, flag the propagation.
      → Severity: Error for AGPL, Warning for LGPL, Info for MPL-2.0

2. License policy configuration:
   [timewarp.dependency.license_policy]
   allowed = ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC"]
   banned = ["AGPL-3.0", "GPL-3.0"]  # unless project is also GPL
   warn = ["LGPL-2.1", "MPL-2.0", "EUPL-1.2"]
```

---

## 6. Resolution Strategies

### 6.1 Resolution Model

```rust
/// A proposed or applied resolution for a dependency conflict.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictResolution {
    /// Unique resolution ID.
    pub resolution_id: String,

    /// ID of the conflict being resolved.
    pub conflict_id: String,

    /// Type of resolution.
    pub strategy: ResolutionStrategy,

    /// Human-readable explanation of what this resolution does.
    pub explanation: String,

    /// Confidence score (0.0-1.0) that this resolution is correct.
    pub confidence: f64,

    /// Whether this resolution was applied automatically or manually.
    pub applied_by: ResolutionAppliedBy,

    /// The file changes this resolution would make.
    pub file_changes: Vec<ResolutionFileChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "strategy", rename_all = "snake_case")]
pub enum ResolutionStrategy {
    /// Update the version constraint to resolve the conflict.
    UpdateConstraint {
        package: String,
        old_constraint: VersionConstraint,
        new_constraint: VersionConstraint,
    },

    /// Pin to a specific version that satisfies all requirers.
    PinVersion {
        package: String,
        version: SemVer,
    },

    /// Add an override/resolution to force a specific version.
    /// Cargo: [patch], npm: "overrides", Yarn: "resolutions"
    AddOverride {
        package: String,
        forced_version: SemVer,
    },

    /// Replace the conflicting package with an alternative.
    ReplacePackage {
        old_package: String,
        new_package: String,
        new_version: VersionConstraint,
    },

    /// Remove the package causing the conflict.
    RemovePackage {
        package: String,
    },

    /// Enable or disable specific features to resolve the conflict (Cargo).
    AdjustFeatures {
        package: String,
        enable: Vec<String>,
        disable: Vec<String>,
    },

    /// Rollback to the last known good dependency state.
    RollbackToSnapshot {
        target_event_id: Uuid,
        target_snapshot_id: String,
    },

    /// Accept the conflict as-is (acknowledge and suppress future warnings).
    Accept {
        reason: String,
        expiry: Option<DateTime<Utc>>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResolutionAppliedBy {
    /// System auto-resolved with explanation.
    Automatic,
    /// User selected from suggestions.
    UserSelected,
    /// User provided custom resolution.
    UserCustom,
    /// Rolled back to a previous state.
    Rollback,
}

/// A file change that a resolution would make.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolutionFileChange {
    pub path: PathBuf,
    pub change_type: FileChangeType,
    /// Unified diff of the change.
    pub diff: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileChangeType {
    Modify,
    Create,
    Delete,
}
```

### 6.2 Automatic Resolution Logic

```
ALGORITHM: AutoResolve(conflict: DependencyConflict) -> Option<ConflictResolution>

Input: A detected conflict with its type and participants.
Output: A resolution if one can be determined with high confidence, or None.

1. MATCH conflict.conflict_type:

   CASE VersionIncompatibility:
     a. Compute the intersection of all constraints on the contested package.
     b. If intersection is non-empty:
        → Resolution: PinVersion to the highest version in the intersection.
        → Confidence: 0.9
     c. If intersection is empty but a newer version of one requirer exists
        that relaxes its constraint:
        → Resolution: UpdateConstraint on the requirer.
        → Confidence: 0.7
     d. If Sonatype recommends a version:
        → Resolution: PinVersion to Sonatype recommendation.
        → Confidence: 0.8

   CASE DiamondDependency:
     a. Check if the contested package has a version satisfying all paths.
     b. If yes → PinVersion. Confidence: 0.9
     c. If no → suggest UpdateConstraint on the most flexible requirer. Confidence: 0.5

   CASE PeerDependencyMismatch:
     a. If the peer dep range is outdated (newer peer version satisfies):
        → UpdateConstraint on the package with the outdated peer range. Confidence: 0.7
     b. If the installed version is outdated:
        → PinVersion to a version satisfying all peer ranges. Confidence: 0.8

   CASE FeatureFlagConflict:
     a. If disabling one feature resolves the conflict without losing
        needed functionality:
        → AdjustFeatures. Confidence: 0.6
     b. Otherwise → present to user. Confidence: 0.0

   CASE LockFileDesync:
     a. → Run lock file regeneration command.
        Cargo: `cargo update`, npm: `npm install`, Poetry: `poetry lock`
     b. Confidence: 0.95

   CASE LicenseIncompatibility:
     a. Search for an alternative package with compatible license.
     b. If found → ReplacePackage. Confidence: 0.5
     c. Otherwise → present to user. Confidence: 0.0

2. If confidence < threshold (default 0.7), return None (require manual resolution).
3. If confidence >= threshold, apply automatically and emit ConflictResolved event.
```

### 6.3 Rollback to Last Known Good State

```
ALGORITHM: RollbackDependencies(target_event_id: Uuid)

1. Find the target event in the TimeWarp DAG.
2. Get the snapshot_id from that event.
3. From the snapshot's file_tree, extract the manifest and lock file blobs.
4. Restore those specific files to the workspace:
   - Write the old Cargo.toml / package.json / etc. from the blob store.
   - Write the old Cargo.lock / package-lock.json / etc. from the blob store.
5. Record a DepEvent::ConflictResolved with strategy = RollbackToSnapshot.
6. Run the ecosystem's install/sync command to restore node_modules/target/etc.
7. Verify: re-run conflict detection on the restored state.
```

### 6.4 Dependency Graph Diffing Between Timeline Points

```
ALGORITHM: DiffDependencyGraphs(event_a: Uuid, event_b: Uuid) -> GraphDiff

1. Retrieve DependencyGraph at event_a (from snapshot or cached graph).
2. Retrieve DependencyGraph at event_b.

3. Compute diff:
   a. Added nodes: in B but not in A.
   b. Removed nodes: in A but not in B.
   c. Updated nodes: in both, but version changed.
   d. Added edges: dependency relationship in B but not in A.
   e. Removed edges: in A but not in B.

4. Compute impact metrics:
   a. Total deps changed.
   b. Direct deps changed.
   c. Security posture change (advisories gained/resolved).
   d. License changes.
   e. Trust score changes (Sonatype).

Output:
  GraphDiff {
    added_packages: Vec<DependencyNode>,
    removed_packages: Vec<DependencyNode>,
    updated_packages: Vec<(DependencyNode, DependencyNode)>, // (old, new)
    added_edges: Vec<DependencyEdge>,
    removed_edges: Vec<DependencyEdge>,
    security_delta: SecurityDelta,
    license_delta: LicenseDelta,
    trust_score_delta: f64,
  }
```

---

## 7. Sonatype Integration

### 7.1 Package URL (PURL) Construction

Each dependency must be converted to a PURL for Sonatype API calls:

```rust
impl DependencyEntry {
    /// Convert to Package URL (PURL) format for Sonatype API.
    ///
    /// Format: pkg:<ecosystem>/<namespace>/<name>@<version>
    ///
    /// Examples:
    ///   Cargo:  pkg:cargo/serde@1.0.203
    ///   npm:    pkg:npm/@types/node@20.11.0
    ///   PyPI:   pkg:pypi/requests@2.31.0
    ///   Go:     pkg:golang/github.com/gorilla/mux@1.8.1
    ///   Maven:  pkg:maven/org.springframework/spring-core@6.1.4
    ///   Docker: pkg:docker/library/node@20-alpine
    pub fn to_purl(&self) -> String {
        match self.ecosystem {
            Ecosystem::Cargo => format!("pkg:cargo/{}@{}", self.name, self.version_string()),
            Ecosystem::Npm => {
                if self.name.starts_with('@') {
                    // Scoped package: @scope/name
                    let parts: Vec<&str> = self.name.splitn(2, '/').collect();
                    format!("pkg:npm/{}/{}@{}", parts[0], parts[1], self.version_string())
                } else {
                    format!("pkg:npm/{}@{}", self.name, self.version_string())
                }
            }
            Ecosystem::Python => format!("pkg:pypi/{}@{}", self.name, self.version_string()),
            Ecosystem::Go => format!("pkg:golang/{}@{}", self.name, self.version_string()),
            Ecosystem::Maven => {
                // Maven names are "groupId:artifactId"
                let parts: Vec<&str> = self.name.splitn(2, ':').collect();
                if parts.len() == 2 {
                    format!("pkg:maven/{}/{}@{}", parts[0], parts[1], self.version_string())
                } else {
                    format!("pkg:maven/{}@{}", self.name, self.version_string())
                }
            }
            Ecosystem::Docker => format!("pkg:docker/{}@{}", self.name, self.version_string()),
            _ => format!("pkg:generic/{}@{}", self.name, self.version_string()),
        }
    }
}
```

### 7.2 Sonatype API Usage

```rust
/// Sonatype integration for dependency intelligence.
pub struct SonatypeClient {
    /// HTTP client for Sonatype API calls.
    client: reqwest::Client,
    /// Cache of recent lookups to avoid redundant API calls.
    cache: Arc<RwLock<HashMap<String, SonatypeReport>>>,
    /// Cache TTL.
    cache_ttl_hours: u64,
}

impl SonatypeClient {
    /// Get detailed component analysis using getComponentVersion.
    ///
    /// Returns quality, license, and security data for specific versions.
    /// Call this when:
    /// - A dependency is first added (to check initial quality)
    /// - A DepUpdate event occurs (to compare old vs new version quality)
    /// - A SecurityAdvisory event is created (to get full advisory details)
    pub async fn get_component_version(
        &self,
        purls: &[String],
    ) -> Result<Vec<SonatypeReport>> { ... }

    /// Get recommended versions using getRecommendedComponentVersions.
    ///
    /// Returns top versions ranked by Developer Trust Score.
    /// Call this when:
    /// - Auto-resolving a version conflict (pick the recommended version)
    /// - User runs `tw dep recommend <package>`
    /// - Periodic health check suggests upgrades
    pub async fn get_recommended_versions(
        &self,
        purls: &[String],
    ) -> Result<Vec<SonatypeRecommendation>> { ... }

    /// Get latest version analysis using getLatestComponentVersion.
    ///
    /// Returns the latest version's quality data.
    /// Call this during periodic audits to check if updates are available.
    pub async fn get_latest_version(
        &self,
        purls: &[String],
    ) -> Result<Vec<SonatypeReport>> { ... }
}

/// Sonatype analysis report for a component version.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SonatypeReport {
    pub purl: String,
    pub developer_trust_score: f64,      // 0-10 scale
    pub security_issues: Vec<SecurityAdvisoryInfo>,
    pub license_info: SonatypeLicenseInfo,
    pub quality_metrics: SonatypeQualityMetrics,
    pub fetched_at: DateTime<Utc>,
}

/// Sonatype version recommendation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SonatypeRecommendation {
    pub purl: String,
    pub recommended_version: SemVer,
    pub trust_score: f64,
    pub reason: String,
}

/// License information from Sonatype.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SonatypeLicenseInfo {
    pub declared_license: Option<String>,
    pub observed_licenses: Vec<String>,
    pub license_threat_level: LicenseThreatLevel,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LicenseThreatLevel { None, Low, Medium, High }

/// Quality metrics from Sonatype.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SonatypeQualityMetrics {
    pub age_days: Option<u64>,
    pub popularity_rank: Option<u64>,
    pub release_frequency_days: Option<f64>,
    pub is_deprecated: bool,
}
```

### 7.3 Trust Score Timeline

The Sonatype Developer Trust Score is tracked over time for each dependency:

```rust
/// A trust score data point for timeline display.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustScorePoint {
    pub package_name: String,
    pub ecosystem: Ecosystem,
    pub version: SemVer,
    pub trust_score: f64,
    pub recorded_at: DateTime<Utc>,
    /// The TimeWarp event that triggered this score recording.
    pub event_id: Uuid,
}
```

### 7.4 Vulnerability Timeline

Track the full lifecycle of a vulnerability:

```
Discovery → Patch Available → Project Updated → Verified Fixed

Timeline events:
  T1: SecurityAdvisory detected (CVE-2024-12345 affects lodash@4.17.20)
  T2: Patch available (lodash@4.17.21 fixes CVE-2024-12345)
  T3: DepUpdate (lodash 4.17.20 → 4.17.21)
  T4: SecurityAdvisory resolved (verified lodash@4.17.21 is not affected)
```

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VulnerabilityLifecycle {
    pub advisory: SecurityAdvisoryInfo,
    pub discovered_at: DateTime<Utc>,
    pub discovered_event_id: Uuid,
    pub patch_available_at: Option<DateTime<Utc>>,
    pub patched_version: Option<SemVer>,
    pub updated_at: Option<DateTime<Utc>>,
    pub updated_event_id: Option<Uuid>,
    pub verified_at: Option<DateTime<Utc>>,
    /// Days between discovery and resolution.
    pub resolution_time_days: Option<f64>,
}
```

---

## 8. Timeline Visual Representation

### 8.1 Dependency Track on the TimeWarp Bar

The TimeWarp Bar (see `TIMEWARP_BAR_UI_UX_SPEC.md`) gains a new **Dependency Track** lane that renders alongside existing event tracks:

```
MAIN TRACK:  ●──────●──────●──────●──────●──────●──────●──────●
             E1     E2     E3     E4     E5     E6     E7     E8
             init   write  write  build  test   write  build  test

DEP TRACK:   ◆━━━━━━━━━━━━━◇━━━━━━━━━━━━━━━━━━━◆━━━━━━━━━━━━━━━▲
             D1            D2                    D3              D4
             +serde        ^express              lock sync       CVE!
             1.0→1.2       4.18→4.19                             HIGH
```

### 8.2 Node Visual Language

Each dependency event type has a distinct visual representation:

| Event Type | Shape | Color | Icon | Example |
|---|---|---|---|---|
| DepAdd | Diamond ◆ | Green `#22c55e` | `+` | `+serde 1.0` |
| DepRemove | Diamond ◆ | Red `#ef4444` | `-` | `-lodash` |
| DepUpdate | Diamond ◇ | Blue `#3b82f6` | `↑` | `↑express 4.18→4.19` |
| DepFeatureChange | Diamond ◇ | Purple `#a855f7` | `⚙` | `⚙ serde +derive` |
| LockFileSync | Square ■ | Gray `#6b7280` | `🔒` | `lock sync (47 changes)` |
| SecurityAdvisory | Triangle ▲ | Severity color | `⚠` | `CVE-2024-1234 HIGH` |
| LicenseChange | Circle ○ | Yellow `#eab308` | `§` | `MIT → Apache-2.0` |
| DeprecationWarning | Circle ○ | Orange `#f97316` | `⚡` | `deprecated: use X` |
| BreakingChange | Hexagon ⬡ | Red `#dc2626` | `!` | `!breaking: v2.0` |
| ConflictDetected | Octagon ⬢ | Red pulsing | `✕` | `conflict: peer mismatch` |
| ConflictResolved | Octagon ⬢ | Green | `✓` | `resolved: pin v1.2.3` |

### 8.3 Severity Color Scale for Advisories

```
SEVERITY     COLOR         BACKGROUND    BORDER       PULSE
─────────────────────────────────────────────────────────────
None         #6b7280       transparent   #6b7280      no
Low          #22c55e       #f0fdf4       #22c55e      no
Medium       #eab308       #fefce8       #eab308      no
High         #f97316       #fff7ed       #f97316      slow
Critical     #ef4444       #fef2f2       #ef4444      fast
```

### 8.4 Dependency Change Tooltip

When hovering over a dependency event node:

```
┌─────────────────────────────────────────┐
│  ↑ express  4.18.2 → 4.19.0            │
│  ─────────────────────────────────────  │
│  Ecosystem:    npm                      │
│  Scope:        production               │
│  Type:         minor update             │
│  Manifest:     package.json             │
│                                         │
│  Trust Score:  8.2 / 10 (↑0.3)         │
│  License:      MIT (unchanged)          │
│  Advisories:   0 known                  │
│                                         │
│  Transitive changes: 12 packages        │
│  ┌─────────────────────────────────┐    │
│  │ + accepts@2.0.0                 │    │
│  │ ↑ body-parser 1.20.1→1.20.2    │    │
│  │ ↑ cookie 0.5.0→0.6.0           │    │
│  │ ... (+9 more)                   │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [View Full Diff]  [Revert]  [Details]  │
└─────────────────────────────────────────┘
```

### 8.5 Dependency Graph Mini-Visualization

At each timeline point, a collapsible mini-graph shows the dependency tree:

```
┌─ Dependency Graph at E7 ──────────────────────────────┐
│                                                        │
│  my-project                                            │
│  ├── serde 1.0.203                                     │
│  │   ├── serde_derive 1.0.203                          │
│  │   └── serde_json 1.0.117                            │
│  │       └── itoa 1.0.11                               │
│  ├── tokio 1.38.0                        ▲ CVE-HIGH    │
│  │   ├── pin-project-lite 0.2.14                       │
│  │   └── mio 0.8.11                                    │
│  ├── express 4.19.0                      ● trust:8.2   │
│  │   ├── body-parser 1.20.2                            │
│  │   └── cookie 0.6.0                                  │
│  └── requests 2.31.0                     ◆ deprecated  │
│      ├── urllib3 2.2.1                                  │
│      └── certifi 2024.2.2                              │
│                                                        │
│  Total: 47 packages │ 3 direct │ 44 transitive         │
│  Advisories: 1 HIGH │ 0 CRITICAL                       │
│  License: all MIT/Apache-2.0 compatible                 │
│                                                        │
│  [Full Graph]  [Compare with...]  [Export SBOM]         │
└────────────────────────────────────────────────────────┘
```

### 8.6 License Compliance Badge

A persistent badge in the status bar shows aggregate license health:

```
Status bar:
  ... │ Deps: 47 │ Advisories: 1⚠ │ License: ✓ Compatible │ Trust: 7.8/10 │ ...
```

---

## 9. Rust Crate Architecture

### 9.1 Module Layout

```
crates/timewarp/src/dependency/
├── mod.rs                    # Public API, DependencyTracker
├── models.rs                 # All data types from Section 2
├── conflict.rs               # Conflict detection engine (Section 5)
├── resolution.rs             # Resolution strategies (Section 6)
├── sonatype.rs               # Sonatype API client (Section 7)
├── graph.rs                  # DependencyGraph operations and diffing
├── parsers/
│   ├── mod.rs                # EcosystemParser trait
│   ├── cargo_parser.rs       # Rust/Cargo
│   ├── npm_parser.rs         # Node.js/npm/yarn/pnpm
│   ├── python_parser.rs      # Python/pip/poetry/pipenv
│   ├── go_parser.rs          # Go modules
│   ├── maven_parser.rs       # Java Maven
│   ├── gradle_parser.rs      # Java/Kotlin Gradle
│   ├── docker_parser.rs      # Docker/Compose
│   └── system_parser.rs      # OS packages
└── tests/
    ├── cargo_parser_tests.rs
    ├── npm_parser_tests.rs
    ├── python_parser_tests.rs
    ├── go_parser_tests.rs
    ├── conflict_tests.rs
    ├── resolution_tests.rs
    ├── graph_diff_tests.rs
    └── integration_tests.rs
```

### 9.2 DependencyTracker (Coordinator)

```rust
/// The main coordinator for dependency tracking.
///
/// Hooks into TimeWarp's MCP middleware to intercept file changes
/// and shell commands, delegates to ecosystem parsers, runs conflict
/// detection, and emits events to the TimeWarp event store.
pub struct DependencyTracker {
    /// Ecosystem parsers indexed by ecosystem.
    parsers: HashMap<Ecosystem, Box<dyn EcosystemParser>>,

    /// Conflict detection engine.
    conflict_engine: ConflictDetector,

    /// Resolution engine.
    resolution_engine: ResolutionEngine,

    /// Sonatype client for external intelligence.
    sonatype: Option<SonatypeClient>,

    /// Cached dependency graphs per ecosystem.
    graphs: Arc<RwLock<HashMap<Ecosystem, DependencyGraph>>>,

    /// Active conflicts.
    active_conflicts: Arc<RwLock<Vec<DependencyConflict>>>,

    /// Configuration.
    config: DependencyConfig,

    /// Reference to the TimeWarp event store for recording events.
    event_store: Arc<dyn EventStoreWriter>,
}

impl DependencyTracker {
    /// Called by MCP middleware when a file is written.
    pub async fn on_file_change(
        &self,
        path: &Path,
        old_content: Option<&str>,
        new_content: &str,
    ) -> Result<Vec<DepEventType>> { ... }

    /// Called by MCP middleware when a shell command is executed.
    pub async fn on_command_exec(
        &self,
        command: &str,
        exit_code: i32,
        stdout: &str,
    ) -> Result<Vec<DepEventType>> { ... }

    /// Run a full dependency audit across all detected ecosystems.
    pub async fn full_audit(&self) -> Result<AuditReport> { ... }

    /// Get the current dependency graph for an ecosystem.
    pub async fn get_graph(&self, ecosystem: Ecosystem) -> Result<DependencyGraph> { ... }

    /// Diff dependency graphs between two timeline points.
    pub async fn diff_graphs(
        &self,
        event_a: Uuid,
        event_b: Uuid,
        ecosystem: Ecosystem,
    ) -> Result<GraphDiff> { ... }

    /// Get all active conflicts.
    pub async fn get_conflicts(&self) -> Vec<DependencyConflict> { ... }

    /// Attempt to resolve a conflict.
    pub async fn resolve_conflict(
        &self,
        conflict_id: &str,
        resolution: ConflictResolution,
    ) -> Result<()> { ... }

    /// Rollback dependencies to a previous timeline point.
    pub async fn rollback_to(&self, event_id: Uuid) -> Result<()> { ... }
}
```

### 9.3 Dependencies (Cargo.toml additions)

```toml
# In crates/timewarp/Cargo.toml, add:

[dependencies]
# Manifest parsing
toml = "0.8"           # Cargo.toml, pyproject.toml, Pipfile
serde_json = "1.0"     # package.json, package-lock.json, Pipfile.lock
serde_yaml = "0.9"     # pnpm-lock.yaml, docker-compose.yml, gradle version catalog
quick-xml = "0.36"     # pom.xml

# Version parsing
semver = "1.0"         # Semantic versioning
pep440 = "0.2"         # Python PEP 440 versions (or custom parser)

# Security advisories
rustsec = "0.29"       # RustSec Advisory DB (for Cargo audit)

# HTTP client for Sonatype / registry APIs
reqwest = { version = "0.12", features = ["json"] }

# Graph algorithms (for conflict detection)
petgraph = "0.6"       # Dependency graph operations
```

---

## 10. Configuration

```toml
[timewarp.dependency]
# Enable dependency tracking
enabled = true

# Which ecosystems to track (auto-detected if not specified)
ecosystems = ["auto"]  # "auto" | explicit list

# Periodic audit interval (hours). 0 = disabled.
audit_interval_hours = 6

# Minimum advisory severity to record as an event
min_advisory_severity = "low"  # none | low | medium | high | critical

# Auto-resolve conflicts with confidence >= this threshold
auto_resolve_threshold = 0.7

# Record full dependency graph snapshots on every manifest change
snapshot_graphs = true

# License policy
[timewarp.dependency.license_policy]
mode = "allowlist"  # "allowlist" | "blocklist" | "warn_only"
allowed = ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "MPL-2.0"]
banned = ["AGPL-3.0-only", "GPL-3.0-only"]
warn = ["LGPL-2.1-only", "EUPL-1.2"]

# Sonatype integration
[timewarp.dependency.sonatype]
enabled = true
cache_ttl_hours = 24
# Trust score threshold for recommendations
min_trust_score = 5.0

# Visual settings for the timeline bar
[timewarp.dependency.ui]
# Show dependency track by default
show_track = true
# Show transitive changes in tooltips
show_transitive = true
# Maximum transitive deps to show in tooltip before "... +N more"
max_tooltip_transitive = 5
# Show trust scores on graph nodes
show_trust_scores = true
```

---

## 11. Testing Strategy

### 11.1 Unit Tests Per Parser

Each ecosystem parser has tests with real-world fixture files:

| Parser | Test Fixtures | Key Test Cases |
|---|---|---|
| Cargo | `Cargo.toml` (simple, workspace, target-cfg, git deps) | Feature parsing, workspace inheritance, cfg-gated deps |
| npm | `package.json` + lock files for npm/yarn/pnpm | Scoped packages, peer deps, workspaces, overrides |
| Python | `requirements.txt`, `pyproject.toml`, `Pipfile`, `poetry.lock` | PEP 440 constraints, extras, environment markers |
| Go | `go.mod`, `go.sum` | Replace directives, retract, indirect deps |
| Maven | `pom.xml` with parent, properties, profiles | Property interpolation, dependency management, BOMs |
| Gradle | `build.gradle`, `build.gradle.kts`, `libs.versions.toml` | Kotlin DSL parsing, version catalog refs |
| Docker | `Dockerfile`, `docker-compose.yml` | Multi-stage FROM, ARG interpolation, compose services |
| System | Shell output from apt, brew, choco | Package list parsing, command detection |

### 11.2 Conflict Detection Tests

- Version incompatibility: Two deps requiring `foo >=1.0,<2.0` and `foo >=2.0`.
- Diamond dependency: A->B->D@1.0, A->C->D@2.0.
- Peer mismatch: Package requires `react@^18` but `react@17.0.2` is installed.
- Feature conflict: Two Cargo features enable incompatible optional deps.
- Lock desync: Manifest updated but lock file not regenerated.
- License incompatibility: AGPL dep in an MIT project.

### 11.3 Resolution Tests

- Auto-resolve version conflict by finding satisfying version.
- Auto-resolve lock desync by regenerating lock file.
- Rollback to previous good state and verify manifest/lock restoration.
- Graph diff between two snapshots with known changes.

### 11.4 Integration Tests

- End-to-end: Write to `Cargo.toml` via MCP, verify events are captured.
- End-to-end: Run `npm install lodash` via MCP, verify DepAdd + LockFileSync events.
- Sonatype mock: Verify PURL construction and API call format.
- Timeline rendering: Verify dependency track nodes appear in correct positions.

---

## Appendix A: Version Constraint Compatibility Matrix

This table shows how version constraints map across ecosystems:

| Concept | Cargo | npm | Python (PEP 440) | Go | Maven |
|---|---|---|---|---|---|
| Exact | `=1.2.3` | `1.2.3` (save-exact) | `==1.2.3` | `v1.2.3` (MVS) | `[1.2.3]` |
| Caret (compatible) | `^1.2.3` (default) | `^1.2.3` (default) | `~=1.2` | N/A | N/A |
| Tilde (approximate) | `~1.2.3` | `~1.2.3` | `~=1.2.3` | N/A | N/A |
| Range | `>=1.0, <2.0` | `>=1.0.0 <2.0.0` | `>=1.0,<2.0` | N/A | `[1.0,2.0)` |
| Wildcard | `1.2.*` | `1.2.x` or `1.2.*` | `==1.2.*` | N/A | N/A |
| Latest | `*` | `*` or `latest` | N/A | `latest` | `LATEST` |
| Git/Path | `{ git = "..." }` | `github:user/repo` | `-e git+...` | `replace` | N/A |

## Appendix B: Sonatype PURL Format Examples

```
Cargo:   pkg:cargo/serde@1.0.203
npm:     pkg:npm/express@4.19.2
npm:     pkg:npm/%40types/node@20.11.0    (scoped: @types/node)
PyPI:    pkg:pypi/requests@2.31.0
Go:      pkg:golang/github.com/gorilla/mux@1.8.1
Maven:   pkg:maven/org.springframework/spring-core@6.1.4
Docker:  pkg:docker/library/node@20-alpine
```

## Appendix C: Advisory Database Sources

| Ecosystem | Advisory Database | Format | Update Frequency |
|---|---|---|---|
| Cargo | RustSec Advisory DB | TOML/Git | Real-time (Git push) |
| npm | GitHub Advisory Database (GHSA) | JSON API | Real-time |
| Python | PyPI Advisory DB + OSV | JSON API | Hourly |
| Go | Go Vulnerability Database (govulncheck) | JSON | Real-time |
| Maven | OSS Index (Sonatype) | REST API | Real-time |
| Docker | Trivy DB / Grype DB | OCI artifacts | Daily |
| All | NVD (NIST) | JSON API | Hourly |
| All | OSV.dev (unified) | REST API | Real-time |
