//! ImprovementPlanner — plans code improvements from extracted insights.
//!
//! Analyzes insights from the learning engine (ExperienceStore, InsightExtractor)
//! and produces ranked, risk-assessed improvement plans. Each improvement targets
//! a specific file and describes the proposed change with a confidence score.
//!
//! # Flow
//!
//! ```text
//! InsightExtractor output
//!   -> ImprovementPlanner.plan_from_insights()
//!   -> ImprovementPlan { improvements ranked by risk + confidence }
//!   -> approve/reject individual improvements
//!   -> CodeApplier applies approved changes
//! ```

use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

/// The type of improvement being proposed.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum ImprovementType {
    /// Optimize runtime performance (reduce latency, memory, CPU).
    Performance,
    /// Improve reliability (retry logic, error recovery, graceful degradation).
    Reliability,
    /// Improve code quality (naming, structure, readability).
    CodeQuality,
    /// Strengthen error handling (missing checks, better messages).
    ErrorHandling,
    /// Increase test coverage (missing tests, edge cases).
    TestCoverage,
    /// Improve documentation (doc comments, README, inline).
    Documentation,
    /// Fix security issues (input validation, auth, secrets).
    Security,
    /// General refactoring (deduplication, extraction, simplification).
    Refactoring,
}

impl std::fmt::Display for ImprovementType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ImprovementType::Performance => write!(f, "performance"),
            ImprovementType::Reliability => write!(f, "reliability"),
            ImprovementType::CodeQuality => write!(f, "code_quality"),
            ImprovementType::ErrorHandling => write!(f, "error_handling"),
            ImprovementType::TestCoverage => write!(f, "test_coverage"),
            ImprovementType::Documentation => write!(f, "documentation"),
            ImprovementType::Security => write!(f, "security"),
            ImprovementType::Refactoring => write!(f, "refactoring"),
        }
    }
}

/// Risk level for a proposed improvement, with ordering (Low < Medium < High < Critical).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum RiskLevel {
    /// Trivial change, no functional impact (docs, comments, formatting).
    Low,
    /// Minor change, limited blast radius (single function, local scope).
    Medium,
    /// Significant change, crosses module boundaries or alters behavior.
    High,
    /// Critical change, affects core logic, public API, or data integrity.
    Critical,
}

impl RiskLevel {
    /// Numeric value for comparison ordering.
    fn ordinal(&self) -> u8 {
        match self {
            RiskLevel::Low => 0,
            RiskLevel::Medium => 1,
            RiskLevel::High => 2,
            RiskLevel::Critical => 3,
        }
    }
}

impl PartialOrd for RiskLevel {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for RiskLevel {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.ordinal().cmp(&other.ordinal())
    }
}

impl std::fmt::Display for RiskLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RiskLevel::Low => write!(f, "low"),
            RiskLevel::Medium => write!(f, "medium"),
            RiskLevel::High => write!(f, "high"),
            RiskLevel::Critical => write!(f, "critical"),
        }
    }
}

/// Status of a proposed improvement as it moves through the pipeline.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ImprovementStatus {
    /// Proposed by the planner, awaiting review.
    Proposed,
    /// Approved for application.
    Approved,
    /// Successfully applied to the codebase.
    Applied,
    /// Applied and verified by tests/health checks.
    Verified,
    /// Rejected by review (human or automated).
    Rejected,
    /// Applied but rolled back due to failure.
    RolledBack,
}

impl std::fmt::Display for ImprovementStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ImprovementStatus::Proposed => write!(f, "proposed"),
            ImprovementStatus::Approved => write!(f, "approved"),
            ImprovementStatus::Applied => write!(f, "applied"),
            ImprovementStatus::Verified => write!(f, "verified"),
            ImprovementStatus::Rejected => write!(f, "rejected"),
            ImprovementStatus::RolledBack => write!(f, "rolled_back"),
        }
    }
}

/// A single proposed improvement to the codebase.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Improvement {
    /// Unique identifier.
    pub id: String,
    /// What kind of improvement this is.
    pub improvement_type: ImprovementType,
    /// Short human-readable title.
    pub title: String,
    /// Detailed description of the change.
    pub description: String,
    /// Risk assessment.
    pub risk_level: RiskLevel,
    /// File to modify (relative path from workspace root).
    pub target_file: String,
    /// Description of the proposed change.
    pub proposed_change: String,
    /// Planner confidence that this improvement is beneficial (0.0-1.0).
    pub confidence: f64,
    /// Current status in the pipeline.
    pub status: ImprovementStatus,
    /// ID of the insight that inspired this improvement, if any.
    pub source_insight: Option<String>,
    /// When this improvement was proposed.
    pub created_at: DateTime<Utc>,
}

impl Improvement {
    /// Create a new improvement with generated ID and Proposed status.
    pub fn new(
        improvement_type: ImprovementType,
        title: impl Into<String>,
        description: impl Into<String>,
        risk_level: RiskLevel,
        target_file: impl Into<String>,
        proposed_change: impl Into<String>,
        confidence: f64,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            improvement_type,
            title: title.into(),
            description: description.into(),
            risk_level,
            target_file: target_file.into(),
            proposed_change: proposed_change.into(),
            confidence: confidence.clamp(0.0, 1.0),
            status: ImprovementStatus::Proposed,
            source_insight: None,
            created_at: Utc::now(),
        }
    }

    /// Set the source insight ID.
    pub fn with_source_insight(mut self, insight_id: impl Into<String>) -> Self {
        self.source_insight = Some(insight_id.into());
        self
    }
}

/// Input data from the insight extractor or learning engine.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsightData {
    /// Unique insight identifier.
    pub id: String,
    /// Category of insight (e.g., "core_selection", "failure_pattern", "optimization").
    pub category: String,
    /// Human-readable description of the insight.
    pub description: String,
    /// Confidence score for this insight (0.0-1.0).
    pub confidence: f64,
}

impl InsightData {
    /// Create a new InsightData.
    pub fn new(
        id: impl Into<String>,
        category: impl Into<String>,
        description: impl Into<String>,
        confidence: f64,
    ) -> Self {
        Self {
            id: id.into(),
            category: category.into(),
            description: description.into(),
            confidence: confidence.clamp(0.0, 1.0),
        }
    }
}

/// A collection of improvements planned together.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImprovementPlan {
    /// Unique plan identifier.
    pub id: String,
    /// The improvements in this plan.
    pub improvements: Vec<Improvement>,
    /// When the plan was created.
    pub created_at: DateTime<Utc>,
    /// Maximum risk level allowed in this plan.
    pub max_risk: RiskLevel,
    /// Estimated time to apply all improvements (seconds).
    pub estimated_duration_secs: u64,
}

impl ImprovementPlan {
    /// Create a new empty plan with default Medium risk cap.
    pub fn new() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            improvements: Vec::new(),
            created_at: Utc::now(),
            max_risk: RiskLevel::Medium,
            estimated_duration_secs: 0,
        }
    }

    /// Add an improvement to the plan.
    pub fn add_improvement(&mut self, improvement: Improvement) {
        self.improvements.push(improvement);
        // Rough estimate: 30 seconds per improvement
        self.estimated_duration_secs = self.improvements.len() as u64 * 30;
    }

    /// Return improvements at or below the given risk level.
    pub fn filter_by_risk(&self, max_risk: &RiskLevel) -> Vec<&Improvement> {
        self.improvements
            .iter()
            .filter(|i| &i.risk_level <= max_risk)
            .collect()
    }

    /// Return only approved improvements.
    pub fn approved_improvements(&self) -> Vec<&Improvement> {
        self.improvements
            .iter()
            .filter(|i| i.status == ImprovementStatus::Approved)
            .collect()
    }

    /// Produce a human-readable summary of this plan.
    pub fn summary(&self) -> String {
        let total = self.improvements.len();
        let approved = self
            .improvements
            .iter()
            .filter(|i| i.status == ImprovementStatus::Approved)
            .count();
        let rejected = self
            .improvements
            .iter()
            .filter(|i| i.status == ImprovementStatus::Rejected)
            .count();
        let proposed = self
            .improvements
            .iter()
            .filter(|i| i.status == ImprovementStatus::Proposed)
            .count();

        let type_counts: std::collections::HashMap<&ImprovementType, usize> =
            self.improvements.iter().fold(
                std::collections::HashMap::new(),
                |mut acc, i| {
                    *acc.entry(&i.improvement_type).or_insert(0) += 1;
                    acc
                },
            );

        let type_summary: Vec<String> = type_counts
            .iter()
            .map(|(t, c)| format!("{}={}", t, c))
            .collect();

        format!(
            "Plan {} | {} improvements ({} proposed, {} approved, {} rejected) | types: [{}] | est: {}s",
            &self.id[..8],
            total,
            proposed,
            approved,
            rejected,
            type_summary.join(", "),
            self.estimated_duration_secs
        )
    }
}

impl Default for ImprovementPlan {
    fn default() -> Self {
        Self::new()
    }
}

/// Plans code improvements from insight data.
///
/// Analyzes insights produced by the learning engine and creates
/// structured improvement plans with risk assessment and prioritization.
pub struct ImprovementPlanner {
    /// History of all plans created.
    plans: Vec<ImprovementPlan>,
    /// Maximum risk level the planner will propose.
    max_risk: RiskLevel,
    /// Which improvement types are allowed.
    allowed_types: Vec<ImprovementType>,
}

impl ImprovementPlanner {
    /// Create a new planner with the given maximum risk level.
    /// All improvement types are allowed by default.
    pub fn new(max_risk: RiskLevel) -> Self {
        Self {
            plans: Vec::new(),
            max_risk,
            allowed_types: vec![
                ImprovementType::Performance,
                ImprovementType::Reliability,
                ImprovementType::CodeQuality,
                ImprovementType::ErrorHandling,
                ImprovementType::TestCoverage,
                ImprovementType::Documentation,
                ImprovementType::Security,
                ImprovementType::Refactoring,
            ],
        }
    }

    /// Create a planner that only allows specific improvement types.
    pub fn with_allowed_types(mut self, types: Vec<ImprovementType>) -> Self {
        self.allowed_types = types;
        self
    }

    /// Generate an improvement plan from a set of insights.
    ///
    /// Maps insight categories to improvement types and creates concrete
    /// improvement proposals. Only insights above 0.3 confidence and within
    /// the planner's risk/type constraints are included.
    pub fn plan_from_insights(&mut self, insights: &[InsightData]) -> ImprovementPlan {
        let mut plan = ImprovementPlan::new();
        plan.max_risk = self.max_risk.clone();

        for insight in insights {
            // Skip low-confidence insights
            if insight.confidence < 0.3 {
                debug!(
                    insight_id = %insight.id,
                    confidence = insight.confidence,
                    "Skipping low-confidence insight"
                );
                continue;
            }

            let improvement_type = Self::categorize_insight(&insight.category);

            // Skip disallowed types
            if !self.allowed_types.contains(&improvement_type) {
                debug!(
                    insight_id = %insight.id,
                    improvement_type = %improvement_type,
                    "Skipping disallowed improvement type"
                );
                continue;
            }

            let risk_level = Self::assess_risk(&improvement_type, insight.confidence);

            // Skip improvements above our risk threshold
            if risk_level > self.max_risk {
                warn!(
                    insight_id = %insight.id,
                    risk = %risk_level,
                    max_risk = %self.max_risk,
                    "Skipping improvement exceeding risk threshold"
                );
                continue;
            }

            let improvement = Improvement::new(
                improvement_type,
                format!("Auto-improvement from insight {}", &insight.id[..8.min(insight.id.len())]),
                insight.description.clone(),
                risk_level,
                "src/".to_string(), // Target determined at apply time
                format!("Apply insight: {}", insight.description),
                insight.confidence,
            )
            .with_source_insight(insight.id.clone());

            plan.add_improvement(improvement);
        }

        info!(
            plan_id = %plan.id,
            num_improvements = plan.improvements.len(),
            "Created improvement plan from {} insights",
            insights.len()
        );

        self.plans.push(plan.clone());
        plan
    }

    /// Approve a specific improvement within a plan.
    pub fn approve_improvement(
        &mut self,
        plan_id: &str,
        improvement_id: &str,
    ) -> Result<()> {
        let plan = self
            .plans
            .iter_mut()
            .find(|p| p.id == plan_id)
            .ok_or_else(|| anyhow!("Plan not found: {}", plan_id))?;

        let improvement = plan
            .improvements
            .iter_mut()
            .find(|i| i.id == improvement_id)
            .ok_or_else(|| anyhow!("Improvement not found: {}", improvement_id))?;

        if improvement.status != ImprovementStatus::Proposed {
            return Err(anyhow!(
                "Cannot approve improvement in {} status",
                improvement.status
            ));
        }

        improvement.status = ImprovementStatus::Approved;
        info!(
            improvement_id = %improvement_id,
            plan_id = %plan_id,
            "Approved improvement"
        );
        Ok(())
    }

    /// Reject a specific improvement within a plan.
    pub fn reject_improvement(
        &mut self,
        plan_id: &str,
        improvement_id: &str,
    ) -> Result<()> {
        let plan = self
            .plans
            .iter_mut()
            .find(|p| p.id == plan_id)
            .ok_or_else(|| anyhow!("Plan not found: {}", plan_id))?;

        let improvement = plan
            .improvements
            .iter_mut()
            .find(|i| i.id == improvement_id)
            .ok_or_else(|| anyhow!("Improvement not found: {}", improvement_id))?;

        if improvement.status != ImprovementStatus::Proposed {
            return Err(anyhow!(
                "Cannot reject improvement in {} status",
                improvement.status
            ));
        }

        improvement.status = ImprovementStatus::Rejected;
        info!(
            improvement_id = %improvement_id,
            plan_id = %plan_id,
            "Rejected improvement"
        );
        Ok(())
    }

    /// Get the full plan history.
    pub fn history(&self) -> &[ImprovementPlan] {
        &self.plans
    }

    /// Map an insight category string to an ImprovementType.
    fn categorize_insight(category: &str) -> ImprovementType {
        match category.to_lowercase().as_str() {
            "performance" | "latency" | "speed" | "optimization" => {
                ImprovementType::Performance
            }
            "reliability" | "stability" | "retry" | "recovery" => {
                ImprovementType::Reliability
            }
            "quality" | "code_quality" | "readability" | "naming" => {
                ImprovementType::CodeQuality
            }
            "error" | "error_handling" | "failure_pattern" | "exception" => {
                ImprovementType::ErrorHandling
            }
            "test" | "test_coverage" | "testing" | "coverage" => {
                ImprovementType::TestCoverage
            }
            "doc" | "documentation" | "docs" | "comment" => {
                ImprovementType::Documentation
            }
            "security" | "auth" | "validation" | "sanitization" => {
                ImprovementType::Security
            }
            "refactor" | "refactoring" | "dedup" | "extraction" => {
                ImprovementType::Refactoring
            }
            _ => ImprovementType::CodeQuality, // Default fallback
        }
    }

    /// Assess risk level based on improvement type and insight confidence.
    fn assess_risk(improvement_type: &ImprovementType, confidence: f64) -> RiskLevel {
        let base_risk = match improvement_type {
            ImprovementType::Documentation => RiskLevel::Low,
            ImprovementType::TestCoverage => RiskLevel::Low,
            ImprovementType::CodeQuality => RiskLevel::Low,
            ImprovementType::ErrorHandling => RiskLevel::Medium,
            ImprovementType::Refactoring => RiskLevel::Medium,
            ImprovementType::Performance => RiskLevel::Medium,
            ImprovementType::Reliability => RiskLevel::High,
            ImprovementType::Security => RiskLevel::High,
        };

        // High confidence can reduce risk by one level
        if confidence > 0.8 && base_risk > RiskLevel::Low {
            match base_risk {
                RiskLevel::Medium => RiskLevel::Low,
                RiskLevel::High => RiskLevel::Medium,
                RiskLevel::Critical => RiskLevel::High,
                RiskLevel::Low => RiskLevel::Low,
            }
        } else {
            base_risk
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_risk_level_ordering() {
        assert!(RiskLevel::Low < RiskLevel::Medium);
        assert!(RiskLevel::Medium < RiskLevel::High);
        assert!(RiskLevel::High < RiskLevel::Critical);
        assert!(RiskLevel::Low < RiskLevel::Critical);

        // Equal
        assert_eq!(RiskLevel::Low, RiskLevel::Low);
        assert!(!(RiskLevel::High < RiskLevel::Medium));

        // Ord-based sorting
        let mut levels = vec![
            RiskLevel::Critical,
            RiskLevel::Low,
            RiskLevel::High,
            RiskLevel::Medium,
        ];
        levels.sort();
        assert_eq!(
            levels,
            vec![
                RiskLevel::Low,
                RiskLevel::Medium,
                RiskLevel::High,
                RiskLevel::Critical
            ]
        );
    }

    #[test]
    fn test_improvement_plan_creation() {
        let plan = ImprovementPlan::new();
        assert!(plan.improvements.is_empty());
        assert_eq!(plan.max_risk, RiskLevel::Medium);
        assert_eq!(plan.estimated_duration_secs, 0);
        assert!(!plan.id.is_empty());
    }

    #[test]
    fn test_add_improvements() {
        let mut plan = ImprovementPlan::new();

        let imp1 = Improvement::new(
            ImprovementType::Performance,
            "Speed up parser",
            "Optimize the token parser hot path",
            RiskLevel::Medium,
            "src/parser.rs",
            "Cache parsed tokens",
            0.85,
        );
        let imp2 = Improvement::new(
            ImprovementType::Documentation,
            "Add doc comments",
            "Missing doc comments on public API",
            RiskLevel::Low,
            "src/lib.rs",
            "Add /// doc comments",
            0.95,
        );

        plan.add_improvement(imp1);
        assert_eq!(plan.improvements.len(), 1);
        assert_eq!(plan.estimated_duration_secs, 30);

        plan.add_improvement(imp2);
        assert_eq!(plan.improvements.len(), 2);
        assert_eq!(plan.estimated_duration_secs, 60);
    }

    #[test]
    fn test_filter_by_risk() {
        let mut plan = ImprovementPlan::new();

        plan.add_improvement(Improvement::new(
            ImprovementType::Documentation,
            "Low risk doc",
            "Add docs",
            RiskLevel::Low,
            "src/lib.rs",
            "Add docs",
            0.9,
        ));
        plan.add_improvement(Improvement::new(
            ImprovementType::Performance,
            "Medium risk perf",
            "Optimize",
            RiskLevel::Medium,
            "src/engine.rs",
            "Optimize hot path",
            0.7,
        ));
        plan.add_improvement(Improvement::new(
            ImprovementType::Security,
            "High risk sec",
            "Fix vuln",
            RiskLevel::High,
            "src/auth.rs",
            "Add input validation",
            0.6,
        ));

        let low_only = plan.filter_by_risk(&RiskLevel::Low);
        assert_eq!(low_only.len(), 1);

        let up_to_medium = plan.filter_by_risk(&RiskLevel::Medium);
        assert_eq!(up_to_medium.len(), 2);

        let up_to_high = plan.filter_by_risk(&RiskLevel::High);
        assert_eq!(up_to_high.len(), 3);
    }

    #[test]
    fn test_plan_from_insights() {
        let mut planner = ImprovementPlanner::new(RiskLevel::High);

        let insights = vec![
            InsightData::new("ins-001", "performance", "Parser is slow on large inputs", 0.85),
            InsightData::new("ins-002", "documentation", "Missing API docs", 0.92),
            InsightData::new("ins-003", "unknown_cat", "General improvement", 0.5),
            InsightData::new("ins-004", "security", "Input not validated", 0.2), // Below threshold
        ];

        let plan = planner.plan_from_insights(&insights);

        // ins-004 is below 0.3 confidence threshold, so 3 improvements
        assert_eq!(plan.improvements.len(), 3);

        // All should be Proposed
        assert!(plan
            .improvements
            .iter()
            .all(|i| i.status == ImprovementStatus::Proposed));

        // Each should have a source_insight
        assert!(plan
            .improvements
            .iter()
            .all(|i| i.source_insight.is_some()));

        // Plan should be in history
        assert_eq!(planner.history().len(), 1);
    }

    #[test]
    fn test_approve_reject() {
        let mut planner = ImprovementPlanner::new(RiskLevel::Medium);

        let insights = vec![
            InsightData::new("a", "documentation", "Add docs", 0.9),
            InsightData::new("b", "test_coverage", "Add tests", 0.8),
        ];

        let plan = planner.plan_from_insights(&insights);
        let plan_id = plan.id.clone();
        let imp_a_id = plan.improvements[0].id.clone();
        let imp_b_id = plan.improvements[1].id.clone();

        // Approve first
        planner.approve_improvement(&plan_id, &imp_a_id).unwrap();
        assert_eq!(
            planner.plans[0].improvements[0].status,
            ImprovementStatus::Approved
        );

        // Reject second
        planner.reject_improvement(&plan_id, &imp_b_id).unwrap();
        assert_eq!(
            planner.plans[0].improvements[1].status,
            ImprovementStatus::Rejected
        );

        // Cannot approve an already-approved item
        assert!(planner
            .approve_improvement(&plan_id, &imp_a_id)
            .is_err());

        // Cannot reject an already-rejected item
        assert!(planner
            .reject_improvement(&plan_id, &imp_b_id)
            .is_err());

        // Non-existent plan
        assert!(planner
            .approve_improvement("no-such-plan", &imp_a_id)
            .is_err());

        // Approved improvements filter
        let approved = planner.plans[0].approved_improvements();
        assert_eq!(approved.len(), 1);
        assert_eq!(approved[0].id, imp_a_id);
    }

    #[test]
    fn test_plan_summary() {
        let mut plan = ImprovementPlan::new();
        plan.add_improvement(Improvement::new(
            ImprovementType::Performance,
            "Speed up",
            "Optimize",
            RiskLevel::Low,
            "src/lib.rs",
            "Cache results",
            0.9,
        ));
        plan.add_improvement(Improvement::new(
            ImprovementType::Documentation,
            "Add docs",
            "Document API",
            RiskLevel::Low,
            "src/api.rs",
            "Add doc comments",
            0.95,
        ));

        let summary = plan.summary();
        assert!(summary.contains("2 improvements"));
        assert!(summary.contains("2 proposed"));
        assert!(summary.contains("0 approved"));
        assert!(summary.contains("0 rejected"));
        assert!(summary.contains("60s"));
    }

    #[test]
    fn test_serialization() {
        // ImprovementType
        let imp_type = ImprovementType::Security;
        let json = serde_json::to_string(&imp_type).unwrap();
        let deser: ImprovementType = serde_json::from_str(&json).unwrap();
        assert_eq!(deser, ImprovementType::Security);

        // RiskLevel
        let risk = RiskLevel::High;
        let json = serde_json::to_string(&risk).unwrap();
        let deser: RiskLevel = serde_json::from_str(&json).unwrap();
        assert_eq!(deser, RiskLevel::High);

        // ImprovementStatus
        let status = ImprovementStatus::Verified;
        let json = serde_json::to_string(&status).unwrap();
        let deser: ImprovementStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(deser, ImprovementStatus::Verified);

        // Full Improvement
        let improvement = Improvement::new(
            ImprovementType::Refactoring,
            "Extract helper",
            "Extract common logic into helper function",
            RiskLevel::Medium,
            "src/utils.rs",
            "Create shared helper",
            0.75,
        );
        let json = serde_json::to_string(&improvement).unwrap();
        let deser: Improvement = serde_json::from_str(&json).unwrap();
        assert_eq!(deser.improvement_type, ImprovementType::Refactoring);
        assert_eq!(deser.risk_level, RiskLevel::Medium);
        assert_eq!(deser.confidence, 0.75);

        // InsightData
        let insight = InsightData::new("id-1", "performance", "Slow query", 0.88);
        let json = serde_json::to_string(&insight).unwrap();
        let deser: InsightData = serde_json::from_str(&json).unwrap();
        assert_eq!(deser.id, "id-1");
        assert_eq!(deser.confidence, 0.88);

        // ImprovementPlan
        let mut plan = ImprovementPlan::new();
        plan.add_improvement(improvement);
        let json = serde_json::to_string(&plan).unwrap();
        let deser: ImprovementPlan = serde_json::from_str(&json).unwrap();
        assert_eq!(deser.improvements.len(), 1);
    }

    #[test]
    fn test_categorize_insight() {
        assert_eq!(
            ImprovementPlanner::categorize_insight("performance"),
            ImprovementType::Performance
        );
        assert_eq!(
            ImprovementPlanner::categorize_insight("latency"),
            ImprovementType::Performance
        );
        assert_eq!(
            ImprovementPlanner::categorize_insight("security"),
            ImprovementType::Security
        );
        assert_eq!(
            ImprovementPlanner::categorize_insight("test_coverage"),
            ImprovementType::TestCoverage
        );
        assert_eq!(
            ImprovementPlanner::categorize_insight("refactoring"),
            ImprovementType::Refactoring
        );
        assert_eq!(
            ImprovementPlanner::categorize_insight("failure_pattern"),
            ImprovementType::ErrorHandling
        );
        // Unknown falls back to CodeQuality
        assert_eq!(
            ImprovementPlanner::categorize_insight("xyzzy"),
            ImprovementType::CodeQuality
        );
    }

    #[test]
    fn test_risk_assessment() {
        // Documentation is always Low
        assert_eq!(
            ImprovementPlanner::assess_risk(&ImprovementType::Documentation, 0.5),
            RiskLevel::Low
        );

        // Security base is High, but high confidence reduces to Medium
        assert_eq!(
            ImprovementPlanner::assess_risk(&ImprovementType::Security, 0.85),
            RiskLevel::Medium
        );
        assert_eq!(
            ImprovementPlanner::assess_risk(&ImprovementType::Security, 0.5),
            RiskLevel::High
        );

        // Performance base is Medium, high confidence reduces to Low
        assert_eq!(
            ImprovementPlanner::assess_risk(&ImprovementType::Performance, 0.9),
            RiskLevel::Low
        );
        assert_eq!(
            ImprovementPlanner::assess_risk(&ImprovementType::Performance, 0.5),
            RiskLevel::Medium
        );
    }

    #[test]
    fn test_allowed_types_filter() {
        let mut planner = ImprovementPlanner::new(RiskLevel::High)
            .with_allowed_types(vec![ImprovementType::Documentation]);

        let insights = vec![
            InsightData::new("a", "documentation", "Add docs", 0.9),
            InsightData::new("b", "performance", "Speed up", 0.9),
            InsightData::new("c", "security", "Fix vuln", 0.9),
        ];

        let plan = planner.plan_from_insights(&insights);

        // Only documentation type is allowed
        assert_eq!(plan.improvements.len(), 1);
        assert_eq!(
            plan.improvements[0].improvement_type,
            ImprovementType::Documentation
        );
    }

    #[test]
    fn test_confidence_clamping() {
        let imp = Improvement::new(
            ImprovementType::Performance,
            "Over-confident",
            "Too sure",
            RiskLevel::Low,
            "src/lib.rs",
            "Change",
            1.5, // Above 1.0
        );
        assert_eq!(imp.confidence, 1.0);

        let imp2 = Improvement::new(
            ImprovementType::Performance,
            "Negative confidence",
            "Too unsure",
            RiskLevel::Low,
            "src/lib.rs",
            "Change",
            -0.5, // Below 0.0
        );
        assert_eq!(imp2.confidence, 0.0);
    }
}
