# Continuation: CLI IPC Wiring (2026-02-11)

## Summary

Wired CLI integration to use Electron IPC for real binary execution and
GitHub Releases API for downloads. The renderer-side service now tries
IPC first and falls back to mock implementations when the bridge is not
available (e.g. dev browser, tests).

---

## Files Created

### `ui/desktop/src/cli-ipc.ts` (NEW)

Electron **main-process** module that registers 8 IPC handlers:

| Channel | Purpose |
|---------|---------|
| `cli:get-binary-path` | Scan known locations for the `goose`/`goose.exe` binary |
| `cli:check-version` | Spawn `goose --version` and return output |
| `cli:execute-command` | One-shot command execution with timeout (30 s) |
| `cli:start-session` | Spawn interactive `goose session` process; stream stdout/stderr via `cli:output` |
| `cli:send-input` | Write to active session stdin |
| `cli:kill-session` | Kill active session child process |
| `cli:get-latest-release` | HTTPS GET to `api.github.com/repos/Ghenghis/Super-Goose/releases/latest` |
| `cli:get-platform-info` | Return `process.platform`, `process.arch`, home directory |

Also exports `cleanupCLI()` for app-quit cleanup.

### `ui/desktop/src/cli-preload.ts` (NEW)

Preload bridge that wraps `ipcRenderer.invoke()` / `ipcRenderer.on()`
calls into a typed `cliAPI` object. Exports `CLIPreloadAPI` interface
and the concrete `cliAPI` constant.

## Files Modified

### `ui/desktop/src/components/cli/CLIDownloadService.ts` (MODIFIED)

- Added `ElectronCLIBridge` interface (local type matching `CLIPreloadAPI`)
- Added `getElectronCLI()` accessor for `window.electron.cli`
- Added `detectPlatformAsync()` — new async variant that queries IPC
- Updated `getLatestVersion()` — IPC first, `fetch()` fallback
- Updated `verifyCLI()` — IPC `getBinaryPath` + `checkVersion` first, localStorage fallback
- Refactored platform-info building into `buildPlatformInfo()`, `nodePlatformToOS()`, `nodeArchToArch()`
- All existing mock functionality preserved as fallbacks

---

## Architecture

### Data Flow

```
Renderer (React)
    |
    |-- CLIDownloadService.ts calls window.electron.cli.*
    |
    v
Preload (cli-preload.ts)
    |
    |-- ipcRenderer.invoke('cli:*', ...)
    |
    v
Main Process (cli-ipc.ts)
    |
    |-- child_process.spawn() for binary ops
    |-- https.get() for GitHub API
    |-- mainWindow.webContents.send('cli:output', ...) for streaming
```

### IPC Channel Summary

| Direction | Channel | Payload |
|-----------|---------|---------|
| Renderer -> Main | `cli:get-binary-path` | (none) |
| Renderer -> Main | `cli:check-version` | `binaryPath: string` |
| Renderer -> Main | `cli:execute-command` | `binaryPath: string, args: string[]` |
| Renderer -> Main | `cli:start-session` | `binaryPath: string` |
| Renderer -> Main | `cli:send-input` | `input: string` |
| Renderer -> Main | `cli:kill-session` | (none) |
| Renderer -> Main | `cli:get-latest-release` | (none) |
| Renderer -> Main | `cli:get-platform-info` | (none) |
| Main -> Renderer | `cli:output` | `{ type: 'output'|'error'|'system', content: string }` |

---

## Remaining Work (for next session)

### 1. Wire into main.ts

Add to `ui/desktop/src/main.ts`:

```typescript
import { registerCLIHandlers, cleanupCLI } from './cli-ipc';
```

Inside `createChat()` after the BrowserWindow is created:

```typescript
registerCLIHandlers(mainWindow);
```

Inside `app.on('will-quit', ...)`:

```typescript
cleanupCLI();
```

### 2. Wire into preload.ts

Add to `ui/desktop/src/preload.ts`:

```typescript
import { cliAPI } from './cli-preload';
```

Add `cli` to the `electronAPI` object:

```typescript
const electronAPI: ElectronAPI = {
  // ... existing fields ...
  cli: cliAPI,
};
```

Update the `ElectronAPI` type to include:

```typescript
cli: typeof import('./cli-preload').cliAPI;
```

Update the `Window` interface:

```typescript
interface Window {
  electron: ElectronAPI;  // cli is now nested inside
  appConfig: AppConfigAPI;
}
```

### 3. Wire CLIContext.tsx sendCommand to use IPC

Update `CLIContext.tsx`'s `sendCommand` callback to:

1. Check if `window.electron.cli` exists
2. If yes, call `window.electron.cli.executeCommand()` for one-shot commands
3. For interactive sessions, use `startSession()` / `sendInput()` / `onOutput()`
4. Fall back to mock `[mock] Executed:` behaviour

### 4. Wire EmbeddedTerminal.tsx streaming output

Subscribe to `window.electron.cli.onOutput()` in a `useEffect` to receive
real-time stdout/stderr from the interactive session and append entries to
`terminalHistory`.

### 5. Implement real download via IPC

Add a `cli:download-binary` handler to `cli-ipc.ts` that:

1. Uses Node `https`/`http` to download the release asset
2. Streams progress back to renderer via `cli:download-progress` events
3. Extracts the archive (tar/zip) to the install directory
4. Sets executable permissions on Unix platforms

### 6. Add TypeScript type augmentation

Create `ui/desktop/src/cli-types.d.ts` (or update existing global types)
to declare `window.electron.cli` on the `Window` interface globally, so
all components get autocomplete without `any` casts.

---

## Testing Notes

- All changes are backward-compatible: if `window.electron.cli` is undefined
  (no preload wiring yet), the mock fallback runs identically to before.
- The IPC handlers are isolated in `cli-ipc.ts` and can be tested with
  Electron's `ipcMain`/`ipcRenderer` test utilities or integration tests.
- The `cleanupCLI()` export ensures no orphaned child processes on quit.
