# Super-Goose Full Agentic Audit — End-to-End Analysis

**Date:** 2026-02-14
**Scope:** Complete ZIP audit + uploaded artifacts + agentic self-update architecture
**Focus:** Maximum agentic autonomy, inter-agent communication, self-healing rebuild

---

## 1. CURRENT STATE AUDIT — What Exists

### 1.1 Backend (Rust) — STRONG

| System | Files | Tests | Status |
|--------|-------|-------|--------|
| Agent Core System | 11 | 87 | ✅ Solid — 6 cores + selector + registry |
| Learning Engine | 4 modules | 52 | ✅ Solid — ExperienceStore, SkillLibrary, InsightExtractor, ReflectionStore |
| OTA Self-Build | 14 files | 198 | ✅ Solid — StateSaver → SelfBuilder → BinarySwapper → HealthChecker → Rollback |
| Self-Improvement Pipeline | 7 modules | — | ✅ Exists — ImprovementPlanner, CodeApplier, SandboxRunner, TestRunner, PolicyEngine, SafetyEnvelope, AutoImproveScheduler |
| Autonomous Daemon | 8 files | 86 | ✅ Solid — TaskScheduler, BranchManager, ReleaseManager, Failsafe, AuditLog |
| TimeWarp Event Store | 1 | 8 | ✅ Working — SQLite event + branch tables |
| Compaction Manager | 1 | — | ✅ Working — context window management |
| Guardrails Engine | 6 detectors | — | ✅ Working — PII, injection, jailbreak, secrets, topics, keywords |
| API Routes | 28 modules | 34 | ✅ Extensive — SSE streaming, REST, settings broadcast |
| MCP Client | goose-mcp | — | ✅ Working — stdio + streamable_http |
| ACP Client | goose-acp | — | ✅ Exists — agent-to-agent protocol stub |

### 1.2 Frontend (React/TypeScript) — STRONG but gaps

| System | Components | Status |
|--------|-----------|--------|
| Super-Goose 8-Panel Sidebar | 8 panels + 6 shared | ✅ Working |
| Feature Panels | 4 (Budget, Critic, Guardrails, Reflexion) | ✅ API-wired |
| TimeWarp | 8 components + hook | ✅ Working |
| Pipeline Visualization | 4 components | ✅ Working |
| Studios | 6 tabs | ⚠️ 4/6 "Coming Soon" stubs |
| Enterprise Settings | 6 panels | ✅ Wired |
| CLI Integration | 3 components | ✅ Working |
| Design System | sg-* tokens (60 vars, 255 lines) | ✅ Scoped |

### 1.3 Tests — EXCELLENT

| Suite | Result |
|-------|--------|
| Vitest | 2,633 passed, 3 skipped, 0 failed |
| Playwright E2E | 291 passed, 68 skipped, 0 failed |
| tsc --noEmit | CLEAN |
| cargo check | CLEAN (0 errors, 0 warnings) |
| Rust unit | 87 + 198 + 86 + 52 + 8 + 34 = 465+ all passing |

### 1.4 Documentation — EXTENSIVE

70+ markdown files across docs, guides, archive/sessions, archive/plans. Architecture doc is comprehensive. Multiple session reports show iterative progress.

---

## 2. CRITICAL GAPS — What's Missing

### 2.1 The Core Problem You're Facing

```
PROBLEM: Super-Goose needs Goose (the LLM agent session) to be RUNNING to do anything.
         But Super-Goose also needs to REBUILD ITSELF, which kills the running session.
         How does the agent survive its own rebuild?
```

This is the **Theseus's Ship problem for AI agents** — can the agent replace itself while remaining continuously operational?

### 2.2 Gap Matrix

| # | Gap | Severity | Where | Impact |
|---|-----|----------|-------|--------|
| G1 | **No Conductor Process** — nothing survives rebuild | 🔴 CRITICAL | Architecture | Agent dies when app rebuilds |
| G2 | **No Inter-Agent Message Bus** — agents can't talk to each other | 🔴 CRITICAL | `crates/goose/src/` | No team coordination |
| G3 | **No Agent Registry/Discovery** — agents don't know about each other | 🔴 CRITICAL | `crates/goose-server/` | Can't route messages |
| G4 | **No Persistent Task Queue** — tasks lost on restart | 🔴 CRITICAL | `crates/goose/src/autonomous/` | Work lost on rebuild |
| G5 | **Conscious backend routes missing** | 🟡 HIGH | `goose-server/routes/` | Voice system disconnected |
| G6 | **AG-UI POST endpoints not wired** | 🟡 HIGH | `goose-server/routes/` | UI can't send tool results back |
| G7 | **Studio stubs violate no-placeholder rule** | 🟡 HIGH | `ui/desktop/src/` | 4 "Coming Soon" panels |
| G8 | **GPU Jobs backend missing** | 🟡 HIGH | `goose-server/routes/` | Launch button does nothing |
| G9 | **13 bundled extensions not implemented** | 🟡 MEDIUM | `goose-mcp/` | Declared but not real |
| G10 | **API Key vault missing** | 🟡 MEDIUM | `goose-server/routes/` | Can't manage keys from UI |
| G11 | **External Python deps not installed** | 🟡 MEDIUM | `scripts/` | Conscious/tools won't start |
| G12 | **Shared memory between agents** | 🟡 MEDIUM | `crates/goose/src/` | Per-agent only, no team memory |
| G13 | **Agent wake-up/sleep lifecycle** | 🟡 MEDIUM | `crates/goose/src/` | No way to wake sleeping agents |
| G14 | **38 uncommitted files** | 🟠 DO NOW | `feat/resizable-layout` | Risk of losing work |

---

## 3. THE CONDUCTOR ARCHITECTURE — Solving Self-Update

This is the answer to your core question: "How does Goose continue without user interaction when the project needs rebuilding?"

### 3.1 The Problem in Detail

```
Current Flow (BROKEN):
  User → npm run start-gui → Electron + goosed starts → Agent session active
  Agent decides to self-improve → cargo build → new binary ready
  ??? How to swap? Electron is running. goosed is running. Agent is mid-session.
  If you kill goosed → agent session dies → no one to verify the new build
  If you kill Electron → UI dies → user can't see what's happening
```

### 3.2 The Solution: Three-Layer Conductor Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ LAYER 0: THE CONDUCTOR (Never Dies)                                │
│ A tiny, persistent daemon that outlives everything else.            │
│ Written in Rust. Compiled once. Runs as a system service.           │
│                                                                     │
│ Responsibilities:                                                   │
│ • Start/stop/restart goosed (the Rust backend)                     │
│ • Start/stop/restart Electron (the GUI)                            │
│ • Maintain the persistent task queue (SQLite)                      │
│ • Maintain the agent message bus (Unix socket / named pipe)        │
│ • Health check all children every 5 seconds                        │
│ • Route inter-agent messages even during rebuilds                  │
│ • Accept commands via IPC (socket/pipe) from goosed or Electron    │
│ • Log everything to a crash-safe log file                          │
│                                                                     │
│ THE CONDUCTOR IS NEVER REBUILT BY THE AGENT.                       │
│ It is updated separately, manually, via a simple binary swap.       │
│ It is ~500 lines of Rust. It has zero LLM logic.                   │
└─────────────┬────────────────────────┬──────────────────────────────┘
              │                        │
              ▼                        ▼
┌─────────────────────────┐  ┌─────────────────────────────────────┐
│ LAYER 1: goosed          │  │ LAYER 2: Electron GUI               │
│ (The Rust backend)       │  │ (The React frontend)                │
│                          │  │                                     │
│ • Agent sessions         │  │ • 8-panel sidebar                   │
│ • LLM communication      │  │ • Mission control                   │
│ • MCP tool execution     │  │ • TimeWarp, Studios, etc.           │
│ • OTA self-build         │  │ • Connects to goosed via HTTP/SSE   │
│ • Learning engine        │  │ • Connects to Conductor via IPC     │
│                          │  │                                     │
│ CAN BE KILLED + RESTARTED│  │ CAN BE KILLED + RESTARTED          │
│ by the Conductor         │  │ by the Conductor                    │
└─────────────────────────┘  └─────────────────────────────────────┘
```

### 3.3 Self-Update Sequence (The Full Flow)

```
SELF-UPDATE SEQUENCE:
═════════════════════

1. DETECT
   Agent (via goosed) identifies an improvement opportunity:
   • InsightExtractor finds a failure pattern
   • AutoImproveScheduler triggers a cycle
   • User requests /self-improve

2. PLAN
   ImprovementPlanner creates an ImprovementPlan:
   • What files to change
   • Expected outcome
   • Risk assessment
   • Rollback strategy

3. SAVE STATE → CONDUCTOR
   Agent sends state snapshot to the Conductor:
   ┌─────────────────────────────────────────┐
   │ ConductorMessage::SaveState {           │
   │   task_queue: Vec<PendingTask>,         │
   │   agent_states: Vec<AgentSnapshot>,     │
   │   pending_messages: Vec<AgentMessage>,  │
   │   active_sessions: Vec<SessionId>,      │
   │   improvement_plan: ImprovementPlan,    │
   │ }                                       │
   └─────────────────────────────────────────┘
   Conductor writes this to SQLite (crash-safe, WAL mode).

4. APPLY CODE CHANGES (in sandbox)
   CodeApplier writes changes to a STAGING COPY of the source:
   • /home/user/.goose/staging/ ← copy of source
   • Changes applied here, NOT to the live source
   • Live goosed continues running normally

5. BUILD NEW BINARY (from staging)
   SelfBuilder runs: cargo build -p goose-server --release
   • Builds from /home/user/.goose/staging/
   • Output: /home/user/.goose/staging/target/release/goosed-new
   • Live system is STILL RUNNING during this build

6. TEST NEW BINARY (in isolation)
   TestRunner launches the new binary on a DIFFERENT PORT:
   • goosed-new --port 3285 (staging port, not 3284)
   • Runs health check against http://localhost:3285/status
   • Runs smoke tests against the new binary
   • Runs unit tests: cargo test
   • If ANY test fails → ABORT, discard staging, log failure

7. SWAP — Conductor orchestrates the hot-swap:
   ┌─────────────────────────────────────────────────────────────┐
   │ a) Conductor tells Electron: "entering maintenance mode"    │
   │    → UI shows "Upgrading... please wait" overlay            │
   │    → UI stays open, shows progress bar                      │
   │                                                              │
   │ b) Conductor tells goosed: "drain and shutdown"              │
   │    → goosed stops accepting new requests                     │
   │    → goosed finishes any in-flight LLM calls (timeout: 30s) │
   │    → goosed serializes all sessions to SQLite                │
   │    → goosed exits cleanly                                    │
   │                                                              │
   │ c) Conductor performs binary swap:                            │
   │    → mv goosed goosed-backup                                 │
   │    → mv goosed-new goosed                                    │
   │                                                              │
   │ d) Conductor starts NEW goosed:                              │
   │    → goosed starts on port 3284                              │
   │    → goosed reads saved state from SQLite                    │
   │    → goosed restores sessions, agent states, pending tasks   │
   │                                                              │
   │ e) Conductor health-checks new goosed:                       │
   │    → GET http://localhost:3284/status                        │
   │    → If healthy → tell Electron "maintenance complete"       │
   │    → Electron reconnects SSE, resumes normal operation       │
   │                                                              │
   │ f) If new goosed FAILS to start:                             │
   │    → mv goosed goosed-failed                                 │
   │    → mv goosed-backup goosed                                 │
   │    → Start old goosed (known-good)                           │
   │    → Tell Electron "rollback complete, upgrade failed"       │
   │    → Log failure, apply exponential backoff to next attempt  │
   └─────────────────────────────────────────────────────────────┘

8. RESUME
   New goosed is running with all state restored.
   Agent picks up where it left off.
   If the improvement was successful, ExperienceStore records success.
   If the improvement caused issues, next cycle can self-revert.

DOWNTIME: ~5-15 seconds (drain + swap + startup + health check)
USER EXPERIENCE: UI stays open, shows progress, auto-reconnects
AGENT EXPERIENCE: Seamless — state restored, tasks resume
```

### 3.4 Conductor Implementation

```
NEW FILES NEEDED:
─────────────────
crates/goose-conductor/
  Cargo.toml
  src/
    main.rs              # Entry point, signal handlers, service registration
    child_manager.rs     # Start/stop/restart goosed + Electron
    health_checker.rs    # Periodic health checks with circuit breaker
    ipc_server.rs        # Unix socket (Linux/Mac) / Named pipe (Windows)
    state_store.rs       # SQLite state persistence (task queue, agent state)
    message_bus.rs       # Inter-agent message routing (survives rebuilds)
    log_manager.rs       # Crash-safe structured logging
    config.rs            # Conductor configuration

ESTIMATED SIZE: ~1,200 lines of Rust
DEPENDENCIES: tokio, sqlx, serde, serde_json
NO LLM DEPENDENCIES. NO MCP. NO COMPLEX LOGIC.
The Conductor is deliberately dumb — it just manages processes.
```

### 3.5 Why This Architecture Works

| Problem | Solution |
|---------|----------|
| Agent dies on rebuild | Conductor survives, restarts goosed with state |
| Tasks lost on restart | Persistent task queue in Conductor's SQLite |
| Messages lost on restart | Message bus in Conductor, queues until recipient alive |
| UI disconnects | Electron stays open, reconnects to new goosed |
| Bad build deployed | Health check fails → automatic rollback to backup |
| Agent can't start next cycle | Conductor's task queue preserves the plan |
| Multiple rebuilds in a row | Each one follows the same swap protocol |
| Conductor itself crashes | Registered as system service, OS restarts it |

---

## 4. INTER-AGENT COMMUNICATION SYSTEM

### 4.1 The Architecture

```
                    ┌─────────────────────────┐
                    │     CONDUCTOR            │
                    │     Message Bus          │
                    │     (SQLite-backed)      │
                    │                          │
                    │  ┌──────────────────┐    │
                    │  │ message_queue    │    │
                    │  │ (persistent)     │    │
                    │  └──────────────────┘    │
                    │  ┌──────────────────┐    │
                    │  │ agent_registry   │    │
                    │  │ (who's online)   │    │
                    │  └──────────────────┘    │
                    │  ┌──────────────────┐    │
                    │  │ topic_subscriptions│   │
                    │  │ (pub/sub)        │    │
                    │  └──────────────────┘    │
                    └───────┬─────────────────┘
                            │
          ┌─────────────────┼─────────────────────┐
          │                 │                       │
    ┌─────▼─────┐   ┌──────▼──────┐   ┌──────────▼──────────┐
    │ Architect │   │  Developer  │   │  QA Agent           │
    │ Agent     │   │  Agent      │   │                     │
    │           │   │             │   │  (currently offline) │
    │ ONLINE    │   │ ONLINE      │   │  OFFLINE — has 3    │
    │           │   │             │   │  queued messages     │
    └───────────┘   └─────────────┘   └─────────────────────┘
```

### 4.2 Message Types

```rust
// crates/goose/src/agent_bus/messages.rs

/// Every message between agents follows this format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMessage {
    pub id: Uuid,
    pub from: AgentId,
    pub to: MessageTarget,        // specific agent, role, or broadcast
    pub channel: MessageChannel,  // direct, team, broadcast, system
    pub priority: Priority,       // critical, high, normal, low
    pub payload: MessagePayload,
    pub reply_to: Option<Uuid>,   // for conversation threading
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub delivered: bool,
    pub acknowledged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MessageTarget {
    Agent(AgentId),               // direct message to specific agent
    Role(AgentRole),              // message to whoever fills this role
    Team(TeamId),                 // message to all agents in a team
    Broadcast,                    // message to all online agents
    Topic(String),                // pub/sub topic
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MessagePayload {
    // Task coordination
    TaskAssignment { task: TaskSpec, deadline: Option<DateTime<Utc>> },
    TaskUpdate { task_id: Uuid, status: TaskStatus, details: String },
    TaskComplete { task_id: Uuid, result: TaskResult, artifacts: Vec<Artifact> },

    // Knowledge sharing
    CodeChange { files: Vec<FileDiff>, reason: String },
    TestResult { suite: String, passed: u32, failed: u32, details: Vec<TestDetail> },
    Insight { category: InsightCategory, content: String, confidence: f32 },
    MemoryShare { key: String, value: serde_json::Value },

    // Coordination
    PlanProposal { plan: Plan, needs_approval: bool },
    PlanApproval { plan_id: Uuid, approved: bool, feedback: Option<String> },
    StatusRequest,
    StatusResponse { status: AgentStatus, current_task: Option<String> },
    HelpRequest { problem: String, context: Vec<String> },
    HelpResponse { suggestion: String, confidence: f32 },

    // Lifecycle
    WakeUp { reason: String },           // ← WAKE UP AN OFFLINE AGENT
    GoingOffline { reason: String },
    ComingOnline { capabilities: Vec<String> },
    Heartbeat { load: f32 },

    // System
    BuildStarting { version: String },
    BuildComplete { version: String, success: bool },
    RollbackRequired { reason: String },

    // Free-form (agents can define their own protocols)
    Custom { event_type: String, data: serde_json::Value },
}
```

### 4.3 Agent Wake-Up Protocol

This is how messages sent to offline agents wake them up:

```
WAKE-UP SEQUENCE:
═════════════════

1. Agent A (Architect) sends message to Agent B (QA), who is offline:
   AgentMessage {
     to: Agent("qa-agent-01"),
     payload: WakeUp { reason: "Tests needed for auth module" },
   }

2. Conductor receives the message:
   → Checks agent_registry: qa-agent-01 status = OFFLINE
   → Stores message in message_queue (SQLite, persistent)
   → Checks wake_policy for qa-agent-01:

3. Wake Policy decides whether to wake:
   ┌─────────────────────────────────────────┐
   │ WakePolicy {                            │
   │   auto_wake: true,                      │
   │   wake_on_priority: Priority::Normal,   │ // wake for normal+ priority
   │   wake_on_channels: [Direct, Team],     │ // wake for direct or team msgs
   │   cooldown: Duration::minutes(5),       │ // don't wake more than once per 5 min
   │   max_concurrent_agents: 5,             │ // don't exceed 5 running agents
   │   resource_check: true,                 │ // check GPU/RAM before waking
   │ }                                       │
   └─────────────────────────────────────────┘

4. If policy allows, Conductor wakes the agent:
   → Spawns agent process (or activates agent within goosed)
   → Waits for health check
   → Delivers queued messages in order
   → Agent processes messages and responds

5. If policy denies, message stays queued:
   → Agent will receive it next time it comes online
   → Conductor can notify sender: "QA agent offline, message queued"
   → If message has expires_at and it passes, message is discarded + sender notified
```

### 4.4 Agent Self-Improvement of the Chat System

Here's the key insight: once agents are online, they can improve the communication system itself.

```
HOW AGENTS UPGRADE THEIR OWN CHAT:
══════════════════════════════════════

The inter-agent chat system is defined by:
  1. Message types (Rust enum)
  2. Routing logic (Conductor)
  3. Serialization format (serde JSON)
  4. UI rendering (React component)

Agents CAN self-modify #4 (the UI) and add new Custom payloads.
Agents CANNOT modify #1-#3 without a full rebuild cycle.

But here's the trick:

The Custom { event_type, data } variant is a generic escape hatch.
Agents can define NEW message types at runtime by agreeing on a
custom event_type string and data schema.

Example:
  • Architect agent creates a new review protocol
  • Sends a Custom message to all agents:
    { event_type: "protocol_announcement",
      data: { protocol: "code_review_v2",
              schema: { ... },
              description: "New structured review format" }}
  • Developer agent receives it, stores the schema
  • Next code review uses the new protocol

For deeper changes (new routing, new priority levels):
  • Agent creates an ImprovementPlan targeting message_bus.rs
  • Goes through the full self-improvement pipeline (sandbox → test → deploy)
  • The system rebuilds, Conductor hot-swaps, agents resume
  • Now the message bus has the new capability

This means the agents evolve their own communication organically,
starting with quick runtime changes (Custom payloads) and escalating
to structural changes (self-improve + rebuild) when needed.
```

### 4.5 Chat System UI for Agents

```
AGENT CHAT PANEL (new panel for the sidebar):
═══════════════════════════════════════════════

┌─────────────────────────────────────────────────────┐
│ AGENT COMMUNICATIONS                    [Filter ▼]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  #team-general                                      │
│  ┌─────────────────────────────────────────────┐   │
│  │ 🏗️ Architect [14:23]                        │   │
│  │ Plan approved for auth module. Developer    │   │
│  │ and QA, please check your task assignments. │   │
│  │                                              │   │
│  │ 💻 Developer [14:23]                         │   │
│  │ Acknowledged. Starting implementation.       │   │
│  │ ETA: 3 minutes for JWT middleware.           │   │
│  │                                              │   │
│  │ ✅ QA [14:24] (woke up for this)            │   │
│  │ Online. Ready for test execution when code   │   │
│  │ is committed.                                │   │
│  │                                              │   │
│  │ 💻 Developer [14:27]                         │   │
│  │ Code committed. 3 files changed:             │   │
│  │ • src/middleware/jwt.ts (new)                │   │
│  │ • src/routes/auth.ts (modified)             │   │
│  │ • package.json (1 new dep)                  │   │
│  │ @QA ready for testing.                      │   │
│  │                                              │   │
│  │ ✅ QA [14:27]                               │   │
│  │ Running test suite... 12/12 passed. ✅       │   │
│  │ Coverage: 89%. No regressions detected.     │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  📩 QUEUED (2 messages for offline agents)          │
│  ├─ → 🛡️ Security: "Review auth module" (queued)  │
│  └─ → 🚀 Deploy: "Stage auth for preview" (queued)│
│                                                     │
│  [View Direct Messages] [View System Log]           │
├─────────────────────────────────────────────────────┤
│  You can also send messages to agents:              │
│  [@Agent] [Message...]                    [Send]    │
└─────────────────────────────────────────────────────┘

The user can:
• Read all agent-to-agent messages in real-time
• Filter by channel (team, direct, system)
• Send messages to specific agents or broadcast
• See queued messages for offline agents
• Wake up agents manually by clicking their status
• View conversation threads
```

---

## 5. COMPLETE ARCHITECTURE — Everything Wired Together

```
╔═══════════════════════════════════════════════════════════════════════╗
║                    SUPER-GOOSE AGENTIC ARCHITECTURE                  ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  ┌─────────────────────────────────────────────────────────────┐     ║
║  │ LAYER 0: CONDUCTOR (system service — never rebuilt by agent) │     ║
║  │                                                               │     ║
║  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌────────────┐ │     ║
║  │  │ Child     │ │ Health    │ │ Message   │ │ State      │ │     ║
║  │  │ Manager   │ │ Checker   │ │ Bus       │ │ Store      │ │     ║
║  │  │           │ │ (5s loop) │ │ (pub/sub) │ │ (SQLite)   │ │     ║
║  │  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └──────┬─────┘ │     ║
║  │        │              │              │               │        │     ║
║  │  ┌─────┴──────────────┴──────────────┴───────────────┴────┐  │     ║
║  │  │                   IPC Socket                            │  │     ║
║  │  │  (Unix socket on Linux/Mac, Named pipe on Windows)     │  │     ║
║  │  └────────────────────┬───────────────────────────────────┘  │     ║
║  └───────────────────────┼──────────────────────────────────────┘     ║
║                          │                                             ║
║            ┌─────────────┼─────────────┐                              ║
║            ▼             ▼             ▼                              ║
║  ┌─────────────┐ ┌────────────┐ ┌──────────────────┐                 ║
║  │ LAYER 1:    │ │ LAYER 1b:  │ │ LAYER 2:         │                 ║
║  │ goosed      │ │ Agent      │ │ Electron GUI     │                 ║
║  │ (Rust)      │ │ Processes  │ │ (React/TS)       │                 ║
║  │             │ │            │ │                    │                 ║
║  │ Main backend│ │ Each agent │ │ Mission Control   │                 ║
║  │ LLM calls   │ │ can be its │ │ Agent Chat Panel │                 ║
║  │ MCP tools   │ │ own process│ │ Plan Viewer      │                 ║
║  │ API server  │ │ or a thread│ │ All 8+ panels    │                 ║
║  │ OTA engine  │ │ in goosed  │ │                    │                 ║
║  └──────┬──────┘ └─────┬──────┘ └────────┬──────────┘                 ║
║         │              │                  │                            ║
║         │    Agent-to-Agent Messages      │                            ║
║         │◄────────────────────────────────►│                           ║
║         │              │                  │                            ║
║         ▼              ▼                  │                            ║
║  ┌──────────────────────────┐            │                            ║
║  │ SHARED RESOURCES         │            │                            ║
║  │ • SQLite (WAL mode)      │◄───────────┘                            ║
║  │ • ExperienceStore        │                                         ║
║  │ • SkillLibrary           │                                         ║
║  │ • TimeWarp EventStore    │                                         ║
║  │ • team_memories table    │  ← NEW: shared agent memory            ║
║  │ • message_queue table    │  ← NEW: persistent message queue       ║
║  │ • agent_registry table   │  ← NEW: who's online/offline           ║
║  └──────────────────────────┘                                         ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
```

---

## 6. NEW DATABASE TABLES NEEDED

```sql
-- Agent registry: tracks all known agents and their status
CREATE TABLE agent_registry (
    id TEXT PRIMARY KEY,           -- unique agent ID
    role TEXT NOT NULL,            -- architect, developer, qa, security, deploy, custom
    display_name TEXT NOT NULL,
    model_backend TEXT,            -- claude-opus, qwen3-32b, glm-4.7, ollama, etc.
    status TEXT DEFAULT 'offline', -- online, offline, busy, error, maintenance
    capabilities TEXT,             -- JSON array of capabilities
    wake_policy TEXT,              -- JSON WakePolicy config
    last_heartbeat TIMESTAMP,
    last_online TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT                  -- JSON for extensibility
);

-- Persistent message queue: survives restarts
CREATE TABLE message_queue (
    id TEXT PRIMARY KEY,
    from_agent TEXT NOT NULL,
    to_target TEXT NOT NULL,       -- agent ID, role name, "broadcast", or topic
    target_type TEXT NOT NULL,     -- agent, role, team, broadcast, topic
    channel TEXT DEFAULT 'team',   -- direct, team, broadcast, system
    priority INTEGER DEFAULT 2,   -- 0=critical, 1=high, 2=normal, 3=low
    payload TEXT NOT NULL,         -- JSON AgentMessage payload
    reply_to TEXT,                 -- message ID this replies to
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    delivered BOOLEAN DEFAULT FALSE,
    delivered_at TIMESTAMP,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP,
    FOREIGN KEY (from_agent) REFERENCES agent_registry(id)
);

-- Shared team memory: agents can read/write shared knowledge
CREATE TABLE team_memories (
    id TEXT PRIMARY KEY,
    namespace TEXT NOT NULL,       -- 'shared', 'team-alpha', or agent-specific
    key TEXT NOT NULL,
    value TEXT NOT NULL,           -- JSON value
    created_by TEXT NOT NULL,      -- agent ID
    updated_by TEXT,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    UNIQUE(namespace, key)
);

-- Topic subscriptions for pub/sub
CREATE TABLE topic_subscriptions (
    agent_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (agent_id, topic),
    FOREIGN KEY (agent_id) REFERENCES agent_registry(id)
);

-- Task persistence: survives rebuilds
CREATE TABLE task_queue (
    id TEXT PRIMARY KEY,
    assigned_to TEXT,              -- agent ID or NULL (unassigned)
    title TEXT NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 2,
    status TEXT DEFAULT 'pending', -- pending, assigned, running, completed, failed, cancelled
    dependencies TEXT,             -- JSON array of task IDs that must complete first
    result TEXT,                   -- JSON result when completed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_by TEXT,               -- agent or user
    metadata TEXT                  -- JSON for extensibility
);

-- Build history: track all self-update attempts
CREATE TABLE build_history (
    id TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    improvement_plan TEXT,         -- JSON ImprovementPlan
    build_status TEXT NOT NULL,    -- building, testing, swapping, completed, failed, rolled_back
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    test_results TEXT,             -- JSON TestSuiteResult
    health_check_result TEXT,      -- JSON HealthReport
    rollback_reason TEXT,
    triggered_by TEXT              -- agent ID or 'scheduler' or 'user'
);

CREATE INDEX idx_messages_undelivered ON message_queue(to_target, delivered) WHERE delivered = FALSE;
CREATE INDEX idx_messages_target_type ON message_queue(target_type, to_target, delivered);
CREATE INDEX idx_tasks_status ON task_queue(status, priority);
CREATE INDEX idx_agent_status ON agent_registry(status);
CREATE INDEX idx_team_memories_ns ON team_memories(namespace, key);
```

---

## 7. FAILSAFE ARCHITECTURE — What Happens When Things Go Wrong

### 7.1 Failure Modes and Recovery

| Failure | Detection | Recovery | Downtime |
|---------|-----------|----------|----------|
| **goosed crashes** | Conductor health check (5s) | Conductor restarts goosed, loads saved state | ~5s |
| **Electron crashes** | Conductor health check | Conductor restarts Electron, reconnects to goosed | ~3s |
| **Build fails** | TestRunner reports failure | Discard staging dir, continue with current binary, log failure, exponential backoff | 0s |
| **New binary fails health check** | HealthChecker on port 3285 | Don't swap — discard new binary, log reason | 0s |
| **New binary crashes on startup** | Conductor can't health-check 3284 | Rollback: restore backup binary, restart | ~10s |
| **Conductor crashes** | OS service manager (systemd/nssm) | OS restarts Conductor, Conductor restarts children | ~5s |
| **Database corrupted** | SQLite integrity check | Restore from WAL checkpoint or last backup | ~10s |
| **All agents stuck in loop** | Failsafe CircuitBreaker | Trip breaker, stop all non-essential agents, alert user | 0s |
| **LLM provider down** | API timeout (30s) | Fallback to local model (Ollama/LM Studio), queue cloud tasks | 0s |
| **Disk full** | Pre-build check | Skip build, alert user, suggest cleanup | 0s |
| **GPU OOM** | CUDA error detection | Reduce batch size, offload to CPU, or queue task | 0s |

### 7.2 Circuit Breaker Configuration

```rust
// Already exists in crates/goose/src/autonomous/failsafe.rs
// but needs to be extended for the Conductor layer

CircuitBreaker {
    // Build failures
    build_failures: { threshold: 3, timeout: Duration::hours(1) },
    // Agent crashes
    agent_crashes: { threshold: 5, timeout: Duration::minutes(30) },
    // LLM API errors
    llm_errors: { threshold: 10, timeout: Duration::minutes(5) },
    // Message bus overflow
    message_overflow: { threshold: 10_000, action: DropLowPriority },
    // Cost runaway
    cost_limit: { per_hour: 5.0, per_day: 50.0, action: PauseNonCritical },
}
```

### 7.3 The "Always Connected" Guarantee

```
The Conductor ensures something is ALWAYS running:

  1. Conductor starts on boot (system service)
  2. Conductor starts goosed
  3. Conductor starts Electron (if GUI mode)
  4. Conductor monitors both via health checks
  5. If goosed dies → restart immediately
  6. If build requested → build in background, swap only when safe
  7. If swap fails → rollback to backup
  8. If rollback fails → start most recent known-good binary
  9. If ALL binaries fail → Conductor enters SAFE MODE:
     → Start minimal HTTP server on port 3284
     → Serve diagnostic page
     → Accept user commands to download new binary
     → Log everything for debugging

  There is ALWAYS a process accepting connections on port 3284.
  There is ALWAYS a way for the user to interact.
  There is ALWAYS a way to recover.
```

---

## 8. IMPLEMENTATION PRIORITY — What to Build First

### Phase 0: IMMEDIATE (Do Today)

1. **Commit 38 uncommitted files** — `git add -A && git commit && git push`
2. **Hide "Coming Soon" studios** — Replace with `experimental: true` flag

### Phase 1: Conductor Foundation (Week 1)

1. **Create `goose-conductor` crate** (~500 lines)
   - Child process manager (start/stop/restart goosed + Electron)
   - Health checker (HTTP ping every 5s)
   - IPC socket (Unix socket / Named pipe)
   - Basic state persistence (SQLite)

2. **Create database tables** (agent_registry, message_queue, task_queue, team_memories)

3. **Modify goosed** to:
   - Register with Conductor on startup
   - Accept "drain and shutdown" command
   - Serialize/restore session state

### Phase 2: Agent Message Bus (Week 2)

1. **Implement AgentMessage types** in `crates/goose/src/agent_bus/`
2. **Implement message routing** in Conductor
3. **Implement agent_registry** — online/offline tracking
4. **Implement wake-up protocol** — Conductor spawns agents on demand
5. **Wire to goose-server API** — new routes:
   - `POST /api/agents/{id}/message` — send message
   - `GET /api/agents/{id}/messages` — get inbox
   - `GET /api/agents/registry` — list all agents
   - `POST /api/agents/{id}/wake` — wake offline agent
   - `GET /api/agents/chat/stream` — SSE stream of all messages

### Phase 3: Agent Chat UI (Week 3)

1. **New AgentChatPanel.tsx** in sidebar
2. **Wire to SSE stream** — real-time message display
3. **User can send messages** to agents
4. **Queued messages visible** for offline agents
5. **Wake-up button** for offline agents

### Phase 4: Self-Update Pipeline (Week 4)

1. **Implement staging directory** build system
2. **Implement parallel binary testing** (port 3285)
3. **Implement Conductor-orchestrated hot-swap**
4. **Implement automatic rollback**
5. **Wire to UI** — progress indicator during upgrades

### Phase 5: Wire Existing Gaps (Weeks 5-6)

1. Wire Conscious backend routes (Fix 1 from NEXT-RELEASE-FIXES.md)
2. Wire AG-UI POST endpoints (Fix 3)
3. GPU Jobs backend (Fix 5)
4. Install external dependencies script (Fix 2)
5. API Key vault (Fix 7)

### Phase 6: Full Agentic Team (Weeks 7-8)

1. **HyperAgent message bus pattern** integration
2. **Zoekt code search** integration
3. **Shared memory** — team_memories table + API
4. **Agent self-spawning** with resource checks
5. **ALMAS role assignment** with dynamic team composition

---

## 9. WHAT MAKES THIS "MOST AGENTIC POSSIBLE"

| Feature | How It's Agentic |
|---------|-----------------|
| **Conductor** | System never fully stops. Something is always running, always accepting commands. |
| **Message Bus** | Agents communicate without human mediation. Architect assigns tasks, Developer implements, QA tests — all autonomously. |
| **Wake-Up Protocol** | Offline agents get woken up when needed. No human has to start them. |
| **Shared Memory** | All agents see the same project context. Architect's plan is Developer's roadmap is QA's checklist. |
| **Self-Update** | Agent improves its own code, builds itself, swaps binaries, verifies health — all without human intervention. |
| **Persistent Tasks** | Tasks survive crashes and restarts. Nothing is lost. Agent resumes from exactly where it stopped. |
| **Circuit Breakers** | Agent can't get stuck in infinite loops. Automatic failsafes prevent runaway costs and resource exhaustion. |
| **Agent Chat** | Agents define and evolve their own communication protocols via Custom message payloads. |
| **Rollback** | If agent makes itself worse, automatic rollback to the last known-good state. |
| **Exponential Backoff** | Failed improvements don't retry immediately. System learns from failures. |
| **User Override** | User can always intervene: KILL button, pause, manual rollback, send messages to agents. |
| **Audit Trail** | Every action, every message, every build, every decision logged permanently in SQLite. |

---

## 10. FILES TO CREATE — Complete Manifest

```
NEW FILES (by creation order):
══════════════════════════════

# Conductor crate
crates/goose-conductor/Cargo.toml
crates/goose-conductor/src/main.rs
crates/goose-conductor/src/child_manager.rs
crates/goose-conductor/src/health_checker.rs
crates/goose-conductor/src/ipc_server.rs
crates/goose-conductor/src/state_store.rs
crates/goose-conductor/src/message_bus.rs
crates/goose-conductor/src/log_manager.rs
crates/goose-conductor/src/config.rs

# Agent bus (in core goose crate)
crates/goose/src/agent_bus/mod.rs
crates/goose/src/agent_bus/messages.rs
crates/goose/src/agent_bus/registry.rs
crates/goose/src/agent_bus/router.rs
crates/goose/src/agent_bus/wake_policy.rs
crates/goose/src/agent_bus/shared_memory.rs

# API routes
crates/goose-server/src/routes/agents_api.rs
crates/goose-server/src/routes/chat_api.rs
crates/goose-server/src/routes/conductor_api.rs

# Frontend
ui/desktop/src/components/super/AgentChatPanel.tsx
ui/desktop/src/components/super/AgentRegistryPanel.tsx
ui/desktop/src/hooks/useAgentChat.ts
ui/desktop/src/hooks/useConductorStatus.ts

# Database migrations
crates/goose/migrations/007_agent_bus.sql
crates/goose-conductor/migrations/001_conductor_state.sql

# Scripts
scripts/install-conductor.ps1    (and .sh)
scripts/start-conductor.ps1      (and .sh)
scripts/conductor-status.ps1     (and .sh)

# Tests
crates/goose-conductor/tests/integration_tests.rs
crates/goose/tests/agent_bus_tests.rs

# Docs
docs/CONDUCTOR.md
docs/AGENT_COMMUNICATION.md
docs/SELF_UPDATE_ARCHITECTURE.md

TOTAL: ~40 new files, ~5,000-8,000 lines
```

---

## APPENDIX A: Comparison With Your Original Idea

Your original idea:
> "having issues with self updating its own codebase and then rebuild project launch another session/npm run start-gui keeping other open until it works then close old session/npm run start-gui and use another"

This is actually very close to the right architecture. The key refinements:

| Your Idea | Refined Solution |
|-----------|-----------------|
| Launch another `npm run start-gui` | Launch new goosed on staging port 3285, test it, then swap |
| Keep other open until it works | Conductor keeps old goosed running until new one passes health checks |
| Close old session | Conductor sends "drain and shutdown" to old goosed, graceful exit |
| Use another that was my idea | Conductor promotes new goosed to port 3284, Electron reconnects |
| How would goose continue? | Conductor persists state (tasks, messages, sessions) in SQLite |
| What if it fails? | Automatic rollback to backup binary, exponential backoff |
| Something running that doesn't affect builds | Conductor is that something — ~500 lines, never rebuilt by agent |

The Conductor IS your idea, formalized into a production-safe architecture.

---

## APPENDIX B: Agent Awareness Matrix

Every agent knows about every other agent:

```
         Knows About →   Architect  Developer  QA    Security  Deploy  User
Architect                  self       ✅         ✅    ✅        ✅      ✅
Developer                  ✅         self       ✅    ✅        ✅      ✅
QA                         ✅         ✅         self  ✅        ✅      ✅
Security                   ✅         ✅         ✅    self      ✅      ✅
Deploy                     ✅         ✅         ✅    ✅        self    ✅
User                       ✅         ✅         ✅    ✅        ✅      —

How: Every agent queries agent_registry on startup.
     Conductor broadcasts registry changes to all online agents.
     Agents subscribe to topics relevant to their role.
     User sees everything in the Agent Chat Panel.
```

---

*This document is a living architecture spec for Super-Goose's transition from L6.5 to L10+ agentic autonomy.*
*Generated 2026-02-14 from full codebase audit of SUPER-GOOSE-docs.zip + 11 uploaded artifacts.*
