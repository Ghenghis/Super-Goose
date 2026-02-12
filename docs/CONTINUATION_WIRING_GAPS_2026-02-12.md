# Continuation: Critical Wiring Gaps (2026-02-12)

## ✅ ALL GAPS FIXED — Commit `b12a665ed6`

## Session Context
- Branch: `feat/comprehensive-testing`
- Fix commit: `b12a665ed6` (wired all 4 gaps)
- All tests passing: 139 backend, 2086 frontend

## ~~⚠️ Critical Wiring Gaps~~ ✅ ALL RESOLVED

~~These 4 gaps prevent the agentic core system from functioning at runtime.~~
All 4 gaps have been fixed. The agentic core system is now fully wired to the execution path.

---

### Gap 1: init_learning_stores() Never Called

**File**: `crates/goose/src/agents/agent.rs` (line 421)
**Problem**: `init_learning_stores()` initializes ExperienceStore + SkillLibrary (SQLite), but no code ever calls it.
**Impact**: `experience_store` and `skill_library` are always `None` at runtime.

**Fix**: Call `init_learning_stores()` early in Agent lifecycle. Best location is at the start of `reply()`:

```rust
// In Agent::reply(), before line 1660 (message_text extraction):
// Lazily initialize learning stores on first reply
if self.experience_store.is_none() || self.skill_library.is_none() {
    // Need &mut self, but reply() takes &self — use interior mutability
    // Option A: Make experience_store/skill_library use Mutex<Option<Arc<...>>>
    // Option B: Call init_learning_stores() from the session creation path (server-side)
}
```

**Complication**: `init_learning_stores()` takes `&mut self`, but `reply()` takes `&self`.
**Options**:
1. Change fields to `Mutex<Option<Arc<...>>>` for interior mutability (safest)
2. Call from `Agent::with_config()` using `tokio::block_in_place` (risky)
3. Call from server session creation (requires server code changes)
4. Use `OnceLock` + async init pattern

**Recommended**: Option 1 — wrap in `Mutex`, init lazily in `reply()`.

---

### Gap 2: Core Dispatch Not Wired to reply()

**File**: `crates/goose/src/agents/agent.rs` (line 1821)
**Problem**: `reply()` always calls `self.reply_internal()` (FreeformCore equivalent).
The AgentCoreRegistry exists at `self.core_registry` but is never consulted.

**Current flow**:
```
reply() → reply_internal() → LLM loop
```

**Target flow**:
```
reply() → core_registry.active_core() → core.execute(ctx, task) → LLM loop / FSM / DAG / etc.
```

**Fix location**: Line 1821 in `reply()`:
```rust
// BEFORE (current):
let mut reply_stream = self.reply_internal(final_conversation, session_config, session, cancel_token).await?;

// AFTER (wired):
let active_core_type = self.core_registry.active_core_type().await;
let mut reply_stream = if active_core_type == CoreType::Freeform {
    // Default path: use existing reply_internal
    self.reply_internal(final_conversation, session_config, session, cancel_token).await?
} else {
    // Dispatch through active core
    let core = self.core_registry.active_core().await;
    let mut ctx = AgentContext::from_agent(self, &session_config, &session);
    let task = final_conversation.messages.last()
        .map(|m| m.as_concat_text())
        .unwrap_or_default();
    let output = core.execute(&mut ctx, &task).await?;
    // Convert CoreOutput to stream of AgentEvents
    Box::pin(stream::once(async move {
        Ok(AgentEvent::Message(Message::assistant().with_text(output.summary)))
    }))
};
```

**Complication**: AgentContext needs real access to Agent internals (provider, extensions, etc.).
Currently AgentContext is a placeholder — needs to be fleshed out with real Agent references.

---

### Gap 3: CoreSelector Never Auto-Invoked

**File**: `crates/goose/src/agents/core/selector.rs`
**Problem**: `CoreSelector::select_core()` works perfectly in tests but is never called from Agent.

**Target**: Before core dispatch in `reply()`, auto-select the best core:
```rust
// In reply(), before dispatch:
let hint = TaskHint::from_message(&message_text);
let selector = CoreSelector::new(self.experience_store.clone());
let selection = selector.select_core(&self.core_registry, &hint).await;
if selection.confidence > 0.7 {
    self.core_registry.switch_core(selection.core_type).await?;
}
```

**Dependency**: Requires Gap 1 to be fixed first (ExperienceStore must be initialized).

---

### Gap 4: SuperGoosePanel Not in App.tsx Routing

**File**: `ui/desktop/src/App.tsx`
**Problem**: SuperGoosePanel component exists but has no route/entry point.

**Fix**: Add route or conditional render:
```tsx
// In App.tsx routes:
import { SuperGoosePanel } from './components/super/SuperGoosePanel';

// Option A: New route
<Route path="/super" component={SuperGoosePanel} />

// Option B: Sidebar toggle (alongside existing GooseSidebar)
{showSuperPanel && <SuperGoosePanel />}
```

---

## Fix Priority Order

1. **Gap 4** (easiest): Wire SuperGoosePanel into App.tsx — pure UI, no backend risk
2. **Gap 1**: Add Mutex wrappers to experience_store/skill_library, init in reply()
3. **Gap 2**: Wire core dispatch with Freeform fallback — most critical
4. **Gap 3**: Wire CoreSelector auto-invocation — requires Gap 1+2

## Test Strategy for Wiring

After wiring, these tests should verify correctness:

```bash
# Existing unit tests (must still pass):
cargo test --lib -p goose -- core::           # 87+ tests
cargo test --lib -p goose -- experience_store  # 11 tests
cargo test --lib -p goose -- planner::         # 13 tests

# New integration tests needed:
# - Agent::reply() dispatches through active core
# - init_learning_stores() populates experience_store + skill_library
# - CoreSelector auto-switches core for structured tasks
# - /core command changes active core and subsequent reply uses it
```

## Files to Modify

| File | Changes |
|------|---------|
| `crates/goose/src/agents/agent.rs` | Mutex wrappers, init in reply(), core dispatch |
| `crates/goose/src/agents/core/context.rs` | Real AgentContext with Agent references |
| `ui/desktop/src/App.tsx` | SuperGoosePanel route |

## Estimated Effort
- Gap 4: 15 min
- Gap 1: 30 min (Mutex refactor)
- Gap 2: 1-2 hours (core dispatch + AgentContext)
- Gap 3: 30 min (wire selector)
- Integration testing: 1-2 hours

**Total: ~3-5 hours of focused work**

## Recovery Info
- MEMORY.md: Updated with all gaps documented
- Topic file: `phase3-panels-theme-2026-02-12.md`
- Status doc: `docs/STATUS_COMPLETE_2026-02-12.md`
- Architecture: `docs/ARCHITECTURE_AGENTIC_CORES.md`
