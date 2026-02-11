# TimeWarp: GitHub Repositories & Building Blocks Reference

**Purpose:** Comprehensive catalog of every open-source repo, library, and tool relevant to building TimeWarp, organized by component.

---

## 1. Base Agent Framework

### block/goose
- **URL:** https://github.com/block/goose
- **Language:** Rust (cargo workspaces)
- **License:** Apache 2.0
- **Stars:** 16k+ | **Status:** Very active (6700+ issues/PRs)
- **Relevance:** Super-Goose is a fork of this. Provides the agent runtime, CLI, Electron desktop app, and MCP infrastructure that TimeWarp would instrument.
- **Key paths:**
  - `crates/goose/` — Core agent logic
  - `crates/goose-cli/` — CLI entry point
  - `crates/goose-server/` — Backend server (binary: `goosed`)
  - `crates/goose-mcp/` — MCP extensions
  - `crates/mcp-client/` — MCP client
  - `crates/mcp-core/` — MCP shared types
  - `crates/mcp-server/` — MCP server
  - `temporal-service/` — Go-based scheduler (Temporal pattern)
  - `ui/desktop/` — Electron app
- **What to use:** MCP hooks for instrumenting agent actions. The `temporal-service/` directory shows Block already thinks about durable execution patterns.

### Ghenghis/Super-Goose
- **URL:** https://github.com/Ghenghis/Super-Goose
- **Language:** Rust + TypeScript (Electron)
- **License:** Apache 2.0
- **Commits:** 3,583
- **Relevance:** The target repo where TimeWarp would be integrated. Already has ALMAS team coordination, EvoAgentX self-evolution, Coach/Player QA, and Conscious voice interface.
- **Key existing systems:**
  - ALMAS: 5-role sequential workflow with RBAC
  - EvoAgentX: Memory-driven prompt optimization with progressive disclosure
  - Coach/Player: Adversarial dual-model quality review
  - Conscious: Voice interface with intent detection
- **Integration point:** TimeWarp docs would go in `docs/timewarp/`

---

## 2. Agent State Checkpointing & Branching

### KataDavidXD/Agent-Git ⭐ CLOSEST TO TIMEWARP
- **URL:** https://github.com/KataDavidXD/Agent-Git
- **Language:** Python
- **License:** Open source
- **Relevance:** **Most architecturally similar existing project.** Git-like version control for AI conversations with state commit, state revert, branching, tool reversal.
- **Key concepts to adopt:**
  - Three-layer architecture: External Session → Internal Session → Commit State
  - Non-destructive branching (rollbacks create new branches)
  - Tool reversal via compensating actions
  - SQLite-backed persistent storage
  - MDP (Markov Decision Process) framing for agent state transitions
- **What to port to Rust:** The checkpoint/branch/rollback patterns and tool reversal concept

### LangGraph Checkpoint System
- **URL:** https://github.com/langchain-ai/langgraph
- **Docs:** https://langchain-ai.github.io/langgraph/concepts/persistence/
- **Time Travel Docs:** https://langchain-ai.github.io/langgraph/how-tos/time-travel/
- **Language:** Python
- **License:** MIT
- **Relevance:** Most mature checkpoint/resume/branch implementation for AI agents. Well-documented API patterns.
- **Key concepts to adopt:**
  - Thread-based checkpoint organization
  - `checkpoint_id` for resuming from specific points
  - `update_state` for modifying state before resuming (creates fork)
  - `get_state_history` for retrieving full checkpoint timeline
  - SQLite and PostgreSQL checkpoint savers
  - InMemorySaver for testing
- **Checkpoint backends:**
  - `langgraph-checkpoint-sqlite` — Lightweight, single-file
  - `langgraph-checkpoint-postgres` — Production-grade

---

## 3. Event Sourcing Libraries

### EventStoreDB (KurrentDB)
- **URL:** https://github.com/EventStore/EventStore
- **Language:** C# (.NET)
- **License:** BSD-3-Clause (server), Apache 2.0 (client)
- **Relevance:** The canonical event sourcing database. Reference architecture for append-only event streams, projections, and subscriptions.
- **Key patterns:** Stream per aggregate, optimistic concurrency, catch-up subscriptions

### pyeventsourcing/eventsourcing
- **URL:** https://github.com/pyeventsourcing/eventsourcing
- **Language:** Python
- **License:** BSD-3-Clause
- **Relevance:** Clean Python implementation of event sourcing patterns. Good reference for: aggregate lifecycle, snapshotting, versioning, encryption, optimistic concurrency.
- **Key concepts:** Domain events → aggregate reconstruction, snapshot strategy, event upcasting

### oskardudycz/EventSourcing.NetCore
- **URL:** https://github.com/oskardudycz/EventSourcing.NetCore
- **Language:** C# (.NET)
- **Relevance:** Comprehensive examples and tutorials. Covers: stream operations, inline aggregation (snapshots), reaggregation, projections. Excellent learning resource for event store design.

---

## 4. Content-Addressed Storage & VCS

### Git (core concepts)
- **URL:** https://github.com/git/git
- **Relevance:** Git's object model (blob → tree → commit, all SHA-1 addressed) is the direct inspiration for TimeWarp's snapshot store. Key concepts:
  - Content-addressed blobs (file contents → SHA hash → stored once)
  - Tree objects (directory listings referencing blobs/subtrees)
  - Commit objects (tree + parent commits + metadata)
  - Pack files (delta compression for storage efficiency)
- **What to adapt:** TimeWarp events are like commits. TimeWarp snapshots are like tree+blob combinations. Delta compression follows Git's pack file approach.

### pijul
- **URL:** https://pijul.org/ | https://nest.pijul.com/pijul/pijul
- **Language:** Rust
- **License:** GPL-2.0
- **Relevance:** Patch-based VCS with sound mathematical foundations (theory of patches). Unlike Git's snapshot-based model, Pijul's patch algebra handles merge conflicts more cleanly. Relevant for TimeWarp's conflict detection layer.
- **Key concepts:** Commutative patches, conflict representation as first-class data

### jj (Jujutsu)
- **URL:** https://github.com/jj-vcs/jj
- **Language:** Rust
- **License:** Apache 2.0
- **Stars:** 12k+
- **Relevance:** Modern VCS built on top of Git storage that treats every working copy change as an automatic commit. Its **undo/redo system** and **operation log** are conceptually similar to TimeWarp's event store. Every `jj` operation is recorded and can be undone.
- **Key concepts to adopt:**
  - Operation log (every VCS operation recorded with timestamp)
  - Automatic snapshotting of working copy
  - First-class conflict resolution
  - Built-in `jj undo` and `jj op log` for time-travel through VCS history

---

## 5. SQLite for Event/Snapshot Storage

### rusqlite
- **URL:** https://github.com/rusqlite/rusqlite
- **Language:** Rust
- **License:** MIT
- **Relevance:** The standard Rust SQLite binding. Would be used for TimeWarp's event store and snapshot index. Supports WAL mode for concurrent reads, transactions, and custom functions.

### libsql
- **URL:** https://github.com/tursodatabase/libsql
- **Language:** C/Rust
- **License:** MIT
- **Relevance:** Fork of SQLite with extensions including replication, encryption, and vector search. Could be useful if TimeWarp needs distributed event stores or encrypted storage.

---

## 6. AST Parsing for Semantic Conflict Detection

### tree-sitter
- **URL:** https://github.com/tree-sitter/tree-sitter
- **Language:** Rust/C
- **License:** MIT
- **Stars:** 19k+
- **Relevance:** Multi-language incremental parser. Essential for TimeWarp's semantic conflict detection layer. Supports 100+ languages with concrete syntax trees.
- **Key Rust crate:** `tree-sitter` (core), language-specific crates (e.g., `tree-sitter-javascript`, `tree-sitter-python`, `tree-sitter-rust`)
- **What to use:** Parse files at two branch points → compare ASTs → detect semantic conflicts (renamed symbols, changed types, moved functions)

### difftastic
- **URL:** https://github.com/Wilfred/difftastic
- **Language:** Rust
- **License:** MIT
- **Stars:** 22k+
- **Relevance:** Structural diff tool that understands syntax (via tree-sitter). Shows AST-level differences rather than line-level. Could be used as a component of TimeWarp's conflict detection engine.
- **What to use:** Its AST diffing algorithms for detecting semantic changes between snapshots

### GumTree
- **URL:** https://github.com/GumTreeDiff/gumtree
- **Language:** Java
- **License:** LGPL-3.0
- **Relevance:** Academic AST diff/merge tool. Computes edit scripts between ASTs. Research-grade but establishes the theoretical foundations for semantic merge.
- **Papers:** "Fine-grained and Accurate Source Code Differencing" (ASE 2014)

---

## 7. Container/Sandbox for Deterministic Replay

### Docker / Podman
- **Relevance:** TimeWarp's deterministic replay requires containerized re-execution with pinned:
  - Image digests (not tags)
  - Volume mounts (workspace snapshots)
  - Environment variables
  - Network configuration
- **Rust crates:** `bollard` (Docker API client for Rust)

### bollard
- **URL:** https://github.com/fussybeaver/bollard
- **Language:** Rust
- **License:** Apache 2.0
- **Relevance:** Async Docker Engine API client for Rust. Would be used to programmatically create and manage containers for deterministic replay sessions.

### Firecracker (optional)
- **URL:** https://github.com/firecracker-microvm/firecracker
- **Language:** Rust
- **License:** Apache 2.0
- **Relevance:** Lightweight microVM. If container isolation isn't sufficient for deterministic replay, Firecracker provides VM-level isolation with sub-second boot times.

---

## 8. Timeline UI Components

### No direct equivalent exists. Build from:

#### React Flow (for DAG visualization)
- **URL:** https://github.com/xyflow/xyflow
- **Language:** TypeScript/React
- **License:** MIT
- **Stars:** 27k+
- **Relevance:** Highly customizable graph/flow visualization. Could be adapted for branch DAG visualization in the timeline UI.

#### thomasa88/VerticalTimeline (Fusion 360 add-in)
- **URL:** https://github.com/thomasa88/VerticalTimeline
- **Language:** Python (Fusion 360 API)
- **License:** MIT
- **Relevance:** Reference implementation of a vertical timeline for Fusion 360. Shows the UX patterns (click to select, double-click to edit, right-click to roll) that TimeWarp should emulate.

#### Tauri (for desktop app)
- **URL:** https://github.com/tauri-apps/tauri
- **Language:** Rust + Web (React/Svelte/etc.)
- **License:** Apache 2.0/MIT
- **Stars:** 88k+
- **Relevance:** Rust-native desktop app framework. Better fit than Electron for a Rust-heavy project like Super-Goose. The timeline UI could be a Tauri app with a React frontend reading from the SQLite event store.

---

## 9. MCP (Model Context Protocol) Infrastructure

### modelcontextprotocol/specification
- **URL:** https://github.com/modelcontextprotocol/specification
- **Relevance:** The MCP spec that Goose and other agents use. TimeWarp would use MCP to instrument agent actions — intercepting tool calls, file operations, and command executions to create timeline events.

### modelcontextprotocol/rust-sdk
- **URL:** https://github.com/modelcontextprotocol/rust-sdk
- **Language:** Rust
- **Relevance:** Official Rust SDK for MCP. Would be used to build TimeWarp's instrumentation layer as an MCP middleware/proxy.

---

## 10. Durable Execution / Workflow Engines (Architecture Reference)

### temporalio/temporal
- **URL:** https://github.com/temporalio/temporal
- **Language:** Go
- **License:** MIT
- **Relevance:** Architecture reference for durable execution with event history replay. Temporal's "workflow history" is conceptually similar to TimeWarp's event store. Key patterns: event replay, activity heartbeats, workflow versioning.
- **Note:** Goose already has a `temporal-service/` directory.

### restate-dev/restate
- **URL:** https://github.com/restatedev/restate
- **Language:** Rust
- **License:** BUSL-1.1
- **Relevance:** Durable execution engine built in Rust. Its journal-based replay and virtual object model are architecturally relevant to TimeWarp's event sourcing.

---

## 11. Hash Chain / Integrity Verification

### Relevant patterns (no single repo):
- **Merkle trees** — Used by Git, IPFS, blockchain. TimeWarp's hash chain verifies event integrity.
- **Rust crates:** `sha2` (SHA-256), `blake3` (faster hash), `merkle-lite`
- **Pattern:** Each event includes `prev_hash = SHA256(previous_event)`, creating a tamper-evident chain. Any modification to a historical event breaks the chain.

---

## Summary: Recommended Build Stack

| Layer | Technology | Source |
|---|---|---|
| Core runtime | Rust | block/goose ecosystem |
| Event store | SQLite via rusqlite | Standard Rust crate |
| Snapshot storage | Content-addressed blobs (SHA-256) | Git object model pattern |
| Agent instrumentation | MCP middleware | modelcontextprotocol/rust-sdk |
| Checkpoint patterns | Agent-Git concepts | KataDavidXD/Agent-Git |
| AST parsing | tree-sitter | tree-sitter/tree-sitter |
| Structural diff | difftastic algorithms | Wilfred/difftastic |
| Container orchestration | bollard (Docker API) | fussybeaver/bollard |
| Hash chain | sha2 or blake3 | Rust crates |
| Timeline UI | Tauri + React | tauri-apps/tauri + xyflow |
| VCS integration | git2 (libgit2 binding) | rust-lang/git2-rs |

---

*All repositories verified as accessible and actively maintained as of February 2026.*
