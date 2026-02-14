# Audit 04 — Rust Backend Routes Auditor
**Agent 4** | Started: 2026-02-14
**Branch**: `feat/resizable-layout`

---

## Findings Log

### F-001: mod.rs — All 33 route modules registered correctly
**File**: `crates/goose-server/src/routes/mod.rs`
**Type**: Structural
**Severity**: INFO
All 33 modules declared and all `.merge()` calls present in `configure()`. No missing registrations.
Notable: `prompts::routes()` takes no state arg (stateless). `mcp_ui_proxy::routes()` and `mcp_app_proxy::routes()` take `secret_key` instead of state.

### F-002: state.rs — AppState well-structured, no unwrap() in public API
**File**: `crates/goose-server/src/state.rs`
**Type**: Quality
**Severity**: INFO
- `event_bus` broadcast channel (capacity=4096) correctly initialized.
- `get_agent_for_route()` maps error to `StatusCode::INTERNAL_SERVER_ERROR` — good.
- `take_extension_loading_task()` logs warning on task failure, returns None — acceptable.
- No `.unwrap()` in public paths. Clean.

### F-003: reply.rs — `_run_terminated` flag declared but never mutated
**File**: `crates/goose-server/src/routes/reply.rs:351`
**Type**: Quality / Bug
**Severity**: MEDIUM
`let _run_terminated = false;` is declared at line 351 but **never set to `true`**. The comment says it should prevent double-emit of `RUN_FINISHED` after `RUN_ERROR`, but the guard is never used. This means `RUN_FINISHED` is ALWAYS emitted (line 584) even after a `RUN_ERROR` break (line 557), resulting in **double terminal events** on the AG-UI bus.

### F-004: reply.rs — `cancel_token` vs `task_cancel` naming inconsistency
**File**: `crates/goose-server/src/routes/reply.rs`
**Type**: Quality
**Severity**: LOW
Line 339: `let cancel_token = CancellationToken::new();`
Line 344: `let task_cancel = cancel_token.clone();`
Both are used inside the spawned task — sometimes `cancel_token` (lines 389, 448, 479), sometimes `task_cancel` (line 474). Functionally identical (clones of same token), but confusing.

### F-005: reply.rs — Adequate error handling, good AG-UI lifecycle
**File**: `crates/goose-server/src/routes/reply.rs`
**Type**: Structural
**Severity**: INFO
- 3 early-return error paths all emit `RUN_ERROR` on AG-UI bus + SSE error event.
- `RUN_STARTED` / `STATE_DELTA(running)` / `STATE_DELTA(idle)` / `RUN_FINISHED` lifecycle correct.
- `MESSAGES_SNAPSHOT` emitted on `HistoryReplaced`.
- 50MB body limit set.
- `text/event-stream` headers correct.
- OpenAPI annotation present.

### F-006: ag_ui_stream.rs — Well-structured AG-UI protocol implementation
**File**: `crates/goose-server/src/routes/ag_ui_stream.rs`
**Type**: Structural
**Severity**: INFO
- 24 AG-UI event types properly defined with serde tag = "type".
- Legacy bridge function covers all AgentStreamEvent variants.
- SSE handler multiplexes broadcast channel + heartbeat via `tokio::select!`.
- 3 POST endpoints (tool-result, abort, message) all validate input.
- Proper error response type `AgUiErrorResponse` with code-based HTTP status mapping.
- Comprehensive tests (serialization, bridge, SSE formatting, roundtrip).

### F-007: ag_ui_stream.rs — abort endpoint emits RUN_FINISHED with empty thread_id
**File**: `crates/goose-server/src/routes/ag_ui_stream.rs:676-687`
**Type**: Quality
**Severity**: LOW
`ag_ui_abort()` emits `RUN_FINISHED { thread_id: String::new(), ... }` — the empty thread_id means the frontend can't correlate the finish event with the run. Should use the actual session/thread ID from the running agent.

### F-008: agent_stream.rs — Heartbeat-only SSE stream, no real agent events
**File**: `crates/goose-server/src/routes/agent_stream.rs`
**Type**: Structural
**Severity**: MEDIUM
The handler sends an initial `AgentStatus` with hardcoded values (`"idle"`, `"freeform"`, 0s uptime) then only emits heartbeats every 2s. No real agent events are ever pushed into this stream. Comment says "when backend pub accessors are wired, richer event types will be pushed" — this is effectively a stub. The `_state` parameter is unused (underscore-prefixed).

### F-009: agent_stream.rs — `.unwrap()` in `IntoResponse` impl
**File**: `crates/goose-server/src/routes/agent_stream.rs:121`
**Type**: Quality
**Severity**: LOW
`http::Response::builder().body(body).unwrap()` — while this won't fail with static headers, the ag_ui_stream.rs version uses `.expect()` with a descriptive message, which is better practice.

### F-010: settings.rs — Well-structured CRUD + SSE stream
**File**: `crates/goose-server/src/routes/settings.rs`
**Type**: Structural
**Severity**: INFO
- 6 endpoints: GET all, GET by key, POST set, POST bulk, DELETE, GET stream.
- Proper error handling: 404 for not found, 500 for internal errors.
- Route ordering note: `/api/settings/bulk` and `/api/settings/stream` registered before `{key}` wildcard — correct.
- SSE stream sends initial snapshot, then 30s heartbeats.
- Settings stream does NOT push real-time updates when settings change (only initial snapshot + heartbeats).
- OpenAPI annotations on all handlers.
- `.unwrap()` on line 127 in SSE response builder (same pattern as F-009).

### F-011: settings.rs — Settings stream doesn't push real-time updates
**File**: `crates/goose-server/src/routes/settings.rs:327-369`
**Type**: Structural
**Severity**: MEDIUM
The `/api/settings/stream` endpoint sends the initial settings snapshot then only heartbeats. When a setting is changed via `POST /api/settings/{key}`, the stream does NOT push a `SettingsUpdate` event. The frontend's `useSettingsStream` hook expects real-time updates. This needs a broadcast channel (like AG-UI stream) to notify SSE clients of changes.

### F-012: learning.rs — Solid learning API with real backend wiring
**File**: `crates/goose-server/src/routes/learning.rs`
**Type**: Structural
**Severity**: INFO
- 5 endpoints: stats, experiences (paginated), insights, skills, verify skill.
- All handlers access real `ExperienceStore` and `SkillLibrary` via agent.
- Graceful degradation: if agent/stores not initialized, returns empty data.
- No unwrap() in handler paths — proper error handling.
- OpenAPI annotations on all handlers.
- Pagination for experiences uses in-memory skip (`recent(limit+offset)` then `.skip(offset)`) — works for small datasets but inefficient for large offsets.

### F-013: learning.rs — Hardcoded confidence and insight_type
**File**: `crates/goose-server/src/routes/learning.rs:250-258`
**Type**: Quality
**Severity**: LOW
In `get_insights()`, all insights get `confidence: 0.8` and `insight_type: "pattern"` hardcoded, and `source_experiences` is always empty. These should come from the actual store data when available.

### F-014: agents_api.rs — Comprehensive agent bus, self-contained state
**File**: `crates/goose-server/src/routes/agents_api.rs`
**Type**: Structural
**Severity**: INFO
- 13 endpoints: registry CRUD, messaging, chat stream, task queue CRUD.
- Self-contained `AgentBusState` (not shared with main AppState).
- Proper HTTP status codes: 201 for creates, 404 for not found, 409 for conflict.
- SSE chat stream with broadcast channel + heartbeat.
- Task sorting by priority then date.
- All in-memory — no persistence across server restarts.

### F-015: agents_api.rs — In-memory state not shared with main AppState
**File**: `crates/goose-server/src/routes/agents_api.rs:805-809`
**Type**: Quality
**Severity**: MEDIUM
`routes()` creates a NEW `AgentBusState::new()` every time it's called, and the `_app_state` parameter is ignored. This means:
1. Agent bus state is not accessible from other route modules.
2. State is purely in-memory with no persistence.
3. Multiple calls to `routes()` (unlikely) would create separate instances.

### F-016: ota_api.rs — Comprehensive OTA + Autonomous + Core management (15 endpoints)
**File**: `crates/goose-server/src/routes/ota_api.rs`
**Type**: Structural
**Severity**: INFO
- OTA: status, trigger (sync dry-run + async real build), build-status polling, history, restart, restart-status, restart-completed (7 endpoints).
- Autonomous: status, start, stop, audit-log (4 endpoints).
- Agent cores: switch-core, list cores, get/set core-config (4 endpoints).
- Real backend wiring to OtaManager, AutonomousDaemon, CostTracker.
- Background build task with streaming progress via shared `OtaBuildProgress`.
- Restart uses exit code 42 with 500ms delay for HTTP response flush.
- Core config persisted to `~/.config/goose/core-config.json` with validation.

### F-017: ota_api.rs — `std::process::exit()` in restart handler
**File**: `crates/goose-server/src/routes/ota_api.rs:721`
**Type**: Quality
**Severity**: MEDIUM
`std::process::exit(exit_code)` is called from a tokio::spawn task. This is an abrupt shutdown — no cleanup, no graceful connection draining. For production, should use axum's shutdown signal or a graceful shutdown mechanism.

### F-018: ota_api.rs — ota_trigger returns 200 even on errors
**File**: `crates/goose-server/src/routes/ota_api.rs:198-259`
**Type**: Quality
**Severity**: MEDIUM
All error cases in `ota_trigger()` return `Json<OtaTriggerResponse>` with HTTP 200, just setting `triggered: false`. The frontend can distinguish success/failure via the `triggered` field, but standard practice would be to return 4xx/5xx for agent-not-available, already-in-progress, OTA-not-initialized.

### F-019: ota_api.rs — set_core_config validation returns 200 with error in body
**File**: `crates/goose-server/src/routes/ota_api.rs:893-936`
**Type**: Quality
**Severity**: LOW
Similar to F-018: validation failure (threshold out of range) returns HTTP 200 with `{"success": false}`. Should return 422 Unprocessable Entity.

### F-020: cost.rs — Adequate cost tracking with real CostTracker wiring
**File**: `crates/goose-server/src/routes/cost.rs`
**Type**: Structural
**Severity**: INFO
- 4 endpoints: summary, breakdown, get budget, set budget.
- Wired to real `agent.cost_tracker()`.
- Budget persisted to Config store.
- Warning threshold clamped to 0.0-1.0.
- Breakdown returns empty `by_session` and `daily_trend` — needs cross-session tracking.
- `provider_from_model` helper is unused (marked `#[allow(dead_code)]`).

### F-021: features.rs — Well-structured feature flags + guardrails config
**File**: `crates/goose-server/src/routes/features.rs`
**Type**: Structural
**Severity**: INFO
- 13 well-known features with defaults.
- Feature overrides persisted to Config store.
- Guardrails config with mode validation ("warn" or "block").
- `violations_today` and `last_violation` are hardcoded to 0/None — not tracking real violations yet.

### F-022: errors.rs — Comprehensive error response system
**File**: `crates/goose-server/src/routes/errors.rs`
**Type**: Structural
**Severity**: INFO
- ErrorResponse with 5 factory methods: internal, bad_request, not_found, unprocessable, service_unavailable.
- 7 `From` implementations: anyhow, ConfigError, ModelConfigError, StatusCode, io::Error, serde_json, serde_yaml, ProviderError.
- Provider errors map to appropriate status codes (auth→400, rate limit→429, etc.).
- All route handlers that use `ErrorResponse` will get consistent JSON error format.

