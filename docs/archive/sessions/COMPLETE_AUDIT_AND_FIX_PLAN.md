# Complete Audit & Fix Plan - Super-Goose Repository

**Date**: February 7, 2026, 12:45 PM
**Status**: 🔴 **CRITICAL** - Multiple security issues, open PRs, and failing tests
**Priority**: P0 - Fix immediately

---

## 📊 Current State Summary

### 🔴 Critical Issues (30 total)
1. **6 Path Injection Vulnerabilities** (ERROR severity)
2. **4 Stack Trace Exposure** (ERROR severity in Python temp files)
3. **3 Open Dependabot PRs** (dependency updates pending)
4. **10 Open Security Issues** (RUSTSEC advisories)
5. **2 Failing Rust Tests** (ALMAS enforcer)
6. **1 Hard-coded Cryptographic Value** (WARNING)
7. **1 Non-HTTPS URL** (WARNING)
8. **1 Uncontrolled Allocation** (WARNING)
9. **12 Cleartext Logging** (WARNING - sensitive data in logs)
10. **1 Upstream Merge Conflict** (needs manual resolution)

---

## 🎯 Fix Priority Order

### Priority 1: Security Vulnerabilities (ERROR severity) ⏰ 2-3 hours
**6 Path Injection Vulnerabilities** - User input used in file paths without validation

1. `crates/goose/src/config/permission.rs` (3 occurrences)
2. `crates/goose-server/src/routes/schedule.rs` (1 occurrence)
3. `crates/goose/src/session/session_manager.rs` (1 occurrence)
4. `crates/goose/src/config/declarative_providers.rs` (1 occurrence)

**4 Stack Trace Exposure** - Stack traces exposed in error responses (Python)
1. `goose/temp/watchflow-main/src/api/scheduler.py` (2 occurrences)
2. `goose/temp/watchflow-main/src/main.py` (1 occurrence)
3. `goose/temp/agentic-rag-main/app.py` (1 occurrence)

**Fix Strategy:**
- Path injection: Add `canonicalize()` and path traversal checks
- Stack traces: Generic error messages in production, log details server-side
- Delete temp files (they shouldn't be in repo)

---

### Priority 2: Failing Tests (BLOCKING) ⏰ 30 minutes
**2 Failing ALMAS Enforcer Tests**

1. `test_security_read_only` - Security role can write to Cargo.toml (should be read-only)
2. `test_deployer_no_code_edit` - Deployer role cannot read Dockerfile (should be able to)

**Root Cause**: File access patterns don't support read-only files (no separate read/write patterns)

**Fix Strategy:**
- Add `read_only_patterns` field to `FileAccessPatterns` struct
- Security role: Cargo.toml in `read_only_patterns`
- Deployer role: Add Dockerfile to `allowed_patterns`

---

### Priority 3: Dependency Updates (SAFE) ⏰ 10 minutes
**3 Open Dependabot PRs** - Merge if CI passes

1. PR #13: `webpack 5.102.1 → 5.105.0` (npm, documentation)
2. PR #3: `jsonwebtoken 9.3.1 → 10.3.0` (Rust cargo)
3. PR #2: `uv group` (15 Python package updates)

**Fix Strategy:**
- Review each PR's changelog
- Check if CI passes
- Merge if no breaking changes

---

### Priority 4: Security Advisories (INFO) ⏰ 1 hour
**10 Open RUSTSEC Issues** - Unmaintained dependencies

1. **RUSTSEC-2023-0071**: Marvin Attack (timing sidechannel in RSA)
2. **RUSTSEC-2024-0320**: `yaml-rust` unmaintained
3. **RUSTSEC-2025-0134**: `rustls-pemfile` unmaintained
4. **RUSTSEC-2024-0370**: `proc-macro-error` unmaintained
5. **RUSTSEC-2024-0436**: `paste` no longer maintained
6. **RUSTSEC-2025-0119**: `number_prefix` unmaintained
7. **RUSTSEC-2025-0057**: `fxhash` no longer maintained
8. **RUSTSEC-2019-0040**: `boxfnonce` obsolete (Rust 1.35.0+)
9. **RUSTSEC-2025-0141**: `bincode` unmaintained

**Fix Strategy:**
- Run `cargo audit fix` to auto-upgrade where possible
- Manually replace unmaintained crates with maintained alternatives
- Document any crates that can't be replaced

---

### Priority 5: Code Quality Warnings (WARNING) ⏰ 2 hours
**14 Code Scanning Warnings**

1. **12 Cleartext Logging** - Sensitive data (API keys, tokens) in logs
2. **1 Hard-coded Cryptographic Value** - Crypto key in source code
3. **1 Non-HTTPS URL** - HTTP URL in GCP auth
4. **1 Uncontrolled Allocation** - User input controls memory allocation

**Fix Strategy:**
- Cleartext logging: Redact sensitive fields before logging
- Hard-coded crypto: Move to environment variable or secrets manager
- Non-HTTPS URL: Change to HTTPS or document why HTTP is needed
- Uncontrolled allocation: Add size limits and validation

---

### Priority 6: Upstream Merge Conflict ⏰ 15 minutes
**Issue #14**: Auto-sync with upstream failed

**Fix Strategy:**
- Fetch upstream changes
- Manually resolve conflicts
- Push merged result
- Close issue

---

## 🔧 Detailed Fix Instructions

### Fix 1: Path Injection Vulnerabilities (6 total)

#### Example from `crates/goose/src/config/permission.rs`:
```rust
// ❌ VULNERABLE CODE:
pub fn load_config(path: &str) -> Result<Config> {
    let config_path = Path::new(path);  // User input directly to Path
    fs::read_to_string(config_path)?  // Path traversal attack possible
}

// ✅ FIXED CODE:
pub fn load_config(path: &str) -> Result<Config> {
    // Validate and sanitize path
    let config_path = Path::new(path);

    // Canonicalize to resolve .. and symlinks
    let canonical_path = config_path.canonicalize()
        .map_err(|e| anyhow!("Invalid config path: {}", e))?;

    // Ensure path is within allowed directory
    let allowed_base = Path::new("./config").canonicalize()?;
    if !canonical_path.starts_with(&allowed_base) {
        return Err(anyhow!("Path traversal attempt detected"));
    }

    fs::read_to_string(canonical_path)?
}
```

#### Apply to all 6 path injection locations:
1. Add `canonicalize()` to resolve symlinks and `..`
2. Check `starts_with(allowed_base)` to prevent traversal
3. Return error if path escapes allowed directory

---

### Fix 2: Stack Trace Exposure (4 in Python temp files)

**IMMEDIATE ACTION**: Delete temp files (shouldn't be in repo)
```bash
rm -rf goose/temp/watchflow-main/
rm -rf goose/temp/agentic-rag-main/
```

**If they're needed** (fix the code):
```python
# ❌ VULNERABLE CODE:
except Exception as e:
    return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500

# ✅ FIXED CODE:
except Exception as e:
    logger.error(f"Error in scheduler: {e}", exc_info=True)  # Log full trace server-side
    return jsonify({"error": "Internal server error"}), 500  # Generic message to client
```

---

### Fix 3: Failing ALMAS Tests (2 tests)

**Add `read_only_patterns` to FileAccessPatterns**:

```rust
// File: crates/goose/src/agents/team/roles.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileAccessPatterns {
    pub allowed_patterns: HashSet<String>,
    pub blocked_patterns: HashSet<String>,
    pub read_only_patterns: HashSet<String>,  // NEW: Files that can be read but not written
}

// Security role configuration:
pub fn security() -> Self {
    let mut allowed = HashSet::new();
    allowed.insert("SECURITY_SCAN.md".to_string());
    allowed.insert("VULNERABILITIES.md".to_string());
    // ... other security reports only

    let mut read_only = HashSet::new();  // NEW
    read_only.insert("**/Cargo.toml".to_string());
    read_only.insert("**/Cargo.lock".to_string());
    read_only.insert("**/package.json".to_string());
    // ... config files Security can read but not write

    let mut blocked = HashSet::new();
    blocked.insert("**/src/**/*.rs".to_string());
    // ... source code files

    Self {
        allowed_patterns: allowed,
        blocked_patterns: blocked,
        read_only_patterns: read_only,  // NEW
    }
}

// Deployer role - add Dockerfile to allowed:
pub fn deployer() -> Self {
    let mut allowed = HashSet::new();
    allowed.insert("BUILD_LOG.md".to_string());
    allowed.insert("**/Dockerfile".to_string());  // ADD THIS
    allowed.insert("**/docker-compose.yml".to_string());  // ADD THIS
    // ...
}
```

**Update enforcer.rs to check read_only_patterns**:
```rust
// File: crates/goose/src/agents/team/enforcer.rs

pub fn check_write(&self, path: &Path) -> EnforcementResult {
    // ... existing capability checks ...

    // NEW: Check if file is read-only
    let path_str = path.to_string_lossy();
    for pattern in &self.role_config.file_access.read_only_patterns {
        if matches_pattern(&path_str, pattern) {
            return EnforcementResult {
                allowed: false,
                reason: format!("File is read-only for role {:?}", self.current_role),
                operation: Operation::Write(path.to_path_buf()),
                role: self.current_role,
            };
        }
    }

    // ... rest of existing logic ...
}
```

---

### Fix 4: Cleartext Logging (12 warnings)

**Pattern to apply**:
```rust
// ❌ VULNERABLE CODE:
debug!("API call with key: {}", api_key);

// ✅ FIXED CODE:
debug!("API call with key: {}***", &api_key[..3]);  // Only log first 3 chars
// OR
debug!("API call with key: [REDACTED]");
```

**Files to fix** (12 total):
- `crates/goose/src/providers/provider_registry.rs`
- `crates/goose/src/providers/api_client.rs` (3 occurrences)
- `crates/goose-cli/src/recipes/recipe.rs` (6 occurrences)
- `crates/goose-cli/src/commands/session.rs`
- `crates/goose-cli/src/commands/schedule.rs`
- `crates/goose-cli/src/commands/project.rs` (2 occurrences)
- `crates/goose/tests/guardrails_integration_test.rs`
- `crates/goose/src/providers/init.rs`
- `crates/goose/src/providers/gcpauth.rs`

---

### Fix 5: Hard-coded Cryptographic Value

**File**: `crates/goose/src/mcp_gateway/credentials.rs`

```rust
// ❌ VULNERABLE CODE:
const ENCRYPTION_KEY: &str = "hardcoded-secret-key-123";

// ✅ FIXED CODE:
fn get_encryption_key() -> Result<String> {
    env::var("GOOSE_ENCRYPTION_KEY")
        .map_err(|_| anyhow!("GOOSE_ENCRYPTION_KEY environment variable not set"))
}
```

---

### Fix 6: Non-HTTPS URL

**File**: `crates/goose/src/providers/gcpauth.rs`

```rust
// ❌ VULNERABLE CODE:
const METADATA_URL: &str = "http://metadata.google.internal/...";

// ✅ FIXED CODE (if possible):
const METADATA_URL: &str = "https://metadata.google.internal/...";

// OR (if HTTP is required - GCP metadata endpoint only supports HTTP):
// Document why HTTP is acceptable (internal-only endpoint, not internet-routable)
```

---

### Fix 7: Uncontrolled Allocation

**File**: `crates/goose-server/src/routes/agent.rs`

```rust
// ❌ VULNERABLE CODE:
let buffer = vec![0u8; user_provided_size];  // OOM attack possible

// ✅ FIXED CODE:
const MAX_BUFFER_SIZE: usize = 10 * 1024 * 1024;  // 10 MB limit
if user_provided_size > MAX_BUFFER_SIZE {
    return Err(anyhow!("Buffer size exceeds maximum allowed: {}", MAX_BUFFER_SIZE));
}
let buffer = vec![0u8; user_provided_size];
```

---

## 📋 Execution Checklist

### Phase 1: Critical Security Fixes (2-3 hours)
- [ ] Fix 6 path injection vulnerabilities
- [ ] Delete Python temp files with stack trace exposure
- [ ] Fix hard-coded cryptographic value
- [ ] Fix uncontrolled allocation
- [ ] Test all security fixes

### Phase 2: Fix Failing Tests (30 minutes)
- [ ] Add `read_only_patterns` to FileAccessPatterns
- [ ] Update Security role configuration
- [ ] Update Deployer role configuration
- [ ] Update enforcer.rs write check logic
- [ ] Run tests: `cargo test agents::team::enforcer::tests`
- [ ] Verify both tests pass

### Phase 3: Fix Cleartext Logging (1 hour)
- [ ] Add redaction helper function
- [ ] Fix all 12 cleartext logging warnings
- [ ] Verify logs don't contain sensitive data

### Phase 4: Dependency Updates (30 minutes)
- [ ] Review PR #13 (webpack)
- [ ] Review PR #3 (jsonwebtoken)
- [ ] Review PR #2 (uv group)
- [ ] Merge if CI passes
- [ ] Run `cargo audit fix`
- [ ] Replace unmaintained crates

### Phase 5: Final Validation (30 minutes)
- [ ] Run all tests: `cargo test --all`
- [ ] Run security scan: `cargo audit`
- [ ] Check code scanning: `gh api code-scanning/alerts`
- [ ] Verify CI passes
- [ ] Create comprehensive commit

---

## 🎯 Success Criteria

**After all fixes:**
- ✅ Zero ERROR-severity security warnings
- ✅ All tests passing (1325/1325)
- ✅ All Dependabot PRs merged
- ✅ Zero unmaintained dependencies with CVEs
- ✅ Clean code scanning report
- ✅ CI passing on main branch

---

**Estimated Total Time**: 5-6 hours
**Priority**: Start immediately
**Blocking**: Yes - security vulnerabilities and failing tests block release

