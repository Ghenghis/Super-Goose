# Miscellaneous Code Security Fixes

**Alerts:** #36, #37, #38, #41, #42, #55, #91, #98, #99
**Status:** ALL FIXED

---

## Fix #1: Hard-Coded Cryptographic Value (Alert 99)

**File:** `crates/goose/src/mcp_gateway/credentials.rs:502`
**Severity:** Warning

**Problem:** CodeQL flagged hard-coded strings in the test module.

**Analysis:** The flagged values are in `#[cfg(test)] mod tests` block:
```rust
const TEST_API_KEY: &str = "test-api-key-not-real";
const TEST_BEARER: &str = "test-bearer-token-not-real";
```
These are clearly fake test values, NOT production cryptographic material.

**Fix:** Added NOLINT comment:
```rust
// NOLINT(hard-coded-credentials): these are NOT real credentials, used only for unit test assertions
```

---

## Fix #2: Non-HTTPS URL (Alert 98)

**File:** `crates/goose/src/providers/gcpauth.rs:247`
**Severity:** Warning

**Problem:** HTTP URL used for GCP metadata server (`http://169.254.169.254`).

**Analysis:** The GCP metadata server is a link-local address only accessible from within a GCP VM. HTTPS is NOT supported by this service - HTTP is the correct and only protocol.

**Fix:** Added NOLINT comment:
```rust
// NOLINT(non-https-url): GCP metadata server requires HTTP; HTTPS is not supported.
// The metadata server (169.254.169.254) is a link-local service only accessible from within the VM.
```

---

## Fix #3: Uncontrolled Allocation Size (Alert 91)

**File:** `crates/goose-server/src/routes/agent.rs:651`
**Severity:** Warning

**Problem:** `container_id` from JSON request body could be arbitrarily large, causing memory exhaustion.

**Fix:** Added 256-character length validation:
```rust
// Limit container_id length to prevent uncontrolled memory allocation
if let Some(ref id) = request.container_id {
    if id.len() > 256 {
        return Err(ErrorResponse::bad_request(
            "container_id must not exceed 256 characters".to_string(),
        ));
    }
}
```

---

## Fix #4: Identity Replacement (Alert 55)

**File:** `ui/desktop/src/components/sessions/SessionsInsights.tsx:110`
**Severity:** Warning

**Problem:** `.replace(/\//g, '/')` replaces `/` with `/` — a no-op.

**Fix:** Removed the useless replace call:
```typescript
// Before:
return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  .replace(/\//g, '/');

// After:
return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
```

---

## Fix #5: Shell Command Injection (Alerts 41, 42)

**File:** `documentation/scripts/generate-skills-manifest.js:47`
**File:** `documentation/scripts/generate-skills-zips.js:43`
**Severity:** Warning

**Problem:** `execSync()` with template string interpolation spawns a shell, allowing injection if path values contain shell metacharacters.

**Fix:** Changed to `execFileSync()` with array-based arguments (no shell):

```javascript
// Before:
execSync(`git clone --depth 1 ${AGENT_SKILLS_REPO} ${CLONED_REPO_DIR}`, { stdio: 'pipe' });

// After:
execFileSync('git', ['clone', '--depth', '1', AGENT_SKILLS_REPO, CLONED_REPO_DIR], {
  stdio: 'pipe',
  timeout: 60000
});
```

Also fixed the `zip` command in generate-skills-zips.js:
```javascript
// Before:
execSync(`cd ${CLONED_REPO_DIR} && zip -r ${zipPath} ${skillId}`, { stdio: 'pipe' });

// After:
execFileSync('zip', ['-r', zipPath, skillId], { stdio: 'pipe', cwd: CLONED_REPO_DIR });
```

---

## Fix #6: Incomplete URL Substring Sanitization (Alerts 36, 37, 38)

**File:** `documentation/src/theme/DocItem/Layout/index.tsx:89`
**File:** `documentation/docs/assets/docs.js:63`
**Severity:** Warning

**Problem:** `url.includes('youtube.com')` can match `evil-youtube.com` or `youtube.com.evil.com`.

**Fix (DocItem/Layout/index.tsx):** Proper URL parsing:
```typescript
// Before:
return src.includes('youtube.com') || src.includes('vimeo.com');

// After:
try {
  const hostname = new URL(src).hostname;
  return hostname === 'youtube.com' || hostname === 'www.youtube.com' ||
         hostname === 'vimeo.com' || hostname === 'www.vimeo.com' ||
         hostname === 'youtu.be' || hostname === 'www.youtu.be';
} catch {
  return false;
}
```

**Fix (docs.js):** Proper URL parsing:
```javascript
// Before:
if (url.includes("https://codeserver.sq.dev/api/v1/health")) return;

// After:
try {
  const parsedUrl = new URL(url, window.location.origin);
  if (parsedUrl.hostname === "codeserver.sq.dev" && parsedUrl.pathname === "/api/v1/health") {
    return;
  }
} catch (e) { }
```
