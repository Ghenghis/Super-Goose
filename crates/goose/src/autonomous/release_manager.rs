//! ReleaseManager — Semantic versioning, tag creation, and changelog generation.
//!
//! Parses and manipulates semantic version numbers, generates changelogs from
//! structured commit data, and produces release specifications.

use anyhow::{bail, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fmt;
use tracing::info;

/// A semantic version (major.minor.patch with optional pre-release).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SemVer {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
    pub pre_release: Option<String>,
}

impl SemVer {
    /// Create a new semver.
    pub fn new(major: u32, minor: u32, patch: u32) -> Self {
        Self {
            major,
            minor,
            patch,
            pre_release: None,
        }
    }

    /// Parse a version string (e.g., "1.2.3" or "1.2.3-beta.1").
    pub fn parse(version: &str) -> Result<Self> {
        let version = version.trim().trim_start_matches('v');

        let (version_part, pre_release) = if let Some(idx) = version.find('-') {
            (&version[..idx], Some(version[idx + 1..].to_string()))
        } else {
            (version, None)
        };

        let parts: Vec<&str> = version_part.split('.').collect();
        if parts.len() != 3 {
            bail!(
                "Invalid semver '{}': expected MAJOR.MINOR.PATCH",
                version
            );
        }

        let major = parts[0]
            .parse::<u32>()
            .map_err(|_| anyhow::anyhow!("Invalid major version: '{}'", parts[0]))?;
        let minor = parts[1]
            .parse::<u32>()
            .map_err(|_| anyhow::anyhow!("Invalid minor version: '{}'", parts[1]))?;
        let patch = parts[2]
            .parse::<u32>()
            .map_err(|_| anyhow::anyhow!("Invalid patch version: '{}'", parts[2]))?;

        Ok(Self {
            major,
            minor,
            patch,
            pre_release,
        })
    }

    /// Bump the major version (X.0.0).
    pub fn bump_major(&self) -> Self {
        Self {
            major: self.major + 1,
            minor: 0,
            patch: 0,
            pre_release: None,
        }
    }

    /// Bump the minor version (x.Y.0).
    pub fn bump_minor(&self) -> Self {
        Self {
            major: self.major,
            minor: self.minor + 1,
            patch: 0,
            pre_release: None,
        }
    }

    /// Bump the patch version (x.y.Z).
    pub fn bump_patch(&self) -> Self {
        Self {
            major: self.major,
            minor: self.minor,
            patch: self.patch + 1,
            pre_release: None,
        }
    }

    /// Set a pre-release tag.
    pub fn with_pre_release(mut self, pre: impl Into<String>) -> Self {
        self.pre_release = Some(pre.into());
        self
    }

    /// Return the version string without 'v' prefix.
    pub fn to_version_string(&self) -> String {
        if let Some(ref pre) = self.pre_release {
            format!("{}.{}.{}-{}", self.major, self.minor, self.patch, pre)
        } else {
            format!("{}.{}.{}", self.major, self.minor, self.patch)
        }
    }

    /// Return the version string with 'v' prefix (for git tags).
    pub fn to_tag(&self) -> String {
        format!("v{}", self.to_version_string())
    }
}

impl fmt::Display for SemVer {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_version_string())
    }
}

impl PartialOrd for SemVer {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for SemVer {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.major
            .cmp(&other.major)
            .then(self.minor.cmp(&other.minor))
            .then(self.patch.cmp(&other.patch))
    }
}

/// The type of version bump.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BumpType {
    Major,
    Minor,
    Patch,
}

impl fmt::Display for BumpType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BumpType::Major => write!(f, "major"),
            BumpType::Minor => write!(f, "minor"),
            BumpType::Patch => write!(f, "patch"),
        }
    }
}

/// A commit entry for changelog generation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangelogEntry {
    /// Commit hash (short).
    pub hash: String,
    /// Commit message (first line).
    pub message: String,
    /// Author name.
    pub author: String,
    /// Category (feat, fix, docs, etc.).
    pub category: String,
    /// When the commit was made.
    pub date: DateTime<Utc>,
}

impl ChangelogEntry {
    pub fn new(
        hash: impl Into<String>,
        message: impl Into<String>,
        author: impl Into<String>,
    ) -> Self {
        let message = message.into();
        let category = Self::categorize(&message);
        Self {
            hash: hash.into(),
            message,
            author: author.into(),
            category,
            date: Utc::now(),
        }
    }

    /// Categorize a commit message based on conventional commit prefixes.
    fn categorize(message: &str) -> String {
        let lower = message.to_lowercase();
        if lower.starts_with("feat") {
            "Features".into()
        } else if lower.starts_with("fix") {
            "Bug Fixes".into()
        } else if lower.starts_with("docs") {
            "Documentation".into()
        } else if lower.starts_with("test") {
            "Tests".into()
        } else if lower.starts_with("refactor") {
            "Refactoring".into()
        } else if lower.starts_with("perf") {
            "Performance".into()
        } else if lower.starts_with("ci") || lower.starts_with("build") {
            "Build/CI".into()
        } else if lower.starts_with("chore") {
            "Chores".into()
        } else {
            "Other".into()
        }
    }
}

/// A complete release specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReleaseSpec {
    pub version: SemVer,
    pub previous_version: Option<SemVer>,
    pub changelog: String,
    pub entries: Vec<ChangelogEntry>,
    pub created_at: DateTime<Utc>,
    pub tag_name: String,
}

/// Manages release operations.
pub struct ReleaseManager {
    /// Current version.
    current_version: SemVer,
    /// Release history.
    releases: Vec<ReleaseSpec>,
}

impl ReleaseManager {
    /// Create a new release manager with the given current version.
    pub fn new(current_version: SemVer) -> Self {
        Self {
            current_version,
            releases: Vec::new(),
        }
    }

    /// Parse and create from a version string.
    pub fn from_version_str(version: &str) -> Result<Self> {
        let ver = SemVer::parse(version)?;
        Ok(Self::new(ver))
    }

    /// Get the current version.
    pub fn current_version(&self) -> &SemVer {
        &self.current_version
    }

    /// Bump the version.
    pub fn bump(&mut self, bump_type: BumpType) -> SemVer {
        let new_version = match bump_type {
            BumpType::Major => self.current_version.bump_major(),
            BumpType::Minor => self.current_version.bump_minor(),
            BumpType::Patch => self.current_version.bump_patch(),
        };
        info!(
            from = %self.current_version,
            to = %new_version,
            bump = %bump_type,
            "Bumped version"
        );
        self.current_version = new_version.clone();
        new_version
    }

    /// Generate a changelog from commit entries.
    pub fn generate_changelog(
        &self,
        version: &SemVer,
        entries: &[ChangelogEntry],
    ) -> String {
        let mut changelog = format!("## {} ({})\n\n", version.to_tag(), Utc::now().format("%Y-%m-%d"));

        // Group entries by category
        let mut categories: std::collections::BTreeMap<String, Vec<&ChangelogEntry>> =
            std::collections::BTreeMap::new();
        for entry in entries {
            categories
                .entry(entry.category.clone())
                .or_default()
                .push(entry);
        }

        for (category, entries) in &categories {
            changelog.push_str(&format!("### {}\n\n", category));
            for entry in entries {
                changelog.push_str(&format!(
                    "- {} ({}) — {}\n",
                    entry.message, entry.hash, entry.author
                ));
            }
            changelog.push('\n');
        }

        changelog
    }

    /// Create a release specification.
    pub fn create_release(
        &mut self,
        bump_type: BumpType,
        entries: Vec<ChangelogEntry>,
    ) -> ReleaseSpec {
        let previous = self.current_version.clone();
        let new_version = self.bump(bump_type);
        let changelog = self.generate_changelog(&new_version, &entries);

        let spec = ReleaseSpec {
            version: new_version.clone(),
            previous_version: Some(previous),
            changelog,
            entries,
            created_at: Utc::now(),
            tag_name: new_version.to_tag(),
        };

        self.releases.push(spec.clone());
        spec
    }

    /// Get release history.
    pub fn releases(&self) -> &[ReleaseSpec] {
        &self.releases
    }

    /// Determine bump type from commit entries (conventional commits).
    pub fn suggest_bump_type(entries: &[ChangelogEntry]) -> BumpType {
        let has_breaking = entries.iter().any(|e| {
            e.message.contains("BREAKING CHANGE") || e.message.contains("!")
        });

        if has_breaking {
            return BumpType::Major;
        }

        let has_features = entries
            .iter()
            .any(|e| e.category == "Features");

        if has_features {
            BumpType::Minor
        } else {
            BumpType::Patch
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_semver_parse() {
        let v = SemVer::parse("1.2.3").unwrap();
        assert_eq!(v.major, 1);
        assert_eq!(v.minor, 2);
        assert_eq!(v.patch, 3);
        assert!(v.pre_release.is_none());
    }

    #[test]
    fn test_semver_parse_with_v_prefix() {
        let v = SemVer::parse("v2.0.1").unwrap();
        assert_eq!(v.major, 2);
        assert_eq!(v.minor, 0);
        assert_eq!(v.patch, 1);
    }

    #[test]
    fn test_semver_parse_with_prerelease() {
        let v = SemVer::parse("1.0.0-beta.1").unwrap();
        assert_eq!(v.major, 1);
        assert_eq!(v.minor, 0);
        assert_eq!(v.patch, 0);
        assert_eq!(v.pre_release.as_deref(), Some("beta.1"));
    }

    #[test]
    fn test_semver_parse_invalid() {
        assert!(SemVer::parse("1.2").is_err());
        assert!(SemVer::parse("not.a.version").is_err());
        assert!(SemVer::parse("").is_err());
    }

    #[test]
    fn test_semver_bump_major() {
        let v = SemVer::new(1, 5, 3);
        let bumped = v.bump_major();
        assert_eq!(bumped, SemVer::new(2, 0, 0));
    }

    #[test]
    fn test_semver_bump_minor() {
        let v = SemVer::new(1, 5, 3);
        let bumped = v.bump_minor();
        assert_eq!(bumped, SemVer::new(1, 6, 0));
    }

    #[test]
    fn test_semver_bump_patch() {
        let v = SemVer::new(1, 5, 3);
        let bumped = v.bump_patch();
        assert_eq!(bumped, SemVer::new(1, 5, 4));
    }

    #[test]
    fn test_semver_display() {
        let v = SemVer::new(1, 2, 3);
        assert_eq!(v.to_string(), "1.2.3");

        let v = SemVer::new(1, 0, 0).with_pre_release("rc.1");
        assert_eq!(v.to_string(), "1.0.0-rc.1");
    }

    #[test]
    fn test_semver_to_tag() {
        let v = SemVer::new(1, 24, 5);
        assert_eq!(v.to_tag(), "v1.24.5");
    }

    #[test]
    fn test_semver_ordering() {
        let v1 = SemVer::new(1, 0, 0);
        let v2 = SemVer::new(1, 1, 0);
        let v3 = SemVer::new(2, 0, 0);
        assert!(v1 < v2);
        assert!(v2 < v3);
    }

    #[test]
    fn test_changelog_entry_categorize() {
        let e1 = ChangelogEntry::new("abc1234", "feat: add login", "Alice");
        assert_eq!(e1.category, "Features");

        let e2 = ChangelogEntry::new("def5678", "fix: null pointer", "Bob");
        assert_eq!(e2.category, "Bug Fixes");

        let e3 = ChangelogEntry::new("ghi9012", "docs: update readme", "Charlie");
        assert_eq!(e3.category, "Documentation");

        let e4 = ChangelogEntry::new("jkl3456", "random commit", "Dave");
        assert_eq!(e4.category, "Other");
    }

    #[test]
    fn test_generate_changelog() {
        let manager = ReleaseManager::new(SemVer::new(1, 0, 0));
        let entries = vec![
            ChangelogEntry::new("abc1234", "feat: add login page", "Alice"),
            ChangelogEntry::new("def5678", "fix: null pointer in auth", "Bob"),
            ChangelogEntry::new("ghi9012", "feat: add logout button", "Charlie"),
        ];

        let version = SemVer::new(1, 1, 0);
        let changelog = manager.generate_changelog(&version, &entries);

        assert!(changelog.contains("v1.1.0"));
        assert!(changelog.contains("### Features"));
        assert!(changelog.contains("### Bug Fixes"));
        assert!(changelog.contains("add login page"));
        assert!(changelog.contains("null pointer in auth"));
    }

    #[test]
    fn test_create_release() {
        let mut manager = ReleaseManager::new(SemVer::new(1, 0, 0));
        let entries = vec![
            ChangelogEntry::new("abc", "feat: new feature", "Dev"),
        ];

        let release = manager.create_release(BumpType::Minor, entries);
        assert_eq!(release.version, SemVer::new(1, 1, 0));
        assert_eq!(release.previous_version, Some(SemVer::new(1, 0, 0)));
        assert_eq!(release.tag_name, "v1.1.0");
        assert!(!release.changelog.is_empty());

        assert_eq!(manager.current_version(), &SemVer::new(1, 1, 0));
        assert_eq!(manager.releases().len(), 1);
    }

    #[test]
    fn test_suggest_bump_type() {
        // Breaking change → major
        let entries = vec![
            ChangelogEntry::new("a", "feat!: BREAKING CHANGE in API", "Dev"),
        ];
        assert_eq!(ReleaseManager::suggest_bump_type(&entries), BumpType::Major);

        // Feature → minor
        let entries = vec![
            ChangelogEntry::new("a", "feat: add button", "Dev"),
        ];
        assert_eq!(ReleaseManager::suggest_bump_type(&entries), BumpType::Minor);

        // Only fixes → patch
        let entries = vec![
            ChangelogEntry::new("a", "fix: typo", "Dev"),
        ];
        assert_eq!(ReleaseManager::suggest_bump_type(&entries), BumpType::Patch);
    }

    #[test]
    fn test_bump_type_display() {
        assert_eq!(BumpType::Major.to_string(), "major");
        assert_eq!(BumpType::Minor.to_string(), "minor");
        assert_eq!(BumpType::Patch.to_string(), "patch");
    }
}
