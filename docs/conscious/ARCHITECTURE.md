# Conscious + Super-Goose Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Desktop                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ConsciousSection│  │ 7 UI Panels │  │ConsciousBridge│  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │ HTTP :8999      │ HTTP :8999      │ WS :8997  │
└─────────┼─────────────────┼─────────────────┼───────────┘
          │                 │                 │
┌─────────┴─────────────────┴─────────────────┴───────────┐
│                 Conscious Python Backend                  │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              agent_api.py (33 routes)                │ │
│  │              aiohttp + CORS on :8999                 │ │
│  └──┬──────┬──────┬──────┬──────┬──────┬──────┬───────┘ │
│     │      │      │      │      │      │      │         │
│  Voice  Agentic Emotion Person Memory Testing Devices   │
│     │      │                                             │
│     │      ├─ IntentRouter ─► GooseBridge ──────────┐   │
│     │      ├─ ActionQueue                            │   │
│     │      ├─ SkillBridge                            │   │
│     │      ├─ ResultSpeaker                          │   │
│     │      └─ UIBridge (WS :8997)                    │   │
│     │                                                │   │
│     ├─ MoshiAgent (WS :8998) ◄──── MoshiServer      │   │
│     ├─ AudioStream (sounddevice)                     │   │
│     └─ WakeVAD (openwakeword + Silero)               │   │
└──────────────────────────────────────────────────────┼───┘
                                                       │
┌──────────────────────────────────────────────────────┴───┐
│                Super-Goose (goosed) :3000                 │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Agent Loop (agent.rs:reply_internal)                 │ │
│  │  ├─ GuardrailsEngine (6 detectors)                  │ │
│  │  ├─ ReasoningManager (ReAct/CoT/ToT)                │ │
│  │  ├─ MemoryManager (load/recall/store/persist)       │ │
│  │  ├─ PlanManager + Plan::verify()                    │ │
│  │  ├─ CheckpointManager (SQLite)                      │ │
│  │  ├─ ReflexionAgent (self-correction)                │ │
│  │  ├─ CriticManager (auto-critique on exit)           │ │
│  │  └─ Shell Guard (SAFE/PARANOID/AUTOPILOT)           │ │
│  ├─ Orchestrator REST API (/orchestrator/*)            │ │
│  │  └─ 5 Specialist Agents (Code/Test/Deploy/Docs/Sec)│ │
│  └─ MCP Gateway (tool dispatch)                        │ │
└──────────────────────────────────────────────────────────┘
```

## Data Flow: Voice Command → Tool Execution

```
1. User speaks → Moshi (S2S, <200ms)
2. Moshi on_text_received → IntentRouter
3. IntentRouter classifies intent (20 regex patterns)
4. If tool intent → ActionQueue.enqueue()
5. ActionQueue → SkillBridge.parse() or GooseBridge.send()
6. GooseBridge → HTTP POST to goosed :3000 (SSE ChatRequest)
7. goosed agent loop: GuardrailsEngine → ReasoningManager → LLM → Tool dispatch
8. Response → ResultSpeaker.to_speech() → PersonalityModulator.wrap()
9. Speakable text → Moshi TTS → User hears result
10. UIBridge.send_command() → Electron UI updates
```

## Module Responsibilities

### Voice Layer (`voice/`)
- **MoshiAgent**: WebSocket client to Moshi server, opus codec, auto-reconnect
- **MoshiServerManager**: Server lifecycle, VRAM check, health polling
- **AudioStream**: Mic/speaker I/O via sounddevice
- **WakeVAD**: "Hey Conscious" wake word + Silero VAD

### Agentic Layer (`agentic/`)
- **AgentController**: Central dispatcher for 40+ voice capabilities
- **IntentRouter**: Token accumulation → intent classification with debounce
- **GooseBridge**: HTTP client to goosed with circuit breaker (3 failures → 30s open)
- **ActionQueue**: Async serial execution queue with backpressure
- **ResultSpeaker**: Markdown stripping, number humanization, truncation
- **SkillBridge**: Parse "run/save/list skill" commands → GooseBridge prompts
- **UIBridge**: WebSocket server (:8997) pushing 8 command types to Electron
- **Creator**: AI artifact generation with staging + promotion

### Emotion Engine (`emotion/`)
- **Detector**: Wav2Vec2 classification (8 emotions), lazy GPU loading
- **Tracker**: Sliding window (20) mood tracking, trend analysis
- **Responder**: Emotion → response modulation, break detection

### Personality (`personality/`)
- **Profile**: 13 personality definitions with speech patterns
- **Modulator**: Injects personality into GooseBridge responses
- **Switcher**: Active profile management with callbacks

### Memory (`memory/`)
- **ConversationHistory**: JSON transcript with turn tracking

### Devices (`devices/`)
- **Manager**: Device registry, Creator Mode SSH (whitelist-secured)
- **Scanner**: Network scanning for discoverable devices

## Security Architecture

| Layer | Protection |
|-------|-----------|
| **Network** | Bind 127.0.0.1 by default |
| **API** | CORS middleware, 1MB request limit |
| **Input** | Validation on all toggle/execute endpoints |
| **SSH** | Command whitelist + character filter |
| **GooseBridge** | Circuit breaker (3 failures → 30s cooldown) |
| **Concurrency** | asyncio.Lock on UIBridge._clients |
| **Shutdown** | Per-subsystem timeouts via asyncio.wait_for |

## Rust Agent Architecture (Super-Goose)

### Hot Path Components (agent.rs:reply_internal)

| Order | Component | When |
|-------|-----------|------|
| 1 | CheckpointManager lazy-init | First call |
| 2 | MemoryManager load from disk | First call (AtomicBool guard) |
| 3 | GuardrailsEngine scan | Before every LLM call |
| 4 | ReasoningManager inject | Before every LLM call |
| 5 | MemoryManager recall | Before every LLM call |
| 6 | Cancel token check | Every loop iteration |
| 7 | LLM call + tool dispatch | Every iteration |
| 8 | PlanManager progress | After every tool call |
| 9 | Checkpoint save | After every tool call |
| 10 | Auto-save timer | Every 10 minutes |
| 11 | ReflexionAgent | On tool failure |
| 12 | Context compaction | On context limit |
| 13 | MemGPT continuation | When compaction fails twice |
| 14 | CriticManager | On session exit |
| 15 | MemoryManager persist | On session exit |

### Stage Assessment
- **Stage 5** (Autonomous Agent): ✅ Complete
- **Stage 6** (Multi-Agent): ~65% (Orchestrator REST, stubs remain)
