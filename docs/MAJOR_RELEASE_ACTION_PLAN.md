# Super-Goose v1.24.2 - Major Release Action Plan

**Date:** 2026-02-08
**Branch:** claude/nifty-lumiere
**Type:** MILESTONE RELEASE - Full UX/UI + Enterprise + Conscious Voice

---

## Executive Summary

**Problem:** Super-Goose has 9 major enterprise features fully implemented in the backend (Rust) with ZERO or minimal UI exposure. The upstream Block/goose chatbot features are mostly working, but key missing features (regenerate, export, enterprise panels) need to be added. Conscious voice integration needs new TTS infrastructure.

**Solution:** 8-agent parallel implementation to wire all backend features to UI, add missing chatbot features, and create Conscious voice foundation.

---

## Agent Task Assignments

### Agent 1: Enterprise API Routes (Rust)
**Create server routes for enterprise features that have no endpoints**

Files to create/modify:
- `crates/goose-server/src/routes/enterprise.rs` (NEW - combined enterprise endpoints)
- `crates/goose-server/src/routes/mod.rs` (register new routes)

Endpoints to implement:
```
GET  /enterprise/guardrails/config     → Current detector config
PUT  /enterprise/guardrails/config     → Update detector settings
GET  /enterprise/guardrails/status     → Active/inactive detectors + stats
GET  /enterprise/gateway/status        → Server routing health
GET  /enterprise/gateway/audit         → Audit log entries (paginated)
GET  /enterprise/observability/metrics → Current metrics snapshot
GET  /enterprise/observability/cost    → Cost report (JSON format)
GET  /enterprise/policies/rules        → List active policies
GET  /enterprise/hooks/events          → List hook event types
GET  /enterprise/hooks/config          → Hook configuration
GET  /enterprise/memory/status         → Memory subsystem status
GET  /enterprise/memory/search         → Semantic memory search
POST /config/backup                    → Wire existing backup func
POST /config/recover                   → Wire existing recover func
```

### Agent 2: Enterprise Settings UI (React)
**Create the Enterprise settings tab in the UI**

Files to create:
- `ui/desktop/src/components/settings/enterprise/EnterpriseSettingsSection.tsx`
- `ui/desktop/src/components/settings/enterprise/GuardrailsPanel.tsx`
- `ui/desktop/src/components/settings/enterprise/GatewayPanel.tsx`
- `ui/desktop/src/components/settings/enterprise/ObservabilityPanel.tsx`
- `ui/desktop/src/components/settings/enterprise/PoliciesPanel.tsx`
- `ui/desktop/src/components/settings/enterprise/HooksPanel.tsx`
- `ui/desktop/src/components/settings/enterprise/MemoryPanel.tsx`

Integration:
- Add "Enterprise" tab to SettingsView.tsx
- Use existing Radix UI components (Tabs, Cards, Switches, Sliders)
- Progressive disclosure: collapsible sections per feature
- Wire to /enterprise/* API endpoints

### Agent 3: Chat Enhancement Features (React)
**Add missing chatbot features to the chat experience**

Files to modify:
- `ui/desktop/src/components/GooseMessage.tsx` → Add regenerate + enhanced copy
- `ui/desktop/src/components/ui/BaseChat.tsx` → Add export conversation toolbar
- `ui/desktop/src/components/ChatInput.tsx` → Enhance status indicators

New files:
- `ui/desktop/src/components/chat/RegenerateButton.tsx`
- `ui/desktop/src/components/chat/ExportConversation.tsx`
- `ui/desktop/src/components/chat/EnterpriseStatusBadge.tsx`

Features:
- Regenerate button on AI messages (hover to reveal)
- Export conversation as JSON/Markdown
- Enterprise status badge in bottom menu (guardrails active, etc.)
- Guardrail violation inline banner on blocked messages

### Agent 4: Conscious Voice Foundation (React + API)
**Create TTS infrastructure and personality system**

Server-side files:
- `crates/goose-server/src/routes/tts.rs` (NEW)
- Register in `crates/goose-server/src/routes/mod.rs`

Client-side files:
- `ui/desktop/src/hooks/useTts.ts` (NEW)
- `ui/desktop/src/components/voice/VoiceToggle.tsx` (NEW)
- `ui/desktop/src/components/voice/PersonalitySelector.tsx` (NEW)
- `ui/desktop/src/components/voice/OutputWaveform.tsx` (NEW)

Settings:
- `ui/desktop/src/components/settings/voice/VoiceSettingsSection.tsx` (NEW)
- Add "Voice" tab to SettingsView.tsx

Config:
- `config/personalities/` directory with personality JSON files
- Copy specs from D:\conscious personality definitions

### Agent 5: Wire Unused Backend Endpoints (React)
**Connect existing backend endpoints that have no UI**

Features to wire:
1. Session search → Add search bar to SessionsView.tsx
2. Session insights → Wire SessionsInsights to actual API endpoint
3. Config backup/recover → Add backup button in App settings
4. Recipe parse/YAML export → Add export buttons in RecipesView.tsx
5. Schedule pause/resume → Add pause/resume buttons in SchedulesView.tsx
6. System info → Add system info panel in diagnostics

Files to modify:
- `ui/desktop/src/components/sessions/SessionsView.tsx`
- `ui/desktop/src/components/sessions/SessionsInsights.tsx`
- `ui/desktop/src/components/settings/app/AppSettingsSection.tsx`
- `ui/desktop/src/components/recipes/RecipesView.tsx`
- `ui/desktop/src/components/schedule/SchedulesView.tsx`

### Agent 6: Welcome Screen & Onboarding (React)
**Create first-launch experience with Conscious integration**

Files to create:
- `ui/desktop/src/components/WelcomeScreen.tsx` (NEW)
- `ui/desktop/src/components/onboarding/PersonalityOnboarding.tsx` (NEW)
- `ui/desktop/src/components/onboarding/FeatureHighlights.tsx` (NEW)

Features:
- First-launch detection (check localStorage/config)
- Personality selection with preview
- Enterprise feature highlights (what's new in v1.24.2)
- Graceful fallback when voice not available
- "What's New" modal for returning users

### Agent 7: Bottom Menu & Status Enhancements (React)
**Enhance the bottom menu bar with enterprise indicators**

Files to modify:
- `ui/desktop/src/components/ui/ChatInput.tsx` (bottom menu area)
- `ui/desktop/src/components/CostTracker.tsx` → Enhance with reports
- `ui/desktop/src/components/BottomMenuAlertPopover.tsx` → Add enterprise alerts

New files:
- `ui/desktop/src/components/status/GuardrailsStatusBadge.tsx`
- `ui/desktop/src/components/status/GatewayStatusBadge.tsx`
- `ui/desktop/src/components/status/MemoryStatusBadge.tsx`
- `ui/desktop/src/components/status/VoiceStatusBadge.tsx`

Features:
- Guardrails status: shield icon (green/yellow/red)
- Gateway health: connection icon
- Memory status: brain icon with usage
- Voice status: mic icon with personality name
- Enhanced CostTracker with clickable details

### Agent 8: Context Management & Compaction UI (React)
**Wire context management features to UI**

Files to modify:
- `ui/desktop/src/components/ui/ChatInput.tsx` → Context compaction controls
- `ui/desktop/src/components/AlertBox.tsx` → Enhanced context alerts

New files:
- `ui/desktop/src/components/context/CompactionControls.tsx`
- `ui/desktop/src/components/context/ContextSummaryView.tsx`

Features:
- Context usage indicator (existing) + compaction button
- Manual compact trigger
- Compaction history/summaries viewer
- Token budget display per message
- Auto-compaction threshold settings

---

## Implementation Order

```
Phase 1 (Parallel - Agents 1-4):
  Agent 1: Enterprise API Routes    ← Foundation for UI
  Agent 2: Enterprise Settings UI   ← Needs Agent 1 endpoints
  Agent 3: Chat Enhancements        ← Independent
  Agent 4: Conscious Voice           ← Independent

Phase 2 (Parallel - Agents 5-8):
  Agent 5: Wire Unused Endpoints    ← Independent
  Agent 6: Welcome Screen           ← Depends on Agent 4 personality data
  Agent 7: Bottom Menu Status       ← Depends on Agent 1 endpoints
  Agent 8: Context Management UI    ← Independent
```

---

## Success Criteria

- [ ] All 9 enterprise features accessible via UI
- [ ] Regenerate, export, enhanced copy in chat
- [ ] Voice personality selector working
- [ ] TTS route foundation in place
- [ ] Welcome screen on first launch
- [ ] Enterprise status badges in bottom menu
- [ ] Context compaction controls available
- [ ] All unused endpoints wired to UI
- [ ] No new TypeScript errors
- [ ] Clean, progressive disclosure design

---

*Action plan generated from 6-agent deep audit*
*Last Updated: 2026-02-08*
