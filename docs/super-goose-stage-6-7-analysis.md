# Super-Goose: Stage 6-7 Analysis — Unified Roadmap

**Version**: 2.0 — February 2026
**Scope**: Merges ChatGPT Stage 6 proposal, Autonomous Evolution Roadmap (DSPy + Inspect AI + Mem0ᵍ), and SOTA research into a single definitive plan
**Audited Against**: Super-Goose source code (`G:\goose`), `DEFINITIVE_GAP_ANALYSIS.md`, `CONSCIOUS_FULL_AUDIT.md`, session archives

---

## Executive Summary

Two separate proposals existed for Super-Goose's evolution beyond Stage 5:

1. **ChatGPT's Stage 6** ("Governed Agentic SDLC") — focused on safety, sandboxing, supply-chain security, and observability
2. **The Autonomous Evolution Roadmap** — focused on self-optimization via DSPy prompt compilation, Inspect AI evaluation, and Mem0ᵍ graph memory

Both are directionally correct but incomplete alone. This document merges them into a unified architecture, grades what each got right, identifies remaining gaps against SOTA 2025-2026 research, and provides a concrete integration roadmap tied to Super-Goose's actual codebase.

**Current verified project state**: Stage 5.5+ (per source-code-verified `DEFINITIVE_GAP_ANALYSIS.md` — 21 components wired in hot path, Stage 6 ~65% complete)

**Three capability tiers define the real frontier**:

1. **Self-optimization** — agents that mathematically improve their own prompts and workflows (DSPy + Inspect AI closed loop)
2. **Governed execution** — hardware-isolated sandboxes with provenance, policy, and formal verification
3. **Persistent relational learning** — graph-structured memory that captures entity relationships across sessions (Mem0ᵍ)

**Adding DSPy + Inspect AI + Mem0ᵍ closes the single biggest gap** in the v1 analysis: the absence of a concrete, buildable mechanism for autonomous self-improvement. Together they form the **Metacognitive Loop** — Inspect evaluates → DSPy optimizes → Mem0ᵍ remembers → next run starts smarter.

---

## Part 1: Grading Both Proposals

### 1.1 ChatGPT's Stage 6 — Overall Grade: B

| Category | Pick | Grade | Verdict |
|---|---|---|---|
| **Structural Refactoring** | ast-grep, Comby, Semgrep | **A** | Excellent. ast-grep is Rust-native, Semgrep doubles as policy enforcement. Production-proven, self-hostable. |
| **Sandboxing** | gVisor, Firecracker/Ignite | **B+** | Good conceptually but misses agent-specific sandbox platforms (microsandbox, E2B, Arrakis). gVisor is Google's runtime, not purpose-built for agents. |
| **Supply-Chain Security** | OpenSSF Scorecard, cosign, Syft, Trivy, GuardDog | **A-** | Comprehensive. Strongest section. Only missing in-toto (supply chain attestation) and SLSA compliance. |
| **Agent Testing** | SWE-bench Verified, Inspect AI | **B+** | Good starting picks but now outdated. Field has exploded: SWE-EVO, AgencyBench, LoCoBench-Agent, SecureAgentBench. |
| **Observability** | Langfuse only | **C+** | Severely under-scoped. One tool is not an observability strategy. Missing OTel, Logfire, cost attribution. |
| **Reproducibility** | Nix Flakes, Bazel | **B** | Correct in principle, impractical for this setup. Nix has brutal learning curve. Docker Compose + devcontainers is more practical. |
| **CI/IDE Agent Loop** | Continue | **C** | Thin. Real pattern is agents-on-PRs via GitHub Actions, not just IDE integration. |

**Strengths**: Solid operational safety. Supply-chain section is excellent.
**Fatal weakness**: Zero mention of self-evolution, formal verification, or persistent learning. Treats agents as static tools needing governance, not systems that can improve.

### 1.2 Autonomous Evolution Roadmap — Overall Grade: A-

| Category | Pick | Grade | Verdict |
|---|---|---|---|
| **Prompt Optimization** | DSPy (Stanford NLP) | **A** | Correct foundational choice. Converts static prompts into optimizable `dspy.Signature` modules. GEPA/MIPROv2 optimizers production-proven. 160K+ monthly downloads. |
| **Evaluation** | Inspect AI (UK AISI) | **A** | Correct framework for building custom eval suites. Standard in the field. |
| **Formal Verification** | CrossHair / Z3 | **B+** | Good for Python contract verification. Limited to pure-Python. Should be complemented by SAFEFLOW and Semgrep. |
| **Memory** | Mem0 / Letta | **A-** | Right direction. Should specify Mem0ᵍ (Graph mode) explicitly for relational memory. |
| **Deprecation** | Drop PraisonAI | **A** | Correct — reduces redundancy with LangGraph. See §4.4 audit. |
| **Core Stack Retention** | Keep Goose, Aider, LangGraph, OpenHands, Conscious | **A** | All verified in production. Sound decisions. |

**Strengths**: The Metacognitive Loop is the correct Stage 7 architecture. The "overnight gym" pattern is genuinely buildable.
**Weakness**: Thin on execution safety (no sandbox specifics), no supply-chain security, no observability details. Needs ChatGPT's governance layer underneath.

### 1.3 Merged Assessment

| Capability | ChatGPT Stage 6 | Evolution Roadmap | This Document (v2) |
|---|---|---|---|
| Sandboxing | gVisor/Firecracker | *(missing)* | microsandbox + Arrakis (MCP-native) |
| Supply-chain | cosign + Syft + Trivy | *(missing)* | ✅ Keep from ChatGPT |
| Observability | Langfuse only | *(implicit via DSPy)* | OTel + Langfuse + Logfire stack |
| Evaluation | SWE-bench + Inspect | Inspect AI | Inspect AI + AgencyBench + SWE-EVO |
| Prompt optimization | *(missing)* | DSPy | ✅ Keep from Roadmap — **critical addition** |
| Memory | *(missing)* | Mem0 | Mem0ᵍ (Graph) + Neo4j — **critical addition** |
| Formal verification | *(missing)* | CrossHair / Z3 | CrossHair + SAFEFLOW + AlphaVerus |
| Self-evolution | *(missing)* | DSPy + Inspect loop | DSPy → EvoAgentX → DGM progression |
| Structural editing | ast-grep + Semgrep | *(missing)* | ✅ Keep from ChatGPT |
| CI/PR agents | Continue | *(missing)* | PR-Agent + GitHub Actions |

---

## Part 2: True Stage 6 and Stage 7 Definitions (2026)

### Stage 6 = Autonomous Governed Software Evolution

A system where agents can:

1. **Plan multi-step changes** across an entire codebase (not just single files)
2. **Execute safely** in hardware-isolated microVM sandboxes with snapshot/restore
3. **Verify their own work** through automated testing, AST analysis, contract checking (CrossHair), and policy enforcement (Semgrep)
4. **Prove provenance** of every change (signed commits, SBOMs, attestations)
5. **Evaluate regression** against benchmarks via Inspect AI with replayable harnesses
6. **Observe and trace** every decision, tool call, and cost via OpenTelemetry + Langfuse
7. **Learn from failures** — incorporate feedback into future runs via Mem0ᵍ graph memory
8. **Orchestrate multiple specialized agents** with durable LangGraph checkpointing

### Stage 7 = Self-Evolving Agent Ecosystems

A system where agents can:

1. **Optimize their own prompts** mathematically via DSPy compilation against eval metrics
2. **Generate new tools** when existing ones are insufficient
3. **Evolve workflows** through EvoAgentX Monte Carlo Tree Search optimization
4. **Modify their own code** to improve performance (Darwin Gödel Machine pattern)
5. **Train/fine-tune models** on their own execution traces (DSPy BootstrapFinetune)
6. **Maintain persistent relational memory** via Mem0ᵍ knowledge graph across sessions
7. **Self-benchmark** — continuously evaluate against evolving standards (overnight gym)
8. **Discover and integrate** new capabilities autonomously

---

## Part 3: The Metacognitive Loop — Stage 7 Core Engine

This is what was entirely missing from v1 and what DSPy + Inspect AI + Mem0ᵍ provide:

```
┌──────────────────────────────────────────────────────────────────┐
│                    THE OVERNIGHT GYM                              │
│                                                                  │
│  ┌──────────────┐    ┌────────────────┐    ┌─────────────────┐   │
│  │  Inspect AI   │───▶│   DSPy          │───▶│  Mem0ᵍ (Graph)  │  │
│  │  JUDGE        │    │   OPTIMIZER     │    │  TRAJECTORY     │  │
│  │               │    │                 │    │  STORE          │  │
│  │  Scores agent │    │  GEPA/MIPROv2   │    │  Successful     │  │
│  │  output vs    │    │  compiles       │    │  paths stored   │  │
│  │  metrics      │    │  better prompts │    │  as entities +  │  │
│  │               │    │                 │    │  relationships  │  │
│  │               │    │  BootstrapFine- │    │  in Neo4j       │  │
│  │               │    │  tune for       │    │                 │  │
│  │               │    │  weight updates │    │                 │  │
│  └──────▲───────┘    └────────────────┘    └────────┬────────┘  │
│         │                                            │           │
│         │            NEXT RUN IS BETTER              │           │
│         └────────────────────────────────────────────┘           │
│                                                                  │
│  Result: Agent is measurably smarter each morning                │
└──────────────────────────────────────────────────────────────────┘
```

### How It Works in Practice

1. Every night, Super-Goose attempts 50 SWE-bench tasks in a microsandbox
2. **Inspect AI** scores each attempt (pass/fail, code quality, security, correctness)
3. **DSPy's GEPA optimizer** analyzes which prompt patterns led to success vs failure
4. DSPy compiles updated `dspy.Signature` modules with optimized instructions + few-shot demos
5. Successful trajectories (full LangGraph state histories) are stored in **Mem0ᵍ** as entity-relationship graphs
6. Next run: Mem0ᵍ retrieves relevant past trajectories → DSPy injects them as few-shot examples → agent starts smarter

### When Prompt Optimization Plateaus

DSPy's `BootstrapFinetune` distills the optimized prompts into actual model weight updates on local Qwen models using the RTX 3090 Ti (24GB VRAM handles 7B-13B models). This is the bridge from prompt-level to weight-level self-improvement.

### Component Roles and Relationships

| Component | Role | Relationship |
|---|---|---|
| **DSPy** | The Compiler/Optimizer | Takes eval scores → produces mathematically better prompts |
| **Inspect AI** | The Judge/Evaluator | Produces the scores DSPy optimizes against |
| **Mem0ᵍ** | The Memory/Experience Store | Stores successful trajectories as entity graphs. DSPy retrieves them as few-shot examples. |
| **EvoAgentX** | The Workflow Evolver | Operates ABOVE DSPy — optimizes workflow topology, uses DSPy's MIPRO internally |
| **DGM** | The Self-Modifier | Operates ABOVE EvoAgentX — modifies the agent code itself, not just prompts or workflows |

**The progression stack**: DSPy (prompt optimization) → EvoAgentX (workflow evolution) → DGM (self-code-modification). Each layer builds on the one below.

---

## Part 4: Projects to Integrate

### 4.1 The Optimization Core (NEW — goes in `G:\goose\external\`)

| Project | GitHub | Stars | What It Does | Integration Point |
|---|---|---|---|---|
| **DSPy** | `stanfordnlp/dspy` | 16K+ | Stanford NLP framework. Converts prompts to optimizable `dspy.Signature` modules. Optimizers: GEPA (reflective evolution, Jul 2025), MIPROv2 (Bayesian), SIMBA (mini-batch), BootstrapFinetune (weight updates). 250+ contributors, 160K+ monthly downloads. | Convert LangGraph node prompts to Signatures. Wire optimizer output to agent system prompts. Nightly optimization against Inspect AI metrics. |
| **Inspect AI** | `UKGovernmentBEIS/inspect_ai` | — | UK AI Safety Institute evaluation framework. Custom scorers, Docker sandbox, coding evals built-in. Becoming the standard evaluation framework. | Build custom Super-Goose eval suite (your repos as fixtures). Nightly benchmarks. Score API feeding DSPy. |
| **Mem0ᵍ** | `mem0ai/mem0` | 25K+ | Graph-enhanced vector memory. Entity extraction → Neo4j knowledge graph. Temporal conflict detection. Multi-hop traversal. 26% higher accuracy vs flat memory (LOCOMO benchmark). 14K tokens vs 600K+ for full-context. | `Mem0(enable_graph=True)` + self-hosted Neo4j. Replace MemoryManager JSON + fake hash embeddings. System-wide agent memory (not just Conscious). |

**DSPy integration pattern** — converting a static prompt to an optimizable signature:

```python
# BEFORE: Static prompt in LangGraph node
system_prompt = "You are a coding assistant. Write Python code to solve the issue."

# AFTER: DSPy Signature (optimizable)
class CodeSolver(dspy.Signature):
    """Write production-quality Python code to solve the described issue."""
    issue_description = dspy.InputField(desc="GitHub issue or task description")
    codebase_context = dspy.InputField(desc="relevant files and structure")
    code_solution = dspy.OutputField(desc="complete, tested Python code")

# Optimize against Inspect AI metrics
optimizer = dspy.MIPROv2(metric=inspect_pass_rate, num_candidates=30)
compiled_solver = optimizer.compile(CodeSolver(), trainset=swe_bench_train)
# compiled_solver now has mathematically optimized prompts
```

**Mem0ᵍ integration pattern** — graph memory for trajectory storage:

```python
from mem0 import Memory

config = {
    "graph_store": {
        "provider": "neo4j",  # Self-hosted Docker container
        "config": {
            "url": "bolt://localhost:7687",
            "username": "neo4j",
            "password": "${NEO4J_PASSWORD}"
        }
    }
}
memory = Memory.from_config(config)

# Store trajectory after successful task
memory.add([
    {"role": "system", "content": "Task: Refactor auth module"},
    {"role": "assistant", "content": "Steps: 1) analyzed deps, 2) extracted interface..."},
    {"role": "user", "content": "Result: all tests pass, 40% fewer lines"}
], user_id="super-goose", metadata={"task_type": "refactor", "success": True})

# Before similar task, retrieve relevant trajectories
results = memory.search("refactor module with dependency extraction",
                        user_id="super-goose", limit=3, rerank=True)
# Graph returns: entity relationships (File→Module→Commit) + vector-matched memories
# Inject as DSPy few-shot examples for next run
```

### 4.2 Agent-Native Sandboxing (Replace gVisor)

| Project | GitHub | What It Does | Why It Fits |
|---|---|---|---|
| **microsandbox** | `zerocore-ai/microsandbox` | Self-hosted microVM using libkrun. Sub-200ms boot. MCP-native. Apache-2.0. | **Best fit**: self-hosted, local-first, MCP integration, hardware isolation. |
| **Arrakis** | `abshkbh/arrakis` | MicroVM with snapshot-and-restore. Cloud Hypervisor backend. MCP server. | **Critical for Stage 7**: snapshot/restore enables MCTS-based agent exploration with backtracking. |
| **Agent-Sandbox** | `agent-sandbox/agent-sandbox` | E2B-compatible, Kubernetes-native, multi-tenant. MCP lifecycle. | Enterprise scaling option beyond single-machine. |
| **E2B** | `e2b-dev/e2b` | Firecracker microVM cloud. 150ms boot. Docker MCP Catalog (200+ tools). | Reference architecture. SDK patterns becoming the standard. |

**Integration path**: microsandbox → Goose agent executes code in microVM via MCP → Arrakis adds snapshot/restore for checkpoint workflows → Inspect AI runs evals inside sandbox.

### 4.3 Evaluation Harnesses (Beyond SWE-bench)

| Benchmark | Source | What It Tests | Why It Matters |
|---|---|---|---|
| **SWE-EVO** | arXiv 2512.18470 | Multi-change codebase evolution across versions | Tests real software evolution, not just single bug fixes |
| **AgencyBench** | `GAIR-NLP/AgencyBench` | 6 agentic capabilities, 138 tasks, avg 90 tool calls, 1M tokens | Most comprehensive agent benchmark (Jan 2026). Docker sandbox eval. |
| **LoCoBench-Agent** | arXiv 2511.13998 | Long-context (10K-1M tokens) interactive evaluation with 8 tools | Tests whether Super-Goose degrades over long sessions |
| **SecureAgentBench** | arXiv 2509.22097 | Secure code generation with real vulnerability scenarios | Tests agent-generated code security |
| **Agent-as-a-Judge** | `tjpxiaoming` (HF) | Agents evaluate agents with intermediate step feedback | Meta-evaluation for sub-agent quality. Feeds back into DSPy metrics. |
| **R2E-Gym** | arXiv 2504.07164 | Procedural environments + hybrid verifiers | Training/fine-tuning local models on your repos |

### 4.4 Self-Improving Frameworks (Stage 7 Progression)

These build ON TOP of DSPy. DSPy handles prompt-level; these handle workflow and code-level:

| Project | GitHub | What It Does | Relationship to DSPy |
|---|---|---|---|
| **EvoAgentX** | `EvoAgentX/EvoAgentX` | Evolves agentic workflows via MCTS. Prompt evolution via EvoPrompt. EMNLP'25 demo paper. | **Uses DSPy's MIPRO internally**. Operates at workflow topology level. |
| **Darwin Gödel Machine** | `jennyzzt/dgm` | Agent modifies own codebase. Evolutionary archive. 20% → 50% on SWE-bench. Sakana AI / UBC. | Operates above DSPy — modifies agent code, not just prompts. |
| **Agent0** | `aiming-lab/Agent0` | Self-evolving from zero data via tool-integrated reasoning. No human-curated datasets. | Bootstrap when no training data exists. |
| **Self-play SWE-RL** | Meta FAIR (arXiv 2512.18552) | RL self-play: one agent injects bugs, another fixes. +10.4 on SWE-bench Verified. | Research reference. Monitor for open weights. |
| **CURE** | `Gen-Verse/CURE` | Co-evolves coder + tester via RL. No ground-truth supervision. | Stage 6-7 bridge. Pairs naturally with Inspect AI. |
| **SEW** | arXiv 2505.18646 | Auto-generates/optimizes multi-agent workflows. +33% on LiveCodeBench. | Complements EvoAgentX at workflow design level. |
| **CoMAS** | arXiv 2510.08529 | Co-evolving multi-agent systems via interaction rewards. | Multi-agent co-evolution for ALMAS specialists. |
| **MAS-Orchestra** | arXiv 2601.14652 | MAS orchestration as RL function-calling problem. | Orchestration learning for specialist coordination. |

### 4.5 Formal Verification

| Project | Source | What It Does | Scope |
|---|---|---|---|
| **CrossHair** | `pschanely/CrossHair` | Z3-backed symbolic execution for Python contracts. Finds counterexamples automatically. | Python-only. Best for Conscious/DSPy/Mem0 Python components. |
| **AlphaVerus** | arXiv 2412.06176 | Formally verified code from LLMs via iterative translation + tree search (Treefinement). | Agent-generated code verification without human labels. |
| **SAFEFLOW** | arXiv 2506.07564 | Fine-grained information flow control. WAL, rollback, secure scheduling. Formal guarantees. | Agent-level integrity/confidentiality for autonomous actions. |
| **OS-Sentinel** | arXiv 2510.24411 | Hybrid: formal verifier + VLM contextual judge. | Catches both rule violations AND contextual risks. |
| **Semgrep** | `returntothesource/semgrep` | Policy-as-code for agent diffs. Pre-commit guardrails. | Already in ChatGPT proposal. Keep as policy enforcement layer. |

### 4.6 Observability & Tracing (Expand Beyond Langfuse)

| Tool | What It Does | Why Langfuse Alone Is Insufficient |
|---|---|---|
| **Langfuse** | Traces, evals, prompt management | Good but just one layer — keep it |
| **OpenTelemetry + Logfire** | Pydantic team's observability. Full OTel integration, cost tracking. | Native integration with pydantic-ai (already in stack) |
| **Arize Phoenix** | LLM observability: traces, evals, embedding drift detection | Catches silent behavior degradation over time |
| **Weave** (W&B) | LLM trace logging with experiment tracking | Track DSPy optimization experiments over time |

### 4.7 Persistent Memory (Upgraded to Mem0ᵍ)

| Project | What It Does | Role |
|---|---|---|
| **Mem0ᵍ (Graph)** | Entity extraction → Neo4j knowledge graph. Temporal conflict detection. Multi-hop traversal. | **Primary memory**. Replaces MemoryManager JSON + fake hash embeddings. |
| **Letta (MemGPT)** | Stateful agents with self-editing memory, built-in tool creation | Complement if deeper memory paging needed |
| **Memory-R1** | RL-trained memory management | Agents learn optimal retrieval/storage policies |
| **MemInsight** | Autonomous memory augmentation | Agents decide what's worth remembering |

**Why Mem0ᵍ over flat Mem0**: "File X depends on module Y which was refactored in commit Z" is a relationship chain, not a keyword match. Graph captures entities, labeled edges (`depends_on`, `broke_after`, `fixed_by`), temporal conflict resolution. 26% higher accuracy on LOCOMO. Self-hostable via Neo4j/Memgraph/Kuzu in Docker.

### 4.8 Agent-on-PR / CI-Native Patterns

| Project | What It Does |
|---|---|
| **PR-Agent** (`Codium-ai/pr-agent`) | AI agent on every PR: auto-review, suggestions, test generation, changelog |
| **SWE-agent** (`princeton-nlp/SWE-agent`) | Reference agent for resolving GitHub issues autonomously |
| **GitHub Actions + Goose** | Custom workflow: PR opened → agent reviews → sandbox run → comments findings |

---

## Part 5: Audit Against Actual Project State

### 5.1 Current Super-Goose Status (from `DEFINITIVE_GAP_ANALYSIS.md`, line-number verified)

**Verified Stage: 5.5+** — 21 components wired in agent hot path, Stage 6 ~65%

| Component | Status | Evidence |
|---|---|---|
| Provider call + tool dispatch | ✅ Wired | `agent.rs` main loop — every iteration |
| Shell guard (3-tier) | ✅ Wired | `dispatch_tool_call_with_guard` — SAFE/PARANOID/AUTOPILOT |
| GuardrailsEngine (6 detectors) | ✅ Wired | `agent.rs:1677-1711` — PII, jailbreak, injection, secrets, keywords, topics |
| ReasoningManager (ReAct/CoT/ToT) | ✅ Wired | `agent.rs:1773-1780` — injects mode into system prompt |
| MemoryManager (load/recall/store/persist) | ✅ Wired | `agent.rs:1713-1770, 2484-2509` — JSON disk, AtomicBool guard |
| ReflexionAgent | ✅ Wired | `agent.rs:2171-2194` — records failures, generates reflections |
| CheckpointManager (SQLite) | ✅ Wired | `agent.rs:1652-1675` — after every tool call + 10min auto-save |
| MemGPT-style continuation | ✅ Wired | `agent.rs:2231-2303` — never says "start new session" |
| Memory paging on compaction | ✅ Wired | `agent.rs:2328-2360` — paged-out context → episodic memory |
| CriticManager | ✅ Wired | `agent.rs:2466-2482` — auto-critiques on session exit |
| PlanManager + verification | ✅ Wired | `planner.rs` — deps, cycles, completeness |
| Skill library (saveSkill) | ✅ Wired | `skills_extension.rs` — Voyager-style persistence |
| Cancel tokens | ✅ Wired | `agent.rs:1755-1757` — checked every loop iteration |
| History review API | ✅ Wired | `list_checkpoints()`, `get_last_checkpoint()`, `resume_from_checkpoint()` |
| ALMAS specialist roles (5) | ✅ Built | Architect, Developer, QA, Security, Deployer — 2,363 LoC, 52+ tests |
| Coach/Player adversarial | ✅ Built | G3-style quality review — 1,290 LoC, 50+ tests |
| EvoAgentX self-evolution | ✅ Built | Memory-informed prompt optimization — 1,537 LoC, 60+ tests |
| Orchestrator REST API | ⚠️ REST-only | 4 endpoints at `/orchestrator/*` — not auto-invoked from agent loop |
| StateGraphRunner | ⚠️ Stub | `run_structured_loop()` — no-op closures, needs ~100 LoC real callbacks |
| SemanticStore embeddings | ❌ Fake | Hash-based, not real vectors — **Mem0ᵍ replaces this** |
| RAG pipeline | ❌ Missing | No vector DB — **Mem0ᵍ + Qdrant replaces this** |
| LATS / MCTS | ❌ Missing | No implementation — Arrakis snapshot/restore enables infrastructure |

### 5.2 Conscious Voice Integration Status (from `CONSCIOUS_FULL_AUDIT.md`)

| Component | Status | LoC | Notes |
|---|---|---|---|
| MoshiAgent (WebSocket) | ✅ Real | 427 | Full WS client, opus codec, latency monitoring, auto-reconnect |
| MoshiServerManager | ✅ Real | ~300 | Server lifecycle, VRAM check, health polling, crash recovery |
| MoshiAgentAPI (REST+WS) | ✅ Real | ~570 | 12 endpoints: 7 voice + 3 agentic + 2 emotion |
| IntentRouter | ✅ Real | ~175 | Token accumulation, 20 regex patterns, debounce |
| GooseBridge | ✅ Real | ~280 | HTTP client → goosed SSE API, circuit breaker |
| ResultSpeaker | ✅ Real | ~150 | Markdown stripping, number humanization, truncation |
| ActionQueue | ✅ Real | ~180 | Async queue, serial execution, detail extraction |
| EmotionDetector (Wav2Vec2) | ✅ Real | ~270 | GPU inference, lazy loading |
| EmotionTracker | ✅ Real | ~170 | Sliding window mood tracking, trend analysis |
| EmotionResponder | ✅ Real | ~210 | Emotion → response modulation, break detection |
| MemorySystem | ❌ Stub | 0 | Docstring only — **Mem0ᵍ fills this gap** |
| PersonalityEngine | ❌ Stub | 0 | Docstring only — separate implementation needed |

### 5.3 Gap Analysis: What Stage 6-7 Requires vs What Exists

| Requirement | Current State | Solution | Priority |
|---|---|---|---|
| **Prompt optimization** | Static prompts in agent.rs | **DSPy**: convert to `dspy.Signature`, wire GEPA optimizer | **P1** — biggest impact |
| **Evaluation harness** | No automated eval pipeline | **Inspect AI** + custom eval suite + SWE-bench baselines | **P1** — required for DSPy |
| **Graph memory** | MemoryManager JSON + fake hash embeddings | **Mem0ᵍ** + Neo4j + Qdrant in Docker Compose | **P1** — replaces 2 broken components |
| **Agent sandbox** | OpenHands sandbox (partial) | **microsandbox** (MCP-native microVM) + Arrakis (snapshot/restore) | **P2** |
| **Supply-chain** | None | cosign + Syft + Trivy + OpenSSF Scorecard | **P4** |
| **Observability** | Basic logging only | OTel + Langfuse + Logfire stack | **P3** |
| **Formal verification** | None | CrossHair (Python) + Semgrep (policy-as-code) | **P5** |
| **Self-evolution wiring** | EvoAgentX module exists (1,537 LoC) but uses basic prompt tweaking | Wire **DSPy as engine** underneath existing EvoAgentX code | **P1** — leverage existing work |
| **Conscious memory stub** | Empty `memory/__init__.py` | Wire to shared **Mem0ᵍ** instance → voice sessions inform coding sessions | **P1** |
| **PR-agent pattern** | None | PR-Agent + GitHub Actions | **P3** |
| **Real vector embeddings** | Hash-based in SemanticStore | **Mem0ᵍ** Qdrant backend provides real embeddings | **P1** |
| **Structured code→test→fix** | StateGraphRunner stub callbacks | Wire real shell callbacks (~100 LoC) | **P2** |

### 5.4 PraisonAI Deprecation Assessment

The Roadmap recommends dropping PraisonAI. **Agree with deprecation.**

Reasoning:
- PraisonAI's auto-generating agent teams overlaps with LangGraph + DSPy
- Super-Goose already has ALMAS specialists (5 agents) + Coach/Player + TeamCoordinator (5,190 LoC total)
- DSPy optimizes the prompts PraisonAI would auto-generate, making its approach redundant
- Adding PraisonAI creates competing orchestration with LangGraph

**Action**: Remove from `external/`. Redirect workflow generation to LangGraph + DSPy.

---

## Part 6: Integration Roadmap

### Stage 6 Minimum Viable (Build First)

```
Priority 1: THE OPTIMIZATION CORE  ← New from this analysis
  ├── DSPy (external/dspy/)
  │   ├── Convert top-5 most-used LangGraph node prompts to dspy.Signature
  │   ├── Wire GEPA optimizer with Inspect AI metrics
  │   ├── Nightly optimization run against SWE-bench Lite (50 tasks)
  │   └── Connect to existing EvoAgentX module (1,537 LoC already built)
  ├── Inspect AI (external/inspect/)
  │   ├── Build custom Super-Goose eval suite (your repos as test fixtures)
  │   ├── SWE-bench Verified baseline + AgencyBench comprehensive
  │   └── Score API feeding DSPy optimizer
  └── Mem0ᵍ (external/mem0/)
      ├── Docker Compose: Neo4j + Qdrant + Mem0
      ├── Replace MemoryManager JSON with Mem0ᵍ backend in agent.rs
      ├── Replace SemanticStore fake hash embeddings with Qdrant real vectors
      ├── Wire Conscious memory stub to shared Mem0ᵍ instance
      └── voice sessions + coding sessions share one memory graph

Priority 2: SANDBOX RUNTIME
  ├── microsandbox (MCP-native, self-hosted microVM)
  ├── Arrakis (snapshot/restore for LangGraph checkpointing)
  └── Integration: Goose agent → MCP → microsandbox → execute → return

Priority 3: OBSERVABILITY
  ├── OpenTelemetry spans on every tool call
  ├── Langfuse for trace visualization
  ├── Logfire for pydantic-ai native integration
  └── Cost attribution per agent/session/tool

Priority 4: SUPPLY-CHAIN & PROVENANCE
  ├── cosign (artifact signing)
  ├── Syft (SBOM generation)
  ├── Trivy (vulnerability scanning)
  └── OpenSSF Scorecard (repo health)

Priority 5: STRUCTURAL EDITING + VERIFICATION
  ├── ast-grep (Rust-native, fast structural search/replace)
  ├── Semgrep (policy guardrails on agent diffs)
  ├── CrossHair (Python contract verification)
  └── Pipeline: agent diff → ast-grep validates → Semgrep checks policy → merge
```

### Stage 7 Progression (After Stage 6 Solid)

```
Phase A: OVERNIGHT GYM  ← First Stage 7 win
  ├── Nightly: Super-Goose attempts SWE-bench tasks in microsandbox
  ├── Inspect AI scores → DSPy GEPA optimizes → Mem0ᵍ stores trajectories
  ├── Morning: agent starts with mathematically better prompts
  └── Metric: track solve rate improvement week-over-week

Phase B: WORKFLOW EVOLUTION
  ├── Wire existing EvoAgentX (1,537 LoC) to DSPy backend
  ├── MCTS-based workflow topology optimization via Arrakis snapshots
  ├── A/B testing of agent strategies with Inspect AI scoring
  └── SEW for auto-generated multi-agent flows

Phase C: WEIGHT OPTIMIZATION (when prompt optimization plateaus)
  ├── DSPy BootstrapFinetune: distill optimized prompts into weight updates
  ├── Fine-tune local Qwen models on RTX 3090 Ti (24GB VRAM)
  ├── Track with Weave experiment tracking
  └── Result: local models encode Super-Goose's learned expertise

Phase D: SELF-MODIFICATION
  ├── Darwin Gödel Machine pattern (agent modifies own tool configs)
  ├── Evolutionary archive of agent variants
  ├── CURE co-evolution (coder + tester improve together)
  └── Guard: all self-modifications through Inspect AI eval before deploy

Phase E: PERSISTENT EXPERTISE
  ├── Mem0ᵍ accumulates entity-relationship knowledge across all sessions
  ├── Memory-R1 (RL-optimized retrieval policies)
  ├── Cross-session skill transfer: voice informs coding and vice versa
  └── Agent learns which memory strategies work best per task type
```

---

## Part 7: Hardware Compatibility

RTX 3090 Ti (24GB) + RTX 3060 Ti (12GB) + 128GB RAM + 4TB NVMe + optional Tesla P40s (72GB total):

| Component | Local? | GPU? | Notes |
|---|---|---|---|
| **DSPy** | ✅ | Optional | Python. Calls LLM APIs or local models. |
| **Inspect AI** | ✅ | Optional | Python. GPU helps with local model scoring. |
| **Mem0ᵍ + Neo4j + Qdrant** | ✅ Docker | None | ~2GB RAM. Self-hosted. |
| **microsandbox** | ✅ CPU | None | Needs Linux/WSL2 + KVM |
| **Arrakis** | ✅ CPU | None | cloud-hypervisor backend |
| **ast-grep** | ✅ | None | Rust binary, blazing fast |
| **Semgrep** | ✅ | None | Python, rules-based |
| **CrossHair** | ✅ | None | Python + Z3 solver |
| **Langfuse** | ✅ Docker | None | Self-hosted Docker Compose |
| **EvoAgentX** | ✅ | GPU helps | Needs LLM backend |
| **DSPy BootstrapFinetune** | ✅ | **RTX 3090 Ti** | Fine-tunes 7B-13B models. 24GB VRAM. |
| **DGM** | ⚠️ Partial | Strong LLM | Needs GPT-4/Claude API |
| **Self-play SWE-RL** | ❌ Research | Massive compute | Meta FAIR. Monitor for open weights. |

**Docker Compose addition for Mem0ᵍ stack**:

```yaml
services:
  neo4j:
    image: neo4j:5-community
    ports: ["7474:7474", "7687:7687"]
    environment:
      NEO4J_AUTH: neo4j/${NEO4J_PASSWORD}
    volumes:
      - neo4j_data:/data
  qdrant:
    image: qdrant/qdrant:latest
    ports: ["6333:6333"]
    volumes:
      - qdrant_data:/qdrant/storage
volumes:
  neo4j_data:
  qdrant_data:
```

---

## Part 8: Revised Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         SUPER-GOOSE (Stage 6-7)                              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │              STAGE 7: SELF-EVOLUTION LAYER                              │ │
│  │                                                                         │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │ │
│  │  │           METACOGNITIVE LOOP (Overnight Gym)                    │    │ │
│  │  │  Inspect AI ──▶ DSPy Optimizer ──▶ Mem0ᵍ Trajectory Store      │    │ │
│  │  │  (scores)       (GEPA/MIPROv2)     (Neo4j graph memory)        │    │ │
│  │  │       ▲                                       │                │    │ │
│  │  │       └───────── next run uses ◀──────────────┘                │    │ │
│  │  └─────────────────────────────────────────────────────────────────┘    │ │
│  │                                                                         │ │
│  │  EvoAgentX (workflow evolution)  │  DGM (self-code-modification)        │ │
│  │  DSPy BootstrapFinetune (weight) │  Agent-as-a-Judge (meta-eval)       │ │
│  └────────────────────────────────┬────────────────────────────────────────┘ │
│                                   │                                          │
│  ┌────────────────────────────────┴────────────────────────────────────────┐ │
│  │              STAGE 6: GOVERNANCE LAYER                                  │ │
│  │                                                                         │ │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  ┌───────────────┐  │ │
│  │  │ Observability│  │  Provenance  │  │  Policy    │  │  Evaluation   │  │ │
│  │  │ OTel+Langfuse│  │ cosign+Syft  │  │ Semgrep   │  │ Inspect AI +  │  │ │
│  │  │ Logfire      │  │ Trivy+SBOM   │  │ Scorecard │  │ AgencyBench + │  │ │
│  │  │ Phoenix      │  │              │  │ CrossHair │  │ SWE-EVO       │  │ │
│  │  └─────────────┘  └──────────────┘  └────────────┘  └───────────────┘  │ │
│  └────────────────────────────────┬────────────────────────────────────────┘ │
│                                   │                                          │
│  ┌────────────────────────────────┴────────────────────────────────────────┐ │
│  │              EXECUTION & SAFETY LAYER                                   │ │
│  │                                                                         │ │
│  │  ┌───────────────────┐    ┌────────────────────┐   ┌──────────────┐    │ │
│  │  │  microsandbox      │    │  Arrakis            │   │ AST Layer    │    │ │
│  │  │  (microVM runtime) │    │  (snapshot/restore) │   │ ast-grep     │    │ │
│  │  │  MCP-native        │    │  MCTS backtracking  │   │ tree-sitter  │    │ │
│  │  └───────────────────┘    └────────────────────┘   └──────────────┘    │ │
│  └────────────────────────────────┬────────────────────────────────────────┘ │
│                                   │                                          │
│  ┌────────────────────────────────┴────────────────────────────────────────┐ │
│  │              CORE AGENT LAYER (Existing — Verified Stage 5.5+)          │ │
│  │                                                                         │ │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐             │ │
│  │  │  GOOSE   │  │ CONSCIOUS│  │  AIDER     │  │ LANGGRAPH │             │ │
│  │  │  (Rust)  │  │ (Voice)  │  │ (Editing)  │  │ (Orchestr)│             │ │
│  │  │  21 wired│  │ 10 real  │  │            │  │           │             │ │
│  │  │  modules │  │ modules  │  │            │  │           │             │ │
│  │  └──────────┘  └──────────┘  └───────────┘  └───────────┘             │ │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────┐                            │ │
│  │  │ OPENHANDS│  │PYDANTIC- │  │   DSPy    │  ← NEW                    │ │
│  │  │ (Sandbox)│  │AI (Types)│  │(Optimizer)│                            │ │
│  │  └──────────┘  └──────────┘  └───────────┘                            │ │
│  └────────────────────────────────┬────────────────────────────────────────┘ │
│                                   │                                          │
│  ┌────────────────────────────────┴────────────────────────────────────────┐ │
│  │              MEMORY & LEARNING LAYER                                    │ │
│  │                                                                         │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │ │
│  │  │  Mem0ᵍ (Graph Memory)  ← NEW                                   │   │ │
│  │  │  Entity extraction → Neo4j knowledge graph                      │   │ │
│  │  │  Vector embeddings → Qdrant                                     │   │ │
│  │  │  Temporal conflict detection + multi-hop traversal              │   │ │
│  │  │  Replaces: MemoryManager JSON + SemanticStore hash embeddings   │   │ │
│  │  │  Shared: voice sessions + coding sessions + eval trajectories   │   │ │
│  │  └──────────────────────────────────────────────────────────────────┘   │ │
│  │  Memory-R1 (RL retrieval) │ Letta (stateful paging, if needed)        │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 9: Key Research Papers

| Paper | Date | Key Insight | Relevance |
|---|---|---|---|
| **DSPy: Compiling Declarative LM Calls** — Stanford NLP | Oct 2023+ | Foundation for all prompt optimization | Stage 7 core engine |
| **GEPA: Reflective Prompt Evolution** — DSPy team | Jul 2025 | Prompt evolution outperforms RL. Uses LM reflection. | Best DSPy optimizer for overnight gym |
| **Mem0: Scalable Long-Term Memory** — Chhikara et al. | Apr 2025 | Graph memory: 26% accuracy gain, 91% lower latency, 90% token savings | Mem0ᵍ foundation paper |
| **Memory in the Age of AI Agents: A Survey** | Dec 2025 | Comprehensive taxonomy: forms, functions, dynamics | Memory architecture design |
| **Self-play SWE-RL (SSR)** — Meta FAIR | Dec 2025 | Bug-inject/fix self-play. No human data. | Future self-training reference |
| **Darwin Gödel Machine** — Sakana AI / UBC | May 2025 | Evolutionary self-improvement. 20% → 50% SWE-bench. | Stage 7 Phase D core |
| **EvoAgentX** — EMNLP'25 | Sep 2025 | MCTS workflow optimization. Uses DSPy MIPRO internally. | Stage 7 Phase B core |
| **SWE-EVO** | Dec 2025 | Multi-change evolution benchmark. Agents fail badly. | Next-gen eval after SWE-bench |
| **AgencyBench** | Jan 2026 | 1M-token, 90-tool benchmark. Most comprehensive. | Production-grade eval standard |
| **SAFEFLOW** | Jun 2025 | Formal info flow control. WAL + rollback. | Agent safety guarantees |
| **AlphaVerus** | Dec 2024 | Formally verified code from LLMs. No labels. | Verification without humans |
| **Comprehensive Survey of Self-Evolving Agents** | Aug 2025 | Taxonomy of self-evolution field | The map of Stage 7 |
| **CURE (Co-Evolving Coder + Tester)** | Jun 2025 | RL co-evolution. No ground-truth supervision. | Coder-tester symbiosis |
| **MAS-Orchestra** | Jan 2026 | MAS orchestration as RL function-calling | Orchestration learning |

---

## Part 10: Summary — What Changed from v1

### Keep from ChatGPT's Stage 6
- ✅ ast-grep, Comby, Semgrep (structural editing)
- ✅ cosign, Syft, Trivy, OpenSSF Scorecard (supply chain)
- ✅ SWE-bench Verified (baseline eval — one among many)
- ✅ Langfuse (observability — expanded to full OTel stack)
- ✅ "Bridge Contract" architecture pattern

### Keep from Autonomous Evolution Roadmap (NEW in v2)
- ✅ **DSPy** as the optimization engine
- ✅ **Inspect AI** as the evaluation framework
- ✅ **Mem0ᵍ (Graph)** as the memory system (replaces JSON + fake embeddings)
- ✅ **CrossHair** for Python formal verification
- ✅ **Drop PraisonAI** — redundant with LangGraph + DSPy

### Replace / Upgrade
- gVisor/Ignite → **microsandbox + Arrakis** (agent-native, MCP-native, self-hosted)
- Nix Flakes → **Docker Compose + devcontainers** (practical)
- Continue IDE → **PR-Agent + GitHub Actions** (CI-native)
- SWE-bench alone → **AgencyBench + SWE-EVO + Inspect AI suite** (comprehensive)
- Langfuse alone → **OTel + Langfuse + Logfire** (full observability)
- MemoryManager JSON + fake embeddings → **Mem0ᵍ + Neo4j + Qdrant** (real graph memory)

### Add (Missing from Both Proposals)
- Agent evaluation meta-layer: Agent-as-a-Judge, self-benchmarking
- Co-evolution: CURE (coder+tester), CoMAS (multi-agent interaction rewards)
- Workflow self-design: SEW, MAS-Orchestra
- Expanded formal verification: AlphaVerus, SAFEFLOW, OS-Sentinel
- DSPy BootstrapFinetune: weight-level optimization on local models

### External Directory After Integration

```
G:\goose\external\
├── aider/              # Code editing engine (KEEP)
├── conscious/          # Voice interface + emotion (KEEP)
├── langgraph/          # State machine orchestrator (KEEP)
├── openhands/          # Sandbox execution (KEEP)
├── pydantic-ai/        # Typed output validation (KEEP)
├── dspy/               # NEW — Prompt optimization compiler
├── inspect/            # NEW — Evaluation harness
├── mem0/               # NEW — Graph memory (Mem0ᵍ + Neo4j + Qdrant)
├── microsandbox/       # NEW — MicroVM agent sandbox (MCP-native)
├── arrakis/            # NEW — Snapshot/restore sandbox
├── ast-grep/           # NEW — Structural code editing
├── semgrep/            # NEW — Policy-as-code guardrails
├── crosshair/          # NEW — Python formal verification
├── langfuse/           # NEW — Observability traces
└── pr-agent/           # NEW — CI/PR automation
    REMOVED: praisonai/ (redundant)
```

---

## Completeness Assessment

**With DSPy + Inspect AI + Mem0ᵍ merged into this analysis, is the roadmap complete?**

**Stage 6: YES** — all governance, safety, evaluation, observability, and provenance capabilities covered. No critical architectural gaps.

**Stage 7: 95% complete** — the Metacognitive Loop (DSPy → Inspect → Mem0ᵍ) is the core engine, EvoAgentX provides workflow evolution, DGM provides self-modification. The remaining 5%:

1. **LATS/MCTS algorithm**: Arrakis snapshot/restore enables the infrastructure, but the Language Agent Tree Search algorithm itself isn't implemented. EvoAgentX's MCTS partially covers at workflow level.

2. **StateGraphRunner real callbacks**: Still stub closures (~100 LoC to wire). Blocks structured code→test→fix loop. This is an implementation task, not an architectural gap.

3. **RAG pipeline for codebase indexing**: Mem0ᵍ's Qdrant integration provides the vector store, but a dedicated pipeline for indexing your actual repo files (not just conversation memories) would complete full codebase-aware retrieval.

These are implementation tasks, not missing architectural components. **The roadmap is architecturally complete.**
