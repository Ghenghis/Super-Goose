# Continuation State: Comprehensive Testing + Ironclad Audit (2026-02-11)

> **Branch**: `feat/comprehensive-testing` at `97fd96afd1`
> **Baseline**: 197 Vitest test files, 27 Playwright specs, 208 Rust test files
> **Reference**: `docs/SUPER_GOOSE_IRONCLAD_AUDIT.md` (full audit spec)
> **Goal**: 100% test coverage + visual regression + E2E + anti-pattern clean

---

## CRITICAL: Agent Context Management Rules

**Every agent MUST follow these rules to prevent context window exhaustion:**

1. **Compact early**: After every 3 tool calls, assess whether earlier context can be summarized
2. **Write progress to file**: Each agent writes `docs/agent-{N}-progress.log` with completed items
3. **Clean up after yourself**: Delete your progress log when ALL your tasks are verified passing
4. **No duplicate work**: Read `docs/agent-{N}-progress.log` files to see what others completed
5. **Fail fast, log, move on**: If a test file won't compile after 2 attempts, log it and move on
6. **Max 30 test files per agent**: Don't try to write 50 tests — quality over quantity
7. **Verify as you go**: Run `npx tsc --noEmit` after every 5 files, `npx vitest run` after every 10

---

## Pre-Session Cleanup Completed

| Action | Size Freed | Status |
|--------|-----------|--------|
| 11 stale continuation docs deleted | N/A | DONE |
| 7 stale git worktrees removed | ~20.3 GB | DONE |
| 7 stale claude/* branches deleted | N/A | DONE |
| 5 stale local branches deleted | N/A | DONE |
| D:\goose removed | ~4.1 GB | DONE |
| D:\projects\goose removed | ~3.2 GB | DONE |
| D:\projects\riptide2 removed | ~4.1 GB | DONE |
| Downloads goose copies removed | ~354 MB | DONE |
| **Total disk freed** | **~32 GB** | **DONE** |

---

## 10-Agent Plan — UPDATED

### Agent 1: Chat Core Tests (Vitest)
**Scope**: Core chat components — the most critical user-facing code
**Files to test**:
- BaseChat, ChatInput, UserMessage, GooseMessage, ProgressiveMessageList
- ChatContext provider, ChatSessionsContainer, MentionPopover
**Rules**:
- No false positives: only assert behavior that actually exists in the component
- Mock only external dependencies (API calls, window objects), never mock the component itself
- Test real user interactions: type, click, keyboard nav
**Target**: ~8 test files, ~60 test cases
**Verify**: `npx vitest run src/components/__tests__/BaseChat.test.tsx` etc.

### Agent 2: Page View + Route Tests (Vitest)
**Scope**: All page-level views and route navigation
**Files to test**:
- SessionsView, RecipesView, SchedulesView, AppsView, ExtensionsView
- SettingsView, AppLayout, LauncherView, WelcomeRoute, ConfigureProviders
**Rules**:
- Test that routes render without crashing
- Test navigation between views
- Test empty states, loading states, error states
**Target**: ~10 test files, ~60 test cases

### Agent 3: Settings Panel Tests (Vitest)
**Scope**: All settings panels including enterprise
**Files to test**:
- Provider settings (ProviderSettingsPage, ProviderGrid, ProviderConfigurationModal)
- Extension settings (ExtensionsSection, ExtensionConfigFields, ExtensionItem)
- Chat settings (ChatSettingsSection, GoosehintsSection, SpellcheckToggle)
- App settings (AppSettingsSection, TelemetrySettings, UpdateSection)
- Enterprise panels (GatewayPanel, GuardrailsPanel, HooksPanel, MemoryPanel, ObservabilityPanel, PoliciesPanel)
- Conscious settings, Permission settings
**Rules**:
- Test toggle/switch state changes
- Test form validation where applicable
- Test localStorage persistence mocking
**Target**: ~18 test files, ~100 test cases

### Agent 4: Modal/Dialog + Recipe Tests (Vitest)
**Scope**: All modals, dialogs, and recipe components
**Files to test**:
- AnnouncementModal, SetupModal, TelemetryOptOutModal, ParameterInputModal
- CreateEditRecipeModal, RecipeInfoModal, ImportRecipeForm
- ScheduleModal, ScheduleFromRecipeModal
- PermissionModal, PermissionRulesModal, GoosehintsModal
- RecipeActivities, RecipeExpandableInfo, InstructionsEditor, JsonSchemaEditor
**Rules**:
- Test open/close transitions
- Test form submit with valid/invalid data
- Test cancel behavior
**Target**: ~15 test files, ~85 test cases

### Agent 5: Chat Coding Components (Vitest)
**Scope**: All rich content rendering components
**Files to test**:
- AgentCommunication, AudioPlayer, BatchProgress, BatchProgressPanel
- BreadcrumbPath, ChatCodingErrorBoundary, CodeActionBar, CodeMinimap
- CodeSearch, CompactionIndicator, ContentTypeIndicator, DiffCard
- EnhancedCodeBlock, FileChangeGroup, ImagePreviewCard, MermaidDiagram
- RechartsWrapper, SkillCard, SubagentTrace, SwarmOverview
- SwarmProgress, TaskCard, TaskGraph, ToolResultCodeBlock
**Rules**:
- Test rendering with mock data matching real data shapes
- Test error boundaries catch rendering failures
- Test accessibility (aria labels, keyboard focus)
**Target**: ~24 test files, ~130 test cases

### Agent 6: Infrastructure Tests (Vitest)
**Scope**: Hooks, utilities, contexts, tool call components, sidebar
**Files to test**:
- ToolApprovalButtons, ToolCallArguments, ToolCallConfirmation, ToolCallStatusIndicator, ToolCallWithResponse
- AppSidebar, EnvironmentBadge, ThemeSelector, BottomMenuAlertPopover, BottomMenuExtensionSelection
- Hooks: useAnalytics, useAudioRecorder, useChatStream, useRecipeManager, useTaskStream, useTts, useTextAnimator
- Utils: backendApi, navigationUtils, analytics, autoUpdater, eventAudit, extensionErrorUtils, keyboardShortcuts, localMessageStorage, logger, settings, toolCallChaining, workingDir, recipeHash
- Contexts: ChatContext, ThemeContext
**Rules**:
- Test hook state transitions with renderHook
- Test utility pure functions with edge cases (null, undefined, empty string, max int)
- Test context provider default values and updates
**Target**: ~28 test files, ~150 test cases

### Agent 7: Conscious System + TimeWarp + Novel Components (Vitest)
**Scope**: All new/unique components from session 9
**Files to test**:
- Conscious: CapabilitiesList, CreatorPanel, MemoryPanel, OutputWaveform, SkillManager, TestingDashboard, VoiceToggle, WakeWordIndicator
- TimeWarp: TimeWarpMinimap (and any other untested TimeWarp components)
- Features: FeatureStatusDashboard
- Remaining untested components discovered during scan
**Rules**:
- These are newer components — verify imports exist before writing tests
- If a component imports a context that doesn't exist yet, mock the context
- Don't test components that are purely placeholder/stub
**Target**: ~12 test files, ~60 test cases

### Agent 8: E2E Routes + Navigation (Playwright)
**Scope**: All 26+ routes navigable, sidebar nav, deep links
**Files to create**: `ui/desktop/tests/e2e/routes/`
**Tests**:
- Navigate to every route, verify no console errors
- Sidebar navigation between all main views
- Back/forward browser history
- Deep link routing (direct URL access)
- Theme switching (dark/light)
- Window resize responsiveness
- Tab/keyboard navigation accessibility
**Rules**:
- Use `page.waitForLoadState('networkidle')` before assertions
- Capture screenshots on failure for forensics
- Test with `@axe-core/playwright` for a11y violations
**Target**: ~4 spec files, ~50 test cases

### Agent 9: E2E Settings + Modals (Playwright)
**Scope**: All settings accessible, modals open/close, forms submit
**Files to create**: `ui/desktop/tests/e2e/settings/`
**Tests**:
- Every settings section accessible and renders
- Modal open/close/submit flows
- Extension install/configure/remove flows
- Provider add/switch/remove flows
- Permission configuration flows
- Enterprise panel navigation
**Rules**:
- Use `expect(page).toHaveScreenshot()` for visual regression on settings pages
- Test both success and error paths
**Target**: ~4 spec files, ~40 test cases

### Agent 10: E2E Workflows + Visual Regression (Playwright)
**Scope**: Full user workflows end-to-end + screenshot baselines
**Files to create**: `ui/desktop/tests/e2e/workflows/`
**Tests**:
- Recipe: browse, create, edit, delete, execute
- Session: list, resume, rename, delete, export
- Schedule: create, edit, pause, resume, delete
- Chat: send message, receive response, tool approval flow
- Visual regression: capture baseline screenshots of every major view
- Console error check: zero console.error during any workflow
**Rules**:
- Use `expect(page).toHaveScreenshot('view-name.png', { maxDiffPixelRatio: 0.01 })` for visual baselines
- Save all Playwright traces on failure
- Test graceful handling of network errors (mock offline)
**Target**: ~5 spec files, ~55 test cases

---

## Post-Agent Audit Phase

After all 10 agents complete, run this verification sequence:

### Gate 1: TypeScript Clean
```bash
cd ui/desktop && npx tsc --noEmit
# Must be 0 errors
```

### Gate 2: All Vitest Pass
```bash
cd ui/desktop && npx vitest run
# Must be 100% pass, 0 failures, 0 skipped
```

### Gate 3: All Playwright Pass
```bash
cd ui/desktop && npx playwright test
# Must be 100% pass
```

### Gate 4: Rust Tests Pass
```bash
cargo test --workspace
# Must be 100% pass
```

### Gate 5: Anti-Pattern Scan (from Ironclad Audit)
Scan for forbidden patterns in production code:
- 0 TODO/FIXME/STUB/PLACEHOLDER in `src/` (tests excluded)
- 0 empty catch blocks in production code
- 0 `console.log` left in production code (tests excluded)
- 0 unused imports (tsc strict catches this)

### Gate 6: Visual Regression Baselines
- All Playwright screenshots saved as baselines
- Zero console errors during any visual test
- Screenshots cover all 26+ routes

---

## Agent Cleanup Protocol

When an agent finishes ALL its work:

1. Run verification (tsc + vitest for its files)
2. Delete `docs/agent-{N}-progress.log`
3. Report final counts: files created, tests passing, tests failing

When ALL 10 agents are verified:
1. Run full verification suite (Gates 1-6)
2. Fix any remaining failures
3. Delete this continuation doc
4. Update MEMORY.md with final counts
5. Commit everything on `feat/comprehensive-testing`
6. Merge to `main`

---

## Expected Final State

- ~300+ test files total (197 existing + ~100 new)
- ~2500+ test cases total
- Frontend component coverage: ~90%+
- E2E route coverage: 100% (all 26+ routes)
- Visual regression baselines: all major views
- Accessibility: axe-core clean on all routes
- TypeScript: 0 errors
- All tests: 0 failures
- Anti-patterns: 0 in production code
