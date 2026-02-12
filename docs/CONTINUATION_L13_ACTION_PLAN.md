# L13 Action Plan: Super-Goose Self-Improving Agent

> **Honest Assessment Date:** 2026-02-12
> **Current Level:** L5.5 (Monitored Autonomy with partial learning)
> **Target Level:** L13 (Strategic Autonomy — self-directed product evolution)
> **Key Requirement:** Agent must code itself, test itself, rebuild itself, improve seamlessly

---

## Part 1: Brutally Honest Current State Audit

### What's REAL (functional production code)

| Component | Status | Evidence |
|-----------|--------|----------|
| Agent reply() loop | **REAL** | Processes messages, invokes tools, streams responses |
| CoreSelector auto-dispatch | **REAL** | Lines 1837-1932 in agent.rs — selects core, dispatches, records experience |
| ExperienceStore (SQLite) | **REAL** | Creates `experience.db`, records task→core→outcome with real SQL |
| SkillLibrary (SQLite) | **REAL** | Creates `skills.db`, stores/retrieves verified strategies |
| InsightExtractor | **REAL** | Pattern analysis on ExperienceStore data |
| CoreSelector | **REAL** | Confidence-based selection with experience history |
| 6 AgentCores | **REAL** | Each has real execute() logic — not empty stubs |
| init_learning_stores() | **WIRED** | Called lazily in reply() — line 1672 |
| MCP tool system | **REAL** | 3000+ extensions, stdio/streamable_http, full tool protocol |
| Pipeline Visualization | **REAL UI** | Reads ChatState, renders real-time — but reads LOCAL state only |
| OTA SelfBuilder | **REAL CODE** | Uses tokio::process::Command to run `cargo build` |
| OTA BinarySwapper | **REAL CODE** | File copy + rename with backup/rollback |
| OTA HealthChecker | **REAL CODE** | Spawns binary, checks version, runs test suite |
| OTA RollbackManager | **REAL CODE** | Maintains swap history, restores from backup |
| Autonomous TaskScheduler | **REAL CODE** | Cron-like scheduling with priority queues |
| Autonomous CiWatcher | **REAL CODE** | Polls CI status, triggers actions |

### What's UNWIRED (real code, never called from production paths)

| Component | Status | Gap |
|-----------|--------|-----|
| OTA modules (all 7) | **UNWIRED** | `pub mod ota` in lib.rs but ZERO imports in agent.rs or any handler |
| Autonomous modules (all 8) | **UNWIRED** | `pub mod autonomous` in lib.rs but ZERO imports anywhere |
| Core execute() for non-freeform | **WIRED but untested** | Dispatch exists but most messages stay in Freeform |
| SkillLibrary retrieve | **PARTIALLY WIRED** | Store exists but not consulted during planning |
| InsightExtractor | **UNWIRED** | Never called from production code path |
| SuperGoosePanel (8 panels) | **MOCK UI** | Hardcoded JSX — no real backend data |
| Enterprise settings panels | **MOCK UI** | 7 panels render forms but don't persist |

### The Critical Gap

**Super-Goose has ~15,000 lines of self-improvement infrastructure that is compiled, tested, but NEVER INVOKED from any production code path.** The OTA pipeline can literally rebuild the binary, swap it, health-check it, and roll back — but nothing ever triggers it. The autonomous daemon can schedule tasks, watch CI, and manage releases — but it's never started.

This is the single biggest gap between L5.5 and L13. The code EXISTS. It needs to be WIRED.

---

## Part 2: The L5.5 → L13 Level Map

Based on the L13.md framework (already in docs/), here's what each level requires:

| Level | Name | Key Capability | Super-Goose Status |
|-------|------|----------------|-------------------|
| L5 | Monitored Autonomy | Execute tasks with human oversight | ✅ DONE |
| L5.5 | Partial Learning | Cross-session experience, core selection | ✅ DONE |
| L6 | Self-Correcting | Auto-detect failures, retry with different strategy | 🔶 PARTIAL — reflexion exists but not auto-triggered |
| L7 | Multi-Agent Coordinator | Spawn sub-agents, coordinate parallel work | 🔶 PARTIAL — OrchestratorCore/SwarmCore exist but untested |
| L8 | Governed Autonomy | Runtime safety constraints, sandboxed execution | ❌ MISSING — guardrails are warn-only |
| L9 | Self-Improving | Modify own prompts/tools based on performance | ❌ MISSING — experience recorded but never used to improve |
| L10 | Self-Engineering | Modify own codebase, rebuild, deploy | ❌ UNWIRED — OTA code exists but never triggered |
| L11 | Self-Testing | Write tests for own changes, validate before deploy | ❌ MISSING — no self-test pipeline |
| L12 | Multi-Product | Manage multiple projects autonomously | ❌ MISSING |
| L13 | Strategic Autonomy | Self-directed roadmap, competitive analysis, strategic pivots | ❌ MISSING |

---

## Part 3: The Self-Improvement Loop Architecture

### What "coding itself" actually means

For Super-Goose to improve itself, it needs this exact pipeline:

```
┌─────────────────────────────────────────────────────────────┐
│                    SELF-IMPROVEMENT LOOP                     │
│                                                              │
│  1. IDENTIFY  ─→  2. PLAN  ─→  3. CODE  ─→  4. TEST       │
│       ↑                                          │          │
│       │            5. BUILD  ←─  6. SWAP  ←──────┘          │
│       │                              │                       │
│       │            7. HEALTH ←───────┘                       │
│       │                 │                                    │
│       │         ┌───────┴───────┐                           │
│       │         │  PASS?        │                           │
│       │         │  YES → LOG    │                           │
│       │         │  NO → ROLLBACK│                           │
│       │         └───────────────┘                           │
│       │                                                      │
│       └──────── 8. LEARN (update experience store) ─────────│
└─────────────────────────────────────────────────────────────┘
```

### Step-by-step engineering blueprint

**Step 1: IDENTIFY** — What needs improvement?
- Query ExperienceStore for failure patterns (already exists in InsightExtractor)
- Analyze tool call logs for repeated errors
- Compare benchmark scores over time
- Check CI failure trends (CiWatcher already has this logic)

**Step 2: PLAN** — Generate a concrete code change
- LLM generates a plan: which files to modify, what to change, why
- CriticManager reviews the plan (already exists)
- Plan must include: test expectations, rollback criteria, success metrics

**Step 3: CODE** — Write the actual changes
- Agent uses its own tool system (developer extension) to modify files
- Changes written to a git branch (NOT main)
- All changes are atomic — single commit per improvement

**Step 4: TEST** — Validate the changes
- Run `cargo test --workspace --lib` for Rust changes
- Run `npx vitest run` for TypeScript changes
- Run `npx tsc --noEmit` for type checking
- Compare test counts: new tests must >= old tests (no regressions)

**Step 5: BUILD** — Compile the new binary
- SelfBuilder.build() invokes `cargo build -p goose-cli -p goose-server`
- Already implemented in `crates/goose/src/ota/self_builder.rs`
- Validates binary exists and is newer than previous

**Step 6: SWAP** — Replace the running binary
- BinarySwapper.swap() backs up current, installs new
- Already implemented in `crates/goose/src/ota/binary_swapper.rs`
- On Windows: requires process restart (binary is locked while running)

**Step 7: HEALTH** — Verify the new binary works
- HealthChecker runs version check, basic smoke tests
- Already implemented in `crates/goose/src/ota/health_checker.rs`
- Must verify: binary starts, responds to health endpoint, passes quick tests

**Step 8: LEARN** — Record what happened
- ExperienceStore.record() logs success/failure of the improvement
- InsightExtractor analyzes patterns across improvements
- SkillLibrary stores successful improvement strategies for reuse

### The Windows Process Restart Problem

On Windows, a running `.exe` cannot replace itself. The solution:

1. **Watchdog pattern**: A small supervisor process (`goose-watchdog.exe`) monitors the main process
2. **Staged update**: New binary written to `.update/goosed.exe`
3. **Graceful shutdown**: Main process exits cleanly with exit code indicating "update pending"
4. **Watchdog swaps**: Watchdog detects exit code, renames files, restarts
5. **Health check**: Watchdog verifies new process starts, rolls back if it doesn't

This is exactly how Electron's `autoUpdater` works — and we're already an Electron app.

---

## Part 4: Concrete Implementation Plan (No Stubs, No Fluff)

### Phase A: Wire the Unwired (2-3 sessions)

**Goal:** Connect the 15,000 lines of OTA + Autonomous code to production paths.

1. **Wire OTA trigger endpoint**
   - Add `/self-improve` slash command to agent.rs
   - When invoked: runs InsightExtractor → plans improvement → executes pipeline
   - File: `crates/goose/src/agents/agent.rs` (add command handler)

2. **Wire Autonomous daemon startup**
   - Add `--daemon` flag to goose-cli
   - When started: launches AutonomousDaemon in background thread
   - TaskScheduler polls for scheduled improvements
   - File: `crates/goose-cli/src/main.rs`

3. **Wire InsightExtractor to reply()**
   - After every N replies (configurable), run insight extraction
   - Store insights as SkillLibrary entries when verified
   - File: `crates/goose/src/agents/agent.rs` (add post-reply hook)

4. **Wire SkillLibrary to planning**
   - Before create_plan(), query SkillLibrary for relevant skills
   - Inject retrieved skills as context for LLM planning
   - File: `crates/goose/src/agents/agent.rs` (modify create_plan)

5. **Wire CiWatcher to push events**
   - CiWatcher.poll() on schedule → pushes results to Agent event bus
   - Failures trigger auto-improvement cycle
   - File: new `crates/goose/src/ota/trigger.rs`

### Phase B: Self-Test Pipeline (1-2 sessions)

**Goal:** Agent can test its own changes before deploying them.

1. **TestRunner module**
   - New file: `crates/goose/src/ota/test_runner.rs`
   - Invokes `cargo test`, `npm test`, `tsc --noEmit` programmatically
   - Parses output: counts pass/fail/skip, detects regressions
   - Returns TestResult { passed: bool, summary: String, regressions: Vec<String> }

2. **SandboxedExecution**
   - All self-modifications happen on a git branch, never main
   - If tests fail → `git checkout main && git branch -D auto-improve/xxx`
   - If tests pass → merge to main (or keep as PR for human review)

3. **Regression Gate**
   - Before any swap: test count must be >= previous
   - Type check must pass with 0 errors
   - No new test failures (diff against baseline)

### Phase C: Self-Coding Loop (2-3 sessions)

**Goal:** Agent generates code changes and validates them.

1. **ImprovementPlanner**
   - New file: `crates/goose/src/autonomous/improvement_planner.rs`
   - Input: InsightExtractor patterns + benchmark scores + CI failures
   - Output: Concrete FileEdit[] — exact file paths, line ranges, new content
   - Uses LLM with system prompt that includes: codebase map, style guide, test patterns

2. **CodeApplier**
   - New file: `crates/goose/src/autonomous/code_applier.rs`
   - Takes FileEdit[] → creates git branch → applies edits → commits
   - Uses the existing developer extension's file editing tools
   - All changes atomically committed with descriptive message

3. **ValidationPipeline**
   - New file: `crates/goose/src/autonomous/validation_pipeline.rs`
   - Orchestrates: apply changes → test → build → health check → swap or rollback
   - Emits events at each stage for monitoring
   - Records everything in ExperienceStore

### Phase D: Continuous Self-Improvement (1-2 sessions)

**Goal:** Agent improves without human intervention.

1. **PerformanceBenchmark**
   - Track: response time, tool call success rate, task completion rate
   - Store metrics in SQLite time series
   - Detect regressions: alert if any metric drops >10% over rolling window

2. **AutoImprovementScheduler**
   - Runs on configurable schedule (daily/weekly)
   - Queries benchmarks for degradations
   - Triggers improvement cycle for worst-performing areas
   - Rate-limited: max 1 self-modification per day (safety)

3. **ImprovementLog**
   - Every self-modification fully logged: what changed, why, test results, rollback?
   - Human-readable markdown generated for each improvement
   - Queryable via `/improvements` command

### Phase E: Safety Rails (Throughout)

**Goal:** Prevent self-bricking, ensure reversibility.

1. **Immutable Safety Invariants**
   - Self-modification CANNOT modify: safety rails, rollback code, health check code
   - Protected file list: `ota/rollback.rs`, `ota/health_checker.rs`, `agents/guardrails.rs`
   - Any edit to protected files → immediate abort + alert

2. **Binary Backup Chain**
   - Keep last 5 good binaries (not just 1)
   - Each backup tagged with: test results, timestamp, improvement ID
   - Manual rollback via `/rollback [N]` command

3. **Circuit Breaker**
   - If 3 consecutive self-improvements fail → disable auto-improvement
   - Require human `/enable-auto-improve` to restart
   - Log failure chain for diagnosis

4. **Sandbox All Self-Modifications**
   - Changes always on branch, never direct to main
   - Build in temporary directory, not in-place
   - Test in subprocess, not in current process

---

## Part 5: What L13 Actually Looks Like

When all phases are complete, Super-Goose at L13 would:

1. **Monitor its own performance** — tracks success rates, identifies failure patterns
2. **Plan its own improvements** — generates concrete code changes to fix issues
3. **Code the changes** — modifies its own source code on a branch
4. **Test the changes** — runs full test suite, detects regressions
5. **Build a new binary** — compiles with cargo, produces new .exe
6. **Deploy the update** — swaps binary via watchdog, restarts
7. **Verify the deployment** — health checks, smoke tests, rollback if broken
8. **Learn from the outcome** — records success/failure, updates strategies
9. **Repeat autonomously** — on schedule or triggered by performance degradation

### What L13 does NOT mean

- ❌ Uncontrolled recursive self-improvement (L15)
- ❌ Creating new agents from scratch (L14)
- ❌ Modifying its own safety rails (never)
- ❌ Operating without any human oversight (circuit breakers exist)
- ❌ Perfect autonomous coding (still uses LLM which can fail)

---

## Part 6: Competitive Positioning

### Where Super-Goose stands vs the field

| System | Self-Improving? | Rebuilds Itself? | Tests Own Changes? | Level |
|--------|-----------------|-------------------|--------------------|----|
| Devin | ❌ No | ❌ No | ❌ No | L4-L5 |
| OpenHands | ❌ No | ❌ No | Partial | L5-L6 |
| Cursor Agent | ❌ No | ❌ No | ❌ No | L3-L4 |
| SICA | ✅ Yes | ❌ No (Python) | ✅ Yes | L8-L9 |
| DGM (Darwin Gödel Machine) | ✅ Yes | ❌ No | ✅ Yes | L7-L8 |
| **Super-Goose (current)** | 🔶 Partial (records exp) | ❌ Unwired | ❌ No | L5.5 |
| **Super-Goose (target)** | ✅ Full loop | ✅ OTA pipeline | ✅ Full test suite | L10-L13 |

### The unique advantage

Super-Goose is the **only** system with:
- Rust backend (can compile itself with `cargo build`)
- OTA binary swap pipeline (already written, just unwired)
- Cross-session learning (ExperienceStore + SkillLibrary + InsightExtractor)
- Multi-core dispatch (6 specialized execution strategies)
- Native MCP (3000+ tool integrations)

No other open-source agent has all five. SICA and DGM are Python-only and cannot rebuild themselves as compiled binaries. This is Super-Goose's moat.

---

## Part 7: Implementation Priority Matrix

| Priority | Phase | Sessions | Complexity | Impact |
|----------|-------|----------|------------|--------|
| 🔴 P0 | Wire OTA to production | 1 | Medium | Unlocks L10 |
| 🔴 P0 | Wire InsightExtractor + SkillLibrary | 1 | Low | Unlocks L9 |
| 🟠 P1 | Self-test pipeline | 1-2 | Medium | Required for safety |
| 🟠 P1 | Self-coding loop | 2-3 | High | Core L13 capability |
| 🟡 P2 | Autonomous daemon wiring | 1 | Medium | Continuous operation |
| 🟡 P2 | Windows watchdog process | 1 | Medium | Required for binary swap |
| 🟢 P3 | Performance benchmarking | 1 | Low | Metrics tracking |
| 🟢 P3 | Safety circuit breakers | 1 | Low | Defense in depth |

### Minimum Viable L10 (Self-Engineering)

The absolute minimum to reach L10:
1. Wire OTA trigger (`/self-improve` command)
2. Wire TestRunner (invoke cargo test + vitest)
3. Wire ValidationPipeline (test → build → swap → health)
4. Add circuit breaker (3 failures → stop)
5. Add binary backup chain (keep last 5)

**Estimated: 2-3 sessions of focused implementation.**

---

## Part 8: Research References

Key papers informing this plan (from L13.md):

- **SICA** (arxiv.org/abs/2504.15228) — Self-improving coding agent, 17%→53% SWE-bench
- **Darwin Gödel Machine** (arxiv.org/abs/2505.22954) — Evolutionary agent improvement
- **Huxley Gödel Machine** (arxiv.org/abs/2510.21614) — ICLR 2026 Oral, improved DGM
- **Live-SWE-agent** (arxiv.org/abs/2511.13646) — Self-tool-creating agent, 77.4% SWE-bench
- **AgentSpec** (arxiv.org/abs/2503.18666) — ICSE 2026, runtime safety constraints
- **MI9 Protocol** (arxiv.org/abs/2508.03858) — Runtime risk management
- **Inoculation Prompting** (arxiv.org/abs/2511.18397) — 75-90% misalignment reduction

### Implementation-ready open-source:

- **SICA** (github.com/MaximeRobeyns/self_improving_coding_agent) — Pattern reference
- **EvoAgentX** (github.com/EvoAgentX/EvoAgentX) — Self-evolving framework
- **OpenEvolve** (github.com/codelion/openevolve) — AlphaEvolve open-source
- **Swarms-rs** — Rust multi-agent framework, directly compatible

---

## Summary

**Current state:** Super-Goose is at L5.5 with ~15,000 lines of L10 infrastructure that's compiled and tested but never invoked from production code.

**Critical path to L10:** Wire OTA + self-test + validation pipeline. The code already exists — it needs ~500 lines of glue code to connect it.

**Path to L13:** L10 (self-engineering) + autonomous improvement scheduling + performance benchmarking + strategic planning capabilities. Estimated 8-12 sessions of focused implementation.

**The moat:** Rust self-compilation + OTA binary swap is unique among all open-source agents. No other system can rebuild itself as a compiled binary with rollback safety.

**No AI slop. No fluff. Real code. Real gaps. Real plan.**
