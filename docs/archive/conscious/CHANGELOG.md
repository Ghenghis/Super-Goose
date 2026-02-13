# Changelog — Conscious + Super-Goose

All notable changes to this project are documented in this file.

## [Unreleased] — 2026-02-09

### Added

#### Rust Agent Core (Super-Goose)
- **GuardrailsEngine** (6 detectors) wired into agent hot path — scans user input before every provider call
- **ReasoningManager** (ReAct/CoT/ToT) wired — injects reasoning prompts before every provider call
- **MemoryManager** wired — load from disk, recall into prompt, store on exit, persist to JSON
- **ReflexionAgent** wired — records failed tool actions, generates self-reflections
- **CriticManager** wired — auto-critiques session quality on exit
- **CheckpointManager** (SQLite) — saves state after every tool call + 10-minute auto-save
- **MemGPT-style continuation** — checkpoint → reset → continue instead of "start new session"
- **Memory paging on compaction** — paged-out context saved to episodic memory
- **History review API** — `list_checkpoints()`, `get_last_checkpoint()`, `resume_from_checkpoint()`
- **Plan verification** — `Plan::verify()` checks dependencies, cycles, completeness
- **Orchestrator REST API** — 4 endpoints at `/orchestrator/*` for multi-agent coordination
- **saveSkill tool** — agent can save reusable skills to disk

#### Conscious Python Backend
- **Phase 1: Agentic Layer** (~785 LoC) — IntentRouter, GooseBridge, ResultSpeaker, ActionQueue
- **Phase 2: Emotion Engine** (~650 LoC) — Wav2Vec2 detector, mood tracker, response modulator
- **33 API endpoints** on `agent_api.py` covering voice, agentic, emotion, personality, memory, creator, testing, devices, agent, wake-vad
- **SSH command injection prevention** — whitelist + dangerous character filter in DeviceManager
- **Bind address security** — default changed from `0.0.0.0` to `127.0.0.1`
- **Health endpoint** — `/api/health` checks all subsystem dependencies
- **Input validation** — request body validation on all toggle/execute endpoints
- **CORS middleware** — `aiohttp_cors` configured on API server
- **Request size limit** — `client_max_size=1MB`
- **Circuit breaker** — GooseBridge stops requests after 3 consecutive failures (30s cooldown)
- **Graceful shutdown** — per-subsystem timeouts via `asyncio.wait_for`
- **UIBridge concurrency fix** — `asyncio.Lock` on `_clients` set
- **PersonalityModulator wired** into response pipeline
- **SkillBridge wired** into agent_controller

#### Electron UI (7 new components)
- **EmotionVisualizer** — valence bar, trend icon, dominant emotion, break suggestion
- **MemoryPanel** — conversation memory stats + clear button
- **WakeWordIndicator** — wake word/VAD status + always-listen toggle
- **CapabilitiesList** — agent capabilities grouped by category with expand/collapse
- **CreatorPanel** — AI artifact creation + history + promote (with path traversal prevention)
- **TestingDashboard** — validation + self-healing test runner
- **SkillManager** — run/save/list skills via API
- **ConsciousBridge expanded** — 8 command handlers (set_theme, toggle_agentic, toggle_emotion, switch_personality, refresh_status, navigate, notify, set_volume)
- **CollapsibleSection** wrapper component for organized UI layout
- **AbortController cleanup** — all fetch calls cancelled on component unmount
- **Structured logging** — command dispatch, connection lifecycle, cleanup events

#### Tests (74 passing)
- **conftest.py** — 8 shared fixtures (MockGooseBridge, ConversationHistory, PersonalitySwitcher, etc.)
- **50 unit tests** — SkillBridge (12), ResultSpeaker (8), Capabilities (7), PersonalitySwitcher (7), SSH Security (16)
- **24 integration tests** — API input validation (health, toggle, execute, size limits)

#### Documentation
- **README.md** — setup, architecture, security, component table, bridge commands
- **API.md** — all 33 endpoints with methods, bodies, response examples
- **ARCHITECTURE.md** — system diagram, data flow, module responsibilities
- **SETUP.md** — prerequisites, install steps, troubleshooting
- **CHANGELOG.md** — this file
- **CONSCIOUS_FULL_AUDIT.md** — comprehensive audit findings with fix markers
- **MASTER_ACTION_PLAN.md** — 6-agent execution plan with Go/No-Go checklist

### Fixed
- **BUG-001**: `aiohttp` missing from pyproject.toml dependencies
- **BUG-002**: `websockets` missing from pyproject.toml dependencies
- **BUG-003**: `openwakeword` missing from optional deps
- **BUG-004**: `paramiko` missing from optional deps
- **BUG-005**: No CORS on API server
- **@types/node install bug**: npm 11.x on Node 25.x creates empty directory — fixed via manual tarball extraction

### Not Bugs (False Positives)
- **BUG-006**: `ConversationHistory.clear()` already exists at line 180
- **BUG-008**: `SelfHealingLoop.__init__` already accepts `save_artifact`
- **BUG-009**: `ResultSpeaker.to_speech()` signature matches call site

### Deferred
- Android app integration (ConsciousClient.kt, ConsciousScreen.kt)
- Emotion tests (requires numpy)
- Full E2E test suite (42 tests)
- Performance benchmarks (19 tests)
- Security test suite (20 tests)
- Rust StateGraphRunner real callbacks
- RAG pipeline + vector embeddings
- Rate limiting on expensive endpoints
- Worktree merge (jolly-robinson → nifty-lumiere)
