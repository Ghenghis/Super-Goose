# Session 7 Audit — Rust Core Agents & Learning Engine

**Auditor**: Audit Agent 3 (Opus 4.6)
**Date**: 2026-02-14
**Branch**: `feat/resizable-layout`
**Scope**: `crates/goose/src/agents/core/` (10 files) + `experience_store.rs`

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1     |
| HIGH     | 5     |
| MEDIUM   | 10    |
| LOW      | 8     |
| **Total** | **24** |

---

## CRITICAL

### C-001: CoreSelector.min_experiences field is never consulted — hardcoded in SQL
**File**: `crates/goose/src/agents/core/selector.rs` (line 43)
**Severity**: CRITICAL
**Description**: `CoreSelector` accepts a `min_experiences: u32` parameter (line 43) and stores it, but `select_for_category()` never passes this value to `ExperienceStore::best_core_for_category()`. The threshold is hardcoded as `HAVING COUNT(*) >= 3` in the SQL query inside `experience_store.rs` (line 426). This means:
- `CoreSelector::new(store, CoreType::Freeform, 10)` claims a threshold of 10 but always uses 3.
- The `min_experiences()` accessor (line 250) returns a misleading value.
- Any caller customizing the threshold (e.g., a cautious production config) gets silently ignored.

**Suggested fix**: Either (a) pass `min_experiences` to `best_core_for_category()` and use a parameterized `HAVING COUNT(*) >= ?2`, or (b) remove the configurable field and document the hardcoded threshold of 3.

---

## HIGH

### C-002: CoreType::from_str shadows std::str::FromStr — name collision
**File**: `crates/goose/src/agents/core/mod.rs` (lines 127-129)
**Severity**: HIGH
**Description**: `CoreType` has both an inherent method `fn from_str(s: &str) -> Self` (line 127) and a `std::str::FromStr` impl (line 145). The inherent method silently defaults to `CoreType::Freeform` on unknown input via `unwrap_or(CoreType::Freeform)`, while the `FromStr` impl returns `Err(...)`. This creates a confusing API:
- `CoreType::from_str("garbage")` returns `CoreType::Freeform` (no error)
- `"garbage".parse::<CoreType>()` returns `Err(...)`
- Callers in `selector.rs` (line 174) use `CoreType::from_str(&core_str)`, silently swallowing DB corruption or schema drift.

**Suggested fix**: Remove the inherent `from_str` method. Replace call sites with `s.parse::<CoreType>().unwrap_or(CoreType::Freeform)` to make the fallback explicit at each call site, or return a Result.

### C-003: OrchestratorCore returns inline metrics snapshot instead of using CoreMetrics
**File**: `crates/goose/src/agents/core/orchestrator_core.rs` (lines 359-374)
**Severity**: HIGH
**Description**: `OrchestratorCore::execute()` constructs a `CoreMetricsSnapshot` inline (lines 364-374) and embeds it in the `CoreOutput`. This snapshot only reflects the *current* execution, whereas all other cores return `CoreMetricsSnapshot::default()` in the output and rely on `self.metrics.snapshot()` for cumulative data via the `metrics()` trait method. The inline snapshot has:
- `total_executions: 1` hardcoded — always claims 1 execution regardless of history
- `success_rate` is 0.0 or 1.0 — no averaging with prior runs
- Inconsistent with FreeformCore, StructuredCore, SwarmCore, WorkflowCore, AdversarialCore which all use `CoreMetricsSnapshot::default()` in the output

This creates a semantic inconsistency: any consumer that reads `CoreOutput.metrics` gets different semantics depending on which core produced it.

**Suggested fix**: Replace the inline snapshot with `CoreMetricsSnapshot::default()` to match other cores, or document a convention that `CoreOutput.metrics` represents per-execution metrics while the trait `metrics()` method returns cumulative metrics.

### C-004: SwarmCore.execute() silently discards route_task errors
**File**: `crates/goose/src/agents/core/swarm_core.rs` (lines 296-301)
**Severity**: HIGH
**Description**: In the task routing loop:
```rust
match swarm.route_task(task_item) {
    Ok(_agent_id) => routed_count += 1,
    Err(_) => {} // Skip unroutable tasks
}
```
Routing failures are silently ignored. If *all* tasks fail to route (e.g., no agents with matching capabilities), the core still reports `completed: true` (line 348) because the batch processor marks everything as completed unconditionally (lines 308-310). This means a completely broken routing configuration is reported as success.

**Suggested fix**: Log routing failures with `tracing::warn!`, and if `routed_count == 0`, return `completed: false` or at minimum include a warning in the summary.

### C-005: SwarmCore.execute() unconditionally marks all batch tasks as completed
**File**: `crates/goose/src/agents/core/swarm_core.rs` (lines 307-310)
**Severity**: HIGH
**Description**:
```rust
for _ in 0..swarm_tasks.len() {
    batch.record_completion(true);
}
```
Every batch task is unconditionally recorded as successfully completed, regardless of whether it was actually routed or executed. This makes the progress and completion metrics meaningless. Combined with C-004, the entire execute path is a simulation that always succeeds.

**Suggested fix**: Wire `record_completion` to actual execution results. If this is intentional simulation pending real agent wiring, add a `// TODO: wire to real execution` comment and set `completed` based on `routed_count > 0`.

### C-006: TaskHint::from_message category detection overlaps ambiguously with CoreSelector::categorize_task
**File**: `crates/goose/src/agents/core/context.rs` (lines 129-163) and `crates/goose/src/agents/core/selector.rs` (lines 69-107)
**Severity**: HIGH
**Description**: There are two independent keyword-based task categorization implementations:
1. `TaskHint::from_message()` — used by `AgentCoreRegistry::recommend_core()` via hint creation
2. `CoreSelector::categorize_task()` — used by `CoreSelector::select_core()`

These diverge in significant ways:
- `TaskHint::from_message("deploy pipeline")` returns `TaskCategory::DevOps` (line 137: `lower.contains("deploy")`)
- `CoreSelector::categorize_task("deploy pipeline")` returns `"devops"` (line 89: `lower.contains("deploy")`) — same here
- BUT `TaskHint::from_message("build a pipeline")` returns `TaskCategory::Pipeline` (line 143: `lower.contains("pipeline")`)
- While `CoreSelector::categorize_task("build a pipeline")` returns `"devops"` (line 93: `lower.contains("pipeline")`)

The `Pipeline` vs `DevOps` distinction differs between the two. Additionally:
- `TaskHint::from_message` checks `"ci"` (line 137), but `categorize_task` checks `"ci "` with trailing space (line 92) and `"ci/cd"` (line 91)
- `TaskHint::from_message` does not detect `MultiFileComplex` at all — there is no keyword path that produces it

This means the same task can get a different core recommendation depending on whether it enters via `select_core()` or via `select_with_hint()` after `TaskHint::from_message()`.

**Suggested fix**: Consolidate into a single categorization function. Either `TaskHint::from_message()` should call `CoreSelector::categorize_task()` internally (mapping string back to enum), or both should share a unified keyword table.

---

## MEDIUM

### C-007: StructuredCore returns CoreMetricsSnapshot::default() in CoreOutput, losing per-execution data
**File**: `crates/goose/src/agents/core/structured.rs` (line 500)
**Severity**: MEDIUM
**Description**: The `CoreOutput.metrics` field is always `CoreMetricsSnapshot::default()` (all zeros). The actual execution data is recorded in `self.metrics.record_execution(...)` (line 493) but the returned output has no per-execution metrics. This is consistent with FreeformCore and others, but means `CoreOutput.metrics` is useless across all cores except OrchestratorCore (which has C-003). The field either needs a defined semantic or should be removed from CoreOutput.

**Suggested fix**: Either populate `CoreOutput.metrics` with per-execution data in all cores, or remove the field from `CoreOutput` and rely exclusively on the trait `metrics()` method.

### C-008: detect_project_type parameter takes &PathBuf instead of &Path
**File**: `crates/goose/src/agents/core/structured.rs` (line 50)
**Severity**: MEDIUM
**Description**: `fn detect_project_type(task: &str, working_dir: &PathBuf)` — Clippy recommends `&Path` over `&PathBuf` for function parameters since `&PathBuf` auto-derefs to `&Path`. This is an idiomatic Rust concern.

**Suggested fix**: Change signature to `working_dir: &Path` and add `use std::path::Path;`.

### C-009: WorkflowCore execution loop has no sleep/yield between poll iterations
**File**: `crates/goose/src/agents/core/workflow_core.rs` (lines 216-228)
**Severity**: MEDIUM
**Description**: The polling loop:
```rust
for _ in 0..max_poll_iterations {
    let status = engine.get_execution_status(workflow_id).await;
    match status {
        Some(Completed | Failed | Cancelled) => break,
        _ => {
            let _ = engine.run_execution_loop().await;
        }
    }
}
```
Has no `tokio::time::sleep()` between iterations. If `run_execution_loop()` returns immediately without making progress, this becomes a busy-wait loop that can spin up to 100 times before exiting. While each call is async, if the underlying implementation is non-blocking, this wastes CPU.

**Suggested fix**: Add `tokio::time::sleep(Duration::from_millis(10)).await;` before continuing the loop, or detect "no progress made" and break early.

### C-010: AdversarialCore build_adversarial_config computes _quality but never uses it
**File**: `crates/goose/src/agents/core/adversarial_core.rs` (line 77)
**Severity**: MEDIUM
**Description**: `let _quality = determine_quality_level(task);` — the quality level is computed but bound to `_quality` (prefixed underscore = intentionally unused). The config values (max_review_cycles, require_approval) do not vary based on `_quality`, only on raw keyword checks that partially overlap with `determine_quality_level`. For example, `QualityLevel::Strict` implies "production" or "critical", but `max_review_cycles` is already set to 5 for tasks containing "critical" regardless of quality level.

**Suggested fix**: Either use `quality` to drive config values (e.g., `Strict` => 5 cycles, `Relaxed` => 2, `Default` => 3), or remove the unused computation.

### C-011: FreeformCore.execute() timing measurement is meaningless
**File**: `crates/goose/src/agents/core/freeform.rs` (lines 103-105)
**Severity**: MEDIUM
**Description**:
```rust
let start = std::time::Instant::now();
let task_preview = truncate(task, 100);
let elapsed = start.elapsed();
```
This measures the time to call `truncate()` on a string, which is sub-microsecond. The actual execution happens in `Agent::reply_internal()` which runs *outside* this method (per the architecture note on lines 81-101). The recorded `elapsed.as_millis()` will always be 0. While the comment explains this is pass-through, the metrics recording is misleading — it records executions with 0ms time, polluting avg_time_ms calculations.

**Suggested fix**: Either skip the timing and pass 0 explicitly with a comment, or record a sentinel value (e.g., `u64::MAX`) to indicate "not measured here".

### C-012: truncate function comment on line 275 contains incorrect analysis
**File**: `crates/goose/src/agents/core/mod.rs` (lines 274-277)
**Severity**: MEDIUM
**Description**: The test comment says:
```rust
assert_eq!(truncate(s, 4), "caf\u{00e9}"); // 4 is inside the 2-byte char, rounds down to 3+2=boundary at 5? No: boundary at 3 is before the 2-byte char
// Actually byte 4 is in the middle of the 2-byte e-acute (bytes 3-4), so we fall back to byte 3
assert_eq!(truncate(s, 4), "caf");
```
The first assertion on line 275 asserts `truncate(s, 4)` equals `"caf\u{00e9}"` (5 bytes), then the second assertion on line 277 asserts `truncate(s, 4)` equals `"caf"` (3 bytes). These two assertions are contradictory for the same input. Only one can be correct. Looking at the actual code: `max_bytes=4` with `"caf\u{00e9}!"` (bytes: `c=0, a=1, f=2, 0xC3=3, 0xA9=4, !=5`) — byte 4 is `0xA9` which is NOT a char boundary (it's the continuation byte of the 2-byte e-acute). So the loop walks back to byte 3, then byte 3 is `0xC3` which is also NOT a char boundary (it's the start of a multi-byte char, but `is_char_boundary` returns true at the *start* of a multi-byte sequence). Wait: `is_char_boundary(3)` is true because byte 3 is the start of the `\u{00e9}` character. So `truncate(s, 4)` returns `&s[..3]` which is `"caf"`.

Actually, re-reading: the function walks back from `end=4`. `is_char_boundary(4)` — byte 4 is `0xA9`, a continuation byte, so NOT a boundary. `end=3`. `is_char_boundary(3)` — byte 3 is `0xC3`, the lead byte of a 2-byte sequence. This IS a char boundary. So the result is `&s[..3]` = `"caf"`.

The first assertion on line 275 is dead code in practice — there is a second assertion on line 277 for the same input that contradicts it. However, Rust runs both assertions sequentially: the first one (`"caf\u{00e9}"`) would FAIL at runtime because the actual answer is `"caf"`. This test should be failing.

Wait — looking more carefully at lines 274-278:
```
assert_eq!(truncate(s, 5), "caf\u{00e9}"); // cuts the '!'
assert_eq!(truncate(s, 4), "caf\u{00e9}"); // 4 is inside the 2-byte char...
// Actually byte 4 is in the middle...
assert_eq!(truncate(s, 4), "caf");
```
Line 274 tests `truncate(s, 5)` (not 4), and line 275 tests `truncate(s, 4)`. If both line 275 and line 277 test `truncate(s, 4)`, the first would fail. But upon re-reading the raw output: line 275 tests `truncate(s, 4)` and asserts `"caf\u{00e9}"`. Line 277 tests `truncate(s, 4)` and asserts `"caf"`. Only one can pass. Since cargo test passes (per session notes), one of these must be different than what I'm reading. The comment is at minimum confusing and should be cleaned up.

**UPDATE**: Re-reading the actual line numbers more carefully:
- Line 274: `assert_eq!(truncate(s, 5), "caf\u{00e9}");` — max_bytes=5, boundary at 5 is valid (after the 2-byte char), result is the e-acute without the `!`. Correct.
- Line 275-276: This is a COMMENT, not code. The `assert_eq!` macro does not span these lines.
- Line 277: `assert_eq!(truncate(s, 4), "caf");` — max_bytes=4, walks back to boundary 3, result is `"caf"`. Correct.

So the comment on lines 275-276 is just confusing narration but the assertions themselves are correct. Downgrading concern — the comment is misleading but not a bug.

**Suggested fix**: Clean up the comment to be less confusing. Remove the incorrect initial analysis and just state the expected behavior.

### C-013: Duplicated create_test_context() across 4 core test modules
**File**: `structured.rs` (line 523), `orchestrator_core.rs` (line 560), `swarm_core.rs` (line 375), `adversarial_core.rs` (line 277), `workflow_core.rs` (line 309), `integration_tests.rs` (line 27)
**Severity**: MEDIUM
**Description**: The `create_test_context()` / `test_context()` helper function is copy-pasted identically across 6 files. Each creates an `AgentContext` with `Arc::new(tokio::sync::Mutex::new(None))` for the provider, a new `ExtensionManager`, and `CostTracker::with_default_pricing()`. Any change to the `AgentContext::new()` signature requires updating all 6 copies.

**Suggested fix**: Extract to a shared test utility module, e.g., `#[cfg(test)] pub mod test_helpers` in `context.rs` or a dedicated `test_utils.rs`.

### C-014: CoreCapabilities.max_concurrent_tasks defaults to 0
**File**: `crates/goose/src/agents/core/mod.rs` (line 72, via `#[derive(Default)]`)
**Severity**: MEDIUM
**Description**: `CoreCapabilities` derives `Default`, which sets `max_concurrent_tasks` to 0. All actual core implementations override this (FreeformCore=1, OrchestratorCore=4, SwarmCore=8, etc.), but any code that constructs `CoreCapabilities::default()` gets a value of 0 which could be used in division or capacity calculations. A `max_concurrent_tasks` of 0 is semantically "cannot run any tasks" which is likely not the intended default.

**Suggested fix**: Implement `Default` manually with `max_concurrent_tasks: 1`.

### C-015: categorize_task misses MultiFileComplex — no keyword path produces it
**File**: `crates/goose/src/agents/core/selector.rs` (lines 69-107)
**Severity**: MEDIUM
**Description**: `CoreSelector::categorize_task()` never returns `"multi-file-complex"`. The `TaskCategory::MultiFileComplex` variant exists and is mapped by `category_to_string()`, and `OrchestratorCore` has the highest suitability score (0.95) for it, but no keyword path in `categorize_task()` can produce this category. Tasks like "implement a feature across multiple files" would be categorized as "general", missing the orchestrator.

Similarly, `TaskHint::from_message()` in `context.rs` also has no path to `TaskCategory::MultiFileComplex`.

**Suggested fix**: Add keyword detection for multi-file tasks. For example: `if lower.contains("multiple files") || lower.contains("multi-file") || (lower.contains("implement") && lower.contains("across"))`.

### C-016: Registry::recommend_core tie-breaking is nondeterministic
**File**: `crates/goose/src/agents/core/registry.rs` (lines 137-143)
**Severity**: MEDIUM
**Description**: The `recommend_core()` method iterates over `self.cores` (a `HashMap`) and picks the first core with the highest score. `HashMap` iteration order is not guaranteed in Rust, so if two cores have the same suitability score for a given task category, the winner is arbitrary and can change between runs. The current suitability matrices avoid exact ties, but any future modification could introduce them.

**Suggested fix**: Break ties deterministically, e.g., by preferring the core with the lower `CoreType` ordinal, or by using a `BTreeMap` instead of `HashMap`.

---

## LOW

### C-017: #[allow(unused_imports)] on TeamCoordinator import
**File**: `crates/goose/src/agents/core/swarm_core.rs` (lines 21-22)
**Severity**: LOW
**Description**: `#[allow(unused_imports)] use crate::agents::team::{TeamConfig, TeamCoordinator};` — this import is explicitly suppressed and never used. It is annotated as "available for future parallel coordination" but has been unused across multiple sessions.

**Suggested fix**: Remove the suppressed import. Re-add when actually needed.

### C-018: Unused import ReviewStats in adversarial_core.rs
**File**: `crates/goose/src/agents/core/adversarial_core.rs` (line 17)
**Severity**: LOW
**Description**: `use crate::agents::adversarial::{AdversarialConfig, ReviewCycle, ReviewOutcome, ReviewStats};` — `ReviewStats` is used in `build_review_summary` signature (line 102) so this is actually used. False positive. (Retracted.)

**Revised**: No issue here.

### C-019: WorkflowCore match_template "service" keyword is overly broad
**File**: `crates/goose/src/agents/core/workflow_core.rs` (line 56)
**Severity**: LOW
**Description**: `if lower.contains("service")` matches any task containing "service" including "customer service chat" or "service documentation". This would route them to the `"microservice"` template, which is likely inappropriate.

**Suggested fix**: Use more specific patterns like `"microservice"` or `"web service"` or `"rest service"`.

### C-020: build_execution_config language detection for "go" is too broad
**File**: `crates/goose/src/agents/core/workflow_core.rs` (lines 93-94)
**Severity**: LOW
**Description**: `lower.contains("go")` matches "go to the store" or "let's go deploy". Should use word boundary matching.

**Suggested fix**: Check for `" go "` with spaces, or `lower.split_whitespace().any(|w| w == "go" || w == "golang")`.

### C-021: extract_module_name does not handle non-ASCII or special characters in module names
**File**: `crates/goose/src/agents/core/structured.rs` (lines 155-177)
**Severity**: LOW
**Description**: The function filters to `c.is_alphanumeric() || *c == '_'` which is fine for Rust identifiers but would strip hyphens from names like "my-module" producing "mymodule". Not a bug per se but the naming heuristic could produce confusing file names.

**Suggested fix**: Consider converting hyphens to underscores: `.map(|c| if c == '-' { '_' } else { c })`.

### C-022: SwarmCore DecomposedTask uses format!("{:?}", role) for agent IDs
**File**: `crates/goose/src/agents/core/swarm_core.rs` (line 163)
**Severity**: LOW
**Description**: `let id = format!("agent-{:?}", role).to_lowercase().replace(' ', "-");` uses Debug formatting for the agent ID. If `SwarmRole`'s Debug output changes (e.g., adding fields), the ID format changes. Using a dedicated `Display` or `as_str()` method would be more stable.

**Suggested fix**: Use a stable string representation instead of `{:?}`.

### C-023: CoreMetrics uses Relaxed ordering for all atomics
**File**: `crates/goose/src/agents/core/metrics.rs` (lines 37-46, 50-56, 86-93)
**Severity**: LOW
**Description**: All `AtomicU32`/`AtomicU64` operations use `Ordering::Relaxed`. This is fine for independent counters, but `snapshot()` reads multiple atomics sequentially. On a highly concurrent system, it is possible to observe a `total_executions` of 10 but a `successful + failed` sum of 11 if another thread records between reads. The snapshot is not atomic across fields.

**Suggested fix**: For truly consistent snapshots, use a `Mutex<InnerMetrics>` instead of individual atomics. However, the current approach is acceptable for monitoring/display purposes where exact consistency is not required. Document this as a known limitation.

### C-024: Integration test test_selector_picks_freeform_for_documentation may be fragile
**File**: `crates/goose/src/agents/core/integration_tests.rs` (lines 100-111)
**Severity**: LOW
**Description**: The test asserts `result.core_type == CoreType::Freeform` for "write documentation for the API". Looking at the suitability scores:
- FreeformCore: Documentation => 0.8
- WorkflowCore: Documentation => 0.6
- SwarmCore: Documentation => 0.5

Freeform wins with 0.8, but this is a design question — documentation generation could reasonably belong to a workflow or orchestrator. The test encodes the current scoring, which means any rebalancing of scores will break this test. Not a bug, but the assertion couples tightly to the scoring matrix.

**Suggested fix**: Add a comment explaining why Freeform is expected for documentation tasks, or use a range-based assertion.

---

## Observations (Not Bugs)

### O-001: FreeformCore dispatcher refactor is a known gap
The `FreeformCore.execute()` method is a documented pass-through (lines 81-101). The real execution happens in `Agent::reply_internal()`. This is the "FreeformCore dispatcher refactor" noted in the project memory as a remaining integration gap. Not a bug, but the architecture means FreeformCore metrics are based on the pass-through call, not actual execution.

### O-002: StructuredCore uses heuristic callbacks, not real LLM calls
The `generate_code()`, `run_tests()`, and `fix_failures()` functions (lines 86-347) are heuristic-based, not wired to the LLM provider. Tests always pass because `run_tests()` returns `TestStatus::Passed` unconditionally (unless `iteration_context == Some("fixed")`). The `use_done_gate: false` flag (line 436) disables the DoneGate to avoid shell-based validation in test environments. This is documented behavior but means StructuredCore never actually fails in tests.

### O-003: All cores have solid trait compliance
All 6 cores (`FreeformCore`, `StructuredCore`, `OrchestratorCore`, `SwarmCore`, `WorkflowCore`, `AdversarialCore`) correctly implement all 8 methods of the `AgentCore` trait: `name()`, `core_type()`, `capabilities()`, `description()`, `suitability_score()`, `execute()`, `metrics()`, `reset_metrics()`. No missing implementations.

### O-004: Test coverage is comprehensive
Integration tests cover: core selection by category, dispatch round-trips, fallback chains, experience-based selection, user preference override, concurrent safety, metrics lifecycle, and core switching. The 29 integration tests + per-core unit tests provide good coverage.

### O-005: truncate() UTF-8 safety is correct
The `truncate()` function (mod.rs lines 171-181) correctly handles UTF-8 boundaries including multi-byte characters and emoji. The `is_char_boundary()` walk-back approach is the standard Rust idiom. Tests cover ASCII, 2-byte, 4-byte characters, and edge cases (0 length, empty string).

---

## Files Audited

| File | Lines | Findings |
|------|-------|----------|
| `mod.rs` | 297 | C-002, C-012, C-014 |
| `freeform.rs` | 189 | C-011 |
| `structured.rs` | 713 | C-007, C-008, C-021 |
| `orchestrator_core.rs` | 579 | C-003, C-013 |
| `swarm_core.rs` | 483 | C-004, C-005, C-017, C-022 |
| `adversarial_core.rs` | 409 | C-010 |
| `workflow_core.rs` | 430 | C-009, C-019, C-020 |
| `registry.rs` | 312 | C-016 |
| `selector.rs` | 573 | C-001, C-006, C-015 |
| `integration_tests.rs` | 657 | C-024 |
| `metrics.rs` | 208 | C-023 |
| `context.rs` | 242 | C-006 (shared) |
