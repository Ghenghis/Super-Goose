# Audit 05 — Rust Core Agents Auditor
**Agent**: 5
**Date**: 2026-02-14
**Branch**: feat/resizable-layout
**Status**: IN PROGRESS

## Findings

### F01: CRITICAL — `metrics()` trait method returns fresh CoreMetrics, not actual metrics
**Severity**: HIGH | **Files**: All 6 core implementations
**Description**: Every single core implementation has the same bug in `metrics()`:
```rust
fn metrics(&self) -> CoreMetrics {
    CoreMetrics::new() // Returns EMPTY metrics, not the actual stored ones
}
```
The comment in `freeform.rs` says "Callers should use metrics().snapshot() on the stored instance" — but callers outside the core have NO access to `metrics_ref()` because it's an inherent method, not part of the `AgentCore` trait.

The `AgentCoreRegistry::list_cores_with_metrics()` calls `core.metrics().snapshot()` — this always returns **zeros** because `metrics()` creates a brand new `CoreMetrics`. The actual metrics are accumulated in `self.metrics` but never exposed through the trait.

**Root Cause**: `CoreMetrics` uses atomics and can't be cloned. The trait returns `CoreMetrics` by value but the implementor can't return its internal one. The trait design is flawed — it should return `CoreMetricsSnapshot` directly.

**Fix**: Change the trait to return `CoreMetricsSnapshot` instead of `CoreMetrics`:
```rust
fn metrics(&self) -> CoreMetricsSnapshot;
// implementations: fn metrics(&self) -> CoreMetricsSnapshot { self.metrics.snapshot() }
```

---

### F02: MEDIUM — `truncate()` function duplicated 4 times
**Severity**: LOW-MEDIUM | **Files**: freeform.rs, orchestrator_core.rs, swarm_core.rs, adversarial_core.rs
**Description**: The same `truncate(s: &str, max: usize) -> &str` helper is defined identically in 4 files. This is a simple code duplication issue — should be a shared utility.

**Note**: The `truncate()` in `freeform.rs` is NOT safe for multi-byte UTF-8 strings. If the string is sliced at `max` bytes and that lands in the middle of a multi-byte character, it will panic. Same bug in all 4 copies.

**Fix**: Move to a shared utility module, use `char_indices()` or `.get(..max).unwrap_or(s)` for UTF-8 safety.

---

### F03: MEDIUM — FreeformCore.execute() is a no-op pass-through
**Severity**: MEDIUM | **Files**: freeform.rs, (agent.rs bypass)
**Description**: `FreeformCore.execute()` does nothing real — it immediately returns a "pass-through" CoreOutput with `turns_used: 0`. The architecture comment explains this is intentional ("Agent::reply() currently calls reply_internal() directly"), but this means:
1. CoreOutput metrics for FreeformCore are meaningless (always turns=0, time=~0ms)
2. The core abstraction is incomplete — FreeformCore doesn't actually execute through the core interface
3. Agent.reply() bypasses CoreSelector entirely for the default case

This is a known architectural debt documented in the code comments, but it means the core system is only half-wired: specialized cores execute through `core.execute()`, but the default (and most commonly used) core does not.

---

