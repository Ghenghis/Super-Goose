# TimeWarp — SOTA Research & Design Documentation

> **Fusion 360-style time-travel for AI coding agents.**  
> The first system to unify agent state tracking, workspace reconstruction, deterministic replay, conflict detection, and visual timeline UI.

---

## What Is TimeWarp?

TimeWarp is a proposed feature for [Super-Goose](https://github.com/Ghenghis/Super-Goose) that brings Autodesk Fusion 360's parametric timeline concept to AI-assisted code development.

**Core capabilities:**
- ⏮️ **Jump** — Restore your entire workspace to any point in agent history
- 🌿 **Branch** — Fork from any past event to explore alternatives
- 🔄 **Replay** — Deterministically re-execute agent sessions in containers
- 🔍 **Detect** — Three-layer conflict detection (structural + semantic + drift)
- 📊 **Visualize** — Always-visible timeline bar with branch rails and event inspection

**SOTA status:** After comprehensive landscape analysis, **no existing tool combines all these capabilities.** See the full research below.

---

## Documentation Map

### Research

| Document | Description |
|---|---|
| [**SOTA Research**](research/TIMEWARP_SOTA_RESEARCH.md) | Full landscape analysis — what exists, what's missing, why TimeWarp is novel. Covers LangGraph, Agent-Git, Cursor, Undo.io, Git workarounds, and Temporal. Includes risk assessment and honest challenges. |
| [**Competitive Analysis**](research/COMPETITIVE_ANALYSIS.md) | Deep comparison against every tier of agentic coding tools (IDE-integrated, cloud-first, CLI-native, frameworks). Gap analysis, unique value propositions, and competitive moat assessment. |

### Architecture

| Document | Description |
|---|---|
| [**Architecture Blueprint**](architecture/ARCHITECTURE_BLUEPRINT.md) | Complete system architecture with Mermaid diagrams. Event model (ER diagram), event flow sequences, snapshot chain, conflict detection pipeline, replay engine flow, hash chain integrity, SQLite schema, and component dependency map. |
| [**Implementation Roadmap**](architecture/IMPLEMENTATION_ROADMAP.md) | 5-phase plan from foundation (event store + snapshots) through timeline UI. Gantt chart, per-phase deliverables, exit criteria, and dependencies. Includes minimum viable scope definition. |
| [**Super-Goose Integration**](architecture/SUPER_GOOSE_INTEGRATION.md) | How TimeWarp integrates with ALMAS, EvoAgentX, Coach/Player, and Conscious. MCP middleware architecture, per-system event mappings, file system layout, configuration, and upstream compatibility. |

### Diagrams

| Document | Description |
|---|---|
| [**Diagrams Collection**](diagrams/TIMEWARP_DIAGRAMS.md) | All Mermaid diagrams in one file — system architecture, event lifecycle, competitive positioning, snapshot chain, branch DAG, replay flow, conflict pipeline, integration map, CLI command map, and UI layout. All render natively on GitHub. |

### References

| Document | Description |
|---|---|
| [**GitHub Repos Reference**](references/GITHUB_REPOS_REFERENCE.md) | Every open-source repo, library, and tool relevant to building TimeWarp. Organized by component (agent framework, checkpointing, event sourcing, CAS/VCS, SQLite, AST parsing, containers, UI, MCP, durable execution). Includes recommended build stack. |

---

## Quick Summary of Findings

### The Problem
AI coding agents (Cursor, Claude Code, Goose, Codex, Jules) autonomously edit files and make decisions but provide **no robust historical accountability** — no unified timeline, no workspace reconstruction, no deterministic replay, no branching, no conflict detection.

### What Exists Today (and Why It's Not Enough)

| Tool | What It Does | What It Doesn't Do |
|---|---|---|
| **LangGraph** | Checkpoint/branch agent conversation state | No file awareness, no visual timeline |
| **Agent-Git** | Git-like version control for agent state + tool reversal | No workspace snapshots, Python only |
| **Cursor Checkpoints** | Auto-snapshot before AI edits | Ephemeral, unreliable, no branching, no diffs |
| **Git + Scripts** | Manual branch per AI step | No automation, no agent metadata, branch explosion |
| **Undo.io** | Runtime execution replay | Different problem domain (debugging, not history) |

### Why TimeWarp Is SOTA

**No tool occupies the intersection of full agent state tracking + full workspace state tracking.** TimeWarp is the first to propose:

1. **Content-addressed workspace snapshots** — Byte-exact reconstruction of any historical state
2. **Deterministic replay with reproducibility scores** — Honest approach to LLM non-determinism
3. **Three-layer conflict detection** — Structural + semantic (AST) + external drift
4. **Fusion 360 timeline UI** — Parametric timeline applied to coding history (never been done)

### Recommended Build Stack

| Layer | Technology |
|---|---|
| Core | Rust (within Super-Goose workspace) |
| Event/Snapshot Store | SQLite via rusqlite |
| Content Addressing | SHA-256 / BLAKE3 blobs |
| Agent Instrumentation | MCP middleware proxy |
| AST Parsing | tree-sitter |
| Container Replay | Docker via bollard |
| Timeline UI | Tauri + React |
| VCS Integration | git2 (libgit2) |

---

## This Is Research Only

**These documents contain no code.** They are SOTA research, architecture design, and implementation planning. The purpose is to establish:

1. ✅ TimeWarp is genuinely novel (no existing tool covers the full scope)
2. ✅ The architecture is sound (based on proven patterns)
3. ✅ There are concrete repos and libraries to build from
4. ✅ The phased roadmap is realistic
5. ✅ Integration with Super-Goose's existing systems is clean

Implementation should follow the [phased roadmap](architecture/IMPLEMENTATION_ROADMAP.md), starting with the event store and workspace snapshots (Phase 1).

---

*Research conducted February 2026. All referenced repositories verified as accessible and actively maintained.*
