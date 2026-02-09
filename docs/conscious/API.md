# Conscious API Reference

**Base URL:** `http://localhost:8999`  
**Protocol:** HTTP REST (JSON)  
**Auth:** None (localhost-only by default)  
**Max Request Size:** 1 MB

---

## Health

### GET /api/health
Returns subsystem health status.

**Response:**
```json
{
  "status": "ok",
  "subsystems": {
    "moshi": "running",
    "agentic": "enabled",
    "emotion": "enabled",
    "ui_bridge": "connected",
    "wake_vad": "idle"
  }
}
```

---

## Voice (8 endpoints)

### GET /api/voice/status
Returns voice connection and Moshi server status.

### POST /api/voice/connect
Connects to the Moshi WebSocket server.

### POST /api/voice/disconnect
Disconnects from Moshi.

### POST /api/voice/reconnect
Disconnects then reconnects to Moshi.

### POST /api/voice/audio
Sends raw audio data to Moshi for processing.

**Body:** Binary audio data (PCM 24kHz mono)

### POST /api/voice/start
Starts the voice pipeline (mic → Moshi → speaker).

### POST /api/voice/stop
Stops the voice pipeline.

### GET /api/voice/stream
SSE stream of audio events and transcripts.

---

## Agentic (3 endpoints)

### GET /api/agentic/status
Returns agentic layer status.

**Response:**
```json
{
  "enabled": true,
  "goose_reachable": true,
  "queue_busy": false,
  "queue_size": 0
}
```

### POST /api/agentic/toggle
Enables or disables the agentic layer.

**Body:**
```json
{ "enabled": true }
```

### POST /api/agentic/execute
Executes a text command through the agentic pipeline.

**Body:**
```json
{ "text": "list my files" }
```

**Response:**
```json
{
  "success": true,
  "text": "Here are your files...",
  "data": { "source": "goose_bridge" }
}
```

---

## Emotion (2 endpoints)

### GET /api/emotion/status
Returns emotion engine status and current mood.

**Response:**
```json
{
  "enabled": true,
  "model_loaded": true,
  "mood": {
    "dominant_emotion": "neutral",
    "trend": "stable",
    "avg_valence": 0.65
  }
}
```

### POST /api/emotion/toggle
Enables or disables emotion detection.

**Body:**
```json
{ "enabled": true }
```

---

## Personality (3 endpoints)

### GET /api/personality/status
Returns active personality profile.

**Response:**
```json
{
  "active_profile": "Spark",
  "mature_mode": false
}
```

### POST /api/personality/switch
Switches the active personality profile.

**Body:**
```json
{ "profile": "Nova" }
```

### GET /api/personality/list
Returns all available personality profiles.

**Response:**
```json
{
  "profiles": ["Spark", "Nova", "Echo", "Sage", "..."]
}
```

---

## Memory (1 endpoint)

### GET /api/memory/status
Returns conversation memory statistics.

**Response:**
```json
{
  "turn_count": 42,
  "total_tokens_estimate": 8500
}
```

---

## Creator (3 endpoints)

### POST /api/creator/create
Creates an AI artifact (code, text, image prompt, etc.).

**Body:**
```json
{
  "prompt": "Write a Python function to sort a list",
  "type": "code"
}
```

### GET /api/creator/history
Returns recent creation history.

### POST /api/creator/promote
Promotes a staged artifact to production.

**Body:**
```json
{ "artifact_id": "abc123" }
```

---

## Testing (3 endpoints)

### POST /api/testing/validate
Runs validation tests on a feature.

**Body:**
```json
{ "feature": "voice_pipeline" }
```

### POST /api/testing/heal
Runs self-healing loop on a failing test.

**Body:**
```json
{ "test_name": "test_voice_connect" }
```

### GET /api/testing/history
Returns test run history.

---

## Devices (7 endpoints)

### GET /api/devices/status
Returns registered devices and their states.

### POST /api/devices/scan
Scans the network for discoverable devices.

### POST /api/devices/probe
Probes a specific device for capabilities.

**Body:**
```json
{ "ip": "192.168.1.100" }
```

### POST /api/devices/add
Adds a device to the registry.

**Body:**
```json
{ "ip": "192.168.1.100", "name": "Living Room Speaker", "type": "speaker" }
```

### POST /api/devices/remove
Removes a device from the registry.

**Body:**
```json
{ "device_id": "dev_abc123" }
```

### POST /api/devices/creator-mode
Toggles Creator Mode for a device (enables SSH access).

**Body:**
```json
{ "device_id": "dev_abc123", "enabled": true }
```

### POST /api/devices/ssh
Executes an SSH command on a Creator Mode device.

**Body:**
```json
{ "device_id": "dev_abc123", "command": "ls -la" }
```

**Security:** Commands are validated against a whitelist. Dangerous characters (`;`, `|`, `&`, `` ` ``, `$`, `(`, `)`) are rejected.

### POST /api/devices/printer
Sends a command to a printer device.

**Body:**
```json
{ "device_id": "dev_abc123", "command": "print", "data": "Hello World" }
```

---

## Agent (3 endpoints)

### POST /api/agent/execute
Executes a command through the agent controller.

**Body:**
```json
{ "text": "run skill list-files" }
```

### GET /api/agent/capabilities
Returns all registered agent capabilities.

**Response:**
```json
{
  "capabilities": [
    { "name": "file_search", "category": "filesystem", "voice_trigger": "search for files" }
  ]
}
```

### GET /api/agent/controller-status
Returns agent controller state.

---

## Wake Word & VAD (2 endpoints)

### GET /api/wake-vad/status
Returns wake word detection and VAD status.

**Response:**
```json
{
  "wake_word_active": true,
  "vad_active": true,
  "always_listen": false,
  "last_wake": "2026-02-09T12:00:00Z"
}
```

### POST /api/wake-vad/toggle
Toggles wake word or always-listen mode.

**Body:**
```json
{ "always_listen": true }
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Description of what went wrong",
  "code": "VALIDATION_ERROR"
}
```

| HTTP Status | Meaning |
|-------------|---------|
| 200 | Success |
| 400 | Bad request / validation error |
| 404 | Endpoint not found |
| 413 | Request too large (>1MB) |
| 500 | Internal server error |
