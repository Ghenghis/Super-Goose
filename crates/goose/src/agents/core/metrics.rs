//! Core execution metrics for tracking and comparison.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
/// Accumulated metrics for a core across all executions.
/// Uses atomics for thread-safe updates without locks.
#[derive(Debug)]
pub struct CoreMetrics {
    /// Total number of executions
    pub total_executions: AtomicU32,
    /// Number of successful completions
    pub successful: AtomicU32,
    /// Number of failures
    pub failed: AtomicU32,
    /// Total turns/iterations across all executions
    pub total_turns: AtomicU64,
    /// Total cost in microdollars (1 microdollar = $0.000001)
    pub total_cost_microdollars: AtomicU64,
    /// Total execution time in milliseconds
    pub total_time_ms: AtomicU64,
}

impl CoreMetrics {
    pub fn new() -> Self {
        Self {
            total_executions: AtomicU32::new(0),
            successful: AtomicU32::new(0),
            failed: AtomicU32::new(0),
            total_turns: AtomicU64::new(0),
            total_cost_microdollars: AtomicU64::new(0),
            total_time_ms: AtomicU64::new(0),
        }
    }

    /// Record a completed execution
    pub fn record_execution(&self, success: bool, turns: u32, cost_microdollars: u64, time_ms: u64) {
        self.total_executions.fetch_add(1, Ordering::Relaxed);
        if success {
            self.successful.fetch_add(1, Ordering::Relaxed);
        } else {
            self.failed.fetch_add(1, Ordering::Relaxed);
        }
        self.total_turns.fetch_add(turns as u64, Ordering::Relaxed);
        self.total_cost_microdollars
            .fetch_add(cost_microdollars, Ordering::Relaxed);
        self.total_time_ms.fetch_add(time_ms, Ordering::Relaxed);
    }

    /// Take a snapshot of current metrics.
    ///
    /// Note: Snapshot reads are not atomic across fields. Under concurrent
    /// updates, field values may be slightly inconsistent (e.g., `successful +
    /// failed` might briefly differ from `total_executions`). This is
    /// acceptable for dashboard display but should not be used for
    /// correctness-critical decisions.
    pub fn snapshot(&self) -> CoreMetricsSnapshot {
        let total = self.total_executions.load(Ordering::Relaxed);
        let successful = self.successful.load(Ordering::Relaxed);
        let total_turns = self.total_turns.load(Ordering::Relaxed);
        let total_cost = self.total_cost_microdollars.load(Ordering::Relaxed);
        let total_time = self.total_time_ms.load(Ordering::Relaxed);

        CoreMetricsSnapshot {
            total_executions: total,
            successful,
            failed: self.failed.load(Ordering::Relaxed),
            success_rate: if total > 0 {
                successful as f32 / total as f32
            } else {
                0.0
            },
            avg_turns: if total > 0 {
                total_turns as f32 / total as f32
            } else {
                0.0
            },
            avg_cost_dollars: if total > 0 {
                (total_cost as f64 / total as f64) / 1_000_000.0
            } else {
                0.0
            },
            avg_time_ms: if total > 0 {
                total_time / total as u64
            } else {
                0
            },
            total_cost_dollars: total_cost as f64 / 1_000_000.0,
        }
    }

    /// Reset all metrics to zero
    pub fn reset(&self) {
        self.total_executions.store(0, Ordering::Relaxed);
        self.successful.store(0, Ordering::Relaxed);
        self.failed.store(0, Ordering::Relaxed);
        self.total_turns.store(0, Ordering::Relaxed);
        self.total_cost_microdollars.store(0, Ordering::Relaxed);
        self.total_time_ms.store(0, Ordering::Relaxed);
    }
}

impl Default for CoreMetrics {
    fn default() -> Self {
        Self::new()
    }
}

/// Serializable snapshot of metrics at a point in time
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoreMetricsSnapshot {
    pub total_executions: u32,
    pub successful: u32,
    pub failed: u32,
    /// Success rate as a fraction (0.0 to 1.0)
    pub success_rate: f32,
    /// Average turns per execution
    pub avg_turns: f32,
    /// Average cost per execution in dollars
    pub avg_cost_dollars: f64,
    /// Average execution time in milliseconds
    pub avg_time_ms: u64,
    /// Total cumulative cost in dollars
    pub total_cost_dollars: f64,
}

impl Default for CoreMetricsSnapshot {
    fn default() -> Self {
        Self {
            total_executions: 0,
            successful: 0,
            failed: 0,
            success_rate: 0.0,
            avg_turns: 0.0,
            avg_cost_dollars: 0.0,
            avg_time_ms: 0,
            total_cost_dollars: 0.0,
        }
    }
}

impl std::fmt::Display for CoreMetricsSnapshot {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{} runs ({} ok, {} fail, {:.0}% success), avg {:.1} turns, avg ${:.4}, avg {}ms",
            self.total_executions,
            self.successful,
            self.failed,
            self.success_rate * 100.0,
            self.avg_turns,
            self.avg_cost_dollars,
            self.avg_time_ms
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metrics_record_and_snapshot() {
        let metrics = CoreMetrics::new();
        metrics.record_execution(true, 5, 1_000_000, 5000);
        metrics.record_execution(false, 10, 2_000_000, 8000);

        let snap = metrics.snapshot();
        assert_eq!(snap.total_executions, 2);
        assert_eq!(snap.successful, 1);
        assert_eq!(snap.failed, 1);
        assert!((snap.success_rate - 0.5).abs() < 0.01);
        assert!((snap.avg_turns - 7.5).abs() < 0.01);
        assert!((snap.avg_cost_dollars - 1.5).abs() < 0.01);
        assert_eq!(snap.avg_time_ms, 6500);
    }

    #[test]
    fn test_metrics_reset() {
        let metrics = CoreMetrics::new();
        metrics.record_execution(true, 5, 1_000_000, 5000);
        metrics.reset();

        let snap = metrics.snapshot();
        assert_eq!(snap.total_executions, 0);
        assert_eq!(snap.successful, 0);
    }

    #[test]
    fn test_metrics_snapshot_display() {
        let snap = CoreMetricsSnapshot {
            total_executions: 10,
            successful: 8,
            failed: 2,
            success_rate: 0.8,
            avg_turns: 4.5,
            avg_cost_dollars: 0.0123,
            avg_time_ms: 3000,
            total_cost_dollars: 0.123,
        };
        let display = format!("{}", snap);
        assert!(display.contains("10 runs"));
        assert!(display.contains("80% success"));
    }

    #[test]
    fn test_metrics_empty_snapshot() {
        let metrics = CoreMetrics::new();
        let snap = metrics.snapshot();
        assert_eq!(snap.total_executions, 0);
        assert_eq!(snap.success_rate, 0.0);
        assert_eq!(snap.avg_turns, 0.0);
    }
}
