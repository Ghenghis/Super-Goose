# Session 7 Audit Report -- Agent 2: Rust Backend Routes & State

**Auditor**: Audit Agent 2 -- Rust Backend Routes & State Auditor
**Date**: 2026-02-14
**Branch**: `feat/resizable-layout`
**Scope**: All files in `crates/goose-server/src/routes/` + `crates/goose-server/src/state.rs`

## Files Audited

| File | Lines | Status |
|------|-------|--------|
| `routes/reply.rs` | 708 | Audited |
| `routes/ag_ui_stream.rs` | ~2770 | Audited |
| `routes/settings.rs` | 650 | Audited |
| `routes/ota_api.rs` | 1162 | Audited |
| `routes/enterprise.rs` | 1748 | Audited |
| `routes/agents_api.rs` | 1130 | Audited |
| `routes/learning.rs` | 506 | Audited |
| `state.rs` | 179 | Audited |

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH | 6 |
| MEDIUM | 10 |
| LOW | 7 |
| **Total** | **25** |

---

## Findings

---

### B-001 -- CRITICAL -- `std::process::exit()` in async context

**File**: `crates/goose-server/src/routes/ota_api.rs`, line 721
**Description**: The `ota_restart` handler calls `std::process::exit(exit_code)` inside a `tokio::spawn` block. `std::process::exit()` terminates the process immediately without running destructors, flushing buffered I/O, or completing pending async tasks. This can corrupt in-progress writes (SQLite WAL, config files, OTA marker files), lose buffered log data, and leave clients in an undefined state. The 500ms `tokio::time::sleep` before exit is not guaranteed to be sufficient for all pending I/O to flush.

**Suggested Fix**: Replace `std::process::exit()` with a graceful shutdown sequence: cancel all CancellationTokens, drop the Tokio runtime cleanly (via `tokio::signal` or an `axum::Server::with_graceful_shutdown` hook), flush logs, then use `std::process::exit()` as the final step only after cleanup completes. Alternatively, set a global shutdown flag and let the main loop handle the exit.

---

### B-002 -- CRITICAL -- Abort endpoint does not cancel the running agent task

**File**: `crates/goose-server/src/routes/ag_ui_stream.rs`, lines 686-720
**Description**: The `ag_ui_abort` POST handler emits `RUN_CANCELLED` and `RUN_FINISHED` events to the AG-UI broadcast channel, but it does **not** access or cancel the `CancellationToken` that controls the actual agent reply loop in `reply.rs` (line 339). The result: the frontend sees cancellation events, but the agent keeps running in the background, consuming tokens and compute. The `CancellationToken` from `reply.rs` is local to the spawned task and not stored anywhere accessible by the abort handler.

**Suggested Fix**: Store the per-session `CancellationToken` in `AppState` (e.g., `Arc<RwLock<HashMap<String, CancellationToken>>>`) so the abort handler can look up and cancel the token for the active session. The `reply.rs` handler should register its token on RUN_STARTED and remove it on completion.

---

### B-003 -- HIGH -- `std::sync::Mutex` used inside async handlers (blocking Tokio runtime)

**File**: `crates/goose-server/src/routes/enterprise.rs`, lines 276-285 and all handler methods
**Description**: The `EnterpriseState` struct wraps all fields in `std::sync::Mutex` (from the standard library), not `tokio::sync::Mutex`. Every handler acquires these locks with `.lock()` which **blocks the current Tokio worker thread**. Under concurrent requests this can starve the async runtime. The `Lazy<EnterpriseState>` static on line 599 makes this global, so all concurrent enterprise API calls contend on the same blocking locks.

**Suggested Fix**: Replace `std::sync::Mutex` with `tokio::sync::Mutex` (or `tokio::sync::RwLock` for read-heavy patterns). Change `.lock()` calls to `.lock().await`. Since the critical sections are short (clone + return), the practical impact is low today, but it violates Tokio best practices and will become a bottleneck under load.

---

### B-004 -- HIGH -- Cancel path in reply.rs does not set `run_terminated`

**File**: `crates/goose-server/src/routes/reply.rs`, lines 474-477
**Description**: When the `task_cancel` CancellationToken fires (line 474), the loop breaks but `run_terminated` is not set to `true`. The code after the loop (line 587) then emits `RUN_FINISHED` because `!run_terminated` is true. However, the correct AG-UI protocol behavior for a cancellation should be `RUN_CANCELLED` followed by `RUN_FINISHED`, or at minimum `RUN_CANCELLED` instead of `RUN_FINISHED`. Currently the client-visible cancel event from `reply.rs` is silently swallowed -- only `ag_ui_abort` emits `RUN_CANCELLED`, but it doesn't actually cancel the token (see B-002).

**Suggested Fix**: In the `task_cancel.cancelled()` branch (line 474), set `run_terminated = true` and emit `AgUiEvent::RUN_CANCELLED` before breaking. Then the `!run_terminated` guard at line 587 correctly suppresses `RUN_FINISHED`.

---

### B-005 -- HIGH -- Scan ID generation produces duplicates if scans are removed

**File**: `crates/goose-server/src/routes/enterprise.rs`, line 786
**Description**: The scan ID is generated as `format!("scan-{:03}", scans.len() + 1)`. Since new scans are inserted at index 0 (line 799), the Vec grows monotonically. However, if a future API adds scan deletion, or if the Vec is ever truncated/compacted, `scans.len()` will decrease, producing duplicate IDs for new entries. Even without deletion, the monotonic ID counter is fragile -- it depends on Vec length rather than an actual counter.

**Suggested Fix**: Use a dedicated `AtomicU64` counter or `uuid::Uuid::new_v4()` for scan IDs. This eliminates any dependency on collection size.

---

### B-006 -- HIGH -- `AgentBusState` created fresh on every `routes()` call

**File**: `crates/goose-server/src/routes/agents_api.rs`, line 805-809
**Description**: The `routes()` function creates a new `AgentBusState` each time it is called: `let bus = Arc::new(AgentBusState::new())`. If `routes()` is ever called more than once (e.g., during hot-reload, test setup, or if the router is reconstructed), state is silently lost and the new router operates on an empty, disconnected bus. The `_app_state: Arc<AppState>` parameter is accepted but unused, which is misleading.

**Suggested Fix**: Either (a) store `AgentBusState` inside `AppState` so it persists across router reconstructions, or (b) document that `routes()` must be called exactly once and the `_app_state` parameter should be removed if unused.

---

### B-007 -- HIGH -- Unbounded in-memory collections with no cleanup

**File**: `crates/goose-server/src/routes/agents_api.rs`, lines 39-40; `crates/goose-server/src/state.rs`, line 47
**Description**: Multiple in-memory collections grow without bound:
- `agents_api.rs` line 39: `messages: Arc<Mutex<Vec<MessageRecord>>>` -- every message is appended, never removed.
- `agents_api.rs` line 40: `tasks: Arc<RwLock<HashMap<String, TaskRecord>>>` -- tasks are created but never cleaned up.
- `state.rs` line 47: `recipe_session_tracker: Arc<Mutex<HashSet<String>>>` -- session IDs are inserted but never removed.
- `state.rs` line 49: `extension_loading_tasks` -- entries accumulate if `remove_extension_loading_task()` is not consistently called.

In a long-running server process, these will cause unbounded memory growth.

**Suggested Fix**: Implement cleanup strategies: (a) for messages, use a ring buffer or evict entries older than N minutes; (b) for tasks, add TTL-based expiration; (c) for `recipe_session_tracker`, periodically prune stale session IDs; (d) for `extension_loading_tasks`, ensure the cleanup method is called in all code paths (including error paths).

---

### B-008 -- HIGH -- OTA trigger returns HTTP 200 on logical errors

**File**: `crates/goose-server/src/routes/ota_api.rs`, lines 206-213, 218-224
**Description**: When `ota_trigger` cannot find the agent (line 206) or fails to init the OTA manager (line 218), it returns `Json(OtaTriggerResponse { triggered: false, ... })` with an implicit HTTP 200 status. The caller must inspect the `triggered` field to detect failure. Similar patterns exist in `switch_core` (line 797) and `autonomous_start` / `autonomous_stop`. This violates REST conventions where 4xx/5xx codes signal errors, making it hard for generic HTTP clients and monitoring tools to detect failures.

**Suggested Fix**: Return appropriate HTTP status codes: 404 for "agent not available", 503 for "OTA manager not initialized", 409 for "build already in progress". The JSON body can still carry the descriptive message.

---

### B-009 -- MEDIUM -- Initial STATE_SNAPSHOT uses hardcoded values

**File**: `crates/goose-server/src/routes/ag_ui_stream.rs`, lines 470-475
**Description**: The initial `AgentStreamEvent::AgentStatus` sent when a client connects to the AG-UI SSE stream uses hardcoded values: `session_id: String::new()`, `status: "idle"`, `core_type: "freeform"`, `uptime_seconds: 0`. If the agent is actually running or using a different core type, the client receives stale data until the next real event arrives.

**Suggested Fix**: Query the actual agent state from `AppState` when a new SSE client connects. Use `agent.active_core_type().await` and check if an active run exists to determine the real status. Fall back to the hardcoded defaults only if no agent is available.

---

### B-010 -- MEDIUM -- `exit_code = 1` for force restart is confusing

**File**: `crates/goose-server/src/routes/ota_api.rs`, line 716
**Description**: When `req.force` is true, the exit code is set to `1`, which universally means "error/failure" on both Unix and Windows. The non-force path correctly uses `42` (custom OTA restart signal). Using exit code 1 for a forced intentional restart makes it indistinguishable from an actual crash, confusing process managers (systemd, Docker) and monitoring systems.

**Suggested Fix**: Use a different custom exit code for force restart (e.g., 43) that is distinct from both normal OTA restart (42) and error (1). Document exit codes in a central enum.

---

### B-011 -- MEDIUM -- Enterprise state not persisted -- lost on restart

**File**: `crates/goose-server/src/routes/enterprise.rs`, line 599
**Description**: All enterprise state (gateway config, guardrails, hooks, memory, policies) is stored in a `static Lazy<EnterpriseState>` in process memory. Any configuration changes made through the API are lost when the server restarts. This is particularly problematic for audit logging settings, policy rules, and guardrail configurations that an admin would expect to persist.

**Suggested Fix**: Persist enterprise state to disk (JSON file or SQLite) similar to how `core-config.json` is handled in `ota_api.rs`. Load on startup, write on mutation.

---

### B-012 -- MEDIUM -- `consolidate_memory()` is a no-op stub returning success

**File**: `crates/goose-server/src/routes/enterprise.rs`, lines 908-915
**Description**: The `consolidate_memory` handler returns `{ success: true, message: "Memory consolidation completed successfully" }` without performing any actual work. The frontend displays this as a success, misleading the user into thinking consolidation occurred.

**Suggested Fix**: Either (a) return `{ success: false, message: "Not yet implemented" }` or an HTTP 501 status, or (b) wire it to actual memory consolidation logic. At minimum, mark the response as a stub so the frontend can display appropriate UI.

---

### B-013 -- MEDIUM -- Gateway version hardcoded to "1.24.05"

**File**: `crates/goose-server/src/routes/enterprise.rs`, line 310
**Description**: The default gateway status has `version: "1.24.05".to_string()` hardcoded. The actual binary version is available via `env!("CARGO_PKG_VERSION")` (as used in `ota_api.rs` line 177). When the version changes, this hardcoded string becomes stale.

**Suggested Fix**: Replace with `env!("CARGO_PKG_VERSION").to_string()`.

---

### B-014 -- MEDIUM -- Learning engine pagination fetches excess data

**File**: `crates/goose-server/src/routes/learning.rs`, line 208
**Description**: The `get_experiences` handler fetches `limit + offset` entries from the store (`store.recent(fetch_count)`) and then skips `offset` entries in memory. For `offset=10000, limit=10`, this fetches 10,010 entries into memory just to return 10. This is O(offset + limit) memory usage.

**Suggested Fix**: Push pagination down to the data store layer. The `ExperienceStore::recent()` method should accept `offset` and `limit` parameters and use SQL `LIMIT/OFFSET` clauses.

---

### B-015 -- MEDIUM -- Insight IDs are unstable sequential indices

**File**: `crates/goose-server/src/routes/learning.rs`, line 252
**Description**: Insight entries are assigned IDs via `format!("insight-{}", i)` where `i` is the enumerate index. If insights are added or removed, existing IDs shift. Any client caching or referencing insight IDs will point to the wrong entry after the next mutation.

**Suggested Fix**: Use stable UUIDs or content-hash-based IDs for insights. Alternatively, add an `insight_id` field to the underlying store.

---

### B-016 -- MEDIUM -- Hardcoded `confidence: 0.8` for all insights

**File**: `crates/goose-server/src/routes/learning.rs`, line 255
**Description**: All insights returned by the `get_insights` handler have `confidence: 0.8` hardcoded. The `insight_type` is also hardcoded to `"pattern"` (line 253) and `source_experiences` is always empty (line 256). This creates a misleading API response where all insights appear to have identical confidence and type regardless of their actual derivation.

**Suggested Fix**: Either (a) derive confidence from the underlying insight extractor data, (b) return `confidence: null` or omit the field until real values are available, or (c) at minimum document in the API that these are placeholder values.

---

### B-017 -- MEDIUM -- Inconsistent variable naming in error paths

**File**: `crates/goose-server/src/routes/reply.rs`, lines 367-369 vs 388-389 vs 447-449
**Description**: The reply handler creates `task_cancel = cancel_token.clone()` (line 344) and `task_tx = tx.clone()` (line 345), but error paths inconsistently use the original and cloned references:
- Line 368: `&task_cancel`
- Line 389: `&cancel_token` (uses original, not clone)
- Line 449: `&cancel_token` (uses original, not clone)
- Line 479: `&tx` and `&cancel_token` (heartbeat uses originals)
- Line 498: `&tx` and `&cancel_token` (message event uses originals)
- Line 647: `&task_tx` and `&cancel_token` (final Finish uses clone tx but original cancel)

While functionally equivalent (both are clones of the same underlying Arc), this inconsistency makes the code harder to reason about and could mask a real bug if one of the variables were moved rather than cloned.

**Suggested Fix**: Standardize on using `task_tx` and `task_cancel` exclusively inside the spawned block. Remove the originals `tx` and `cancel_token` from the closure capture by explicitly moving them, or drop them before the spawn.

---

### B-018 -- MEDIUM -- `pending_improvements` field repurposed for `consecutive_failures`

**File**: `crates/goose-server/src/routes/ota_api.rs`, line 178
**Description**: The `OtaStatus` response has a field `pending_improvements` but line 178 populates it with `sched_state.consecutive_failures`. These are semantically different: one is a count of queued improvements, the other is a failure counter. The API contract is misleading.

**Suggested Fix**: Either rename the field to `consecutive_failures` (breaking API change), add a separate field for actual pending improvements, or populate it with the correct data.

---

### B-019 -- LOW -- `drop(tokio::spawn(...))` pattern suppresses JoinHandle

**File**: `crates/goose-server/src/routes/reply.rs`, line 347
**Description**: The `drop(tokio::spawn(async move { ... }))` pattern explicitly drops the `JoinHandle` to suppress the "unused JoinHandle" warning. While intentional (the reply task runs fire-and-forget), dropping the handle means any panic inside the spawned task is silently lost. If the task panics, the SSE stream hangs without error.

**Suggested Fix**: Store the `JoinHandle` and either await it or install a panic hook. Alternatively, wrap the inner async block in a `catch_unwind` and emit `RUN_ERROR` if a panic occurs.

---

### B-020 -- LOW -- `history` entries have incorrect `completed_at` timestamp

**File**: `crates/goose-server/src/routes/ota_api.rs`, line 519
**Description**: The `ota_history` handler sets `completed_at: Some(Utc::now().to_rfc3339())` for every history entry, using the current time rather than the actual completion time. This means historical entries always show the current request time as their completion time.

**Suggested Fix**: Store the actual completion timestamp in `CycleResult` or derive it from `OtaManager` state.

---

### B-021 -- LOW -- No input validation on agent registration fields

**File**: `crates/goose-server/src/routes/agents_api.rs` (register_agent handler)
**Description**: The `register_agent` handler accepts arbitrary strings for `role`, `display_name`, `status`, and `capabilities` without validation. An empty `id` or `role` would be accepted, and special characters could cause issues in downstream processing. The `status` field accepts any string rather than being constrained to a known set (e.g., "online", "offline", "busy").

**Suggested Fix**: Add validation for required fields (non-empty `id`, `role`), validate `status` against an enum of allowed values, and enforce reasonable string length limits.

---

### B-022 -- LOW -- `RUN_FINISHED` emitted with empty `thread_id` in abort handler

**File**: `crates/goose-server/src/routes/ag_ui_stream.rs`, line 710
**Description**: The abort handler emits `RUN_FINISHED` with `thread_id: String::new()` and uses the abort event_id as the `run_id`. The AG-UI protocol expects `thread_id` and `run_id` to match those from the original `RUN_STARTED` event. Sending empty/mismatched values may confuse frontend state tracking.

**Suggested Fix**: Look up the active `run_id` and `thread_id` from `AppState` (requires tracking active runs) and use those in the abort response events.

---

### B-023 -- LOW -- Blocking file I/O in async handlers

**File**: `crates/goose-server/src/routes/ota_api.rs`, lines 461, 464, 700-709, 879, 907
**Description**: Several handlers perform blocking `std::fs::read_to_string()`, `std::fs::remove_file()`, `std::fs::write()`, and `std::fs::create_dir_all()` inside async functions. These block the Tokio worker thread during disk I/O. Examples:
- `ota_restart_completed()` line 461: `std::fs::read_to_string(&path)`
- `ota_restart()` line 700: `std::fs::create_dir_all(&marker_dir)`
- `ota_restart()` line 709: `std::fs::write(&marker_path, ...)`
- `get_core_config()` line 879: `std::fs::read_to_string(&path)`
- `set_core_config()` line 904-907: `std::fs::create_dir_all` + `std::fs::write`

**Suggested Fix**: Replace with `tokio::fs` equivalents: `tokio::fs::read_to_string()`, `tokio::fs::write()`, `tokio::fs::create_dir_all()`, `tokio::fs::remove_file()`. The handlers are already async, so this is a straightforward replacement.

---

### B-024 -- LOW -- `ota_history` entry `started_at` uses last update time for all entries

**File**: `crates/goose-server/src/routes/ota_api.rs`, lines 515-518
**Description**: Every history entry uses `mgr.last_update_time()` for `started_at`, so all entries show the same start time (the most recent update). Individual cycle start times are not tracked per-entry.

**Suggested Fix**: Store per-cycle start timestamps in `CycleResult` and use those instead of the global `last_update_time()`.

---

### B-025 -- LOW -- Settings SSE stream sends full initial snapshot without "initial" marker

**File**: `crates/goose-server/src/routes/settings.rs`, lines 366-378
**Description**: When a new SSE client connects to `/api/settings/stream`, the handler sends all current settings as individual `SettingsUpdate` events with `source: "initial"`. While the source field marks these as initial, the frontend must handle a potentially large burst of events on connect. There is no framing event to indicate "snapshot start" or "snapshot end", so the client cannot distinguish between the initial dump and rapid real-time changes.

**Suggested Fix**: Wrap the initial snapshot in `SNAPSHOT_START` / `SNAPSHOT_END` framing events, or send a single aggregated snapshot event containing all settings at once.

---

## Positive Observations

1. **settings.rs**: Well-structured with proper error handling, correct route ordering (bulk/stream before wildcard `{key}`), and SSE broadcast pattern matching the AG-UI stream.

2. **reply.rs**: The `run_terminated` guard pattern (line 351, 587) correctly prevents double terminal AG-UI events in the error path. The heartbeat+timeout+cancellation `tokio::select!` loop is well-designed.

3. **ota_api.rs**: The background build task pattern (lines 300-408) correctly releases the agent mutex before the long build, clones config upfront, and uses progress streaming through shared state. Build-status polling with dynamic elapsed time calculation is solid.

4. **ag_ui_stream.rs**: The `Lagged` error handling (line 508-509) correctly continues receiving after dropped events rather than terminating the connection. The bridge pattern for legacy events is well-documented.

5. **enterprise.rs**: Comprehensive input validation on scan direction/result (lines 766-779) and guardrails mode (lines 702-708). All lock acquisitions handle poisoned mutex errors gracefully.

6. **state.rs**: The broadcast channel capacities (4096 for events, 256 for settings) are well-documented and appropriately sized. The `extension_loading_tasks` pattern with `Arc<Mutex<Option<JoinHandle>>>` allows safe single-take semantics.

---

## Recommended Priority Order for Fixes

1. **B-002** (CRITICAL) -- Wire abort to actual CancellationToken
2. **B-001** (CRITICAL) -- Replace `std::process::exit()` with graceful shutdown
3. **B-004** (HIGH) -- Fix cancel path in reply.rs
4. **B-003** (HIGH) -- Replace `std::sync::Mutex` with `tokio::sync::Mutex`
5. **B-007** (HIGH) -- Add cleanup for unbounded collections
6. **B-006** (HIGH) -- Store AgentBusState in AppState
7. **B-008** (HIGH) -- Return proper HTTP status codes
8. **B-005** (HIGH) -- Use UUID for scan IDs
9. **B-009** through **B-018** (MEDIUM) -- Address in order of impact
10. **B-019** through **B-025** (LOW) -- Address as time permits
