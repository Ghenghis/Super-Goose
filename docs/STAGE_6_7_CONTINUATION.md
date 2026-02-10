# Super-Goose Stage 6-7 Continuation State
## Session: 2026-02-10 — Definitive Implementation Guide

> **STATUS: 🔴 READY TO BUILD** — All 10 repos cloned, analysis complete, wiring tasks defined
> **PREREQUISITE**: Stage 5.5 complete (see `CONTINUATION_STATE.md` — all 5 priorities done)

> **PURPOSE**: This document contains EVERYTHING an agent needs to wire the Stage 6-7
> components into Super-Goose. Each task has exact file paths, code patterns, and
> verification steps. Read this file FIRST, then use agents to code each section.

---

## Table of Contents
1. [Project Inventory](#1-project-inventory)
2. [Architecture Overview](#2-architecture-overview)
3. [Priority 1: Metacognitive Loop (DSPy + Inspect AI + Mem0ᵍ)](#3-priority-1-metacognitive-loop)
4. [Priority 2: Sandbox Runtime (microsandbox + Arrakis)](#4-priority-2-sandbox-runtime)
5. [Priority 3: Observability (OTel + Langfuse + Logfire)](#5-priority-3-observability)
6. [Priority 4: Supply-Chain & Provenance](#6-priority-4-supply-chain)
7. [Priority 5: Structural Editing & Verification](#7-priority-5-structural-editing)
8. [Bridge Module Tasks](#8-bridge-module-tasks)
9. [Docker Compose Stack](#9-docker-compose-stack)
10. [Verification Matrix](#10-verification-matrix)
11. [Known Issues & Gotchas](#11-known-issues)
12. [Quick Resume Commands](#12-quick-resume-commands)

---

## 1. Project Inventory

### Existing (Stage 5.5 — All Wired)
| Repo | Path | Language | Status |
|------|------|----------|--------|
| Goose Core | `crates/goose/` | Rust | ✅ 21 wired modules in hot path |
| Aider | `external/aider/` | Python | ✅ MCP server created (aider_mcp_server.py) |
| Conscious | `external/conscious/` | Python | ✅ Bridge modules + voice engine |
| LangGraph | `external/langgraph/` | Python | ✅ Bridge module |
| OpenHands | `external/OpenHands/` | Python | ✅ Bridge module |
| pydantic-ai | `external/pydantic-ai/` | Python | ✅ Bridge module |
| PraisonAI | `external/PraisonAI/` | Python | ⚠️ DEPRECATED — to remove |

### New (Stage 6-7 — Need Wiring)
| Repo | Path | Language | Version | Install | Purpose |
|------|------|----------|---------|---------|---------|
| **DSPy** | `external/dspy/` | Python | 3.1.3 | `pip install dspy` | Prompt optimization compiler |
| **Inspect AI** | `external/inspect/` | Python | dynamic | `pip install inspect_ai` | Evaluation harness |
| **Mem0** | `external/mem0/` | Python | 1.0.3 | `pip install mem0ai` | Graph memory (Neo4j + Qdrant) |
| **microsandbox** | `external/microsandbox/` | Rust | 0.2.6 | `cargo build --release` | MicroVM sandbox (MCP-native) |
| **Arrakis** | `external/arrakis/` | Go | — | `go build ./cmd/...` | Snapshot/restore MicroVM |
| **ast-grep** | `external/ast-grep/` | Rust | 0.40.5 | `cargo install ast-grep` | Structural code editing |
| **Semgrep** | `external/semgrep/` | OCaml | — | Docker / `pip install semgrep` | Policy-as-code guardrails |
| **CrossHair** | `external/crosshair/` | Python | 0.0.102 | `pip install crosshair-tool` | Python formal verification |
| **Langfuse** | `external/langfuse/` | TypeScript | 3.152.0 | Docker Compose (self-hosted) | Observability traces |
| **PR-Agent** | `external/pr-agent/` | Python | 0.3.1 | `pip install pr-agent` | CI/PR automation |

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                    SUPER-GOOSE STAGE 6-7                              │
│                                                                      │
│  STAGE 7: SELF-EVOLUTION ─────────────────────────────────────────── │
│  │                                                                   │
│  │  ┌─────────────┐    ┌──────────────┐    ┌────────────────┐       │
│  │  │ Inspect AI   │───▶│ DSPy          │───▶│ Mem0ᵍ (Graph)  │      │
│  │  │ (Judge)      │    │ (Optimizer)   │    │ (Trajectory)   │      │
│  │  └──────▲──────┘    └──────────────┘    └───────┬────────┘      │
│  │         └────────── next run better ◀───────────┘               │
│  │                                                                   │
│  STAGE 6: GOVERNANCE ─────────────────────────────────────────────── │
│  │                                                                   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │  │ Langfuse │ │ Semgrep  │ │CrossHair │ │PR-Agent  │           │
│  │  │ +OTel    │ │ +Scorecard│ │ +SAFEFLOW│ │ +CI      │           │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│  │                                                                   │
│  EXECUTION & SAFETY ──────────────────────────────────────────────── │
│  │                                                                   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  │ microsandbox  │  │ Arrakis      │  │ ast-grep     │          │
│  │  │ (MicroVM/MCP) │  │ (snapshots)  │  │ (AST edit)   │          │
│  │  └──────────────┘  └──────────────┘  └──────────────┘          │
│  │                                                                   │
│  CORE AGENT (Stage 5.5 — Complete) ──────────────────────────────── │
│  │  Goose + Aider + Conscious + LangGraph + OpenHands + pydantic-ai │
│  └───────────────────────────────────────────────────────────────── │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Priority 1: Metacognitive Loop (DSPy + Inspect AI + Mem0ᵍ)

> **This is the highest-impact work.** The Metacognitive Loop makes agents self-improving.

### Task 1.1: DSPy Bridge Module
**Status**: 🔴 TODO
**File**: `external/conscious/src/integrations/dspy_bridge.py`
**Purpose**: Convert Goose's static prompts to optimizable DSPy Signatures

```python
# Pattern to implement:
import dspy

class CodeSolver(dspy.Signature):
    """Write production-quality code to solve the described issue."""
    issue_description = dspy.InputField(desc="GitHub issue or task description")
    codebase_context = dspy.InputField(desc="relevant files and structure")
    code_solution = dspy.OutputField(desc="complete, tested code")

# Bridge class should:
# 1. Wrap dspy.LM to use Goose's provider (Anthropic/OpenAI/local)
# 2. Create Signatures for top-5 agent prompts
# 3. Expose optimize(dataset, metric) → compiled signatures
# 4. Expose save/load for compiled signatures
# 5. Wire to EvoAgentX module (already 1,537 LoC in Conscious)
```

**Key DSPy concepts to use**:
- `dspy.LM()` — wraps any LLM provider
- `dspy.Signature` — declarative input/output schema
- `dspy.MIPROv2(metric, num_candidates=30)` — Bayesian prompt optimization
- `dspy.GEPA(metric)` — reflective prompt evolution (best for overnight gym)
- `dspy.BootstrapFinetune()` — distill to weight updates when prompts plateau

**Verification**: `python -c "import dspy; print(dspy.__version__)"` → `3.1.3`

### Task 1.2: Inspect AI Bridge Module
**Status**: 🔴 TODO
**File**: `external/conscious/src/integrations/inspect_bridge.py`
**Purpose**: Build custom eval suite for Super-Goose agent quality

```python
# Pattern to implement:
from inspect_ai import Task, task, eval
from inspect_ai.solver import generate, system_message
from inspect_ai.scorer import model_graded_fact

@task
def super_goose_code_quality():
    return Task(
        dataset=...,  # Your repos as test fixtures
        solver=[system_message("..."), generate()],
        scorer=model_graded_fact(),
    )

# Bridge class should:
# 1. Define eval tasks for: code quality, test generation, refactoring, bug fixing
# 2. Use Inspect's Docker sandbox for isolated eval runs
# 3. Expose score_api() → returns metrics dict for DSPy optimizer
# 4. Support SWE-bench Verified as baseline benchmark
# 5. Track scores over time for regression detection
```

**Verification**: `python -c "import inspect_ai; print('OK')"` → `OK`

### Task 1.3: Mem0ᵍ Bridge Module
**Status**: 🔴 TODO
**File**: `external/conscious/src/integrations/mem0_bridge.py`
**Purpose**: Replace MemoryManager JSON + fake hash embeddings with real graph memory

```python
# Pattern to implement:
from mem0 import Memory

config = {
    "graph_store": {
        "provider": "neo4j",
        "config": {
            "url": "bolt://localhost:7687",
            "username": "neo4j",
            "password": "${NEO4J_PASSWORD}"
        }
    },
    "vector_store": {
        "provider": "qdrant",
        "config": {"host": "localhost", "port": 6333}
    }
}
memory = Memory.from_config(config)

# Bridge class should:
# 1. Replace MemoryManager.store() → memory.add()
# 2. Replace MemoryManager.recall() → memory.search()
# 3. Store successful task trajectories as entity graphs
# 4. Retrieve similar past trajectories for DSPy few-shot injection
# 5. Wire to Conscious memory stub (currently empty)
# 6. Temporal conflict resolution (automatic in Mem0ᵍ)
```

**Infrastructure needed**: Neo4j + Qdrant in Docker (see §9)

**Verification**: `python -c "from mem0 import Memory; print('OK')"` → `OK`

### Task 1.4: Overnight Gym Orchestrator
**Status**: 🔴 TODO
**File**: `external/conscious/src/integrations/overnight_gym.py`
**Purpose**: Nightly self-improvement loop: Inspect AI → DSPy → Mem0ᵍ

```python
# The core loop:
# 1. Load 50 SWE-bench tasks
# 2. Run Super-Goose on each in microsandbox
# 3. Inspect AI scores each attempt
# 4. DSPy GEPA optimizer analyzes success/failure patterns
# 5. DSPy compiles updated Signatures with better prompts
# 6. Mem0ᵍ stores successful trajectories as entity-relationship graphs
# 7. Save compiled prompts for next run
# 8. Log metrics for week-over-week improvement tracking
```

**Dependencies**: Tasks 1.1, 1.2, 1.3 must be complete first

### Task 1.5: Wire DSPy into Agent System Prompts (Rust)
**Status**: 🔴 TODO
**File**: `crates/goose/src/agents/agent.rs`
**Purpose**: Load DSPy-compiled prompts at agent startup

```rust
// Pattern to implement in agent.rs:
// At startup, check for compiled DSPy signatures
// Load optimized system prompt from ~/.config/goose/dspy/compiled_prompts.json
// Inject as system prompt prefix (before existing system prompt)
// Fallback to static prompts if no compiled version exists
```

### Task 1.6: Wire Mem0ᵍ to Replace MemoryManager (Rust)
**Status**: 🔴 TODO
**Files**: `crates/goose/src/agents/agent.rs`, `crates/goose/src/memory/`
**Purpose**: Replace JSON-based MemoryManager with Mem0ᵍ HTTP client

```rust
// Pattern: HTTP client to Mem0ᵍ REST API
// memory.add() → POST /v1/memories
// memory.search() → POST /v1/memories/search
// Keep existing MemoryManager as fallback when Mem0 not running
```

---

## 4. Priority 2: Sandbox Runtime (microsandbox + Arrakis)

### Task 2.1: microsandbox MCP Bridge
**Status**: 🔴 TODO
**File**: `external/conscious/src/integrations/microsandbox_bridge.py`
**Purpose**: Use microsandbox as MCP tool server for code execution

```python
# microsandbox is already MCP-native — it IS an MCP server
# Bridge should:
# 1. Start microsandbox server if not running
# 2. Connect Goose extension system to microsandbox MCP endpoint
# 3. Replace Docker-based container.rs execution with MicroVM execution
# 4. Sub-200ms boot time per sandbox
# 5. Hardware-level VM isolation (not container-level)
```

**microsandbox architecture** (Rust workspace):
- `microsandbox-cli/` — CLI binary
- `microsandbox-core/` — Core MicroVM engine (libkrun)
- `microsandbox-server/` — MCP server
- `microsandbox-portal/` — Web portal

**Key**: microsandbox requires Linux/WSL2 + KVM. On Windows, use WSL2 backend.

**Verification**: `cd external/microsandbox && cargo build --release` (requires Rust 1.79+)

### Task 2.2: Arrakis Snapshot/Restore Bridge
**Status**: 🔴 TODO
**File**: `external/conscious/src/integrations/arrakis_bridge.py`
**Purpose**: Enable MCTS-based agent exploration with backtracking

```python
# Arrakis provides snapshot/restore for MicroVMs
# Bridge should:
# 1. Take snapshot before risky operations
# 2. Restore on failure (enables backtracking/exploration)
# 3. Wire to LangGraph checkpoint system
# 4. Enable LATS (Language Agent Tree Search) pattern
```

**Arrakis architecture** (Go):
- `cmd/` — Go binaries (API server)
- `api/` — REST API definitions
- `pkg/` — Core VM management (Cloud Hypervisor backend)
- Config: `config.yaml`

**Verification**: `cd external/arrakis && go build ./cmd/...`

### Task 2.3: Replace container.rs Docker with microsandbox
**Status**: 🔴 TODO
**File**: `crates/goose/src/agents/container.rs`
**Purpose**: Add microsandbox backend alongside Docker backend

```rust
// Pattern: ContainerBackend enum
// enum ContainerBackend {
//     Docker,       // Existing implementation
//     Microsandbox, // New: MicroVM via microsandbox MCP
//     Arrakis,      // New: MicroVM with snapshot/restore
// }
// Container::create() selects backend based on config
```

---

## 5. Priority 3: Observability (OTel + Langfuse + Logfire)

### Task 3.1: Langfuse Self-Hosted Setup
**Status**: 🔴 TODO
**File**: `docker-compose.stage6.yml` (see §9)
**Purpose**: Self-hosted trace visualization

```yaml
# Langfuse needs: PostgreSQL, Redis, ClickHouse, MinIO
# See Docker Compose in §9
# Web UI at http://localhost:3000
```

### Task 3.2: OpenTelemetry Integration in Agent
**Status**: 🔴 TODO
**File**: `crates/goose/src/agents/agent.rs`
**Purpose**: Add OTel spans on every tool call

```rust
// Pattern: wrap tool calls with tracing spans
// use tracing::{span, Level, instrument};
//
// #[instrument(skip(self), fields(tool_name = %tool_call.name))]
// async fn dispatch_tool_call(&self, tool_call: ToolCall) -> ToolResult {
//     // ... existing dispatch logic
// }
```

**Note**: Goose already uses `tracing` crate — just need to add more spans + export to OTel collector

### Task 3.3: Langfuse Trace Bridge
**Status**: 🔴 TODO
**File**: `external/conscious/src/integrations/langfuse_bridge.py`
**Purpose**: Send traces to Langfuse for visualization

```python
# Pattern:
from langfuse import Langfuse
langfuse = Langfuse(host="http://localhost:3000")
# Wrap agent calls with langfuse.trace()
# Track: input tokens, output tokens, latency, cost per tool call
```

---

## 6. Priority 4: Supply-Chain & Provenance

### Task 4.1: OpenSSF Scorecard Integration
**Status**: 🔴 TODO
**File**: `.github/workflows/scorecard.yml`
**Purpose**: Automated repo health scoring

```yaml
# Already partially exists in repo — verify and enable
# Runs: ossf/scorecard-action
```

### Task 4.2: cosign + Syft + Trivy Pipeline
**Status**: 🔴 TODO
**File**: `.github/workflows/supply-chain.yml`
**Purpose**: Sign artifacts, generate SBOMs, scan vulnerabilities

```yaml
# cosign: sign container images and binaries
# Syft: generate SBOM (Software Bill of Materials)
# Trivy: vulnerability scanning
```

---

## 7. Priority 5: Structural Editing & Verification

### Task 5.1: ast-grep MCP Extension
**Status**: 🔴 TODO
**File**: `external/conscious/src/integrations/astgrep_bridge.py`
**Purpose**: AST-aware code search and structural replacement

```python
# ast-grep is a Rust binary — wrap as subprocess
# Bridge should:
# 1. ast_search(pattern, language, directory) → matches
# 2. ast_replace(pattern, replacement, language, file) → modified code
# 3. ast_lint(rules_file, directory) → violations
# ast-grep supports: Python, JavaScript, TypeScript, Rust, Go, Java, C, C++, etc.
```

**Verification**: `cd external/ast-grep && cargo build --release && ./target/release/sg --version`

### Task 5.2: Semgrep Policy Guardrails
**Status**: 🔴 TODO
**File**: `external/conscious/src/integrations/semgrep_bridge.py`
**Purpose**: Policy-as-code enforcement on agent-generated diffs

```python
# Semgrep can be installed via pip: pip install semgrep
# Bridge should:
# 1. semgrep_scan(diff, rules) → policy violations
# 2. Pre-commit hook: scan agent diffs before commit
# 3. Custom rules for Super-Goose: no secrets, no eval(), etc.
```

### Task 5.3: CrossHair Contract Verification
**Status**: 🔴 TODO
**File**: `external/conscious/src/integrations/crosshair_bridge.py`
**Purpose**: Formal verification of Python code contracts

```python
# CrossHair uses Z3 solver for symbolic execution
# Bridge should:
# 1. crosshair_check(module) → counterexamples found
# 2. Run on all Python bridge modules for contract verification
# 3. Wire to CI pipeline
```

**Verification**: `pip install crosshair-tool && crosshair --version`

### Task 5.4: PR-Agent CI Integration
**Status**: 🔴 TODO
**File**: `.github/workflows/pr-agent.yml`
**Purpose**: AI agent on every PR: auto-review, suggestions, test generation

```yaml
# PR-Agent as GitHub Action
# Triggers on: pull_request
# Actions: auto-review, suggest improvements, generate tests, changelog
```

---

## 8. Bridge Module Tasks

### Summary of ALL bridge modules needed:

| Module | File | Status | Priority |
|--------|------|--------|----------|
| `dspy_bridge.py` | `external/conscious/src/integrations/` | 🔴 TODO | P1 |
| `inspect_bridge.py` | `external/conscious/src/integrations/` | 🔴 TODO | P1 |
| `mem0_bridge.py` | `external/conscious/src/integrations/` | 🔴 TODO | P1 |
| `overnight_gym.py` | `external/conscious/src/integrations/` | 🔴 TODO | P1 |
| `microsandbox_bridge.py` | `external/conscious/src/integrations/` | 🔴 TODO | P2 |
| `arrakis_bridge.py` | `external/conscious/src/integrations/` | 🔴 TODO | P2 |
| `langfuse_bridge.py` | `external/conscious/src/integrations/` | 🔴 TODO | P3 |
| `astgrep_bridge.py` | `external/conscious/src/integrations/` | 🔴 TODO | P5 |
| `semgrep_bridge.py` | `external/conscious/src/integrations/` | 🔴 TODO | P5 |
| `crosshair_bridge.py` | `external/conscious/src/integrations/` | 🔴 TODO | P5 |

### Existing bridge modules (Stage 5.5 — complete):
| Module | Status |
|--------|--------|
| `aider_bridge.py` | ✅ Complete (737 lines) |
| `aider_mcp_server.py` | ✅ Complete (625 lines) |
| `conscious_bridge.py` | ✅ Complete (693 lines) |
| `langgraph_bridge.py` | ✅ Complete (919 lines) |
| `openhands_bridge.py` | ✅ Complete (1114 lines) |
| `praisonai_bridge.py` | ⚠️ Deprecated (1549 lines) |
| `pydantic_ai_bridge.py` | ✅ Complete (817 lines) |
| `registry.py` | ✅ Complete (~230 lines) |

### Registry Update Needed
**File**: `external/conscious/config/external_tools.toml`
**Action**: Add entries for all new bridge modules

---

## 9. Docker Compose Stack

### File: `docker-compose.stage6.yml`
**Status**: 🔴 TODO — Create in repo root

```yaml
version: '3.8'

services:
  # Mem0ᵍ Graph Memory Stack
  neo4j:
    image: neo4j:5-community
    ports: ["7474:7474", "7687:7687"]
    environment:
      NEO4J_AUTH: neo4j/${NEO4J_PASSWORD:-supergoose}
    volumes:
      - neo4j_data:/data

  qdrant:
    image: qdrant/qdrant:latest
    ports: ["6333:6333"]
    volumes:
      - qdrant_data:/qdrant/storage

  # Langfuse Observability Stack
  langfuse-db:
    image: postgres:16
    environment:
      POSTGRES_USER: langfuse
      POSTGRES_PASSWORD: ${LANGFUSE_DB_PASSWORD:-langfuse}
      POSTGRES_DB: langfuse
    volumes:
      - langfuse_pg_data:/var/lib/postgresql/data

  langfuse-clickhouse:
    image: clickhouse/clickhouse-server:24
    volumes:
      - langfuse_ch_data:/var/lib/clickhouse

  langfuse-redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  langfuse-minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports: ["9000:9000", "9001:9001"]
    volumes:
      - langfuse_minio_data:/data

  langfuse:
    image: langfuse/langfuse:3
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgresql://langfuse:${LANGFUSE_DB_PASSWORD:-langfuse}@langfuse-db:5432/langfuse
      CLICKHOUSE_URL: http://langfuse-clickhouse:8123
      REDIS_CONNECTION_STRING: redis://langfuse-redis:6379
      S3_ENDPOINT: http://langfuse-minio:9000
      S3_ACCESS_KEY_ID: minioadmin
      S3_SECRET_ACCESS_KEY: minioadmin
      S3_BUCKET_NAME: langfuse
    depends_on:
      - langfuse-db
      - langfuse-clickhouse
      - langfuse-redis
      - langfuse-minio

volumes:
  neo4j_data:
  qdrant_data:
  langfuse_pg_data:
  langfuse_ch_data:
  langfuse_minio_data:
```

**Usage**: `docker compose -f docker-compose.stage6.yml up -d`

---

## 10. Verification Matrix

### Per-Task Verification Commands

| Task | Verification Command | Expected |
|------|---------------------|----------|
| DSPy cloned | `python -c "import sys; sys.path.insert(0,'external/dspy'); import dspy"` | No error |
| Inspect cloned | `pip install inspect_ai && python -c "import inspect_ai"` | No error |
| Mem0 cloned | `pip install mem0ai && python -c "from mem0 import Memory"` | No error |
| microsandbox built | `cd external/microsandbox && cargo build --release` | Binary in target/ |
| ast-grep built | `cd external/ast-grep && cargo build --release` | `sg` binary |
| Neo4j running | `curl http://localhost:7474` | HTML response |
| Qdrant running | `curl http://localhost:6333/collections` | JSON response |
| Langfuse running | `curl http://localhost:3000` | HTML response |
| DSPy bridge | `python external/conscious/src/integrations/dspy_bridge.py --test` | "Tests pass" |
| Inspect bridge | `python external/conscious/src/integrations/inspect_bridge.py --test` | "Tests pass" |
| Mem0 bridge | `python external/conscious/src/integrations/mem0_bridge.py --test` | "Tests pass" |
| Overnight gym | `python external/conscious/src/integrations/overnight_gym.py --dry-run` | Metrics output |
| cargo check | `cargo check -p goose` | No errors |
| cargo check cli | `cargo check -p goose-cli` | No errors |

### Overall Stage Completion Criteria

| Stage | Criteria | Status |
|-------|----------|--------|
| **6.0** | All governance tools integrated (Langfuse + Semgrep + CrossHair + PR-Agent) | 🔴 TODO |
| **6.5** | Sandbox runtime (microsandbox + Arrakis) replacing Docker | 🔴 TODO |
| **7.0** | Metacognitive Loop running (DSPy + Inspect + Mem0ᵍ overnight gym) | 🔴 TODO |
| **7.5** | Week-over-week improvement measured on SWE-bench | 🔴 TODO |

---

## 11. Known Issues & Gotchas

1. **microsandbox requires KVM**: Needs Linux or WSL2 with KVM enabled. Won't work natively on Windows.
2. **Arrakis requires Cloud Hypervisor**: Go binary, needs Linux host.
3. **Semgrep is OCaml**: Complex build. Use `pip install semgrep` for the CLI tool instead of building from source.
4. **Langfuse stack is heavy**: 5 Docker services (PostgreSQL, ClickHouse, Redis, MinIO, Langfuse). ~2GB RAM.
5. **Neo4j memory**: Default config uses 1GB heap. Adjust for larger graphs.
6. **DSPy GEPA optimizer**: Requires many LLM calls. Use local models or budget API keys for overnight gym.
7. **Nested git repos**: All repos in `external/` have their own `.git`. Use the rename workaround for parent repo commits.
8. **PraisonAI deprecation**: Remove `external/PraisonAI/` once LangGraph + DSPy integration is verified.
9. **Cargo workspace**: New Rust crates (microsandbox, ast-grep) are NOT part of Goose's workspace. They build independently.
10. **Python virtual environments**: Consider `uv` or `poetry` for managing deps across 7+ Python bridge modules.

---

## 12. Quick Resume Commands

```bash
# Check current state
cd G:\goose
git status
git log --oneline -5

# Verify all repos present
ls external/

# Install Python dependencies
pip install dspy inspect_ai mem0ai crosshair-tool pr-agent semgrep

# Build Rust tools
cd external/microsandbox && cargo build --release && cd ../..
cd external/ast-grep && cargo build --release && cd ../..

# Start Docker infrastructure
docker compose -f docker-compose.stage6.yml up -d

# Verify infrastructure
curl http://localhost:7474        # Neo4j
curl http://localhost:6333        # Qdrant
curl http://localhost:3000        # Langfuse

# Run Goose checks
export PATH="$PATH:/c/Users/Admin/.cargo/bin"
cargo check -p goose
cargo check -p goose-cli

# Test bridge modules
python -c "from integrations.registry import ToolRegistry; r = ToolRegistry(); print(r.summary())"
```

---

## Agent Task Assignment

When using agents to code these tasks, assign as follows:

### Agent 1: DSPy + Inspect AI bridges (Tasks 1.1, 1.2)
- Create `dspy_bridge.py` and `inspect_bridge.py`
- Wire DSPy optimizer with Inspect metrics
- Test with `pip install dspy inspect_ai`

### Agent 2: Mem0ᵍ bridge + Docker Compose (Tasks 1.3, 9)
- Create `mem0_bridge.py`
- Create `docker-compose.stage6.yml`
- Wire Neo4j + Qdrant
- Test with Docker stack running

### Agent 3: microsandbox + Arrakis bridges (Tasks 2.1, 2.2, 2.3)
- Create `microsandbox_bridge.py` and `arrakis_bridge.py`
- Add microsandbox backend to container.rs
- Test with WSL2/KVM

### Agent 4: Observability + ast-grep + Semgrep (Tasks 3.2, 3.3, 5.1, 5.2)
- Create `langfuse_bridge.py`, `astgrep_bridge.py`, `semgrep_bridge.py`
- Add OTel spans to agent.rs
- Test with Langfuse running

### Agent 5: CrossHair + PR-Agent + CI (Tasks 5.3, 5.4, 4.1, 4.2)
- Create `crosshair_bridge.py`
- Set up PR-Agent GitHub Action
- Set up supply-chain CI workflow

### Agent 6: Overnight Gym orchestrator (Task 1.4)
- Create `overnight_gym.py`
- Wire DSPy + Inspect + Mem0ᵍ into the loop
- Requires Agents 1-2 to be complete first

---

*Last Updated: 2026-02-10T05:00:00Z*
*Session ID: c4fdba22-ef41-4d90-ba8a-858d790e0fe9*
*Prerequisite: CONTINUATION_STATE.md (Stage 5.5 complete)*
