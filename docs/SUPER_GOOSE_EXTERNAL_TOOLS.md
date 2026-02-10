# Super-Goose External Tools: Architecture, Integration & Comparison

> **Version**: 1.0 | **Date**: 2026-02-10 | **Branch**: main
> **Repository**: G:\goose (Ghenghis/Super-Goose)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture Diagram](#2-system-architecture-diagram)
3. [Block's Goose — The Foundation](#3-blocks-goose--the-foundation)
4. [Tool #1: Aider — AI Code Editor](#4-tool-1-aider--ai-code-editor)
5. [Tool #2: Conscious — Voice AI Companion](#5-tool-2-conscious--voice-ai-companion)
6. [Tool #3: LangGraph — Workflow Orchestration](#6-tool-3-langgraph--workflow-orchestration)
7. [Tool #4: OpenHands — Sandboxed AI Engineer](#7-tool-4-openhands--sandboxed-ai-engineer)
8. [Tool #5: PraisonAI — Multi-Agent Framework](#8-tool-5-praisonai--multi-agent-framework)
9. [Tool #6: Pydantic-AI — Type-Safe Agents](#9-tool-6-pydantic-ai--type-safe-agents)
10. [Side-by-Side Feature Matrix](#10-side-by-side-feature-matrix)
11. [Integration Architecture](#11-integration-architecture)
12. [Data Flow Diagrams](#12-data-flow-diagrams)
13. [What Each Tool Adds That Goose Lacks](#13-what-each-tool-adds-that-goose-lacks)
14. [Integration Roadmap](#14-integration-roadmap)

---

## 1. Executive Summary

**Super-Goose** = Block's Goose (Rust core) + 6 external Python tools bridged through Conscious.

Block's Goose is a powerful agentic platform with 40+ LLM providers and MCP tool support,
but it has significant gaps in code editing intelligence, voice interaction, workflow
orchestration, sandboxed execution, multi-agent automation, and structured output validation.

The 6 external tools each fill a specific gap:

```
 GOOSE GAPS                    TOOL THAT FILLS IT
 ─────────────────────────     ─────────────────────────
 Dumb file overwrites     ──► AIDER (26 edit strategies)
 Text-only interface      ──► CONSCIOUS (voice + emotion)
 Linear conversations     ──► LANGGRAPH (state machines)
 Unsafe host execution    ──► OPENHANDS (Docker sandbox)
 Manual agent setup       ──► PRAISONAI (auto-agents)
 Raw unvalidated output   ──► PYDANTIC-AI (type-safe)
```

**Current Status**: All 6 tools are cloned in `G:\goose\external\` but **NOT yet
integrated**. They serve as reference implementations for the bridge layer being
built in `external/conscious/`.

---

## 2. System Architecture Diagram

### 2.1 High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SUPER-GOOSE PLATFORM                             │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    USER INTERFACES                                │  │
│  │                                                                   │  │
│  │   ┌──────────┐  ┌──────────────┐  ┌──────────────┐              │  │
│  │   │ CLI      │  │ Electron     │  │ Voice        │              │  │
│  │   │ (goose)  │  │ Desktop App  │  │ (Conscious)  │              │  │
│  │   └────┬─────┘  └──────┬───────┘  └──────┬───────┘              │  │
│  └────────┼───────────────┼──────────────────┼───────────────────────┘  │
│           │               │                  │                          │
│           ▼               ▼                  ▼                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                GOOSE CORE (Rust)                                  │  │
│  │                                                                   │  │
│  │  ┌─────────┐ ┌──────────┐ ┌───────────┐ ┌────────────────────┐  │  │
│  │  │ Agent   │ │ Provider │ │ MCP       │ │ Guardrails         │  │  │
│  │  │ Engine  │ │ Router   │ │ Gateway   │ │ (6 detectors)      │  │  │
│  │  │         │ │ (40+LLM) │ │           │ │                    │  │  │
│  │  └────┬────┘ └────┬─────┘ └─────┬─────┘ └────────────────────┘  │  │
│  │       │           │             │                                │  │
│  │  ┌────┴────┐ ┌────┴─────┐ ┌────┴──────┐ ┌────────────────────┐  │  │
│  │  │ Memory  │ │ Session  │ │ Extension │ │ Security           │  │  │
│  │  │ System  │ │ Manager  │ │ Manager   │ │ (PII, injection,   │  │  │
│  │  │         │ │          │ │           │ │  secrets, jailbreak)│  │  │
│  │  └─────────┘ └──────────┘ └───────────┘ └────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│           │                                                             │
│           │  HTTP/WebSocket Bridge                                      │
│           ▼                                                             │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │              EXTERNAL TOOL BRIDGE LAYER (Python)                  │  │
│  │                                                                   │  │
│  │  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌────────┐  │  │
│  │  │ AIDER   │ │LANGGRAPH │ │OPENHANDS │ │PRAISON  │ │PYDANTIC│  │  │
│  │  │ Code    │ │ Workflow │ │ Sandbox  │ │ Multi-  │ │ Type   │  │  │
│  │  │ Editor  │ │ Engine   │ │ Runtime  │ │ Agent   │ │ Safety │  │  │
│  │  └─────────┘ └──────────┘ └──────────┘ └─────────┘ └────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │              CONSCIOUS (Voice + Emotion + Personality)             │  │
│  │                                                                   │  │
│  │  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌────────┐  │  │
│  │  │ Moshi   │ │ Emotion  │ │ Memory   │ │ 13      │ │ Device │  │  │
│  │  │ Voice   │ │ Detector │ │ Mem0 +   │ │ Person- │ │ Control│  │  │
│  │  │ Engine  │ │ Wav2Vec2 │ │ Qdrant   │ │ alities │ │ IoT    │  │  │
│  │  └─────────┘ └──────────┘ └──────────┘ └─────────┘ └────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Goose Internal Crate Map

```
┌──────────────────────────────────────────────────────────────────┐
│                    CARGO WORKSPACE (7 crates)                     │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  goose-cli                    (Binary: goose)              │  │
│  │  Entry point, CLI parsing, command routing                 │  │
│  └───────┬───────────────────────────┬────────────────────────┘  │
│          │ depends on                │ depends on                │
│          ▼                           ▼                           │
│  ┌───────────────┐          ┌────────────────┐                  │
│  │  goose        │          │  goose-server  │                  │
│  │  (Core lib)   │◄─────── │  (goosed.exe)  │                  │
│  │               │          │  REST API      │                  │
│  │  agents/      │          │  port 7878     │                  │
│  │  providers/   │          └────────────────┘                  │
│  │  memory/      │                                               │
│  │  guardrails/  │                                               │
│  │  tools/       │                                               │
│  │  swarm/       │                                               │
│  │  mcp_gateway/ │                                               │
│  └───────┬───────┘                                               │
│          │ depends on                                            │
│          ▼                                                       │
│  ┌───────────────┐  ┌────────────────┐  ┌──────────────────┐   │
│  │  goose-mcp    │  │  goose-acp     │  │ goose-test-      │   │
│  │  (5 MCP       │  │  (Anthropic    │  │ support          │   │
│  │   servers)    │  │   protocol)    │  │ (Test fixtures)  │   │
│  │               │  │                │  │                  │   │
│  │  developer/   │  └────────────────┘  └──────────────────┘   │
│  │  memory/      │                                               │
│  │  autovisual/  │  ┌────────────────┐                          │
│  │  computerctl/ │  │  goose-test    │                          │
│  │  tutorial/    │  │  (Test CLI)    │                          │
│  └───────────────┘  └────────────────┘                          │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Block's Goose — The Foundation

### 3.1 What Block Built

Goose is a **Rust-native agentic AI platform** from Block Inc (formerly Square).
It uses the **Model Context Protocol (MCP)** as its primary extension mechanism.

### 3.2 Core Architecture Modules

```
crates/goose/src/
├── agents/                 # Agent intelligence
│   ├── agent.rs            # Main agent loop (conversation → tool call → result)
│   ├── orchestrator.rs     # Multi-step task coordination
│   ├── planner.rs          # Task planning and decomposition
│   ├── reasoning.rs        # Chain-of-thought reasoning
│   ├── reflexion.rs        # Self-reflection and correction
│   ├── critic.rs           # Quality review of agent outputs
│   ├── state_graph/        # State machine execution (basic)
│   ├── team/               # Multi-agent team coordination
│   │   ├── coordinator.rs  # Team task routing
│   │   ├── roles.rs        # Agent role definitions
│   │   ├── handoffs.rs     # Agent-to-agent delegation
│   │   ├── enforcer.rs     # Policy enforcement
│   │   └── validator.rs    # Output validation
│   ├── subagent_tool.rs    # Sub-agent execution
│   ├── workflow_engine.rs  # Basic workflow execution
│   ├── tom_extension.rs    # Top Of Mind platform (new from Block)
│   ├── extension.rs        # Extension interface
│   └── ... (45+ files)
│
├── providers/              # LLM integrations (40+)
│   ├── anthropic.rs        # Claude (primary)
│   ├── openai.rs           # GPT-4, o1, etc.
│   ├── google.rs           # Gemini
│   ├── azure.rs            # Azure OpenAI
│   ├── bedrock.rs          # AWS Bedrock
│   ├── ollama.rs           # Local LLMs
│   ├── openrouter.rs       # Multi-provider router
│   ├── litellm.rs          # LiteLLM proxy
│   ├── lmstudio.rs         # Local model hosting
│   ├── databricks.rs       # Databricks
│   ├── snowflake.rs        # Snowflake Cortex
│   ├── routing/            # Provider routing/selection
│   └── ... (40+ files)
│
├── memory/                 # Memory system
│   ├── working_memory.rs   # Short-term context
│   ├── episodic_memory.rs  # Episode-based recall
│   ├── semantic_store.rs   # Vector similarity search
│   ├── consolidation.rs    # Memory promotion pipeline
│   └── retrieval.rs        # Memory retrieval
│
├── guardrails/             # Security
│   └── detectors/          # 6 detector types
│       ├── prompt_injection (50+ patterns)
│       ├── pii_detection   (email, SSN, CC with Luhn)
│       ├── jailbreak       (DAN mode, bypass patterns)
│       ├── topic_blocking  (violence, drugs, hate)
│       ├── keyword_match   (exact, phrase, fuzzy)
│       └── secret_detect   (30+ API key patterns)
│
├── mcp_gateway/            # MCP server routing
├── tools/                  # Tool system
│   ├── registry.rs         # Tool registration
│   ├── search.rs           # Dynamic discovery
│   └── programmatic.rs     # Structured invocation
│
├── swarm/                  # Swarm agent coordination
├── compaction/             # Context window management
├── policies/               # Rule engine (26 condition types)
├── hooks/                  # Lifecycle events
├── skills/                 # Installable skill modules
├── approval/               # Human-in-the-loop
└── config/                 # Configuration management
```

### 3.3 Goose's Native Strengths

| Strength | Detail |
|----------|--------|
| **Performance** | Compiled Rust, zero-cost abstractions, async tokio runtime |
| **Type safety** | Compile-time type checking, no runtime type errors |
| **40+ LLM providers** | Native Rust clients, no Python dependency |
| **MCP protocol** | First-class client AND server support |
| **Security** | 6 guardrail detectors, 50+ injection patterns, Luhn validation |
| **Memory** | Working + episodic + semantic + consolidation pipeline |
| **Team agents** | Coordinator, roles, handoffs, enforcer, validator |
| **Extensions** | Developer, AutoVisualiser, ComputerController, Memory, Tutorial |

### 3.4 Goose's Gaps (What the 6 tools fill)

| Gap | Severity | Description |
|-----|----------|-------------|
| Code editing intelligence | **Critical** | Overwrites entire files, no diff/patch strategies |
| Voice interface | **Critical** | Text-only, no speech input/output |
| Workflow orchestration | **High** | Basic state_graph, no durable checkpoints |
| Sandboxed execution | **High** | Runs commands directly on host machine |
| Auto-agent creation | **Medium** | Manual extension configuration required |
| Structured output validation | **Medium** | Returns raw text/JSON, no type validation |
| RAG pipeline | **Medium** | Has memory but no full RAG (chunk/index/retrieve/rerank) |
| Emotion awareness | **Low** | No understanding of user emotional state |
| Planning mode | **Low** | Dives into execution without read-only analysis first |

---

## 4. Tool #1: AIDER — AI Code Editor

### 4.1 Identity

```
 Name:      Aider (AI pair programming in your terminal)
 Language:  Python (20,200 LOC, 80 modules)
 Creator:   Paul Gauthier
 License:   Apache 2.0
 Location:  G:\goose\external\aider\
 Installs:  4.1M+ PyPI downloads
```

### 4.2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        AIDER                                 │
│                                                              │
│  ┌──────────────┐    ┌──────────────────────────────────┐   │
│  │   main.py    │───►│  Base Coder Engine                │   │
│  │   CLI entry  │    │  (base_coder.py)                  │   │
│  └──────────────┘    │                                    │   │
│                      │  ┌────────────────────────────┐   │   │
│                      │  │  26+ Edit Strategies       │   │   │
│                      │  │                            │   │   │
│                      │  │  WHOLE FILE:               │   │   │
│                      │  │   WholeFileCoder           │   │   │
│                      │  │   SingleWholeFileFunction  │   │   │
│                      │  │   EditorWholeFileCoder     │   │   │
│                      │  │                            │   │   │
│                      │  │  EDIT BLOCK:               │   │   │
│                      │  │   EditBlockCoder           │   │   │
│                      │  │   EditBlockFencedCoder     │   │   │
│                      │  │                            │   │   │
│                      │  │  DIFF-BASED:               │   │   │
│                      │  │   UnifiedDiffCoder         │   │   │
│                      │  │   UnifiedDiffSimpleCoder   │   │   │
│                      │  │                            │   │   │
│                      │  │  OTHER:                    │   │   │
│                      │  │   PatchCoder               │   │   │
│                      │  │   ContextCoder             │   │   │
│                      │  │   ArchitectCoder           │   │   │
│                      │  │   AskCoder                 │   │   │
│                      │  └────────────────────────────┘   │   │
│                      └──────────────────────────────────┘   │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ RepoMap  │  │ GitRepo  │  │ LiteLLM  │  │ Voice      │  │
│  │ (tree-   │  │ (auto    │  │ (100+    │  │ (speech-   │  │
│  │  sitter) │  │  commit) │  │  models) │  │  to-code)  │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 What Aider Does That Goose Cannot

```
GOOSE TODAY:                          AIDER:
─────────────────────                 ─────────────────────────
User: "Add logging"                   User: "Add logging"

Goose reads file.rs (2000 lines)      Aider maps entire codebase
Goose sends ENTIRE file to LLM        Aider builds context from RepoMap
LLM returns ENTIRE modified file      LLM returns SEARCH/REPLACE block:
Goose overwrites file.rs
                                        <<<<<<< SEARCH
Problems:                                fn process() {
 - Wastes tokens on unchanged code       >>>>>>> REPLACE
 - LLM may corrupt untouched code        fn process() {
 - No git commit                             log::info!("Processing...");
 - One strategy fits all                  <<<<<<< END

                                      Aider applies surgical edit
                                      Aider runs linter
                                      Aider auto-commits with message
                                      Aider verifies via git diff
```

### 4.4 Key Metrics

| Metric | Value |
|--------|-------|
| Edit strategies | 26+ (whole, diff, block, patch, context, architect) |
| Language support | 100+ (via tree-sitter parsers) |
| LLM providers | 100+ (via LiteLLM) |
| Auto-commit | Yes (sensible git messages) |
| Voice input | Yes (speech-to-code) |
| Repo mapping | Full codebase map for context |
| Auto-lint | Yes (runs linter, auto-fixes) |
| Error recovery | 3 reflection attempts on failure |

---

## 5. Tool #2: CONSCIOUS — Voice AI Companion

### 5.1 Identity

```
 Name:      Conscious (Voice-first AI companion)
 Language:  Python (8,579 LOC, 38 modules)
 Creator:   Super-Goose project (our own)
 License:   Proprietary
 Location:  G:\goose\external\conscious\
 Voice:     Kyutai Moshi 7B (native speech-to-speech)
```

### 5.2 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       CONSCIOUS                                  │
│                                                                  │
│    VOICE LAYER                     AGENTIC LAYER                │
│  ┌─────────────────┐           ┌──────────────────────┐        │
│  │ Moshi Engine    │  audio    │ Agent Controller     │        │
│  │ (7B S2S model)  │◄────────►│ (central dispatcher) │        │
│  │                 │  text     │                      │        │
│  │ Server Manager  │           │ Intent Router        │        │
│  │ (lifecycle,     │           │ ┌────────┐           │        │
│  │  health check,  │           │ │ CHAT?  │──► Moshi  │        │
│  │  crash recovery)│           │ │        │   handles │        │
│  │                 │           │ │ ACTION?│──► Goose  │        │
│  │ WebSocket Agent │           │ └────────┘   Bridge  │        │
│  │ (autonomous,    │           │                      │        │
│  │  no browser)    │           │ GooseBridge ─────────┼──► goosed
│  │                 │           │ (HTTP to port 7878)  │   (Rust)
│  │ Wake Word + VAD │           │                      │        │
│  └─────────────────┘           │ Action Queue         │        │
│                                │ Result Speaker       │        │
│    EMOTION LAYER               │ Skill Bridge         │        │
│  ┌─────────────────┐          │ AI Creator           │        │
│  │ Wav2Vec2        │          └──────────────────────┘        │
│  │ (8 emotions,    │                                           │
│  │  85-90% acc.)   │          PERSONALITY LAYER               │
│  │                 │          ┌──────────────────────┐        │
│  │ Mood Tracker    │          │ 13 Profiles:         │        │
│  │ (trends over    │          │  Jarvis (butler)     │        │
│  │  time)          │          │  Buddy (friendly)    │        │
│  │                 │          │  Professor (academic)│        │
│  │ Emotion         │          │  Spark (creative)    │        │
│  │ Responder       │          │  GLaDOS (sarcastic)  │        │
│  │ (prompt inject) │          │  Deadpool (chaos)    │        │
│  └─────────────────┘          │  Rocket (raccoon)    │        │
│                                │  ... 6 more          │        │
│    MEMORY LAYER               │                      │        │
│  ┌─────────────────┐          │ 20+ sliders:         │        │
│  │ Mem0 + Qdrant   │          │  warmth, humor,      │        │
│  │ (vector DB,     │          │  formality, chaos,   │        │
│  │  cross-session) │          │  profanity...        │        │
│  └─────────────────┘          └──────────────────────┘        │
│                                                                  │
│    DEVICE LAYER                                                 │
│  ┌─────────────────┐                                            │
│  │ Network Scanner │                                            │
│  │ SSH to RPi/SBC  │                                            │
│  │ 3D Printer Ctl  │                                            │
│  └─────────────────┘                                            │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Integration Flow (Already Designed)

```
    Human speaks                Conscious                     Goose (Rust)
    ─────────────              ──────────────                ──────────────
         │                          │                             │
         │  audio stream            │                             │
         ├─────────────────────────►│                             │
         │                          │                             │
         │                   ┌──────┴──────┐                     │
         │                   │ Moshi S2S   │                     │
         │                   │ transcribes │                     │
         │                   │ + classifies│                     │
         │                   └──────┬──────┘                     │
         │                          │                             │
         │                   ┌──────┴──────┐                     │
         │                   │ CHAT or     │                     │
         │                   │ ACTION?     │                     │
         │                   └──┬──────┬───┘                     │
         │                      │      │                          │
         │              CHAT    │      │  ACTION                  │
         │              ┌───────┘      └───────┐                  │
         │              ▼                      ▼                  │
         │       Moshi responds         GooseBridge               │
         │       directly (S2S)         HTTP POST ────────────────►
         │              │               to port 7878              │
         │              │                      │                  │
         │              │               ┌──────┴──────┐          │
         │              │               │ goosed      │          │
         │              │               │ executes    │          │
         │              │               │ tool call   │          │
         │              │               └──────┬──────┘          │
         │              │                      │                  │
         │              │               Result Speaker            │
         │              │               converts to speech        │
         │◄─────────────┴──────────────────────┘                  │
         │  audio response                                        │
```

### 5.4 Key Metrics

| Metric | Value |
|--------|-------|
| Voice latency | <200ms (160ms achievable) |
| Emotion detection | 85-90% accuracy, 8 emotions |
| Personalities | 13 profiles, 20+ customization sliders |
| Memory | Mem0 + Qdrant semantic vector memory |
| Privacy | 100% local (zero cloud calls) |
| Hardware | RTX 3090 Ti recommended |
| Content rating | Safe / 18+ / 21+ with consent |
| API | REST (port 8999) + WebSocket |

---

## 6. Tool #3: LANGGRAPH — Workflow Orchestration

### 6.1 Identity

```
 Name:      LangGraph (stateful agent orchestration)
 Language:  Python (248 files, monorepo)
 Creator:   LangChain Inc
 License:   MIT
 Location:  G:\goose\external\langgraph\
 Version:   1.0.7 (production stable)
```

### 6.2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      LANGGRAPH                               │
│                                                              │
│  USER DEFINES:                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    StateGraph                         │   │
│  │                                                       │   │
│  │   ┌─────────┐    ┌──────────┐    ┌─────────────┐    │   │
│  │   │ START   │───►│ plan     │───►│ conditional  │    │   │
│  │   │         │    │ (node)   │    │ router       │    │   │
│  │   └─────────┘    └──────────┘    └──┬──────┬────┘    │   │
│  │                                     │      │         │   │
│  │                              ┌──────┘      └──────┐  │   │
│  │                              ▼                    ▼  │   │
│  │                        ┌──────────┐        ┌────────┐│   │
│  │                        │ execute  │        │ review ││   │
│  │                        │ (node)   │        │ (node) ││   │
│  │                        └────┬─────┘        └───┬────┘│   │
│  │                             │                  │     │   │
│  │                             └────────┬─────────┘     │   │
│  │                                      ▼               │   │
│  │                               ┌────────────┐        │   │
│  │                               │    END     │        │   │
│  │                               └────────────┘        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  EXECUTION ENGINE:                                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Pregel Algorithm (inspired by Google Pregel)         │   │
│  │                                                       │   │
│  │  ┌──────────┐  ┌───────────┐  ┌──────────────────┐  │   │
│  │  │ Channels │  │ Checkpoint│  │ State Snapshots   │  │   │
│  │  │          │  │ Saver     │  │ (time-travel)     │  │   │
│  │  │ LastValue│  │           │  │                    │  │   │
│  │  │ Topic    │  │ InMemory  │  │ get_state()       │  │   │
│  │  │ BinOp    │  │ SQLite    │  │ get_state_history()│ │   │
│  │  │ Ephemeral│  │ Postgres  │  │ replay from any   │  │   │
│  │  └──────────┘  └───────────┘  │ checkpoint        │  │   │
│  │                                └──────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ADVANCED PATTERNS:                                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Send()      → Map-reduce (parallel fan-out)          │   │
│  │  Command()   → goto, update, resume (control flow)    │   │
│  │  Interrupt() → Human-in-the-loop pause/modify/resume  │   │
│  │  Subgraphs   → Nested graph composition               │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 Goose vs LangGraph Execution Model

```
GOOSE (Linear Conversation):          LANGGRAPH (State Machine):
─────────────────────────────          ────────────────────────────

User: "Build feature X"               User: "Build feature X"
  │                                      │
  ▼                                      ▼
Agent thinks...                        ┌─────────┐
  │                                    │  PLAN   │ ◄── checkpoint saved
  ▼                                    └────┬────┘
Agent calls tool                            │
  │                                    ┌────▼────┐
  ▼                                    │ EXECUTE │ ◄── checkpoint saved
Agent calls tool                       └────┬────┘
  │                                         │
  ▼                                    ┌────▼────┐
Agent calls tool                       │  TEST   │ ◄── checkpoint saved
  │                                    └────┬────┘
  ▼                                         │
"Done!"                                ┌────▼────┐
                                       │ REVIEW  │ ◄── human can inspect
                                       └────┬────┘     modify state, and
                                            │          resume
Problems:                              ┌────▼────┐
 - No checkpoints                      │ COMMIT  │
 - Can't resume from crash             └─────────┘
 - Can't pause for human review
 - Can't rewind and replay            Benefits:
 - Linear only (no branching)          - Durable (survives crashes)
                                        - Human-in-the-loop at any step
                                        - Time-travel debugging
                                        - Parallel execution (Send)
                                        - Branching and conditionals
```

### 6.4 Key Metrics

| Metric | Value |
|--------|-------|
| Execution model | Graph/state machine (Pregel algorithm) |
| Checkpointing | InMemory, SQLite, PostgreSQL |
| Stream modes | 7 (values, updates, checkpoints, tasks, debug, messages, custom) |
| State channels | 7 types (LastValue, Topic, BinOp, Ephemeral, AnyValue, etc.) |
| Human-in-the-loop | Interrupt/modify/resume at any node |
| Parallelism | Send() for map-reduce patterns |
| Composition | Subgraph nesting |
| Version | 1.0.7 (production stable) |

---

## 7. Tool #4: OPENHANDS — Sandboxed AI Engineer

### 7.1 Identity

```
 Name:      OpenHands (AI-driven software development)
 Language:  Python (148,120 LOC, 460 files) + TypeScript frontend
 Creator:   Community project
 License:   MIT (core), source-available (enterprise)
 Location:  G:\goose\external\OpenHands\
```

### 7.2 Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        OPENHANDS                                  │
│                                                                   │
│  AGENT TYPES:                                                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │  │
│  │  │ CodeAct  │  │ Browsing │  │ ReadOnly │  │ Visual   │ │  │
│  │  │ Agent    │  │ Agent    │  │ Agent    │  │ Browsing │ │  │
│  │  │ (primary)│  │ (web)    │  │ (safe)   │  │ Agent    │ │  │
│  │  └────┬─────┘  └────┬─────┘  └──────────┘  └──────────┘ │  │
│  │       │              │                                     │  │
│  │       │     Multi-Agent Delegation                         │  │
│  │       │     (hierarchical, shared iteration counter)       │  │
│  │       │              │                                     │  │
│  └───────┼──────────────┼─────────────────────────────────────┘  │
│          │              │                                         │
│  RUNTIME LAYER:                                                   │
│  ┌───────┼──────────────┼─────────────────────────────────────┐  │
│  │       ▼              ▼                                      │  │
│  │  ┌──────────────────────────────┐                          │  │
│  │  │  SANDBOXED EXECUTION         │                          │  │
│  │  │                              │                          │  │
│  │  │  ┌──────────┐ ┌──────────┐  │  ┌──────────────────┐   │  │
│  │  │  │  Docker  │ │ Kubern-  │  │  │  Local Runtime   │   │  │
│  │  │  │Container │ │ etes Pod │  │  │  (no isolation)  │   │  │
│  │  │  │(default) │ │ (scale)  │  │  │  dev only        │   │  │
│  │  │  └──────────┘ └──────────┘  │  └──────────────────┘   │  │
│  │  │                              │                          │  │
│  │  │  Code runs INSIDE container  │                          │  │
│  │  │  Host machine is PROTECTED   │                          │  │
│  │  └──────────────────────────────┘                          │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  SECURITY LAYER:                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  ┌────────────┐  ┌────────────────┐  ┌─────────────────┐ │  │
│  │  │ Neural     │  │ Policy-based   │  │ LLM-based       │ │  │
│  │  │ Network    │  │ Invariant      │  │ Threat          │ │  │
│  │  │ Analyzer   │  │ Checking       │  │ Detection       │ │  │
│  │  └────────────┘  └────────────────┘  └─────────────────┘ │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 7.3 Goose vs OpenHands: Execution Safety

```
GOOSE (Direct Host Execution):        OPENHANDS (Sandboxed):
──────────────────────────────         ──────────────────────────

  Agent                                  Agent
    │                                      │
    │ "rm -rf /important"                  │ "rm -rf /important"
    │                                      │
    ▼                                      ▼
  ┌──────────────────┐               ┌──────────────────┐
  │  YOUR MACHINE    │               │  Docker Container │
  │                  │               │  (disposable)     │
  │  /important/     │               │                   │
  │  ██ DELETED ██   │               │  /important/      │
  │                  │               │  ██ DELETED ██    │
  │  YOUR DATA LOST  │               │                   │
  └──────────────────┘               │  Container dies   │
                                     │  Your data: SAFE  │
                                     └──────────────────┘
```

### 7.4 Key Metrics

| Metric | Value |
|--------|-------|
| Codebase | 148,120 LOC Python + 6.1 MB TypeScript |
| Agent types | 6 specialized (CodeAct, Browsing, ReadOnly, Visual, SDK-based) |
| Runtimes | Docker, Kubernetes, local, remote, Modal cloud |
| Security | Neural + policy + LLM analyzers (3 layers) |
| Browser | Built-in Playwright automation |
| Delegation | Hierarchical multi-agent with shared iteration |
| LLM support | GPT-5, Claude Opus 4, Gemini 2.5, Qwen, DeepSeek (via LiteLLM) |
| MCP support | Yes (Model Context Protocol) |

---

## 8. Tool #5: PRAISONAI — Multi-Agent Framework

### 8.1 Identity

```
 Name:      PraisonAI (multi-agent AI framework)
 Language:  Python (345 files, 5.3 MB core)
 Creator:   PraisonAI team
 License:   MIT
 Location:  G:\goose\external\PraisonAI\
 Speed:     3.77us instantiation (fastest agent framework)
```

### 8.2 Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        PRAISONAI                                  │
│                                                                   │
│  AGENT LAYER:                                                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Agent Class (6,934 lines)                                 │  │
│  │                                                            │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │  │
│  │  │ Single   │ │ Auto     │ │ Reflect  │ │ Reasoning    │ │  │
│  │  │ Agent    │ │ Agent    │ │ Agent    │ │ Agent        │ │  │
│  │  │          │ │ (auto-   │ │ (self-   │ │ (chain-of-   │ │  │
│  │  │          │ │  discover│ │  correct)│ │  thought)    │ │  │
│  │  │          │ │  roles)  │ │          │ │              │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │  │
│  │                                                            │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │  │
│  │  │ Data     │ │ Finance  │ │ Vision   │ │ Multi-       │ │  │
│  │  │ Analyst  │ │ Agent    │ │ Agent    │ │ Modal Agent  │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  WORKFLOW ENGINE (4,455 lines):                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐            │  │
│  │  │ route()  │    │parallel()│    │  loop()  │            │  │
│  │  │ (smart   │    │ (fan-out │    │ (iterate │            │  │
│  │  │  routing)│    │  fan-in) │    │  CSV/    │            │  │
│  │  │          │    │          │    │  lists)  │            │  │
│  │  └──────────┘    └──────────┘    └──────────┘            │  │
│  │                                                            │  │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐            │  │
│  │  │ repeat() │    │ branch() │    │ check-   │            │  │
│  │  │ (eval-   │    │ (condit- │    │ point()  │            │  │
│  │  │  optimize│    │  ional)  │    │ (save/   │            │  │
│  │  │  loop)   │    │          │    │  resume) │            │  │
│  │  └──────────┘    └──────────┘    └──────────┘            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  KNOWLEDGE + MEMORY:                                              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │  │
│  │  │ RAG      │  │ Memory   │  │ Fast     │  │ MCP      │ │  │
│  │  │ Pipeline │  │ (File,   │  │ Context  │  │ Support  │ │  │
│  │  │ (chunk/  │  │  SQLite, │  │ (index/  │  │ (WS/SSE/ │ │  │
│  │  │  index/  │  │  Chroma, │  │  search) │  │  HTTP/   │ │  │
│  │  │  rerank) │  │  Mem0,   │  │          │  │  stdio)  │ │  │
│  │  │          │  │  MongoDB)│  │          │  │          │ │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  100+ BUILT-IN TOOLS:                                             │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Web Search, File I/O, Data Analysis, Image Gen, OCR,     │  │
│  │  Video Processing, Camera, Audio, Calculator, ...          │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 8.3 Goose vs PraisonAI: Agent Creation

```
GOOSE (Manual Setup):                  PRAISONAI (Auto-Agents):
─────────────────────                  ──────────────────────────

1. Edit config YAML                    1. Tell it your goal:
2. Define extension                       "Build a REST API with
3. Register MCP server                    tests and documentation"
4. Configure permissions
5. Restart goose                       2. PraisonAI auto-creates:
6. Hope it works                          ┌─────────────────┐
                                          │ Architect Agent  │
Manual, error-prone,                      │ (designs API)    │
requires Rust knowledge                   ├─────────────────┤
                                          │ Developer Agent  │
                                          │ (writes code)    │
                                          ├─────────────────┤
                                          │ Tester Agent     │
                                          │ (writes tests)   │
                                          ├─────────────────┤
                                          │ Documenter Agent │
                                          │ (writes docs)    │
                                          └─────────────────┘

                                       3. Agents coordinate
                                          automatically via
                                          hierarchical process
```

### 8.4 Key Metrics

| Metric | Value |
|--------|-------|
| Agent instantiation | 3.77 microseconds (fastest) |
| Agent types | 12+ specialized (auto, reflect, reasoning, data, finance, vision...) |
| Workflow primitives | route, parallel, loop, repeat, branch, checkpoint |
| Memory backends | 5 (File, SQLite, ChromaDB, Mem0, MongoDB) |
| Built-in tools | 100+ |
| MCP transports | 4 (WebSocket, SSE, HTTP, stdio) |
| RAG pipeline | Full (chunk, index, retrieve, rerank, compress) |
| Planning | Read-only codebase analysis mode |

---

## 9. Tool #6: PYDANTIC-AI — Type-Safe Agents

### 9.1 Identity

```
 Name:      Pydantic-AI (type-safe GenAI agent framework)
 Language:  Python (51,921 LOC, 183 files)
 Creator:   Pydantic team (Samuel Colvin et al.)
 License:   MIT
 Location:  G:\goose\external\pydantic-ai\
 Status:    Production/Stable
```

### 9.2 Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      PYDANTIC-AI                                  │
│                                                                   │
│  AGENT SYSTEM:                                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Agent[DepsT, OutputT]                                     │  │
│  │  (Generic type parameters for safety)                      │  │
│  │                                                            │  │
│  │  DepsT = Your dependency type (DB, API clients, etc.)      │  │
│  │  OutputT = Validated output type (Pydantic model)          │  │
│  │                                                            │  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │  RunContext[DepsT]                                  │   │  │
│  │  │  Provides: deps, model, usage, retry_count         │   │  │
│  │  │  Injected into every tool call automatically        │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  STRUCTURED OUTPUT (5 modes):                                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                  │  │
│  │  │ Tool     │ │ Native   │ │ Prompted │                  │  │
│  │  │ Output   │ │ Output   │ │ Output   │                  │  │
│  │  │          │ │          │ │          │                  │  │
│  │  │ LLM calls│ │ Model's  │ │ Instruct │                  │  │
│  │  │ a tool   │ │ native   │ │ model to │                  │  │
│  │  │ that     │ │ JSON     │ │ return   │                  │  │
│  │  │ returns  │ │ output   │ │ JSON     │                  │  │
│  │  │ typed    │ │ API      │ │ format   │                  │  │
│  │  │ data     │ │          │ │          │                  │  │
│  │  └──────────┘ └──────────┘ └──────────┘                  │  │
│  │                                                            │  │
│  │  ┌──────────┐ ┌──────────────┐                            │  │
│  │  │ Text     │ │ Structured   │                            │  │
│  │  │ Output   │ │ Dict         │                            │  │
│  │  │          │ │              │                            │  │
│  │  │ Process  │ │ JSON schema  │                            │  │
│  │  │ plain    │ │ validated    │                            │  │
│  │  │ text via │ │ dict output  │                            │  │
│  │  │ function │ │              │                            │  │
│  │  └──────────┘ └──────────────┘                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  TOOL SYSTEM:                                                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  @agent.tool decorator                                     │  │
│  │  Auto JSON schema from docstrings (Google/Numpy/Sphinx)    │  │
│  │  Type-safe parameter validation via Pydantic               │  │
│  │  Human-in-the-loop approval for sensitive tools            │  │
│  │  Parallel execution support                                │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  OBSERVABILITY:                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  OpenTelemetry spans for every LLM call and tool use       │  │
│  │  Pydantic Logfire integration (real-time monitoring)        │  │
│  │  genai-prices for cost tracking per token                  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  DURABLE EXECUTION:                                               │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                │  │
│  │  │ Temporal │  │ DBOS     │  │ Prefect  │                │  │
│  │  │ Workflow │  │ Durable  │  │ Workflow │                │  │
│  │  └──────────┘  └──────────┘  └──────────┘                │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  20+ LLM PROVIDERS:                                               │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  OpenAI, Anthropic, Google, Bedrock, Mistral, Groq,        │  │
│  │  Cohere, xAI, Cerebras, HuggingFace, Azure, OpenRouter...  │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 9.3 Goose vs Pydantic-AI: Output Handling

```
GOOSE (Raw Output):                    PYDANTIC-AI (Validated Output):
────────────────────                   ──────────────────────────────

Agent asks LLM: "Extract user info"    Agent[Deps, UserInfo] asks LLM

LLM returns:                           LLM returns (via ToolOutput):
  "Name: John, Age: maybe 30?"          {
                                           "name": "John",
Goose passes this raw string back        "age": 30,      ◄── validated int
Developer must parse it themselves         "email": "..."  ◄── validated email
Hope the format doesn't change           }

No validation                          Pydantic validates:
No type safety                           name: str       ✓
No error on bad data                     age: int        ✓ (not "maybe 30")
No retry on malformed output             email: EmailStr ✓ (format checked)

                                       On validation failure:
                                         → Automatic retry with error feedback
                                         → LLM gets told exactly what was wrong
                                         → Up to N retries before failing
```

### 9.4 Key Metrics

| Metric | Value |
|--------|-------|
| Codebase | 51,921 LOC, 183 files |
| Output modes | 5 (Tool, Native, Prompted, Text, StructuredDict) |
| LLM providers | 20+ native implementations |
| Type safety | Full generic Agent[DepsT, OutputT] |
| DI system | RunContext[DepsT] injection |
| Durable execution | Temporal, DBOS, Prefect |
| Observability | OpenTelemetry + Logfire + cost tracking |
| Evaluation | pydantic-evals (stochastic function testing) |
| Graph execution | pydantic-graph (independent FSM engine) |

---

## 10. Side-by-Side Feature Matrix

### 10.1 Complete Capability Comparison

```
Feature                   GOOSE  AIDER  CONSCIOUS  LANGGRAPH  OPENHANDS  PRAISON  PYDANTIC
──────────────────────── ────── ────── ───────── ─────────── ────────── ──────── ────────
CORE CAPABILITIES
  Multi-turn chat          ✅     ✅      ✅         ✅          ✅         ✅       ✅
  Tool/function calling    ✅     ✅      ─          ✅          ✅         ✅       ✅
  Streaming responses      ✅     ✅      ✅         ✅          ✅         ✅       ✅
  MCP support              ✅     ─       ─          ─           ✅         ✅       ✅

CODE EDITING
  Basic file write         ✅     ✅      ─          ─           ✅         ✅       ─
  Surgical diff edits      ─      ✅      ─          ─           ✅         ─        ─
  26+ edit strategies      ─      ✅      ─          ─           ─          ─        ─
  Repo-wide context map    ─      ✅      ─          ─           ─          ─        ─
  Auto git commit          ─      ✅      ─          ─           ─          ─        ─
  Auto-lint + auto-fix     ─      ✅      ─          ─           ─          ─        ─

VOICE & EMOTION
  Voice input              ─      ✅      ✅         ─           ─          ─        ─
  Voice output (S2S)       ─      ─       ✅         ─           ─          ─        ─
  Emotion detection        ─      ─       ✅         ─           ─          ─        ─
  Personality system       ─      ─       ✅         ─           ─          ─        ─
  <200ms latency           ─      ─       ✅         ─           ─          ─        ─

ORCHESTRATION
  State machine exec       ~      ─       ─          ✅          ─          ✅       ✅
  Durable checkpoints      ─      ─       ─          ✅          ─          ✅       ✅
  Human-in-the-loop        ~      ─       ─          ✅          ✅         ✅       ✅
  Time-travel debug        ─      ─       ─          ✅          ─          ─        ─
  Map-reduce parallel      ─      ─       ─          ✅          ─          ✅       ─

EXECUTION SAFETY
  Host-direct execution    ✅     ✅      ✅         ─           ─          ✅       ─
  Docker sandbox           ─      ─       ─          ─           ✅         ─        ─
  K8s orchestration        ─      ─       ─          ─           ✅         ─        ─
  Multi-layer security     ✅     ─       ─          ─           ✅         ✅       ─

MULTI-AGENT
  Sub-agent delegation     ✅     ─       ─          ✅          ✅         ✅       ✅
  Auto-agent creation      ─      ─       ─          ─           ─          ✅       ─
  Team coordination        ✅     ─       ─          ✅          ✅         ✅       ─
  Hierarchical process     ─      ─       ─          ✅          ✅         ✅       ─

KNOWLEDGE & MEMORY
  Working memory           ✅     ─       ✅         ─           ✅         ✅       ─
  Semantic vector store    ✅     ─       ✅         ─           ─          ✅       ─
  Full RAG pipeline        ─      ─       ─          ─           ─          ✅       ─
  Cross-session memory     ~      ─       ✅         ✅          ─          ✅       ─

OUTPUT & VALIDATION
  Raw text output          ✅     ✅      ✅         ✅          ✅         ✅       ✅
  Structured JSON          ✅     ─       ─          ─           ─          ✅       ✅
  Pydantic validated       ─      ─       ─          ─           ─          ─        ✅
  5 output modes           ─      ─       ─          ─           ─          ─        ✅
  Auto-retry on invalid    ─      ─       ─          ─           ─          ─        ✅

LLM PROVIDERS
  Count                    40+    100+    1(local)   any*        20+        100+     20+
  Rust-native clients      ✅     ─       ─          ─           ─          ─        ─
  LiteLLM abstraction      ─      ✅      ─          ─           ✅         ✅       ─

LANGUAGE & PERFORMANCE
  Implementation           Rust   Python  Python     Python      Python     Python   Python
  Compiled binary          ✅     ─       ─          ─           ─          ─        ─
  Startup time             Fast   ~1s     ~3s        ~0.5s       ~2s        ~20ms    ~0.3s
  100% local option        ─      ─       ✅         ─           ─          ─        ─

Legend: ✅ = Full support  ~ = Partial/basic  ─ = Not supported
        * = LLM-agnostic, uses LangChain providers
```

### 10.2 Size Comparison

```
Project          LOC        Files    Language    Disk Size
─────────────── ────────── ──────── ────────── ──────────
Goose (core)     ~50,000    200+     Rust        N/A
Aider            ~20,200     80      Python      N/A
Conscious         ~8,579     38      Python      4.6 MB
LangGraph        ~15,000    248      Python      N/A
OpenHands       ~148,120    460      Python      38 MB
PraisonAI        ~14,000    345      Python      66 MB
Pydantic-AI      ~51,921    183      Python      226 MB
```

---

## 11. Integration Architecture

### 11.1 Bridge Layer Design

```
┌────────────────────────────────────────────────────────────────────────┐
│                     SUPER-GOOSE INTEGRATION BRIDGE                      │
│                                                                         │
│                        ┌──────────────────┐                            │
│                        │   goosed.exe     │                            │
│                        │   (Rust server)  │                            │
│                        │   port 7878      │                            │
│                        └────────┬─────────┘                            │
│                                 │                                       │
│                        HTTP/WebSocket                                   │
│                                 │                                       │
│                        ┌────────▼─────────┐                            │
│                        │  CONSCIOUS       │                            │
│                        │  (Python bridge) │                            │
│                        │  port 8999       │                            │
│                        └────────┬─────────┘                            │
│                                 │                                       │
│            ┌────────────────────┼────────────────────┐                  │
│            │                    │                    │                  │
│    ┌───────▼──────┐    ┌───────▼──────┐    ┌───────▼──────┐          │
│    │ Tool Registry │    │ Bridge       │    │ Bridge       │          │
│    │ (TOML config) │    │ Manager      │    │ Protocol     │          │
│    │               │    │ (lifecycle)  │    │ (messages)   │          │
│    └───────┬──────┘    └───────┬──────┘    └───────┬──────┘          │
│            │                    │                    │                  │
│   ┌────────┴──────────────────┬┴────────────────────┴───────────┐    │
│   │                           │                                  │    │
│   ▼                           ▼                                  ▼    │
│ ┌──────────┐          ┌─────────────┐                   ┌──────────┐│
│ │ AIDER    │          │ LANGGRAPH   │                   │ OPENHANDS││
│ │          │          │             │                   │          ││
│ │ edit_file│          │ run_workflow│                   │ sandbox  ││
│ │ map_repo │          │ checkpoint  │                   │ _execute ││
│ │ auto_    │          │ resume      │                   │ browse   ││
│ │ commit   │          │ inspect     │                   │          ││
│ └──────────┘          └─────────────┘                   └──────────┘│
│                                                                      │
│ ┌──────────┐          ┌─────────────┐                               │
│ │ PRAISON  │          │ PYDANTIC-AI │                               │
│ │          │          │             │                               │
│ │ create_  │          │ validate_   │                               │
│ │ agents   │          │ output      │                               │
│ │ run_     │          │ run_typed   │                               │
│ │ workflow │          │ _agent      │                               │
│ └──────────┘          └─────────────┘                               │
└──────────────────────────────────────────────────────────────────────┘
```

### 11.2 Message Flow: Voice Command to Tool Execution

```
"Hey Goose, refactor the auth module to use JWT"

  STEP 1: Voice Input (Conscious)
  ┌──────────────────────────────────┐
  │ Moshi S2S Engine                 │
  │ Audio → "refactor auth to JWT"   │
  │ Emotion: neutral (focused)       │
  │ Intent: ACTION (not chat)        │
  └────────────────┬─────────────────┘
                   │
  STEP 2: Intent Routing (Conscious)
  ┌────────────────▼─────────────────┐
  │ IntentRouter classifies:         │
  │ ACTION → GooseBridge             │
  │ POST http://localhost:7878/...   │
  └────────────────┬─────────────────┘
                   │
  STEP 3: Agent Planning (Goose Rust)
  ┌────────────────▼─────────────────┐
  │ Agent + Planner analyze request  │
  │ Determine: multi-step workflow   │
  │ Request: LangGraph orchestration │
  └────────────────┬─────────────────┘
                   │
  STEP 4: Workflow Creation (LangGraph)
  ┌────────────────▼─────────────────┐
  │ StateGraph:                      │
  │  analyze → plan → implement →    │
  │  test → review → commit          │
  │                                  │
  │ Each node checkpointed           │
  └────────────────┬─────────────────┘
                   │
  STEP 5: Code Analysis (Aider)
  ┌────────────────▼─────────────────┐
  │ Aider maps repo with tree-sitter │
  │ Identifies auth module files     │
  │ Builds context map               │
  └────────────────┬─────────────────┘
                   │
  STEP 6: Code Execution (OpenHands)
  ┌────────────────▼─────────────────┐
  │ Docker sandbox created           │
  │ Aider edit strategies applied    │
  │ Code changes in isolation        │
  │ Tests run inside container       │
  └────────────────┬─────────────────┘
                   │
  STEP 7: Output Validation (Pydantic-AI)
  ┌────────────────▼─────────────────┐
  │ Validate: RefactorResult         │
  │  files_changed: list[str] ✓      │
  │  tests_passed: bool ✓            │
  │  breaking_changes: list[str] ✓   │
  └────────────────┬─────────────────┘
                   │
  STEP 8: Voice Response (Conscious)
  ┌────────────────▼─────────────────┐
  │ ResultSpeaker converts to speech │
  │ "I've refactored the auth module │
  │  to use JWT. 4 files changed,    │
  │  all 12 tests passing. Want me   │
  │  to commit?"                     │
  └──────────────────────────────────┘
```

---

## 12. Data Flow Diagrams

### 12.1 Current Block Goose Data Flow (Without External Tools)

```
  User (text only)
     │
     ▼
  ┌──────────┐     ┌───────────┐     ┌───────────┐
  │ goose    │────►│ Provider  │────►│ LLM API   │
  │ CLI      │     │ Router    │     │ (Claude,   │
  │          │◄────│           │◄────│  GPT, etc.)│
  └──────────┘     └───────────┘     └───────────┘
     │
     ▼
  ┌──────────┐     ┌───────────┐
  │ MCP      │────►│ Tool      │
  │ Gateway  │     │ (bash,    │
  │          │◄────│  file,    │
  └──────────┘     │  etc.)    │
                   └───────────┘
     │
     ▼
  Response (text only)
```

### 12.2 Super-Goose Data Flow (With All External Tools)

```
  User (voice OR text)
     │
     ├──── text ────────────────────────────────────┐
     │                                               │
     └──── voice ───┐                               │
                    ▼                               │
              ┌──────────┐                          │
              │CONSCIOUS │                          │
              │ Moshi    │                          │
              │ Emotion  │                          │
              │ Intent   │                          │
              └────┬─────┘                          │
                   │ (classified as ACTION)          │
                   ▼                                ▼
              ┌─────────────────────────────────────────┐
              │           GOOSE CORE (Rust)              │
              │                                          │
              │  ┌──────────┐  ┌────────────┐           │
              │  │ Agent    │  │ Provider   │           │
              │  │ Engine   │  │ Router     │──► LLM    │
              │  │          │  │ (40+)      │           │
              │  └────┬─────┘  └────────────┘           │
              │       │                                  │
              │       │ needs code edit?                 │
              │       ├──────────────────► AIDER         │
              │       │                   (26 strategies)│
              │       │                                  │
              │       │ needs workflow?                   │
              │       ├──────────────────► LANGGRAPH     │
              │       │                   (state machine)│
              │       │                                  │
              │       │ needs safe exec?                 │
              │       ├──────────────────► OPENHANDS     │
              │       │                   (Docker)       │
              │       │                                  │
              │       │ needs multi-agent?               │
              │       ├──────────────────► PRAISONAI     │
              │       │                   (auto-agents)  │
              │       │                                  │
              │       │ needs validated output?          │
              │       └──────────────────► PYDANTIC-AI   │
              │                           (type-safe)    │
              └─────────────────────────────────────────┘
                   │
                   ▼
              ┌──────────┐
              │CONSCIOUS │
              │ Result   │
              │ Speaker  │──► Voice output
              └──────────┘
```

---

## 13. What Each Tool Adds That Goose Lacks

### Summary Table

| # | Tool | Primary Gap Filled | Goose Without It | Goose With It |
|---|------|--------------------|------------------|---------------|
| 1 | **Aider** | Code editing intelligence | Overwrites entire files blindly | Surgical edits with 26 strategies, repo awareness, auto-commit |
| 2 | **Conscious** | Voice + emotion + personality | Text-only, no emotion awareness | Full voice I/O, mood adaptation, 13 personalities, IoT control |
| 3 | **LangGraph** | Workflow orchestration | Linear conversations, no checkpoints | State machine execution, durable checkpoints, time-travel debug |
| 4 | **OpenHands** | Sandboxed execution | Commands run on YOUR machine | Docker/K8s isolation, disposable environments, 3-layer security |
| 5 | **PraisonAI** | Multi-agent automation | Manual extension setup | Auto-agent creation, workflow engine, 100+ tools, full RAG |
| 6 | **Pydantic-AI** | Output validation | Raw unvalidated text/JSON | Type-safe validated output, 5 modes, auto-retry, DI system |

---

## 14. Integration Roadmap

### Phase 1: Foundation (Current)
- [x] Clone all 6 projects to `G:\goose\external\`
- [x] Analyze architectures and capabilities
- [x] Document integration points
- [x] Create this architecture document
- [ ] Create `external/conscious/config/external_tools.toml` registry

### Phase 2: Conscious Bridge (Next)
- [ ] Implement GooseBridge HTTP client (Conscious → goosed)
- [ ] Implement IntentRouter (voice → CHAT or ACTION classification)
- [ ] Implement ResultSpeaker (tool results → speech)
- [ ] Test voice command → goose tool execution flow

### Phase 3: Code Editing (Aider)
- [ ] Create Aider MCP server wrapper
- [ ] Expose Aider edit strategies as Goose tools
- [ ] Integrate RepoMap for context-aware editing
- [ ] Test: voice command → Aider edit → git commit

### Phase 4: Workflow Engine (LangGraph)
- [ ] Create LangGraph bridge for multi-step workflows
- [ ] Implement checkpoint/resume for Goose sessions
- [ ] Add human-in-the-loop at workflow nodes
- [ ] Test: complex task → graph workflow → checkpointed execution

### Phase 5: Safe Execution (OpenHands)
- [ ] Integrate Docker sandbox for code execution
- [ ] Route dangerous commands through OpenHands runtime
- [ ] Add security analyzer layer
- [ ] Test: untrusted code → sandbox → safe result

### Phase 6: Multi-Agent + Validation (PraisonAI + Pydantic-AI)
- [ ] Create PraisonAI auto-agent bridge
- [ ] Create Pydantic-AI output validation bridge
- [ ] Integrate RAG pipeline for knowledge queries
- [ ] Test: goal description → auto-agents → validated output

---

*This document is the single source of truth for Super-Goose external tool
integration. Updated: 2026-02-10*
