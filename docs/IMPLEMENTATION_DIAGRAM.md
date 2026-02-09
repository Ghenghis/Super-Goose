# Super-Goose v1.24.2 - Implementation Diagrams

---

## 1. Data Flow: Enterprise Features

```
User Action                   Frontend                    Backend
    │                            │                           │
    │  Click Enterprise tab      │                           │
    ├───────────────────────────►│                           │
    │                            │  GET /enterprise/         │
    │                            │  guardrails/config        │
    │                            ├──────────────────────────►│
    │                            │                           │
    │                            │  { detectors: [...],      │
    │                            │    sensitivity: "medium",  │
    │                            │    fail_mode: "warn" }     │
    │                            │◄──────────────────────────┤
    │                            │                           │
    │  Toggle PII detector off   │                           │
    ├───────────────────────────►│                           │
    │                            │  PUT /enterprise/         │
    │                            │  guardrails/config        │
    │                            │  { pii: { enabled: false }}│
    │                            ├──────────────────────────►│
    │                            │                           │
    │  Send message              │                           │
    ├───────────────────────────►│                           │
    │                            │  POST /reply              │
    │                            ├──────────────────────────►│
    │                            │              ┌────────────┤
    │                            │              │ Guardrails │
    │                            │              │ scan input │
    │                            │              └────────────┤
    │                            │                           │
    │                            │  SSE: message stream      │
    │                            │  (includes guardrail      │
    │                            │   flags if triggered)     │
    │                            │◄──────────────────────────┤
    │                            │                           │
    │  [If violation]            │                           │
    │  Show GuardrailBanner      │                           │
    │◄───────────────────────────┤                           │
```

## 2. Data Flow: Voice/TTS System

```
User Action                   Frontend                    Backend
    │                            │                           │
    │  Toggle voice mode ON      │                           │
    ├───────────────────────────►│                           │
    │                            │  GET /tts/config          │
    │                            ├──────────────────────────►│
    │                            │  { personalities: [...],  │
    │                            │    available: true }       │
    │                            │◄──────────────────────────┤
    │                            │                           │
    │  Select "Jarvis"           │                           │
    ├───────────────────────────►│                           │
    │                            │  Store in config          │
    │                            │                           │
    │  AI generates response     │                           │
    │                            │  SSE: response text       │
    │                            │◄──────────────────────────┤
    │                            │                           │
    │                            │  [Voice mode ON]          │
    │                            │  Web Speech API synth     │
    │                            │  with Jarvis voice params │
    │                            │                           │
    │  Hear response + see       │                           │
    │  OutputWaveform animation  │                           │
    │◄───────────────────────────┤                           │
    │                            │                           │
    │  Click "Read Aloud" on     │                           │
    │  any message               │                           │
    ├───────────────────────────►│                           │
    │                            │  useTts.synthesize(text,  │
    │                            │    personality)           │
    │  Hear message              │                           │
    │◄───────────────────────────┤                           │
```

## 3. Data Flow: Context Compaction

```
User Action                   Frontend                    Backend
    │                            │                           │
    │  Context bar shows 85%     │                           │
    │                            │  [Auto-alert at 80%]     │
    │  See "Compact" button      │                           │
    │◄───────────────────────────┤                           │
    │                            │                           │
    │  Click "Compact"           │                           │
    ├───────────────────────────►│                           │
    │                            │  POST /enterprise/        │
    │                            │  context/compact          │
    │                            ├──────────────────────────►│
    │                            │              ┌────────────┤
    │                            │              │ Summarize  │
    │                            │              │ via LLM    │
    │                            │              └────────────┤
    │                            │  { tokens_before: 8000,  │
    │                            │    tokens_after: 3200,    │
    │                            │    summary: "..." }       │
    │                            │◄──────────────────────────┤
    │                            │                           │
    │  Context bar shows 40%     │                           │
    │  "Compacted: saved 4800    │                           │
    │   tokens" notification     │                           │
    │◄───────────────────────────┤                           │
```

## 4. Component Hierarchy: Enterprise Settings

```
SettingsView.tsx
│
├── Tab: "Enterprise" (NEW)
│   │
│   └── EnterpriseSettingsSection.tsx
│       │
│       ├── Collapsible: "Security Guardrails"
│       │   └── GuardrailsPanel.tsx
│       │       ├── DetectorGrid (6 toggle cards)
│       │       │   ├── PromptInjection [Toggle] [Sensitivity▼]
│       │       │   ├── PII Detection  [Toggle] [Sensitivity▼]
│       │       │   ├── Jailbreak      [Toggle] [Sensitivity▼]
│       │       │   ├── Topic Filter   [Toggle] [Sensitivity▼]
│       │       │   ├── Keyword Filter [Toggle] [Sensitivity▼]
│       │       │   └── Secret Scanner [Toggle] [Sensitivity▼]
│       │       ├── FailMode selector (FailOpen | FailClosed)
│       │       └── Status: "6/6 active" badge
│       │
│       ├── Collapsible: "MCP Gateway"
│       │   └── GatewayPanel.tsx
│       │       ├── Server list with health status
│       │       ├── Permission rules table
│       │       └── Audit log toggle + viewer link
│       │
│       ├── Collapsible: "Observability"
│       │   └── ObservabilityPanel.tsx
│       │       ├── Cost summary card
│       │       ├── Token usage breakdown
│       │       └── Export button (JSON/CSV/MD)
│       │
│       ├── Collapsible: "Policies"
│       │   └── PoliciesPanel.tsx
│       │       ├── Active rules count
│       │       ├── Rule list with conditions
│       │       └── Import YAML button
│       │
│       ├── Collapsible: "Lifecycle Hooks"
│       │   └── HooksPanel.tsx
│       │       ├── Event type list (13 events)
│       │       ├── Enabled/disabled per event
│       │       └── Recent hook activity
│       │
│       └── Collapsible: "Memory"
│           └── MemoryPanel.tsx
│               ├── 4 subsystem status cards
│               ├── Memory search bar
│               ├── Consolidation trigger
│               └── Export/import buttons
│
├── Tab: "Voice" (NEW)
│   │
│   └── VoiceSettingsSection.tsx
│       ├── Section: "Speech-to-Text"
│       │   └── DictationSettings.tsx (MOVED from Chat tab)
│       │
│       ├── Section: "Text-to-Speech"
│       │   ├── Enable TTS toggle
│       │   ├── Auto-read responses toggle
│       │   └── TTS provider info
│       │
│       ├── Section: "Personality"
│       │   └── PersonalitySelector.tsx
│       │       ├── 6 safe personality cards
│       │       ├── "Show 18+ personalities" (age gate)
│       │       └── Preview voice button per card
│       │
│       └── Section: "Voice Parameters"
│           └── VoiceParamControls.tsx
│               ├── Pitch slider (-24 to +24)
│               ├── Speed slider (0.5x to 2.0x)
│               └── Volume slider
│
└── ... existing tabs unchanged ...
```

## 5. Component Hierarchy: Chat Enhancements

```
BaseChat.tsx
│
├── Toolbar (NEW)
│   ├── ExportConversation.tsx
│   │   ├── [📥 Export] dropdown
│   │   ├── Option: JSON
│   │   ├── Option: Markdown
│   │   └── Option: Copy All
│   └── VoiceToggle.tsx
│       └── [🎤 Voice: Jarvis] toggle
│
├── ProgressiveMessageList
│   │
│   ├── GooseMessage.tsx (MODIFIED)
│   │   ├── Message content (existing)
│   │   ├── Thinking display (existing)
│   │   ├── Tool calls (existing)
│   │   │
│   │   ├── Hover Actions (NEW/ENHANCED)
│   │   │   ├── [📋 Copy] - One-click copy
│   │   │   ├── [🔄 Regenerate] - Re-run last prompt
│   │   │   ├── [🔊 Read Aloud] - TTS this message
│   │   │   └── [📎 Share] - Copy link (existing)
│   │   │
│   │   └── GuardrailBanner.tsx (NEW - conditional)
│   │       └── "⚠️ Guardrail triggered: [reason]"
│   │           └── Click to expand details
│   │
│   └── UserMessage.tsx
│       └── Edit/Fork (existing)
│
├── ChatInput.tsx (MODIFIED)
│   │
│   ├── Textarea + file upload (existing)
│   │
│   └── Bottom Menu (ENHANCED)
│       ├── [📁 Dir] (existing)
│       ├── [🤖 Model] (existing)
│       ├── [⚡ Mode] (existing)
│       ├── [🧩 Ext] (existing)
│       │
│       ├── GuardrailsStatusBadge.tsx (NEW)
│       │   └── 🛡️ Green=all pass, Yellow=warnings, Red=blocked
│       │
│       ├── GatewayStatusBadge.tsx (NEW)
│       │   └── 🔗 Connected/Disconnected
│       │
│       ├── MemoryStatusBadge.tsx (NEW)
│       │   └── 🧠 X items stored
│       │
│       ├── VoiceStatusBadge.tsx (NEW)
│       │   └── 🎤 Personality name or "Off"
│       │
│       ├── CostTracker.tsx (ENHANCED)
│       │   └── Click → detailed breakdown popover
│       │
│       ├── Context bar (ENHANCED)
│       │   ├── Progress bar (existing)
│       │   └── CompactionControls.tsx (NEW)
│       │       └── [Compact] button (appears at 80%)
│       │
│       └── AlertPopover (ENHANCED)
│           └── Enterprise alerts added
│
└── OutputWaveform.tsx (NEW - during TTS playback)
    └── Frequency bars animating during AI speech
```

## 6. Welcome Screen Flow

```
App Launch
    │
    ├── First Launch? ──────────────── Yes ──────┐
    │                                             │
    │   No                                        │
    │   │                                         ▼
    │   │                              ┌─────────────────────┐
    │   │                              │   Welcome Screen    │
    │   │                              │                     │
    │   │                              │  "Welcome to        │
    │   │                              │   Super-Goose"      │
    │   │                              │                     │
    │   │                              │  Choose companion:  │
    │   │                              │  ┌─────┐ ┌─────┐  │
    │   │                              │  │ 🎩  │ │ 🧠  │  │
    │   │                              │  │Jarvis│ │Consc│  │
    │   │                              │  └─────┘ └─────┘  │
    │   │                              │  ┌─────┐ ┌─────┐  │
    │   │                              │  │ 👋  │ │ 🎓  │  │
    │   │                              │  │Buddy│ │ Prof │  │
    │   │                              │  └─────┘ └─────┘  │
    │   │                              │                     │
    │   │                              │  [Skip] [Continue]  │
    │   │                              └─────────────────────┘
    │   │                                         │
    │   │                              Selected personality
    │   │                                         │
    │   │                              ┌─────────────────────┐
    │   │                              │  Voice greeting     │
    │   │                              │  (TTS if available) │
    │   │                              │                     │
    │   │                              │  "I am Conscious... │
    │   │                              │   What shall I call │
    │   │                              │   you?"             │
    │   │                              └─────────────────────┘
    │   │                                         │
    │   ├────────────────────────────────────┬─────┘
    │                                        │
    ▼                                        ▼
┌──────────────────────────────────────────────────┐
│                   Hub (Home)                       │
│                                                    │
│  SessionsInsights (ENHANCED)                       │
│  + ChatInput for new session                       │
│  + Enterprise status summary (if enterprise mode)  │
└──────────────────────────────────────────────────┘
```

## 7. Agent Execution Timeline

```
Time ──────────────────────────────────────────────────────►

Agent 1 (Enterprise Routes):
████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

Agent 2 (Enterprise UI):
░░░░░░░░████████████████████████████████░░░░░░░░░░░░░░░░

Agent 3 (Chat Features):
████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░

Agent 4 (Voice/TTS):
████████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░

Agent 5 (Wire Endpoints):
████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░

Agent 6 (Welcome Screen):
░░░░░░░░░░░░░░░░████████████████████████░░░░░░░░░░░░░░░░

Agent 7 (Status Badges):
░░░░░░░░████████████████████████████████░░░░░░░░░░░░░░░░

Agent 8 (Context Mgmt):
████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░

                  Phase 1            Phase 2
              (Foundation)      (Integration)
```

---

*Implementation diagrams for Super-Goose v1.24.2 major release*
*Last Updated: 2026-02-08*
