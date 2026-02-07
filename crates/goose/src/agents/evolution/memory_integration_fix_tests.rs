// Comprehensive tests for memory_integration.rs fix
// Tests validate the critical bug fix:
// Pattern match changed from Success(_) to Success (unit variant, not tuple)

use super::memory_integration::calculate_success_rate;
use crate::agents::reflexion::{AttemptOutcome, ReflectionMemory, TaskAttempt};

/// Test calculate_success_rate with all successful attempts
#[test]
fn test_calculate_success_rate_all_success() {
    let attempts = vec![
        TaskAttempt {
            task_id: "task1".to_string(),
            outcome: AttemptOutcome::Success,
            reflection: "worked well".to_string(),
            timestamp: 1000,
        },
        TaskAttempt {
            task_id: "task2".to_string(),
            outcome: AttemptOutcome::Success,
            reflection: "perfect".to_string(),
            timestamp: 2000,
        },
        TaskAttempt {
            task_id: "task3".to_string(),
            outcome: AttemptOutcome::Success,
            reflection: "excellent".to_string(),
            timestamp: 3000,
        },
    ];

    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 1.0, "All successful attempts should give 100% success rate");
}

/// Test calculate_success_rate with all failed attempts
#[test]
fn test_calculate_success_rate_all_failure() {
    let attempts = vec![
        TaskAttempt {
            task_id: "task1".to_string(),
            outcome: AttemptOutcome::Failure,
            reflection: "error occurred".to_string(),
            timestamp: 1000,
        },
        TaskAttempt {
            task_id: "task2".to_string(),
            outcome: AttemptOutcome::Failure,
            reflection: "failed again".to_string(),
            timestamp: 2000,
        },
    ];

    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 0.0, "All failed attempts should give 0% success rate");
}

/// Test calculate_success_rate with mixed outcomes (50%)
#[test]
fn test_calculate_success_rate_mixed_50_percent() {
    let attempts = vec![
        TaskAttempt {
            task_id: "task1".to_string(),
            outcome: AttemptOutcome::Success,
            reflection: "worked".to_string(),
            timestamp: 1000,
        },
        TaskAttempt {
            task_id: "task2".to_string(),
            outcome: AttemptOutcome::Failure,
            reflection: "failed".to_string(),
            timestamp: 2000,
        },
    ];

    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 0.5, "1 success + 1 failure should give 50% success rate");
}

/// Test calculate_success_rate with mixed outcomes (33%)
#[test]
fn test_calculate_success_rate_mixed_33_percent() {
    let attempts = vec![
        TaskAttempt {
            task_id: "task1".to_string(),
            outcome: AttemptOutcome::Success,
            reflection: "worked".to_string(),
            timestamp: 1000,
        },
        TaskAttempt {
            task_id: "task2".to_string(),
            outcome: AttemptOutcome::Failure,
            reflection: "failed".to_string(),
            timestamp: 2000,
        },
        TaskAttempt {
            task_id: "task3".to_string(),
            outcome: AttemptOutcome::Failure,
            reflection: "failed again".to_string(),
            timestamp: 3000,
        },
    ];

    let rate = calculate_success_rate(&attempts);
    assert!((rate - 0.333333).abs() < 0.01, "1/3 success rate should be ~0.33");
}

/// Test calculate_success_rate with mixed outcomes (75%)
#[test]
fn test_calculate_success_rate_mixed_75_percent() {
    let attempts = vec![
        TaskAttempt {
            task_id: "task1".to_string(),
            outcome: AttemptOutcome::Success,
            reflection: "worked".to_string(),
            timestamp: 1000,
        },
        TaskAttempt {
            task_id: "task2".to_string(),
            outcome: AttemptOutcome::Success,
            reflection: "worked".to_string(),
            timestamp: 2000,
        },
        TaskAttempt {
            task_id: "task3".to_string(),
            outcome: AttemptOutcome::Success,
            reflection: "worked".to_string(),
            timestamp: 3000,
        },
        TaskAttempt {
            task_id: "task4".to_string(),
            outcome: AttemptOutcome::Failure,
            reflection: "failed".to_string(),
            timestamp: 4000,
        },
    ];

    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 0.75, "3/4 success rate should be 0.75");
}

/// Test calculate_success_rate with empty slice
#[test]
fn test_calculate_success_rate_empty() {
    let attempts: Vec<TaskAttempt> = vec![];
    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 0.0, "Empty attempts should give 0% success rate");
}

/// Test calculate_success_rate with single success
#[test]
fn test_calculate_success_rate_single_success() {
    let attempts = vec![TaskAttempt {
        task_id: "task1".to_string(),
        outcome: AttemptOutcome::Success,
        reflection: "worked".to_string(),
        timestamp: 1000,
    }];

    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 1.0, "Single success should give 100% success rate");
}

/// Test calculate_success_rate with single failure
#[test]
fn test_calculate_success_rate_single_failure() {
    let attempts = vec![TaskAttempt {
        task_id: "task1".to_string(),
        outcome: AttemptOutcome::Failure,
        reflection: "failed".to_string(),
        timestamp: 1000,
    }];

    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 0.0, "Single failure should give 0% success rate");
}

/// Test calculate_success_rate with large number of attempts
#[test]
fn test_calculate_success_rate_large_dataset() {
    let mut attempts = Vec::new();

    // 70 successes
    for i in 0..70 {
        attempts.push(TaskAttempt {
            task_id: format!("success{}", i),
            outcome: AttemptOutcome::Success,
            reflection: "worked".to_string(),
            timestamp: i,
        });
    }

    // 30 failures
    for i in 70..100 {
        attempts.push(TaskAttempt {
            task_id: format!("failure{}", i),
            outcome: AttemptOutcome::Failure,
            reflection: "failed".to_string(),
            timestamp: i,
        });
    }

    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 0.7, "70/100 success rate should be 0.7");
}

/// Test that Success pattern matching works correctly (the actual fix being tested)
#[test]
fn test_success_pattern_match_unit_variant() {
    let success_attempt = TaskAttempt {
        task_id: "test".to_string(),
        outcome: AttemptOutcome::Success,
        reflection: "worked".to_string(),
        timestamp: 1000,
    };

    // This is the critical test - Success is a unit variant, not Success(_)
    let is_success = matches!(success_attempt.outcome, AttemptOutcome::Success);
    assert!(is_success, "Success should match as unit variant");

    // The bug was using Success(_) which expects a tuple variant
    // This test ensures we're using the correct pattern
    let attempts = vec![success_attempt];
    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 1.0);
}

/// Test that Failure pattern matching still works
#[test]
fn test_failure_pattern_match() {
    let failure_attempt = TaskAttempt {
        task_id: "test".to_string(),
        outcome: AttemptOutcome::Failure,
        reflection: "failed".to_string(),
        timestamp: 1000,
    };

    let is_failure = matches!(failure_attempt.outcome, AttemptOutcome::Failure);
    assert!(is_failure, "Failure should match correctly");

    let attempts = vec![failure_attempt];
    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 0.0);
}

/// Test pattern matching with alternating outcomes
#[test]
fn test_alternating_outcomes() {
    let attempts = vec![
        TaskAttempt {
            task_id: "1".to_string(),
            outcome: AttemptOutcome::Success,
            reflection: "ok".to_string(),
            timestamp: 1,
        },
        TaskAttempt {
            task_id: "2".to_string(),
            outcome: AttemptOutcome::Failure,
            reflection: "bad".to_string(),
            timestamp: 2,
        },
        TaskAttempt {
            task_id: "3".to_string(),
            outcome: AttemptOutcome::Success,
            reflection: "ok".to_string(),
            timestamp: 3,
        },
        TaskAttempt {
            task_id: "4".to_string(),
            outcome: AttemptOutcome::Failure,
            reflection: "bad".to_string(),
            timestamp: 4,
        },
        TaskAttempt {
            task_id: "5".to_string(),
            outcome: AttemptOutcome::Success,
            reflection: "ok".to_string(),
            timestamp: 5,
        },
    ];

    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 0.6, "3/5 alternating should give 0.6");
}

/// Regression test: Verify the fix doesn't break when used with ReflectionMemory
#[test]
fn test_integration_with_reflection_memory() {
    let mut memory = ReflectionMemory::new(10);

    memory.add_attempt(TaskAttempt {
        task_id: "task1".to_string(),
        outcome: AttemptOutcome::Success,
        reflection: "worked well".to_string(),
        timestamp: 1000,
    });

    memory.add_attempt(TaskAttempt {
        task_id: "task2".to_string(),
        outcome: AttemptOutcome::Failure,
        reflection: "failed".to_string(),
        timestamp: 2000,
    });

    memory.add_attempt(TaskAttempt {
        task_id: "task3".to_string(),
        outcome: AttemptOutcome::Success,
        reflection: "worked again".to_string(),
        timestamp: 3000,
    });

    let attempts = memory.get_recent_attempts(10);
    let rate = calculate_success_rate(&attempts);

    assert_eq!(rate, 2.0 / 3.0, "2/3 success rate from reflection memory");
}

/// Edge case: Test with attempts that have identical timestamps
#[test]
fn test_identical_timestamps() {
    let attempts = vec![
        TaskAttempt {
            task_id: "task1".to_string(),
            outcome: AttemptOutcome::Success,
            reflection: "1".to_string(),
            timestamp: 1000,
        },
        TaskAttempt {
            task_id: "task2".to_string(),
            outcome: AttemptOutcome::Success,
            reflection: "2".to_string(),
            timestamp: 1000,
        },
        TaskAttempt {
            task_id: "task3".to_string(),
            outcome: AttemptOutcome::Failure,
            reflection: "3".to_string(),
            timestamp: 1000,
        },
    ];

    let rate = calculate_success_rate(&attempts);
    assert!((rate - 0.666666).abs() < 0.01);
}

/// Edge case: Test with very old timestamps
#[test]
fn test_very_old_timestamps() {
    let attempts = vec![
        TaskAttempt {
            task_id: "task1".to_string(),
            outcome: AttemptOutcome::Success,
            reflection: "ancient".to_string(),
            timestamp: 0,
        },
        TaskAttempt {
            task_id: "task2".to_string(),
            outcome: AttemptOutcome::Failure,
            reflection: "old".to_string(),
            timestamp: 1,
        },
    ];

    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 0.5);
}

/// Edge case: Test with future timestamps
#[test]
fn test_future_timestamps() {
    let attempts = vec![
        TaskAttempt {
            task_id: "task1".to_string(),
            outcome: AttemptOutcome::Success,
            reflection: "future".to_string(),
            timestamp: u64::MAX,
        },
        TaskAttempt {
            task_id: "task2".to_string(),
            outcome: AttemptOutcome::Success,
            reflection: "far future".to_string(),
            timestamp: u64::MAX - 1,
        },
    ];

    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 1.0);
}

/// Performance test: Large dataset should still be fast
#[test]
fn test_performance_large_dataset() {
    let mut attempts = Vec::new();

    for i in 0..10000 {
        attempts.push(TaskAttempt {
            task_id: format!("task{}", i),
            outcome: if i % 2 == 0 {
                AttemptOutcome::Success
            } else {
                AttemptOutcome::Failure
            },
            reflection: format!("reflection{}", i),
            timestamp: i as u64,
        });
    }

    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 0.5, "50% success rate for 10k alternating attempts");
}
