# Agentic Voice & Conscious Integration Plan

**Date**: 2026-02-08
**Scope**: Make `G:\goose\external\conscious` truly agentic with real-time voice interaction, integrated with Super-Goose (`G:\goose`)
**Method**: SOTA research (GitHub repos, papers, frameworks) + honest audit of current state + prioritized action plan
**Goal**: Real working agentic voice — not mocked, not stubbed — instant responses with tool calling

---

## 1. Current State Audit (Honest)

### G:\goose\external\conscious — What's REAL code vs EMPTY stubs

| Component              | File                        | Lines | Status                                                                           |
| ---------------------- | --------------------------- | ----- | -------------------------------------------------------------------------------- |
| **MoshiAgent**         | `voice/moshi_agent.py`      | 427   | **REAL** — Full WebSocket client, opus codec, latency monitoring, auto-reconnect |
| **MoshiServerManager** | `voice/server_manager.py`   | ~300  | **REAL** — Server lifecycle, VRAM check, health polling, auto-restart            |
| **MoshiAgentAPI**      | `voice/agent_api.py`        | ~466  | **REAL** — REST+WS API on port 8999, 10 endpoints (7 voice + 3 agentic)          |
| **ConsciousServer**    | `server.py`                 | 171   | **REAL** — Main conversation loop: Mic → Moshi → Speaker                         |
| **AudioStream**        | `voice/audio_stream.py`     | ~200  | **REAL** — sounddevice I/O (legacy, replaced by agentic WS client)               |
| **MoshiEngine**        | `voice/moshi_engine.py`     | ~200  | **REAL** — Direct in-process model wrapper                                       |
| **EmotionEngine**      | `emotion/__init__.py`       | 2     | **EMPTY STUB** — docstring only                                                  |
| **MemorySystem**       | `memory/__init__.py`        | 2     | **EMPTY STUB** — docstring only                                                  |
| **PersonalityEngine**  | `personality/__init__.py`   | 2     | **EMPTY STUB** — docstring only                                                  |
| **IntentRouter**       | `agentic/intent_router.py`  | ~175  | **REAL (Phase 1)** — Token accumulation, regex intent classification, debounce   |
| **GooseBridge**        | `agentic/goose_bridge.py`   | ~280  | **REAL (Phase 1)** — HTTP client to goosed SSE API, ChatRequest format           |
| **ResultSpeaker**      | `agentic/result_speaker.py` | ~150  | **REAL (Phase 1)** — Markdown stripping, number humanization, truncation         |
| **ActionQueue**        | `agentic/action_queue.py`   | ~180  | **REAL (Phase 1)** — Async queue, serial execution, detail extraction            |
| **EmotionDetector**    | `emotion/detector.py`       | ~270  | **REAL (Phase 2)** — Wav2Vec2 classification, lazy model loading, GPU inference  |
| **EmotionTracker**     | `emotion/tracker.py`        | ~170  | **REAL (Phase 2)** — Sliding window mood tracking, trend analysis                |
| **EmotionResponder**   | `emotion/responder.py`      | ~210  | **REAL (Phase 2)** — Emotion → response modulation, break detection              |

### G:\goose\external\conscious — What WORKS today

- Moshi server launches via subprocess with correct env vars
- WebSocket client connects, streams opus audio bidirectionally
- Latency monitoring with auto-reconnect (resets KV cache)
- REST API on port 8999 with start/stop/audio/stream/status/reconnect
- Server lifecycle management with crash recovery
- Real-time conversation loop (Mic → Moshi → Speaker)
- **[NEW] Agentic intent detection** — text tokens classified as chat vs action
- **[NEW] GooseBridge** — voice commands routed to goosed for tool execution
- **[NEW] ResultSpeaker** — tool results converted to natural speakable text
- **[NEW] ActionQueue** — async non-blocking tool dispatch
- **[NEW] 3 agentic REST endpoints** — /api/agentic/status, toggle, execute

### G:\goose\external\conscious — What DOESN'T work (the gap)

| Missing Capability           | Impact                                                                    |
| ---------------------------- | ------------------------------------------------------------------------- |
| ~~No intent detection~~      | ✅ **FIXED** — IntentRouter classifies 20 action patterns                  |
| ~~No tool calling~~          | ✅ **FIXED** — GooseBridge sends to goosed /reply SSE endpoint             |
| ~~No Super-Goose bridge~~    | ✅ **FIXED** — Full HTTP bridge with correct ChatRequest format            |
| ~~No emotion detection~~     | ✅ **FIXED** — Wav2Vec2 detector + tracker + responder (user input audio)  |
| **No memory**                | Empty stub — can't remember past conversations                            |
| **No personality switching** | Empty stub — 13 personalities designed but not implemented                |
| ~~No tool-result-to-speech~~ | ✅ **FIXED** — ResultSpeaker strips markdown, humanizes numbers, truncates |

---

## 2. SOTA Research — What Exists for Real Agentic Voice

### Key Frameworks Analyzed

#### 1. Pipecat (github.com/pipecat-ai/pipecat) ⭐⭐⭐⭐
- **What**: Open-source Python framework for voice + multimodal AI agents
- **Architecture**: Composable pipelines: STT → LLM → TTS (or S2S via OpenAI Realtime/Gemini/Ultravox)
- **Key Features**: 50+ service integrations, function calling via LLM, structured conversations, WebSocket+WebRTC transports
- **Stars**: 10k+ | **Contributors**: 207 | **Releases**: 100
- **Relevance**: Best Python voice agent framework. Has everything EXCEPT native S2S like Moshi.
- **Limitation**: Pipeline approach (STT→LLM→TTS) adds ~1-2s latency vs Moshi's <200ms

#### 2. LiveKit Agents (github.com/livekit/agents) ⭐⭐⭐⭐⭐
- **What**: Production-grade voice AI agent framework with WebRTC
- **Architecture**: Agent → AgentSession with STT/LLM/TTS plugins
- **Key Features**: `@function_tool` decorator for tool calling, multi-agent handoff, **native MCP support**, semantic turn detection, test framework, telephony
- **Stars**: 8k+ | **Contributors**: 308 | **Releases**: 334
- **Relevance**: **Best match for Super-Goose** — has MCP support (same protocol as goose), function tools, multi-agent. Production-proven.
- **Limitation**: Requires LiveKit server for WebRTC transport; pipeline latency

#### 3. OpenAI Realtime API ⭐⭐⭐⭐
- **What**: Native speech-to-speech with function calling
- **Architecture**: Single multimodal model (gpt-4o-realtime) handles audio+text+tools
- **Key Features**: <500ms latency, native tool calling in voice, emotion detection
- **Relevance**: The gold standard for agentic voice — but cloud-only, expensive
- **Limitation**: Not local, not private, per-minute pricing

#### 4. Kyutai Moshi (current in Conscious) ⭐⭐⭐
- **What**: Native speech-to-speech foundation model (7B params)
- **Architecture**: Direct audio-in → audio-out, full duplex
- **Key Features**: <200ms latency, natural voice quality, local GPU inference
- **Relevance**: Best voice QUALITY and LATENCY of any local model
- **Limitation**: **ZERO agentic capability** — no tool calling, no function calling, no text reasoning

#### 5. Ultravox (fixie-ai/ultravox) ⭐⭐⭐
- **What**: Multimodal speech-language model that understands audio natively
- **Architecture**: Audio encoder + LLM, supports function calling
- **Key Features**: Understands speech directly (not STT→text), tool use support
- **Relevance**: Could replace Moshi as voice model WITH agentic capability
- **Limitation**: Less mature than Moshi for pure voice quality

#### 6. Bolna (bolna-ai/bolna) ⭐⭐
- **What**: Conversational voice AI agents with telephony
- **Architecture**: ASR + LLM + TTS pipeline with tool calling
- **Relevance**: Good reference for voice agent architecture patterns

### Research Papers

| Paper                                       | Key Insight                                   | Relevance                                             |
| ------------------------------------------- | --------------------------------------------- | ----------------------------------------------------- |
| **Moshi (Kyutai, 2024)** [arxiv:2410.00037] | First open S2S model with full duplex, <200ms | Foundation of Conscious voice layer                   |
| **AudioPaLM (Google, 2023)**                | Multimodal speech+text LLM                    | Architecture pattern for hybrid models                |
| **SpeechGPT (2023)**                        | Speech-text interleaved training              | Future direction for Moshi-like models with reasoning |
| **Voxtral (Mistral, 2024)**                 | Speech understanding in text LLMs             | Alternative to Moshi for understanding + reasoning    |
| **GPT-4o Realtime (OpenAI, 2024)**          | Native S2S with tool calling                  | The target architecture to match locally              |

### The Fundamental Insight

**No single open-source model does both native S2S AND tool calling.** The solution is a **hybrid architecture**:

```
┌─────────────────────────────────────────────────────────┐
│                    AGENTIC VOICE LAYER                    │
│                                                          │
│   Moshi (low-latency S2S)  ←→  Intent Router  ←→  Super-Goose (tools)
│         <200ms voice              classify              tool execution
│         emotion, tone             "chat" vs "action"    code, files, web
│                                                          │
│   Result: Voice says "your tests passed" naturally       │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Proposed Architecture — Hybrid Agentic Voice

### Design Principle
- **Moshi stays as the audio layer** — best local S2S quality, keep <200ms for chat
- **Super-Goose stays as the brain** — tools, reasoning, memory, checkpoints
- **New "Intent Router" bridges them** — taps Moshi's text token stream, classifies, routes

### Architecture Diagram

```
User speaks
    │
    ▼
┌──────────────────┐
│  Moshi Server    │  Port 8998
│  (PyTorch+CUDA)  │  RTX 3090 Ti
│  Speech → Speech │
└────────┬─────────┘
         │ WS: audio + text tokens
         ▼
┌──────────────────────────────────────────────────────────┐
│              Conscious Agent Layer (NEW)                   │
│                                                           │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ MoshiAgent  │  │ IntentRouter │  │ GooseBridge    │  │
│  │ (existing)  │──│ (NEW)        │──│ (NEW)          │  │
│  │ WS client   │  │ classify     │  │ HTTP to goosed │  │
│  │ opus audio  │  │ chat/action  │  │ tool execution │  │
│  └─────────────┘  └──────┬───────┘  └────────┬───────┘  │
│                          │                    │           │
│  ┌─────────────┐  ┌──────▼───────┐  ┌────────▼───────┐  │
│  │ EmotionDet  │  │ ActionQueue  │  │ ResultSpeaker  │  │
│  │ (Phase 2)   │  │ (NEW)        │  │ (NEW)          │  │
│  │ voice→mood  │  │ pending acts │  │ result→speech  │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│                                                           │
│  Port 8999: REST + WebSocket API for external access      │
└───────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────┐
│  Super-Goose     │  Port 7878 (goosed)
│  (Rust agent)    │
│  Tools, Code,    │
│  Memory, Plans   │
└──────────────────┘
```

### Data Flow: Voice Command → Tool Execution → Voice Response

```
1. User: "Hey, run my tests"
   └──► Moshi Server (audio in)
        └──► MoshiAgent receives text tokens: ["run", " my", " tests"]

2. IntentRouter accumulates tokens, detects ACTION intent
   └──► Classifies: { intent: "tool_call", action: "run_tests", confidence: 0.92 }

3. GooseBridge sends to Super-Goose:
   POST http://localhost:7878/reply
   { "message": "Run the tests in the current project" }

4. Super-Goose executes tools (shell command, reads output)
   └──► Returns: { "result": "All 47 tests passed in 3.2 seconds" }

5. ResultSpeaker converts to natural speech:
   "All forty-seven tests passed in three point two seconds."
   └──► Feeds text to Moshi (or TTS fallback) for voice output

6. User hears: "All forty-seven tests passed" in <2 seconds total
```

---

## 4. Prioritized Implementation Plan

### Phase 1: Intent Router + Goose Bridge (Critical — enables agentic voice)
**Effort**: ~400 LoC Python | **Priority**: P0 | **Unblocks**: Everything else

| Task | File                                      | Description                                                                                              |
| ---- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1.1  | `src/conscious/agentic/__init__.py`       | New package for agentic layer                                                                            |
| 1.2  | `src/conscious/agentic/intent_router.py`  | Accumulate Moshi text tokens, classify intent (keyword/regex initially, upgradeable to small classifier) |
| 1.3  | `src/conscious/agentic/goose_bridge.py`   | HTTP client to `goosed` server API — send user requests, receive tool results                            |
| 1.4  | `src/conscious/agentic/result_speaker.py` | Convert tool results to natural speech text, feed back to Moshi or TTS                                   |
| 1.5  | `src/conscious/agentic/action_queue.py`   | Async queue for pending actions — decouple voice from tool execution                                     |
| 1.6  | Wire into `MoshiAgentAPI`                 | Add `on_text_received` callback that feeds IntentRouter                                                  |

**Intent classification approach** (start simple, upgrade later):
```python
ACTION_TRIGGERS = [
    (r"run\s+(my\s+)?tests?", "run_tests"),
    (r"build\s+(the\s+)?project", "build"),
    (r"open\s+file", "open_file"),
    (r"search\s+for", "search"),
    (r"fix\s+(the\s+)?bug", "fix_bug"),
    (r"create\s+(a\s+)?file", "create_file"),
    (r"deploy", "deploy"),
    (r"check\s+status", "status"),
]
# Phase 2: Replace with small local classifier (distilbert or similar)
```

### Phase 2: Emotion Detection Engine (~300 LoC)
**Effort**: ~300 LoC Python | **Priority**: P1 | **Depends on**: Phase 1

| Task | File                                 | Description                                                          |
| ---- | ------------------------------------ | -------------------------------------------------------------------- |
| 2.1  | `src/conscious/emotion/detector.py`  | Voice emotion detection using Wav2Vec2 or openSMILE prosody features |
| 2.2  | `src/conscious/emotion/responder.py` | Adjust agent tone/urgency based on detected emotion                  |
| 2.3  | Wire into MoshiAgent                 | Analyze incoming audio PCM for emotion before/during processing      |

**SOTA options for emotion detection:**
- **SpeechBrain** (speechbrain.github.io) — Open-source, has emotion recognition models
- **Wav2Vec2 emotion** (facebook/wav2vec2-base) — Fine-tuned for emotion classification
- **openSMILE** — Acoustic feature extraction, works locally

### Phase 3: Memory Bridge (~250 LoC) ⬅️ NEXT
**Effort**: ~250 LoC Python | **Priority**: P0 | **Depends on**: Phase 1

| Task | File                                           | Description                                                           |
| ---- | ---------------------------------------------- | --------------------------------------------------------------------- |
| 3.1  | `src/conscious/memory/voice_memory.py`         | Bridge to Super-Goose MemoryManager via goosed API                    |
| 3.2  | `src/conscious/memory/conversation_history.py` | Store voice conversation transcripts with timestamps + speaker tags   |
| 3.3  | Wire into IntentRouter + GooseBridge           | Recall relevant memories for context-aware responses, pass as context |

**Approach**: Use Super-Goose's existing MemoryManager (episodic + semantic + disk persistence) via goosed API. Voice transcripts become episodic memories. Conversation history stored locally as JSON with timestamps.

### Phase 4: Personality Engine (~300 LoC)
**Effort**: ~300 LoC Python | **Priority**: P1

| Task | File                                     | Description                                                    |
| ---- | ---------------------------------------- | -------------------------------------------------------------- |
| 4.1  | `src/conscious/personality/profile.py`   | Load personality profiles from YAML configs (13 profiles)      |
| 4.2  | `src/conscious/personality/switcher.py`  | Voice command personality switching ("switch to jarvispool")   |
| 4.3  | `src/conscious/personality/modulator.py` | Apply personality traits to response generation + voice params |
| 4.4  | Wire into agentic layer + IntentRouter   | Personality affects how tool results are spoken                |

### Phase 5: Skill Voice Integration (~200 LoC)
**Effort**: ~200 LoC Python | **Priority**: P1 | **NEW — previously missing**

| Task | File                                    | Description                                                       |
| ---- | --------------------------------------- | ----------------------------------------------------------------- |
| 5.1  | `src/conscious/agentic/skill_bridge.py` | Voice can invoke saved skills ("run skill deploy-staging")        |
| 5.2  | Add skill patterns to IntentRouter      | Recognize "save this as a skill", "run skill X", "list my skills" |
| 5.3  | Wire into GooseBridge                   | Skills executed via goosed saveSkill/loadSkill tools              |

**Gap filled**: Super-Goose has a skill library (saveSkill in skills_extension.rs) but voice had no way to invoke it.

### Phase 6: Advanced Intent Classifier (~350 LoC)
**Effort**: ~350 LoC Python | **Priority**: P1

| Task | File                                      | Description                                                         |
| ---- | ----------------------------------------- | ------------------------------------------------------------------- |
| 6.1  | `src/conscious/agentic/ml_classifier.py`  | DistilBERT fine-tuned on voice command dataset                      |
| 6.2  | `src/conscious/agentic/intent_dataset.py` | Training data generator from existing regex patterns + augmentation |
| 6.3  | Update IntentRouter to use ML classifier  | Fallback chain: ML classifier → regex → chat default                |

**Gap filled**: Current regex-only IntentRouter can't handle ambiguous or complex commands.

### Phase 7: Voice-Controlled Agent Features (~400 LoC)
**Effort**: ~400 LoC Python | **Priority**: P0 | **NEW — critical gap**

| Task | File                                         | Description                                                                    |
| ---- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| 7.1  | `src/conscious/agentic/agent_commands.py`    | Voice access to Super-Goose agent capabilities                                 |
| 7.2  | Add agent-control patterns to IntentRouter   | "build the whole feature" → PlanManager, "use chain of thought" → ReasoningMgr |
| 7.3  | Add checkpoint patterns                      | "resume from last checkpoint", "save checkpoint", "show history"               |
| 7.4  | Add code-test-fix patterns                   | "run code test fix loop" → StateGraphRunner                                    |
| 7.5  | Wire into GooseBridge with correct API calls | Each command maps to specific goosed endpoints/prompts                         |

**Gap filled**: Super-Goose has PlanManager, ReasoningManager, CheckpointManager, StateGraphRunner — but voice couldn't access ANY of them.

### Phase 8: Streaming & Multi-turn (~300 LoC)
**Effort**: ~300 LoC Python | **Priority**: P1

| Task | File                                            | Description                                                         |
| ---- | ----------------------------------------------- | ------------------------------------------------------------------- |
| 8.1  | `src/conscious/agentic/stream_handler.py`       | Stream partial SSE results from goosed as voice while tools execute |
| 8.2  | `src/conscious/agentic/conversation_context.py` | Maintain multi-turn context across voice commands                   |
| 8.3  | Update ActionQueue for streaming                | "Run tests" → "3 failed" → "Fix them" → continuous voice+tool loop  |
| 8.4  | Pass conversation history to GooseBridge        | GooseBridge sends `conversation_so_far` field in ChatRequest        |

**Gap filled**: Currently each voice command is stateless. Multi-turn enables natural conversation flow.

### Phase 9: Wake Word & VAD (~200 LoC)
**Effort**: ~200 LoC Python | **Priority**: P2

| Task | File                                  | Description                                                    |
| ---- | ------------------------------------- | -------------------------------------------------------------- |
| 9.1  | `src/conscious/voice/wake_word.py`    | openWakeWord for "Hey Conscious" hotword detection             |
| 9.2  | `src/conscious/voice/vad.py`          | Silero VAD for clean turn-taking (reduces false interruptions) |
| 9.3  | `src/conscious/voice/tts_fallback.py` | edge-tts fallback when Moshi is down or for non-conversational |
| 9.4  | Wire into MoshiAgent audio pipeline   | Wake word gates command listening, VAD controls turn detection |

### Phase 10: Emotion→Prompt Injection (~150 LoC)
**Effort**: ~150 LoC Python | **Priority**: P1 | **NEW — built but not wired**

| Task | Description                                                                                   |
| ---- | --------------------------------------------------------------------------------------------- |
| 10.1 | Wire `EmotionResponder.get_conscious_prefix()` into GooseBridge voice mode prompt             |
| 10.2 | GooseBridge includes emotion context in ChatRequest (e.g., "[User sounds frustrated]")        |
| 10.3 | Emotion-aware ResultSpeaker: gentler delivery when user is frustrated, celebratory when happy |

**Gap filled**: Phase 2 built the emotion engine but never connected it to the agentic responses.

### Phase 11: UI Voice Wiring (~250 LoC TypeScript)
**Effort**: ~250 LoC TypeScript | **Priority**: P2

| Task | File                                                | Description                                                   |
| ---- | --------------------------------------------------- | ------------------------------------------------------------- |
| 11.1 | `ui/desktop/src/components/voice/personalities.ts`  | **MISSING** — Personality config data for PersonalitySelector |
| 11.2 | Wire VoiceToggle.tsx to agent_api.py endpoints      | Toggle voice on/off from desktop UI                           |
| 11.3 | Wire OutputWaveform.tsx to WS audio stream          | Real-time waveform visualization of Moshi output              |
| 11.4 | Wire PersonalitySelector.tsx to personality API     | Switch personality from UI dropdown                           |
| 11.5 | Wire VoiceStatusBadge.tsx to emotion/agentic status | Show voice status, emotion, agentic state in desktop UI       |

### Phase 12: Playwright E2E Tests (~500 LoC)
**Effort**: ~500 LoC TypeScript | **Priority**: P0 (gates release)

| Task | File                                           | Description                                                              |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| 12.1 | `ui/desktop/tests/e2e/voice-agentic.spec.ts`   | Test 1: Simple project — voice triggers "create a hello world app"       |
| 12.2 | `ui/desktop/tests/e2e/voice-complex.spec.ts`   | Test 2: Complex project — voice triggers multi-step build+test+fix loop  |
| 12.3 | Both tests must pass fully with working output | Playwright verifies tool execution, result speech, project files created |
| 12.4 | Test emotion detection, personality switching  | Verify end-to-end voice pipeline including all new Phase 2-10 features   |

**Requirement**: Both projects must be fully created and working before release builds proceed.

### Phase 13: Release Builds (Windows/Linux/macOS)
**Priority**: P0 (final step) | **Depends on**: All phases + Phase 12 tests passing

| Task | Description                                                                        |
| ---- | ---------------------------------------------------------------------------------- |
| 13.1 | `just release-binary` for Windows (x86_64-pc-windows-msvc)                         |
| 13.2 | `just release-binary` for Linux (x86_64-unknown-linux-gnu)                         |
| 13.3 | `just release-binary` for macOS (x86_64-apple-darwin + aarch64-apple-darwin)       |
| 13.4 | `just run-ui` + Electron Forge package for desktop installers                      |
| 13.5 | Git commit + tag + push releases with changelog                                    |
| 13.6 | Users can test the new wired-in voice/agentic/emotion features via Windows release |

### Future Phases (Post-Release)

| Phase | Component                        | Effort    | Description                                             |
| ----- | -------------------------------- | --------- | ------------------------------------------------------- |
| 14    | Voice-Activated MCP Tools        | ~300 LoC  | Expose ALL Super-Goose MCP tools directly via voice     |
| 15    | RAG Pipeline + Vector Embeddings | ~800 LoC  | Real vector DB, retrieval pipeline, replace fake hashes |
| 16    | LiveKit WebRTC Integration       | ~500 LoC  | Remote voice access, telephony, multi-user              |
| 17    | LATS/MCTS for Planning           | ~1000 LoC | Advanced search-based planning for complex tasks        |

---

## 5. SOTA Enhancements to Include (from research)

### From Pipecat
- **Structured conversations**: State machine for multi-step voice interactions (e.g., "deploy to staging" → "confirm?" → "yes" → execute)
- **Composable pipelines**: Modular audio processing chain

### From LiveKit Agents
- **MCP support**: Native MCP tool integration — since Super-Goose is MCP-native, this is a perfect bridge
- **Semantic turn detection**: Transformer-based detection of when user finishes speaking (reduces false interruptions)
- **Multi-agent handoff**: Voice agent can hand off to specialist agents (code, test, deploy)
- **Test framework**: Automated voice agent testing with LLM judges

### From OpenAI Realtime API
- **Native tool calling in S2S**: The ideal architecture — once open models support this, Conscious can adopt it
- **Server-side VAD**: Voice Activity Detection for clean turn-taking

### From Research Papers
- **Interleaved speech-text tokens** (SpeechGPT): Future Moshi versions may support text reasoning + speech output
- **Emotion-aware responses** (AudioPaLM): Modulate response tone based on user emotion

---

## 6. Integration Points with Super-Goose (G:\goose)

### Existing Super-Goose APIs to leverage

| Super-Goose Capability            | How Voice Uses It                                                      |
| --------------------------------- | ---------------------------------------------------------------------- |
| `goosed` HTTP server              | GooseBridge sends voice commands as text, receives tool results        |
| MemoryManager (episodic/semantic) | Voice conversations stored as episodic memories                        |
| CheckpointManager (SQLite)        | Voice session state persisted for crash recovery                       |
| ReasoningManager (ReAct/CoT)      | Complex voice commands trigger structured reasoning                    |
| PlanManager                       | "Build the whole feature" → multi-step plan executed via voice updates |
| Skill library (saveSkill)         | Frequently used voice commands saved as skills                         |
| MCP extensions                    | Voice-accessible tools from any MCP server                             |

### New Super-Goose additions needed

| Addition                  | Location               | Description                                                                      |
| ------------------------- | ---------------------- | -------------------------------------------------------------------------------- |
| Voice session type        | `goose-server/routes/` | New `/voice/reply` endpoint optimized for voice (shorter responses, no markdown) |
| Voice-friendly formatting | `agent.rs`             | When session_type == "voice", instruct LLM to respond in speakable text          |
| Audio endpoint            | `goose-server/routes/` | Optional: accept audio directly, run STT, process, return audio                  |

---

## 7. Technology Stack for Implementation

| Layer                     | Technology                        | Why                                            |
| ------------------------- | --------------------------------- | ---------------------------------------------- |
| **Audio I/O**             | Kyutai Moshi (existing)           | Best local S2S, <200ms, full duplex            |
| **Intent Classification** | Regex → DistilBERT (upgrade path) | Fast, local, no cloud dependency               |
| **Agent Bridge**          | aiohttp HTTP client → goosed      | Existing API, no new deps                      |
| **Emotion Detection**     | SpeechBrain / Wav2Vec2            | Open-source, local GPU inference               |
| **Memory**                | Super-Goose MemoryManager         | Already has persistence, recall, cross-session |
| **Personality**           | YAML profiles (existing design)   | 13 profiles already specified in docs          |
| **Wake Word**             | openWakeWord (optional)           | Local, open-source, customizable               |
| **Turn Detection**        | Silero VAD                        | Same as LiveKit uses, proven, local            |

---

## 8. Success Criteria

| Metric                         | Target                              | How to Measure                                |
| ------------------------------ | ----------------------------------- | --------------------------------------------- |
| **Voice-to-action latency**    | <3 seconds (speak → tool starts)    | Timer from speech end to tool execution start |
| **Chat response latency**      | <500ms (Moshi native)               | Already achieved by Moshi                     |
| **Intent detection accuracy**  | >85% on common commands             | Test suite with 50+ voice commands            |
| **Emotion detection accuracy** | >80% (6 basic emotions)             | SpeechBrain benchmark                         |
| **Crash recovery**             | Resume within 10 seconds            | Kill process, measure time to reconnect       |
| **Memory recall**              | Recall previous voice conversations | "What did I ask about tests yesterday?"       |
| **End-to-end demo**            | "Run my tests" → voice says results | Full pipeline working                         |

---

## 9. What NOT to Build (Anti-goals)

- **Don't replace Moshi with STT→LLM→TTS pipeline** — Moshi's native S2S is the key differentiator
- **Don't build a custom LLM** — Use Super-Goose's existing LLM provider chain
- **Don't build custom memory** — Use Super-Goose's MemoryManager
- **Don't build telephony** — Not needed for local companion
- **Don't use cloud APIs** — 100% local is a core value proposition
- **Don't over-engineer intent classification** — Start with regex, upgrade only when needed

---

## 10. Files to Create (Phase 1 — Minimal Agentic Voice)

```
G:\goose\external\conscious\src\conscious\agentic\
├── __init__.py              # Package: agentic voice layer
├── intent_router.py         # Accumulate text tokens → classify intent
├── goose_bridge.py          # HTTP client to Super-Goose (goosed)
├── result_speaker.py        # Convert tool results → speakable text
└── action_queue.py          # Async queue for pending tool actions

# Modifications to existing files:
G:\goose\external\conscious\src\conscious\voice\agent_api.py   # Wire IntentRouter into on_text_received
G:\goose\external\conscious\src\conscious\voice\moshi_agent.py  # Add action callback alongside existing audio/text callbacks
```

---

## 11. Reference Repos & Papers

| Resource                  | URL                                          | Key Takeaway                                              |
| ------------------------- | -------------------------------------------- | --------------------------------------------------------- |
| **Pipecat**               | github.com/pipecat-ai/pipecat                | Best Python voice agent framework, composable pipelines   |
| **LiveKit Agents**        | github.com/livekit/agents                    | MCP support, function_tool, multi-agent, production-grade |
| **Moshi**                 | github.com/kyutai-labs/moshi                 | Foundation S2S model used by Conscious                    |
| **Moshi Paper**           | arxiv.org/abs/2410.00037                     | Technical details on Moshi architecture                   |
| **OpenAI Realtime**       | platform.openai.com/docs/guides/voice-agents | Gold standard for agentic voice (cloud)                   |
| **Ultravox**              | github.com/fixie-ai/ultravox                 | Alternative S2S with function calling                     |
| **SpeechBrain**           | speechbrain.github.io                        | Emotion detection, VAD, speaker ID                        |
| **openWakeWord**          | github.com/dscripka/openWakeWord             | Local wake word detection                                 |
| **Silero VAD**            | github.com/snakers4/silero-vad               | Voice Activity Detection (used by LiveKit)                |
| **Agent Voice (VS Code)** | github.com/PlagueHO/agent-voice              | Reference: voice control of coding agents                 |
| **Bolna**                 | github.com/bolna-ai/bolna                    | Reference: conversational voice AI architecture           |

---

## 12. Timeline Estimate

| Phase                                     | Duration | Deliverable                                         |
| ----------------------------------------- | -------- | --------------------------------------------------- |
| **Phase 1**: Intent Router + Goose Bridge | 2-3 days | "Run my tests" via voice → tool results spoken back |
| **Phase 2**: Emotion Detection            | 1-2 days | Detect frustration, adjust response tone            |
| **Phase 3**: Memory Integration           | 1 day    | Voice conversations remembered across sessions      |
| **Phase 4**: Personality Engine           | 1-2 days | Switch between Conscious/Jarvispool/etc by voice    |
| **Phase 5**: Advanced                     | Ongoing  | Streaming results, multi-turn, wake word            |

**Total to MVP (Phase 1)**: 2-3 days of focused work
**Total to full agentic voice**: ~1-2 weeks
