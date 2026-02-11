// Comprehensive tests for memory_integration.rs fix
// Tests validate the critical bug fix:
// Pattern match changed from Success(_) to Success (unit variant, not tuple)

use super::memory_integration::calculate_success_rate;
use crate::agents::reflexion::{AttemptOutcome, Reflection, ReflectionMemory, TaskAttempt};

/// Helper: create a TaskAttempt with the given task name and outcome
fn make_attempt(task: &str, outcome: AttemptOutcome) -> TaskAttempt {
    let mut attempt = TaskAttempt::new(task);
    attempt.complete(outcome, None);
    attempt
}

/// Test calculate_success_rate with all successful attempts
#[test]
fn test_calculate_success_rate_all_success() {
    let attempts = vec![
        make_attempt("task1", AttemptOutcome::Success),
        make_attempt("task2", AttemptOutcome::Success),
        make_attempt("task3", AttemptOutcome::Success),
    ];

    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 1.0, "All successful attempts should give 100% success rate");
}

/// Test calculate_success_rate with all failed attempts
#[test]
fn test_calculate_success_rate_all_failure() {
    let attempts = vec![
        make_attempt("task1", AttemptOutcome::Failure),
        make_attempt("task2", AttemptOutcome::Failure),
    ];

    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 0.0, "All failed attempts should give 0% success rate");
}

/// Test calculate_success_rate with mixed outcomes (50%)
#[test]
fn test_calculate_success_rate_mixed_50_percent() {
    let attempts = vec![
        make_attempt("task1", AttemptOutcome::Success),
        make_attempt("task2", AttemptOutcome::Failure),
    ];

    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 0.5, "1 success + 1 failure should give 50% success rate");
}

/// Test calculate_success_rate with mixed outcomes (33%)
#[test]
fn test_calculate_success_rate_mixed_33_percent() {
    let attempts = vec![
        make_attempt("task1", AttemptOutcome::Success),
        make_attempt("task2", AttemptOutcome::Failure),
        make_attempt("task3", AttemptOutcome::Failure),
    ];

    let rate = calculate_success_rate(&attempts);
    assert!((rate - 0.333333).abs() < 0.01, "1/3 success rate should be ~0.33");
}

/// Test calculate_success_rate with mixed outcomes (75%)
#[test]
fn test_calculate_success_rate_mixed_75_percent() {
    let attempts = vec![
        make_attempt("task1", AttemptOutcome::Success),
        make_attempt("task2", AttemptOutcome::Success),
        make_attempt("task3", AttemptOutcome::Success),
        make_attempt("task4", AttemptOutcome::Failure),
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
    let attempts = vec![make_attempt("task1", AttemptOutcome::Success)];

    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 1.0, "Single success should give 100% success rate");
}

/// Test calculate_success_rate with single failure
#[test]
fn test_calculate_success_rate_single_failure() {
    let attempts = vec![make_attempt("task1", AttemptOutcome::Failure)];

    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 0.0, "Single failure should give 0% success rate");
}

/// Test calculate_success_rate with large number of attempts
#[test]
fn test_calculate_success_rate_large_dataset() {
    let mut attempts = Vec::new();

    // 70 successes
    for i in 0..70 {
        attempts.push(make_attempt(&format!("success{}", i), AttemptOutcome::Success));
    }

    // 30 failures
    for i in 70..100 {
        attempts.push(make_attempt(&format!("failure{}", i), AttemptOutcome::Failure));
    }

    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 0.7, "70/100 success rate should be 0.7");
}

/// Test that Success pattern matching works correctly (the actual fix being tested)
#[test]
fn test_success_pattern_match_unit_variant() {
    let mut success_attempt = TaskAttempt::new("test");
    success_attempt.complete(AttemptOutcome::Success, None);

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
    let mut failure_attempt = TaskAttempt::new("test");
    failure_attempt.complete(AttemptOutcome::Failure, Some("failed".to_string()));

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
        make_attempt("1", AttemptOutcome::Success),
        make_attempt("2", AttemptOutcome::Failure),
        make_attempt("3", AttemptOutcome::Success),
        make_attempt("4", AttemptOutcome::Failure),
        make_attempt("5", AttemptOutcome::Success),
    ];

    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 0.6, "3/5 alternating should give 0.6");
}

/// Regression test: Verify the fix doesn't break when used with ReflectionMemory
#[test]
fn test_integration_with_reflection_memory() {
    let mut memory = ReflectionMemory::new();

    // Store reflections (ReflectionMemory stores Reflection objects, not TaskAttempt)
    let r1 = Reflection::new(
        "coding task one",
        "Attempted task one",
        AttemptOutcome::Success,
    )
    .with_reflection("worked well");
    memory.store(r1);

    let r2 = Reflection::new(
        "coding task two",
        "Attempted task two",
        AttemptOutcome::Failure,
    )
    .with_reflection("failed");
    memory.store(r2);

    let r3 = Reflection::new(
        "coding task three",
        "Attempted task three",
        AttemptOutcome::Success,
    )
    .with_reflection("worked again");
    memory.store(r3);

    // Build TaskAttempts from the stored reflections to compute success rate
    let all_reflections = memory.all();
    let attempts: Vec<TaskAttempt> = all_reflections
        .iter()
        .map(|r| {
            let mut attempt = TaskAttempt::new(&r.task);
            attempt.complete(r.outcome, None);
            attempt
        })
        .collect();

    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 2.0 / 3.0, "2/3 success rate from reflection memory");
}

/// Edge case: Test with attempts that have identical tasks
#[test]
fn test_identical_tasks() {
    let attempts = vec![
        make_attempt("same_task", AttemptOutcome::Success),
        make_attempt("same_task", AttemptOutcome::Success),
        make_attempt("same_task", AttemptOutcome::Failure),
    ];

    let rate = calculate_success_rate(&attempts);
    assert!((rate - 0.666666).abs() < 0.01);
}

/// Edge case: Test with various non-Success/Failure outcomes
#[test]
fn test_non_binary_outcomes() {
    let attempts = vec![
        make_attempt("task1", AttemptOutcome::Success),
        make_attempt("task2", AttemptOutcome::Partial),
        make_attempt("task3", AttemptOutcome::Timeout),
        make_attempt("task4", AttemptOutcome::Aborted),
    ];

    // Only Success counts as success; Partial/Timeout/Aborted are not Success
    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 0.25, "Only 1/4 is Success");
}

/// Edge case: Test with all non-success, non-failure outcomes
#[test]
fn test_all_partial_outcomes() {
    let attempts = vec![
        make_attempt("task1", AttemptOutcome::Partial),
        make_attempt("task2", AttemptOutcome::Timeout),
    ];

    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 0.0, "Partial and Timeout are not Success");
}

/// Performance test: Large dataset should still be fast
#[test]
fn test_performance_large_dataset() {
    let mut attempts = Vec::new();

    for i in 0..10000 {
        let outcome = if i % 2 == 0 {
            AttemptOutcome::Success
        } else {
            AttemptOutcome::Failure
        };
        attempts.push(make_attempt(&format!("task{}", i), outcome));
    }

    let rate = calculate_success_rate(&attempts);
    assert_eq!(rate, 0.5, "50% success rate for 10k alternating attempts");
}
