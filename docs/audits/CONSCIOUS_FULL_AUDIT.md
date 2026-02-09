# Conscious + Super-Goose — Complete Codebase Audit & Agent Task List

> **Generated**: 2026-02-08 | **Auditor**: Cascade + Opus 4.5
> **Purpose**: Comprehensive task list for Claude agents to complete all remaining work.
> **Scope**: Conscious (G:\goose\external\conscious) + Super-Goose UI (G:\goose\ui\desktop) + Android (G:\goose\ui\mobile\android)

---

## Table of Contents

1. [Quick Start & Paths](#1-quick-start--paths)
2. [Architecture Overview](#2-architecture-overview)
3. [Completed Fixes (Already Done)](#3-completed-fixes-already-done)
4. [Critical Bugs — Must Fix](#4-critical-bugs--must-fix)
5. [Missing Unit Tests](#5-missing-unit-tests)
6. [Missing Integration Tests](#6-missing-integration-tests)
7. [Missing E2E Tests](#7-missing-e2e-tests)
8. [Missing Performance Tests](#8-missing-performance-tests)
9. [Missing Security Tests](#9-missing-security-tests)
10. [Unfinished Features](#10-unfinished-features)
11. [Wiring Gaps](#11-wiring-gaps)
12. [UI/UX Gaps](#12-uiux-gaps)
13. [Dependency Issues](#13-dependency-issues)
14. [Android App Gaps](#14-android-app-gaps)
15. [Documentation Gaps](#15-documentation-gaps)
16. [API Endpoint Verification Matrix](#16-api-endpoint-verification-matrix)
17. [Smoke Test Commands](#17-smoke-test-commands)
18. [Module-by-Module Detailed Status](#18-module-by-module-detailed-status)

---

## 🚨 PRIORITY ORDER — Work In This Sequence

**Phase A — Unblock Everything** ✅ DONE
1. ~~Fix BUG-001: Add `aiohttp` to pyproject.toml~~ ✅
2. ~~Fix BUG-002: Add `websockets` to pyproject.toml~~ ✅
3. ~~Fix BUG-005: Add CORS middleware to `agent_api.py:build_app()`~~ ✅
4. ~~Fix BUG-003, BUG-004: Add `openwakeword`, `paramiko` to optional deps~~ ✅

**Phase B — Fix Remaining Bugs** ✅ DONE (BUG-006/008/009 were false positives)
5. ~~BUG-006: ConversationHistory.clear() exists~~ ❌ FALSE POSITIVE
6. BUG-007: Android `gradle-wrapper.jar` — DEFERRED (Android scope)
7. ~~BUG-008: SelfHealingLoop._save_artifact~~ ❌ FALSE POSITIVE
8. ~~BUG-009: ResultSpeaker.to_speech() signature~~ ❌ FALSE POSITIVE

**Phase C — Create Test Fixtures** ✅ DONE
9. ~~conftest.py with 8 shared fixtures~~ ✅
10. ~~MockGooseBridge fixture for isolated testing~~ ✅

**Phase D — Unit Tests** ✅ PARTIAL (50 tests passing)
11. ~~Agentic: test_skill_bridge (12), test_result_speaker (8), test_capabilities (7)~~ ✅
12. Emotion: test_tracker (8) — blocked on numpy install
13. ~~Personality: test_switcher (7)~~ ✅
14. Memory: deferred
15. Testing: deferred
16. ~~Device: test_ssh_security (16)~~ ✅
17. Voice: deferred (heavy deps)

**Phase E — Integration + E2E Tests** ✅ PARTIAL (24 integration tests passing)
18. ~~Integration: test_api_endpoints (24 tests — health, validation, size limits)~~ ✅
19. E2E tests: deferred

**Phase F — Wire Missing Features** ✅ DONE
20. ~~PersonalityModulator wired into response pipeline~~ ✅ (Agent 2)
21. ~~SkillBridge wired into agent_controller~~ ✅ (Agent 2)
22. ~~ConversationHistory already wired~~ ✅ (verified)
23. ~~IntentRouter already synced with CapabilityRegistry~~ ✅ (verified)
24. ~~All 7 UI components created + integrated~~ ✅ (Agent 1)

**Phase G — Security Hardening** ✅ DONE
25. ~~SSH command injection prevention (whitelist + char filter)~~ ✅ (Agent 6)
26. ~~Bind address changed to 127.0.0.1~~ ✅ (Agent 6)
27. ~~/api/health endpoint added~~ ✅ (Agent 6)
28. ~~Input validation on all toggle/execute endpoints~~ ✅ (Agent 2)
29. ~~client_max_size=1MB~~ ✅ (Agent 2)
30. ~~Circuit breaker in GooseBridge~~ ✅ (Agent 4)
31. ~~Graceful shutdown with per-subsystem timeouts~~ ✅ (Agent 4)
32. ~~UIBridge concurrency fix (asyncio.Lock)~~ ✅ (Agent 3)

**Phase H — Documentation + Android (~2 hours)**
33. ~~Audit docs updated with all fix markers~~ ✅
34. Android: ConsciousClient.kt, ConsciousScreen.kt — DEFERRED

**Remaining Work**: Android app integration, emotion tests (needs numpy), full E2E suite, performance benchmarks

---

## 1. Quick Start & Paths

### Conscious (Python Backend)
```
Root:           G:\goose\external\conscious
Source:         G:\goose\external\conscious\src\conscious\
Tests:          G:\goose\external\conscious\tests\
Config:         G:\goose\external\conscious\pyproject.toml
Entry point:    python -m conscious   (runs conscious.server:main)
API port:       8999 (HTTP REST)
Moshi port:     8998 (WebSocket audio)
UI Bridge port: 8997 (WebSocket commands)
Python:         >=3.10, tested on 3.13
```

### Super-Goose Electron UI
```
Root:           G:\goose\ui\desktop
Components:     G:\goose\ui\desktop\src\components\
Conscious UI:   G:\goose\ui\desktop\src\components\conscious\
Settings:       G:\goose\ui\desktop\src\components\settings\
Build:          npm run build (Vite + Electron Forge)
Test:           npm run test:run (Vitest)
```

### Android App
```
Root:           G:\goose\ui\mobile\android
Package:        com.block.goose
Build:          ./gradlew assembleDebug
Kotlin:         2.1.0, Compose BOM 2024.12.01
Min SDK:        28 (Android 9), Target: 35 (Android 15)
```

### Key Commands
```bash
# Start Conscious backend
cd G:\goose\external\conscious && python -m conscious --auto-start

# Run Python syntax check on all modules
python -c "import py_compile; import glob; files=glob.glob('src/conscious/**/*.py', recursive=True); [py_compile.compile(f, doraise=True) for f in files]; print(f'{len(files)} files OK')"

# Run existing E2E tests
cd G:\goose\external\conscious && python -m pytest tests/e2e/ -v

# Run Electron UI tests
cd G:\goose\ui\desktop && npm run test:run

# Build Android
cd G:\goose\ui\mobile\android && gradlew assembleDebug
```

---

## 2. Architecture Overview

### Conscious Python Modules
```
conscious/
├── __init__.py              # Package root, version info
├── config.py                # ConsciousConfig dataclass, env loading
├── server.py                # Main entry point, CLI arg parsing
├── voice/
│   ├── agent_api.py         # 44KB — Master API server, 33 routes, all subsystem wiring
│   ├── moshi_agent.py       # WebSocket client to Moshi server
│   ├── moshi_engine.py      # Moshi model loading and inference
│   ├── audio_stream.py      # Audio I/O (sounddevice)
│   ├── server_manager.py    # Moshi server lifecycle management
│   └── wake_vad.py          # Wake word ("Hey Goose") + Voice Activity Detection
├── agentic/
│   ├── agent_controller.py  # Central command dispatcher (40+ capabilities)
│   ├── capabilities.py      # CapabilityRegistry with voice triggers
│   ├── goose_bridge.py      # HTTP client to goosed /reply endpoint
│   ├── intent_router.py     # Voice token → intent classification
│   ├── action_queue.py      # Async queue for non-blocking tool execution
│   ├── result_speaker.py    # Tool result → speakable text
│   ├── skill_bridge.py      # Voice-triggered skill execution
│   ├── ui_bridge.py         # WebSocket server → Electron UI
│   └── creator.py           # AI artifact generation (personalities, skills, prompts)
├── emotion/
│   ├── detector.py          # Wav2Vec2 emotion classification (8 emotions)
│   ├── tracker.py           # Sliding window mood tracking
│   └── responder.py         # Emotion-aware response modulation
├── personality/
│   ├── profile.py           # 13 personality profiles (dataclasses)
│   ├── modulator.py         # Speech pattern injection (hesitation, stutter, etc.)
│   └── switcher.py          # Active profile management
├── memory/
│   └── conversation_history.py  # JSON-based session transcript storage
├── testing/
│   ├── validator.py         # Playwright test runner (subprocess)
│   └── self_healing.py      # Auto-fix + re-test loop via GooseBridge
├── devices/
│   ├── manager.py           # Device registry, Creator Mode gating
│   └── scanner.py           # ARP/port scanning, device fingerprinting
└── data/
    └── __init__.py          # Data assets directory
```

### 33 Registered API Routes (agent_api.py:939-987)
| Group       | Method | Path                           | Handler                          |
| ----------- | ------ | ------------------------------ | -------------------------------- |
| Voice       | GET    | `/api/voice/status`            | `handle_status`                  |
| Voice       | POST   | `/api/voice/connect`           | `handle_connect`                 |
| Voice       | POST   | `/api/voice/disconnect`        | `handle_disconnect`              |
| Voice       | POST   | `/api/voice/reconnect`         | `handle_reconnect`               |
| Voice       | POST   | `/api/voice/audio`             | `handle_send_audio`              |
| Voice       | POST   | `/api/voice/start`             | `handle_start`                   |
| Voice       | POST   | `/api/voice/stop`              | `handle_stop`                    |
| Voice       | GET    | `/api/voice/stream`            | `handle_stream`                  |
| Agentic     | GET    | `/api/agentic/status`          | `handle_agentic_status`          |
| Agentic     | POST   | `/api/agentic/toggle`          | `handle_agentic_toggle`          |
| Agentic     | POST   | `/api/agentic/execute`         | `handle_agentic_execute`         |
| Emotion     | GET    | `/api/emotion/status`          | `handle_emotion_status`          |
| Emotion     | POST   | `/api/emotion/toggle`          | `handle_emotion_toggle`          |
| Memory      | GET    | `/api/memory/status`           | `handle_memory_status`           |
| Personality | GET    | `/api/personality/status`      | `handle_personality_status`      |
| Personality | POST   | `/api/personality/switch`      | `handle_personality_switch`      |
| Personality | GET    | `/api/personality/list`        | `handle_personality_list`        |
| Creator     | POST   | `/api/creator/create`          | `handle_creator_create`          |
| Creator     | GET    | `/api/creator/history`         | `handle_creator_history`         |
| Creator     | POST   | `/api/creator/promote`         | `handle_creator_promote`         |
| Testing     | POST   | `/api/testing/validate`        | `handle_testing_validate`        |
| Testing     | POST   | `/api/testing/heal`            | `handle_testing_heal`            |
| Testing     | GET    | `/api/testing/history`         | `handle_testing_history`         |
| Devices     | GET    | `/api/devices/status`          | `handle_devices_status`          |
| Devices     | POST   | `/api/devices/scan`            | `handle_devices_scan`            |
| Devices     | POST   | `/api/devices/probe`           | `handle_devices_probe`           |
| Devices     | POST   | `/api/devices/add`             | `handle_devices_add`             |
| Devices     | POST   | `/api/devices/remove`          | `handle_devices_remove`          |
| Devices     | POST   | `/api/devices/creator-mode`    | `handle_devices_creator_mode`    |
| Devices     | POST   | `/api/devices/printer`         | `handle_devices_printer_command` |
| Devices     | POST   | `/api/devices/ssh`             | `handle_devices_ssh`             |
| Agent       | POST   | `/api/agent/execute`           | `handle_agent_execute`           |
| Agent       | GET    | `/api/agent/capabilities`      | `handle_agent_capabilities`      |
| Agent       | GET    | `/api/agent/controller-status` | `handle_agent_controller_status` |
| WakeVAD     | GET    | `/api/wake-vad/status`         | `handle_wake_vad_status`         |
| WakeVAD     | POST   | `/api/wake-vad/toggle`         | `handle_wake_vad_toggle`         |

---

## 3. Completed Fixes (Already Done)

These bugs were found and fixed during the audit. **No action needed.**

| #   | File                              | Bug                                                                        | Fix Applied                                             |
| --- | --------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | `voice/agent_api.py:665-670`      | `save_artifact(req, goose_result)` passed GooseResult object               | → `save_artifact(req, goose_result.text)`               |
| 2   | `voice/agent_api.py:147-155`      | SelfHealingLoop `goose_send` expected str, got GooseResult                 | → Wrapper `_goose_send_text()` extracts `.text`         |
| 3   | `agentic/agent_controller.py`     | `memory.get_status()` method doesn't exist                                 | → `memory.get_summary()`                                |
| 4   | `agentic/agent_controller.py`     | `list_profiles()` method doesn't exist                                     | → `list_available()`                                    |
| 5   | `agentic/agent_controller.py:259` | `mood.trend.value` — trend is str not Enum                                 | → `mood.trend`                                          |
| 6   | `emotion/detector.py:142-148`     | No `enabled` property on EmotionDetector                                   | → Added property + setter                               |
| 7   | `agentic/agent_controller.py`     | `validate_all()` / `heal_all()` don't exist                                | → `run_full_suite()` / `validate_and_heal_feature()`    |
| 8   | `voice/agent_api.py:278-282`      | `UIBridge.stop()` never called on shutdown                                 | → Added to `stop_all()`                                 |
| 9   | UI wiring                         | ConsciousBridge, VoiceToggle, OutputWaveform, PersonalitySelector orphaned | → Created ConsciousSection.tsx, wired into SettingsView |

---

## 4. Critical Bugs — Must Fix

### ~~BUG-001: `aiohttp` missing from pyproject.toml dependencies~~ ✅ FIXED
- **File**: `G:\goose\external\conscious\pyproject.toml`
- **Fix Applied**: Added `"aiohttp>=3.9.0"` and `"aiohttp-cors>=0.7.0"` to `dependencies` list
- **Fixed By**: Lead Engineer (2026-02-09)

### ~~BUG-002: `websockets` missing from pyproject.toml dependencies~~ ✅ FIXED
- **File**: `G:\goose\external\conscious\pyproject.toml`
- **Fix Applied**: Added `"websockets>=12.0"` to `dependencies` list
- **Fixed By**: Lead Engineer (2026-02-09)

### ~~BUG-003: `openwakeword` missing from pyproject.toml dependencies~~ ✅ FIXED
- **File**: `G:\goose\external\conscious\pyproject.toml`
- **Fix Applied**: Added `openwakeword>=0.6.0` and `onnxruntime>=1.16.0` to `[wake]` optional deps
- **Fixed By**: Lead Engineer (2026-02-09)

### ~~BUG-004: `paramiko` missing from pyproject.toml dependencies~~ ✅ FIXED
- **File**: `G:\goose\external\conscious\pyproject.toml`
- **Fix Applied**: Added `paramiko>=3.4.0` to `[devices]` optional deps
- **Fixed By**: Lead Engineer (2026-02-09)

### ~~BUG-005: No CORS headers on API~~ ✅ FIXED
- **File**: `G:\goose\external\conscious\src\conscious\voice\agent_api.py`
- **Fix Applied**: Added `aiohttp_cors` middleware to `build_app()` with all routes registered
- **Fixed By**: Lead Engineer (2026-02-09)

### ~~BUG-006: `ConversationHistory.clear()` method may not exist~~ ❌ FALSE POSITIVE
- **File**: `G:\goose\external\conscious\src\conscious\memory\conversation_history.py:180-182`
- **Status**: Method EXISTS. `clear()` is implemented and clears `self._entries`.
- **Verified By**: Lead Engineer (2026-02-09)

### BUG-007: Android `gradle-wrapper.jar` binary missing
- **File**: `G:\goose\ui\mobile\android\gradle\wrapper\`
- **Impact**: `gradlew` / `gradlew.bat` scripts exist but the jar binary doesn't
- **Fix**: Run `gradle wrapper` in the android directory, or download from Gradle releases
- **Priority**: MEDIUM — Android build won't bootstrap

### ~~BUG-008: `SelfHealingLoop._save_artifact` is never set~~ ❌ FALSE POSITIVE
- **File**: `G:\goose\external\conscious\src\conscious\testing\self_healing.py:71-83`
- **Status**: `__init__` accepts `save_artifact: Optional[SaveFn] = None` (line 75). It IS accepted.
- **Verified By**: Lead Engineer (2026-02-09)

### ~~BUG-009: `ResultSpeaker.to_speech()` may not match signature~~ ❌ FALSE POSITIVE
- **File**: `G:\goose\external\conscious\src\conscious\agentic\result_speaker.py:62`
- **Status**: Signature is `to_speech(self, text: str, action: str = "")` — matches call site exactly.
- **Verified By**: Lead Engineer (2026-02-09)

---

## 5. Missing Unit Tests

**Current coverage: 74 tests passing (50 unit + 24 integration). Target: 80%+**
**Status**: ✅ PARTIAL — Core test infrastructure created. Key modules covered: SkillBridge (12), ResultSpeaker (8), Capabilities (7), PersonalitySwitcher (7), SSH Security (16), API Validation (24).

Tests live in `G:\goose\external\conscious\tests\unit\` and `G:\goose\external\conscious\tests\integration\`. Use `pytest` + `pytest-asyncio`.

### 5.1 Agentic Module Tests
```
tests/unit/agentic/
├── test_intent_router.py         # ~15 tests
├── test_goose_bridge.py          # ~12 tests
├── test_action_queue.py          # ~10 tests
├── test_result_speaker.py        # ~8 tests
├── test_skill_bridge.py          # ~8 tests
├── test_capabilities.py          # ~10 tests
├── test_agent_controller.py      # ~20 tests
├── test_ui_bridge.py             # ~8 tests
└── test_creator.py               # ~12 tests
```

#### test_intent_router.py (~15 tests)
- [ ] `test_feed_token_accumulates_text` — tokens build up in buffer
- [ ] `test_classify_chat_intent` — "hello how are you" → IntentType.CHAT
- [ ] `test_classify_action_intent` — "run the tests" → IntentType.ACTION
- [ ] `test_action_pattern_matching` — each of the ~20 regex patterns
- [ ] `test_flush_returns_result_when_buffer_has_content`
- [ ] `test_flush_returns_none_when_buffer_empty`
- [ ] `test_debounce_prevents_duplicate_classification`
- [ ] `test_pause_detection_triggers_classification`
- [ ] `test_sentence_end_triggers_classification`
- [ ] `test_callback_called_on_action_intent`
- [ ] `test_callback_not_called_on_chat_intent`
- [ ] `test_confidence_threshold_respected`
- [ ] `test_empty_string_handling`
- [ ] `test_unicode_text_handling`
- [ ] `test_very_long_text_handling`

#### test_goose_bridge.py (~12 tests)
- [ ] `test_health_check_returns_true_when_server_up` (mock HTTP)
- [ ] `test_health_check_returns_false_when_server_down`
- [ ] `test_execute_sends_correct_prompt_for_each_action`
- [ ] `test_execute_includes_emotion_prefix_when_set`
- [ ] `test_set_emotion_prefix_updates_state`
- [ ] `test_send_returns_goose_result_with_text`
- [ ] `test_send_handles_connection_error_gracefully`
- [ ] `test_send_handles_timeout`
- [ ] `test_streaming_execute_yields_tokens`
- [ ] `test_conversation_context_maintained_across_calls`
- [ ] `test_conversation_context_window_limit`
- [ ] `test_prompt_building_for_all_action_types`

#### test_action_queue.py (~10 tests)
- [ ] `test_enqueue_adds_action_to_queue`
- [ ] `test_start_creates_background_worker`
- [ ] `test_stop_cancels_worker`
- [ ] `test_serial_execution_one_at_a_time`
- [ ] `test_queue_size_limit_respected`
- [ ] `test_is_busy_returns_true_during_execution`
- [ ] `test_result_callback_called_with_speech_text`
- [ ] `test_started_callback_called_before_execution`
- [ ] `test_timeout_handling_kills_stale_actions`
- [ ] `test_history_tracks_completed_actions`

#### test_result_speaker.py (~8 tests)
- [ ] `test_markdown_stripping` — removes `**bold**`, `# headers`, etc.
- [ ] `test_code_block_removal`
- [ ] `test_number_humanization` — "47" → "forty-seven"
- [ ] `test_url_simplification`
- [ ] `test_list_formatting_for_speech`
- [ ] `test_empty_string_returns_empty`
- [ ] `test_very_long_text_truncation`
- [ ] `test_to_speech_with_action_kwarg`

#### test_skill_bridge.py (~8 tests)
- [ ] `test_parse_run_skill_command`
- [ ] `test_parse_save_skill_command`
- [ ] `test_parse_list_skills_command`
- [ ] `test_parse_returns_none_for_non_skill_text`
- [ ] `test_to_goose_prompt_run_skill`
- [ ] `test_to_goose_prompt_save_skill_with_name`
- [ ] `test_to_goose_prompt_save_skill_without_name`
- [ ] `test_is_skill_command_convenience_method`

#### test_capabilities.py (~10 tests)
- [ ] `test_registry_loads_all_capabilities`
- [ ] `test_get_by_voice_trigger_finds_capability`
- [ ] `test_get_by_action_name_finds_capability`
- [ ] `test_list_by_category_filters_correctly`
- [ ] `test_all_categories_have_at_least_one_capability`
- [ ] `test_no_duplicate_action_names`
- [ ] `test_no_duplicate_voice_triggers`
- [ ] `test_capability_has_required_fields`
- [ ] `test_search_capabilities_by_keyword`
- [ ] `test_to_dict_serialization`

#### test_agent_controller.py (~20 tests)
- [ ] `test_execute_routes_to_settings_handler`
- [ ] `test_execute_routes_to_device_handler`
- [ ] `test_execute_routes_to_self_handler`
- [ ] `test_execute_routes_to_creator_handler`
- [ ] `test_execute_routes_to_testing_handler`
- [ ] `test_execute_routes_to_goose_handler`
- [ ] `test_handle_settings_set_theme`
- [ ] `test_handle_settings_set_model`
- [ ] `test_handle_settings_toggle_voice`
- [ ] `test_handle_self_show_mood_returns_emotion_data`
- [ ] `test_handle_self_show_memory_returns_summary`
- [ ] `test_handle_self_clear_memory`
- [ ] `test_handle_self_list_personalities`
- [ ] `test_handle_self_switch_personality`
- [ ] `test_handle_self_toggle_emotion`
- [ ] `test_handle_device_scan_network`
- [ ] `test_handle_device_list_printers`
- [ ] `test_handle_testing_run_validation`
- [ ] `test_handle_testing_run_healing`
- [ ] `test_fallback_to_goose_freeform`

#### test_ui_bridge.py (~8 tests)
- [ ] `test_start_creates_websocket_server`
- [ ] `test_stop_closes_server`
- [ ] `test_send_command_serializes_json`
- [ ] `test_send_command_when_no_clients_returns_false`
- [ ] `test_client_connection_tracking`
- [ ] `test_client_disconnection_cleanup`
- [ ] `test_command_history_capped_at_100`
- [ ] `test_get_status_returns_correct_data`

#### test_creator.py (~12 tests)
- [ ] `test_parse_personality_creation_command`
- [ ] `test_parse_skill_creation_command`
- [ ] `test_parse_prompt_creation_command`
- [ ] `test_parse_returns_none_for_unrecognized`
- [ ] `test_build_generation_prompt_personality`
- [ ] `test_build_generation_prompt_skill`
- [ ] `test_save_artifact_creates_file`
- [ ] `test_save_artifact_staging_directory`
- [ ] `test_promote_to_active_moves_file`
- [ ] `test_promote_to_active_returns_none_if_missing`
- [ ] `test_get_history_returns_recent_items`
- [ ] `test_artifact_type_enum_values`

### 5.2 Emotion Module Tests
```
tests/unit/emotion/
├── test_detector.py              # ~10 tests
├── test_tracker.py               # ~12 tests
└── test_responder.py             # ~10 tests
```

#### test_detector.py (~10 tests)
- [ ] `test_init_with_default_config`
- [ ] `test_init_with_custom_config`
- [ ] `test_enabled_property_getter`
- [ ] `test_enabled_property_setter`
- [ ] `test_feed_audio_accumulates_buffer`
- [ ] `test_feed_audio_returns_true_when_buffer_ready`
- [ ] `test_feed_audio_disabled_returns_false`
- [ ] `test_clear_buffer_resets_state`
- [ ] `test_should_classify_respects_interval`
- [ ] `test_buffer_duration_calculation`

#### test_tracker.py (~12 tests)
- [ ] `test_add_emotion_stores_in_history`
- [ ] `test_window_size_limit_enforced`
- [ ] `test_is_empty_when_no_history`
- [ ] `test_get_latest_returns_last_added`
- [ ] `test_get_trend_stable_with_few_readings`
- [ ] `test_get_trend_improving`
- [ ] `test_get_trend_declining`
- [ ] `test_get_trend_volatile`
- [ ] `test_get_dominant_emotion`
- [ ] `test_get_mood_returns_full_summary`
- [ ] `test_is_user_frustrated_detection`
- [ ] `test_is_user_happy_detection`

#### test_responder.py (~10 tests)
- [ ] `test_modulate_from_mood_neutral`
- [ ] `test_modulate_from_mood_frustrated`
- [ ] `test_modulate_from_mood_happy`
- [ ] `test_should_offer_break_returns_true_on_high_frustration`
- [ ] `test_should_offer_break_returns_false_normally`
- [ ] `test_get_conscious_prefix_includes_emotion`
- [ ] `test_get_conscious_prefix_includes_trend`
- [ ] `test_trend_override_for_volatile`
- [ ] `test_break_detection_threshold`
- [ ] `test_response_modulation_to_dict`

### 5.3 Personality Module Tests
```
tests/unit/personality/
├── test_profile.py               # ~8 tests
├── test_modulator.py             # ~10 tests
└── test_switcher.py              # ~8 tests
```

#### test_profile.py (~8 tests)
- [ ] `test_all_13_profiles_load`
- [ ] `test_get_profile_by_name`
- [ ] `test_get_profile_returns_none_for_unknown`
- [ ] `test_list_profiles_excludes_mature_by_default`
- [ ] `test_list_profiles_includes_mature_when_allowed`
- [ ] `test_profile_from_dict_round_trip`
- [ ] `test_profile_to_dict_serialization`
- [ ] `test_default_profile_exists`

#### test_modulator.py (~10 tests)
- [ ] `test_modulate_adds_hesitation_sounds`
- [ ] `test_modulate_adds_breath_markers`
- [ ] `test_modulate_adds_pause_markers`
- [ ] `test_modulate_empty_text_unchanged`
- [ ] `test_get_greeting_returns_from_profile`
- [ ] `test_get_acknowledgment_returns_from_profile`
- [ ] `test_get_thinking_phrase_returns_from_profile`
- [ ] `test_get_prompt_prefix_combines_personality_and_emotion`
- [ ] `test_wrap_action_result_adds_catchphrase_sometimes`
- [ ] `test_stutter_rate_application`

#### test_switcher.py (~8 tests)
- [ ] `test_init_with_default_profile`
- [ ] `test_switch_to_known_profile`
- [ ] `test_switch_to_unknown_returns_none`
- [ ] `test_switch_blocked_by_content_rating`
- [ ] `test_allow_mature_enables_mature_profiles`
- [ ] `test_on_switch_callback_called`
- [ ] `test_get_status_returns_current_state`
- [ ] `test_history_tracks_switches`

### 5.4 Memory Module Tests
```
tests/unit/memory/
└── test_conversation_history.py  # ~10 tests
```

#### test_conversation_history.py (~10 tests)
- [ ] `test_add_entry_stores_transcript`
- [ ] `test_get_transcript_text_returns_recent`
- [ ] `test_get_summary_returns_counts`
- [ ] `test_save_session_creates_json_file`
- [ ] `test_load_previous_sessions_reads_files`
- [ ] `test_session_directory_created_on_init`
- [ ] `test_clear_removes_all_entries` (verify this method exists)
- [ ] `test_entry_timestamp_auto_set`
- [ ] `test_speaker_label_correct`
- [ ] `test_max_entries_limit`

### 5.5 Testing Module Tests
```
tests/unit/testing/
├── test_validator.py             # ~8 tests
└── test_self_healing.py          # ~8 tests
```

#### test_validator.py (~8 tests)
- [ ] `test_validate_artifact_runs_playwright`
- [ ] `test_validate_feature_runs_with_grep`
- [ ] `test_run_full_suite_runs_all_tests`
- [ ] `test_parse_json_results_correct`
- [ ] `test_timeout_handling`
- [ ] `test_validation_result_status_types`
- [ ] `test_failure_messages_extracted`
- [ ] `test_duration_tracked`

#### test_self_healing.py (~8 tests)
- [ ] `test_heal_succeeds_on_first_attempt`
- [ ] `test_heal_retries_up_to_max`
- [ ] `test_heal_calls_goose_send_with_fix_prompt`
- [ ] `test_heal_promotes_on_success`
- [ ] `test_validate_and_heal_feature`
- [ ] `test_history_tracks_healing_results`
- [ ] `test_max_retries_limit_respected`
- [ ] `test_build_fix_prompt_includes_failures`

### 5.6 Device Module Tests
```
tests/unit/devices/
├── test_manager.py               # ~12 tests
└── test_scanner.py               # ~8 tests
```

#### test_manager.py (~12 tests)
- [ ] `test_creator_mode_disabled_by_default`
- [ ] `test_enable_creator_mode`
- [ ] `test_disable_creator_mode`
- [ ] `test_scan_blocked_without_creator_mode`
- [ ] `test_add_device_manually`
- [ ] `test_remove_device`
- [ ] `test_list_devices_all`
- [ ] `test_list_devices_by_type_filter`
- [ ] `test_registry_persists_to_json`
- [ ] `test_registry_loads_from_json`
- [ ] `test_get_status_returns_summary`
- [ ] `test_probe_device_enriches_info`

#### test_scanner.py (~8 tests)
- [ ] `test_arp_scan_parses_output`
- [ ] `test_port_scan_detects_open_ports`
- [ ] `test_mac_fingerprinting_identifies_device_type`
- [ ] `test_raspberry_pi_detection`
- [ ] `test_3d_printer_detection`
- [ ] `test_android_detection`
- [ ] `test_scan_result_to_device_dataclass`
- [ ] `test_timeout_handling_on_slow_network`

### 5.7 Voice Module Tests
```
tests/unit/voice/
├── test_wake_vad.py              # ~12 tests
├── test_agent_api.py             # ~15 tests (route handler unit tests)
├── test_audio_stream.py          # ~6 tests
└── test_server_manager.py        # ~6 tests
```

#### test_wake_vad.py (~12 tests)
- [ ] `test_wake_word_detector_init`
- [ ] `test_wake_word_detection_positive`
- [ ] `test_wake_word_detection_negative`
- [ ] `test_vad_speech_detection`
- [ ] `test_vad_silence_detection`
- [ ] `test_pipeline_state_transitions`
- [ ] `test_pipeline_callback_on_wake_word`
- [ ] `test_pipeline_callback_on_speech_segment`
- [ ] `test_pipeline_callback_on_state_change`
- [ ] `test_audio_resampling_24k_to_16k`
- [ ] `test_start_stop_pipeline`
- [ ] `test_feed_audio_during_idle_state`

**Total Unit Tests Needed: ~238 tests across 23 test files**

---

## 6. Missing Integration Tests

**Current coverage: 0 integration tests.**

Create in `G:\goose\external\conscious\tests\integration\`.

### 6.1 Subsystem Pair Tests
```
tests/integration/
├── test_goose_bridge_agent_controller.py    # ~8 tests
├── test_emotion_tracker_responder.py        # ~6 tests
├── test_intent_router_action_queue.py       # ~6 tests
├── test_personality_modulator_bridge.py     # ~6 tests
├── test_creator_healing_loop.py             # ~6 tests
├── test_device_manager_scanner.py           # ~6 tests
└── test_wake_vad_agent_api.py               # ~6 tests
```

#### test_goose_bridge_agent_controller.py (~8 tests)
- [ ] `test_controller_routes_command_through_goose_bridge`
- [ ] `test_emotion_prefix_injected_into_goose_prompts`
- [ ] `test_streaming_execute_delivers_partial_results`
- [ ] `test_conversation_context_maintained_across_turns`
- [ ] `test_fallback_freeform_uses_goose_bridge`
- [ ] `test_health_check_propagates_to_status`
- [ ] `test_error_handling_when_goose_unreachable`
- [ ] `test_concurrent_requests_handled_serially`

#### test_emotion_tracker_responder.py (~6 tests)
- [ ] `test_tracker_feeds_mood_to_responder`
- [ ] `test_responder_generates_prefix_from_mood`
- [ ] `test_frustrated_mood_triggers_break_offer`
- [ ] `test_happy_mood_generates_positive_prefix`
- [ ] `test_volatile_trend_overrides_modulation`
- [ ] `test_empty_tracker_returns_neutral_response`

#### test_intent_router_action_queue.py (~6 tests)
- [ ] `test_action_intent_enqueued_in_queue`
- [ ] `test_chat_intent_not_enqueued`
- [ ] `test_queue_processes_actions_from_router`
- [ ] `test_result_callback_receives_speech_text`
- [ ] `test_queue_handles_router_flush`
- [ ] `test_rapid_intents_serialized`

#### test_personality_modulator_bridge.py (~6 tests)
- [ ] `test_prompt_prefix_includes_personality_and_emotion`
- [ ] `test_switching_personality_changes_prompt_prefix`
- [ ] `test_modulator_applies_speech_patterns_to_result`
- [ ] `test_mature_profiles_blocked_when_disabled`
- [ ] `test_greeting_changes_with_personality`
- [ ] `test_catchphrases_applied_to_action_results`

**Total Integration Tests Needed: ~44 tests across 7 files**

---

## 7. Missing E2E Tests

**Current coverage: 1 file with 25 tests (tests/e2e/test_conscious_api.py).**

### 7.1 Additional E2E Tests Needed
```
tests/e2e/
├── test_conscious_api.py         # EXISTS — 25 tests
├── test_voice_flow.py            # NEW — full voice pipeline
├── test_device_flow.py           # NEW — device management flow
├── test_creator_flow.py          # NEW — artifact creation → validation → promotion
├── test_emotion_flow.py          # NEW — emotion detection → mood → response modulation
├── test_personality_flow.py      # NEW — personality switching → prompt changes
└── test_wake_vad_flow.py         # NEW — wake word → listening → command → response
```

#### test_voice_flow.py (~10 tests)
- [ ] `test_full_voice_connect_speak_disconnect_cycle`
- [ ] `test_voice_command_triggers_action_execution`
- [ ] `test_audio_streaming_endpoint_sends_events`
- [ ] `test_concurrent_audio_and_commands`
- [ ] `test_reconnect_after_disconnect`
- [ ] `test_voice_status_updates_in_real_time`
- [ ] `test_moshi_server_auto_start`
- [ ] `test_moshi_server_health_monitoring`
- [ ] `test_audio_format_validation`
- [ ] `test_graceful_shutdown_saves_state`

#### test_device_flow.py (~8 tests)
- [ ] `test_enable_creator_mode_then_scan`
- [ ] `test_add_custom_device_then_list`
- [ ] `test_remove_device_then_verify_gone`
- [ ] `test_printer_gcode_command_flow`
- [ ] `test_ssh_command_execution_flow`
- [ ] `test_device_persistence_across_restart`
- [ ] `test_creator_mode_gates_all_operations`
- [ ] `test_device_probe_enriches_data`

#### test_creator_flow.py (~6 tests)
- [ ] `test_create_personality_via_api`
- [ ] `test_create_skill_via_api`
- [ ] `test_validate_artifact_then_promote`
- [ ] `test_self_healing_loop_fixes_artifact`
- [ ] `test_creation_history_tracked`
- [ ] `test_invalid_creation_command_returns_400`

#### test_emotion_flow.py (~6 tests)
- [ ] `test_feed_audio_then_check_emotion_status`
- [ ] `test_emotion_toggle_enables_disables`
- [ ] `test_emotion_mood_updates_over_time`
- [ ] `test_emotion_prefix_appears_in_goose_prompts`
- [ ] `test_break_offer_when_frustrated`
- [ ] `test_emotion_stream_events_broadcast`

#### test_personality_flow.py (~6 tests)
- [ ] `test_switch_personality_via_api`
- [ ] `test_list_personalities_api`
- [ ] `test_personality_affects_response_style`
- [ ] `test_mature_content_blocked_by_default`
- [ ] `test_personality_switch_via_voice_command`
- [ ] `test_personality_status_api`

#### test_wake_vad_flow.py (~6 tests)
- [ ] `test_wake_vad_status_api`
- [ ] `test_wake_vad_toggle_api`
- [ ] `test_wake_word_detected_triggers_listening`
- [ ] `test_speech_segment_processed_by_controller`
- [ ] `test_vad_state_transitions`
- [ ] `test_wake_vad_pipeline_start_stop`

**Total Additional E2E Tests Needed: ~42 tests across 6 new files**

---

## 8. Missing Performance Tests

Create in `G:\goose\external\conscious\tests\performance\`.

```
tests/performance/
├── test_audio_latency.py         # Audio pipeline latency benchmarks
├── test_emotion_inference.py     # Wav2Vec2 inference speed
├── test_api_throughput.py        # HTTP request handling under load
├── test_websocket_throughput.py  # WebSocket stream performance
└── test_memory_usage.py          # Memory footprint during operation
```

#### test_audio_latency.py (~5 tests)
- [ ] `test_audio_round_trip_under_200ms` — Moshi S2S latency target
- [ ] `test_audio_resampling_speed` — 24kHz→16kHz conversion
- [ ] `test_audio_buffer_fill_time` — time to accumulate 2.5s buffer
- [ ] `test_concurrent_audio_streams` — multiple clients
- [ ] `test_audio_underrun_recovery` — handling audio gaps

#### test_emotion_inference.py (~4 tests)
- [ ] `test_emotion_classification_under_100ms` — per-inference target
- [ ] `test_emotion_model_load_time` — cold start benchmark
- [ ] `test_emotion_gpu_memory_footprint` — VRAM usage
- [ ] `test_emotion_cpu_fallback_performance`

#### test_api_throughput.py (~4 tests)
- [ ] `test_100_concurrent_status_requests`
- [ ] `test_50_concurrent_execute_requests`
- [ ] `test_api_response_time_p95_under_500ms`
- [ ] `test_api_under_sustained_load_10min`

#### test_websocket_throughput.py (~3 tests)
- [ ] `test_stream_100_audio_chunks_per_second`
- [ ] `test_ui_bridge_broadcast_to_10_clients`
- [ ] `test_websocket_reconnection_speed`

#### test_memory_usage.py (~3 tests)
- [ ] `test_memory_stable_after_1000_requests`
- [ ] `test_conversation_history_memory_with_long_session`
- [ ] `test_emotion_detector_buffer_memory`

**Total Performance Tests Needed: ~19 tests across 5 files**

---

## 9. Missing Security Tests

Create in `G:\goose\external\conscious\tests\security\`.

```
tests/security/
├── test_api_input_validation.py  # Malicious input handling
├── test_ssh_security.py          # SSH command injection
├── test_device_scan_security.py  # Network scanning safety
└── test_cors_headers.py          # Cross-origin policy
```

#### test_api_input_validation.py (~8 tests)
- [ ] `test_sql_injection_in_text_field`
- [ ] `test_xss_in_personality_name`
- [ ] `test_path_traversal_in_staging_path`
- [ ] `test_oversized_request_body_rejected`
- [ ] `test_missing_required_fields_return_400`
- [ ] `test_invalid_json_returns_400`
- [ ] `test_empty_text_field_handling`
- [ ] `test_special_characters_in_commands`

#### test_ssh_security.py (~4 tests)
- [ ] `test_command_injection_via_semicolon`
- [ ] `test_command_injection_via_pipe`
- [ ] `test_command_injection_via_backtick`
- [ ] `test_allowed_commands_whitelist`

#### test_device_scan_security.py (~4 tests)
- [ ] `test_scan_blocked_without_creator_mode`
- [ ] `test_scan_limited_to_local_network`
- [ ] `test_ip_address_validation`
- [ ] `test_port_range_validation`

#### test_cors_headers.py (~4 tests)
- [ ] `test_cors_allows_localhost_origins`
- [ ] `test_cors_blocks_external_origins`
- [ ] `test_preflight_options_request_handled`
- [ ] `test_cors_headers_present_on_all_responses`

**Total Security Tests Needed: ~20 tests across 4 files**

---

## 10. Unfinished Features

### 10.1 Memory Bridge (Phase 3) — EMPTY STUB
- **Status**: `memory/conversation_history.py` exists but is basic JSON-file storage
- **Missing**: Integration with mem0ai / Qdrant for semantic memory
- **Files to create**:
  - `memory/semantic_memory.py` — Vector DB integration
  - `memory/memory_manager.py` — Unified memory interface (conversation + semantic)
- **Dependencies**: `mem0ai`, `qdrant-client`, `sentence-transformers` (already in optional deps)

### 10.2 Personality YAML Profiles (Phase 4) — Partial
- **Status**: 13 profiles defined as Python dicts in `profile.py`
- **Missing**: YAML file loading from `data/personalities/`
- **Original plan**: Load from `*.yaml` files for user extensibility
- **Files to create**:
  - `data/personalities/*.yaml` — External YAML profile files
  - Update `profile.py` to load from YAML directory

### 10.3 Voice-Controlled UI Actions — Partial
- **Status**: UIBridge sends commands, ConsciousBridge receives them
- **Missing**: Comprehensive command handler in Electron for all UI actions
- **The ConsciousBridge only handles `set_theme` currently**
- **Need to add handlers for**: `set_model`, `toggle_voice`, `set_volume`, `navigate`, `toggle_sidebar`, `zoom_in`, `zoom_out`, `toggle_fullscreen`

### 10.4 Streaming Audio to Electron — Not Started
- **Status**: Audio streams via WebSocket to browser clients
- **Missing**: Electron-native audio playback from Conscious
- **Need**: Audio sink in Electron that receives PCM from Conscious and plays through system speakers

### 10.5 Wake Word Model Download — Not Automated
- **Status**: `wake_vad.py` references openwakeword model but no download logic
- **Missing**: Auto-download of "Hey Goose" model on first run
- **Fix**: Add model download in `WakeWordDetector.load_model()`

### 10.6 Conversation History UI — Not Started
- **Status**: Memory API endpoint exists (`/api/memory/status`)
- **Missing**: No UI component to view conversation history / transcripts
- **Need**: `MemorySection.tsx` or tab in ConsciousSection showing recent transcripts

### 10.7 Creator UI — Not Started
- **Status**: Creator API endpoints exist (create, history, promote)
- **Missing**: No UI for AI artifact creation in Electron
- **Need**: `CreatorSection.tsx` with text input, artifact list, promote/validate buttons

### 10.8 Testing UI — Not Started
- **Status**: Testing API endpoints exist (validate, heal, history)
- **Missing**: No UI for running tests or viewing healing results
- **Need**: `TestingSection.tsx` showing test results, healing attempts, pass/fail

---

## 11. Wiring Gaps

### ~~11.1 IntentRouter patterns NOT synced with CapabilityRegistry~~ ✅ VERIFIED OK
- **Status**: IntentRouter's `_build_patterns()` already dynamically loads from CapabilityRegistry. No action needed.

### ~~11.2 PersonalityModulator NOT wired into response pipeline~~ ✅ FIXED
- **Fix Applied**: Wired `_personality_modulator.wrap_action_result()` into `handle_agentic_execute` between GooseBridge response and ResultSpeaker.
- **Fixed By**: Agent 2 (2026-02-09)

### ~~11.3 SkillBridge NOT wired into agent_controller~~ ✅ FIXED
- **Fix Applied**: Imported SkillBridge, instantiated in `__init__`, wired into `_handle_goose()` — parses skill commands before freeform GooseBridge fallback.
- **Fixed By**: Agent 2 (2026-02-09)

### ~~11.4 ConversationHistory NOT fed from voice pipeline~~ ✅ VERIFIED OK
- **Status**: ConversationHistory is already wired into `_on_text_received` at lines 448/455 in agent_api.py. No action needed.

### ~~11.5 Emotion detector NOT feeding ConsciousSection UI~~ ✅ FIXED
- **Fix Applied**: Created `EmotionVisualizer.tsx` with valence bar, trend icon, dominant emotion display, and break suggestion. Integrated into ConsciousSection via CollapsibleSection.
- **Fixed By**: Agent 1 (2026-02-09)

### 11.6 Android app NOT connected to Conscious API
- **Issue**: Android `GooseClient.kt` connects to goosed but NOT to Conscious API. No voice, emotion, or personality features in mobile.
- **Fix**: Add Conscious API client to Android app, mirror desktop features.
- **Files**: `GooseClient.kt`, need new `ConsciousClient.kt`

---

## 12. UI/UX Gaps

### 12.1 Missing UI Components for Existing Features
| Feature              | API Exists                  | UI Component            | Status  |
| -------------------- | --------------------------- | ----------------------- | ------- |
| Voice Toggle         | ✅                           | VoiceToggle.tsx         | ✅ Wired |
| Output Waveform      | ✅                           | OutputWaveform.tsx      | ✅ Wired |
| Personality Selector | ✅                           | PersonalitySelector.tsx | ✅ Wired |
| Conversation History | ✅ `/api/memory/status`      | ✅ MemoryPanel.tsx       | ✅ DONE  |
| Creator Panel        | ✅ `/api/creator/*`          | ✅ CreatorPanel.tsx      | ✅ DONE  |
| Testing Dashboard    | ✅ `/api/testing/*`          | ✅ TestingDashboard.tsx  | ✅ DONE  |
| Emotion Visualizer   | ✅ `/api/emotion/status`     | ✅ EmotionVisualizer.tsx | ✅ DONE  |
| Wake Word Status     | ✅ `/api/wake-vad/status`    | ✅ WakeWordIndicator.tsx | ✅ DONE  |
| Skill Manager        | ✅ `/api/agent/execute`      | ✅ SkillManager.tsx      | ✅ DONE  |
| Agent Capabilities   | ✅ `/api/agent/capabilities` | ✅ CapabilitiesList.tsx  | ✅ DONE  |

### 12.2 UI Components to Create
```
ui/desktop/src/components/conscious/
├── ConsciousBridge.ts          # EXISTS
├── VoiceToggle.tsx             # EXISTS
├── OutputWaveform.tsx          # EXISTS
├── PersonalitySelector.tsx     # EXISTS
├── MemoryPanel.tsx             # NEW — conversation transcript viewer
├── CreatorPanel.tsx            # NEW — AI artifact creation UI
├── TestingDashboard.tsx        # NEW — test results + healing UI
├── EmotionVisualizer.tsx       # NEW — real-time emotion display
├── WakeWordIndicator.tsx       # NEW — wake word + VAD status
├── CapabilitiesList.tsx        # NEW — browsable capability catalog
└── SkillManager.tsx            # NEW — skill create/run/list UI
```

### 12.3 Accessibility
- [ ] All buttons need `aria-label` attributes
- [ ] Color contrast check for all status indicators
- [ ] Keyboard navigation for all interactive elements
- [ ] Screen reader support for voice status changes

---

## 13. Dependency Issues

### 13.1 Python (pyproject.toml) — Missing Dependencies
```toml
# ✅ ALL FIXED — aiohttp, aiohttp-cors, websockets added to dependencies.
# ✅ openwakeword, onnxruntime added to [wake] optional deps.
# ✅ paramiko added to [devices] optional deps.
# See pyproject.toml for current state.
```

### 13.2 Node.js (ui/desktop/package.json) — Verify
- [ ] Check all Conscious UI component imports resolve
- [ ] Verify `lucide-react` has Brain icon (added in SettingsView)
- [ ] Verify no circular dependency in ConsciousBridge → ConsciousSection

### 13.3 Android (build.gradle.kts) — Verify
- [ ] `gradle-wrapper.jar` must be generated: `gradle wrapper` in android dir
- [ ] JitPack repository needed for libsu — check `settings.gradle.kts` for `maven("https://jitpack.io")`
- [ ] Verify all Compose BOM versions compatible

---

## 14. Android App Gaps

### 14.1 Missing Files
- [ ] `gradle-wrapper.jar` — binary must be generated with `gradle wrapper`
- [ ] No unit tests exist (only test dependencies declared)
- [ ] No Espresso/Compose UI tests written

### 14.2 Missing Features
| Feature              | Desktop | Android              | Status       |
| -------------------- | ------- | -------------------- | ------------ |
| Chat with Goose      | ✅       | ✅ ChatScreen.kt      | OK           |
| Settings             | ✅       | ✅ SettingsScreen.kt  | Basic        |
| Root Tools           | ❌       | ✅ RootToolsScreen.kt | Android-only |
| Voice Control        | ✅       | ❌                    | **NEED**     |
| Emotion Display      | ✅       | ❌                    | **NEED**     |
| Personality Switch   | ✅       | ❌                    | **NEED**     |
| Device Manager       | ✅       | ❌                    | **NEED**     |
| Creator UI           | ❌       | ❌                    | NEED BOTH    |
| Conscious Connection | ❌       | ❌                    | **NEED**     |

### 14.3 Files to Create
```kotlin
app/src/main/java/com/block/goose/
├── conscious/
│   ├── ConsciousClient.kt      # HTTP client to Conscious API
│   ├── ConsciousViewModel.kt   # State management for Conscious features
│   └── VoiceService.kt         # Background voice service
├── ui/screens/
│   ├── ConsciousScreen.kt      # Main Conscious control panel
│   └── DevicesScreen.kt        # Device management
```

### 14.4 Android Tests to Create
```
app/src/test/
├── ConsciousClientTest.kt      # Unit tests for API client
├── GooseClientTest.kt          # Unit tests for Goose client
└── ViewModelTests.kt           # ViewModel state tests

app/src/androidTest/
├── ChatScreenTest.kt           # Compose UI tests
├── SettingsScreenTest.kt       # Settings UI tests
└── NavigationTest.kt           # Navigation flow tests
```

---

## 15. Documentation Gaps

### 15.1 Missing Documentation Files
- [ ] `G:\goose\external\conscious\README.md` — Verify exists and is comprehensive
- [ ] `G:\goose\external\conscious\docs\API.md` — Full API reference for all 33 endpoints
- [ ] `G:\goose\external\conscious\docs\ARCHITECTURE.md` — System architecture diagram
- [ ] `G:\goose\external\conscious\docs\SETUP.md` — Installation and setup guide
- [ ] `G:\goose\external\conscious\docs\TESTING.md` — Testing guide and how to run tests
- [ ] `G:\goose\external\conscious\docs\PERSONALITIES.md` — Personality system documentation
- [ ] `G:\goose\external\conscious\docs\DEVICES.md` — Device manager documentation
- [ ] `G:\goose\external\conscious\docs\EMOTION.md` — Emotion engine documentation
- [ ] `G:\goose\external\conscious\CHANGELOG.md` — Version history

### 15.2 Code Documentation
- [ ] All public methods should have docstrings (most do — verify edge cases)
- [ ] Type hints on all function signatures (most have — verify completeness)
- [ ] Module-level docstrings on all `__init__.py` files (all present ✅)

---

## 16. API Endpoint Verification Matrix

**Each endpoint needs these checks:**

| Endpoint                         | Handler Exists | Route Registered | UI Calls It | Test Covers It | Docs  |
| -------------------------------- | :------------: | :--------------: | :---------: | :------------: | :---: |
| GET /api/voice/status            |       ✅        |        ✅         |      ❌      |       ✅        |   ❌   |
| POST /api/voice/connect          |       ✅        |        ✅         |      ❌      |       ✅        |   ❌   |
| POST /api/voice/disconnect       |       ✅        |        ✅         |      ❌      |       ✅        |   ❌   |
| POST /api/voice/reconnect        |       ✅        |        ✅         |      ❌      |       ✅        |   ❌   |
| POST /api/voice/audio            |       ✅        |        ✅         |      ❌      |       ❌        |   ❌   |
| POST /api/voice/start            |       ✅        |        ✅         |      ❌      |       ❌        |   ❌   |
| POST /api/voice/stop             |       ✅        |        ✅         |      ❌      |       ❌        |   ❌   |
| GET /api/voice/stream            |       ✅        |        ✅         |      ❌      |       ❌        |   ❌   |
| GET /api/agentic/status          |       ✅        |        ✅         |      ✅      |       ✅        |   ❌   |
| POST /api/agentic/toggle         |       ✅        |        ✅         |      ✅      |       ✅        |   ❌   |
| POST /api/agentic/execute        |       ✅        |        ✅         |      ❌      |       ✅        |   ❌   |
| GET /api/emotion/status          |       ✅        |        ✅         |      ✅      |       ✅        |   ❌   |
| POST /api/emotion/toggle         |       ✅        |        ✅         |      ✅      |       ✅        |   ❌   |
| GET /api/memory/status           |       ✅        |        ✅         |      ❌      |       ✅        |   ❌   |
| GET /api/personality/status      |       ✅        |        ✅         |      ❌      |       ✅        |   ❌   |
| POST /api/personality/switch     |       ✅        |        ✅         |      ✅      |       ✅        |   ❌   |
| GET /api/personality/list        |       ✅        |        ✅         |      ✅      |       ✅        |   ❌   |
| POST /api/creator/create         |       ✅        |        ✅         |      ❌      |       ✅        |   ❌   |
| GET /api/creator/history         |       ✅        |        ✅         |      ❌      |       ✅        |   ❌   |
| POST /api/creator/promote        |       ✅        |        ✅         |      ❌      |       ✅        |   ❌   |
| POST /api/testing/validate       |       ✅        |        ✅         |      ❌      |       ✅        |   ❌   |
| POST /api/testing/heal           |       ✅        |        ✅         |      ❌      |       ✅        |   ❌   |
| GET /api/testing/history         |       ✅        |        ✅         |      ❌      |       ❌        |   ❌   |
| GET /api/devices/status          |       ✅        |        ✅         |      ✅      |       ✅        |   ❌   |
| POST /api/devices/scan           |       ✅        |        ✅         |      ✅      |       ✅        |   ❌   |
| POST /api/devices/probe          |       ✅        |        ✅         |      ❌      |       ❌        |   ❌   |
| POST /api/devices/add            |       ✅        |        ✅         |      ✅      |       ✅        |   ❌   |
| POST /api/devices/remove         |       ✅        |        ✅         |      ✅      |       ✅        |   ❌   |
| POST /api/devices/creator-mode   |       ✅        |        ✅         |      ✅      |       ✅        |   ❌   |
| POST /api/devices/printer        |       ✅        |        ✅         |      ✅      |       ❌        |   ❌   |
| POST /api/devices/ssh            |       ✅        |        ✅         |      ✅      |       ❌        |   ❌   |
| POST /api/agent/execute          |       ✅        |        ✅         |      ❌      |       ✅        |   ❌   |
| GET /api/agent/capabilities      |       ✅        |        ✅         |      ❌      |       ✅        |   ❌   |
| GET /api/agent/controller-status |       ✅        |        ✅         |      ❌      |       ❌        |   ❌   |
| GET /api/wake-vad/status         |       ✅        |        ✅         |      ❌      |       ❌        |   ❌   |
| POST /api/wake-vad/toggle        |       ✅        |        ✅         |      ❌      |       ❌        |   ❌   |

**Key**: ✅ = exists, ❌ = missing/needs work

---

## 16.5 Test Fixtures & Shared Utilities (Create BEFORE writing tests)

All tests share common setup. Create these fixtures first in `G:\goose\external\conscious\tests\`.

### conftest.py (Root)
```python
# G:\goose\external\conscious\tests\conftest.py
import pytest
import asyncio

@pytest.fixture
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()
```

### tests/fixtures/mock_goose_bridge.py
```python
"""Mock GooseBridge that returns canned GooseResult without HTTP calls."""
from conscious.agentic.goose_bridge import GooseResult

class MockGooseBridge:
    def __init__(self, default_response="Mock response"):
        self._default = default_response
        self._calls = []
        self._emotion_prefix = ""

    async def execute(self, action, raw_text="", detail="", emotion_prefix=""):
        self._calls.append({"action": action, "raw_text": raw_text})
        return GooseResult(success=True, text=self._default, elapsed_s=0.1)

    async def send(self, prompt):
        self._calls.append({"prompt": prompt})
        return GooseResult(success=True, text=self._default, elapsed_s=0.1)

    async def health_check(self):
        return True

    def set_emotion_prefix(self, prefix):
        self._emotion_prefix = prefix

    @property
    def calls(self):
        return self._calls
```

### tests/fixtures/mock_http_server.py
```python
"""Lightweight aiohttp test server for integration tests."""
from aiohttp import web
from aiohttp.test_utils import AioHTTPTestCase, unittest_run_loop

class MockConsciousServer:
    """Start a real HTTP server on a random port for E2E-style tests."""
    def __init__(self, app):
        self.app = app
        self.runner = None
        self.site = None
        self.port = None

    async def start(self):
        self.runner = web.AppRunner(self.app)
        await self.runner.setup()
        self.site = web.TCPSite(self.runner, 'localhost', 0)
        await self.site.start()
        self.port = self.site._server.sockets[0].getsockname()[1]

    async def stop(self):
        await self.runner.cleanup()

    @property
    def base_url(self):
        return f"http://localhost:{self.port}"
```

### tests/fixtures/audio_helpers.py
```python
"""Generate test audio data for emotion/wake_vad/voice tests."""
import numpy as np

def make_silence(duration_s=1.0, sample_rate=24000):
    return np.zeros(int(duration_s * sample_rate), dtype=np.float32)

def make_sine_wave(freq=440, duration_s=1.0, sample_rate=24000, amplitude=0.5):
    t = np.linspace(0, duration_s, int(duration_s * sample_rate), dtype=np.float32)
    return (amplitude * np.sin(2 * np.pi * freq * t)).astype(np.float32)

def make_noise(duration_s=1.0, sample_rate=24000, amplitude=0.3):
    return (amplitude * np.random.randn(int(duration_s * sample_rate))).astype(np.float32)
```

### tests/fixtures/emotion_helpers.py
```python
"""Pre-built EmotionResult objects for tracker/responder tests."""
from conscious.emotion.detector import EmotionResult

def make_emotion(emotion="neutral", confidence=0.9, intensity=0.5):
    return EmotionResult(emotion=emotion, confidence=confidence, intensity=intensity)

def make_frustrated_sequence(n=5):
    return [make_emotion("frustrated", 0.85, 0.7) for _ in range(n)]

def make_happy_sequence(n=5):
    return [make_emotion("happy", 0.9, 0.6) for _ in range(n)]

def make_mixed_sequence():
    return [
        make_emotion("neutral", 0.8),
        make_emotion("happy", 0.7),
        make_emotion("frustrated", 0.6),
        make_emotion("angry", 0.85),
        make_emotion("sad", 0.5),
    ]
```

### tests/fixtures/personality_helpers.py
```python
"""Quick access to test personality profiles."""
from conscious.personality.profile import get_profile, list_profiles, DEFAULT_PROFILE_NAME

def get_default_profile():
    return get_profile(DEFAULT_PROFILE_NAME)

def get_test_profile(name="spark"):
    return get_profile(name)
```

### Directory Structure to Create
```
G:\goose\external\conscious\tests\
├── conftest.py
├── fixtures/
│   ├── __init__.py
│   ├── mock_goose_bridge.py
│   ├── mock_http_server.py
│   ├── audio_helpers.py
│   ├── emotion_helpers.py
│   └── personality_helpers.py
├── unit/
│   ├── agentic/
│   ├── emotion/
│   ├── personality/
│   ├── memory/
│   ├── testing/
│   ├── devices/
│   └── voice/
├── integration/
├── e2e/
│   └── test_conscious_api.py  (EXISTS)
├── performance/
└── security/
```

---

## 17. Smoke Test Commands

Run these after any fix to verify nothing is broken:

```bash
# 1. Python syntax check (all modules)
cd G:\goose\external\conscious
python -c "import py_compile; import glob; files=glob.glob('src/conscious/**/*.py', recursive=True); [py_compile.compile(f, doraise=True) for f in files]; print(f'{len(files)} files OK')"

# 2. Import check (all modules load without error)
cd G:\goose\external\conscious
python -c "from conscious.agentic import *; from conscious.emotion import *; from conscious.personality import *; from conscious.memory import *; from conscious.testing import *; from conscious.devices import *; print('All imports OK')"

# 3. Run existing E2E tests
cd G:\goose\external\conscious
python -m pytest tests/e2e/ -v --timeout=60

# 4. Run unit tests (once created)
cd G:\goose\external\conscious
python -m pytest tests/unit/ -v --timeout=30

# 5. TypeScript type check
cd G:\goose\ui\desktop
npx tsc --noEmit

# 6. Electron UI lint
cd G:\goose\ui\desktop
npx eslint src/components/conscious/ src/components/settings/conscious/ --max-warnings 0

# 7. Electron UI tests
cd G:\goose\ui\desktop
npm run test:run

# 8. Android build check
cd G:\goose\ui\mobile\android
gradlew assembleDebug
```

---

## 18. Module-by-Module Detailed Status

### voice/agent_api.py (44KB, ~1022 lines)
- **Status**: Core orchestrator, fully implemented
- **Issues**: Missing CORS, missing `aiohttp` dep declaration
- **Test coverage**: 25 E2E tests exist, needs unit tests for each handler

### agentic/agent_controller.py (~540 lines)
- **Status**: Fully implemented with 40+ capability routing
- **Issues**: Fixed 4 bugs (method names, Enum vs str)
- **Test coverage**: 0 — needs ~20 unit tests

### agentic/goose_bridge.py (~430 lines)
- **Status**: Fully implemented with streaming + multi-turn + emotion prefix
- **Issues**: None remaining
- **Test coverage**: 0 — needs ~12 unit tests

### agentic/intent_router.py (~210 lines)
- **Status**: Implemented but patterns NOT synced with CapabilityRegistry
- **Issues**: Hardcoded patterns diverge from capabilities
- **Test coverage**: 0 — needs ~15 unit tests

### agentic/capabilities.py (~370 lines)
- **Status**: Fully implemented, 40+ capabilities registered
- **Issues**: None
- **Test coverage**: 0 — needs ~10 unit tests

### emotion/detector.py (~340 lines)
- **Status**: Fully implemented, real Wav2Vec2 inference
- **Issues**: Fixed missing `enabled` property
- **Test coverage**: 0 — needs ~10 unit tests

### emotion/tracker.py (~174 lines)
- **Status**: Fully implemented
- **Issues**: None
- **Test coverage**: 0 — needs ~12 unit tests

### emotion/responder.py (~254 lines)
- **Status**: Fully implemented
- **Issues**: None
- **Test coverage**: 0 — needs ~10 unit tests

### personality/profile.py (~323 lines)
- **Status**: 13 profiles fully defined in Python dicts
- **Issues**: No YAML file loading (was planned)
- **Test coverage**: 0 — needs ~8 unit tests

### personality/modulator.py (~119 lines)
- **Status**: Fully implemented but NOT wired into pipeline
- **Issues**: Orphaned — never called in response flow
- **Test coverage**: 0 — needs ~10 unit tests

### personality/switcher.py (~101 lines)
- **Status**: Fully implemented
- **Issues**: None
- **Test coverage**: 0 — needs ~8 unit tests

### memory/conversation_history.py (~188 lines)
- **Status**: Basic JSON file storage — functional but minimal
- **Issues**: Missing semantic memory integration, possibly missing `clear()` method
- **Test coverage**: 0 — needs ~10 unit tests

### testing/validator.py (~276 lines)
- **Status**: Fully implemented, runs real Playwright tests
- **Issues**: None
- **Test coverage**: 0 — needs ~8 unit tests

### testing/self_healing.py (~249 lines)
- **Status**: Fully implemented
- **Issues**: `_save_artifact` may not be set (BUG-008)
- **Test coverage**: 0 — needs ~8 unit tests

### devices/manager.py (~310 lines)
- **Status**: Fully implemented
- **Issues**: Missing `paramiko` dependency declaration
- **Test coverage**: 0 — needs ~12 unit tests

### devices/scanner.py (~340 lines)
- **Status**: Fully implemented, real ARP/port scanning
- **Issues**: None
- **Test coverage**: 0 — needs ~8 unit tests

### voice/wake_vad.py (~344 lines)
- **Status**: Fully implemented
- **Issues**: Missing `openwakeword` dependency declaration
- **Test coverage**: 0 — needs ~12 unit tests

### voice/moshi_agent.py (~430 lines)
- **Status**: Fully implemented WebSocket client
- **Issues**: None identified
- **Test coverage**: 0

### voice/moshi_engine.py (~260 lines)
- **Status**: Fully implemented Moshi model loader
- **Issues**: None identified
- **Test coverage**: 0

### voice/audio_stream.py (~230 lines)
- **Status**: Fully implemented sounddevice audio I/O
- **Issues**: None identified
- **Test coverage**: 0

### voice/server_manager.py (~340 lines)
- **Status**: Fully implemented server lifecycle
- **Issues**: None identified
- **Test coverage**: 0

---

## Summary Statistics

| Category                     | Count                                        |
| ---------------------------- | -------------------------------------------- |
| **Bugs fixed**               | 9                                            |
| **Remaining critical bugs**  | 9 (BUG-001 through BUG-009)                  |
| **Unit tests needed**        | ~238 across 23 files                         |
| **Integration tests needed** | ~44 across 7 files                           |
| **E2E tests needed**         | ~42 across 6 new files                       |
| **Performance tests needed** | ~19 across 5 files                           |
| **Security tests needed**    | ~20 across 4 files                           |
| **Total new tests**          | **~363 tests across 45 files**               |
| **Unfinished features**      | 8 (Memory, YAML profiles, UI commands, etc.) |
| **Wiring gaps**              | 6                                            |
| **Missing UI components**    | 7                                            |
| **Missing docs**             | 9 files                                      |
| **Dependency issues**        | 5 packages                                   |
| **Android gaps**             | 6 features + tests                           |

---

*End of audit. All items are actionable with exact file paths, line numbers, and acceptance criteria.*
