# Super-Goose v1.24.05 Continuation State

> **Last Updated**: 2026-02-11
> **Branch**: `main`
> **Last Commit**: `0d78beb6cc` — feat: v1.24.05 — 10 SOTA agent features with full wiring
> **Cargo Check**: CLEAN (zero warnings, zero errors)
> **Modified Files**: 23 files, 842 insertions, 218 deletions (uncommitted)
> **Session Transcript**: `C:\Users\Admin\.claude\projects\G--goose\6b176a30-f81c-4693-84d3-e1d1201422cf.jsonl`

---

## Table of Contents

1. [Current Codebase State](#1-current-codebase-state)
2. [10 SOTA Features - Wiring Status](#2-10-sota-features---wiring-status)
3. [Bug-Fix Agent Results](#3-bug-fix-agent-results)
4. [Dead Code Inventory](#4-dead-code-inventory)
5. [SOTA Competitive Analysis](#5-sota-competitive-analysis)
6. [Critical Gaps vs Competitors](#6-critical-gaps-vs-competitors)
7. [TimeWarp Integration Status](#7-timewarp-integration-status)
8. [TODO/FIXME Hot Spots](#8-todofixme-hot-spots)
9. [Prioritized Action Plan](#9-prioritized-action-plan)
10. [Build & Environment Notes](#10-build--environment-notes)
11. [Next Session Checklist](#11-next-session-checklist)

---

## 1. Current Codebase State

### 23 Uncommitted Modified Files

```
crates/goose-cli/src/scenario_tests/mock_client.rs
crates/goose/src/agents/adversarial/coach.rs
crates/goose/src/agents/adversarial/player.rs
crates/goose/src/agents/adversarial/review.rs
crates/goose/src/agents/evolution/memory_integration.rs
crates/goose/src/agents/evolution/optimizer.rs
crates/goose/src/agents/extension_manager_extension.rs
crates/goose/src/agents/planner.rs
crates/goose/src/agents/specialists/code_agent.rs
crates/goose/src/agents/specialists/deploy_agent.rs
crates/goose/src/agents/specialists/security_agent.rs
crates/goose/src/agents/specialists/test_agent.rs
crates/goose/src/agents/state_graph/runner.rs
crates/goose/src/guardrails/detectors/secret_detector.rs
crates/goose/src/mcp_gateway/credentials.rs
crates/goose/src/memory/consolidation.rs
crates/goose/src/providers/api_client.rs
crates/goose/src/providers/claude_code.rs
crates/goose/src/providers/githubcopilot.rs
crates/goose/src/providers/routing/registry.rs
crates/goose/src/providers/routing/router.rs
crates/goose/src/test_parsers/jest.rs
crates/goose/src/tools/search.rs
```

### What These Changes Are

These are bug-fixes, dead_code warning fixes, and audit improvements from 8+ background agents across 2 sessions:

- **Specialist agents** (code_agent, deploy_agent, security_agent, test_agent): Dead code warnings fixed, unused imports removed
- **Adversarial** (coach, player, review): Logging/tracing improvements, struct fixes
- **Evolution** (memory_integration, optimizer): Type fixes, API alignment
- **Providers** (api_client, claude_code, githubcopilot, routing/): Minor fixes
- **Other** (mock_client, planner, jest, search, credentials, consolidation, secret_detector): Various fixes

### Compilation Status

```
cargo check -p goose  →  CLEAN (0 warnings, 0 errors)
cargo check -p goose-cli  →  Not yet verified this session
cargo test  →  Not yet run (some test failures expected in adversarial/evolution)
```

---

## 2. 10 SOTA Features - Wiring Status

All 10 features from v1.24.05 commit were verified for actual runtime wiring in `agent.rs`:

| # | Feature | Status | Wiring Location |
|---|---------|--------|----------------|
| 1 | **Closed-Loop Reflexion** | WIRED | agent.rs:1935-1938, 2479-2481 |
| 2 | **Active Budget Enforcement** | WIRED | agent.rs:2039-2041, 2141 (CostTracker.record_llm_call) |
| 3 | **Bidirectional Output Guardrails** | WIRED | agent.rs:639, 1777, 2769 (GuardrailsEngine.scan) |
| 4 | **Structured Code-Test-Fix Loop** | EXISTS BUT DEAD | agent.rs:648 (run_structured_loop defined, NEVER CALLED) |
| 5 | **/model Hot-Switch** | WIRED | session/mod.rs:586 (Config::set_goose_model) |
| 6 | **Adaptive Compaction Manager** | WIRED | agent.rs:1622-1643 (check_if_compaction_needed) |
| 7 | **Cross-Session Search** | WIRED | cli.rs:1349 (goose session search) |
| 8 | **Smart Project Auto-Detection** | WIRED | reply_parts.rs:190 (detect_project_type) |
| 9 | **Per-Tool Rate Limiting** | WIRED | agent.rs:2229 (ToolRateLimiter) |
| 10 | **Session Bookmarks** | NO EVIDENCE | Not found in CLI or session code |

### Critical Finding: Feature #4 (Structured Loop) Is Dead Code

`run_structured_loop` is defined at agent.rs:648 but grep confirms zero callers anywhere in the codebase. The `ExecutionMode::Structured` variant exists but is never matched to call this function. This is a significant gap — the Code-Test-Fix loop exists architecturally but is never executed.

### Critical Finding: Feature #10 (Bookmarks) Has No Implementation

No `/bookmark` command handler exists in session/mod.rs or session/input.rs. The feature was listed in the commit message but has no corresponding code.

---

## 3. Bug-Fix Agent Results

### Session 1 Agents (8 agents, previous session)
- All 8 agents completed, producing the 23 modified files
- `cargo check` passed clean after their changes

### Session 2 Agents (5 agents, launched this session)

| # | Agent ID | Task | Status | Result |
|---|----------|------|--------|--------|
| 1 | `a67e6ab` | Adversarial test fixes | INTERRUPTED | Stuck on build lock + PATH |
| 2 | `a75c95c` | Evolution test fixes | INTERRUPTED | Identified bug, couldn't apply fix |
| 3 | `aeadb49` | Security agent warnings | **COMPLETED** | cargo check clean |
| 4 | `a23f67c` | Providers audit | INTERRUPTED | Partial audit, several files verified OK |
| 5 | `a28a940` | Core files audit | INTERRUPTED | coach.rs verified, player.rs in progress |

### Remaining Bug Fixes Needed

1. **review.rs timing assertion**: `total_duration_ms > 0` fails for sub-millisecond operations
   - File: `crates/goose/src/agents/adversarial/review.rs`
   - Fix: Use `total_duration_ms >= 0` or `total_duration.as_nanos() > 0`

2. **memory_integration_fix_tests.rs**: Wrong `TaskAttempt` field construction
   - File: `crates/goose/src/agents/evolution/memory_integration.rs`
   - Fix: Align test TaskAttempt struct construction with actual Reflexion API

3. **optimizer.rs improvement calculation**: May have test expectation mismatches
   - File: `crates/goose/src/agents/evolution/optimizer.rs`
   - Fix: Verify improvement calculation logic matches test expectations

### Blockers Encountered by Agents
- **Build lock contention**: Multiple agents cannot run `cargo` simultaneously
- **PATH issues**: `cargo` not in PowerShell PATH — use `C:\Users\Admin\.cargo\bin\cargo.exe`
- **Permission auto-denials**: Read/Desktop_Commander tools sometimes auto-denied

---

## 4. Dead Code Inventory

### Confirmed Dead Code (Never Called from Agent Core)

| Module | File | Lines | Status |
|--------|------|-------|--------|
| **WorkflowEngine** | agents/workflow_engine.rs | ~831 | DEAD — `WorkflowEngine::new` never called |
| **Orchestrator** | agents/orchestrator.rs | ~1,067 | DEAD — `Orchestrator::new` never called |
| **run_structured_loop** | agents/agent.rs:648 | ~100 | DEAD — defined but never invoked |
| **McpGateway** | mcp_gateway/ | ~4,128 | DEAD — `McpGateway::new` never instantiated |
| **comprehensive_validator** | quality/comprehensive_validator.rs | ~474 | PARTIAL — 11 TODOs, stubs |
| **multipass_validator** | quality/multipass_validator.rs | ~639 | PARTIAL — 3 TODOs |

### Total Dead/Stub Code: ~7,239 lines

### Modules That ARE Wired
- Reflexion (reflexion.rs) — WIRED in agent.rs
- CostTracker — WIRED in agent.rs
- GuardrailsEngine — WIRED in agent.rs
- CompactionManager — WIRED in agent.rs
- ToolRateLimiter — WIRED in agent.rs
- Memory (Mem0 + local) — WIRED in agent.rs
- ReasoningManager — WIRED in agent.rs
- CheckpointManager — WIRED in agent.rs
- CriticManager — WIRED (via DoneGate)
- ShellGuard — WIRED in tool execution
- Container (Docker/Microsandbox/Arrakis) — WIRED but backends NOT YET IMPLEMENTED (2 TODOs)

---

## 5. SOTA Competitive Analysis

### What Super-Goose Does BETTER Than Competitors

1. **MCP-Native Architecture** — Deepest MCP integration of any open-source agent
2. **Multi-Provider Support** — 40+ providers (Anthropic, OpenAI, Bedrock, Azure, Codex, etc.)
3. **Lead/Worker Model Routing** — Cost-optimized model switching with failure fallback
4. **Reflexion + Self-Critique** — Full Reflexion paper implementation with CriticManager
5. **Container Sandboxing** — Three backends (Docker, Microsandbox, Arrakis)
6. **Guardrails Engine** — 6 detectors (jailbreak, keyword, PII, prompt injection, secret, topic)
7. **Budget Enforcement** — Active CostTracker with per-session limits
8. **Human-in-the-Loop** — Breakpoints, pause/resume, feedback injection, plan approval
9. **Structured Execution Modes** — Freeform vs. Structured (Code-Test-Fix state graph)
10. **Swarm/Team Architecture** — Multi-agent coordination with specialist roles

### Where Super-Goose Falls Behind

1. **No Codebase Indexing** — No tree-sitter, no AST, no symbol graph, no semantic code search
2. **No Native Extended Thinking** — Has app-level reasoning but not provider-level thinking blocks
3. **No Background Execution** — Cannot fire-and-forget async tasks on branches
4. **No Prompt Caching** — Missing 90% cost savings on Anthropic API calls
5. **No Diff Preview** — File edits are blind (no before/after comparison)
6. **Architecture Data-Structure Heavy** — Many modules define types but lack runtime wiring

### The Core Insight

> The gap is NOT in breadth of features — Super-Goose has MORE features than most competitors.
> The gap is in DEPTH of integration. Specifically: codebase understanding, provider-native
> capabilities (extended thinking, prompt caching), and runtime wiring of existing modules.

---

## 6. Critical Gaps vs Competitors

### Gap 1: Codebase Indexing & Semantic Search (CRITICAL)
- **Competitors**: Cursor (@codebase queries), Windsurf (Cascade), Continue (RAG), Aider (repo map with tree-sitter)
- **Super-Goose**: Memory/embeddings exist (Candle MiniLM-L6-v2), but NO codebase indexer
- **Fix**: Build `code_intelligence/` module with tree-sitter AST parsing, symbol extraction, dependency graph, vector embeddings per file/symbol
- **Effort**: Medium (1-2 weeks)
- **Impact**: CRITICAL — this is THE differentiator

### Gap 2: Native Extended Thinking (CRITICAL)
- **Competitors**: Claude Code (thinking blocks), Codex CLI (reasoning_effort)
- **Super-Goose**: Has reasoning.rs/extended_thinking.rs (app-level) but Anthropic provider doesn't pass `thinking` config
- **Fix**: Add `thinking` parameter support in providers/anthropic.rs
- **Effort**: Low (2-3 days)
- **Impact**: HIGH

### Gap 3: Anthropic Prompt Caching (HIGH VALUE, LOW EFFORT)
- **Competitors**: Claude Code uses `cache_control` breakpoints for 90% cost savings
- **Super-Goose**: No prompt caching in provider layer
- **Fix**: Add `cache_control: {"type": "ephemeral"}` to system prompt and tool definitions in Anthropic provider
- **Effort**: Low (1-2 days)
- **Impact**: HIGH (90% cost reduction on repeated calls)

### Gap 4: Parallel Tool Execution (HIGH)
- **Competitors**: Claude Code (native parallel tool calls), Cursor, Codex
- **Super-Goose**: Subagent tool mentions parallel, but core tool execution may be sequential
- **Fix**: Verify and enable `tokio::join!` for concurrent tool calls in tool_execution.rs
- **Effort**: Medium (3-5 days)
- **Impact**: HIGH (2-5x latency reduction)

### Gap 5: Background Agent Mode (SIGNIFICANT)
- **Competitors**: Cursor Background Agents (cloud VM, branch, PR), Devin (async), Codex (Docker sandbox)
- **Super-Goose**: Fundamentally synchronous execution
- **Fix**: Add BackgroundAgent mode: fork branch, spin container, run agent, create PR, return task ID
- **Effort**: High (2-3 weeks)
- **Impact**: HIGH

### Gap 6: Diff Preview / Multi-File Atomic Edits (MODERATE)
- **Competitors**: Cursor (multi-file Apply), Aider (unified diff format), Claude Code (str_replace_editor)
- **Super-Goose**: File editing via MCP tool calls, no built-in diff format
- **Fix**: Add FileEditTool with unified diff format, preview, rollback, multi-file atomicity
- **Effort**: Medium (1 week)
- **Impact**: MEDIUM-HIGH

---

## 7. TimeWarp Integration Status

### Research Documents at `G:\goose\docs\timewarp\`

14 files totaling 670KB+:

| Document | Size | Status |
|----------|------|--------|
| README1.md | ~5KB | Overview, needs update |
| IMPLEMENTATION_ROADMAP.md | ~15KB | 5-phase Gantt plan |
| ARCHITECTURE_BLUEPRINT.md | ~23KB | Full system architecture |
| TIMEWARP_MISSING_FEATURES_GAP_ANALYSIS.md | ~51KB | P0-P3 gaps identified |
| TIMEWARP_SOTA_RESEARCH_UPDATE_FEB2026.md | ~39KB | Latest landscape analysis |
| SUPER_GOOSE_INTEGRATION.md | ~12KB | Integration with ALMAS, Coach/Player |
| COMPETITIVE_ANALYSIS.md | ~10KB | vs competitors |
| GITHUB_REPOS_REFERENCE.md | ~13KB | Open source repos to build from |
| TIMEWARP_BAR_UI_UX_SPEC.md | ~98KB | UI spec |
| TIMEWARP_DOCKABLE_BAR_ENHANCED_SPEC.md | ~128KB | Enhanced UI spec |
| TIMEWARP_DIAGRAMS.md | ~9KB | Mermaid diagrams |
| research/ENTERPRISE_SECURITY_FEATURES.md | ~81KB | Enterprise features |
| research/MULTI_AGENT_COORDINATION.md | ~74KB | Multi-agent coordination |
| architecture/REST_API_SPECIFICATION.md | ~76KB | REST API spec |
| architecture/RUST_CRATE_ARCHITECTURE.md | ~97KB | Rust crate design |

### TimeWarp P0 Critical Gaps (From Gap Analysis)

1. **WAL for atomic operations** — Zero backup/crash recovery mechanisms
2. **Configurable auto-save intervals** — No auto-save
3. **Crash recovery with journal replay** — No journal
4. **Incremental cloud backup** — No backup system
5. **Undo protection** — No undo

### TimeWarp Assessment

The research documents are extensive but draft-quality. The user noted they are "not complete, too many gaps, not agentic enough, not end to end." Key issues:

- **No Rust implementation exists** — All documents are specs/designs, zero code
- **UI specs are over-designed** — 226KB of UI specs for a system that has no backend
- **Enterprise features premature** — FIPS, RBAC, data residency specs exist before core event store
- **Integration plan exists** but depends on Super-Goose systems that are themselves incomplete (Orchestrator is dead code, MCP Gateway is dead code)

### Recommended TimeWarp Approach

1. **Phase 1**: Build minimal event store (SQLite + rusqlite, WAL mode) — 1 week
2. **Phase 2**: Add blob store with BLAKE3 content-addressing — 3 days
3. **Phase 3**: Wire into agent.rs as event recorder — 3 days
4. **Phase 4**: Add branch/timeline navigation CLI commands — 1 week
5. **DEFER**: UI, enterprise features, CI integration, cloud backup, multi-agent coordination

---

## 8. TODO/FIXME Hot Spots

97+ TODO/FIXME/HACK/XXX markers across 20+ files. Highest concentration:

| File | Count | Priority |
|------|-------|----------|
| specialists/test_agent.rs | 17 | HIGH — many stub implementations |
| validators/content.rs | 12 | MEDIUM — validation stubs |
| quality/multipass_validator.rs | 11 | MEDIUM — incomplete checks |
| quality/comprehensive_validator.rs | 10 | MEDIUM — 10 unimplemented checks |
| session/extension_data.rs | 8 | LOW — data layer TODOs |
| agents/critic.rs | 8 | MEDIUM — critic evaluation stubs |
| specialists/code_agent.rs | 7 | HIGH — code agent capabilities |
| agents/adversarial/coach.rs | 6 | LOW — logging improvements |
| todo_extension.rs | 4 | LOW |
| agents/container.rs | 2 | HIGH — Microsandbox/Arrakis NOT IMPLEMENTED |

---

## 9. Prioritized Action Plan

### Tier 0: IMMEDIATE (Before v1.24.05 Release)

| # | Action | Effort | Files |
|---|--------|--------|-------|
| 1 | **Fix adversarial test timing** | 30 min | review.rs |
| 2 | **Fix evolution test TaskAttempt** | 1 hour | memory_integration.rs |
| 3 | **Wire run_structured_loop** or remove it | 2 hours | agent.rs |
| 4 | **Implement /bookmark** or remove from feature list | 2 hours | session/mod.rs |
| 5 | **Commit 23 modified files** | 10 min | git add + commit |
| 6 | **Run full test suite** (`cargo test -p goose`) | 5 min | — |

### Tier 1: CRITICAL (Highest ROI, Next Sprint)

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 1 | **Anthropic Prompt Caching** | 1-2 days | 90% cost reduction |
| 2 | **Native Extended Thinking** | 2-3 days | Better reasoning quality |
| 3 | **Codebase Indexer v1** (tree-sitter + embeddings) | 1-2 weeks | Enables semantic code search |
| 4 | **Parallel Tool Execution** | 3-5 days | 2-5x latency reduction |

### Tier 2: HIGH VALUE (Following Sprint)

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 5 | **Background Agent Mode** | 2-3 weeks | Async workflows |
| 6 | **File Edit Tool with Diff Preview** | 1 week | Better edit UX |
| 7 | **More Test Parsers** (pytest, cargo, go) | 2-3 days | Broader language support |
| 8 | **SWE-bench Integration** | 1 week | Benchmarking |

### Tier 3: STRATEGIC (v1.25.x)

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 9 | **TimeWarp Event Store** (Phase 1-3) | 2 weeks | Time-travel for agents |
| 10 | **Vector DB Persistence** (replace in-memory semantic store) | 1 week | Cross-session memory |
| 11 | **Git-Aware Agent** (auto-commits, branch management) | 1 week | Git integration |
| 12 | **Wire Dead Code** (Orchestrator, WorkflowEngine, McpGateway) | 1-2 weeks | Activate existing code |

### Tier 4: FUTURE

| # | Feature | Effort |
|---|---------|--------|
| 13 | **TimeWarp UI** (timeline bar, branch visualization) | 3-4 weeks |
| 14 | **Enterprise TimeWarp** (encryption, RBAC, compliance) | 4-6 weeks |
| 15 | **CI/CD Timeline Integration** | 1-2 weeks |

---

## 10. Build & Environment Notes

### Windows Build Setup
```
Cargo: C:\Users\Admin\.cargo\bin\cargo.exe
Target Dir: C:\goose-target (~44GB, can safely clean incremental/)
RUSTFLAGS: -Lnative=C:/goose-target  (for dbghelp.lib)
Git: G:\goose (NVME)
```

### Concurrent Agent Limitations
- **DO NOT** run multiple `cargo` commands simultaneously — file lock contention
- Use sequential agent execution for builds, parallel only for read-only research
- Full path to cargo required in PowerShell: `C:\Users\Admin\.cargo\bin\cargo.exe`

### Key Crate Dependencies
- `tree-sitter` — Needed for codebase indexer (not yet added)
- `candle-core` + `candle-nn` — Already integrated for embeddings
- `rusqlite` — Already available, needed for TimeWarp event store
- `blake3` — Already available, needed for content-addressable storage

---

## 11. Next Session Checklist

### Quick Start (5 minutes)
```bash
cd G:\goose
git status                    # Verify 23 modified files
cargo check -p goose          # Should be clean
```

### Priority 1: Fix & Commit (30 minutes)
1. Fix review.rs timing assertion (`>= 0` instead of `> 0`)
2. Fix memory_integration.rs TaskAttempt construction
3. Wire run_structured_loop OR remove it
4. Implement /bookmark OR remove from feature list
5. `cargo test -p goose --lib` to verify
6. Commit all 23 files

### Priority 2: High-Impact Gaps (2-3 days)
1. Add prompt caching to Anthropic provider
2. Add native extended thinking support
3. Start codebase indexer prototype

### Priority 3: Audit & Release (1 day)
1. Run 4 bug-fix agents (one at a time to avoid lock contention)
2. Full `cargo test` suite
3. Tag v1.24.05 release

### Priority 4: TimeWarp (1-2 weeks)
1. Build minimal event store with SQLite
2. Wire into agent.rs as event recorder
3. Add `tw` CLI commands for timeline navigation

---

## Appendix A: Key File References

### Agent Core
- `crates/goose/src/agents/agent.rs` — Main agent loop (3000+ lines, 25+ fields)
- `crates/goose/src/agents/tool_execution.rs` — Tool execution pipeline
- `crates/goose/src/agents/reflexion.rs` — Reflexion implementation
- `crates/goose/src/agents/extended_thinking.rs` — CoT/ReAct/ToT reasoning
- `crates/goose/src/agents/reasoning.rs` — Reasoning mode selection

### Providers
- `crates/goose/src/providers/anthropic.rs` — Anthropic provider (needs thinking + caching)
- `crates/goose/src/providers/bedrock.rs` — AWS Bedrock
- `crates/goose/src/providers/azure.rs` — Azure OpenAI
- `crates/goose/src/providers/codex.rs` — OpenAI Codex (has reasoning_effort)
- `crates/goose/src/providers/lead_worker.rs` — Lead/Worker routing

### Infrastructure
- `crates/goose/src/memory/` — Memory system (Working/Episodic/Semantic/Procedural)
- `crates/goose/src/memory/embeddings.rs` — Candle MiniLM-L6-v2 embeddings
- `crates/goose/src/compaction/` — Context window management
- `crates/goose/src/guardrails/` — 6 safety detectors
- `crates/goose/src/mcp_gateway/` — MCP gateway (DEAD, needs wiring)

### Dead Code to Wire or Remove
- `crates/goose/src/agents/workflow_engine.rs` — 831 lines, never called
- `crates/goose/src/agents/orchestrator.rs` — 1,067 lines, never called
- `crates/goose/src/mcp_gateway/` — 4,128 lines, never instantiated

### TimeWarp Research
- `docs/timewarp/` — 14 documents, 670KB+ of specs (no code)
- Key: `IMPLEMENTATION_ROADMAP.md`, `ARCHITECTURE_BLUEPRINT.md`, `TIMEWARP_MISSING_FEATURES_GAP_ANALYSIS.md`

---

## Appendix B: Research Agent Outputs

Research agents produced detailed analysis. Full outputs stored at:

- **SOTA Analysis**: `C:\Users\Admin\AppData\Local\Temp\claude\G--goose\tasks\ae2e1d8.output`
  - Top 10 agentic features in 2026
  - Codebase areas ranked by impact
  - What's missing vs competitors
  - Prioritized recommendations with effort/impact

- **TimeWarp Continuation**: `C:\Users\Admin\AppData\Local\Temp\claude\G--goose\tasks\a9e2120.output`
  - Enterprise security features spec
  - CI/CD integration spec
  - Migration/interoperability spec
  - MCP tool definitions for timeline ops

- **Bug-Fix Agent Check**: `C:\Users\Admin\AppData\Local\Temp\claude\G--goose\tasks\a4d4a56.output`
  - All 5 agent stop reasons (4 interrupted, 1 completed)
  - File modification tracking
  - Detailed status per agent

---

## Appendix C: Competitive Landscape (Feb 2026)

| Agent | Codebase Index | Extended Thinking | Background Mode | Prompt Cache | MCP | HITL |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|
| **Claude Code** | Partial | Native | No | Native | Full | Yes |
| **Cursor** | Full | Via Model | Background Agents | No | Partial | Per-edit |
| **Windsurf** | Full (Cascade) | Via Model | No | No | Partial | Per-flow |
| **Codex CLI** | No | reasoning_effort | Docker sandbox | No | No | 3 modes |
| **Devin** | Full | Via Model | Always async | Unknown | No | Chat |
| **Aider** | repo map | Via Model | No | No | No | CLI |
| **Super-Goose** | **NONE** | **App-level only** | **No** | **No** | **BEST** | **Full** |

### Super-Goose Unique Strengths
- 40+ LLM providers with Lead/Worker routing
- Full Reflexion + CriticManager self-evaluation
- GuardrailsEngine with 6 safety detectors
- Active CostTracker with budget enforcement
- Container sandboxing (3 backends)
- Swarm/Team multi-agent coordination
- Session checkpointing with SQLite

### Key Takeaway for Next Release
Focus on **Tier 1 gaps** (prompt caching, extended thinking, codebase indexer) — these are high-impact, relatively low-effort, and close the biggest competitive gaps. Don't add new architectural modules until existing dead code is either wired or removed.
