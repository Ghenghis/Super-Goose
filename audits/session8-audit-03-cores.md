# Session 8 Audit Report: Rust Core Agents & Learning Engine

**Audit Agent**: 3 of 5 (Cores & Learning)
**Date**: 2026-02-14
**Branch**: `feat/resizable-layout`
**Scope**: `crates/goose/src/agents/core/` (all 12 files) + `crates/goose/src/agents/` (experience_store, insight_extractor, skill_library, reflexion, capabilities)

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH | 6 |
| MEDIUM | 8 |
| LOW | 5 |
| **Total** | **21** |

Files audited: 17 files, ~7,500 lines of Rust

---

## Findings

### C-001: Test asserts wrong default for max_concurrent_tasks (CRITICAL)

**File**: `crates/goose/src/agents/core/mod.rs:275`

**Issue**: The test `test_core_capabilities_default` asserts `max_concurrent_tasks == 0`, but the `Default` impl for `CoreCapabilities` (line 87) explicitly sets it to `1`. This test **will fail** when run.

```rust
// Line 87 — Default impl sets 1:
max_concurrent_tasks: 1, // Default to 1, not 0

// Line 275 — Test expects 0:
assert_eq!(caps.max_concurrent_tasks, 0);
```

**Fix**: Change the test assertion to match the Default impl:
```rust
assert_eq!(caps.max_concurrent_tasks, 1);
```

---

### C-002: Adversarial test expects wrong max_review_cycles value (CRITICAL)

**File**: `crates/goose/src/agents/core/adversarial_core.rs:355`

**Issue**: `test_build_config_review` calls `build_adversarial_config("code review the PR changes")` and asserts `max_review_cycles == 4`. However, the string "code review the PR changes" does not contain any `Strict` keywords ("production", "security audit", "release", "critical", "strict") nor any `Relaxed` keywords ("prototype", "draft", "quick", "rough", "relaxed"). It maps to `QualityLevel::Default`, which produces `max_cycles = 3`, not 4.

```rust
// Line 79-82 — Quality mapping:
QualityLevel::Strict => 5,
QualityLevel::Default => 3,  // <-- "code review" hits this
QualityLevel::Relaxed => 2,

// Line 355 — Test expects 4 (wrong):
assert_eq!(config.max_review_cycles, 4);
```

**Fix**: Change the test expectation to 3:
```rust
assert_eq!(config.max_review_cycles, 3);
```

---

### C-003: SwarmCore always reports completed:true even on routing failures (HIGH)

**File**: `crates/goose/src/agents/core/swarm_core.rs:345-352`

**Issue**: `SwarmCore::execute()` always passes `true` to `record_execution()` and always sets `completed: true` in `CoreOutput`, regardless of how many tasks failed routing. If all tasks fail routing (`routed_count == 0`), the output still says "completed successfully."

Additionally, lines 323-326 mark ALL tasks as "OK" in the summary text regardless of actual outcome:
```rust
for (desc, role, _, _) in &decomposed {
    summary_parts.push(format!("  [{:?}] {} — OK", role, desc));
}
```

**Fix**: Use routing success to determine completion status:
```rust
let all_routed = failed_count == 0;
self.metrics.record_execution(all_routed, ...);

Ok(CoreOutput {
    completed: all_routed,
    ...
})
```
And update the summary loop to distinguish routed vs. failed tasks.

---

### C-004: TaskAttempt::complete() unsafe negative-duration cast (HIGH)

**File**: `crates/goose/src/agents/reflexion.rs:126`

**Issue**: The `complete()` method casts a `chrono::Duration` to `u64`:
```rust
self.duration_ms = (self.ended_at - self.started_at).num_milliseconds() as u64;
```
If `ended_at < started_at` (e.g., due to clock skew, NTP adjustment, or VM time resets), `num_milliseconds()` returns a negative `i64`. Casting a negative `i64` to `u64` wraps around to an astronomically large value (near `u64::MAX`), which would corrupt duration metrics, experience store records, and any downstream calculations.

**Fix**: Use `max(0)` or `unsigned_abs()`:
```rust
self.duration_ms = (self.ended_at - self.started_at)
    .num_milliseconds()
    .max(0) as u64;
```

---

### C-005: ReflectionMemory fire-and-forget SQLite writes silently lose data (HIGH)

**File**: `crates/goose/src/agents/reflexion.rs:349-358`

**Issue**: `ReflectionMemory::store()` persists reflections to SQLite via `tokio::spawn()` with no await or result tracking. If the spawn fails (runtime shutdown, task panic, DB error), the data is silently lost. The same pattern appears in `clear()` at lines 444-451.

While the in-memory cache retains the data, if the process crashes after the `store()` call but before the spawn completes, the reflection is permanently lost from the persistent store. This undermines the cross-session learning guarantee.

```rust
tokio::spawn(async move {
    if let Err(e) = store.store(&r).await {
        tracing::warn!("Failed to persist reflection to SQLite: {}", e);
    }
});
```

**Fix**: Consider returning a `JoinHandle` or using a bounded write-behind channel so callers can optionally await persistence. At minimum, add an `async fn store_persisted()` alternative that awaits the write.

---

### C-006: Registry active_core() uses .expect() that could panic (HIGH)

**File**: `crates/goose/src/agents/core/registry.rs:57`

**Issue**: `active_core()` uses `.expect()` which will panic if the active core type somehow gets desynced from the cores HashMap:
```rust
self.cores
    .get(&active_type)
    .cloned()
    .expect("Active core type must exist in registry")
```
While this is theoretically guarded by construction (the `switch_core` method validates), any future code path that modifies `cores` without updating `active_core` would cause a production panic.

**Fix**: Return `Result` or use `ok_or_else` with anyhow:
```rust
pub async fn active_core(&self) -> Result<Arc<dyn AgentCore>> {
    let active_type = *self.active_core.read().await;
    self.cores.get(&active_type).cloned()
        .ok_or_else(|| anyhow!("Active core type '{}' not in registry", active_type))
}
```

---

### C-007: CoreSelector min_experiences field is dead code (HIGH)

**File**: `crates/goose/src/agents/core/selector.rs:43`

**Issue**: The `min_experiences` field is stored in `CoreSelector` and configurable via the constructor (default: 3), but it is **never read** during selection logic. The minimum experience threshold is instead hardcoded in `ExperienceStore::best_core_for_category()` as `HAVING COUNT(*) >= 3`.

This means:
1. Changing `min_experiences` via the constructor has no effect
2. The `min_experiences()` getter at line 258 returns a value that doesn't match actual behavior
3. The doc comments at line 12 ("Minimum data points before trusting historical stats") are misleading

```rust
// selector.rs:43 — stored but never used:
min_experiences: u32,

// experience_store.rs:426 — hardcoded threshold:
HAVING COUNT(*) >= 3
```

**Fix**: Either:
- Pass `min_experiences` as a parameter to `best_core_for_category()` and use it in the SQL, OR
- Remove the field from `CoreSelector` and document the hardcoded threshold

---

### C-008: CoreType::from_str silently converts unknown types to Freeform (HIGH)

**File**: `crates/goose/src/agents/core/mod.rs:144-146`

**Issue**: The inherent `from_str` method silently falls back to `CoreType::Freeform` for any unrecognized input:
```rust
pub fn from_str(s: &str) -> Self {
    s.parse::<CoreType>().unwrap_or(CoreType::Freeform)
}
```
This masks bugs — if experience_store or config returns a corrupted/misspelled core type string, it silently becomes Freeform instead of surfacing the error. This is especially dangerous in `ExperienceStore::row_to_experience()` (line 506) where a corrupted DB value would be silently accepted.

Note: The `FromStr` trait impl (line 162) correctly returns `Err` for unknown types, but this separate inherent method bypasses that safety.

**Fix**: Remove the inherent `from_str` and use the `FromStr` trait directly with proper error handling at call sites, or at minimum log a warning when falling back:
```rust
pub fn from_str(s: &str) -> Self {
    match s.parse::<CoreType>() {
        Ok(ct) => ct,
        Err(_) => {
            tracing::warn!("Unknown core type '{}', defaulting to Freeform", s);
            CoreType::Freeform
        }
    }
}
```

---

### C-009: experience_store recent() uses format! for SQL LIMIT clause (MEDIUM)

**File**: `crates/goose/src/agents/experience_store.rs:480-483`

**Issue**: The `recent()` method builds the SQL query with `format!` for the LIMIT:
```rust
let rows = sqlx::query(
    &format!(
        "SELECT * FROM experiences ORDER BY created_at DESC, rowid DESC LIMIT {}",
        limit
    ),
)
```
While `limit` is `usize` (not user-controlled string), this bypasses sqlx's parameterized query protection. It cannot cause SQL injection here, but it's a bad pattern that could be copy-pasted into a vulnerable context.

**Fix**: Use a parameterized query:
```rust
sqlx::query("SELECT * FROM experiences ORDER BY created_at DESC, rowid DESC LIMIT ?1")
    .bind(limit as i64)
```

---

### C-010: experience_store find_relevant() duplicates parameter bindings (MEDIUM)

**File**: `crates/goose/src/agents/experience_store.rs:298-313`

**Issue**: The `find_relevant()` method builds dynamic SQL with `format!` for the score expression structure, then binds parameters twice — once for the WHERE clause and once for the ORDER BY clause:
```rust
for param in &params {
    q = q.bind(param);  // WHERE
}
for param in &params {
    q = q.bind(param);  // ORDER BY
}
```
This works but is fragile: the parameter count depends on the score_expr being referenced exactly twice in the query string. If someone adds or removes a reference, the bind counts silently go wrong and produce incorrect results (or a runtime error).

**Fix**: Use a CTE or subquery to compute the score once, then reference it in both WHERE and ORDER BY without double-binding.

---

### C-011: Registry recommend_core() HashMap iteration is non-deterministic (MEDIUM)

**File**: `crates/goose/src/agents/core/registry.rs:137-143`

**Issue**: `recommend_core()` iterates over `self.cores` (a `HashMap`) with a simple `>` comparison. When two cores have exactly equal suitability scores, the winner depends on HashMap iteration order, which is non-deterministic (randomized per Rust's default hasher). This means the same task can get different core recommendations between runs.

```rust
for (core_type, core) in &self.cores {
    let score = core.suitability_score(hint);
    if score > best_score {  // strict >, not >=
        best_score = score;
        best_type = *core_type;
    }
}
```

**Fix**: Add a deterministic tie-breaker (e.g., prefer the core with a lower ordinal CoreType, or use a `BTreeMap`):
```rust
if score > best_score || (score == best_score && (*core_type as u8) < (best_type as u8)) {
```

---

### C-012: Metrics snapshot() reads are not atomic across fields (MEDIUM)

**File**: `crates/goose/src/agents/core/metrics.rs:50-82`

**Issue**: `CoreMetrics::snapshot()` performs 5 separate `load(Ordering::Relaxed)` calls. Since these are individual atomic loads, a concurrent `record_execution()` could interleave between reads, producing an inconsistent snapshot (e.g., `total_executions = 2` but `successful + failed = 3` if a new execution was recorded between reads).

For metrics dashboards this is acceptable (eventual consistency), but if any code path uses the snapshot for correctness decisions (e.g., checking if success_rate > threshold), it could be wrong.

**Fix**: For critical paths, either use a Mutex-guarded snapshot or accept the eventual consistency with a doc comment warning. A simple improvement: read `total_executions` first and last, and retry if it changed:
```rust
// Add doc comment noting non-atomic reads:
/// Note: snapshot reads are not atomic across fields. Under concurrent
/// updates, field values may be slightly inconsistent.
```

---

### C-013: Adversarial artifact deduplication is O(n^2) (MEDIUM)

**File**: `crates/goose/src/agents/core/adversarial_core.rs:220-227`

**Issue**: File deduplication in `execute()` uses `Vec::contains()` which is O(n) per check, making the overall dedup O(n*m) where n=total files and m=unique files:
```rust
for file in &feedback.player_result.files_changed {
    let path_str = file.to_string_lossy().to_string();
    if !artifacts.contains(&path_str) {
        artifacts.push(path_str);
    }
}
```

**Fix**: Use a `HashSet` for deduplication:
```rust
let mut seen = std::collections::HashSet::new();
for file in &feedback.player_result.files_changed {
    let path_str = file.to_string_lossy().to_string();
    if seen.insert(path_str.clone()) {
        artifacts.push(path_str);
    }
}
```

---

### C-014: OrchestratorCore execute_next_task loop can exit prematurely (MEDIUM)

**File**: `crates/goose/src/agents/core/orchestrator_core.rs:294-310`

**Issue**: The execution loop breaks when `execute_next_task()` returns `false` (no task executed):
```rust
if !executed {
    break;
}
```
But this could be a temporary state — tasks might be blocked waiting on dependencies that haven't completed yet. If a slow-running task hasn't finished but its dependents are waiting, the loop exits prematurely and reports the workflow as incomplete.

**Fix**: Only break on `!executed` after checking that no tasks are in-progress:
```rust
if !executed {
    let any_in_progress = orchestrator.has_running_tasks(workflow_id).await?;
    if !any_in_progress {
        break;
    }
    // Otherwise yield and retry
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
}
```

---

### C-015: ReflectionMemory index_and_push does not update indices on clear (MEDIUM)

**File**: `crates/goose/src/agents/reflexion.rs:364-382, 438-452`

**Issue**: After `clear()`, new `store()` calls rebuild indices starting from `idx = 0`. But there's a subtle correctness issue: if `load_from_store()` is called after `clear()` + `store()`, it calls `clear()` again (line 335) then rebuilds from SQLite. This is correct for full reloads, but partial operations between `store()` and a subsequent `load_from_store()` could have stale in-memory state if the spawn for SQLite write hasn't completed yet.

**Fix**: Document the expected usage pattern (load_from_store is for initialization only) or use a write-behind lock to ensure SQLite catches up before load.

---

### C-016: StructuredCore run_tests returns heuristic results, never real tests (MEDIUM)

**File**: `crates/goose/src/agents/core/structured.rs` (generate_code and run_tests functions)

**Issue**: The `run_tests()` function returns heuristic/synthetic test results rather than actually executing any tests. While this is documented as "Phase 1.3", the `execute()` method treats these results as authoritative for its Code-Test-Fix loop, meaning the FSM's "Fix" phase is reacting to phantom failures.

Combined with the fact that `generate_code()` returns file path descriptions rather than actual code, the entire StructuredCore execution path is effectively a simulation. The `completed: true` output gives users a false sense of accomplishment.

**Fix**: Add a clear indicator in the CoreOutput summary (e.g., "[SIMULATED]") until real LLM code generation and test execution are wired in.

---

### C-017: WorkflowCore polling loop has no overall timeout (MEDIUM)

**File**: `crates/goose/src/agents/core/workflow_core.rs:216-230`

**Issue**: The polling loop has `max_poll_iterations = 100` as a safety limit, but each iteration includes `tokio::time::sleep(10ms)` plus execution time. If `run_execution_loop()` takes significant time per call, the total wall time is unbounded. There's no overall timeout guard:
```rust
let max_poll_iterations = 100;
for _ in 0..max_poll_iterations {
    // ...
    let _ = engine.run_execution_loop().await;
    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
}
```

**Fix**: Add a wall-clock timeout:
```rust
let deadline = std::time::Instant::now() + std::time::Duration::from_secs(300);
for _ in 0..max_poll_iterations {
    if std::time::Instant::now() > deadline {
        tracing::warn!("WorkflowCore: hit wall-clock timeout");
        break;
    }
    // ...
}
```

---

### C-018: CoreSelector categorize_task has keyword priority issues (LOW)

**File**: `crates/goose/src/agents/core/selector.rs:69-113`

**Issue**: The keyword matching chain uses early returns, so a task containing both "test" + "fix" AND "refactor" + "all" will always match "code-test-fix" first (line 72) and never reach "large-refactor" (line 85). Example: "test and fix the refactored modules across all files" categorizes as "code-test-fix" when "large-refactor" would be more appropriate.

Similarly, "deploy pipeline" matches "devops" (line 96) before it could match "pipeline" (there's no separate pipeline category check — it falls to "devops"). The `TaskCategory::Pipeline` variant is only reachable via `category_to_string()`, not via `categorize_task()`.

**Fix**: Consider a scoring approach instead of first-match, or document the priority order clearly.

---

### C-019: Experience `record()` uses avg_turns instead of actual turns (LOW)

**File**: `crates/goose/src/agents/experience_store.rs:264`

**Issue**: The `record()` convenience method passes `metrics.avg_turns as u32` for the turns count:
```rust
let exp = Experience::new(
    task,
    core_type,
    succeeded,
    metrics.avg_turns as u32,  // Should be actual turns, not average
    metrics.total_cost_dollars,
    metrics.avg_time_ms as u64,
);
```
If multiple executions have been recorded in the metrics, `avg_turns` is the running average, not the turns for this specific execution. Similarly, `avg_time_ms` is an average, not the actual time for this run.

**Fix**: Accept the actual turn count and time as separate parameters, or use a per-execution snapshot rather than the cumulative metrics.

---

### C-020: FreeformCore always records success even when not executing (LOW)

**File**: `crates/goose/src/agents/core/freeform.rs:118`

**Issue**: `FreeformCore::execute()` always calls `self.metrics.record_execution(true, 0, 0, 0)` — recording a success with 0 turns and 0 time. Since the actual execution happens in `Agent::reply_internal()` which bypasses this method, the metrics for FreeformCore are always "100% success, 0 turns, 0ms", which is misleading for any dashboard or selection logic.

**Fix**: Either don't record metrics in the pass-through (remove the `record_execution` call) or wire the actual metrics from `reply_internal()` back into FreeformCore's metrics after completion.

---

### C-021: Insight extractor keyword filtering skips 3-char words (LOW)

**File**: `crates/goose/src/agents/experience_store.rs:279`, `crates/goose/src/agents/reflexion.rs:370`

**Issue**: Both `ExperienceStore::find_relevant()` and `ReflectionMemory::index_and_push()` filter out words with `len() <= 3`:
```rust
.filter(|w| w.len() > 3)
```
This skips meaningful short keywords like "API", "SQL", "CSS", "ORM", "CLI", "Git", "AWS", "GCP", which are common and highly specific task identifiers. A search for "fix the API" would only match on "fix" (4 chars), losing the most discriminating keyword.

**Fix**: Use a stopword list instead of a length threshold, or lower the threshold to 2:
```rust
const STOP_WORDS: &[&str] = &["the", "and", "for", "with", "this", "that", "from"];
.filter(|w| w.len() > 1 && !STOP_WORDS.contains(&w.to_lowercase().as_str()))
```

---

### C-022: Capabilities should_compact uses magic number (LOW)

**File**: `crates/goose/src/agents/capabilities.rs`

**Issue**: The `should_compact()` method uses a hardcoded `0.85` ratio threshold with no constant name or documentation explaining why 85% was chosen. This makes it difficult to tune without understanding the rationale.

**Fix**: Extract to a named constant:
```rust
const COMPACTION_THRESHOLD_RATIO: f64 = 0.85;
```

---

## Test Coverage Gaps

| Area | Gap Description |
|------|-----------------|
| SwarmCore | No test verifies behavior when all tasks fail routing |
| Registry | No test for `register_core()` with duplicate CoreType (overwrites silently) |
| Selector | `categorize_task()` has no test for `Pipeline` category (unreachable) |
| ReflectionMemory | No test for `load_from_store()` when spawned writes haven't flushed |
| ExperienceStore | No test for `find_relevant()` with empty/very short task strings |
| Metrics | No concurrency test (two threads recording simultaneously) |
| OrchestratorCore | No test for dependency-blocked task execution |
| StructuredCore | No test exercises the full Code-Test-Fix loop with failures |
| FreeformCore | No test verifies metrics are NOT double-counted when Agent also records |

---

## Already-Fixed Items (Acknowledged)

The following were noted in the session 7 audit and confirmed fixed:
- CoreCapabilities manual Default (max_concurrent_tasks=1) -- FIXED but test still wrong (C-001)
- StructuredCore uses &Path -- FIXED
- SwarmCore logs routing failures via tracing::warn -- FIXED but still reports success (C-003)
- AdversarialCore uses quality to drive max_cycles -- FIXED but test expects wrong value (C-002)
- FreeformCore is pass-through -- ACKNOWLEDGED
- WorkflowCore has tokio::sleep -- FIXED
- Selector detects multi-file-complex -- FIXED

---

## Recommendations

1. **Immediate**: Fix C-001 and C-002 (failing tests) -- these will break CI
2. **High Priority**: Fix C-003 (swarm false success), C-004 (duration wrap), C-006 (registry panic), C-008 (silent type coercion)
3. **Medium Priority**: Wire min_experiences (C-007), add wall-clock timeout (C-017), fix metric recording (C-019/C-020)
4. **Low Priority**: Improve keyword filtering (C-021), extract constants (C-022)
5. **Architecture**: Plan FreeformCore dispatcher migration to eliminate the pass-through gap
