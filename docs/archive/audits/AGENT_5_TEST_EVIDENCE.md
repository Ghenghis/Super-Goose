# Agent 5: Test Evidence Auditor — Task List

**Scope:** ALL test creation — fixtures, unit, integration, E2E, performance tests  
**Audit Passes:** Pass 9 (test evidence), plus verification support for all other agents  
**Estimated Time:** 4-5 hours  
**Dependencies:** Phase 1 (fixtures) has none. Phase 2 (unit tests) needs Agent 2's wiring fixes for some modules.  

---

## Phase 1 Tasks (Start Immediately — Test Infrastructure)

### TASK 5.1: Create Test Directory Structure

```bash
G:\goose\external\conscious\tests\
├── conftest.py                    # Root conftest with shared fixtures
├── __init__.py                    # Make tests a package
├── fixtures/
│   ├── __init__.py
│   ├── mock_goose_bridge.py       # MockGooseBridge returning canned GooseResult
│   ├── mock_http_server.py        # Lightweight aiohttp test server
│   ├── audio_helpers.py           # Generate silence, sine waves, noise
│   ├── emotion_helpers.py         # Pre-built EmotionResult objects
│   └── personality_helpers.py     # Quick access to test profiles
├── unit/
│   ├── __init__.py
│   ├── agentic/
│   │   ├── __init__.py
│   │   ├── test_intent_router.py
│   │   ├── test_goose_bridge.py
│   │   ├── test_action_queue.py
│   │   ├── test_result_speaker.py
│   │   ├── test_skill_bridge.py
│   │   ├── test_capabilities.py
│   │   ├── test_agent_controller.py
│   │   ├── test_ui_bridge.py
│   │   └── test_creator.py
│   ├── emotion/
│   │   ├── __init__.py
│   │   ├── test_detector.py
│   │   ├── test_tracker.py
│   │   └── test_responder.py
│   ├── personality/
│   │   ├── __init__.py
│   │   ├── test_profile.py
│   │   ├── test_modulator.py
│   │   └── test_switcher.py
│   ├── memory/
│   │   ├── __init__.py
│   │   └── test_conversation_history.py
│   ├── testing/
│   │   ├── __init__.py
│   │   ├── test_validator.py
│   │   └── test_self_healing.py
│   ├── devices/
│   │   ├── __init__.py
│   │   ├── test_manager.py
│   │   └── test_scanner.py
│   └── voice/
│       ├── __init__.py
│       ├── test_wake_vad.py
│       └── test_agent_api.py
├── integration/
│   ├── __init__.py
│   ├── test_goose_bridge_agent_controller.py
│   ├── test_emotion_tracker_responder.py
│   ├── test_intent_router_action_queue.py
│   ├── test_personality_modulator_bridge.py
│   ├── test_creator_healing_loop.py
│   ├── test_device_manager_scanner.py
│   └── test_wake_vad_agent_api.py
├── e2e/
│   ├── __init__.py
│   ├── test_conscious_api.py          # EXISTS — 25 tests
│   ├── test_voice_flow.py
│   ├── test_device_flow.py
│   ├── test_creator_flow.py
│   ├── test_emotion_flow.py
│   ├── test_personality_flow.py
│   └── test_wake_vad_flow.py
├── performance/
│   ├── __init__.py
│   ├── test_audio_latency.py
│   ├── test_emotion_inference.py
│   ├── test_api_throughput.py
│   ├── test_websocket_throughput.py
│   └── test_memory_usage.py
└── security/                          # Agent 6 creates these
    └── __init__.py
```

Create ALL `__init__.py` files and the directory structure.

### TASK 5.2: Create Root conftest.py

**File:** `G:\goose\external\conscious\tests\conftest.py`

```python
"""Root conftest — shared fixtures for all Conscious tests."""
import asyncio
import pytest
import tempfile
from pathlib import Path


@pytest.fixture
def event_loop():
    """Create a new event loop for each test."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def tmp_dir(tmp_path):
    """Provide a temporary directory for test file I/O."""
    return tmp_path


@pytest.fixture
def mock_goose_bridge():
    """Provide a MockGooseBridge that doesn't make real HTTP calls."""
    from tests.fixtures.mock_goose_bridge import MockGooseBridge
    return MockGooseBridge()


@pytest.fixture
def conversation_history(tmp_path):
    """Provide a ConversationHistory writing to a temp directory."""
    from conscious.memory.conversation_history import ConversationHistory
    return ConversationHistory(history_dir=tmp_path / "history")


@pytest.fixture
def personality_switcher():
    """Provide a PersonalitySwitcher with default profile."""
    from conscious.personality.switcher import PersonalitySwitcher
    return PersonalitySwitcher()


@pytest.fixture
def emotion_tracker():
    """Provide a fresh EmotionTracker."""
    from conscious.emotion.tracker import EmotionTracker
    return EmotionTracker()


@pytest.fixture
def intent_router():
    """Provide a fresh IntentRouter."""
    from conscious.agentic.intent_router import IntentRouter
    return IntentRouter()


@pytest.fixture
def result_speaker():
    """Provide a ResultSpeaker."""
    from conscious.agentic.result_speaker import ResultSpeaker
    return ResultSpeaker()


@pytest.fixture
def capability_registry():
    """Provide a CapabilityRegistry."""
    from conscious.agentic.capabilities import CapabilityRegistry
    return CapabilityRegistry()
```

### TASK 5.3: Create All 6 Test Fixture Files

Create the fixtures as specified in `CONSCIOUS_FULL_AUDIT.md` section 16.5:
- `tests/fixtures/__init__.py` (empty)
- `tests/fixtures/mock_goose_bridge.py` (MockGooseBridge class)
- `tests/fixtures/mock_http_server.py` (MockConsciousServer class)
- `tests/fixtures/audio_helpers.py` (make_silence, make_sine_wave, make_noise)
- `tests/fixtures/emotion_helpers.py` (make_emotion, make_frustrated_sequence, etc.)
- `tests/fixtures/personality_helpers.py` (get_default_profile, get_test_profile)

See `CONSCIOUS_FULL_AUDIT.md` section 16.5 for exact implementation code.

---

## Phase 2 Tasks (Unit Tests — Parallelizable by Module)

### TASK 5.4: Agentic Module Unit Tests (103 tests across 9 files)

Full test specifications are in `CONSCIOUS_FULL_AUDIT.md` section 5.1. Key files:

**test_intent_router.py (~15 tests):** Token accumulation, intent classification (chat vs action), pattern matching for all ~20 regex patterns, flush behavior, callback invocation, edge cases.

**test_goose_bridge.py (~12 tests):** Health check (mock server up/down), execute with emotion prefix, send returns GooseResult, connection error handling, timeout handling, streaming, conversation context.

**test_action_queue.py (~10 tests):** Enqueue, start/stop worker, serial execution, queue size limit, is_busy flag, result callback, timeout handling, history tracking.

**test_result_speaker.py (~8 tests):** Markdown stripping, code block removal, number humanization, URL simplification, truncation, empty string, action kwarg.

**test_skill_bridge.py (~8 tests):** Parse run/save/list commands, non-skill text returns None, to_goose_prompt generation.

**test_capabilities.py (~10 tests):** Registry loads all, lookup by trigger/name, list by category, no duplicates, required fields, search, serialization.

**test_agent_controller.py (~20 tests):** Route to each handler category, specific action handlers (theme, model, mood, memory, personality, devices, testing), fallback to goose freeform.

**test_ui_bridge.py (~8 tests):** Start/stop server, send command serialization, no-client handling, client tracking, history cap, get_status.

**test_creator.py (~12 tests):** Parse creation commands (personality/skill/prompt), build prompts, save/promote artifacts, history.

### TASK 5.5: Emotion Module Unit Tests (32 tests across 3 files)

**test_detector.py (~10 tests):** Init, config, enabled property, feed_audio buffer, disabled returns false, clear buffer, should_classify interval, buffer duration.

**test_tracker.py (~12 tests):** Add emotion, window limit, empty check, get_latest, trend detection (improving/declining/volatile/stable), dominant emotion, get_mood, frustration detection, happiness detection.

**test_responder.py (~10 tests):** Modulate for neutral/frustrated/happy, break detection, conscious prefix with emotion+trend, volatile override, response dict.

### TASK 5.6: Personality Module Unit Tests (26 tests across 3 files)

**test_profile.py (~8 tests):** All 13 profiles load, get by name, unknown returns None, content rating filtering, from_dict/to_dict round trip, default profile.

**test_modulator.py (~10 tests):** Hesitation/breath/pause injection, empty text, greetings/acknowledgments/thinking phrases, prompt prefix, catchphrase application, stutter rate.

**test_switcher.py (~8 tests):** Default profile, switch to known/unknown, content rating block, mature content toggle, on_switch callback, status, history.

### TASK 5.7: Memory Module Unit Tests (10 tests in 1 file)

**test_conversation_history.py (~10 tests):** Add entry, get transcript, get summary, save session creates file, load previous sessions, directory creation, clear, timestamps, speaker labels, max entries.

### TASK 5.8: Testing Module Unit Tests (16 tests across 2 files)

**test_validator.py (~8 tests):** Run Playwright (mock subprocess), parse results, timeout, status types, failure extraction, duration tracking.

**test_self_healing.py (~8 tests):** Heal succeeds first attempt, retries up to max, calls goose_send with fix prompt, promotes on success, validate_and_heal_feature, history, max retries, build fix prompt.

### TASK 5.9: Device Module Unit Tests (20 tests across 2 files)

**test_manager.py (~12 tests):** Creator mode default/enable/disable, scan blocked without creator mode, add/remove device, list all/by type, persist/load registry, status, probe.

**test_scanner.py (~8 tests):** ARP parse, port scan, MAC fingerprinting, device type detection (RPi, printer, Android), dataclass conversion, timeout.

### TASK 5.10: Voice Module Unit Tests (27 tests across 2 files)

**test_wake_vad.py (~12 tests):** Wake word detector init, positive/negative detection, VAD speech/silence, pipeline state transitions, callbacks, audio resampling, start/stop, idle state.

**test_agent_api.py (~15 tests):** Route handler unit tests — mock the subsystems and verify each handler returns correct JSON shape.

---

## Phase 3 Tasks (Integration + E2E Tests)

### TASK 5.11: Integration Tests (44 tests across 7 files)

Full specs in `CONSCIOUS_FULL_AUDIT.md` section 6. Key integration pairs:
- GooseBridge ↔ AgentController (8 tests)
- EmotionTracker ↔ Responder (6 tests)
- IntentRouter ↔ ActionQueue (6 tests)
- PersonalityModulator ↔ GooseBridge (6 tests)
- Creator ↔ SelfHealingLoop (6 tests)
- DeviceManager ↔ Scanner (6 tests)
- WakeVAD ↔ AgentAPI (6 tests)

### TASK 5.12: E2E Tests (42 tests across 6 new files)

Full specs in `CONSCIOUS_FULL_AUDIT.md` section 7. New E2E flow tests:
- Voice flow (10 tests): connect→speak→disconnect cycle
- Device flow (8 tests): creator mode→scan→add→remove
- Creator flow (6 tests): create→validate→promote
- Emotion flow (6 tests): feed audio→check status→mood updates
- Personality flow (6 tests): switch→verify effect→list
- WakeVAD flow (6 tests): toggle→detect→process

### TASK 5.13: Performance Tests (19 tests across 5 files)

Full specs in `CONSCIOUS_FULL_AUDIT.md` section 8:
- Audio latency (5 tests): round-trip, resampling, buffer fill
- Emotion inference (4 tests): classification speed, model load, GPU memory
- API throughput (4 tests): concurrent requests, p95 latency
- WebSocket throughput (3 tests): audio chunks/sec, broadcast, reconnection
- Memory usage (3 tests): stability after 1000 requests, long sessions

---

## Test Writing Guidelines

### Every test MUST:
1. Be self-contained — no dependency on other tests' execution order
2. Use fixtures from conftest.py — no global state
3. Use tmp_path for any file I/O — no writing to real filesystem
4. Assert specific outcomes — not just "no error thrown"
5. Test error cases — not just happy path
6. Have a descriptive name starting with `test_`
7. Complete within timeout (30s unit, 60s integration/E2E, 120s performance)

### Test template:
```python
import pytest
from conscious.agentic.intent_router import IntentRouter, IntentType

class TestIntentRouter:
    """Tests for IntentRouter intent classification."""

    def test_classify_chat_intent(self, intent_router):
        """Regular conversational text should classify as CHAT."""
        result = intent_router._classify("hello how are you")
        assert result.intent == IntentType.CHAT

    def test_classify_action_intent(self, intent_router):
        """Actionable commands should classify as ACTION."""
        result = intent_router._classify("run the tests")
        assert result.intent == IntentType.ACTION
        assert result.action is not None

    @pytest.mark.asyncio
    async def test_feed_token_accumulates(self, intent_router):
        """Feeding tokens should accumulate in the buffer."""
        intent_router.feed_token("hello")
        intent_router.feed_token(" world")
        # Verify buffer state or flush result
```

---

## Verification Checkpoints

### After Phase 1 (Infrastructure):
```bash
cd G:\goose\external\conscious && python -m pytest tests/ --collect-only 2>&1 | head -20
# Should show "X items collected" with no import errors
```

### After Phase 2 (Unit Tests):
```bash
cd G:\goose\external\conscious && python -m pytest tests/unit/ -v --timeout=30 -x
# Target: 238+ tests, ALL passing
```

### After Phase 3 (Integration + E2E + Performance):
```bash
cd G:\goose\external\conscious && python -m pytest tests/ -v --timeout=120
# Target: 363+ tests total, ALL passing
```

### Coverage Report:
```bash
cd G:\goose\external\conscious && python -m pytest tests/unit/ --cov=conscious --cov-report=term-missing --timeout=30
# Target: >80% coverage on critical modules
```

---

## Files Created Summary

| Count | Category | Location |
|-------|----------|----------|
| 1 | conftest.py | `tests/conftest.py` |
| 6 | Fixtures | `tests/fixtures/` |
| 23 | Unit test files | `tests/unit/` |
| 7 | Integration test files | `tests/integration/` |
| 6 | E2E test files | `tests/e2e/` |
| 5 | Performance test files | `tests/performance/` |
| ~20 | `__init__.py` files | Various |
| **~68** | **Total new files** | |
