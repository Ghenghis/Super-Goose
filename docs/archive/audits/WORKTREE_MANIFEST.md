# Worktree File Manifest: What Lives Where

**Date**: 2026-02-08
**Purpose**: Exact file inventory across both worktrees for merge planning
**Canonical base**: nifty-lumiere (merge jolly-robinson INTO this)

---

## Files ONLY on nifty-lumiere (25 files)

### Rust Backend
```
crates/goose-server/src/routes/enterprise.rs          18,744 bytes  ← Enterprise API routes
crates/goose-server/src/routes/mod.rs                  MODIFIED     ← Route registration
```

### Enterprise Settings UI
```
ui/desktop/src/components/settings/enterprise/
├── EnterpriseSettingsSection.tsx                       4,455 bytes
├── GuardrailsPanel.tsx                                7,764 bytes
├── GatewayPanel.tsx                                   5,437 bytes
├── ObservabilityPanel.tsx                             6,842 bytes
├── PoliciesPanel.tsx                                  5,647 bytes
├── HooksPanel.tsx                                     5,881 bytes
└── MemoryPanel.tsx                                    7,112 bytes
```

### Chat Enhancements
```
ui/desktop/src/components/chat/
├── RegenerateButton.tsx                               1,209 bytes
├── ExportConversation.tsx                             5,443 bytes
└── GuardrailBanner.tsx                                2,703 bytes
```

### Voice Components
```
ui/desktop/src/components/voice/
├── VoiceToggle.tsx                                    1,494 bytes
├── OutputWaveform.tsx                                 3,795 bytes
└── PersonalitySelector.tsx                            3,136 bytes

ui/desktop/src/hooks/useTts.ts                        10,560 bytes
```

### Status Badges
```
ui/desktop/src/components/status/
├── EnterpriseStatusBadges.tsx                         2,202 bytes
├── GuardrailsStatusBadge.tsx                          2,511 bytes
├── GatewayStatusBadge.tsx                             2,560 bytes
├── MemoryStatusBadge.tsx                              1,734 bytes
└── VoiceStatusBadge.tsx                               2,287 bytes
```

### Context Management
```
ui/desktop/src/components/context/
├── CompactionControls.tsx                             2,196 bytes
└── ContextSummaryView.tsx                            14,364 bytes

ui/desktop/src/components/context_management/
└── SystemNotificationInline.tsx                         667 bytes
```

### Welcome Screen
```
ui/desktop/src/components/WelcomeScreen.tsx            6,113 bytes
```

### Settings
```
ui/desktop/src/components/settings/chat/
├── ChatSettingsSection.tsx                             1,851 bytes
├── GoosehintsModal.tsx                                5,512 bytes
├── GoosehintsSection.tsx                              1,150 bytes
└── SpellcheckToggle.tsx                               1,056 bytes
```

---

## Files ONLY on jolly-robinson (26 files)

### Chat Coding Components (21 files)
```
ui/desktop/src/components/chat_coding/
├── index.ts                                           1,169 bytes  ← Barrel file
├── EnhancedCodeBlock.tsx                             20,725 bytes  ← Code folding
├── DiffCard.tsx                                      13,316 bytes  ← Diff display
├── TaskCard.tsx                                      20,627 bytes  ← Agent task cards
├── FileChangeGroup.tsx                               12,149 bytes  ← Batched changes
├── CodeActionBar.tsx                                  6,967 bytes  ← Toolbar
├── ToolResultCodeBlock.tsx                            7,361 bytes  ← Tool output renderer
├── CodeSearch.tsx                                     8,010 bytes  ← Search in code
├── CodeMinimap.tsx                                    6,499 bytes  ← VS Code minimap
├── BreadcrumbPath.tsx                                 7,041 bytes  ← File path display
├── ThinkingBlock.tsx                                  9,170 bytes  ← Extended thinking
├── ImagePreviewCard.tsx                              14,331 bytes  ← Multi-modal images
├── AudioPlayer.tsx                                   13,355 bytes  ← Audio playback
├── SwarmOverview.tsx                                 12,311 bytes  ← Swarm dashboard
├── SwarmProgress.tsx                                 10,936 bytes  ← Swarm progress
├── SubagentTrace.tsx                                 10,932 bytes  ← Agent trace
├── AgentCommunication.tsx                             9,113 bytes  ← Inter-agent comms
├── TaskGraph.tsx                                     15,355 bytes  ← Task DAG viz
├── BatchProgress.tsx                                 10,816 bytes  ← Batch operations
├── SkillCard.tsx                                     11,629 bytes  ← Skills display
└── CompactionIndicator.tsx                            4,912 bytes  ← Compaction status
```

### Hooks
```
ui/desktop/src/hooks/useTaskStream.ts                  8,194 bytes  ← SSE streaming
```

### Playwright Tests (4 unique to jolly-robinson)
```
ui/desktop/tests/e2e/
├── settings.spec.ts                                  19,568 bytes
├── chat-features.spec.ts                             16,110 bytes
├── coding-workflow.spec.ts                           21,331 bytes
└── tic-tac-toe.spec.ts                              12,899 bytes
```

---

## Files on BOTH worktrees (shared base, possibly diverged)

### Playwright Tests (4 shared)
```
ui/desktop/tests/e2e/
├── app.spec.ts                                       24,618 bytes
├── context-management.spec.ts                        12,183 bytes
├── enhanced-context-management.spec.ts               25,064 bytes
└── performance.spec.ts                               13,546 bytes
```

### Config & Version Files (modified on nifty-lumiere)
```
Cargo.toml                                            version: 1.24.2
ui/desktop/package.json                               version: 1.24.2
ui/desktop/openapi.json                               version: 1.24.2
```

### CI Workflows (fixed on nifty-lumiere)
```
.github/workflows/pr-comment-build-cli.yml            SHA fix applied
.github/workflows/pr-comment-bundle.yml               Missing trigger added
```

### Settings (on both, may need merge)
```
ui/desktop/src/components/settings/chat/
├── ChatSettingsSection.tsx
├── GoosehintsModal.tsx
├── GoosehintsSection.tsx
└── SpellcheckToggle.tsx

ui/desktop/src/components/context_management/
└── SystemNotificationInline.tsx
```

---

## Files MISSING (must be created)

| File | Where | Purpose | Priority |
|---|---|---|---|
| `voice/personalities.ts` | nifty-lumiere | Personality config data for PersonalitySelector | High |
| `FeatureHighlights.tsx` | nifty-lumiere | Feature showcase cards for WelcomeScreen | Medium |
| `useTaskStream.ts` | nifty-lumiere | Copy from jolly-robinson or merge | High |

---

## Merge Guide

### Step 1: Copy NEW directories from jolly-robinson → nifty-lumiere
These are entirely new directories that don't exist on nifty-lumiere. No conflicts possible.

```powershell
# From jolly-robinson, copy to nifty-lumiere:
# chat_coding/ (21 files) — completely new directory
# 4 unique Playwright tests — new files in existing directory
# useTaskStream.ts — new file
```

### Step 2: Check for conflicts in SHARED files
These files exist on both branches and may have diverged:
- `MarkdownContent.tsx` — jolly-robinson added EnhancedCodeBlock integration
- `GooseMessage.tsx` — jolly-robinson may have added TaskCardGroup
- `ToolCallWithResponse.tsx` — jolly-robinson wired ToolResultCodeBlock
- `BaseChat.tsx` — jolly-robinson added useTaskStream
- Shared Playwright test files (4)
- `settings/chat/` files (4)

### Step 3: Verify after merge
```powershell
cd ui/desktop
npx tsc --noEmit --skipLibCheck    # TypeScript check
npm run test:run                    # Vitest unit tests
npx playwright test                 # E2E tests
```

---

## Totals

| Category | nifty-lumiere only | jolly-robinson only | Shared | Missing |
|---|---|---|---|---|
| **React components** | 25 files | 21 files | ~4 modified | 2 files |
| **Hooks** | 1 file (useTts) | 1 file (useTaskStream) | 0 | 0 |
| **Rust backend** | 2 files | 0 | 0 | 0 |
| **Playwright tests** | 0 unique | 4 unique | 4 shared | 0 |
| **Config/CI** | 5 modified | 0 | 0 | 0 |
| **Total new files** | **~28** | **~26** | **~8** | **3** |
