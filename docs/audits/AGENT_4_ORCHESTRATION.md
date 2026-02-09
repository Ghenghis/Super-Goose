# Agent 4: Agent Lifecycle & Orchestration Auditor — Task List

**Scope:** VoiceAgentController, ActionQueue, WakeVADPipeline, MoshiAgent, UIBridge lifecycle, error handling  
**Audit Passes:** Module A (lifecycle), Module B (tool registration), Module C (communication), Module D (sandbox), Pass 10-11 (failure modes)  
**Estimated Time:** 2-3 hours  
**Dependencies:** None — can start immediately (analysis first)  

---

## Phase 1 Tasks (Start Immediately — Analysis & Audit)

### TASK 4.1: Agent Lifecycle Verification

**Objective:** For each subsystem, verify start/stop/crash-recovery behavior.

Audit each of these subsystems:

| Subsystem | File | Start Method | Stop Method | Crash Recovery? |
|-----------|------|-------------|-------------|-----------------|
| MoshiServerManager | `voice/server_manager.py` | `start()` | `stop()` | Verify |
| MoshiAgent | `voice/moshi_agent.py` | `connect()` | `disconnect()` | Verify |
| WakeVADPipeline | `voice/wake_vad.py` | `start()` | `stop()` | Verify |
| UIBridge | `agentic/ui_bridge.py` | `start()` | `stop()` | Verify |
| ActionQueue | `agentic/action_queue.py` | `start()` | `stop()` | Verify |
| EmotionDetector | `emotion/detector.py` | `load_model()` | N/A | Verify |
| GooseBridge | `agentic/goose_bridge.py` | N/A (stateless) | N/A | N/A |
| IntentRouter | `agentic/intent_router.py` | N/A (stateless) | N/A | N/A |

**For each subsystem, answer:**
1. Can it start cleanly from zero state? (no leftover files/connections)
2. Can it be stopped cleanly? (all resources released)
3. Can it be restarted after stop? (no "already running" errors)
4. What happens if it crashes mid-operation? (state corruption?)
5. Does the master orchestrator (`agent_api.py:start_all/stop_all`) handle it?
6. Is there a timeout on start/stop? (no infinite hangs)

**Deliverable:** Lifecycle status table with PASS/FAIL per cell.

### TASK 4.2: Error Propagation Audit

**Objective:** Find every `try/except` block and verify no errors are swallowed.

**Search command:**
```bash
grep -rn "except.*:" G:\goose\external\conscious\src\conscious\ --include="*.py"
```

**For each exception handler, verify:**
1. The exception is logged (`logger.error`, not just `pass`)
2. The error is propagated or returned to caller (not silently eaten)
3. If caught generically (`except Exception`), there's a good reason documented
4. Resources are cleaned up in the handler (connections closed, locks released)

**Known problematic patterns to look for:**
```python
# BAD: swallowed error
try:
    await something()
except Exception:
    pass

# BAD: generic catch with no logging
try:
    result = await bridge.execute(action)
except:
    return {"error": "failed"}

# GOOD: specific catch with logging
try:
    result = await bridge.execute(action)
except aiohttp.ClientError as e:
    logger.error(f"GooseBridge connection failed: {e}")
    return web.json_response({"error": str(e)}, status=502)
```

**Deliverable:** Table of all exception handlers with status.

### TASK 4.3: Graceful Shutdown Audit

**File:** `G:\goose\external\conscious\src\conscious\voice\agent_api.py` — `stop_all()` method (around line 257-295)

**Verify the shutdown sequence stops ALL subsystems:**
1. Cancel emotion loop task
2. Cancel voice processing tasks
3. Stop ActionQueue (drain pending actions)
4. Stop UIBridge WebSocket server
5. Stop WakeVAD pipeline
6. Disconnect MoshiAgent
7. Stop MoshiServerManager
8. Save ConversationHistory session
9. Clean up any temporary files

**For each stop operation, verify:**
- There's a timeout (don't hang forever if a subsystem is stuck)
- Errors during shutdown don't prevent other subsystems from stopping
- The order is correct (stop consumers before producers)

**Implementation if missing:**
```python
async def stop_all(self) -> None:
    """Stop all subsystems with timeout and error isolation."""
    errors = []
    
    # Stop in reverse-dependency order
    for name, coro in [
        ("emotion_loop", self._stop_emotion_loop()),
        ("action_queue", self._action_queue.stop()),
        ("ui_bridge", self._ui_bridge.stop()),
        ("wake_vad", self._wake_vad.stop() if self._wake_vad else asyncio.sleep(0)),
        ("moshi_agent", self._moshi_agent.disconnect()),
        ("moshi_server", self._server_manager.stop()),
    ]:
        try:
            await asyncio.wait_for(coro, timeout=5.0)
        except asyncio.TimeoutError:
            logger.error(f"Timeout stopping {name}")
            errors.append(name)
        except Exception as e:
            logger.error(f"Error stopping {name}: {e}")
            errors.append(name)
    
    # Always save history, even if other stops failed
    try:
        self._conversation_history.save_session()
    except Exception as e:
        logger.error(f"Failed to save session: {e}")
    
    if errors:
        logger.warning(f"Shutdown completed with errors in: {errors}")
    else:
        logger.info("Clean shutdown completed")
```

---

## Phase 2 Tasks (After Analysis)

### TASK 4.4: ActionQueue Backpressure & Timeout

**File:** `G:\goose\external\conscious\src\conscious\agentic\action_queue.py`

**Verify/implement:**
1. Queue has a maximum size (e.g., 100 items) — reject new items when full
2. Each action has a timeout (e.g., 30 seconds) — kill stale actions
3. Queue reports its depth via `queue_size` property
4. Worker handles exceptions from individual actions without crashing the loop

**Implementation if missing:**
```python
async def enqueue(self, action: IntentResult) -> bool:
    if self._queue.qsize() >= self._max_size:
        logger.warning(f"Action queue full ({self._max_size}), rejecting: {action.action}")
        return False
    await self._queue.put(action)
    return True

async def _process_action(self, action: IntentResult) -> None:
    try:
        result = await asyncio.wait_for(
            self._goose_bridge.execute(action.action, action.raw_text),
            timeout=self._action_timeout
        )
        # ... handle result
    except asyncio.TimeoutError:
        logger.error(f"Action timed out after {self._action_timeout}s: {action.action}")
        # ... notify caller of timeout
```

### TASK 4.5: GooseBridge Circuit Breaker

**File:** `G:\goose\external\conscious\src\conscious\agentic\goose_bridge.py`

**Problem:** If goosed server is down, every action attempt blocks for the HTTP timeout before failing. Under load, this creates a backlog of stuck requests.

**Implement circuit breaker pattern:**
```python
class GooseBridge:
    def __init__(self, ...):
        self._failure_count = 0
        self._circuit_open = False
        self._circuit_opened_at = 0.0
        self._circuit_reset_timeout = 30.0  # seconds
        self._failure_threshold = 3
    
    async def execute(self, action, raw_text="", ...):
        if self._circuit_open:
            if time.time() - self._circuit_opened_at > self._circuit_reset_timeout:
                self._circuit_open = False  # half-open: try one request
            else:
                return GooseResult(success=False, text="Goose agent is temporarily unavailable", elapsed_s=0)
        
        try:
            result = await self._send_request(...)
            self._failure_count = 0  # reset on success
            return result
        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            self._failure_count += 1
            if self._failure_count >= self._failure_threshold:
                self._circuit_open = True
                self._circuit_opened_at = time.time()
                logger.warning(f"Circuit breaker OPEN after {self._failure_count} failures")
            raise
```

### TASK 4.6: WakeVAD Pipeline State Machine Completeness

**File:** `G:\goose\external\conscious\src\conscious\voice\wake_vad.py`

**Verify all state transitions are handled:**
```
IDLE → (wake word detected) → LISTENING
LISTENING → (speech detected) → SPEECH_ACTIVE
SPEECH_ACTIVE → (silence detected) → PROCESSING
PROCESSING → (command executed) → IDLE
LISTENING → (timeout, no speech) → IDLE
SPEECH_ACTIVE → (timeout, too long) → IDLE
Any State → (stop called) → STOPPED
STOPPED → (start called) → IDLE
```

**For each transition, verify:**
1. State variable is updated
2. Appropriate callback is fired
3. Resources are allocated/released correctly
4. Timeout exists for each non-terminal state

### TASK 4.7: UIBridge Client Disconnect Handling

**File:** `G:\goose\external\conscious\src\conscious\agentic\ui_bridge.py`

**Verify:**
1. When a WebSocket client disconnects, it's removed from `_clients` set
2. When sending a command, disconnected clients don't cause exceptions
3. `send_command` handles the case where all clients are disconnected
4. Connection errors during send are caught per-client (one bad client doesn't block others)

---

## Verification Checkpoints

### After Phase 1:
- Produce lifecycle status table (subsystem × lifecycle event → PASS/FAIL)
- Produce exception handler audit table (file:line → status)
- Produce shutdown sequence verification

### After Phase 2:
```bash
# Syntax + import check
cd G:\goose\external\conscious && python -c "import py_compile; import glob; files=glob.glob('src/conscious/**/*.py', recursive=True); [py_compile.compile(f, doraise=True) for f in files]; print(f'{len(files)} files OK')"

# Verify circuit breaker
cd G:\goose\external\conscious && python -c "
from conscious.agentic.goose_bridge import GooseBridge
bridge = GooseBridge(goosed_url='http://localhost:1')  # intentionally wrong
import asyncio
async def test():
    for i in range(5):
        result = await bridge.execute('test', 'hello')
        print(f'Attempt {i+1}: success={result.success}')
asyncio.run(test())
"
```

---

## Files Created/Modified Summary

| Action | File |
|--------|------|
| MODIFY | `G:\goose\external\conscious\src\conscious\voice\agent_api.py` (shutdown improvements) |
| MODIFY | `G:\goose\external\conscious\src\conscious\agentic\action_queue.py` (backpressure + timeout) |
| MODIFY | `G:\goose\external\conscious\src\conscious\agentic\goose_bridge.py` (circuit breaker) |
| MODIFY | `G:\goose\external\conscious\src\conscious\voice\wake_vad.py` (state machine completeness) |
| MODIFY | `G:\goose\external\conscious\src\conscious\agentic\ui_bridge.py` (disconnect handling) |
| AUDIT | All files with try/except blocks |
