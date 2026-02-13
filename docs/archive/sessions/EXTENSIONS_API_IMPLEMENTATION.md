# Extensions API Implementation

**Date**: 2026-02-13
**Feature**: Extensions API Route + Tool Toggle Persistence

## Overview

Implemented a complete backend API route for managing extensions and wired it to the frontend ToolsBridgePanel for persistent tool toggles.

## Backend Implementation

### File Created: `crates/goose-server/src/routes/extensions.rs`

**Endpoints**:

1. `GET /api/extensions` — Returns all extensions with enabled status
   - Response: `{ extensions: ExtensionInfo[] }`
   - ExtensionInfo: `{ key, name, type, enabled, description }`

2. `GET /api/extensions/{key}` — Get single extension details
   - Response: `{ extension: ExtensionInfo }`

3. `PUT /api/extensions/{key}/toggle` — Toggle extension enabled state
   - Body: `{ enabled: bool }`
   - Response: `{ key, enabled, updated }`

**Implementation Details**:
- Uses existing `goose::config::extensions` functions:
  - `get_all_extensions()` — Load all extensions from config
  - `set_extension_enabled(key, enabled)` — Persist toggle to config.yaml
- Converts `ExtensionEntry` to `ExtensionInfo` for API response
- Includes 5 unit tests for serialization/deserialization
- Follows existing route patterns from `settings.rs` and `features.rs`

**Registration**:
- Added to `crates/goose-server/src/routes/mod.rs`:
  ```rust
  pub mod extensions;
  // ...
  .merge(extensions::routes(state.clone()))
  ```

## Frontend Implementation

### Modified: `ui/desktop/src/utils/backendApi.ts`

**Updated ExtensionInfo Type**:
```typescript
export interface ExtensionInfo {
  key: string;              // Changed from 'id'
  name: string;
  enabled: boolean;
  type: 'builtin' | 'stdio' | 'streamable_http' | 'platform' | 'frontend' | 'inline_python' | 'sse';
  description: string;      // Added
}
```

**Updated API Functions**:
```typescript
getExtensions: async (): Promise<ExtensionInfo[] | null>
  // Returns data.extensions (unwraps response wrapper)

toggleExtension: async (key: string, enabled: boolean): Promise<boolean>
  // Calls PUT /api/extensions/{key}/toggle
```

### Modified: `ui/desktop/src/components/tools/ToolsBridgePanel.tsx`

**Added Features**:

1. **Backend Integration on Mount**:
   - `useEffect()` fetches extensions from API
   - Converts `ExtensionInfo` → `ToolEntry` format
   - Falls back to `bundled-extensions.json` if backend unavailable

2. **Persistent Toggle Handler**:
   - Optimistic local state update
   - Calls `backendApi.toggleExtension()`
   - Rollback on failure
   - Only persists if `isBackendAvailable === true`

3. **Loading States**:
   - `isLoading` — Shows "Loading..." in header
   - `isBackendAvailable` — Shows "Using fallback data" when offline
   - Graceful degradation to static bundled data

## API Flow

```
User clicks toggle in UI
  ↓
ToolsBridgePanel.handleToggle(id)
  ↓ (optimistic update)
Local state updated immediately
  ↓
backendApi.toggleExtension(key, enabled)
  ↓
PUT /api/extensions/{key}/toggle
  ↓
set_extension_enabled(key, enabled)
  ↓
Config.global().set_param("extensions", ...)
  ↓
Persisted to config.yaml
```

## Testing

### Backend Tests
- 5 unit tests in `routes::extensions::tests`
- Test route creation, serialization, deserialization
- Mock-free tests (verify function signatures and types)

### TypeScript Compilation
- Verified with `npx tsc --noEmit`
- Zero new errors introduced
- Only unused import warning (fixed)

## Configuration Persistence

Extensions are stored in `config.yaml` under the `extensions` key:

```yaml
extensions:
  developer:
    enabled: true
    type: builtin
    name: developer
    description: "Core developer tools"
  memory:
    enabled: false
    type: builtin
    name: memory
    description: "Cross-session memory"
```

## Fallback Behavior

When backend is unavailable:
- Frontend loads from `bundled-extensions.json`
- Toggles work locally but don't persist
- Header shows "Using fallback data"
- No errors thrown, graceful degradation

## Future Enhancements

- [ ] Add `/api/extensions/{key}` (GET single) usage in UI
- [ ] Add extension config editing (timeout, args, etc.)
- [ ] Real-time sync via WebSocket for multi-window updates
- [ ] Batch toggle API for bulk enable/disable
- [ ] Extension health checks and status indicators

## Files Modified

**Backend (Rust)**:
1. `crates/goose-server/src/routes/extensions.rs` (NEW — 285 lines)
2. `crates/goose-server/src/routes/mod.rs` (2 lines)

**Frontend (TypeScript)**:
1. `ui/desktop/src/utils/backendApi.ts` (ExtensionInfo type + API functions)
2. `ui/desktop/src/components/tools/ToolsBridgePanel.tsx` (integration + persistence)

**Total**: 4 files, ~350 lines of new/modified code, 5 tests
