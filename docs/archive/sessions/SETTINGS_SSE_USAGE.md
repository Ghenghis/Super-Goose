# Settings SSE Stream - Usage Guide

## Overview

The Settings SSE (Server-Sent Events) stream provides real-time synchronization of settings changes across all connected clients. When any client updates a setting through the REST API, all other connected clients receive a live update event.

## Backend Implementation

### Endpoint: `GET /api/settings/stream`

Returns a `text/event-stream` that emits:

1. **Initial Snapshot**: All current settings sent immediately on connection
2. **Live Updates**: `settings_update` events when any setting changes
3. **Heartbeats**: Keep-alive events every 30 seconds

### Event Format

#### Settings Update Event
```
event: settings_update
data: {"event":"settings_update","key":"super_goose_guardrails_enabled","value":true,"source":"api"}

```

#### Heartbeat Event
```
event: heartbeat
data: {"event":"heartbeat","timestamp":1234567890}

```

## Frontend Usage

### Basic Hook Usage

```tsx
import { useSettingsStream } from '@/utils/settingsBridge';

function MySettingsPanel() {
  const { isConnected, error } = useSettingsStream({
    onSettingUpdate: (key, value, source) => {
      console.log(`Setting "${key}" updated to:`, value, `(source: ${source})`);
    },
  });

  return (
    <div>
      <div>Connection: {isConnected ? '✓ Live' : '✗ Disconnected'}</div>
      {error && <div>Error: {error.message}</div>}
    </div>
  );
}
```

### Advanced Usage with State Management

```tsx
import { useSettingsStream, useFeatureSettings } from '@/utils/settingsBridge';
import { useEffect } from 'react';

function SyncedSettingsPanel() {
  const { settings, updateSetting } = useFeatureSettings();

  const { isConnected } = useSettingsStream({
    onSettingUpdate: (key, value, source) => {
      // Only update local state if the change came from another client
      if (source !== 'frontend') {
        updateSetting(key as keyof typeof settings, value);
      }
    },
  });

  const handleToggleGuardrails = async () => {
    // Update setting with 'frontend' source to avoid circular updates
    await updateSetting('guardrailsEnabled', !settings.guardrailsEnabled);
  };

  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={settings.guardrailsEnabled}
          onChange={handleToggleGuardrails}
        />
        Guardrails Enabled
      </label>
      <div>Live Sync: {isConnected ? 'ON' : 'OFF'}</div>
    </div>
  );
}
```

### Custom Configuration

```tsx
const { isConnected, error } = useSettingsStream({
  baseUrl: 'http://localhost:3284', // Custom backend URL
  autoReconnect: true,               // Auto-reconnect on disconnect (default: true)
  maxReconnectDelay: 30000,          // Max backoff delay in ms (default: 30000)
  onSettingUpdate: (key, value, source) => {
    // Handle updates
  },
});
```

## Auto-Reconnection

The hook automatically reconnects with exponential backoff:

1. **Initial delay**: 1 second
2. **Backoff multiplier**: 2x on each failure
3. **Maximum delay**: Configurable via `maxReconnectDelay` (default: 30s)
4. **Reset**: Backoff resets to 1s on successful connection

Example backoff sequence:
- 1st reconnect: 1s delay
- 2nd reconnect: 2s delay
- 3rd reconnect: 4s delay
- 4th reconnect: 8s delay
- 5th reconnect: 16s delay
- 6th+ reconnect: 30s delay (capped at maxReconnectDelay)

## Error Handling

```tsx
const { isConnected, error } = useSettingsStream({
  onSettingUpdate: (key, value, source) => {
    // ...
  },
});

useEffect(() => {
  if (error) {
    console.error('SSE connection error:', error);
    // Optional: Show user notification
  }
}, [error]);
```

## Cleanup

The hook automatically:
- Closes the EventSource connection on unmount
- Cancels any pending reconnection timers
- Prevents state updates after unmount

No manual cleanup is required.

## Testing

The hook is fully tested with a mocked EventSource:

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { useSettingsStream } from '../settingsBridge';

it('should connect and receive settings updates', async () => {
  const onSettingUpdate = vi.fn();
  const { result } = renderHook(() => useSettingsStream({ onSettingUpdate }));

  await waitFor(() => {
    expect(result.current.isConnected).toBe(true);
  });

  // Simulate server event
  mockEventSource._simulateEvent('settings_update', JSON.stringify({
    event: 'settings_update',
    key: 'budgetLimit',
    value: 100,
    source: 'api',
  }));

  await waitFor(() => {
    expect(onSettingUpdate).toHaveBeenCalledWith('budgetLimit', 100, 'api');
  });
});
```

## Backend Tests

Run backend tests:
```bash
cargo test --lib -p goose-server -- routes::settings::tests
```

Run frontend tests:
```bash
cd ui/desktop && npm test -- settingsBridge.test.ts
```

## Event Sources

The `source` field in settings update events indicates where the change originated:

- `"initial"`: Sent on initial connection (snapshot of all settings)
- `"api"`: Updated via REST API (`POST /api/settings/{key}`)
- `"frontend"`: Updated via frontend UI
- `"cli"`: Updated via CLI command
- Custom sources can be added as needed

## Performance Considerations

- **Heartbeats**: Sent every 30 seconds to keep the connection alive
- **Connection pooling**: Each browser tab opens its own SSE connection
- **Memory**: Minimal overhead, uses native EventSource API
- **Reconnection**: Exponential backoff prevents thundering herd on server restart

## Security

- SSE connections are subject to CORS policies
- Authentication/authorization can be added via cookies or query parameters
- All events are transmitted over the same origin policy
