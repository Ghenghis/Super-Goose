# Conscious — Agentic Voice AI Platform

**Conscious** is the agentic brain of Super-Goose: a voice-first AI platform combining Kyutai Moshi native speech-to-speech with tool execution, emotion detection, personality modulation, and memory.

## Quick Start

```bash
# Install (editable mode)
cd G:\goose\external\conscious
pip install -e .

# Run the API server (binds to 127.0.0.1:8999)
python -m conscious

# Run with custom host
python -m conscious --host 0.0.0.0
```

## Ports

| Service | Port | Protocol |
|---------|------|----------|
| Conscious API | 8999 | HTTP REST |
| Moshi Server | 8998 | WebSocket (audio) |
| UI Bridge | 8997 | WebSocket (commands) |
| Goosed (Super-Goose) | 3000 | HTTP |

## Architecture

```
conscious/
├── voice/           # Moshi S2S, audio I/O, wake word, VAD
│   ├── agent_api.py      # Master API server (33 routes)
│   ├── moshi_agent.py    # WebSocket client to Moshi
│   ├── moshi_engine.py   # Model loading
│   ├── audio_stream.py   # Audio I/O (sounddevice)
│   ├── server_manager.py # Server lifecycle
│   └── wake_vad.py       # Wake word + VAD pipeline
├── agentic/         # Intent routing, tool execution, UI bridge
│   ├── agent_controller.py  # Central command dispatcher (40+ capabilities)
│   ├── capabilities.py      # CapabilityRegistry with voice triggers
│   ├── goose_bridge.py      # HTTP client to goosed (circuit breaker)
│   ├── intent_router.py     # Voice → intent classification
│   ├── action_queue.py      # Async queue for tool execution
│   ├── result_speaker.py    # Result → speakable text
│   ├── skill_bridge.py      # Voice skill execution
│   ├── ui_bridge.py         # WebSocket → Electron UI
│   └── creator.py           # AI artifact generation
├── emotion/         # Wav2Vec2 emotion detection + tracking
│   ├── detector.py    # Wav2Vec2 classification (~270 LoC)
│   ├── tracker.py     # Sliding window mood tracking (~170 LoC)
│   └── responder.py   # Emotion-aware response modulation (~210 LoC)
├── personality/     # 13 personality profiles
│   ├── profile.py     # Profile definitions
│   ├── modulator.py   # Speech pattern injection
│   └── switcher.py    # Active profile management
├── memory/          # Conversation history + future semantic memory
│   └── conversation_history.py  # JSON transcript storage
├── testing/         # Self-healing test infrastructure
│   ├── validator.py      # Playwright test runner
│   └── self_healing.py   # Auto-fix + re-test loop
└── devices/         # IoT device control
    ├── manager.py    # Device registry + Creator Mode + SSH (secured)
    └── scanner.py    # Network scanning
```

## API Endpoints (33 total)

See [API.md](../audits/API.md) for full documentation.

| Group | Count | Example |
|-------|-------|---------|
| Voice | 8 | `/api/voice/status`, `/api/voice/connect` |
| Agentic | 3 | `/api/agentic/status`, `/api/agentic/execute` |
| Emotion | 2 | `/api/emotion/status`, `/api/emotion/toggle` |
| Personality | 3 | `/api/personality/status`, `/api/personality/switch` |
| Memory | 1 | `/api/memory/status` |
| Creator | 3 | `/api/creator/create`, `/api/creator/promote` |
| Testing | 3 | `/api/testing/validate`, `/api/testing/heal` |
| Devices | 7 | `/api/devices/scan`, `/api/devices/ssh` |
| Agent | 3 | `/api/agent/execute`, `/api/agent/capabilities` |
| WakeVAD | 2 | `/api/wake-vad/status`, `/api/wake-vad/toggle` |
| Health | 1 | `/api/health` |

## Testing

```bash
# Run all tests
cd G:\goose\external\conscious
python -m pytest tests/ -v --timeout=60

# Unit tests only
python -m pytest tests/unit/ -v --timeout=30

# Integration tests only
python -m pytest tests/integration/ -v --timeout=60
```

**Current coverage:** 74 tests passing (50 unit + 24 integration)

## Security

- **SSH command injection prevention**: Whitelist of allowed commands + dangerous character rejection
- **Bind address**: Defaults to `127.0.0.1` (localhost only)
- **Input validation**: All toggle/execute endpoints validate request bodies
- **CORS**: `aiohttp_cors` middleware configured
- **Request size limit**: `client_max_size=1MB`
- **Circuit breaker**: GooseBridge stops hammering goosed after 3 consecutive failures
- **Graceful shutdown**: Per-subsystem timeouts with `asyncio.wait_for`

## Electron UI Components

Located in `G:\goose\ui\desktop\src\components\conscious\`:

| Component | Purpose |
|-----------|---------|
| EmotionVisualizer | Valence bar, trend icon, dominant emotion |
| MemoryPanel | Conversation memory stats + clear |
| WakeWordIndicator | Wake word/VAD status + always-listen toggle |
| CapabilitiesList | Agent capabilities grouped by category |
| CreatorPanel | AI artifact creation + history |
| TestingDashboard | Validation + self-healing test runner |
| SkillManager | Run/save/list skills |

## ConsciousBridge Commands

The WebSocket bridge (`ws://localhost:8997`) accepts 8 commands from the Python backend:

| Command | Params | Effect |
|---------|--------|--------|
| `set_theme` | `{ theme: "light"\|"dark" }` | Switches UI theme |
| `toggle_agentic` | `{ enabled: bool }` | Enables/disables agentic layer |
| `toggle_emotion` | `{ enabled: bool }` | Enables/disables emotion engine |
| `switch_personality` | `{ profile: string }` | Switches active personality |
| `refresh_status` | `{}` | Forces UI status refresh |
| `navigate` | `{ target: string }` | Navigates to hash route |
| `notify` | `{ message, level }` | Shows notification in UI |
| `set_volume` | `{ volume: 0.0-1.0 }` | Sets media volume |
