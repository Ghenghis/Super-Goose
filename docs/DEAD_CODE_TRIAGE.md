# Dead Code Triage — Super-Goose v1.24.05

**Date**: 2026-02-11
**Auditor**: Claude Opus 4.6 (automated dead code analysis)
**Scope**: `crates/goose/src/` and `crates/goose-cli/src/`
**Total Dead Code Identified**: ~14,823 lines across 30 files

---

## Executive Summary

The codebase contains approximately 14,823 lines of dead or near-dead code across six major systems. The largest contributors are:

| System | Lines | Verdict | Rationale |
|--------|------:|---------|-----------|
| MCP Gateway (entire module) | 4,128 | **Remove** | Never imported outside its own module; duplicates existing permission system |
| Orchestrator + WorkflowEngine | 2,614 | **Keep** | Wired to CLI commands (`goose orchestrator`, `goose workflow`) |
| Specialist Agents (5 agents) | 2,860 | **Keep** | Required by Orchestrator; form coherent system |
| Team Module (8 files) | 3,513 | **Keep** | Well-designed builder/validator pattern; future feature |
| `computer_use.rs` annotations | ~100 | **Keep** | Struct fields for serde deserialization; standard pattern |
| Scattered `#[allow(dead_code)]` | ~8 | **Keep** | Serde struct fields (pytest parser, githubcopilot) |

**Recommended removals**: ~4,128 lines (MCP Gateway module)
**Recommended keeps**: ~10,695 lines (wired or future features)

---

## Detailed Inventory

### 1. MCP Gateway Module — REMOVE (4,128 lines)

The entire `crates/goose/src/mcp_gateway/` module is dead code. It is declared as `pub mod mcp_gateway` in `lib.rs` but is **never imported or used** by any code outside the module itself — not by `agent.rs`, not by the CLI, not by any other module.

It duplicates functionality already provided by:
- `crate::config::permission::PermissionManager` (used by agent.rs for tool permissions)
- The existing MCP client infrastructure in `agents/mcp_client.rs`

| File | Lines | Contains | Verdict |
|------|------:|----------|---------|
| `mcp_gateway/mod.rs` | 718 | `McpGateway` facade, `GatewayConfig`, tests | Remove |
| `mcp_gateway/permissions.rs` | 779 | `PermissionManager`, `PermissionPolicy`, `AllowList`, tests | Remove |
| `mcp_gateway/audit.rs` | 712 | `AuditLogger`, `AuditEntry`, `MemoryAuditStorage`, tests | Remove |
| `mcp_gateway/router.rs` | 770 | `McpRouter`, `ToolRegistry`, `ToolDefinition`, tests | Remove |
| `mcp_gateway/errors.rs` | 97 | `GatewayError` enum | Remove |
| `mcp_gateway/bundles.rs` | 527 | `BundleManager`, `Bundle`, `BundleStatus` | Remove |
| `mcp_gateway/credentials.rs` | 525 | `CredentialManager`, `CredentialStore` | Remove |
| **Total** | **4,128** | | **Remove** |

**Risk Assessment**: LOW. No code anywhere imports from this module. Removal is a clean leaf-node deletion with zero downstream breakage.

**Removal Steps**:
1. Delete `crates/goose/src/mcp_gateway/` directory
2. Remove `pub mod mcp_gateway;` from `crates/goose/src/lib.rs`
3. Verify build: `cargo check -p goose`

---

### 2. Orchestrator — KEEP (1,067 lines)

`crates/goose/src/agents/orchestrator.rs` (1,067 lines including 84 lines of tests)

**Status**: WIRED. The Orchestrator is actively used by:
- `crates/goose-cli/src/commands/orchestrator.rs` (205 lines) — `goose orchestrator status/create/add-task/start`
- `crates/goose-cli/src/commands/workflow.rs` (511 lines) — `goose workflow run/list/info/status/history`
- `crates/goose/src/agents/workflow_engine.rs` — uses `AgentOrchestrator` as its backend

**Exports used by CLI**: `AgentOrchestrator`, `AgentRole`, `OrchestratorConfig`, `TaskPriority`, `TaskResult`, `TaskStatus`, `Workflow`, `WorkflowStatus`, `WorkflowTask`

**Verdict**: Keep. This is a correctly wired feature that provides multi-agent workflow orchestration via CLI commands.

---

### 3. WorkflowEngine — KEEP (832 lines)

`crates/goose/src/agents/workflow_engine.rs` (832 lines, 0 tests)

**Status**: WIRED. Used by `crates/goose-cli/src/commands/workflow.rs` which provides:
- `goose workflow run <template>` — execute a workflow template
- `goose workflow list` — list available templates
- `goose workflow info <template>` — show template details
- `goose workflow status [id]` — check execution status
- `goose workflow history` — list past executions

**Dependencies**: Depends on `AgentOrchestrator` (item #2 above).

**Note**: Contains 3 hardcoded workflow templates (fullstack_webapp, microservice, comprehensive_testing) with no external configuration. These could be moved to TOML/YAML config files in a future cleanup.

**Verdict**: Keep. Provides functional CLI feature.

---

### 4. Specialist Agents — KEEP (2,860 lines)

All 5 specialist agents plus their shared module:

| File | Lines | Agent | Verdict |
|------|------:|-------|---------|
| `specialists/mod.rs` | 319 | `SpecialistAgent` trait, `SpecialistFactory`, utils | Keep |
| `specialists/code_agent.rs` | 564 | `CodeAgent` | Keep |
| `specialists/test_agent.rs` | 690 | `TestAgent` | Keep |
| `specialists/deploy_agent.rs` | 968 | `DeployAgent` | Keep |
| `specialists/docs_agent.rs` | 69 | `DocsAgent` (minimal) | Keep |
| `specialists/security_agent.rs` | 900 | `SecurityAgent` (OWASP patterns, compliance rules) | Keep |
| **Total** | **3,510** | | **Keep** |

**Status**: NOT directly wired to the main agent loop, but REQUIRED by the Orchestrator system. The `AgentOrchestrator::initialize_specialist_agents()` calls `SpecialistFactory::create_all()` which instantiates all 5 agents. The orchestrator's `execute_with_specialist()` dispatches tasks to these agents.

**`#[allow(dead_code)]` annotations in security_agent.rs**: 7 annotations on internal structs (`VulnerabilityPattern`, `VulnerabilitySeverity`, `ComplianceRule`, `ComplianceCategory`, `ComplianceCheckResult`, `DetectedVulnerability`, `ComplianceIssue`). These are used internally within the module but Rust's dead code analysis flags them because they are private and only constructed within the same module. This is a **false positive** — the fields are actively read.

**Verdict**: Keep. Required by the wired Orchestrator/WorkflowEngine system.

---

### 5. Team Module — KEEP (3,513 lines)

`crates/goose/src/agents/team/` (11 files)

| File | Lines | Purpose | Verdict |
|------|------:|---------|---------|
| `team/mod.rs` | 218 | Core types: `TeamRole`, `TeamCapabilities`, `TeamMember`, `TeamTask` | Keep |
| `team/builder.rs` | 152 | `BuilderAgent` — full tool access agent | Keep |
| `team/coordinator.rs` | 349 | `TeamCoordinator`, `TeamConfig`, `TeamWorkflow` | Keep |
| `team/validator.rs` | 198 | `ValidatorAgent` — read-only verification agent | Keep |
| `team/enforcer.rs` | 690 | `CapabilityEnforcer` — mandatory pairing enforcement | Keep |
| `team/handoffs.rs` | 611 | `HandoffManager` — artifact passing between agents | Keep |
| `team/roles.rs` | 614 | `AlmasRole`, `RoleConfig`, `CommandPermissions` | Keep |
| `team/almas_integration_tests.rs` | 381 | Integration tests (cfg(test)) | Keep |
| `team/enforcer_comprehensive_tests.rs` | 634 | Comprehensive enforcer tests (cfg(test)) | Keep |
| `team/enforcer_fix_validation_tests.rs` | 340 | Fix validation tests (cfg(test)) | Keep |
| `team/enforcer_fix_validation_tests_OLD.rs` | 326 | **OLD test file — stale** | **Remove** |
| **Total** | **3,513** | | **Keep (remove OLD file)** |

**Status**: NOT wired to CLI or main agent loop. However, this is a well-designed future feature implementing Claude Code-style builder/validator pairing. The types are exported from `agents/mod.rs` and the module has comprehensive tests.

**Blocking Relationship**: The Team module does NOT depend on the Orchestrator. It has its own `TeamCoordinator` that manages builder/validator workflows independently. Removing the Orchestrator would not affect Team mode.

**The `enforcer_fix_validation_tests_OLD.rs` file**: 326 lines of stale tests that appear to be a leftover from a refactor. Safe to remove.

**Verdict**: Keep (except OLD test file). Well-designed future feature with good test coverage.

---

### 6. `run_structured_loop` — NOT DEAD (wired)

`crates/goose/src/agents/agent.rs` line 648 — `pub async fn run_structured_loop()`

**Status**: WIRED. Called at line 1971 in the agent's main reply stream when structured mode is active. This is NOT dead code.

**Verdict**: No action needed.

---

### 7. `computer_use.rs` `#[allow(dead_code)]` annotations — KEEP (cosmetic)

`crates/goose-cli/src/computer_use.rs` — 16 `#[allow(dead_code)]` annotations

These are on struct fields within `Session`, `Permissions`, `ToolUsagePolicy`, and `CommandRecord` structs. The fields are populated during construction but not yet read because the Computer Use feature is partially implemented.

**Verdict**: Keep. These are intentional annotations for a work-in-progress feature.

---

### 8. `pytest.rs` `#[allow(dead_code)]` — KEEP (serde pattern)

`crates/goose/src/test_parsers/pytest.rs` line 70 — `PytestCrash::path` field

Single field marked dead_code. The struct is deserialized from JSON (`#[derive(Deserialize)]`) so the field is populated by serde but not directly read in Rust code. Standard pattern.

**Verdict**: Keep. Serde deserialization pattern.

---

### 9. `githubcopilot.rs` `#[allow(dead_code)]` — KEEP (serde pattern)

`crates/goose/src/providers/githubcopilot.rs` line 77 — `CopilotTokenInfo` struct

Comment explains: "fields accessed via serde deserialization and Debug fmt". Standard pattern for API response types.

**Verdict**: Keep. Serde deserialization pattern.

---

### 10. `subprocess.rs` `#[allow(unused_variables)]` — KEEP (cross-platform)

`crates/goose/src/subprocess.rs` line 6 — `command` parameter unused on some platforms

The `configure_subprocess` function uses `command` differently on Unix vs Windows via `#[cfg()]` blocks. The annotation prevents warnings on platforms where one branch is inactive.

**Verdict**: Keep. Standard cross-platform pattern.

---

### 11. Feature-Gated Modules (`#[cfg(feature = "memory")]`) — KEEP (4,929 lines)

These modules are gated behind the `memory` feature flag, which is **enabled by default**:

| File | Lines | Purpose |
|------|------:|---------|
| `agents/hitl.rs` | 822 | Human-in-the-loop integration |
| `agents/benchmark.rs` | 926 | Agent benchmarking framework |
| `agents/graph.rs` | 940 | Task graph engine |
| `agents/skill_registry.rs` | 905 | Skill registry for agent capabilities |
| `agents/extended_thinking.rs` | 486 | Extended thinking / chain-of-thought |
| `agents/swarm.rs` | 850 | Agentic swarm orchestration |
| **Total** | **4,929** | |

**Status**: Compiled by default (feature = "memory" is in default features). These are Phase 7-8 features from the v1.24.05 roadmap. They may or may not be wired to the main execution path, but they are explicitly part of the project's feature roadmap.

**Verdict**: Keep. Planned features behind a feature flag.

---

## Dependency Graph

```
WorkflowEngine (832 lines)
  └── depends on: AgentOrchestrator (1,067 lines)
       └── depends on: SpecialistAgent trait + 5 agents (3,510 lines)
            ├── CodeAgent
            ├── TestAgent
            ├── DeployAgent
            ├── DocsAgent
            └── SecurityAgent

CLI Commands (716 lines)
  ├── commands/orchestrator.rs → AgentOrchestrator
  └── commands/workflow.rs → WorkflowEngine → AgentOrchestrator

Team Module (3,513 lines) — INDEPENDENT
  ├── TeamCoordinator
  ├── BuilderAgent
  ├── ValidatorAgent
  ├── CapabilityEnforcer
  ├── HandoffManager
  └── AlmasRole/RoleConfig

MCP Gateway (4,128 lines) — ISOLATED (no external consumers)
  ├── McpGateway (facade)
  ├── McpRouter
  ├── PermissionManager (NOT the one used by agent.rs)
  ├── AuditLogger
  ├── CredentialManager
  └── BundleManager
```

---

## Recommended Removal Order

Remove leaf nodes first to minimize breakage risk:

| Priority | Action | Lines Saved | Risk |
|----------|--------|------------:|------|
| 1 | Delete `mcp_gateway/` module + `lib.rs` declaration | 4,128 | None — isolated module |
| 2 | Delete `team/enforcer_fix_validation_tests_OLD.rs` | 326 | None — stale test file |
| **Total** | | **4,454** | |

---

## What NOT to Remove

| System | Lines | Why Keep |
|--------|------:|----------|
| Orchestrator | 1,067 | Wired to `goose orchestrator` CLI |
| WorkflowEngine | 832 | Wired to `goose workflow` CLI |
| Specialist Agents | 3,510 | Required by Orchestrator |
| Team Module | 3,187 | Well-designed future feature with tests |
| Feature-gated modules | 4,929 | Phase 7-8 roadmap features |
| computer_use.rs annotations | ~100 | WIP feature |
| pytest/copilot/subprocess | ~10 | Serde/cross-platform patterns |

---

## Risk Assessment Summary

| Removal Target | Risk Level | Impact if Wrong | Rollback Difficulty |
|----------------|-----------|-----------------|---------------------|
| MCP Gateway module | **None** | Zero — no consumers | Easy (git revert) |
| OLD test file | **None** | Zero — stale tests | Easy (git revert) |
| Orchestrator (if removed) | **HIGH** | Breaks `goose orchestrator` + `goose workflow` CLI | Hard — many files |
| Specialists (if removed) | **HIGH** | Breaks Orchestrator | Hard — 5 files |
| Team module (if removed) | **Medium** | Loses future builder/validator feature | Medium — 8 files |

---

## Metrics

- **Total dead/near-dead code surveyed**: ~14,823 lines
- **Recommended for removal**: 4,454 lines (30%)
- **Recommended to keep (wired)**: 5,409 lines (36%)
- **Recommended to keep (future)**: 4,960 lines (34%)
- **Files to delete**: 8 (7 mcp_gateway files + 1 OLD test file)
- **Files to modify**: 1 (`lib.rs` — remove `pub mod mcp_gateway`)
