# Super-Goose Session Progress & Continuation Guide

> **Created**: 2026-02-09/10
> **Purpose**: Context preservation for session continuity
> **Repo**: G:\goose (Ghenghis/Super-Goose, fork of block/goose)
> **Branch**: main

---

## Table of Contents
1. [Completed Work](#completed-work)
2. [Uncommitted Changes](#uncommitted-changes)
3. [Pending Tasks](#pending-tasks)
4. [External Projects Integration](#external-projects-integration)
5. [CI/CD Status](#cicd-status)
6. [File Reference](#file-reference)
7. [Cargo Tools Installed](#cargo-tools-installed)
8. [Known Issues & Patterns](#known-issues--patterns)

---

## Completed Work

### Phase 1: Workflow Cleanup (Session 1)
- **Disabled 24 workflows** that need Block Inc infrastructure/API keys
- **16 workflows kept active** (CI, cargo-audit, scorecard, reusable builds)
- Fixed Scorecard imposter commit error (wrong SHA for codeql-action/upload-sarif)
- Fixed OpenAPI email mismatch
- Migrated conscious project paths from `D:\conscious` to `G:\goose\external\conscious`
- Moved `goose/goose/` folder to `docs/enterprise-qa/`
- Merged `fix/workflow-security-hardening` branch into main

### Phase 2: Block Upstream Merge (Session 2)
- **Synced with block/goose upstream** - merged 19 new commits from Block
- **Resolved 6 merge conflicts**:
  1. `build-cli.yml` - Kept our security additions (env var validation, save-if cache protection) + Block's MSVC approach
  2. `bundle-desktop-windows.yml` - Switched from Docker cross-compilation to native MSVC (per Block PR #7080)
  3. `cargo-audit.yml` - Deleted, replaced by `cargo-deny.yml` + `deny.toml` (Block PR #7032)
  4. `cli.rs` - 4 conflicts: removed BenchCommand (dead code after goose-bench crate deletion), kept WorkflowCommand
  5. `bench.rs` - Deleted (depended on removed goose-bench crate)
  6. `Cargo.lock` - Merged lock file changes

- **Key Block additions merged**:
  - `crates/goose/src/agents/tom_extension.rs` - Top Of Mind platform extension
  - `crates/goose-test-support/` - New test support crate with MCP fixtures
  - `evals/open-model-gym/` - New evaluation framework replacing goose-bench
  - `.github/workflows/cargo-deny.yml` - New dependency audit workflow
  - `deny.toml` - cargo-deny configuration

- **Commit**: `6d50389e2 Merge upstream block/goose main (19 commits)`
- **CI**: All 4 workflows GREEN after merge

### Phase 3: Cargo Tools & Dependency Management (Session 2-3)
All 6 cargo tools installed and integrated:

| Tool | Status | Binary Location |
|------|--------|----------------|
| cargo-machete | ✅ Installed | `C:/Users/Admin/.cargo/bin/cargo-machete.exe` |
| cargo-nextest | ✅ Installed | `C:/Users/Admin/.cargo/bin/cargo-nextest.exe` |
| cargo-hack | ✅ Installed | `C:/Users/Admin/.cargo/bin/cargo-hack.exe` |
| cargo-depgraph | ✅ Installed | `C:/Users/Admin/.cargo/bin/cargo-depgraph.exe` |
| cargo-edit | ✅ Installed | `cargo-add.exe`, `cargo-rm.exe`, `cargo-set-version.exe`, `cargo-upgrade.exe` |
| sccache | ✅ Installed | `C:/Users/Admin/.cargo/bin/sccache.exe` |

**CI Integration**: Added `cargo-tools` job to `ci-main.yml` (non-blocking with `continue-on-error: true`)
- Runs cargo-machete (unused dependency detection)
- Runs cargo-hack (feature combination testing for goose-cli, goose, goose-server)
- Only runs when Rust files change
- Parallel with build stage, does NOT block CI

**deny.toml Enhanced**:
```toml
[bans]
multiple-versions = "warn"
wildcards = "allow"
highlight = "all"
```

**Documentation Updated**:
- `.goosehints` - Added "Cargo Dependency Management Tools" section
- `AGENTS.md` - Added "Cargo Tools" subsection
- `external/conscious/docs/SUPER_GOOSE_INTEGRATION.md` - Added "Rust-Side Cargo Tools" section

---

## Uncommitted Changes

These files are modified on disk but **NOT yet committed**:

```
 M .github/workflows/ci-main.yml    (+49 lines: cargo-tools job + ci-status updates)
 M .goosehints                       (+40 lines: cargo dependency management section)
 M AGENTS.md                         (+22 lines: cargo tools subsection)
 M Cargo.lock                        (+25/-14 lines: dependency updates)
 M deny.toml                         (+5 lines: [bans] section)
```

**Total**: 127 insertions, 14 deletions across 5 files.

**Note**: `external/conscious/docs/SUPER_GOOSE_INTEGRATION.md` is in a separate git repo and needs separate commit there.

### Commit Command (when ready):
```bash
git add .github/workflows/ci-main.yml .goosehints AGENTS.md Cargo.lock deny.toml
git commit -m "feat: add cargo quality tools to CI and developer docs

- Add non-blocking cargo-tools CI job (cargo-machete, cargo-hack)
- Add [bans] section to deny.toml for duplicate dependency detection
- Document cargo tools in .goosehints, AGENTS.md
- Update Cargo.lock with latest dependency resolution

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git push origin main
```

---

## Pending Tasks

### HIGH PRIORITY

#### 1. Commit & Push Current Changes
- Stage the 5 modified files listed above
- Push to `origin/main`
- Verify all CI workflows pass (CI, Scorecard, CodeQL, Cargo Deny)

#### 2. Verify Cargo Tools Work Locally
Run each tool to confirm functionality:
```bash
# Set cargo path
CARGO="C:/Users/Admin/.cargo/bin/cargo.exe"

# Test cargo-machete (unused deps)
$CARGO machete --skip-target-dir

# Test cargo-hack (feature combos)
$CARGO hack check --no-default-features -p goose-cli

# Test cargo-nextest (fast test runner)
$CARGO nextest run --lib -p goose --no-fail-fast 2>&1 | head -20

# Test cargo-depgraph (dependency graph)
$CARGO depgraph --all-deps 2>&1 | head -20

# Test cargo-edit
$CARGO add --dry-run serde -p goose 2>&1

# Test sccache
sccache --show-stats
```

### MEDIUM PRIORITY

#### 3. Wire 6 External Projects into goose/conscious
Six projects exist in `G:\goose\external\`:

| Project | Type | Language | Key Integration Points |
|---------|------|----------|----------------------|
| aider | AI coding assistant | Python | CLI tool, git integration, LLM routing |
| conscious | Goose consciousness layer | Python | Session management, memory, learning |
| langgraph | LangChain graph framework | Python | Agent orchestration, state machines |
| OpenHands | AI software engineer | Python | Code generation, execution sandbox |
| PraisonAI | Multi-agent framework | Python | Agent coordination, task decomposition |
| pydantic-ai | Type-safe AI agents | Python | Structured output, tool definitions |

**Integration approach**: Create configuration manifests and bridge modules in `external/conscious/` that allow goose agents to discover and use these external tool libraries.

**Files to create/modify**:
- `external/conscious/config/external_tools.toml` - Registry of all external projects
- `external/conscious/src/integrations/` - Bridge modules for each project
- `external/conscious/docs/EXTERNAL_PROJECTS.md` - Documentation of all integrations

#### 4. Dependency Audit Deep Dive
- Run `cargo deny check` to see current advisory/ban status
- Run `cargo machete` to find truly unused dependencies
- Run `cargo depgraph` to visualize dependency tree
- Document findings in `docs/dependency-audit.md`

### LOW PRIORITY

#### 5. sccache Configuration
- Configure sccache as default Rust compiler wrapper
- Set up local cache directory
- Test compilation speedup

#### 6. CI Optimization Ideas
- Consider adding `cargo-nextest` to CI for faster test execution
- Consider `cargo-deny` license checking
- Consider build caching with sccache in CI

---

## External Projects Integration

### Directory Structure
```
G:\goose\external\
├── aider/          # AI coding assistant (Paul Gauthier)
├── conscious/      # Goose consciousness layer (our project)
│   ├── docs/
│   │   ├── SUPER_GOOSE_INTEGRATION.md  (modified - has cargo tools section)
│   │   └── EXTERNAL_PROJECTS.md        (to be created)
│   ├── config/
│   │   └── external_tools.toml         (to be created)
│   └── src/
│       └── integrations/               (to be created)
├── langgraph/      # LangChain graph framework
├── OpenHands/      # AI software engineer
├── PraisonAI/      # Multi-agent framework
└── pydantic-ai/    # Type-safe AI agents
```

### Integration Strategy
1. **Registry Pattern**: Central TOML config listing all external tools with paths, capabilities, entry points
2. **Bridge Modules**: Python bridge code in conscious that imports/wraps external project functionality
3. **Discovery Protocol**: Agents can query the registry to find relevant tools for their current task
4. **Graceful Degradation**: Missing external projects should warn, not crash

---

## CI/CD Status

### Active Workflows (16 total)
| Workflow | File | Trigger | Status |
|----------|------|---------|--------|
| CI (Redesigned) | `ci-main.yml` | push/PR to main | ✅ GREEN |
| Scorecard | `scorecard.yml` | push to main, cron | ✅ GREEN |
| CodeQL | `codeql.yml` | push/PR to main | ✅ GREEN |
| Cargo Deny | `cargo-deny.yml` | push/PR to main | ✅ GREEN (new from Block) |
| Build CLI | `build-cli.yml` | workflow_call only | ✅ (reusable) |
| Bundle Desktop Windows | `bundle-desktop-windows.yml` | workflow_call only | ✅ (reusable) |
| Bundle Desktop macOS | `bundle-desktop-macos.yml` | workflow_call only | ✅ (reusable) |

### Disabled Workflows (24 total)
Changed to `workflow_dispatch:` only to prevent accidental triggers.
Need Block Inc infrastructure: LLM API keys, signing certificates, AWS roles, etc.

### CI Pipeline Stages (ci-main.yml)
```
Stage 1: Detect Changes (< 10 sec)
  └→ docs-only? → Docs Check (fast path, 1-2 min)
  └→ rust changed? → Stage 2a: Lint Rust → Stage 3: Build Rust → Stage 4: Test Unit + Integration
  └→ typescript changed? → Stage 2b: Lint TS → Stage 3: Build TS → Stage 4: Test TS
  └→ Stage 2c: Cargo Quality Tools (non-blocking, parallel with build)
  └→ Stage 5: CI Status (always runs, aggregates all results)
```

---

## File Reference

### Key Modified Files (This Session)

| File | Changes | Committed? |
|------|---------|-----------|
| `.github/workflows/ci-main.yml` | Added cargo-tools job | ❌ Uncommitted |
| `.goosehints` | Added cargo dependency management docs | ❌ Uncommitted |
| `AGENTS.md` | Added cargo tools subsection | ❌ Uncommitted |
| `Cargo.lock` | Updated dependency resolution | ❌ Uncommitted |
| `deny.toml` | Added [bans] section | ❌ Uncommitted |
| `external/conscious/docs/SUPER_GOOSE_INTEGRATION.md` | Added cargo tools section | Separate repo |
| `crates/goose-cli/src/cli.rs` | Removed BenchCommand, kept WorkflowCommand | ✅ Committed (merge) |
| `.github/workflows/build-cli.yml` | Windows MSVC approach | ✅ Committed (merge) |
| `.github/workflows/bundle-desktop-windows.yml` | Native Windows runner | ✅ Committed (merge) |
| `.github/workflows/cargo-audit.yml` | DELETED (replaced by cargo-deny) | ✅ Committed (merge) |
| `crates/goose-cli/src/commands/bench.rs` | DELETED (dead code) | ✅ Committed (merge) |

### Important Config Files
| File | Purpose |
|------|---------|
| `Cargo.toml` | Workspace root, resolver = "2" |
| `deny.toml` | cargo-deny config (advisories + bans) |
| `.github/workflows/ci-main.yml` | Main CI pipeline |
| `.goosehints` | Agent hint documentation |
| `AGENTS.md` | Agent command reference |

---

## Cargo Tools Installed

All installed to `C:\Users\Admin\.cargo\bin\`:

| Tool | Binary | Purpose | Key Commands |
|------|--------|---------|-------------|
| cargo-machete | `cargo-machete.exe` | Find unused dependencies | `cargo machete --skip-target-dir` |
| cargo-nextest | `cargo-nextest.exe` | Faster test runner | `cargo nextest run --lib` |
| cargo-hack | `cargo-hack.exe` | Feature combination tester | `cargo hack check --no-default-features -p <crate>` |
| cargo-depgraph | `cargo-depgraph.exe` | Dependency graph visualizer | `cargo depgraph --all-deps` |
| cargo-edit | `cargo-add.exe` etc. | Add/remove dependencies | `cargo add <dep>`, `cargo rm <dep>`, `cargo upgrade` |
| sccache | `sccache.exe` | Shared compilation cache | `sccache --show-stats` |

**Note**: `cargo.exe` is NOT in PATH. Use full path: `C:/Users/Admin/.cargo/bin/cargo.exe`

---

## Known Issues & Patterns

### Windows/Git
- NUL file issues can break git operations on Windows
- `safe.directory` errors common with worktrees
- Agent worktrees don't auto-commit - work gets orphaned
- Rescued ~150 files from 6 orphaned worktrees on 2026-02-09

### CI Gotchas
- `issue_comment` triggers fire on EVERY comment including bot comments = cascading failures
- GitHub still parses `.DISABLED` renamed files - must delete or change trigger to `workflow_dispatch`
- Reusable workflows (`workflow_call`) are safe to keep - only fire when called
- `if: github.repository == 'Ghenghis/Super-Goose'` checks help but don't prevent `startup_failure`
- Best disable pattern: change `on:` to `workflow_dispatch:` only + add DISABLED comment

### Cost Concerns
- Free: GitHub Actions (2000 min/month), GHCR, SignPath (10 releases/month)
- Expensive: LLM API calls (Anthropic, OpenAI, etc.) - disabled for now

### Dependency Management
- 60+ duplicated crates detected (windows-sys has 6 versions, hashbrown has 4)
- `deny.toml` [bans] section set to "warn" not "deny" to avoid blocking CI
- Cargo resolver = "2" already configured in workspace root

---

## Quick Resume Commands

For the next session, start with:

```bash
# Check current state
cd G:\goose
git status
git log --oneline -3

# Commit pending changes (if not done)
git add .github/workflows/ci-main.yml .goosehints AGENTS.md Cargo.lock deny.toml
git commit -m "feat: add cargo quality tools to CI and developer docs"
git push origin main

# Verify CI
gh run list --limit 5

# Test cargo tools
C:/Users/Admin/.cargo/bin/cargo.exe machete --skip-target-dir
C:/Users/Admin/.cargo/bin/cargo.exe hack check --no-default-features -p goose-cli
C:/Users/Admin/.cargo/bin/cargo.exe nextest run --lib -p goose --no-fail-fast 2>&1 | head -20
```

---

*Last updated: 2026-02-10T02:00:00Z*
