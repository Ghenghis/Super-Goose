# Agent 3: Data & State Auditor — Task List

**Scope:** Data persistence, state consistency, configuration, YAML profiles, async safety  
**Audit Passes:** 5 (data integrity), 6 (concurrency), 8 (configuration), 12 (idempotency)  
**Estimated Time:** 2-3 hours  
**Dependencies:** None — can start immediately (analysis first, implementation second)  

---

## Phase 1 Tasks (Start Immediately — Analysis)

### TASK 3.1: Audit All JSON Persistence Paths

**Objective:** Enumerate every file write in the codebase and verify correctness.

**Known persistence locations:**

| Module | What | Where Written | Format | Read Back? |
|--------|------|---------------|--------|------------|
| `memory/conversation_history.py` | Session transcripts | `~/.config/conscious/history/voice-*.json` | JSON | Yes (load_previous_sessions) |
| `devices/manager.py` | Device registry | `~/.config/conscious/devices/registry.json` | JSON | Yes (load on init) |
| `agentic/creator.py` | Staged artifacts | `~/.config/conscious/staging/*.json` | JSON | Yes (promote reads) |
| `agentic/creator.py` | Active artifacts | `~/.config/conscious/active/*.json` | JSON | Verify |
| `agentic/ui_bridge.py` | Command history | In-memory only (list) | N/A | N/A |

**For each persistence path, verify:**
1. Directory is created with `mkdir(parents=True, exist_ok=True)` before write
2. Write uses `try/except` — file I/O errors are caught and logged
3. JSON is valid (no NaN, Infinity, or non-serializable objects)
4. File encoding is explicit (`encoding="utf-8"`)
5. Read path handles corrupted/malformed JSON gracefully
6. Read path handles missing file gracefully
7. No race condition between concurrent reads and writes

### TASK 3.2: Audit Shared Mutable State (Concurrency)

**Objective:** List every piece of state accessed by multiple async tasks and verify protection.

**Known shared state:**

| State | Location | Readers | Writers | Protection |
|-------|----------|---------|---------|------------|
| `_entries` list | ConversationHistory | get_recent, get_transcript, save | add_user, add_conscious, clear | None — VERIFY |
| `_clients` set | UIBridge | send_command, _handle_client | _handle_client (add/remove) | None — NEEDS asyncio.Lock |
| `_command_history` list | UIBridge | get_status | send_command | None — VERIFY |
| `_devices` dict | DeviceManager | list_devices, get_status | add_device, remove_device, scan | None — VERIFY |
| `_queue` | ActionQueue | worker | enqueue | asyncio.Queue (safe) ✅ |
| `_emotion_prefix` | GooseBridge | execute | set_emotion_prefix | Simple str assign (safe) ✅ |
| `_history` list | EmotionTracker | get_mood, get_latest | add | None — VERIFY |
| `_entries` buffer | EmotionDetector | classify, buffer_ready | feed_audio, clear | None — VERIFY |
| `_is_busy` bool | ActionQueue | is_busy property | worker | Atomic-like (safe) ✅ |

**For each unprotected state, determine:**
1. Can two async tasks access simultaneously? (If server handles concurrent HTTP requests — YES)
2. Is the data structure safe for concurrent access? (Python lists/dicts are NOT safe for concurrent modification)
3. Add `asyncio.Lock` where needed, or document why it's safe

**Implementation pattern:**
```python
class UIBridge:
    def __init__(self):
        self._clients: set = set()
        self._clients_lock = asyncio.Lock()
    
    async def send_command(self, command, params):
        async with self._clients_lock:
            clients = set(self._clients)  # snapshot
        for client in clients:
            await client.send(json.dumps({...}))
```

### TASK 3.3: Configuration Audit

**Objective:** Inventory every config key, environment variable, and hardcoded constant.

**Known configuration:**

| Key | Location | Type | Default | Documented? |
|-----|----------|------|---------|-------------|
| API port | agent_api.py | int | 8999 | No |
| Moshi port | agent_api.py | int | 8998 | No |
| UI Bridge port | ui_bridge.py | int | 8997 | No |
| Goosed URL | goose_bridge.py | str | `http://localhost:3000` | No |
| History dir | conversation_history.py | Path | `~/.config/conscious/history` | No |
| Emotion model | detector.py | str | `ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition` | No |
| Max window | conversation_history.py | int | 50 | No |
| Max retries | self_healing.py | int | 3 | No |
| Audio sample rate | Various | int | 24000/16000 | No |

**Deliverables:**
1. Create/update `D:\conscious\src\conscious\config.py` with a unified `ConsciousConfig` dataclass
2. All hardcoded values should reference the config
3. Config should load from environment variables with sensible defaults
4. Document all config keys in a section of README or SETUP.md

---

## Phase 2 Tasks (After Analysis)

### TASK 3.4: Implement YAML Personality Profile Loading

**Problem:** 13 personality profiles are defined as Python dicts in `profile.py`. The original plan was to load from YAML files in `data/personalities/` for user extensibility.

**Files to create/modify:**
- Create: `D:\conscious\src\conscious\data\personalities\default.yaml` (and 12 more)
- Modify: `D:\conscious\src\conscious\personality\profile.py`

**Implementation:**
1. Export each of the 13 profiles from the existing Python dicts to YAML files
2. Add a `load_profiles_from_yaml(directory: Path)` function to profile.py
3. On init, load profiles from YAML directory first, fall back to built-in dicts
4. Validate YAML profiles against a schema (required fields: name, description, voice_params, etc.)
5. Allow users to add custom YAML profiles by dropping files in the directory

**YAML format:**
```yaml
name: spark
description: "Bright, curious, mildly caffeinated AI"
content_rating: general
voice_params:
  pitch_shift: 0.0
  speed_factor: 1.05
  energy_level: high
imperfection_params:
  hesitation_rate: 0.1
  breath_rate: 0.05
  stutter_rate: 0.02
greetings:
  - "Hey! What are we building today?"
  - "Oh cool, I was just thinking about that!"
acknowledgments:
  - "Got it!"
  - "On it!"
thinking_phrases:
  - "Hmm, let me think..."
  - "Oh that's interesting..."
catchphrases:
  - "Neat!"
  - "That's awesome!"
```

### TASK 3.5: Add Data Validation to All Write Paths

For each persistence write, add validation BEFORE writing:

**ConversationHistory:**
- Validate entry text is non-empty string
- Validate speaker is "user" or "conscious"
- Validate timestamp is reasonable (not in the future, not > 1 year old)

**DeviceManager:**
- Validate device name is non-empty
- Validate IP address format
- Validate device type is from known enum

**Creator artifacts:**
- Validate artifact type is from known enum
- Validate content is non-empty
- Validate staging path doesn't escape the staging directory (path traversal)

### TASK 3.6: Create Memory Manager Interface

**Purpose:** Unified interface for conversation history + future semantic memory integration.

**Create:** `D:\conscious\src\conscious\memory\memory_manager.py`

```python
class MemoryManager:
    """Unified memory interface combining conversation history and semantic memory."""
    
    def __init__(self, history: ConversationHistory, semantic=None):
        self._history = history
        self._semantic = semantic  # None until mem0ai integration
    
    def add_user(self, text: str, **kwargs):
        self._history.add_user(text, **kwargs)
    
    def add_conscious(self, text: str):
        self._history.add_conscious(text)
    
    def get_context(self, limit: int = 10) -> list:
        return self._history.get_recent_messages(limit)
    
    def get_summary(self) -> dict:
        return self._history.get_summary()
    
    def clear(self):
        self._history.clear()
    
    def save(self):
        return self._history.save_session()
```

---

## Verification Checkpoints

### After Phase 1 (Analysis):
- Produce a table of all shared mutable state with protection status
- Produce a table of all persistence paths with safety status
- Produce a complete configuration inventory

### After Phase 2 (Implementation):
```bash
# Syntax check
cd D:\conscious && python -c "import py_compile; import glob; files=glob.glob('src/conscious/**/*.py', recursive=True); [py_compile.compile(f, doraise=True) for f in files]; print(f'{len(files)} files OK')"

# YAML loading test
cd D:\conscious && python -c "
from conscious.personality.profile import list_profiles, get_profile
profiles = list_profiles()
print(f'Loaded {len(profiles)} profiles')
assert len(profiles) >= 13, 'Expected at least 13 profiles'
for p in profiles:
    assert 'name' in p, f'Profile missing name: {p}'
print('YAML profile loading OK')
"

# Config test
cd D:\conscious && python -c "
from conscious.config import ConsciousConfig
cfg = ConsciousConfig()
print(f'API port: {cfg.api_port}')
print(f'Moshi port: {cfg.moshi_port}')
print('Config OK')
"
```

---

## Files Created/Modified Summary

| Action | File |
|--------|------|
| MODIFY | `D:\conscious\src\conscious\agentic\ui_bridge.py` (add asyncio.Lock for _clients) |
| MODIFY | `D:\conscious\src\conscious\personality\profile.py` (YAML loading) |
| MODIFY | `D:\conscious\src\conscious\config.py` (unified config) |
| CREATE | `D:\conscious\src\conscious\data\personalities/*.yaml` (13 files) |
| CREATE | `D:\conscious\src\conscious\memory\memory_manager.py` |
| MODIFY | Various files (data validation on write paths) |
