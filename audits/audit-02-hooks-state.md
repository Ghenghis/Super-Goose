# Audit 02: Hooks & State Management
**Agent**: Agent 2 — Hooks & State Management Auditor
**Date**: 2026-02-14
**Branch**: feat/resizable-layout

## Scope
- `ui/desktop/src/hooks/` — all custom hooks
- `ui/desktop/src/ag-ui/` — AG-UI protocol
- `ui/desktop/src/components/ConfigContext.tsx` — app config context
- `ui/desktop/src/utils/settingsBridge.ts` — settings state bridge
- `ui/desktop/src/utils/backendApi.ts` — API client functions
- `ui/desktop/src/config.ts` — getApiUrl, app config

---

## Findings

### F-001: config.ts — Clean, minimal
- **File**: `ui/desktop/src/config.ts`
- **Type**: Structural
- **Severity**: INFO
- **Detail**: 5-line utility. Uses `window.appConfig.get('GOOSE_API_HOST')` correctly. Handles leading slash normalization. No issues found.

### F-002: ConfigContext.tsx — refreshExtensions stale closure
- **File**: `ui/desktop/src/components/ConfigContext.tsx`
- **Type**: Structural / Bug
- **Severity**: MEDIUM
- **Detail**: `refreshExtensions` (line 110-126) has `extensionsList` in its dependency array, which means it captures a stale reference to `extensionsList` in its closure (line 119: `return extensionsList`). On error, it returns the stale list from the last render when `refreshExtensions` was created. This creates an unstable callback identity — every time `extensionsList` changes, `refreshExtensions` is recreated, which cascades to recreate `addExtension`, `removeExtension`, `getExtensions`, `toggleExtension`, and the entire `contextValue`. This defeats memoization.
- **Fix**: Use a ref for extensionsList (like `providersListRef`) so `refreshExtensions` can be stable.

### F-003: ConfigContext.tsx — disableAllExtensions/enableBotExtensions inside useMemo
- **File**: `ui/desktop/src/components/ConfigContext.tsx`
- **Type**: Quality
- **Severity**: LOW
- **Detail**: `disableAllExtensions` and `enableBotExtensions` are defined inside `useMemo` (lines 238-253). While this works, it means these functions are recreated whenever contextValue deps change. They should be `useCallback` at the top level like the other functions for consistency and to avoid unnecessary recreation.

### F-004: ConfigContext.tsx — useEffect missing error handling for readAllConfig
- **File**: `ui/desktop/src/components/ConfigContext.tsx`
- **Type**: Structural
- **Severity**: LOW
- **Detail**: In the mount useEffect (line 188-235), `readAllConfig()` (line 192) has no try/catch, while `providers()` and `apiGetExtensions()` do. If config loading fails, the error is unhandled and will be swallowed by the async IIFE, potentially leaving config in an empty `{}` state silently.

### F-005: AG-UI types.ts — Solid, comprehensive, no issues
- **File**: `ui/desktop/src/ag-ui/types.ts`
- **Type**: Quality
- **Severity**: INFO
- **Detail**: 600 lines of well-typed AG-UI protocol definitions. 28 event types across 7 categories. Proper discriminated union, type guards for all categories. Clean barrel export via index.ts. Comment says "28 event types" but enum actually has 28. No issues.

### F-006: AG-UI verifyEvents.ts — Reasoning event type mismatch
- **File**: `ui/desktop/src/ag-ui/verifyEvents.ts`
- **Type**: Structural / Bug
- **Severity**: MEDIUM
- **Detail**: The verifier checks for `'REASONING_CONTENT'` (line 125) and `'REASONING_END'` (line 126), but types.ts defines `REASONING_MESSAGE_CONTENT` and `REASONING_MESSAGE_END`. The verifier also does NOT check for `REASONING_MESSAGE_START`, `REASONING_MESSAGE_CHUNK`, `REASONING_ENCRYPTED_VALUE`. Additionally, line 145 handles an `'ACTIVITY'` event type which does NOT exist in the AgUiEventType enum in types.ts. The verifier is incomplete for the full 28-event protocol.

### F-007: AG-UI useAgUi.ts — Duplicate type definitions vs types.ts
- **File**: `ui/desktop/src/ag-ui/useAgUi.ts`
- **Type**: Quality
- **Severity**: MEDIUM
- **Detail**: useAgUi.ts defines its own `AgUiEventType` (line 21-56), `AgUiEvent` (line 62-65), `AgUiSubscriber` (line 140), `FrontendToolDefinition` (line 121-127), and `JsonPatchOp` (line 146-150) — ALL of which duplicate types in types.ts. The hook's AgUiEventType is a plain string union (24 types) while types.ts has an enum (28 types). The hook is missing: `REASONING_MESSAGE_START`, `REASONING_MESSAGE_CONTENT`, `REASONING_MESSAGE_END`, and `REASONING_ENCRYPTED_VALUE` from its local type. These should be imported from types.ts to avoid drift.

### F-008: AG-UI useAgUi.ts — REASONING event type mismatch with types.ts
- **File**: `ui/desktop/src/ag-ui/useAgUi.ts`
- **Type**: Structural / Bug
- **Severity**: MEDIUM
- **Detail**: The dispatch function (line 459+) handles `'REASONING_CONTENT'` (line 783) and `'REASONING_END'` (line 796), but types.ts names these `REASONING_MESSAGE_CONTENT` and `REASONING_MESSAGE_END`. The backend could emit either naming convention — if it uses the types.ts convention, these events will fall through to the default case and be silently ignored. The hook does handle `'REASONING_MESSAGE_CHUNK'` (line 809), showing inconsistency within the same hook.

### F-009: AG-UI useAgUi.ts — TEXT_MESSAGE_CONTENT reads wrong field
- **File**: `ui/desktop/src/ag-ui/useAgUi.ts`
- **Type**: Structural / Bug
- **Severity**: HIGH
- **Detail**: Line 516: `const chunk = (evt.content as string) ?? ''` — but the AG-UI protocol spec (types.ts TextMessageContentEvent, line 214) names this field `delta`, not `content`. If the backend emits `{ type: 'TEXT_MESSAGE_CONTENT', messageId: '...', delta: '...' }`, the hook reads `evt.content` which will be `undefined`, so the message content will never get appended. The TEXT_MESSAGE_CHUNK handler (line 542) correctly reads `evt.delta`, showing this is a bug on the start/content/end path.

### F-010: AG-UI useAgUi.ts — TOOL_CALL_ARGS reads wrong field
- **File**: `ui/desktop/src/ag-ui/useAgUi.ts`
- **Type**: Structural / Bug
- **Severity**: HIGH
- **Detail**: Line 654: `const argChunk = (evt.args as string) ?? ''` — but types.ts ToolCallArgsEvent (line 255) names this field `delta`. Same pattern as F-009: the hook reads `evt.args` but protocol says `delta`. Tool call arguments will never be accumulated if the backend uses protocol-compliant field names.

### F-011: AG-UI useAgUi.ts — Unstable return object identity
- **File**: `ui/desktop/src/ag-ui/useAgUi.ts`
- **Type**: Quality / Optimization
- **Severity**: LOW
- **Detail**: The hook returns a new object literal on every render (line 956-999). With 14 state values + 8 callbacks, consumers that destructure will be fine, but any consumer that passes the entire return value as a prop or dependency will re-render on every state change. Consider wrapping in `useMemo`.

### F-012: AG-UI useAgUi.ts — dispatch closure captures apiBase but not other refs
- **File**: `ui/desktop/src/ag-ui/useAgUi.ts`
- **Type**: Structural
- **Severity**: LOW
- **Detail**: The `dispatch` callback (line 459) is in the dependency array of `connect` (line 909). If `apiBase` changes (unlikely but possible), `dispatch` gets recreated, which recreates `connect`, which triggers the mount useEffect to disconnect and reconnect. This is correct behavior but worth documenting — changing `options.apiBase` triggers a full reconnect.

### F-013: AG-UI useAgUi.ts — EventSource cleanup is thorough
- **File**: `ui/desktop/src/ag-ui/useAgUi.ts`
- **Type**: Structural
- **Severity**: INFO (positive)
- **Detail**: The hook properly cleans up EventSource on unmount (line 935-948), closes on error before reconnect (line 895-896), cancels pending reconnect timers on unmount (line 945-948), and uses `mountedRef` to prevent state updates after unmount. The reconnect exponential backoff (1s to 30s) is well-implemented.

