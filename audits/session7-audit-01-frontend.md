# Session 7 — Audit 01: Frontend Components & Hooks

**Auditor**: Audit Agent 1 — Frontend Components & Hooks Auditor
**Date**: 2026-02-14
**Branch**: `feat/resizable-layout`
**Scope**: All frontend TypeScript/React files in `G:\goose\ui\desktop\src`

---

## Audit Scope

| Area | Files Read | Description |
|------|-----------|-------------|
| `src/ag-ui/` | 4 source + 2 test | AG-UI protocol types, SSE hook, event verifier, barrel |
| `src/components/super/` | 18 panels | All panel components (Dashboard through Autonomous) |
| `src/components/super/shared/` | 6 | SGCard, SGBadge, SGStatusDot, SGMetricCard, SGEmptyState, SGApprovalGate |
| `src/components/super/__tests__/` | 16 | All test files |
| `src/hooks/` | 20 | All custom hooks |
| `src/config.ts` | 1 | API URL resolver |

**Total files audited**: 67

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH | 4 |
| MEDIUM | 12 |
| LOW | 5 |
| **Total** | **23** |

---

## Findings

### CRITICAL

#### F-001: useAgUi.ts — REASONING event handlers use wrong field name

- **File**: `G:\goose\ui\desktop\src\ag-ui\useAgUi.ts`
- **Lines**: 748, 766, 780
- **Severity**: CRITICAL
- **Category**: Bug — field name mismatch

**Description**: The REASONING_MESSAGE_CONTENT, REASONING_MESSAGE_END, and REASONING_END handlers access `evt.reasoningId` to look up reasoning messages in the map. However, the `AgUiReasoningMessageContentEvent`, `AgUiReasoningMessageEndEvent`, and `AgUiReasoningEndEvent` types in `types.ts` define the field as `messageId`, not `reasoningId`. This means `evt.reasoningId` always evaluates to `undefined`, causing reasoning content to never be appended to existing reasoning messages.

**Impact**: Reasoning messages accumulate as disconnected entries — content never gets appended to the correct reasoning message started by REASONING_START. Users see empty or fragmented reasoning output.

**Suggested fix**: Change `evt.reasoningId` to `evt.messageId` at all three locations:
```typescript
// Line 748: REASONING_MESSAGE_CONTENT handler
const rid = evt.messageId ?? 'default';
// Line 766: REASONING_MESSAGE_END handler
const rid = evt.messageId ?? 'default';
// Line 780: REASONING_END handler
const rid = evt.messageId;
```

---

#### F-004: verifyEvents.ts — REASONING_MESSAGE_START bypasses validation

- **File**: `G:\goose\ui\desktop\src\ag-ui\verifyEvents.ts`
- **Line**: 143
- **Severity**: CRITICAL
- **Category**: Bug — missing validation

**Description**: `REASONING_MESSAGE_START` is listed in the "always valid" bucket (line 143) alongside chunk events, snapshots, and custom events. This means it is never validated against whether a `REASONING_START` event has been received first. The `REASONING_MESSAGE_CONTENT` and `REASONING_MESSAGE_END` events ARE properly validated (lines 125-129), but `REASONING_MESSAGE_START` is not. This creates an inconsistency in the validation pipeline — a `REASONING_MESSAGE_START` can arrive without `REASONING_START`, which violates the AG-UI protocol invariant documented in the file header (line 9).

**Impact**: Invalid event sequences pass verification silently. A `REASONING_MESSAGE_START` without a preceding `REASONING_START` would not be caught, potentially leading to malformed reasoning state in the UI.

**Suggested fix**: Move `REASONING_MESSAGE_START` out of the always-valid bucket and add validation:
```typescript
case 'REASONING_MESSAGE_START':
  if (!reasoningActive) {
    return { type: 'missing_start', message: `REASONING_MESSAGE_START without REASONING_START`, event };
  }
  break;
```
Also add a corresponding test case in `verifyEvents.test.ts`.

---

### HIGH

#### F-002: useAgUi.ts — Module-level _seqId never resets across hot-reloads

- **File**: `G:\goose\ui\desktop\src\ag-ui\useAgUi.ts`
- **Line**: 274
- **Severity**: HIGH
- **Category**: Bug — stale module state

**Description**: The `_seqId` variable is declared at module scope (`let _seqId = 0`) and incremented on each SSE event. During development with Vite HMR, the module is re-evaluated but the old closure may persist or the counter resets to 0, causing duplicate or non-monotonic sequence IDs. In production, if the EventSource reconnects, `_seqId` continues from its previous value (which is correct for production), but the variable is shared across all hook instances if multiple components call `useAgUi()` — this is fine since the hook is designed as a singleton, but worth noting.

**Impact**: During development, HMR can cause sequence ID jumps or resets, potentially confusing debugging. Not a production issue unless multiple `useAgUi()` instances are created (which the current architecture avoids).

**Suggested fix**: Move `_seqId` into the hook's `useRef` or into the `stateRef` object so it's tied to the hook lifecycle:
```typescript
const seqIdRef = useRef(0);
// Then use seqIdRef.current++ instead of _seqId++
```

---

#### F-005: AuditDashboard.tsx — Hardcoded "Port 3284" string

- **File**: `G:\goose\ui\desktop\src\components\super\AuditDashboard.tsx`
- **Line**: 447
- **Severity**: HIGH
- **Category**: Bug — hardcoded value

**Description**: The AuditDashboard renders a literal "Port 3284" string in the system info section. All other API calls in the codebase use `getApiUrl()` for dynamic port resolution, but this display string is hardcoded. If the server runs on a different port (e.g., when Vite port 5233 is used or a user customizes the port), this display string will be incorrect.

**Impact**: Misleading UI — users see "Port 3284" even when the actual server port differs.

**Suggested fix**: Extract the port from `getApiUrl()`:
```typescript
const apiUrl = getApiUrl('');
const port = new URL(apiUrl).port || '3284';
// Then render: {port}
```

---

#### F-006: GPUPanel.tsx — fetchModels dependency loop with selectedModel

- **File**: `G:\goose\ui\desktop\src\components\super\GPUPanel.tsx`
- **Line**: 205
- **Severity**: HIGH
- **Category**: Bug — infinite re-fetch potential

**Description**: The `fetchModels` function is wrapped in `useCallback` with `selectedModel` in its dependency array. Inside `fetchModels`, the response is used to call `setSelectedModel()` (setting a default model if none is selected). This creates a cycle: `fetchModels` changes `selectedModel` -> `useCallback` recreates `fetchModels` -> `useEffect` that depends on `fetchModels` re-runs -> `fetchModels` is called again. If the API returns a non-empty model list and `selectedModel` keeps changing, this could loop.

**Impact**: Potential infinite fetch loop on mount, causing excessive API calls and re-renders. In practice, the loop may stabilize after one extra fetch (since `selectedModel` settles to a fixed value), but the pattern is fragile and will break if the API response changes.

**Suggested fix**: Remove `selectedModel` from the `useCallback` dependency array and use a ref or functional state update pattern:
```typescript
const fetchModels = useCallback(async () => {
  // ... fetch logic ...
  setSelectedModel(prev => prev ?? data.models[0]?.name ?? null);
}, []); // No selectedModel dependency
```

---

#### F-015: useAgentChat.ts — Module-level _seqId never resets

- **File**: `G:\goose\ui\desktop\src\hooks\useAgentChat.ts`
- **Line**: 50
- **Severity**: HIGH
- **Category**: Bug — stale module state (same pattern as F-002)

**Description**: Same issue as F-002. A module-level `let _seqId = 0` is used for SSE event sequencing. The variable persists across component mounts/unmounts and HMR cycles.

**Impact**: Same as F-002 — sequence ID drift during development, potential confusion if multiple instances exist.

**Suggested fix**: Move to `useRef` inside the hook, same approach as F-002.

---

### MEDIUM

#### F-003: useAgUi.ts — ACTIVITY event not in AgUiEventType enum

- **File**: `G:\goose\ui\desktop\src\ag-ui\useAgUi.ts`
- **Line**: 693
- **Severity**: MEDIUM
- **Category**: Inconsistency — missing enum value

**Description**: The `ACTIVITY` event type is handled in the SSE message handler (line 693 dispatches it to the activity handler), and `verifyEvents.ts` also accepts it (line 153). However, `ACTIVITY` is not listed in the `AgUiEventType` enum in `types.ts`. The enum includes `ACTIVITY_SNAPSHOT` and `ACTIVITY_DELTA` but not bare `ACTIVITY`. This means TypeScript cannot narrow the event type correctly when `ACTIVITY` arrives.

**Impact**: TypeScript type narrowing does not work for `ACTIVITY` events. The handler works at runtime via string comparison, but there is no compile-time type safety.

**Suggested fix**: Add `ACTIVITY = 'ACTIVITY'` to the `AgUiEventType` enum in `types.ts`, and define a corresponding `AgUiActivityEvent` interface.

---

#### F-007: AgentsPanel.tsx — setTimeout not cleaned on unmount

- **File**: `G:\goose\ui\desktop\src\components\super\AgentsPanel.tsx`
- **Line**: 59
- **Severity**: MEDIUM
- **Category**: Resource leak — missing cleanup

**Description**: When a configuration is saved successfully, a `setTimeout` is used to clear the success message after 3 seconds: `setTimeout(() => setConfigMessage(null), 3000)`. If the component unmounts before the timeout fires, `setConfigMessage` will be called on an unmounted component. React 18 no longer warns about this, but it is still a memory leak and incorrect behavior.

**Impact**: Minor memory leak. State update on unmounted component.

**Suggested fix**: Store the timeout ID in a ref and clear it in the cleanup function of a `useEffect`, or use a `mountedRef` guard:
```typescript
const timerRef = useRef<ReturnType<typeof setTimeout>>();
// In handler:
timerRef.current = setTimeout(() => setConfigMessage(null), 3000);
// In useEffect cleanup:
useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
```

---

#### F-008: RecipeBrowser.tsx — setTimeout not cleaned on unmount

- **File**: `G:\goose\ui\desktop\src\components\super\RecipeBrowser.tsx`
- **Line**: 144
- **Severity**: MEDIUM
- **Category**: Resource leak — missing cleanup

**Description**: A `setTimeout` is used for a toast/notification dismiss after recipe import. Same pattern as F-007 — no cleanup on unmount.

**Impact**: Minor memory leak. State update on unmounted component.

**Suggested fix**: Same pattern as F-007 — store timeout ID in ref, clear on unmount.

---

#### F-009: PromptLibrary.tsx — setTimeout not cleaned on unmount

- **File**: `G:\goose\ui\desktop\src\components\super\PromptLibrary.tsx`
- **Line**: 116
- **Severity**: MEDIUM
- **Category**: Resource leak — missing cleanup

**Description**: `setTimeout` used for clearing `copiedId` state (copy-to-clipboard feedback). No cleanup on unmount.

**Impact**: Minor memory leak. State update on unmounted component.

**Suggested fix**: Same pattern as F-007.

---

#### F-010: DeeplinkGenerator.tsx — setTimeout not cleaned on unmount

- **File**: `G:\goose\ui\desktop\src\components\super\DeeplinkGenerator.tsx`
- **Line**: 231
- **Severity**: MEDIUM
- **Category**: Resource leak — missing cleanup

**Description**: `setTimeout` used for clearing copied state feedback. No cleanup on unmount.

**Impact**: Minor memory leak. State update on unmounted component.

**Suggested fix**: Same pattern as F-007.

---

#### F-011: SkillsPanel.tsx — Side effect inside setState updater

- **File**: `G:\goose\ui\desktop\src\components\super\SkillsPanel.tsx`
- **Lines**: 48-61
- **Severity**: MEDIUM
- **Category**: Anti-pattern — side effect in updater

**Description**: The `handleToggle` function calls `setSkills(prev => ...)` with a state updater function. Inside that updater, it conditionally calls `window.electronAPI?.setSkillEnabled(...)` — an IPC side effect. React state updaters should be pure functions. In React 18 Strict Mode (development), state updaters may be invoked twice, causing the IPC call to fire twice.

**Impact**: Potential double IPC call in development Strict Mode. Incorrect separation of concerns — side effects should be outside the updater.

**Suggested fix**: Compute the new state first, then perform the side effect:
```typescript
const handleToggle = (name: string) => {
  const skill = skills.find(s => s.name === name);
  if (!skill) return;
  const newEnabled = !skill.enabled;
  setSkills(prev => prev.map(s => s.name === name ? { ...s, enabled: newEnabled } : s));
  window.electronAPI?.setSkillEnabled(name, newEnabled);
};
```

---

#### F-012: AutonomousDashboard.tsx — setInterval not properly cleaned on unmount

- **File**: `G:\goose\ui\desktop\src\components\super\AutonomousDashboard.tsx`
- **Lines**: 192-205
- **Severity**: MEDIUM
- **Category**: Resource leak — missing cleanup

**Description**: A `setInterval` is started for a restart countdown timer. The interval ID is stored in a local variable inside an event handler, but there is no guarantee the cleanup runs if the component unmounts while the countdown is active. The interval should be stored in a ref and cleared in a `useEffect` cleanup.

**Impact**: Interval continues to fire after unmount, causing state updates on an unmounted component and potential memory leak.

**Suggested fix**: Store interval ID in a `useRef`, clear in `useEffect` cleanup:
```typescript
const intervalRef = useRef<ReturnType<typeof setInterval>>();
// On start: intervalRef.current = setInterval(...);
// On cleanup: useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);
```

---

#### F-014: useCostTracking.ts — console.log left in production code

- **File**: `G:\goose\ui\desktop\src\hooks\useCostTracking.ts`
- **Line**: 65
- **Severity**: MEDIUM
- **Category**: Code quality — debug artifact

**Description**: A `console.log()` statement is present in the cost tracking hook's fetch handler. This will output to the browser console in production builds.

**Impact**: Noise in production console output. Minor performance impact from serialization.

**Suggested fix**: Remove the `console.log()` or replace with a conditional debug logger.

---

#### F-020: useAgentStream.ts — setTimeout not cleaned on unmount

- **File**: `G:\goose\ui\desktop\src\hooks\useAgentStream.ts`
- **Line**: 36
- **Severity**: MEDIUM
- **Category**: Resource leak — missing cleanup

**Description**: A `setTimeout` is used for auto-clearing `reconnectedAfterGap` state. The timeout ID is not stored for cleanup on unmount.

**Impact**: Minor memory leak. State update on unmounted component.

**Suggested fix**: Same ref-based cleanup pattern as F-007.

---

#### F-021: useChatStream.ts — Unbounded module-level resultsCache Map

- **File**: `G:\goose\ui\desktop\src\hooks\useChatStream.ts`
- **Line**: 30
- **Severity**: MEDIUM
- **Category**: Memory leak — unbounded cache

**Description**: A module-level `Map` called `resultsCache` stores tool call results keyed by tool call ID. This map grows without any eviction strategy — entries are added but never removed. Over a long session with many tool calls, this map will consume increasing amounts of memory.

**Impact**: Gradual memory growth over long sessions. Could become significant for users who run many tool calls without refreshing the page.

**Suggested fix**: Implement an LRU eviction strategy or clear the cache when a new run starts:
```typescript
const MAX_CACHE_SIZE = 500;
function addToCache(key: string, value: unknown) {
  if (resultsCache.size >= MAX_CACHE_SIZE) {
    const oldest = resultsCache.keys().next().value;
    resultsCache.delete(oldest);
  }
  resultsCache.set(key, value);
}
```

---

#### F-022: use-text-animator.tsx — ResizeObserver never disconnected

- **File**: `G:\goose\ui\desktop\src\hooks\use-text-animator.tsx`
- **Lines**: 33-47
- **Severity**: MEDIUM
- **Category**: Memory leak — missing observer cleanup

**Description**: The `TextSplitter` class creates a `ResizeObserver` in its `initResizeObserver()` method (called from the constructor). This observer monitors the target element for size changes and re-splits text when the element resizes. However, there is no `disconnect()` method exposed or called when the component unmounts. The `ResizeObserver` will continue observing the (now-detached) element until garbage collection.

**Impact**: Memory leak — ResizeObserver callbacks fire on detached DOM nodes, preventing garbage collection of the element and its associated data.

**Suggested fix**: Add a `destroy()` method to `TextSplitter` that calls `observer.disconnect()`, and call it from the hook's cleanup function:
```typescript
class TextSplitter {
  private resizeObserver?: ResizeObserver;
  // In initResizeObserver:
  this.resizeObserver = new ResizeObserver(...);
  // New method:
  destroy() { this.resizeObserver?.disconnect(); }
}
// In useEffect cleanup:
return () => { splitterRef.current?.destroy(); };
```

---

### LOW

#### F-013: AutonomousDashboard.tsx — Unused previousVersion state

- **File**: `G:\goose\ui\desktop\src\components\super\AutonomousDashboard.tsx`
- **Line**: 58
- **Severity**: LOW
- **Category**: Dead code

**Description**: The `previousVersion` state variable is declared via `useState` and has a setter, but the value is never read or rendered anywhere in the component. The setter is called in one place, but since the value is never consumed, the state and its setter are dead code.

**Impact**: Unnecessary state allocation and re-render on set. Minor code clutter.

**Suggested fix**: Remove the `previousVersion` state declaration and all references to its setter.

---

#### F-016: AgentChatPanel.tsx — Unmemoized streamingMessages computation

- **File**: `G:\goose\ui\desktop\src\components\super\AgentChatPanel.tsx`
- **Line**: 161
- **Severity**: LOW
- **Category**: Performance — unnecessary recomputation

**Description**: The `streamingMessages` variable is computed on every render by filtering and mapping the messages array. If the message list is large, this could cause noticeable render overhead. This computation could be wrapped in `useMemo` with `[messages]` as the dependency.

**Impact**: Minor performance overhead on each render. Negligible for small message lists, noticeable for large conversations.

**Suggested fix**:
```typescript
const streamingMessages = useMemo(
  () => messages.filter(...).map(...),
  [messages]
);
```

---

#### F-017: AgentRegistryPanel.tsx — Uses window.prompt() for input

- **File**: `G:\goose\ui\desktop\src\components\super\AgentRegistryPanel.tsx`
- **Line**: 273
- **Severity**: LOW
- **Category**: UX — browser-native dialog in Electron

**Description**: The component uses `window.prompt()` to collect user input for registering a new agent URL. In an Electron app, `window.prompt()` is often blocked or renders as an unstyled native dialog that looks out of place. A proper React modal/dialog component would be more appropriate.

**Impact**: Poor UX in Electron — the prompt may not appear or may look jarring. Functional in browser context.

**Suggested fix**: Replace with a controlled React dialog component (e.g., a small modal with an input field and OK/Cancel buttons).

---

#### F-018: SGStatusDot — Missing aria-hidden on decorative dot

- **File**: `G:\goose\ui\desktop\src\components\super\shared\SGStatusDot.tsx`
- **Severity**: LOW
- **Category**: Accessibility

**Description**: The dot element (`<span>` with colored background) is purely decorative and conveys status visually. It does not have `aria-hidden="true"`, which means screen readers may attempt to announce it as an empty element.

**Impact**: Minor accessibility issue — screen reader noise.

**Suggested fix**: Add `aria-hidden="true"` to the decorative dot span.

---

#### F-019: SGEmptyState — Missing role attribute

- **File**: `G:\goose\ui\desktop\src\components\super\shared\SGEmptyState.tsx`
- **Severity**: LOW
- **Category**: Accessibility

**Description**: The `SGEmptyState` component renders a container with a message and optional action, but lacks a semantic `role` attribute (e.g., `role="status"` or `role="alert"`) to convey its purpose to assistive technologies.

**Impact**: Minor accessibility gap — screen readers do not know the semantic purpose of the empty state region.

**Suggested fix**: Add `role="status"` to the container element.

---

#### F-023: SuperGoosePanel.tsx — No error boundary around child panels

- **File**: `G:\goose\ui\desktop\src\components\super\SuperGoosePanel.tsx`
- **Severity**: LOW
- **Category**: Robustness — missing error boundary

**Description**: The `SuperGoosePanel` component renders child panels via a switch statement based on active panel state. If any child panel throws during render (e.g., due to a malformed API response or unexpected data shape), the entire Super-Goose panel tree crashes with an unhandled React error. There is no `ErrorBoundary` wrapping the panel content area.

**Impact**: A single panel crash takes down all panels. Users must reload the application.

**Suggested fix**: Wrap the panel content area in a React `ErrorBoundary` component that catches errors and renders a fallback UI:
```tsx
<ErrorBoundary fallback={<div className="sg-card">Something went wrong. Try another panel.</div>}>
  {renderActivePanel()}
</ErrorBoundary>
```

---

## Test Coverage Assessment

All 16 test files were reviewed. Key observations:

| Test File | Lines | Coverage Quality |
|-----------|-------|-----------------|
| `shared.test.tsx` | 453 | Excellent — all shared components covered with ARIA checks |
| `DashboardPanel.test.tsx` | 243 | Good — metrics, navigation, ARIA, loading/error states |
| `SuperGoosePanel.test.tsx` | 139 | Good — all 8 nav items, panel switching |
| `AgentsPanel.test.tsx` | 543 | Good — core switching, config, extension integration |
| `GPUPanel.test.tsx` | 424 | Good — cluster, local GPU, inference, model loading |
| `MonitorPanel.test.tsx` | 571 | Good — cost, budget, model breakdown, reasoning, ARIA |
| `MarketplacePanel.test.tsx` | 664 | Excellent — all 5 tabs, core switching, extensions |
| `AutonomousDashboard.test.tsx` | 599 | Good — OTA, daemon, build progress, fake timers |
| `ConnectionsPanel.test.tsx` | 193 | Good — fetch, tab switching, extension integration |
| `SGSettingsPanel.test.tsx` | 335 | Good — toggles, API integration, optimistic updates |
| `AgentChatPanel.test.tsx` | 365 | Good — messages, filtering, sending, tool calls |
| `StudiosPanel.test.tsx` | 373 | Good — grid, extensions, back button, keyboard a11y |
| `AgentRegistryPanel.test.tsx` | 295 | Good — loading, error, expand/collapse, polling |
| `ag-ui-features.test.tsx` | 355 | Good — all 5 AG-UI feature panels |
| `BuilderTab.test.tsx` | 127 | Adequate — core configuration UI |
| `hooks.test.ts` | 322 | Good — useAgentStream, useSuperGooseData, useCostTracking |
| `verifyEvents.test.ts` | 213 | Good — valid/invalid sequences, reset |
| `useAgUi.test.tsx` | varies | Good — SSE connection, event dispatch, tool registration |

**Test infrastructure notes**:
- All test files properly mock `useAgUi` (jsdom lacks EventSource)
- All test files use proper cleanup (`afterEach(() => vi.restoreAllMocks())`)
- Mocks are comprehensive and match the real hook API shape
- No stale mocks detected — all mock return values match current interfaces
- `backendApi` mock in SuperGoosePanel.test.tsx correctly covers all methods used by child panels

**Missing test coverage**:
- `REASONING_MESSAGE_START` validation bypass (F-004) has no test
- `ACTIVITY` event type handling has no dedicated test
- Module-level `_seqId` behavior across multiple hook instances is untested
- `use-text-animator.tsx` has no dedicated test for ResizeObserver cleanup
- `useChatStream.ts` resultsCache growth is untested

---

## Files Audited (Complete List)

### AG-UI Protocol (6 files)
- `src/ag-ui/types.ts` (600 lines) — Clean
- `src/ag-ui/useAgUi.ts` (993 lines) — F-001, F-002, F-003
- `src/ag-ui/verifyEvents.ts` (169 lines) — F-004
- `src/ag-ui/index.ts` (88 lines) — Clean
- `src/ag-ui/__tests__/useAgUi.test.tsx` — Clean
- `src/ag-ui/__tests__/verifyEvents.test.ts` — Clean (missing F-004 test)

### Panel Components (18 files)
- `src/components/super/SuperGoosePanel.tsx` (95 lines) — F-023
- `src/components/super/DashboardPanel.tsx` (201 lines) — Clean
- `src/components/super/SGSettingsPanel.tsx` (172 lines) — Clean
- `src/components/super/AuditDashboard.tsx` (1051 lines) — F-005
- `src/components/super/AgentsPanel.tsx` (309 lines) — F-007
- `src/components/super/GPUPanel.tsx` (653 lines) — F-006
- `src/components/super/MarketplacePanel.tsx` (342 lines) — Clean
- `src/components/super/StudiosPanel.tsx` (240 lines) — Clean
- `src/components/super/MonitorPanel.tsx` (302 lines) — Clean
- `src/components/super/ConnectionsPanel.tsx` (113 lines) — Clean
- `src/components/super/RecipeBrowser.tsx` (277 lines) — F-008
- `src/components/super/PromptLibrary.tsx` (237 lines) — F-009
- `src/components/super/SkillsPanel.tsx` (170 lines) — F-011
- `src/components/super/DeeplinkGenerator.tsx` (397 lines) — F-010
- `src/components/super/AgenticFeatures.tsx` (455 lines) — Clean
- `src/components/super/AgentChatPanel.tsx` (301 lines) — F-016
- `src/components/super/AgentRegistryPanel.tsx` (356 lines) — F-017
- `src/components/super/AutonomousDashboard.tsx` (546 lines) — F-012, F-013

### Shared Components (6 files)
- `src/components/super/shared/SGCard.tsx` — Clean
- `src/components/super/shared/SGBadge.tsx` — Clean
- `src/components/super/shared/SGStatusDot.tsx` — F-018
- `src/components/super/shared/SGMetricCard.tsx` — Clean
- `src/components/super/shared/SGEmptyState.tsx` — F-019
- `src/components/super/shared/SGApprovalGate.tsx` — Clean

### Test Files (16 files)
- All 16 test files reviewed — no stale mocks, no incorrect assertions detected

### Hooks (20 files)
- `src/hooks/useAgentStream.ts` (59 lines) — F-020
- `src/hooks/useSuperGooseData.ts` (105 lines) — Clean
- `src/hooks/useCostTracking.ts` (92 lines) — F-014
- `src/hooks/useTimeWarpEvents.ts` (141 lines) — Clean
- `src/hooks/useConductorStatus.ts` (103 lines) — Clean
- `src/hooks/useRecipeManager.ts` (324 lines) — Clean
- `src/hooks/useAgentChat.ts` (283 lines) — F-015
- `src/hooks/useTaskStream.ts` (302 lines) — Clean
- `src/hooks/use-mobile.ts` (19 lines) — Clean
- `src/hooks/useEscapeKey.ts` (23 lines) — Clean
- `src/hooks/useFileDrop.ts` (138 lines) — Clean
- `src/hooks/useNavigation.ts` (15 lines) — Clean
- `src/hooks/useSidebarSessionStatus.ts` (86 lines) — Clean
- `src/hooks/useContextManagement.ts` (185 lines) — Clean
- `src/hooks/useAutoSubmit.ts` (107 lines) — Clean
- `src/hooks/useAnalytics.ts` (29 lines) — Clean
- `src/hooks/useTts.ts` (321 lines) — Clean
- `src/hooks/useAudioRecorder.ts` (249 lines) — Clean
- `src/hooks/useChatStream.ts` (838 lines) — F-021
- `src/hooks/use-text-animator.tsx` (245 lines) — F-022

### Config (1 file)
- `src/config.ts` (5 lines) — Clean

---

## Recommendations by Priority

### Immediate (block merge)
1. **Fix F-001** — `reasoningId` -> `messageId` in useAgUi.ts (3 lines)
2. **Fix F-004** — Validate REASONING_MESSAGE_START against REASONING_START in verifyEvents.ts

### Soon (next sprint)
3. **Fix F-005** — Replace hardcoded port in AuditDashboard.tsx
4. **Fix F-006** — Remove selectedModel from fetchModels deps in GPUPanel.tsx
5. **Fix F-011** — Move IPC side effect out of setState updater in SkillsPanel.tsx
6. **Fix F-021** — Add LRU eviction to resultsCache in useChatStream.ts
7. **Fix F-022** — Disconnect ResizeObserver in use-text-animator.tsx

### Backlog
8. **Fix F-007/F-008/F-009/F-010/F-012/F-020** — Standardize setTimeout/setInterval cleanup across all components (create a `useTimeout` utility hook)
9. **Fix F-002/F-015** — Move module-level `_seqId` to useRef
10. **Fix F-003** — Add ACTIVITY to AgUiEventType enum
11. **Fix F-013** — Remove dead previousVersion state
12. **Fix F-014** — Remove console.log from useCostTracking
13. **Fix F-016/F-017/F-018/F-019/F-023** — Low-priority UX and accessibility improvements

---

*End of audit report.*
