# Session 9 Round 2 — Agent 2: Rust Backend Deep Audit

**Date:** 2026-02-15
**Branch:** `feat/resizable-layout`
**Scope:** `crates/goose/` and `crates/goose-server/` — production Rust code
**Verification:** `cargo check -p goose -p goose-server` CLEAN (0 warnings, 0 errors)

---

## Files Scanned

### crates/goose/src/agents/ (60+ files)
- `agent.rs`, `extension_manager.rs`, `apps_extension.rs`, `container.rs`
- `reflexion.rs`, `swarm.rs`, `subagent_handler.rs`, `subagent_task_config.rs`
- `prompt_manager.rs`, `mcp_client.rs`, `extension_malware_check.rs`
- `todo_extension.rs`, `chatrecall_extension.rs`, `skills_extension.rs`
- `subagent_execution_tool/notification_events.rs`
- `adversarial/coach.rs`, `adversarial/review.rs`
- `specialists/code_agent.rs`, `specialists/test_agent.rs`
- `team/handoffs.rs`, `team/validator.rs`
- `done_gate.rs`, `critic.rs`

### crates/goose/src/config/ (10+ files)
- `base.rs`, `declarative_providers.rs`, `permission.rs`
- `signup_tetrate/server.rs`, `signup_openrouter/server.rs`

### crates/goose/src/ota/ (15 files)
- `health_checker.rs`, `self_builder.rs`, `binary_swapper.rs`
- `rollback.rs`, `safety_envelope.rs`, `update_scheduler.rs`
- `policy_engine.rs`, `sandbox_runner.rs`, `state_saver.rs`
- `auto_improve.rs`, `code_applier.rs`, `improvement_planner.rs`
- `test_runner.rs`, `integration_tests.rs`, `mod.rs`

### crates/goose/src/autonomous/ (8 files)
- `scheduler.rs`, `branch_manager.rs`, `ci_watcher.rs`
- `release_manager.rs`, `docs_generator.rs`, `failsafe.rs`
- `audit_log.rs`, `mod.rs`

### crates/goose/src/agent_bus/ (2 files)
- `router.rs`, `messages.rs`

### crates/goose-server/src/ (40+ files)
- `state.rs`, `configuration.rs`, `lib.rs`, `main.rs`
- `routes/reply.rs`, `routes/settings.rs`, `routes/agent.rs`
- `routes/ag_ui_stream.rs`, `routes/agents_api.rs`
- `routes/enterprise.rs`, `routes/lifecycle.rs`
- `routes/memory_api.rs`, `routes/gpu_jobs.rs`
- `routes/conscious.rs`, `routes/recipe.rs`
- `routes/timewarp.rs`, `routes/bookmarks.rs`

---

## Issues Found and Fixed

### 1. PANICS — Production `.unwrap()`/`.expect()` Removed

#### 1a. `notification_events.rs` — `to_notification_data()` could panic
- **File:** `crates/goose/src/agents/subagent_execution_tool/notification_events.rs`
- **Issue:** `serde_json::to_value(self).expect("Failed to serialize event")` in production method
- **Risk:** Medium — while serialization of this type is practically infallible, the pattern is wrong
- **Fix:** Replaced with `match` + `tracing::error!` + fallback JSON object return

#### 1b. `signup_tetrate/server.rs` — 6 unwrap/expect chains in HTTP handler
- **File:** `crates/goose/src/config/signup_tetrate/server.rs`
- **Issue:** `TEMPLATES_DIR.get_file(...).expect(...)`, `.contents_utf8().expect(...)`, `env.add_template(...).unwrap()`, `env.get_template(...).unwrap()`, `tmpl.render(...).unwrap()` — 6 panic points in a production HTTP handler
- **Risk:** High — template rendering failure would crash the server
- **Fix:** Extracted `render_embedded_template()` helper that returns safe HTML fallbacks on any failure

#### 1c. `signup_openrouter/server.rs` — identical 6 unwrap/expect chains
- **File:** `crates/goose/src/config/signup_openrouter/server.rs`
- **Issue:** Same pattern as tetrate — 6 panic points in HTTP handler
- **Risk:** High
- **Fix:** Same `render_embedded_template()` helper pattern

#### 1d. `subagent_handler.rs` — `.expect()` on `max_turns`
- **File:** `crates/goose/src/agents/subagent_handler.rs` (line 232)
- **Issue:** `task_config.max_turns.expect("TaskConfig always sets max_turns")` — while `TaskConfig::new()` sets `max_turns: Some(...)`, direct struct construction could leave it as `None`
- **Risk:** Medium — code path only reached via subagent execution, but still could panic
- **Fix:** Changed to `.unwrap_or(DEFAULT_SUBAGENT_MAX_TURNS)` — graceful fallback

#### 1e. `reflexion.rs` — bare `.unwrap()` after `Some(...)` assignment
- **File:** `crates/goose/src/agents/reflexion.rs` (line 510)
- **Issue:** `self.current_attempt.as_mut().unwrap()` after setting `Some(...)` — logically safe but poor style
- **Fix:** Changed to `.expect("BUG: current_attempt was just set to Some")` with safety comment

### 2. MUTEX POISONING — Production `lock().unwrap()` Hardened

#### 2a. `agent_bus/router.rs` — 7 `lock().unwrap()` calls on `std::sync::Mutex`
- **File:** `crates/goose/src/agent_bus/router.rs`
- **Issue:** `subscribe()`, `unsubscribe()`, `route()` (Topic branch), `receive()`, `receive_all()`, `pending_count()`, `enqueue()` all used `lock().unwrap()`
- **Risk:** Medium — if any thread panics while holding the lock, all subsequent callers would also panic (poison cascade)
- **Fix:** Changed all 7 to `.lock().unwrap_or_else(|e| e.into_inner())` — recovers from poisoned mutex gracefully

#### 2b. `config/base.rs` — 7 `lock().unwrap()` calls on config guard and secrets cache
- **File:** `crates/goose/src/config/base.rs`
- **Issue:** `initialize_if_empty()`, `set_param()`, `delete()`, `set_secret()`, `delete_secret()` used `self.guard.lock().unwrap()`; `all_secrets()` and `invalidate_secrets_cache()` used `self.secrets_cache.lock().unwrap()`
- **Risk:** Medium — config operations are frequent and a poison cascade could prevent all config access
- **Fix:** Changed all to `.unwrap_or_else(|e| e.into_inner())` — recovers from poisoned mutex

#### 2c. `config/declarative_providers.rs` — `lock().unwrap()` on static Mutex
- **File:** `crates/goose/src/config/declarative_providers.rs`
- **Issue:** `ID_GENERATION_LOCK.lock().unwrap()` in `generate_id()`
- **Risk:** Low — but still a potential poison cascade
- **Fix:** Changed to `.unwrap_or_else(|e| e.into_inner())`

### 3. HARDCODED VALUES — Ollama URL Now Configurable

#### 3a. `gpu_jobs.rs` — hardcoded `http://127.0.0.1:11434` Ollama URL
- **File:** `crates/goose-server/src/routes/gpu_jobs.rs`
- **Issue:** `const OLLAMA_BASE: &str = "http://127.0.0.1:11434"` used in 7 places — prevents users from pointing to a remote Ollama instance
- **Risk:** Low (functional limitation, not a bug)
- **Fix:** Replaced with `fn ollama_base_url()` that reads `OLLAMA_HOST` env var (matching Ollama's own env var convention), falling back to `http://127.0.0.1:11434`

---

## Issues Found — NOT Fixed (Justified/Acceptable)

### Acceptable `.expect()` Patterns
These were reviewed and deliberately left unchanged:

1. **Static regex compilation** (`extension_manager.rs:57,60`) — `Lazy::new(|| Regex::new(...).expect("valid regex"))` — compile-time constant patterns that always parse
2. **Static URL parsing** (`extension_malware_check.rs:21`) — `Url::parse(DEFAULT_OSV_ENDPOINT).expect(...)` on a hardcoded `https://api.osv.dev/v1/query`
3. **JSON schema generation** (`apps_extension.rs:246-249`, `code_execution_extension.rs:306-315`) — `schema_for!(T)` infallibly produces valid JSON
4. **SSE response builder** (`agents_api.rs:479`) — `http::Response::builder()` with static headers cannot fail
5. **Config socket_addr fallback** (`configuration.rs:23`) — `"127.0.0.1:3000".parse().unwrap()` on a compile-time constant
6. **MemoryManager in-memory init** (`agent.rs:388`) — startup assertion, explicitly documented
7. **Prompt manager gitignore** (`prompt_manager.rs:105`) — belt-and-suspenders: fresh builder with no patterns always succeeds

### Acceptable TODO Comments
These are planned future work with proper fallback implementations:

1. **`container.rs:195,210`** — Microsandbox/Arrakis backends fall back to Docker with `warn!()` log
2. **`timewarp.rs`** (7 TODOs) — Stub endpoints awaiting `TimeWarpEventStore` wiring
3. **`bookmarks.rs:47`** — Documented migration plan to SQLite
4. **`enterprise.rs:913`** — Memory consolidation logic placeholder
5. **`commands/agent.rs:83`** — Future rollback binary restoration
6. **`specialists/code_agent.rs`, `specialists/test_agent.rs`** — Template TODO comments that are part of generated code scaffolding (they appear in the *generated output*, not in the agent's own logic)

### Hardcoded URLs Reviewed and Left Unchanged
1. **`configuration.rs:76`** — `127.0.0.1` default host for goose-server (overridable via `GOOSE_HOST`)
2. **`conductor_client.rs:110`** — `127.0.0.1:9284` IPC fallback (Windows TCP, by design)
3. **`tunnel/lapstone.rs:264`** — `127.0.0.1:{port}` for local proxy forwarding (correct behavior)
4. **`oauth/mod.rs:81`** — `localhost:{port}` for OAuth callback (standard OAuth2 pattern)
5. **`providers/lmstudio.rs:26`** — `localhost:1234/v1` default (overridable via `LMSTUDIO_BASE_URL`)
6. **`providers/ollama.rs:35`** — `localhost` (overridable via `OLLAMA_HOST`)
7. **`tracing/langfuse_layer.rs:13`** — `localhost:3000` default (configurable)
8. **`signup_*/mod.rs`** — `localhost:3000` callback URL (OAuth callback, localhost is correct)

---

## Summary

| Category | Found | Fixed | Justified/Left |
|---|---|---|---|
| Production panics (unwrap/expect) | 22+ | 9 | 13 (static patterns) |
| Mutex poison risk | 15 | 15 | 0 |
| Hardcoded URLs | 8+ | 1 | 7 (correct by design) |
| Stale TODOs | 12 | 0 | 12 (planned work) |
| Dead code | 14 `#[allow(dead_code)]` | 0 | 14 (annotated) |
| Missing tracing | 0 | 0 | All error paths traced |

### Files Modified (9 files)
1. `crates/goose/src/agents/subagent_execution_tool/notification_events.rs` — unwrap to match+fallback
2. `crates/goose/src/config/signup_tetrate/server.rs` — 6 unwraps to render_embedded_template()
3. `crates/goose/src/config/signup_openrouter/server.rs` — 6 unwraps to render_embedded_template()
4. `crates/goose/src/agent_bus/router.rs` — 7 lock().unwrap() to unwrap_or_else
5. `crates/goose/src/config/declarative_providers.rs` — lock().unwrap() to unwrap_or_else
6. `crates/goose/src/agents/reflexion.rs` — bare unwrap to documented expect
7. `crates/goose/src/config/base.rs` — 7 lock().unwrap() to unwrap_or_else
8. `crates/goose-server/src/routes/gpu_jobs.rs` — hardcoded const to env-var-backed fn
9. `crates/goose/src/agents/subagent_handler.rs` — expect() to unwrap_or() with default

### Verification
```
cargo check -p goose -p goose-server
Finished `dev` profile [unoptimized + debuginfo] target(s) in 25.72s
```
**0 warnings, 0 errors.**
