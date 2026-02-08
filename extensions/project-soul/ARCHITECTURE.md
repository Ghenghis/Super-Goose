# 🏗️ Project Soul - Architecture Deep Dive

## System Overview

Project Soul is a **Voice-First AI Companion** that acts as an emotional, intelligent liaison between the user and Super-Goose (the coding swarm). It is NOT a chatbot with voice output—it is a native speech-to-speech system with persistent memory and emotional intelligence.

## Core Principles

1. **Speech-First, Not Text-First**: Native audio processing, not TTS/STT pipelines
2. **Emotional, Not Transactional**: Responds with empathy, not just data
3. **Persistent, Not Ephemeral**: Remembers you, your preferences, your patterns
4. **Proactive, Not Reactive**: Suggests, reminds, and coordinates without being asked
5. **Local, Not Cloud**: 100% privacy, zero external dependencies

## Technical Architecture

### Layer 1: Voice I/O (Moshi)

**Kyutai Moshi** is the only open-source model that matches GPT-4o's native audio capabilities.

```python
# Moshi Integration
class MoshiClient:
    """Native speech-to-speech interface"""

    def __init__(self, model_path: str = "moshi-7b"):
        self.model = load_moshi_model(model_path)
        self.stream = AudioStream(duplex=True)

    async def listen_and_respond(self):
        """Full-duplex audio processing"""
        async for audio_chunk in self.stream:
            # Process audio directly, no text intermediate
            response_audio = await self.model.process(audio_chunk)
            await self.stream.play(response_audio)

    def interrupt(self):
        """Handle natural interruptions"""
        self.stream.stop_playback()
        self.model.reset_context(keep_last=3)  # Keep recent context
```

**Key Features:**
- **Full Duplex**: Listens while speaking, interrupts naturally
- **Emotion Modulation**: Can laugh, sigh, whisper based on context
- **Low Latency**: <200ms response time (streaming)
- **Context Aware**: Maintains conversation state without text transcription

**Hardware Requirements:**
- **GPU Mode**: NVIDIA GPU with 12GB+ VRAM (RTX 3060 Ti or better)
- **CPU Mode**: 32GB RAM, slower but functional
- **Recommended**: RTX 4060 Ti (16GB) or better for real-time performance

### Layer 2: Memory System (Mem0)

**Mem0** creates a persistent knowledge graph of the user, their preferences, and their history.

```python
# Mem0 Integration
class SoulMemory:
    """Persistent personal memory system"""

    def __init__(self, user_id: str):
        self.mem0 = Mem0Client(
            vector_store="qdrant",  # Local vector DB
            embedding_model="all-MiniLM-L6-v2",  # Fast, local embeddings
            storage_path="~/.soul/memory"
        )
        self.user_id = user_id

    async def remember(self, conversation: dict):
        """Extract and store user preferences/context"""
        entities = extract_entities(conversation)
        await self.mem0.add_memories(
            user_id=self.user_id,
            memories=entities,
            metadata={"timestamp": now(), "session_id": self.session}
        )

    async def recall(self, query: str) -> List[Memory]:
        """Retrieve relevant memories"""
        return await self.mem0.search_memories(
            user_id=self.user_id,
            query=query,
            limit=5
        )

    async def forget(self, memory_id: str):
        """Delete specific memory (user privacy control)"""
        await self.mem0.delete_memory(memory_id)
```

**Memory Types:**

1. **Preferences**: "User prefers dark mode", "User likes Tailwind CSS"
2. **Context**: "Working on React dashboard", "Uses Rust for backend"
3. **Emotional State**: "User was frustrated with deployment", "Celebrates wins"
4. **Patterns**: "Usually codes between 9am-2pm", "Prefers voice commands for quick tasks"
5. **Projects**: "Super-Goose codebase location", "Current sprint goals"

**Storage:**
- **Vector DB**: Qdrant (local, fast, embeddable)
- **Encryption**: AES-256 for sensitive data
- **Backup**: Automatic daily backups to `~/.soul/backups/`

### Layer 3: Liaison Protocol (Super-Goose Bridge)

Soul translates natural language intent into structured commands for Super-Goose.

```python
# Liaison Protocol
class SuperGooseLiaison:
    """Bridge between Soul and Super-Goose"""

    def __init__(self, goose_path: str):
        self.goose_cli = GooseCLI(goose_path)
        self.task_queue = TaskQueue()
        self.status_monitor = StatusMonitor()

    async def parse_intent(self, user_speech: str, context: dict) -> Task:
        """Convert natural language to structured task"""
        # Extract intent
        intent = analyze_intent(user_speech, context)

        # Map to Super-Goose task
        task = Task(
            type=intent.action,  # "build", "test", "deploy", "fix"
            target=intent.target,  # "dashboard", "api", "all"
            priority=intent.urgency,  # 1-10
            constraints=intent.preferences  # From memory
        )

        return task

    async def execute_task(self, task: Task) -> TaskResult:
        """Send task to Super-Goose and monitor"""
        # Generate PLAN.md
        plan = generate_plan(task)
        await self.goose_cli.submit_plan(plan)

        # Monitor execution
        async for status in self.status_monitor.watch(task.id):
            if status.needs_attention:
                await self.notify_user(status)

        return await self.goose_cli.get_result(task.id)

    async def proactive_suggestion(self):
        """Soul suggests actions without being asked"""
        # Check for patterns
        if self.status_monitor.test_failures > 3:
            await self.voice_output(
                "Hey, I noticed tests are failing. Want me to "
                "have the QA agent investigate?"
            )
```

**Command Types:**

1. **Direct Commands**: "Run tests" → `super-goose test --all`
2. **Intent-Based**: "Fix the dashboard" → Analyze logs, identify issue, create plan
3. **Contextual**: "Make it faster" → Remember what "it" is from previous conversation
4. **Proactive**: Soul suggests actions based on monitoring

**Integration Points:**

- **CLI**: Direct `super-goose` command invocation
- **PLAN.md**: Structured task specifications
- **Logs**: Real-time monitoring of agent output
- **Git Hooks**: Automatic status updates on commits
- **Event System**: WebSocket notifications from agents

### Layer 4: Emotional Intelligence

Soul analyzes both user emotion (from voice) and responds with appropriate emotion.

```python
# Emotion System
class EmotionEngine:
    """Detect and respond with emotional intelligence"""

    async def detect_user_emotion(self, audio: AudioChunk) -> Emotion:
        """Analyze voice for emotional state"""
        features = extract_prosody(audio)  # Pitch, tempo, energy
        return classify_emotion(features)

    async def modulate_response(self, text: str, emotion: Emotion) -> AudioParams:
        """Adjust Moshi output parameters"""
        if emotion == "frustrated":
            return AudioParams(
                tone="empathetic",
                speed=0.9,  # Slower, calmer
                pitch=0.95,  # Slightly lower
                add_pause=True  # Give space
            )
        elif emotion == "excited":
            return AudioParams(
                tone="enthusiastic",
                speed=1.1,  # Match energy
                pitch=1.05,  # Slightly higher
                add_laughter=True
            )
        # ... more emotion mappings
```

**Emotion States:**

- **User**: frustrated, excited, confused, tired, focused, celebratory
- **Soul Response**: empathetic, enthusiastic, explanatory, energizing, supportive, congratulatory

**Examples:**

```
User (frustrated voice): "This isn't working!"
Soul (calm, empathetic): "I hear you, that's frustrating. Let's
figure this out together. What's happening?"

User (excited voice): "It's working!"
Soul (enthusiastic): "Yes! That's awesome! Want me to run the full
test suite to make sure everything's solid?"
```

### Layer 5: Orb UI

Minimal, non-intrusive visual companion.

```python
# Orb UI
class OrbUI:
    """Visual representation of Soul"""

    def __init__(self):
        self.window = create_window(
            size=(200, 200),
            transparent=True,
            always_on_top=True,
            position="bottom-right"
        )
        self.state = OrbState.IDLE

    async def animate(self):
        """Continuous animation loop"""
        while True:
            if self.state == OrbState.LISTENING:
                await self.pulse_animation(color="blue")
            elif self.state == OrbState.THINKING:
                await self.ripple_animation(color="purple")
            elif self.state == OrbState.SPEAKING:
                await self.wave_animation(color="green")
            await asyncio.sleep(0.016)  # 60 FPS
```

**States:**

- **Idle**: Gentle breathing animation (slow pulse)
- **Listening**: Reactive pulse (responds to voice volume)
- **Thinking**: Ripple effect (processing)
- **Speaking**: Wave animation (synchronized with audio output)
- **Working**: Rotating glow (Super-Goose executing tasks)
- **Alert**: Attention-grabbing pulse (needs user input)

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER SPEAKS                                                   │
│    "Soul, the tests are failing again."                          │
└────────────┬────────────────────────────────────────────────────┘
             │ (Audio Stream)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. MOSHI PROCESSES (Full Duplex)                                │
│    - Hear audio directly (no text transcription)                │
│    - Detect emotion: "frustrated"                               │
│    - Extract intent: "investigate test failures"                │
└────────────┬────────────────────────────────────────────────────┘
             │ (Intent + Emotion)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. MEMORY RETRIEVAL (Mem0)                                      │
│    - Recall: "Tests were also failing yesterday"                │
│    - Recall: "User prefers detailed explanations"               │
│    - Recall: "Current project: React dashboard"                 │
└────────────┬────────────────────────────────────────────────────┘
             │ (Context)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. LIAISON PROCESSES (Intent → Command)                         │
│    - Parse intent: "run diagnostics"                            │
│    - Check Super-Goose status: "QA agent available"             │
│    - Generate command: "super-goose test --verbose --log"       │
└────────────┬────────────────────────────────────────────────────┘
             │ (Command)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. SUPER-GOOSE EXECUTES                                         │
│    - QA Agent runs tests                                        │
│    - Collects logs and failure details                          │
│    - Identifies root cause                                      │
└────────────┬────────────────────────────────────────────────────┘
             │ (Result)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. SOUL RESPONDS (Moshi Output)                                 │
│    - Generate empathetic response                               │
│    - Modulate tone: "calm, supportive"                          │
│    - Stream audio: "I see the issue. It's a timeout in the      │
│      authentication module. Want me to have the dev team fix    │
│      it, or do you want to look at it first?"                   │
└────────────┬────────────────────────────────────────────────────┘
             │ (Audio Stream)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. USER HEARS RESPONSE                                          │
│    (Orb pulses green, voice is calm and clear)                  │
└─────────────────────────────────────────────────────────────────┘
```

## Performance Requirements

| Component | Target | Acceptable | Notes |
|-----------|--------|------------|-------|
| Voice Latency | <200ms | <500ms | Full duplex streaming |
| Memory Retrieval | <50ms | <100ms | Vector search |
| Command Execution | <100ms | <200ms | To Super-Goose |
| Emotion Detection | <100ms | <200ms | Real-time prosody |
| UI Frame Rate | 60 FPS | 30 FPS | Smooth animations |
| CPU (Idle) | <10% | <15% | Background listening |
| CPU (Active) | <30% | <50% | Full processing |
| RAM Usage | <2GB | <4GB | Excluding Moshi model |
| GPU VRAM | 12GB | 16GB | For Moshi 7B model |

## Security & Privacy

1. **No External Calls**: 100% local processing, zero cloud dependencies
2. **Encrypted Storage**: All memories encrypted at rest (AES-256)
3. **User Control**: Easy memory inspection and deletion
4. **No Telemetry**: No usage tracking, no data collection
5. **Sandboxed**: Soul runs in isolated environment, limited file system access
6. **Audit Logs**: All commands to Super-Goose logged for transparency

## Deployment Architecture

```
~/.soul/
├── config.yaml           # User configuration
├── memory/
│   ├── qdrant/          # Vector database
│   ├── memories.db      # Structured memory store
│   └── embeddings/      # Local embedding cache
├── models/
│   ├── moshi-7b/        # Moshi model weights
│   └── emotion/         # Emotion classification model
├── logs/
│   ├── conversations/   # Conversation history
│   ├── commands.log     # Commands sent to Super-Goose
│   └── errors.log       # Error logs
└── backups/             # Automatic daily backups
```

## Integration with Super-Goose

### 1. Command Interface

```yaml
# ~/.soul/config.yaml
super_goose:
  cli_path: "/path/to/super-goose"
  working_directory: "/path/to/project"
  agents:
    architect: enabled
    coder: enabled
    qa: enabled
    devops: enabled
  notifications:
    on_completion: true
    on_error: true
    on_milestone: true
```

### 2. Event System

Soul listens for Super-Goose events via WebSocket:

```python
async def listen_for_events():
    async with websockets.connect("ws://localhost:8080/events") as ws:
        async for message in ws:
            event = parse_event(message)
            if event.type == "test_failed":
                await soul.proactive_notification(
                    f"Heads up, {event.details}"
                )
```

### 3. Plan Generation

Soul generates structured PLAN.md files for Super-Goose:

```markdown
# Task: Fix Authentication Timeout
Priority: High
Requested by: Soul (via user voice command)

## Context
User reported: "Tests are failing again"
Memory: Same issue occurred 2 days ago
Root cause: Timeout in auth module (identified by QA agent)

## Requirements
- Fix timeout in `auth/session.rs`
- Add retry logic with exponential backoff
- Update tests to handle longer auth times
- User preference: Clean Architecture pattern

## Success Criteria
- All tests pass
- Auth timeout < 5 seconds
- No regressions in other modules

## Assigned Agents
1. Architect: Review current auth flow
2. Coder: Implement fix
3. QA: Verify fix and run regression suite
```

## Future Enhancements

### Phase 2: Advanced Memory
- **Relationship Mapping**: Understand connections between concepts
- **Temporal Reasoning**: "What was I working on last Tuesday?"
- **Goal Tracking**: Remember long-term objectives

### Phase 3: Proactive Intelligence
- **Pattern Recognition**: "You usually take a break around now"
- **Predictive Suggestions**: "Based on this bug, you might want to check X"
- **Context Switching**: Seamlessly resume previous conversations

### Phase 4: Multi-Modal
- **Screen Awareness**: Understand what's on your screen
- **Gesture Control**: Wave to activate, point to reference
- **Expression Detection**: Read facial cues via webcam (opt-in)

### Phase 5: Team Coordination
- **Multi-Agent Orchestration**: Coordinate complex tasks across agents
- **Priority Management**: Auto-prioritize based on deadlines and dependencies
- **Resource Optimization**: Balance agent workload intelligently

---

**Soul is the emotional layer that makes autonomous development feel human.**
