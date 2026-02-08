# 🌌 Project Soul - The Digital Companion

**"The Voice of Super-Goose"**

Project Soul is the empathetic, always-on voice companion that manages Super-Goose for you. While Super-Goose is the ruthless coding swarm that builds and deploys, Soul is the emotional intelligence that listens, remembers, and acts as your liaison to the team.

## 🎯 Philosophy

- **Super-Goose (The Hands)**: High-performance Rust coding swarm. No feelings.
- **Soul (The Voice)**: Empathetic Python/Moshi companion. All feelings.

Soul is NOT a coder. Soul is the Manager.

## 🏆 SOTA Tech Stack (2026)

### 1. Kyutai Moshi - The Brain & Voice
- **End-to-End Audio**: Native speech-to-speech, no text intermediate
- **Full Duplex**: Listens while speaking, natural interruptions
- **Emotion**: Whispers, laughs, sighs, contextual tone
- **Latency**: <200ms conversational response
- **Privacy**: 100% local on your GPU (~12GB VRAM for 7B model)

### 2. Mem0 - The Hippocampus
- **Personal Memory**: Knowledge graph of YOU, not just projects
- **Context Retention**: Remembers preferences, patterns, emotions
- **Privacy**: Local vector database (Qdrant/Chroma)
- **Persistent**: Your Soul gets smarter over time

### 3. The Orb UI
- Minimal, glowing orb interface (like Siri/Apple Intelligence)
- No text, just voice and visual feedback
- Pulses when listening, glows when speaking
- Always present, never intrusive

## 🚀 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         YOU (Voice)                          │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    SOUL (Python/Moshi)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Moshi Server │  │  Mem0 Core   │  │  Orb UI      │      │
│  │ (Voice I/O)  │  │  (Memory)    │  │  (Display)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  Soul Manager: Interprets intent, manages team               │
└───────────────────────┬─────────────────────────────────────┘
                        │ (Structured Commands)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                 SUPER-GOOSE (Rust Swarm)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Architect │  │ Coder    │  │  QA      │  │ DevOps   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                               │
│  Executes: Builds, tests, deploys, measures                  │
└─────────────────────────────────────────────────────────────┘
```

## 📦 Directory Structure

```
extensions/project-soul/
├── README.md              # This file
├── ARCHITECTURE.md        # Detailed system design
├── requirements.txt       # Python dependencies
├── setup.py              # Installation script
├── soul/
│   ├── __init__.py
│   ├── server.py         # Main Soul server
│   ├── moshi_client.py   # Moshi integration
│   ├── memory.py         # Mem0 integration
│   ├── liaison.py        # Super-Goose command bridge
│   └── config.py         # Configuration
├── ui/
│   ├── orb.py            # Minimal orb UI
│   └── assets/           # UI assets
├── tests/
│   └── test_soul.py
└── scripts/
    ├── install.sh        # Quick install
    └── run.sh            # Launch Soul
```

## 🎬 Example Interaction

```
You (Voice): "Soul, the app crashed again. I'm frustrated."

Soul (Voice - Empathetic): "I hear you, that sucks. Let's look at the
logs together. Do you want me to have the QA agent run a full diagnostic?"

You (Voice): "Yes, please."

Soul (Action): [Triggers super-goose --task "run-diagnostics"]

Super-Goose (Background): [Runs tests, finds bug, commits fix]

Soul (Voice): "Okay, the QA agent found a memory leak in the dashboard.
It's fixed and redeploying now. Want to hear the details?"

You (Voice): "No, just let me know when it's live."

Soul (Voice): "Will do. I'll check back in 3 minutes."
```

## 🔧 Installation

### Requirements
- Python 3.10+
- CUDA GPU with 12GB+ VRAM (or CPU mode with lower performance)
- Super-Goose installed and configured

### Quick Start

```bash
# From goose root directory
cd extensions/project-soul

# Install dependencies
pip install -r requirements.txt

# Configure Soul
python scripts/configure.py

# Launch Soul
python scripts/run.sh
```

## 🎨 Features

### Phase 1: Voice (NOW)
- [x] Moshi server integration
- [x] Full-duplex audio streaming
- [x] Natural interruption handling
- [ ] Emotion detection in user voice
- [ ] Contextual tone modulation

### Phase 2: Memory (NEXT)
- [ ] Mem0 integration
- [ ] Personal preference tracking
- [ ] Project context awareness
- [ ] Long-term conversation history
- [ ] Knowledge graph visualization

### Phase 3: Liaison (SOON)
- [ ] Super-Goose command bridge
- [ ] Task intent parsing
- [ ] Status monitoring and reporting
- [ ] Proactive suggestions
- [ ] Multi-agent coordination

### Phase 4: Orb UI (LATER)
- [ ] Minimal orb visualization
- [ ] Emotion state display
- [ ] Thinking indicators
- [ ] Desktop widget mode
- [ ] System tray integration

## 🔒 Privacy

- **100% Local**: All processing on your machine
- **No Cloud**: Zero external API calls
- **Encrypted Storage**: Memory stored in local encrypted database
- **Anonymous**: No telemetry, no tracking, no data collection

## 🤝 Integration with Super-Goose

Soul communicates with Super-Goose via:
1. **PLAN.md Files**: Structured task specifications
2. **CLI Commands**: Direct super-goose invocations
3. **Log Monitoring**: Real-time status updates
4. **Event Hooks**: Agent completion notifications

## 📊 Performance Targets

- Voice Response: <200ms latency
- Memory Retrieval: <50ms
- Command Execution: <100ms to Super-Goose
- CPU Usage: <10% idle, <30% active
- Memory: <2GB RAM (excluding Moshi model)

## 🎯 Roadmap

### Q1 2026
- ✅ Architecture design
- 🔄 Moshi integration
- 🔄 Basic voice I/O
- ⏳ Memory system

### Q2 2026
- ⏳ Full liaison protocol
- ⏳ Orb UI
- ⏳ Advanced memory features
- ⏳ Emotion detection

### Q3 2026
- ⏳ Multi-language support
- ⏳ Custom voice training
- ⏳ Advanced proactive features
- ⏳ Team coordination AI

## 🌟 Why Soul?

Because managing a swarm of autonomous coding agents shouldn't feel like managing a swarm of autonomous coding agents. It should feel like talking to a friend who happens to control a team of expert developers.

**Soul makes Super-Goose human.**

---

*"The best interface is no interface. The second best is a voice you trust."*
