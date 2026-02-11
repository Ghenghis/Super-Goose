# Super-Goose Stage 6: 16-Tool Deep Analysis & Action Plan
## Comprehensive Architecture, Conflict Resolution, and Implementation Guide

**Date:** 2026-02-09
**Status:** ACTIONABLE — Research complete, ready for implementation
**Prerequisite:** Stage 5.5 complete (6 tools wired)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The 16-Tool Stack: Deep Inventory](#2-the-16-tool-stack)
3. [Current State Audit](#3-current-state-audit)
4. [Critical Problem: Tool Conflicts & Concurrency](#4-critical-problem-tool-conflicts)
5. [Tool Interaction Matrix](#5-tool-interaction-matrix)
6. [Resource Coordination Layer Design](#6-resource-coordination-layer)
7. [Per-Tool Deep Dive](#7-per-tool-deep-dive)
8. [Missing Infrastructure](#8-missing-infrastructure)
9. [Docker Compose Stack Design](#9-docker-compose-stack)
10. [Rust Integration Points](#10-rust-integration-points)
11. [Implementation Action Plan](#11-implementation-action-plan)
12. [Risk Register](#12-risk-register)
13. [Verification Matrix](#13-verification-matrix)

---

## 1. Executive Summary

Super-Goose integrates **16 tools** across **4 languages** (Rust, Python, Go, TypeScript/OCaml) into a single governed agent system. The current state has 6 tools wired (Stage 5.5) and 10 remaining.

### The Core Problem

The 16 tools are NOT independent. They share resources, compete for LLM API access, write to overlapping file systems, and have dependency chains. Without a **resource coordination layer**, calling tool A while tool B is active can cause:

- **Race conditions** on shared state (LLM provider configuration, file locks)
- **Resource exhaustion** (Docker sockets, port conflicts, memory pressure)
- **Data corruption** (overlapping writes to config/state files)
- **Cascading failures** (tool A crashes, tool B depends on tool A's output)

### What This Document Delivers

1. A complete conflict matrix showing which tools can run concurrently and which cannot
2. A resource coordination layer design that makes all 16 tools work seamlessly
3. Per-tool deep dives covering integration patterns, failure modes, and verification
4. A phased action plan with agent assignments for parallel implementation

---

## 2. The 16-Tool Stack

### 2.1 Complete Inventory

| # | Tool | Language | Role | Tier | Status |
|---|------|----------|------|------|--------|
| 1 | **Goose Core** | Rust | Orchestrator + MCP runtime | N/A | ✅ Wired |
| 2 | **Aider** | Python | Surgical code editing | 2 | ✅ Wired |
| 3 | **LangGraph** | Python | Workflow state machine | 2-3 | ✅ Wired |
| 4 | **OpenHands** | Python | Sandbox engineer | 3 | ✅ Wired |
| 5 | **Pydantic-AI** | Python | Schema validation | 1-2 | ✅ Wired |
| 6 | **Conscious** | Python | Voice + personality | 0-2 | ✅ Wired |
| 7 | **DSPy** | Python | Prompt optimization | 1 | 🔴 TODO |
| 8 | **Inspect AI** | Python | Evaluation harness | 1 | 🔴 TODO |
| 9 | **Mem0** | Python | Graph memory | 1 | 🔴 TODO |
| 10 | **microsandbox** | Rust | MicroVM isolation | 3 | 🔴 TODO |
| 11 | **Arrakis** | Go | Snapshot/restore | 3 | 🔴 TODO |
| 12 | **Langfuse** | TypeScript | Traces + experiments | 1 | 🔴 TODO |
| 13 | **Semgrep** | OCaml/Py | Policy-as-code | 2 | 🔴 TODO |
| 14 | **PR-Agent** | Python | PR automation | 2 | 🔴 TODO |
| 15 | **ast-grep** | Rust | AST structural editing | 2 | 🔴 TODO |
| 16 | **CrossHair** | Python | Contract verification | 2 | 🔴 TODO |

### 2.2 Language Distribution

```
Rust:     3 tools (Goose Core, microsandbox, ast-grep)
Python:  11 tools (Aider, LangGraph, OpenHands, Pydantic-AI, Conscious,
                   DSPy, Inspect AI, Mem0, Semgrep, PR-Agent, CrossHair)
Go:       1 tool  (Arrakis)
TS/Other: 1 tool  (Langfuse — Docker service)
```

### 2.3 Tool Categories

```
ORCHESTRATION:  Goose Core, LangGraph, Conscious
CODE EDITING:   Aider, ast-grep
EXECUTION:      OpenHands, microsandbox, Arrakis
VALIDATION:     Pydantic-AI, Semgrep, CrossHair
OPTIMIZATION:   DSPy, Inspect AI
MEMORY:         Mem0
OBSERVABILITY:  Langfuse
CI/AUTOMATION:  PR-Agent
```

---

## 3. Current State Audit

### 3.1 Bridge Module Patterns (Established)

All bridges follow a consistent interface discovered by the ToolRegistry:

```python
# REQUIRED interface for every bridge:
def init() -> dict[str, Any]           # Lazy initialization, idempotent
def status() -> ToolStatus             # Synchronous health check
def capabilities() -> list[str]        # Operation types supported
async def execute(operation, params)   # Unified dispatcher
```

### 3.2 Registry Architecture

```
external_tools.toml          # Tool registration (16 entries)
       ↓
ToolRegistry.load_config()   # Reads TOML at startup
       ↓
ToolRegistry._get_bridge()   # Lazy imports bridge module
       ↓
bridge.init()                # Tool-specific initialization
       ↓
bridge.execute(op, params)   # Dispatched via operation name
       ↓
ToolStatus / dict response   # Standardized return format
```

### 3.3 Critical Gaps in Current Architecture

| Gap | Impact | Severity |
|-----|--------|----------|
| No resource locking between tools | Race conditions on shared state | 🔴 Critical |
| No dependency ordering | Tools init in random order | 🟡 High |
| No health monitoring loop | Stale status, undetected failures | 🟡 High |
| No timeout enforcement at registry level | Hung tools block pipeline | 🟡 High |
| No rate limiting for LLM API calls | Budget overruns, API throttling | 🟡 High |
| No cleanup/shutdown lifecycle | Resource leaks on exit | 🟠 Medium |
| No per-tool resource quotas | Memory/CPU exhaustion | 🟠 Medium |
| Module-level globals not thread-safe | Corruption under concurrency | 🟠 Medium |
| No MCP tool name collision handling | Wrong tool dispatched | 🟠 Medium |
| No graceful degradation when backends down | Hard failures cascade | 🟠 Medium |

---

## 4. Critical Problem: Tool Conflicts & Concurrency

### 4.1 Conflict Categories

#### A. Shared Resource Conflicts
Two or more tools need the same system resource exclusively.

| Resource | Competing Tools | Conflict Type |
|----------|----------------|---------------|
| Docker socket | OpenHands, Langfuse (compose), Inspect AI (sandbox) | Socket contention |
| LLM API keys | DSPy, Aider, Goose Core, PR-Agent, Conscious | Rate limit / budget |
| Filesystem (repo) | Aider, ast-grep, OpenHands | Write-write conflict |
| Port 3000 | Langfuse | Single-service port |
| Port 7474/7687 | Neo4j (Mem0) | Single-service port |
| Port 6333 | Qdrant (Mem0) | Single-service port |
| Python GIL | All Python bridges | Compute contention |

#### B. State Conflicts
Two tools modify shared state concurrently.

| State | Competing Tools | Risk |
|-------|----------------|------|
| Git working tree | Aider, ast-grep, OpenHands | Merge conflicts, dirty state |
| DSPy global LM config | DSPy + any other DSPy operation | LM reconfiguration race |
| Memory store | Mem0 concurrent writes | Graph inconsistency |
| Compiled signatures | DSPy optimizer vs DSPy loader | Stale read |
| Sandbox registry | microsandbox create vs destroy | Orphaned sandboxes |

#### C. Dependency Conflicts
Tool B cannot function without tool A being ready.

| Dependency Chain | Description |
|-----------------|-------------|
| Mem0 → Neo4j + Qdrant | Mem0 requires both databases running |
| Langfuse → PostgreSQL + ClickHouse + Redis + MinIO | 4-service dependency chain |
| DSPy optimizer → Inspect AI scorer | Optimization needs eval metrics |
| Overnight Gym → DSPy + Inspect AI + Mem0 | Requires all three |
| Arrakis → microsandbox | Snapshots need active MicroVMs |
| Semgrep scan → Git diff | Needs code changes to scan |
| CrossHair → Python contracts | Needs annotated modules |
| PR-Agent → GitHub API + LLM API | Needs both external services |

### 4.2 The Golden Rule

> **Two tools that write to the same resource MUST NOT run concurrently
> without explicit coordination.**

This applies to:
- File system writes (repo edits)
- LLM provider state (model selection, token budget)
- Docker socket operations (container lifecycle)
- Database writes (Mem0 graph mutations)

---

## 5. Tool Interaction Matrix

### 5.1 Concurrency Safety Matrix

Legend: ✅ = Safe concurrent | ⚠️ = Needs coordination | ❌ = Exclusive

|  | Goose | Aider | LangGraph | OpenHands | Pydantic | Conscious | DSPy | Inspect | Mem0 | msandbox | Arrakis | Langfuse | Semgrep | PR-Agent | ast-grep | CrossHair |
|--|-------|-------|-----------|-----------|----------|-----------|------|---------|------|----------|---------|----------|---------|----------|----------|-----------|
| **Goose** | - | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Aider** | | - | ⚠️ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ | ✅ |
| **LangGraph** | | | - | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **OpenHands** | | | | - | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Pydantic** | | | | | - | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Conscious** | | | | | | - | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **DSPy** | | | | | | | - | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Inspect** | | | | | | | | - | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Mem0** | | | | | | | | | - | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **msandbox** | | | | | | | | | | - | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Arrakis** | | | | | | | | | | | - | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Langfuse** | | | | | | | | | | | | - | ✅ | ✅ | ✅ | ✅ |
| **Semgrep** | | | | | | | | | | | | | - | ✅ | ⚠️ | ⚠️ |
| **PR-Agent** | | | | | | | | | | | | | | - | ✅ | ✅ |
| **ast-grep** | | | | | | | | | | | | | | | - | ✅ |
| **CrossHair** | | | | | | | | | | | | | | | | - |

### 5.2 Conflict Details

| Pair | Conflict | Resolution |
|------|----------|------------|
| Aider ↔ ast-grep | Both write to same files | **Repo write lock** — serialize all file-writing tools |
| Aider ↔ OpenHands | Both can modify repo | **Repo write lock** |
| ast-grep ↔ OpenHands | Both can modify repo | **Repo write lock** |
| Aider ↔ Semgrep | Semgrep reads files Aider is writing | **Read-after-write barrier** |
| DSPy ↔ Inspect AI | DSPy optimization uses Inspect scoring | **Orchestrated pipeline** — DSPy calls Inspect, not concurrent |
| DSPy ↔ Mem0 | DSPy reads trajectories, Mem0 writes them | **Eventual consistency** — Mem0 writes commit before DSPy reads |
| OpenHands ↔ microsandbox | Both provide sandbox execution | **Backend selection** — use one or the other per operation |
| OpenHands ↔ Inspect AI | Both use Docker for sandboxing | **Docker socket semaphore** |
| microsandbox ↔ Arrakis | Arrakis manages microsandbox snapshots | **Coupled lifecycle** — Arrakis depends on microsandbox |
| Semgrep ↔ ast-grep | Both analyze AST; Semgrep reads what ast-grep writes | **Read-after-write barrier** |
| Semgrep ↔ CrossHair | Both verify code; should run in sequence | **Pipeline ordering** — Semgrep first (fast), CrossHair second (slow) |

---

## 6. Resource Coordination Layer Design

### 6.1 Architecture

The Resource Coordination Layer (RCL) sits between the ToolRegistry and the bridge modules:

```
ToolRegistry.execute(tool, operation, params)
       ↓
ResourceCoordinator.acquire(tool, operation)    ← NEW
       ↓
  [Check resource locks]
  [Check dependency health]
  [Check rate limits]
  [Acquire necessary locks]
       ↓
bridge.execute(operation, params)
       ↓
ResourceCoordinator.release(tool, operation)    ← NEW
       ↓
Return result
```

### 6.2 Resource Lock Types

```python
# resource_coordinator.py — Core coordination primitives

import asyncio
from enum import Enum
from typing import Optional
from dataclasses import dataclass, field
from datetime import datetime

class LockType(Enum):
    EXCLUSIVE = "exclusive"      # Only one holder at a time
    SHARED_READ = "shared_read"  # Multiple readers, no writers
    SEMAPHORE = "semaphore"      # N concurrent holders

class ResourceId(Enum):
    REPO_WRITE = "repo_write"           # Git working tree writes
    REPO_READ = "repo_read"             # Git working tree reads
    LLM_API = "llm_api"                 # LLM provider calls
    DOCKER_SOCKET = "docker_socket"     # Docker daemon access
    NEO4J = "neo4j"                     # Neo4j database
    QDRANT = "qdrant"                   # Qdrant vector DB
    LANGFUSE = "langfuse"               # Langfuse trace API
    SANDBOX_POOL = "sandbox_pool"       # MicroVM/container pool
    DSPY_LM_CONFIG = "dspy_lm_config"   # DSPy LM global state

@dataclass
class ResourceLock:
    resource: ResourceId
    lock_type: LockType
    max_concurrent: int = 1
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    _semaphore: Optional[asyncio.Semaphore] = None
    _holders: list[str] = field(default_factory=list)
    _acquired_at: Optional[datetime] = None

    def __post_init__(self):
        if self.lock_type == LockType.SEMAPHORE:
            self._semaphore = asyncio.Semaphore(self.max_concurrent)
```

### 6.3 Tool-Resource Mapping

```python
# Which resources each tool needs for its operations
TOOL_RESOURCES = {
    "aider": {
        "edit_file": [
            (ResourceId.REPO_WRITE, LockType.EXCLUSIVE),
            (ResourceId.LLM_API, LockType.SEMAPHORE),
        ],
        "map_repo": [
            (ResourceId.REPO_READ, LockType.SHARED_READ),
        ],
    },
    "ast_grep": {
        "search": [(ResourceId.REPO_READ, LockType.SHARED_READ)],
        "replace": [(ResourceId.REPO_WRITE, LockType.EXCLUSIVE)],
    },
    "openhands": {
        "sandbox_exec": [
            (ResourceId.DOCKER_SOCKET, LockType.SEMAPHORE),
            (ResourceId.REPO_WRITE, LockType.EXCLUSIVE),
        ],
    },
    "dspy": {
        "optimize": [
            (ResourceId.DSPY_LM_CONFIG, LockType.EXCLUSIVE),
            (ResourceId.LLM_API, LockType.SEMAPHORE),
        ],
        "compile": [
            (ResourceId.DSPY_LM_CONFIG, LockType.EXCLUSIVE),
            (ResourceId.LLM_API, LockType.SEMAPHORE),
        ],
    },
    "inspect_ai": {
        "run_eval": [
            (ResourceId.DOCKER_SOCKET, LockType.SEMAPHORE),
            (ResourceId.LLM_API, LockType.SEMAPHORE),
        ],
    },
    "mem0": {
        "store_trajectory": [
            (ResourceId.NEO4J, LockType.SEMAPHORE),
            (ResourceId.QDRANT, LockType.SEMAPHORE),
        ],
        "query_memory": [
            (ResourceId.NEO4J, LockType.SHARED_READ),
            (ResourceId.QDRANT, LockType.SHARED_READ),
        ],
    },
    "microsandbox": {
        "create_sandbox": [(ResourceId.SANDBOX_POOL, LockType.SEMAPHORE)],
        "run_command": [(ResourceId.SANDBOX_POOL, LockType.SEMAPHORE)],
    },
    "arrakis": {
        "snapshot_create": [(ResourceId.SANDBOX_POOL, LockType.SEMAPHORE)],
        "snapshot_restore": [(ResourceId.SANDBOX_POOL, LockType.EXCLUSIVE)],
    },
    "langfuse": {
        "log_trace": [(ResourceId.LANGFUSE, LockType.SEMAPHORE)],
        "log_span": [(ResourceId.LANGFUSE, LockType.SEMAPHORE)],
    },
    "semgrep": {
        "scan": [(ResourceId.REPO_READ, LockType.SHARED_READ)],
    },
    "crosshair": {
        "verify": [(ResourceId.REPO_READ, LockType.SHARED_READ)],
    },
    "pr_agent": {
        "review": [(ResourceId.LLM_API, LockType.SEMAPHORE)],
    },
    "pydantic_ai": {
        "validate_output": [],  # No shared resources
        "run_typed_agent": [(ResourceId.LLM_API, LockType.SEMAPHORE)],
    },
    "conscious": {
        "voice_start": [],  # No shared resources
    },
    "langgraph": {
        "run_workflow": [(ResourceId.LLM_API, LockType.SEMAPHORE)],
    },
}
```

### 6.4 Dependency Health Checks

```python
# Before executing a tool, verify its dependencies are healthy
TOOL_DEPENDENCIES = {
    "mem0": ["neo4j", "qdrant"],          # Mem0 needs both DBs
    "langfuse": ["langfuse_db", "langfuse_clickhouse", "langfuse_redis"],
    "arrakis": ["microsandbox"],           # Arrakis needs microsandbox running
    "overnight_gym": ["dspy", "inspect_ai", "mem0"],  # Needs all three
    "dspy": [],                            # No tool dependencies (just LLM API)
    "inspect_ai": [],                      # No tool dependencies
    "microsandbox": [],                    # Self-contained binary
    "semgrep": [],                         # Self-contained CLI
    "crosshair": [],                       # Self-contained CLI
    "ast_grep": [],                        # Self-contained binary
    "pr_agent": [],                        # Just needs GitHub + LLM API
}

INFRASTRUCTURE_HEALTH_CHECKS = {
    "neo4j": ("http://localhost:7474", "GET", 200),
    "qdrant": ("http://localhost:6333/collections", "GET", 200),
    "langfuse": ("http://localhost:3000", "GET", 200),
    "langfuse_db": ("localhost:5432", "tcp", None),
    "langfuse_clickhouse": ("localhost:8123", "tcp", None),
    "langfuse_redis": ("localhost:6379", "tcp", None),
}
```

### 6.5 LLM API Rate Limiter

```python
# Shared rate limiter across all tools that call LLM APIs
# Prevents budget overruns and API throttling

@dataclass
class LLMBudget:
    max_requests_per_minute: int = 60
    max_tokens_per_minute: int = 100_000
    max_cost_per_hour_usd: float = 10.0

    _request_count: int = 0
    _token_count: int = 0
    _cost_usd: float = 0.0
    _window_start: datetime = field(default_factory=datetime.utcnow)

    async def acquire(self, estimated_tokens: int = 1000):
        """Wait until budget allows this request."""
        # Reset window if expired
        # Check against limits
        # Block if over budget
        pass

    def record_usage(self, tokens: int, cost_usd: float):
        """Record actual usage after completion."""
        pass
```

---

## 7. Per-Tool Deep Dive

### 7.1 Goose Core (Rust)

**Architecture:** Agent struct with modular managers (retry, critique, planning, reasoning, reflexion, checkpoint). Channel-based approval flow with mpsc channels.

**Current State:** Production-ready orchestrator with:
- MCP extension system for tool dispatch
- `#[instrument]` tracing on tool dispatch
- OTel dependencies already in Cargo.toml (opentelemetry, opentelemetry-otlp)
- Container backend (Docker) with resource limits
- Checkpoint persistence (SQLite/Memory)

**What's Missing for Stage 6:**
- OTel span export to Langfuse collector (wiring exists but not connected)
- ContainerBackend enum for microsandbox/Arrakis (only Docker today)
- DSPy compiled prompt loading at startup
- Mem0 HTTP client for memory operations
- Resource coordinator integration in dispatch pipeline

**Key Files:**
- `crates/goose/src/agents/agent.rs` — Main agent struct + dispatch
- `crates/goose/src/agents/container.rs` — Docker sandbox backend
- `crates/goose/src/agents/observability.rs` — Span types + execution traces
- `crates/goose/src/agents/persistence/` — Checkpoint management

---

### 7.2 Aider (Python)

**Role:** Surgical code editing with 26+ strategies, repo mapping, auto-commit.
**Bridge:** `aider_bridge.py` (670 lines) — subprocess-based, PATH discovery.
**Conflict Profile:** REPO_WRITE exclusive — cannot run while ast-grep or OpenHands writes.
**Failure Modes:** Patch reject (context mismatch), non-idempotent edits, large repo map slowness.

---

### 7.3 LangGraph (Python)

**Role:** Durable workflow state machine with checkpoints and human-in-the-loop.
**Bridge:** `langgraph_bridge.py` (800+ lines) — checkpointer backend selection.
**Conflict Profile:** LLM_API semaphore only. Safe to run concurrently with most tools.
**Key for Stage 6:** The golden pipeline (intake→plan→sandbox→edit→verify→package→pr→learn) should be a LangGraph workflow.

---

### 7.4 OpenHands (Python)

**Role:** Autonomous engineer with Docker-sandboxed execution + browser automation.
**Bridge:** `openhands_bridge.py` (900+ lines) — Docker-based isolation.
**Conflict Profile:** DOCKER_SOCKET + REPO_WRITE. Cannot run while Aider/ast-grep writes.
**Relationship to microsandbox:** OpenHands uses Docker containers; microsandbox uses MicroVMs. Stage 6.5 should offer both as selectable backends.

---

### 7.5 Pydantic-AI (Python)

**Role:** Type-safe schema validation for all tool outputs.
**Bridge:** `pydantic_ai_bridge.py` (400+ lines) — validation layer.
**Conflict Profile:** None — pure computation, no shared resources.
**Stage 6 Role:** Validate the bridge contract schema (request/response) for every tool call.

---

### 7.6 Conscious (Python)

**Role:** Voice entrypoint, emotion tags, personality, bridge to Goose HTTP.
**Bridge:** `conscious_bridge.py` (500+ lines) — singleton aiohttp session.
**Conflict Profile:** None — HTTP client to Goose, no shared resources.
**Stage 6 Role:** IntentEnvelope generation with tier classification.

---

### 7.7 DSPy (Python) — NEW

**Role:** Prompt optimization compiler. Converts static prompts to optimizable Signatures.
**Bridge:** `dspy_bridge.py` (1150 lines) — PARTIALLY EXISTS but has critical gaps.

**Current Issues Found:**
1. **Global LM race condition** (lines 360-362): `_lm` reconfigured per-operation without locking
2. **Unbounded signature registry**: No cleanup for `_signatures` dict
3. **Unbounded compiled modules**: `_compiled_modules` grows without pruning
4. **30-minute subprocess timeout**: Can block entire event loop during optimization

**What Needs Fixing:**
- Add `asyncio.Lock` around LM configuration changes
- Add lifecycle management for signature/compiled module registries
- Use process-isolated optimization (already has subprocess fallback)
- Add health check that verifies LLM connectivity, not just import

**Integration with Inspect AI:**
- DSPy optimizer needs Inspect AI metrics as its objective function
- Pattern: DSPy calls Inspect as a subroutine, not concurrent
- `dspy.MIPROv2(metric=inspect_metric_fn)` — metric function wraps Inspect evaluation

---

### 7.8 Inspect AI (Python) — NEW

**Role:** Evaluation harness for scoring agent quality against benchmarks.
**Bridge:** `inspect_bridge.py` — NEEDS CREATION.

**Key Patterns:**
```python
from inspect_ai import Task, task, eval
from inspect_ai.solver import generate, system_message
from inspect_ai.scorer import model_graded_fact

@task
def code_quality_eval():
    return Task(
        dataset=json_dataset("eval_fixtures/code_quality.json"),
        solver=[system_message("You are a code reviewer."), generate()],
        scorer=model_graded_fact(),
    )
```

**Integration Points:**
- Provides metric function for DSPy optimizer
- Uses Docker sandbox for isolated eval runs (DOCKER_SOCKET resource)
- Outputs JSON scorecards consumed by overnight gym
- Track regression deltas vs baseline

---

### 7.9 Mem0 (Python) — NEW

**Role:** Graph memory with Neo4j entity-relationship storage + Qdrant vector search.
**Bridge:** `mem0_bridge.py` — NEEDS CREATION.

**Key Patterns (from research):**
```python
from mem0 import AsyncMemory

config = {
    "graph_store": {"provider": "neo4j", "config": {...}},
    "vector_store": {"provider": "qdrant", "config": {...}},
}
memory = AsyncMemory(config)

# Scoped writes prevent cross-agent contamination
await memory.add("trajectory data", user_id="goose", agent_id="coder", run_id="run-123")

# Scoped reads
results = await memory.search("similar task", user_id="goose", agent_id="coder")
```

**Critical Pitfalls:**
- Missing `await` on AsyncMemory operations = **silent write failures**
- Neo4j free tier has storage limits — implement retention policy
- Must check both `memories` and `relations` keys in search results
- Fallback to vector-only if graph backend is down

**Dependencies:** Neo4j + Qdrant must be running (Docker Compose).

---

### 7.10 microsandbox (Rust) — NEW

**Role:** MicroVM sandbox for secure code execution. MCP-native server.
**Bridge:** `microsandbox_bridge.py` (900+ lines) — PARTIALLY EXISTS (class-based).

**Current Issues Found:**
1. **No concurrent sandbox limit** — can overwhelm server
2. **Local cache divergence** — `_sandboxes` dict can be stale
3. **No retry logic** — HTTP errors immediately fail
4. **Unused MCP connection flag** — `_mcp_connected` set but never checked
5. **No context manager** — missing `__aenter__`/`__aexit__`

**Platform Constraint:** Requires Linux + KVM. On Windows, must run in WSL2.

**MCP Integration:**
```json
{
  "mcpServers": {
    "microsandbox": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:5555/mcp"
    }
  }
}
```

---

### 7.11 Arrakis (Go) — NEW

**Role:** Snapshot/restore for MicroVM state. Enables backtracking and exploration.
**Bridge:** `arrakis_bridge.py` — NEEDS CREATION.

**Integration Pattern:**
- Arrakis manages Cloud Hypervisor VM snapshots
- Bridge wraps Go REST API as Python async client
- Coupled to microsandbox — snapshots target microsandbox VMs
- Enables LATS (Language Agent Tree Search) pattern:
  1. Take snapshot before risky operation
  2. Execute operation
  3. If failed: restore snapshot, try alternative

**Platform Constraint:** Same as microsandbox (Linux + KVM).

---

### 7.12 Langfuse (TypeScript/Docker) — NEW

**Role:** Observability traces, experiments, and run comparisons.
**Bridge:** `langfuse_bridge.py` — NEEDS CREATION.

**Infrastructure Requirements:**
- PostgreSQL 16 (metadata)
- ClickHouse 24 (analytics — 8 GiB RAM minimum)
- Redis 7 (caching/queues)
- MinIO (blob storage)
- Langfuse v3 web application (port 3000)
- **Total: ~25 GiB RAM for Docker Compose stack**

**Trace Correlation Pattern:**
```python
from langfuse import Langfuse

langfuse = Langfuse(host="http://localhost:3000")

# Seed trace ID from Goose run_id for correlation
trace = langfuse.trace(
    id=langfuse.create_trace_id(seed=run_id),
    name="goose-run",
    tags=["production", "stage6"],
    metadata={"repo": "super-goose", "tier": 2},
)

# Nest tool calls as spans
span = trace.span(name="aider-edit", input={"files": [...]})
# ... tool execution ...
span.end(output={"success": True, "diff": "..."})
```

**OTel Integration:** Langfuse v3 is OTel-native. Goose's existing `tracing-opentelemetry` can export directly to Langfuse's OTLP endpoint.

---

### 7.13 Semgrep (OCaml/Python) — NEW

**Role:** Policy-as-code enforcement. Scans diffs for security/quality violations.
**Bridge:** `semgrep_bridge.py` — NEEDS CREATION.

**Baseline Policy Rules:**
```yaml
# .semgrep/stage6.yml
rules:
  - id: no-eval
    pattern: eval(...)
    message: "eval() is forbidden"
    severity: ERROR
    languages: [python]

  - id: no-hardcoded-secrets
    patterns:
      - pattern: |
          $KEY = "..."
      - metavariable-regex:
          metavariable: $KEY
          regex: (password|secret|api_key|token)
    message: "Hardcoded secret detected"
    severity: ERROR
    languages: [python]

  - id: no-shell-injection
    pattern: subprocess.call($CMD, shell=True)
    message: "Shell injection risk"
    severity: ERROR
    languages: [python]
```

**CI Integration:** Semgrep is a **blocking gate** — must pass before merge.

---

### 7.14 PR-Agent (Python) — NEW

**Role:** AI-powered PR review, suggestions, test generation, changelog.
**Bridge:** Runs as GitHub Action, not a runtime bridge.

**Workflow:**
```yaml
name: PR-Agent
on:
  pull_request:
    types: [opened, synchronize, reopened]
jobs:
  pr-agent:
    runs-on: ubuntu-latest
    steps:
      - uses: Codium-ai/pr-agent@main
        env:
          OPENAI_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          commands: "/review /improve /describe"
```

**Cost Concern:** Each PR review costs LLM API tokens. Budget ~$0.10-0.50 per PR.

---

### 7.15 ast-grep (Rust) — NEW

**Role:** AST-aware structural code search and replacement.
**Bridge:** `astgrep_bridge.py` — NEEDS CREATION.

**Integration Pattern:** Wrap `sg` binary as subprocess:
```python
async def ast_search(pattern: str, language: str, directory: str) -> dict:
    result = await asyncio.create_subprocess_exec(
        "sg", "--pattern", pattern, "--lang", language, directory,
        "--json",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await result.communicate()
    return json.loads(stdout)
```

**Conflict Profile:** REPO_WRITE exclusive for replace operations, REPO_READ shared for search.

---

### 7.16 CrossHair (Python) — NEW

**Role:** Formal verification of Python contracts using Z3 symbolic execution.
**Bridge:** `crosshair_bridge.py` — NEEDS CREATION.

**Key Constraints:**
- Slow — symbolic execution can take minutes per module
- Not suitable for pre-commit hooks
- Use `--per_condition_timeout=30` in CI
- Only run on modules with explicit contract annotations
- Run AFTER Semgrep (fast pattern check first, then slow symbolic check)

---

## 8. Missing Infrastructure

### 8.1 Files That Need Creation

| File | Type | Description |
|------|------|-------------|
| `external/conscious/src/integrations/resource_coordinator.py` | Python | Resource coordination layer |
| `external/conscious/src/integrations/inspect_bridge.py` | Python | Inspect AI bridge |
| `external/conscious/src/integrations/mem0_bridge.py` | Python | Mem0 graph memory bridge |
| `external/conscious/src/integrations/overnight_gym.py` | Python | Nightly self-improvement orchestrator |
| `external/conscious/src/integrations/arrakis_bridge.py` | Python | Arrakis snapshot/restore bridge |
| `external/conscious/src/integrations/langfuse_bridge.py` | Python | Langfuse trace bridge |
| `external/conscious/src/integrations/astgrep_bridge.py` | Python | ast-grep AST editing bridge |
| `external/conscious/src/integrations/semgrep_bridge.py` | Python | Semgrep policy bridge |
| `external/conscious/src/integrations/crosshair_bridge.py` | Python | CrossHair verification bridge |
| `.semgrep/stage6.yml` | YAML | Semgrep baseline policy rules |
| `.ast-grep/rules/` | YAML | ast-grep refactoring rules |
| `otel-collector-config.yaml` | YAML | OTel collector for Langfuse |

### 8.2 Files That Need Modification

| File | Change |
|------|--------|
| `external/conscious/src/integrations/registry.py` | Add ResourceCoordinator, dependency checks, health monitoring |
| `external/conscious/src/integrations/dspy_bridge.py` | Fix LM race condition, add locking, lifecycle management |
| `external/conscious/src/integrations/microsandbox_bridge.py` | Add retry logic, context manager, concurrent limits |
| `external/conscious/src/integrations/__init__.py` | Export new bridge modules |
| `external/conscious/config/external_tools.toml` | Already has entries — verify correctness |
| `crates/goose/src/agents/agent.rs` | DSPy prompt loading, Mem0 client, OTel export |
| `crates/goose/src/agents/container.rs` | ContainerBackend enum with microsandbox |
| `docker-compose.stage6.yml` | Already exists — verify and enhance |
| `.github/workflows/pr-agent.yml` | Already exists (disabled) — enable |
| `.github/workflows/supply-chain.yml` | Already exists — complete |

---

## 9. Docker Compose Stack Design

### 9.1 Service Architecture

```
┌─────────────────────────────────────────────────────┐
│            docker-compose.stage6.yml                 │
│                                                     │
│  ┌──────────┐  ┌──────────┐                        │
│  │  Neo4j   │  │  Qdrant  │  ← Mem0 Graph Memory  │
│  │  :7474   │  │  :6333   │                        │
│  └──────────┘  └──────────┘                        │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌─────────┐          │
│  │ Postgres │  │ClickHouse│  │  Redis  │          │
│  │  :5432   │  │  :8123   │  │ :6379   │          │
│  └────┬─────┘  └────┬─────┘  └────┬────┘          │
│       └──────────────┼─────────────┘                │
│                      ↓                              │
│              ┌───────────────┐  ┌─────────┐        │
│              │   Langfuse    │  │  MinIO  │        │
│              │    :3000      │  │  :9000  │        │
│              └───────────────┘  └─────────┘        │
│                                                     │
│  ┌──────────────────────┐                          │
│  │  OTel Collector      │  ← Receives traces from │
│  │  :4317 (gRPC)        │    Goose Rust + Python   │
│  │  :4318 (HTTP)        │                          │
│  └──────────────────────┘                          │
└─────────────────────────────────────────────────────┘
```

### 9.2 Resource Requirements

| Service | CPU | RAM | Disk | Notes |
|---------|-----|-----|------|-------|
| Neo4j | 1 | 1 GiB | 1 GiB | Adjust heap for larger graphs |
| Qdrant | 1 | 1 GiB | 1 GiB | Scales with vector count |
| PostgreSQL | 1 | 1 GiB | 512 MiB | Langfuse metadata |
| ClickHouse | 2 | 4 GiB | 2 GiB | Analytics-heavy |
| Redis | 0.5 | 512 MiB | 256 MiB | Caching |
| MinIO | 0.5 | 512 MiB | 1 GiB | Blob storage |
| Langfuse | 2 | 2 GiB | — | Web app |
| OTel Collector | 0.5 | 256 MiB | — | Trace pipeline |
| **TOTAL** | **8.5** | **~10 GiB** | **~6 GiB** | Minimum viable |

---

## 10. Rust Integration Points

### 10.1 ContainerBackend Enum (container.rs)

```rust
pub enum ContainerBackend {
    Docker,       // Existing implementation
    Microsandbox, // New: MicroVM via microsandbox MCP
    Arrakis,      // New: MicroVM with snapshot/restore
}

pub struct ContainerConfig {
    pub backend: ContainerBackend,  // NEW field
    // ... existing fields ...
}
```

### 10.2 OTel Span Export (agent.rs)

```rust
// Goose already has tracing-opentelemetry in Cargo.toml
// Wire the existing #[instrument] spans to export via OTLP

use opentelemetry_otlp::WithExportConfig;

fn init_otel_exporter() -> Result<()> {
    let exporter = opentelemetry_otlp::SpanExporter::builder()
        .with_tonic()
        .with_endpoint("http://localhost:4317")  // OTel collector
        .build()?;

    let provider = opentelemetry_sdk::trace::TracerProvider::builder()
        .with_batch_exporter(exporter)
        .build();

    opentelemetry::global::set_tracer_provider(provider);
    Ok(())
}
```

### 10.3 DSPy Compiled Prompt Loading (agent.rs)

```rust
// At agent startup, check for DSPy-compiled prompts
fn load_compiled_prompts() -> Option<String> {
    let prompt_path = dirs::config_dir()?
        .join("goose/dspy/compiled_prompts.json");

    if prompt_path.exists() {
        let content = std::fs::read_to_string(&prompt_path).ok()?;
        let pack: serde_json::Value = serde_json::from_str(&content).ok()?;
        pack.get("system_prompt")?.as_str().map(String::from)
    } else {
        None  // Fallback to static prompts
    }
}
```

### 10.4 Mem0 HTTP Client (agent.rs or memory module)

```rust
// HTTP client to Mem0 REST API
pub struct Mem0Client {
    base_url: String,
    client: reqwest::Client,
}

impl Mem0Client {
    pub async fn add_memory(&self, content: &str, user_id: &str, run_id: &str) -> Result<()> {
        self.client.post(&format!("{}/v1/memories", self.base_url))
            .json(&serde_json::json!({
                "messages": [{"role": "user", "content": content}],
                "user_id": user_id,
                "run_id": run_id,
            }))
            .send().await?;
        Ok(())
    }

    pub async fn search_memory(&self, query: &str, user_id: &str) -> Result<Vec<Memory>> {
        let resp = self.client.post(&format!("{}/v1/memories/search", self.base_url))
            .json(&serde_json::json!({"query": query, "user_id": user_id}))
            .send().await?
            .json().await?;
        Ok(resp)
    }
}
```

---

## 11. Implementation Action Plan

### Phase 0: Foundation (Before Agents)
**Duration:** Setup only
**Goal:** Infrastructure + coordination layer

| Task | Description | Blocks |
|------|-------------|--------|
| 0.1 | Create `resource_coordinator.py` | All agent work |
| 0.2 | Update `registry.py` with coordination hooks | All agent work |
| 0.3 | Fix `dspy_bridge.py` race conditions | Agent 1 |
| 0.4 | Fix `microsandbox_bridge.py` concurrency issues | Agent 3 |
| 0.5 | Verify `docker-compose.stage6.yml` and test stack | Agent 2, 4 |
| 0.6 | Update `__init__.py` with new module exports | All agents |

### Phase 1: Parallel Agent Implementation (6 Agents)

#### Agent 1: DSPy + Inspect AI (Tasks 1.1, 1.2)
- Fix DSPy bridge race conditions (LM locking, registry lifecycle)
- Create `inspect_bridge.py` with eval tasks for code quality
- Wire DSPy optimizer to use Inspect metrics as objective
- Test: `python -m integrations.dspy_bridge --selftest`
- Test: `python -m integrations.inspect_bridge --selftest`

#### Agent 2: Mem0 + Docker Compose (Tasks 1.3, 9)
- Create `mem0_bridge.py` with AsyncMemory, scoped writes, fallback
- Enhance `docker-compose.stage6.yml` with OTel collector
- Wire Neo4j + Qdrant health checks in resource coordinator
- Test: Docker stack up + mem0 bridge selftest

#### Agent 3: microsandbox + Arrakis (Tasks 2.1, 2.2, 2.3)
- Fix microsandbox bridge (retry logic, context manager, concurrent limits)
- Create `arrakis_bridge.py` (Go REST API wrapper)
- Add `ContainerBackend` enum to `container.rs`
- Test: Sandbox create/execute/destroy cycle

#### Agent 4: Observability + ast-grep + Semgrep (Tasks 3.2, 3.3, 5.1, 5.2)
- Create `langfuse_bridge.py` with trace correlation
- Create `astgrep_bridge.py` (subprocess wrapper)
- Create `semgrep_bridge.py` with policy scanning
- Create `.semgrep/stage6.yml` baseline rules
- Wire OTel spans in agent.rs to Langfuse
- Test: Langfuse trace visible in UI

#### Agent 5: CrossHair + PR-Agent + Supply Chain (Tasks 5.3, 5.4, 4.1, 4.2)
- Create `crosshair_bridge.py` with timeout controls
- Enable PR-Agent workflow (`.github/workflows/pr-agent.yml`)
- Complete supply-chain workflow (cosign + Syft + Trivy)
- Update scorecard workflow
- Test: CrossHair selftest + PR-Agent comment on test PR

#### Agent 6: Overnight Gym Orchestrator (Task 1.4)
- Create `overnight_gym.py` orchestrating DSPy + Inspect + Mem0
- Implement promotion/rollback rules for prompt packs
- Wire to LangGraph checkpoint system
- Test: `python -m integrations.overnight_gym --dry-run`

### Phase 2: Rust Wiring
**After Phase 1 bridges are stable:**

| Task | Description |
|------|-------------|
| 2.1 | Wire OTel OTLP exporter in agent.rs |
| 2.2 | Add DSPy compiled prompt loading at startup |
| 2.3 | Add Mem0 HTTP client in memory module |
| 2.4 | Add ContainerBackend::Microsandbox in container.rs |
| 2.5 | cargo check -p goose && cargo check -p goose-cli |

### Phase 3: Integration Testing
**After Phase 1 + 2:**

| Test | Verifies |
|------|----------|
| End-to-end golden pipeline | All 8 LangGraph nodes working |
| Concurrent tool execution | Resource coordinator prevents conflicts |
| Overnight gym dry run | DSPy + Inspect + Mem0 loop |
| Semgrep + CrossHair gate | Policy enforcement on AI-generated code |
| Langfuse trace correlation | All tool calls visible with run_id |
| microsandbox isolation | Code execution in MicroVM |

---

## 12. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| microsandbox requires KVM (no Windows native) | High | Medium | Fallback to Docker (OpenHands) |
| Langfuse stack needs ~10 GiB RAM | High | Medium | Start with minimal config, scale up |
| DSPy optimization costs many LLM API calls | High | High | Use local models or budget caps |
| Neo4j free tier storage limits | Medium | Medium | Implement retention policy |
| ClickHouse memory hunger | Medium | Medium | Tune memory settings, monitor |
| CrossHair symbolic execution timeout | Medium | Low | `--per_condition_timeout=30` |
| MCP tool name collisions between 16 tools | Low | High | Prefix all tools with bridge name |
| Python GIL contention across 11 bridges | Medium | Medium | Process isolation for heavy ops |
| API rate limiting across DSPy + PR-Agent + Aider | High | Medium | Shared LLM budget manager |
| Docker Compose stack instability | Medium | Medium | Health checks + auto-restart |

---

## 13. Verification Matrix

### Per-Tool Verification

| Tool | Command | Expected |
|------|---------|----------|
| Goose Core | `cargo check -p goose` | No errors |
| Aider | `python -c "from integrations.aider_bridge import status; print(status())"` | healthy=True |
| LangGraph | `python -c "from integrations.langgraph_bridge import status; print(status())"` | healthy=True |
| OpenHands | `python -c "from integrations.openhands_bridge import status; print(status())"` | healthy=True |
| Pydantic-AI | `python -c "from integrations.pydantic_ai_bridge import status; print(status())"` | healthy=True |
| Conscious | `python -c "from integrations.conscious_bridge import status; print(status())"` | healthy=True |
| DSPy | `python -m integrations.dspy_bridge --selftest` | Tests pass |
| Inspect AI | `python -m integrations.inspect_bridge --selftest` | Tests pass |
| Mem0 | `python -m integrations.mem0_bridge --selftest` | Tests pass |
| microsandbox | `python -m integrations.microsandbox_bridge --selftest` | Tests pass |
| Arrakis | `python -m integrations.arrakis_bridge --selftest` | Tests pass |
| Langfuse | `curl -s http://localhost:3000 -o /dev/null -w "%{http_code}"` | 200 |
| Semgrep | `semgrep --config .semgrep/stage6.yml --test` | Pass |
| PR-Agent | Open test PR, verify comment | Comment present |
| ast-grep | `sg --version` | Version string |
| CrossHair | `crosshair --version` | Version string |

### Infrastructure Verification

| Service | Command | Expected |
|---------|---------|----------|
| Neo4j | `curl http://localhost:7474` | HTML |
| Qdrant | `curl http://localhost:6333/collections` | JSON |
| PostgreSQL | `pg_isready -h localhost -p 5432` | accepting |
| ClickHouse | `curl http://localhost:8123/ping` | Ok |
| Redis | `redis-cli ping` | PONG |
| MinIO | `curl http://localhost:9000/minio/health/live` | OK |
| OTel Collector | `curl http://localhost:13133` | OK |

### Stage Completion Criteria

| Stage | Criteria | Verification |
|-------|----------|-------------|
| **6.0** | Governance tools integrated | Langfuse traces + Semgrep gate + CrossHair pass |
| **6.5** | Sandbox runtime working | microsandbox create/exec/destroy cycle passes |
| **7.0** | Metacognitive loop running | Overnight gym dry-run produces metrics |
| **7.5** | Measurable improvement | Week-over-week SWE-bench score improvement |

---

*Generated: 2026-02-09*
*Source data: STAGE_6_7_CONTINUATION.md + SUPER_GOOSE_STAGE6_BLUEPRINT.md + codebase audit + online research*
