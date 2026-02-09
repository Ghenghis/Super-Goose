# Agent 2: Backend & API Auditor — Task List

**Scope:** Python API routes, request/response handlers, wiring fixes, API contracts, input validation  
**Audit Passes:** 1 (API), 2 (handler column), 3 (orphaned routes), 7 (API contracts)  
**Estimated Time:** 2-3 hours  
**Dependencies:** None — can start immediately  

---

## Phase 1 Tasks (Start Immediately)

### TASK 2.1: Wire PersonalityModulator into Response Pipeline

**Problem:** `personality/modulator.py` exists (119 lines, fully implemented) but is NEVER called. When GooseBridge returns a response, it goes directly to ResultSpeaker without personality modulation.

**Files to modify:**
- `G:\goose\external\conscious\src\conscious\voice\agent_api.py`

**Current flow:**
```
GooseBridge.execute() → GooseResult.text → ResultSpeaker.to_speech() → spoken output
```

**Required flow:**
```
GooseBridge.execute() → GooseResult.text → PersonalityModulator.modulate() → ResultSpeaker.to_speech() → spoken output
```

**Implementation:**
1. In `agent_api.py`, import PersonalityModulator at the top
2. In `__init__`, create `self._personality_modulator = PersonalityModulator()`
3. In the response pipeline (around line 930 where `to_speech` is called), add modulation step:
```python
# Get current personality profile
profile = self._personality_switcher.current_profile
if profile:
    modulated = self._personality_modulator.modulate(result.text, profile)
else:
    modulated = result.text
speech = self._result_speaker.to_speech(modulated, action=action)
```

**Also wire into emotion prefix generation:**
In the `_emotion_loop` method, use PersonalityModulator's `get_prompt_prefix()` to combine personality + emotion context before injecting into GooseBridge.

### TASK 2.2: Wire SkillBridge into agent_controller

**Problem:** `agentic/skill_bridge.py` (107 lines) parses voice commands like "run skill", "save skill", "list skills" but is NOT imported or used in VoiceAgentController.

**Files to modify:**
- `G:\goose\external\conscious\src\conscious\agentic\agent_controller.py`

**Implementation:**
1. Import SkillBridge at top of agent_controller.py
2. In `__init__`, create `self._skill_bridge = SkillBridge()`
3. In `_handle_goose()` method, BEFORE falling through to freeform GooseBridge, check if the text is a skill command:
```python
async def _handle_goose(self, action: str, text: str, params: dict) -> dict:
    # Check if this is a skill command
    skill_cmd = self._skill_bridge.parse(text)
    if skill_cmd:
        prompt = self._skill_bridge.to_goose_prompt(skill_cmd)
        result = await self._goose_bridge.send(prompt)
        return {"success": result.success, "text": result.text, "source": "skill_bridge"}
    
    # Existing freeform logic...
```

### TASK 2.3: Wire ConversationHistory into Voice Pipeline

**Problem:** ConversationHistory exists and works, but nothing in the voice pipeline adds user/assistant messages to it during live conversation.

**Files to modify:**
- `G:\goose\external\conscious\src\conscious\voice\agent_api.py`

**Implementation:**
1. In the voice token callback (where user speech is received from Moshi), after accumulating a complete utterance, add:
```python
self._conversation_history.add_user(user_text, emotion=current_emotion)
```

2. In the action result callback (after GooseBridge returns a response), add:
```python
self._conversation_history.add_conscious(result.text)
```

3. In the `handle_agent_execute` handler, also log the exchange:
```python
self._conversation_history.add_user(text)
# ... execute ...
self._conversation_history.add_conscious(result.text)
```

4. Pass recent conversation context to GooseBridge for multi-turn awareness:
```python
messages = self._conversation_history.get_recent_messages(limit=10)
# Include in GooseBridge.execute() call if the bridge supports context
```

### TASK 2.4: Sync IntentRouter Patterns with CapabilityRegistry

**Problem:** IntentRouter has ~20 hardcoded regex patterns. CapabilityRegistry has 40+ capabilities with voice triggers. They are NOT synchronized — some voice commands work via IntentRouter but not CapabilityRegistry, and vice versa.

**Files to modify:**
- `G:\goose\external\conscious\src\conscious\agentic\intent_router.py`
- `G:\goose\external\conscious\src\conscious\agentic\capabilities.py`

**Implementation approach:**
1. Read both files fully to understand current patterns
2. Option A (preferred): Make IntentRouter dynamically load patterns from CapabilityRegistry at init
3. Option B: Generate IntentRouter patterns from CapabilityRegistry's voice_triggers and keep them in sync
4. Ensure every CapabilityRegistry entry has at least one matching IntentRouter pattern
5. Ensure every IntentRouter pattern maps to a valid CapabilityRegistry action name

**Verification:**
```python
# Test that every capability trigger matches at least one intent pattern
registry = CapabilityRegistry()
router = IntentRouter()
for cap in registry.list_all():
    for trigger in cap.voice_triggers:
        result = router._classify(trigger)
        assert result.intent == IntentType.ACTION, f"Trigger '{trigger}' not recognized"
```

---

## Phase 2 Tasks (After Wiring Complete)

### TASK 2.5: API Input Validation on All 33 Endpoints

For each POST endpoint, verify:
1. Required fields are checked — return 400 if missing
2. Field types are validated — return 400 if wrong type
3. String fields are trimmed and length-limited
4. No raw exceptions leak to client — all errors return structured JSON

**Validation pattern to apply:**
```python
async def handle_example(self, request: web.Request) -> web.Response:
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return web.json_response({"error": "Invalid JSON"}, status=400)
    
    text = data.get("text", "").strip()
    if not text:
        return web.json_response({"error": "Missing required field: text"}, status=400)
    if len(text) > 10000:
        return web.json_response({"error": "Text too long (max 10000 chars)"}, status=400)
    
    # ... handler logic ...
```

**Endpoints requiring validation (POST only):**
| Endpoint | Required Fields | Validation |
|----------|----------------|------------|
| POST /api/voice/audio | `audio` (base64 string) | Base64 decodable, reasonable size |
| POST /api/agentic/toggle | `enabled` (bool) | Must be boolean |
| POST /api/agentic/execute | `text` (string) | Non-empty, max 10000 chars |
| POST /api/emotion/toggle | `enabled` (bool) | Must be boolean |
| POST /api/personality/switch | `name` (string) | Non-empty, valid profile name |
| POST /api/creator/create | `text` (string) | Non-empty, max 5000 chars |
| POST /api/creator/promote | `staging_path` (string) | Non-empty, path exists |
| POST /api/testing/validate | `feature` (string) | Non-empty |
| POST /api/testing/heal | `feature` (string) | Non-empty |
| POST /api/devices/scan | — | Optional params only |
| POST /api/devices/probe | `ip` (string) | Valid IP address format |
| POST /api/devices/add | `name`, `ip` (strings) | Non-empty, valid IP |
| POST /api/devices/remove | `device_id` (string) | Non-empty |
| POST /api/devices/creator-mode | `enabled` (bool) | Must be boolean |
| POST /api/devices/printer | `command` (string) | Non-empty G-code |
| POST /api/devices/ssh | `device_id`, `command` | Non-empty strings |
| POST /api/agent/execute | `text` (string) | Non-empty, max 10000 chars |
| POST /api/wake-vad/toggle | `enabled` (bool) | Must be boolean |

### TASK 2.6: Create API Documentation

**Create:** `G:\goose\external\conscious\docs\API.md`

Document all 33 endpoints with:
- Method + Path
- Description
- Request body (JSON schema)
- Response body (JSON schema)
- Error responses
- Example curl commands

---

## Verification Checkpoints

### After Phase 1:
```bash
# Syntax check
cd G:\goose\external\conscious && python -c "import py_compile; import glob; files=glob.glob('src/conscious/**/*.py', recursive=True); [py_compile.compile(f, doraise=True) for f in files]; print(f'{len(files)} files OK')"

# Import check
cd G:\goose\external\conscious && python -c "from conscious.agentic import *; from conscious.emotion import *; from conscious.personality import *; from conscious.memory import *; print('All imports OK')"
```

### After Phase 2:
```bash
# Start server and test validation
cd G:\goose\external\conscious && python -c "
import asyncio, aiohttp

async def test():
    async with aiohttp.ClientSession() as s:
        # Test missing field
        r = await s.post('http://localhost:8999/api/agent/execute', json={})
        assert r.status == 400, f'Expected 400, got {r.status}'
        
        # Test valid request
        r = await s.post('http://localhost:8999/api/agent/execute', json={'text': 'hello'})
        assert r.status == 200, f'Expected 200, got {r.status}'
        
        print('Validation tests passed')

asyncio.run(test())
"
```

---

## Files Created/Modified Summary

| Action | File |
|--------|------|
| MODIFY | `G:\goose\external\conscious\src\conscious\voice\agent_api.py` (modulator wiring, history wiring, validation) |
| MODIFY | `G:\goose\external\conscious\src\conscious\agentic\agent_controller.py` (skill_bridge wiring) |
| MODIFY | `G:\goose\external\conscious\src\conscious\agentic\intent_router.py` (sync with capabilities) |
| CREATE | `G:\goose\external\conscious\docs\API.md` |
