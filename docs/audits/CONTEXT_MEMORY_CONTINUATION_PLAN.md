# Context Window, Memory Persistence & Seamless Continuation

**Date**: 2026-02-08
**Priority**: #1 — This is the single biggest UX and capability gap
**Status**: Implementation in progress

---

## 1. Problem Statement

### Pain Points (Ranked by Impact)
1. **Context window / token limits** — Agent hits LLM context limit mid-task, says "start a new session", loses all progress
2. **No crash recovery** — If the process crashes or restarts, all in-flight state is lost
3. **No real-time persistence** — Changes aren't saved until session exit; a crash at minute 59 of a 60-minute task loses everything
4. **No history review** — AI can't review its own prior sessions to know where it left off
5. **No auto-save** — No periodic checkpoint saves (user wants every 10 minutes + on every change)

### What Claude Desktop Does (and its limitations)
- Summarizes conversation when context fills up
- Forces "start a new window" when context is truly exhausted
- Project memory persists preferences but NOT task state
- No checkpoint/resume — you lose your place entirely

---

## 2. SOTA Research: What Solves These Problems

### 2.1 MemGPT / Letta (★★★★★ — Most Relevant)
**Paper**: "MemGPT: Towards LLMs as Operating Systems" (2023)
**Repo**: github.com/cpacker/MemGPT (now github.com/letta-ai/letta)

**Core Technique**: Treats LLM context as "virtual memory" with paging
- **Main context** = Working memory (fits in context window)
- **Archival memory** = Long-term storage (unlimited, on disk)
- **Recall memory** = Conversation history (searchable, on disk)
- When context fills: page OUT old messages to archival, page IN relevant ones via search
- Agent has explicit `memory_search`, `memory_insert`, `memory_page` tools
- Never says "start new session" — just pages memory in/out

**What to adopt**: The paging metaphor. Our compaction already summarizes, but it doesn't SAVE what it removes. MemGPT saves everything and can recall it.

### 2.2 LangGraph Checkpointing (★★★★★ — Already Built, Not Wired)
**Repo**: github.com/langchain-ai/langgraph
**Docs**: langchain-ai.github.io/langgraph/concepts/persistence/

**Core Technique**: Save full agent state at every node transition
- SQLite or Postgres backend
- Thread-based: each conversation is a "thread" with checkpoint history
- Can resume from ANY checkpoint, not just the latest
- Supports branching (explore alternatives from a checkpoint)
- Auto-checkpoint on every state transition

**What we have**: `persistence/mod.rs` + `persistence/sqlite.rs` — A COMPLETE LangGraph-style checkpointer. `CheckpointManager` with SQLite backend, thread IDs, parent chains, metadata. **NOT WIRED TO AGENT.**

### 2.3 Reflexion + Task State Serialization (★★★★)
**Paper**: "Reflexion: Language Agents with Verbal Reinforcement Learning" (2023)

**Core Technique**: On failure or interruption, serialize:
- What the task was
- What was attempted
- What worked / what failed
- What to try next

This "verbal checkpoint" survives context resets because it's a compact text summary that fits in any new context window.

**What to adopt**: On context limit or crash, save a structured "continuation prompt" that contains enough info to resume.

### 2.4 AutoGen Conversation State (★★★)
**Repo**: github.com/microsoft/autogen

**Core Technique**: Full conversation state serialization to JSON
- Saves all messages, tool calls, tool results
- Can deserialize and resume from any point
- Supports conversation branching

**What to adopt**: Save the full conversation alongside checkpoints (we partially do this with session files already).

### 2.5 Voyager Skill Library (★★★ — Already Built)
**Paper**: "Voyager: An Open-Ended Embodied Agent with Large Language Models" (2023)

**Core Technique**: Save learned procedures as reusable skills
- When the agent solves a problem, save the solution as a "skill"
- On future similar tasks, recall and reuse the skill
- Survives across sessions

**What we have**: `saveSkill` tool already implemented (Voyager parity).

### 2.6 Additional Key Papers
- **"Generative Agents: Interactive Simulacra" (Stanford, 2023)** — Memory stream with reflection + retrieval
- **"RAISE: Retrieval-Augmented Agent System" (2024)** — RAG for agent memory
- **"Cognitive Architectures for Language Agents" (CoALA, 2023)** — Framework for agent memory systems
- **"AgentTorch: LLM-backed agents with persistent state" (2024)** — Torch-style checkpointing for agents

---

## 3. What We Already Have (Inventory)

| Component | File | Status | Gap |
|---|---|---|---|
| **CheckpointManager** | `persistence/mod.rs` | Complete code, NOT WIRED | Wire to agent hot path |
| **SqliteCheckpointer** | `persistence/sqlite.rs` | Complete with schema | Wire to CheckpointManager |
| **MemoryCheckpointer** | `persistence/memory.rs` | Complete (in-memory) | Testing only |
| **CompactionConfig** | `compaction/mod.rs` | Complete with 4 strategies | Not used (context_mgmt uses simpler approach) |
| **Context compaction** | `context_mgmt/mod.rs` | WIRED at 80% threshold | Gives up after 2 attempts ("start new session") |
| **MemoryManager** | `memory/mod.rs` | WIRED with disk persistence | No real-time saves, no paging |
| **Session files** | `session/` | WIRED | Conversations saved but no checkpoint metadata |
| **PlanManager** | `planner.rs` | WIRED with verification | Plan state not checkpointed |

---

## 4. Implementation Plan (Prioritized)

### Phase 1: Wire CheckpointManager — Crash Recovery (HIGH)
**Effort**: ~150 LoC in agent.rs
**Impact**: Survive crashes, resume from any point

1. Add `CheckpointManager` field to `Agent` struct (SQLite backend at `~/.config/goose/checkpoints/agent.db`)
2. Save checkpoint after EVERY tool call completion in `reply_internal()`
3. Checkpoint state includes: conversation messages, plan state, current step, pending goals, tool results
4. On agent startup: check for unfinished checkpoints, offer to resume
5. On crash recovery: load last checkpoint, inject continuation prompt

### Phase 2: Fix Context-Limit Continuation (HIGH)
**Effort**: ~100 LoC in agent.rs + context_mgmt
**Impact**: Never say "start new session" again

Current behavior (agent.rs ~line 2058-2070):
```rust
if compaction_attempts >= 2 {
    error!("Context limit exceeded after compaction - prompt too large");
    // Says "start a new session" — THIS IS THE BUG
    break;
}
```

New behavior:
1. Before giving up, save a "continuation checkpoint" with:
   - Task description
   - Plan state (current step, completed steps, remaining steps)
   - Last 3 tool results
   - Summary of what was accomplished
   - What needs to happen next
2. Clear the conversation to just: system prompt + continuation checkpoint summary
3. Continue the loop instead of breaking
4. This is MemGPT's "page out" operation — we remove old context but save it to archival

### Phase 3: Auto-Save Timer (HIGH)
**Effort**: ~50 LoC
**Impact**: Never lose more than 10 minutes of work

1. Spawn a background `tokio::time::interval` task (10 minute period)
2. On each tick: call `CheckpointManager::checkpoint()` with current state
3. Also checkpoint on every file write / tool call (real-time)
4. Add `checkpoint_interval_secs` to agent config (default: 600)

### Phase 4: History Review API (MEDIUM)
**Effort**: ~100 LoC
**Impact**: AI can review prior sessions to know where to pick up

1. Add `review_history` tool to agent toolset
2. Tool queries `CheckpointManager::list()` and `MemoryManager::recall()`
3. Returns: recent checkpoints, session summaries, plan states
4. Automatically inject last session's final checkpoint summary into system prompt on startup
5. Add server route: `GET /agent/history` for UI to display

### Phase 5: MemGPT-Style Memory Paging (MEDIUM)
**Effort**: ~300 LoC
**Impact**: Infinite effective context via smart paging

1. Before compaction: page OUT old messages to `MemoryManager` (episodic)
2. Tag each paged-out block with timestamp + topic + relevance score
3. During recall: page IN relevant blocks from episodic memory based on current task
4. Agent gets explicit `memory_search` and `memory_page` tools
5. Context becomes a sliding window over unlimited history

---

## 5. Architecture After Implementation

```
┌─────────────────────────────────────────────────────────┐
│                    Agent Hot Path                         │
│                                                          │
│  ┌─────────┐   ┌──────────┐   ┌─────────────────────┐  │
│  │ Context  │──▶│ Provider │──▶│ Tool Dispatch       │  │
│  │ Build    │   │ Call     │   │ + Checkpoint Save   │  │
│  └────┬─────┘   └──────────┘   └──────────┬──────────┘  │
│       │                                     │            │
│  ┌────▼─────────────────────────────────────▼──────┐    │
│  │            CheckpointManager (SQLite)            │    │
│  │  • Save after every tool call                    │    │
│  │  • Auto-save every 10 minutes                    │    │
│  │  • Save on context limit before compaction       │    │
│  │  • Restore on crash/restart                      │    │
│  └──────────────────────┬───────────────────────────┘    │
│                         │                                │
│  ┌──────────────────────▼───────────────────────────┐    │
│  │              On Context Limit:                    │    │
│  │  1. Save continuation checkpoint                  │    │
│  │  2. Page OUT old messages to MemoryManager        │    │
│  │  3. Compact remaining to summary                  │    │
│  │  4. Inject continuation prompt                    │    │
│  │  5. CONTINUE (never "start new session")          │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │              MemoryManager (Disk)                 │    │
│  │  • Episodic: paged-out conversation blocks        │    │
│  │  • Semantic: facts + preferences                  │    │
│  │  • Procedural: learned skills (Voyager)           │    │
│  │  • Working: current task context                  │    │
│  └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## 6. Key Open-Source Repos to Reference

| Repo | What to Learn | URL |
|---|---|---|
| **Letta (MemGPT)** | Memory paging, archival storage | github.com/letta-ai/letta |
| **LangGraph** | Checkpointing patterns (we have the code) | github.com/langchain-ai/langgraph |
| **AutoGen** | Conversation state serialization | github.com/microsoft/autogen |
| **CrewAI** | Agent memory persistence | github.com/crewAIInc/crewAI |
| **Haystack** | RAG pipeline for memory retrieval | github.com/deepset-ai/haystack |
| **Open Interpreter** | Conversation continuation patterns | github.com/OpenInterpreter/open-interpreter |
| **Aider** | Git-based session persistence | github.com/paul-gauthier/aider |

---

## 7. Success Criteria

After implementation, the agent should:
1. **Never say "start a new session"** — always continue seamlessly
2. **Survive any crash** — resume from last checkpoint within seconds
3. **Auto-save every 10 minutes** — maximum data loss = 10 minutes
4. **Save on every tool call** — real-time persistence
5. **Review its own history** — know exactly where it left off
6. **Page memory in/out** — effectively infinite context
7. **Cross-session continuity** — start a new session and pick up where you left off
