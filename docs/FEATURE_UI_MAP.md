# Super-Goose Feature-to-UI Placement Map

**Generated:** 2026-02-08
**Branch:** claude/nifty-lumiere
**Purpose:** Map enterprise features to UI integration points for clean, progressive disclosure

---

## Current UI Architecture

### Routes (Hash Router in App.tsx)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | Hub.tsx | Home - SessionInsights + new chat input |
| `/pair` | BaseChat.tsx | Active chat session |
| `/settings` | SettingsView.tsx | 6-tab settings dashboard |
| `/sessions` | SessionsView.tsx | Session history browser |
| `/recipes` | RecipesView.tsx | Recipe management |
| `/schedules` | SchedulesView.tsx | Scheduled tasks |
| `/apps` | AppsView.tsx | MCP app registry |
| `/extensions` | ExtensionsView.tsx | Extension management |
| `/shared-session` | SharedSessionView.tsx | Shared session viewer |
| `/permission` | PermissionSettingsView.tsx | Permission rules |

### Sidebar (AppSidebar.tsx)

```
Home
Chat Section (Collapsible)
  New Chat
  Recent Sessions (max 10)
  View All Sessions
Recipes
Apps (conditional)
Scheduler
Extensions
---
Settings
```

### Settings Tabs (SettingsView.tsx)

| Tab | Component | Contents |
|-----|-----------|----------|
| Models | ModelsSection.tsx | Provider config, model selection, lead/worker |
| Chat | ChatSettingsSection.tsx | Modes, response styles, goosehints, spellcheck |
| Session | SessionSharingSection.tsx | Sharing config, external backend |
| Prompts | PromptsSettingsSection.tsx | System prompts, templates |
| Keyboard | KeyboardShortcutsSection.tsx | Shortcut recording |
| App | AppSettingsSection.tsx | Updates, telemetry, config |

---

## Stage 5 Enterprise Feature Placement

### Design Principle: Progressive Disclosure

- **Default:** Clean, uncluttered interface - features hidden until needed
- **On demand:** Enterprise panels expand when clicked/toggled
- **Non-blocking:** Guardrail violations show inline, not modal dialogs
- **Contextual:** Feature indicators appear where relevant (chat, settings, sidebar)

---

### 1. Guardrails Integration

**Backend:** `crates/goose/src/guardrails/` (6 detectors, async pipeline)

| UI Location | Component to Create/Modify | What It Shows |
|-------------|---------------------------|---------------|
| **Chat Input** | Modify `ChatInput.tsx` | Pre-flight scan indicator (subtle spinner) |
| **Message Display** | Modify `GooseMessage.tsx` | Inline violation banner (collapsible) |
| **Settings > Chat** | New `GuardrailsConfig.tsx` | Detector toggles, sensitivity sliders |
| **Bottom Menu** | Modify `BottomMenuAlertPopover.tsx` | Guardrail status badge (green/yellow/red) |

**Implementation:**
```
ChatInput.tsx
  └── Before send: call /guardrails/scan endpoint
  └── Show subtle indicator during scan
  └── If blocked: inline warning, not modal

GooseMessage.tsx
  └── If message has guardrail flags: show collapsible banner
  └── Banner: "Guardrail triggered: [reason] - [action taken]"
  └── Click to expand full details

SettingsView.tsx > Chat tab
  └── New section: "Safety & Compliance"
  └── GuardrailsConfig.tsx:
      ├── Toggle each detector on/off
      ├── Sensitivity per detector (low/medium/high)
      └── Fail mode (block/warn/log)
```

### 2. MCP Gateway Integration

**Backend:** `crates/goose/src/mcp_gateway/` (routing, permissions, audit)

| UI Location | Component to Create/Modify | What It Shows |
|-------------|---------------------------|---------------|
| **Extensions page** | Modify `ExtensionsView.tsx` | Gateway status per extension |
| **Settings > Extensions** | New `GatewayConfig.tsx` | Permission rules, routing config |
| **Tool Calls** | Modify `ToolCallWithResponse.tsx` | Permission check indicator |
| **Sidebar** | Modify `AppSidebar.tsx` | Gateway health dot (conditional) |

**Implementation:**
```
ExtensionsView.tsx
  └── Each extension card: gateway status badge
  └── "Routed via Gateway" / "Direct" label

ToolCallWithResponse.tsx
  └── Permission indicator: checkmark or shield icon
  └── Hover tooltip: "Allowed by policy: [rule name]"
  └── If denied: inline explanation with retry option

Settings > Extensions tab
  └── New section: "Gateway Configuration"
  └── GatewayConfig.tsx:
      ├── Server routing rules table
      ├── Permission allowlist/blocklist
      └── Audit log toggle
```

### 3. Observability Integration

**Backend:** `crates/goose/src/observability/` (OpenTelemetry, cost tracking)

| UI Location | Component to Create/Modify | What It Shows |
|-------------|---------------------------|---------------|
| **Bottom Menu** | Modify `CostTracker.tsx` | Enhanced cost + token display |
| **Hub (Home)** | Modify `SessionsInsights.tsx` | Usage trends, cost graphs |
| **Settings > App** | New `ObservabilityConfig.tsx` | Trace export, metric endpoints |

**Implementation:**
```
CostTracker.tsx (already exists!)
  └── Enhance with: session cost, running total, daily budget
  └── Click to expand: per-tool breakdown, model costs

SessionsInsights.tsx (already exists!)
  └── Add: token usage trend chart (mini sparkline)
  └── Add: cost per session average
  └── Add: top tools by usage

Settings > App tab
  └── New section: "Monitoring & Traces"
  └── ObservabilityConfig.tsx:
      ├── OpenTelemetry endpoint URL
      ├── Export format selection
      └── Sampling rate slider
```

### 4. Policy Engine Integration

**Backend:** `crates/goose/src/policies/` (26 conditions, 11 actions, YAML)

| UI Location | Component to Create/Modify | What It Shows |
|-------------|---------------------------|---------------|
| **Permission page** | Modify `PermissionSettingsView.tsx` | Policy rules viewer/editor |
| **Tool Calls** | Modify `ToolCallConfirmation.tsx` | Policy-based approval UI |
| **Settings** | New `PoliciesConfig.tsx` | YAML policy editor |

**Implementation:**
```
PermissionSettingsView.tsx (already exists!)
  └── Extend with: policy rules table
  └── Each rule: condition → action mapping
  └── Import/export YAML policies

ToolCallConfirmation.tsx (already exists!)
  └── Show which policy triggered approval
  └── "Required by policy: [name]"
```

### 5. Prompt Patterns Integration

**Backend:** `crates/goose/src/prompts/` (14 patterns, templates)

| UI Location | Component to Create/Modify | What It Shows |
|-------------|---------------------------|---------------|
| **Settings > Prompts** | Modify `PromptsSettingsSection.tsx` | Pattern library browser |
| **Chat Input** | Modify `ChatInput.tsx` | Pattern suggestions on @ or / |

---

## Missing Chatbot Features

### Priority: Add to BaseChat/ChatInput

| Feature | Component Location | Implementation |
|---------|-------------------|----------------|
| **Regenerate response** | `GooseMessage.tsx` | "Regenerate" button on hover of AI messages |
| **Copy response** | `GooseMessage.tsx` | "Copy" button on hover (MessageCopyLink exists but limited) |
| **Export conversation** | `BaseChat.tsx` toolbar | Export as JSON/Markdown/PDF |
| **System status** | `SystemNotificationInline.tsx` | Connection status, model info, session health |
| **Message search** | New `MessageSearch.tsx` | Search within current conversation |

---

## Conscious Voice Integration Points

### Existing Infrastructure

| Component | File | Current State |
|-----------|------|---------------|
| WaveformVisualizer | `ui/desktop/src/components/WaveformVisualizer.tsx` | Input-only, 16-bar FFT |
| useAudioRecorder | `ui/desktop/src/hooks/useAudioRecorder.ts` | VAD, 4 providers |
| Dictation API | `crates/goose-server/src/routes/dictation.rs` | STT endpoint |
| DictationSettings | `ui/desktop/src/components/settings/dictation/` | Provider selection |

### New Components Needed

| Component | Location | Purpose |
|-----------|----------|---------|
| **TTS Engine** | `ui/desktop/src/hooks/useTTSEngine.ts` | Text-to-speech output |
| **OutputVisualizer** | `ui/desktop/src/components/OutputWaveform.tsx` | AI response audio viz |
| **PersonalityPicker** | `ui/desktop/src/components/settings/voice/` | Voice personality selection |
| **WelcomeScreen** | `ui/desktop/src/components/WelcomeScreen.tsx` | First-launch voice greeting |
| **VoiceToggle** | `ChatInput.tsx` footer | Global voice on/off |

### Integration Architecture

```
ChatInput.tsx
  └── Voice button (exists) → STT → text input
  └── NEW: Voice mode toggle → enables TTS for responses

GooseMessage.tsx
  └── NEW: If voice mode on → auto-speak response via TTS
  └── NEW: OutputWaveform shows during playback

Settings > Voice tab (NEW)
  └── VoiceSettingsSection.tsx:
      ├── Enable/disable voice mode
      ├── PersonalityPicker (Conscious default, etc.)
      ├── TTS provider selection
      ├── Speech rate, pitch controls
      └── Welcome message configuration

Hub.tsx (Home)
  └── NEW: WelcomeScreen (first launch or configurable)
  └── Plays voice greeting with personality
  └── Graceful fallback if Conscious unavailable
```

---

## Server Route Gaps (Endpoints Needed)

| Feature | New Route | Purpose |
|---------|-----------|---------|
| Guardrails | `POST /guardrails/scan` | Pre-flight content scan |
| Guardrails | `GET /guardrails/config` | Get detector configuration |
| Guardrails | `PUT /guardrails/config` | Update detector settings |
| Gateway | `GET /gateway/status` | Server routing health |
| Gateway | `GET /gateway/audit` | Audit log entries |
| Observability | `GET /observability/metrics` | Current metrics snapshot |
| Policies | `GET /policies/rules` | List active policies |
| Policies | `PUT /policies/rules` | Update policy YAML |
| Voice/TTS | `POST /voice/synthesize` | Text-to-speech generation |
| Voice/TTS | `GET /voice/personalities` | List available personalities |

---

## Implementation Priority

### Sprint 1 (Current): Foundation
1. Enhance CostTracker (observability already has data)
2. Add regenerate + copy buttons to GooseMessage
3. Add guardrail status badge to bottom menu
4. Add export conversation button

### Sprint 2: Enterprise Panels
5. GuardrailsConfig in Settings > Chat
6. GatewayConfig in Settings > Extensions
7. Policy viewer in Permission settings
8. Server routes for guardrails/gateway config

### Sprint 3: Voice Integration
9. TTS engine hook
10. OutputWaveform component
11. Voice settings tab
12. Welcome screen with personality

### Sprint 4: Polish
13. Message search within chat
14. Enterprise dashboard route (optional)
15. Full audit log viewer
16. Observability export config

---

*Generated from 5-agent codebase audit*
*Last Updated: 2026-02-08*
