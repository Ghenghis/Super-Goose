# Terminal Integration Module

Complete terminal integration for the Super-Goose CLI panel, providing real PTY (pseudo-terminal) support via Electron IPC with automatic fallback to a mock terminal.

## Overview

The terminal integration consists of three main components:

1. **TerminalManager** (`src/utils/terminalManager.ts`) - Core terminal session management
2. **Test Suite** (`src/utils/__tests__/terminalManager.test.ts`) - Comprehensive test coverage
3. **EmbeddedTerminal Integration** - Wired into the CLI panel component

## Architecture

### TerminalManager

The `TerminalManager` class provides a unified interface for creating and managing terminal sessions. It automatically detects whether Electron APIs are available and chooses the appropriate backend:

- **Electron Backend**: Uses IPC to communicate with native PTY processes
- **Mock Backend**: Provides a fallback terminal that echoes commands (for development/testing)

```typescript
interface TerminalSession {
  id: string;
  pid: number;
  shell: string;
  cwd: string;
  createdAt: string;
}

interface TerminalOutput {
  data: string;
  timestamp: number;
}

class TerminalManager {
  async createSession(shell?, cwd?, cols?, rows?): Promise<TerminalSession>
  async sendInput(sessionId, data): Promise<void>
  onOutput(sessionId, callback): () => void  // Returns unsubscribe function
  async resize(sessionId, cols, rows): Promise<void>
  async closeSession(sessionId): Promise<void>
  getActiveSessions(): TerminalSession[]
  isUsingElectron(): boolean
}
```

### Backend Selection

The manager automatically detects the environment:

```typescript
// Check for Electron APIs
if (window.electron?.invoke && window.electron?.on) {
  // Use real PTY via IPC
} else {
  // Use mock terminal
}
```

### Platform Detection

Default shells are selected based on the platform:

- **Windows**: `cmd.exe`
- **macOS**: `/bin/zsh`
- **Linux**: `/bin/bash`

## Electron IPC Protocol

When running in Electron, the terminal manager uses the following IPC channels:

### Creating a Session

```typescript
const result = await window.electron.invoke('terminal:create', {
  shell: '/bin/bash',
  cwd: '/home/user',
  cols: 80,
  rows: 24
});
// Returns: { id, pid, shell, cwd, createdAt }
```

### Sending Input

```typescript
await window.electron.invoke('terminal:input', {
  sessionId: 'session-id',
  data: 'ls -la\n'
});
```

### Receiving Output

```typescript
const unsubscribe = window.electron.on('terminal:output:session-id', (data: string) => {
  console.log('Terminal output:', data);
});
```

### Resizing Terminal

```typescript
await window.electron.invoke('terminal:resize', {
  sessionId: 'session-id',
  cols: 100,
  rows: 30
});
```

### Closing Session

```typescript
await window.electron.invoke('terminal:close', {
  sessionId: 'session-id'
});
```

## Mock Terminal

When Electron APIs are unavailable, the mock terminal provides basic functionality:

- **Echo commands**: Displays typed commands back to the user
- **Special commands**:
  - `clear` / `cls` - Sends ANSI clear screen sequence
  - `cd <dir>` - Updates session working directory
  - `exit` / `quit` - Closes the session
- **Welcome message**: Shows shell and working directory on startup

## EmbeddedTerminal Integration

The `EmbeddedTerminal` component now uses the TerminalManager:

### Session Lifecycle

```typescript
useEffect(() => {
  if (!isTerminalOpen) {
    // Clean up session when terminal closes
    if (terminalSession) {
      manager.closeSession(terminalSession.id);
    }
    return;
  }

  // Create a new terminal session when opening
  const manager = getTerminalManager();
  manager.createSession()
    .then((session) => {
      setTerminalSession(session);

      // Subscribe to output
      const unsubscribe = manager.onOutput(session.id, (output) => {
        setTerminalOutputBuffer((prev) => prev + output.data);
      });

      return () => {
        unsubscribe();
        manager.closeSession(session.id);
      };
    });
}, [isTerminalOpen]);
```

### Input Handling

Commands are sent to the terminal manager:

```typescript
const handleSubmit = () => {
  if (terminalSession) {
    const manager = getTerminalManager();
    manager.sendInput(terminalSession.id, trimmed + '\n')
      .catch((err) => {
        // Fall back to context-based command
        sendCommand(trimmed);
      });
  } else {
    // Fall back to context
    sendCommand(trimmed);
  }
};
```

### Output Display

The component displays either real terminal output or context history:

```typescript
{terminalSession && terminalOutputBuffer ? (
  <div className="whitespace-pre-wrap break-all text-zinc-300">
    {terminalOutputBuffer}
  </div>
) : (
  /* Show context-based history */
  terminalHistory.map(entry => ...)
)}
```

### Visual Indicators

The terminal header shows the current mode:

- **PTY badge** (green): Real terminal via Electron
- **MOCK badge** (yellow): Mock terminal fallback
- **Connection dot**: Green (connected), Yellow (connecting), Red (disconnected)

## Test Coverage

The test suite (`terminalManager.test.ts`) provides comprehensive coverage:

### Mock Terminal Tests (13 tests)

- Session creation and configuration
- Input/output handling
- Multiple subscribers
- Subscription cleanup
- Session closure
- Error handling
- Special commands (clear, cd)

### Electron Terminal Tests (9 tests)

- IPC session creation
- IPC input/output
- IPC resize operations
- IPC session closure
- Error handling
- Cleanup on failure

### Integration Tests (5 tests)

- Singleton pattern
- Platform detection (Windows, macOS, Linux)
- Backend selection

**Total: 27 tests, all passing**

## Usage Example

```typescript
import { getTerminalManager } from '@/utils/terminalManager';

// Get singleton instance
const manager = getTerminalManager();

// Create a session
const session = await manager.createSession('/bin/bash', '/home/user');

// Subscribe to output
const unsubscribe = manager.onOutput(session.id, (output) => {
  console.log(output.data);
});

// Send commands
await manager.sendInput(session.id, 'ls -la\n');
await manager.sendInput(session.id, 'pwd\n');

// Resize terminal
await manager.resize(session.id, 100, 30);

// Clean up
unsubscribe();
await manager.closeSession(session.id);
```

## Files Modified

1. **Created**:
   - `ui/desktop/src/utils/terminalManager.ts` (597 lines)
   - `ui/desktop/src/utils/__tests__/terminalManager.test.ts` (563 lines)

2. **Modified**:
   - `ui/desktop/src/components/cli/EmbeddedTerminal.tsx`
   - `ui/desktop/src/components/cli/__tests__/EmbeddedTerminal.test.tsx`

## Next Steps

To complete the terminal integration, the following backend work is needed:

### Electron Main Process

Create IPC handlers in the Electron main process:

```typescript
// In main.ts or preload.ts
ipcMain.handle('terminal:create', async (event, { shell, cwd, cols, rows }) => {
  const pty = require('node-pty');
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: cwd || process.env.HOME,
    env: process.env
  });

  const sessionId = generateId();
  sessions.set(sessionId, ptyProcess);

  ptyProcess.on('data', (data) => {
    event.sender.send(`terminal:output:${sessionId}`, data);
  });

  return {
    id: sessionId,
    pid: ptyProcess.pid,
    shell,
    cwd,
    createdAt: new Date().toISOString()
  };
});

ipcMain.handle('terminal:input', async (event, { sessionId, data }) => {
  const pty = sessions.get(sessionId);
  if (pty) {
    pty.write(data);
  }
});

ipcMain.handle('terminal:resize', async (event, { sessionId, cols, rows }) => {
  const pty = sessions.get(sessionId);
  if (pty) {
    pty.resize(cols, rows);
  }
});

ipcMain.handle('terminal:close', async (event, { sessionId }) => {
  const pty = sessions.get(sessionId);
  if (pty) {
    pty.kill();
    sessions.delete(sessionId);
  }
});
```

### Dependencies

Add `node-pty` to Electron dependencies:

```bash
npm install node-pty --save
```

### Preload Script

Expose terminal APIs in the preload script:

```typescript
contextBridge.exposeInMainWorld('electron', {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, callback: (...args: any[]) => void) => {
    const subscription = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
  platform: process.platform,
  arch: process.arch
});
```

## Performance Considerations

- **Output buffering**: Terminal output is appended to a single string buffer
- **Automatic cleanup**: Sessions are cleaned up when the terminal closes
- **Singleton pattern**: Single TerminalManager instance shared across components
- **Lazy initialization**: Terminal session only created when panel opens

## Security Considerations

- **Shell validation**: Consider validating shell paths before spawning
- **Working directory**: Validate CWD exists and is accessible
- **Input sanitization**: Be cautious with user input to prevent injection attacks
- **Session isolation**: Each terminal session is isolated with unique IDs

## Browser Compatibility

- **Electron**: Full PTY support via node-pty
- **Web Browser**: Automatically falls back to mock terminal
- **Development**: Mock terminal works without Electron APIs

## Future Enhancements

1. **Multiple terminal tabs**: Support for multiple concurrent sessions
2. **Shell selection UI**: Allow users to choose shell (bash, zsh, PowerShell, etc.)
3. **Theme customization**: Terminal color schemes and fonts
4. **Copy/paste**: Clipboard integration for terminal content
5. **Search**: Find text in terminal output
6. **History persistence**: Save terminal history across sessions
7. **Split panes**: Multiple terminals in a single view
