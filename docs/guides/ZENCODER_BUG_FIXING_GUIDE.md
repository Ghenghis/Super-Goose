# ZenCoder Bug Fixing Guide for Super-Goose

**Purpose**: Comprehensive guide for systematic bug hunting and fixes
**Focus**: Functional correctness, not production certificates
**Goal**: Zero errors, zero bugs, minimal warnings

---

## 🚨 CRITICAL: 14 Failing Tests Discovered (CI Run #21786365626)

**Status**: Build and Test Rust Project - **FAILED with 14 test failures**
**Impact**: HIGH - These are real functionality bugs blocking release
**Test Results**: 1311 passed; **14 failed**; 0 ignored

### Failing Tests Breakdown:

#### ALMAS Team System Tests (6 failures):
1. `agents::team::almas_integration_tests::tests::test_batch_operations_enforcement`
2. `agents::team::almas_integration_tests::tests::test_role_capability_enforcement`
3. `agents::team::enforcer::tests::test_batch_operations`
4. `agents::team::enforcer::tests::test_deployer_no_code_edit`
5. `agents::team::enforcer::tests::test_developer_full_permissions`
6. `agents::team::enforcer::tests::test_qa_no_edit_permissions` - `assertion failed: execute_result.allowed`
7. `agents::team::enforcer::tests::test_security_read_only` - `assertion failed: read_result.allowed`

#### Adversarial System Tests (3 failures):
1. `agents::adversarial::integration_tests::tests::test_complete_workflow_with_approval`
2. `agents::adversarial::integration_tests::tests::test_comprehensive_workflow_with_metadata`
3. `agents::adversarial::review::tests::test_review_stats_improvement_trend`

#### Evolution System Tests (4 failures):
1. `agents::evolution::integration_tests::tests::test_end_to_end_evolution_cycle`
2. `agents::evolution::integration_tests::tests::test_metrics_tracking_workflow`
3. `agents::evolution::integration_tests::tests::test_multi_generation_evolution`
4. `agents::evolution::metrics::tests::test_compare_prompts`

### Root Cause Analysis Needed:
- **ALMAS Enforcer**: Permission checks appear broken - tests expect `.allowed = true` but getting `false`
- **Adversarial**: Workflow integration tests failing (approval/metadata related)
- **Evolution**: Metrics tracking and evolution cycle tests failing

### Immediate Action Required:
```bash
# Run tests locally to reproduce
cd G:\goose\crates
cargo test --lib -- --nocapture agents::team::enforcer::tests::test_qa_no_edit_permissions
cargo test --lib -- --nocapture agents::adversarial::integration_tests::tests::test_complete_workflow_with_approval
cargo test --lib -- --nocapture agents::evolution::integration_tests::tests::test_end_to_end_evolution_cycle

# Debug with full backtrace
RUST_BACKTRACE=full cargo test --lib -- --nocapture
```

---

## 🎯 Priority Bug Fixing Areas

### Priority 1: Critical Functionality Bugs (Fix First)

#### 1.1 Platform-Specific CI Failures (Windows vs Linux)

**Location**: `.github/workflows/`

**Known Issues**:
```yaml
# ❌ Check Rust Code Format - FAILS on Linux, PASSES on Windows
# Root cause: Platform-specific line endings and formatting differences
```

**Investigation Steps**:
1. Read CI logs: `.github/workflows/ci.yml`
2. Check for platform-specific `cargo fmt` behavior
3. Look for `.gitattributes` line ending configuration
4. Verify rustfmt.toml is identical across platforms

**Fix Strategy**:
```bash
# Add to .gitattributes
*.rs text eol=lf
*.toml text eol=lf
*.md text eol=lf

# Ensure consistent formatting
cargo fmt --all
git add .
git commit -m "fix: enforce LF line endings for cross-platform consistency"
```

**False Positive?**: ❌ NO - This is a real cross-platform bug affecting CI

---

#### 1.2 OpenAPI Schema Drift

**Location**: `ui/desktop/src/api/generated/`

**Known Issue**:
```
❌ Check OpenAPI Schema is Up-to-Date - FAILS
Schema out of sync with Rust backend API
```

**Investigation Steps**:
```bash
# Check what changed
cd G:\goose
just check-openapi-schema

# Regenerate schema
cd ui/desktop
npm run generate-api

# Review diff
git diff ui/desktop/src/api/generated/
```

**Real Issues to Look For**:
- Missing TypeScript types for new Rust endpoints
- Mismatched parameter types (Rust changed, TypeScript didn't)
- Removed endpoints still in generated code
- New endpoints not exposed to frontend

**Fix Strategy**:
```bash
# Always regenerate after Rust API changes
npm run generate-api
git add ui/desktop/src/api/generated/
git commit -m "fix(api): sync OpenAPI schema with Rust backend"
```

**False Positive?**: ❌ NO - Real type safety issue between frontend/backend

---

### Priority 2: Code Quality Issues (Fix Second)

#### 2.1 Clippy Warnings (Currently: 0 warnings ✅)

**Status**: ✅ CLEAN (21 warnings fixed in commit `aba74e2fa`)

**But Watch For**:
```rust
// Areas prone to new warnings:
crates/goose/src/agents/adversarial/     // Complex async code
crates/goose/src/agents/evolution/       // Memory management
crates/goose/src/agents/team/            // Handoff validation
crates/goose/src/quality/                // Validation logic
```

**Common Real Issues (Not False Positives)**:
```rust
// ❌ REAL: Unnecessary clones
let data = expensive_data.clone();  // Often unnecessary
process(data);
// Fix: Use reference if possible
process(&expensive_data);

// ❌ REAL: Large enum variants
enum Result {
    Success(HugeStruct),  // Triggers clippy::large_enum_variant
    Error(String),
}
// Fix: Box large variants
enum Result {
    Success(Box<HugeStruct>),
    Error(String),
}

// ❌ REAL: Needless borrowed reference
fn process(data: &&String) { }  // Double borrow
// Fix: Use single borrow
fn process(data: &String) { }
```

**False Positives to Ignore**:
```rust
// ✅ FALSE POSITIVE: clippy::too_many_lines (now disabled)
// Removed in upstream commit b18120bec
// Large functions are sometimes necessary for state machines

// ✅ FALSE POSITIVE: clippy::module_inception
pub mod team {
    pub mod team { }  // Acceptable for organization
}
```

**Fix Command**:
```bash
# Run Clippy with strict settings
cargo clippy --all-targets -- -D warnings

# Fix auto-fixable issues
cargo clippy --fix --allow-dirty

# Review remaining warnings manually
```

---

#### 2.2 TypeScript/ESLint Warnings (Currently: 0 warnings ✅)

**Status**: ✅ CLEAN (autoUpdater.ts fix in commit `76a950a8e`)

**But Watch For**:
```typescript
// ui/desktop/src/**/*.ts
// ui/desktop/src/**/*.tsx
```

**Common Real Issues**:
```typescript
// ❌ REAL: Unused imports
import { unused } from './module';  // ESLint will catch

// ❌ REAL: Any types
const data: any = fetchData();  // Defeats TypeScript purpose
// Fix: Use proper types
const data: UserData = fetchData();

// ❌ REAL: Missing null checks
const user = users[0];
console.log(user.name);  // May crash if users empty
// Fix: Check first
const user = users[0];
if (user) console.log(user.name);

// ❌ REAL: Async without await
async function fetch() {
    doAsyncThing();  // Missing await
}
// Fix: Add await
async function fetch() {
    await doAsyncThing();
}
```

**False Positives to Ignore**:
```typescript
// ✅ FALSE POSITIVE: React exhaustive-deps
useEffect(() => {
    // Complex logic where adding all deps causes infinite loop
}, [someDep]);  // ESLint warns, but adding more deps breaks it
// Solution: Add eslint-disable comment with explanation
```

**Fix Command**:
```bash
cd ui/desktop
npm run lint:check
npm run lint:fix  # Auto-fix where possible
npm run type-check
```

---

### Priority 3: Test Failures (Fix Third)

#### 3.1 Scenario Test Timeouts

**Location**: `crates/goose/tests/scenario_tests.rs`

**Known Issue**:
```
⚠️ Tests run for 45 minutes or timeout
```

**Investigation**:
```bash
# Run with detailed output
cd crates
cargo test scenario_tests --nocapture -- --test-threads=1

# Profile slow tests
cargo test scenario_tests -- --nocapture 2>&1 | grep "test result"
```

**Real Issues to Look For**:
- Network calls without timeout
- File I/O blocking indefinitely
- Infinite loops in retry logic
- Missing test timeouts

**Example Real Bug**:
```rust
// ❌ REAL: Infinite retry
while !success {
    attempt();  // Never breaks if always fails
}

// ✅ FIX: Add max attempts
let mut attempts = 0;
while !success && attempts < 10 {
    attempt();
    attempts += 1;
}
```

**Fix Strategy**:
```rust
// Add per-test timeouts
#[tokio::test]
#[timeout(5000)]  // 5 second timeout
async fn test_scenario() {
    // Test code
}

// Mock slow operations
#[cfg(test)]
async fn fetch_data() -> Data {
    MockData::instant()  // Don't hit real network
}
```

**False Positive?**: ❌ NO - Tests should never take 45 minutes

---

#### 3.2 Desktop App Tests

**Location**: `ui/desktop/tests/**/*.test.ts*`

**Current Status**: ✅ 19 test files passing

**Areas Needing More Tests**:
```typescript
// Low coverage areas:
ui/desktop/src/utils/        // Business logic
ui/desktop/src/components/   // React components
ui/desktop/src/recipe/       // Recipe validation
```

**Real Issues to Look For**:
```typescript
// ❌ REAL: Test only happy path
test('login works', () => {
    expect(login('user', 'pass')).toBe(true);
});
// Missing: What if user doesn't exist? Wrong password?

// ✅ FIX: Test error cases
test('login with wrong password fails', () => {
    expect(() => login('user', 'wrong')).toThrow();
});
```

---

### Priority 4: Memory & Performance Issues

#### 4.1 Java Heap Exhaustion (Development Environment)

**Location**: `.vscode/` or IDE settings

**Evidence**: 4 crash logs found (`hs_err_pid*.log`)

**Real Issue**:
```
Java OutOfMemoryError in Language Server
Heap space exhausted during indexing
```

**Fix**:
```json
// .vscode/settings.json
{
    "java.jdt.ls.vmargs": "-XX:+UseG1GC -XX:+UseStringDeduplication -Xmx4G"
}

// Or globally: ~/.config/Code/User/settings.json
```

**Prevention**:
```gitignore
# Add to .gitignore
hs_err_pid*.log
.metadata/
.vscode/
```

**False Positive?**: ❌ NO - Real development environment issue

---

#### 4.2 Large Context Memory Usage

**Location**:
```
crates/goose/src/agents/evolution/progressive_disclosure.rs
crates/goose/src/agents/evolution/memory_integration.rs
```

**Potential Issues**:
```rust
// Watch for unbounded growth
pub struct MemoryContext {
    pub successful_patterns: Vec<String>,  // Could grow large
    pub failed_patterns: Vec<String>,      // Could grow large
}

// Check for limits
impl MemoryRetrieval {
    pub async fn retrieve(&mut self, query: &ReflexionQuery) -> Result<MemoryContext> {
        // Does this limit results?
        let limit = query.limit;  // ✅ Good, has limit
    }
}
```

**Real Issues to Look For**:
- Unbounded Vec growth
- Cache never evicted
- Large strings duplicated
- No max size on HashMaps

**Fix Strategy**:
```rust
// Add bounded collections
use std::collections::VecDeque;

pub struct BoundedMemory {
    patterns: VecDeque<String>,
    max_size: usize,
}

impl BoundedMemory {
    pub fn add(&mut self, pattern: String) {
        if self.patterns.len() >= self.max_size {
            self.patterns.pop_front();  // Evict oldest
        }
        self.patterns.push_back(pattern);
    }
}
```

---

### Priority 5: Concurrency & Race Conditions

#### 5.1 Async/Await Issues

**Locations**:
```
crates/goose/src/agents/adversarial/review.rs
crates/goose/src/agents/team/coordinator.rs
crates/goose/src/agents/evolution/optimizer.rs
```

**Real Issues to Look For**:
```rust
// ❌ REAL: Missing await
async fn process() {
    fetch_data();  // Returns Future, never executed!
}

// ✅ FIX: Add await
async fn process() {
    fetch_data().await?;
}

// ❌ REAL: Blocking in async
async fn load_file() {
    std::fs::read_to_string("file.txt");  // Blocks thread!
}

// ✅ FIX: Use async I/O
async fn load_file() {
    tokio::fs::read_to_string("file.txt").await?;
}

// ❌ REAL: Not Send
async fn process(data: Rc<Data>) {  // Rc is not Send
    // Won't compile if spawned on tokio
}

// ✅ FIX: Use Arc
async fn process(data: Arc<Data>) {  // Arc is Send
    // Can spawn safely
}
```

**Detection**:
```bash
# Clippy catches many async issues
cargo clippy -- -W clippy::async_yields_async
cargo clippy -- -W clippy::unused_async
```

---

#### 5.2 Shared State Race Conditions

**Locations**:
```rust
crates/goose/src/agents/team/coordinator.rs:
pub struct TeamCoordinator {
    active_tasks: RwLock<HashMap<String, TeamTask>>,  // Shared state
    results: RwLock<Vec<TeamResult>>,                 // Shared state
}
```

**Real Issues to Look For**:
```rust
// ❌ REAL: Double lock (deadlock potential)
let tasks = self.active_tasks.write().await;
let results = self.results.write().await;  // Acquires 2 locks
// If another thread does reverse order → DEADLOCK

// ✅ FIX: Acquire in consistent order or use single lock
let mut state = self.state.write().await;
state.tasks.insert(...);
state.results.push(...);

// ❌ REAL: Read-modify-write race
let value = self.counter.read().await;
let new_value = *value + 1;
*self.counter.write().await = new_value;  // Race between read and write!

// ✅ FIX: Use atomic or hold write lock
let mut counter = self.counter.write().await;
*counter += 1;
```

**Detection**:
```bash
# Run tests with thread sanitizer (Linux/Mac only)
RUSTFLAGS="-Z sanitizer=thread" cargo +nightly test

# Windows: Run tests with --test-threads=1 to isolate races
cargo test -- --test-threads=1
```

---

## 🔍 Systematic Bug Hunting Checklist

### Step 1: Static Analysis (30 minutes)

```bash
# 1. Rust Clippy (strictest settings)
cargo clippy --all-targets --all-features -- -D warnings

# 2. TypeScript type checking
cd ui/desktop && npm run type-check

# 3. ESLint (zero warnings)
cd ui/desktop && npm run lint:check

# 4. Cargo check (compilation)
cargo check --all-targets

# 5. Unused dependencies
cargo install cargo-udeps
cargo +nightly udeps

# 6. Security audit
cargo audit
cd ui/desktop && npm audit
```

### Step 2: Test Execution (1 hour)

```bash
# 1. Run all Rust tests
cargo test --all

# 2. Run desktop tests
cd ui/desktop && npm run test:run

# 3. Run with coverage
cargo tarpaulin --out Html --output-dir coverage/

# 4. Check coverage gaps
open coverage/index.html
# Look for <60% coverage files - likely have bugs
```

### Step 3: Manual Code Review (2 hours)

**Focus Areas** (in order):

#### 3.1 Error Handling
```rust
// Search for unwrap/expect
rg "\.unwrap\(\)" --type rust
rg "\.expect\(" --type rust

// Check if justified (should be rare in production code)
// Replace with proper error handling
```

#### 3.2 TODO/FIXME Comments
```bash
# Find all TODOs
rg "TODO|FIXME" --type rust --type typescript

# Categorize:
# - Critical bugs: Fix immediately
# - Future enhancements: Move to GitHub issues
# - Old TODOs: Remove if done
```

#### 3.3 Unsafe Code
```bash
# Find all unsafe blocks
rg "unsafe" --type rust

# Verify each:
# - Is it necessary?
# - Is it sound?
# - Is it documented?
```

#### 3.4 Panic Paths
```bash
# Find potential panics
rg "panic!|unreachable!|unimplemented!" --type rust

# Check if reachable
# Replace with Result/Option where possible
```

### Step 4: Integration Testing (1 hour)

```bash
# 1. Build everything
cargo build --release
cd ui/desktop && npm run build

# 2. Run desktop app
npm run start

# 3. Manual testing checklist:
# - [ ] App launches without errors
# - [ ] All menu items work
# - [ ] No console errors
# - [ ] Settings persist
# - [ ] No crashes during normal use
# - [ ] File operations work
# - [ ] Network requests succeed
```

---

## 🧪 Comprehensive Testing Strategy for ZenCoder

### Testing Philosophy
**Goal**: 100% confidence in code correctness through multi-layered testing
**Approach**: Unit → Integration → E2E → Manual
**Coverage Target**: ≥80% code coverage for production code

---

### Layer 1: Unit Tests (Foundation)

#### 1.1 Rust Unit Tests

**What to Test**:
- Pure functions (input → output, no side effects)
- Business logic (RBAC checks, pattern matching, calculations)
- Error handling (all Result/Option paths)
- Edge cases (empty input, null, boundary values)

**Where to Add Tests**:
```rust
// Priority 1: Core logic with 14 test failures
crates/goose/src/agents/team/enforcer.rs          // ALMAS RBAC
crates/goose/src/agents/evolution/metrics.rs      // Evolution metrics
crates/goose/src/agents/adversarial/review.rs     // Adversarial stats

// Priority 2: Complex algorithms
crates/goose/src/agents/evolution/progressive_disclosure.rs
crates/goose/src/agents/team/coordinator.rs
crates/goose/src/quality/validator.rs

// Priority 3: Utilities
crates/goose/src/utils/
crates/goose-cli/src/
```

**Unit Test Template**:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_function_name_happy_path() {
        // Arrange
        let input = TestInput::new();

        // Act
        let result = function_name(input);

        // Assert
        assert_eq!(result, expected);
    }

    #[test]
    fn test_function_name_error_case() {
        // Arrange
        let invalid_input = TestInput::invalid();

        // Act
        let result = function_name(invalid_input);

        // Assert
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "Expected error");
    }

    #[test]
    fn test_function_name_edge_case_empty_input() {
        // Arrange
        let empty = TestInput::empty();

        // Act
        let result = function_name(empty);

        // Assert
        assert_eq!(result, default_value);
    }
}
```

**Example: ALMAS Enforcer Unit Test**:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_qa_role_cannot_execute() {
        // Arrange
        let enforcer = RoleEnforcer::new(Role::QA);
        let action = Action::Execute { command: "ls".into() };

        // Act
        let result = enforcer.validate_action(&action);

        // Assert
        assert!(!result.allowed, "QA role should NOT have execute permission");
        assert_eq!(result.reason, Some("QA role lacks can_execute capability"));
    }

    #[test]
    fn test_security_role_can_read() {
        // Arrange
        let enforcer = RoleEnforcer::new(Role::Security);
        let action = Action::Read { path: Path::new("src/main.rs") };

        // Act
        let result = enforcer.validate_action(&action);

        // Assert
        assert!(result.allowed, "Security role SHOULD have read permission");
        assert!(result.reason.is_none(), "Should allow without reason");
    }

    #[test]
    fn test_pattern_matching_blocked_takes_precedence() {
        // Arrange
        let mut config = RoleConfig::default();
        config.file_access.allowed_patterns.push("src/**/*.rs".into());
        config.file_access.blocked_patterns.push("src/secrets.rs".into());
        let enforcer = RoleEnforcer::with_config(Role::Developer, config);

        // Act
        let result = enforcer.check_file_access(Path::new("src/secrets.rs"));

        // Assert
        assert!(!result, "Blocked pattern should take precedence over allowed");
    }

    #[test]
    fn test_empty_allowed_list_allows_all_except_blocked() {
        // Arrange
        let mut config = RoleConfig::default();
        config.file_access.allowed_patterns.clear();  // Empty = allow all
        config.file_access.blocked_patterns.push("*.env".into());
        let enforcer = RoleEnforcer::with_config(Role::Developer, config);

        // Act
        let src_allowed = enforcer.check_file_access(Path::new("src/main.rs"));
        let env_blocked = enforcer.check_file_access(Path::new(".env"));

        // Assert
        assert!(src_allowed, "Empty allowed list should allow non-blocked files");
        assert!(!env_blocked, "Should still block .env files");
    }
}
```

**Run Unit Tests**:
```bash
# All tests
cargo test --lib

# Specific module
cargo test --lib -- agents::team::enforcer::tests

# With output
cargo test --lib -- agents::team::enforcer::tests --nocapture

# With coverage
cargo tarpaulin --lib --out Html
```

---

#### 1.2 TypeScript Unit Tests

**What to Test**:
- React component logic (props → rendering)
- Utility functions (formatters, validators, parsers)
- State management (reducers, hooks)
- API client methods
- Business logic in services

**Where to Add Tests**:
```typescript
// Priority 1: Low coverage areas
ui/desktop/src/utils/autoUpdater.ts        // Update logic
ui/desktop/src/utils/winShims.ts           // Windows shims
ui/desktop/src/recipe/validator.ts         // Recipe validation

// Priority 2: Critical components
ui/desktop/src/components/ChatMessage.tsx
ui/desktop/src/components/ToolkitConfig.tsx
ui/desktop/src/components/SettingsPanel.tsx

// Priority 3: API integration
ui/desktop/src/api/client.ts
ui/desktop/src/api/hooks.ts
```

**Unit Test Template**:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ComponentName } from './ComponentName'

describe('ComponentName', () => {
  it('renders with default props', () => {
    // Arrange
    const props = { /* default props */ }

    // Act
    render(<ComponentName {...props} />)

    // Assert
    expect(screen.getByText('Expected Text')).toBeInTheDocument()
  })

  it('handles user interaction', async () => {
    // Arrange
    const mockHandler = vi.fn()
    render(<ComponentName onAction={mockHandler} />)

    // Act
    await userEvent.click(screen.getByRole('button'))

    // Assert
    expect(mockHandler).toHaveBeenCalledWith(expected)
  })

  it('displays error state', () => {
    // Arrange
    const props = { error: 'Something went wrong' }

    // Act
    render(<ComponentName {...props} />)

    // Assert
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })
})
```

**Example: AutoUpdater Unit Test**:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { autoUpdater } from 'electron-updater'
import { setupAutoUpdater, checkForUpdates } from './autoUpdater'

vi.mock('electron-updater', () => ({
  autoUpdater: {
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn(),
    on: vi.fn(),
  }
}))

describe('AutoUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets up update feed URL', () => {
    // Arrange
    const feedURL = 'https://updates.example.com'

    // Act
    setupAutoUpdater(feedURL)

    // Assert
    expect(autoUpdater.setFeedURL).toHaveBeenCalledWith({ url: feedURL })
  })

  it('checks for updates when requested', async () => {
    // Arrange
    vi.mocked(autoUpdater.checkForUpdates).mockResolvedValue({
      updateInfo: { version: '1.2.0' }
    } as any)

    // Act
    const result = await checkForUpdates()

    // Assert
    expect(autoUpdater.checkForUpdates).toHaveBeenCalled()
    expect(result.version).toBe('1.2.0')
  })

  it('handles update check failure gracefully', async () => {
    // Arrange
    vi.mocked(autoUpdater.checkForUpdates).mockRejectedValue(
      new Error('Network error')
    )

    // Act & Assert
    await expect(checkForUpdates()).rejects.toThrow('Network error')
  })
})
```

**Run Unit Tests**:
```bash
cd ui/desktop

# All tests
npm run test:run

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage

# Specific file
npm run test:run -- autoUpdater.test.ts
```

---

### Layer 2: Integration Tests

#### 2.1 Rust Integration Tests

**What to Test**:
- Multi-component workflows (ALMAS coordinator → enforcer → roles)
- Database interactions (if applicable)
- File I/O operations
- API endpoint chains
- Async task coordination

**Where Tests Live**:
```
crates/goose/tests/           # Crate-level integration tests
crates/goose/src/agents/team/almas_integration_tests.rs
crates/goose/src/agents/adversarial/integration_tests.rs
crates/goose/src/agents/evolution/integration_tests.rs
```

**Integration Test Template**:
```rust
#[tokio::test]
async fn test_complete_workflow() {
    // Arrange: Set up full system
    let coordinator = TeamCoordinator::new();
    let task = TeamTask::new("Implement feature X");

    // Act: Run through complete workflow
    let result = coordinator
        .assign_task(task)
        .await?
        .execute()
        .await?
        .validate()
        .await?;

    // Assert: Verify end-to-end behavior
    assert!(result.is_success());
    assert_eq!(result.artifacts.len(), 3);
}
```

**Example: ALMAS Integration Test (FIXED)**:
```rust
#[tokio::test]
async fn test_role_capability_enforcement() {
    // Arrange: Create coordinator with all 5 roles
    let coordinator = TeamCoordinator::new();
    coordinator.add_role(Role::Architect).await?;
    coordinator.add_role(Role::Developer).await?;
    coordinator.add_role(Role::QA).await?;
    coordinator.add_role(Role::Security).await?;
    coordinator.add_role(Role::Deployer).await?;

    // Act: Developer writes code
    let write_result = coordinator
        .execute_as(Role::Developer, Action::Write {
            path: "src/main.rs".into(),
            content: "fn main() {}".into(),
        })
        .await?;

    // Assert: Developer can write
    assert!(write_result.allowed, "Developer should be able to write code");

    // Act: QA tries to execute
    let execute_result = coordinator
        .execute_as(Role::QA, Action::Execute {
            command: "cargo run".into(),
        })
        .await?;

    // Assert: QA cannot execute (THIS WAS FAILING)
    assert!(!execute_result.allowed, "QA should NOT be able to execute commands");
    assert!(
        execute_result.reason.is_some(),
        "Should provide reason for denial"
    );

    // Act: Security reads code
    let read_result = coordinator
        .execute_as(Role::Security, Action::Read {
            path: "src/main.rs".into(),
        })
        .await?;

    // Assert: Security can read (THIS WAS FAILING)
    assert!(read_result.allowed, "Security should be able to read files");

    // Act: Deployer tries to edit code
    let edit_result = coordinator
        .execute_as(Role::Deployer, Action::EditCode {
            path: "src/main.rs".into(),
            changes: "// comment".into(),
        })
        .await?;

    // Assert: Deployer cannot edit code
    assert!(!edit_result.allowed, "Deployer should NOT be able to edit code");
}
```

**Run Integration Tests**:
```bash
# All integration tests
cargo test --test '*'

# Specific test file
cargo test --test almas_integration

# With logging
RUST_LOG=debug cargo test --test almas_integration -- --nocapture
```

---

#### 2.2 TypeScript Integration Tests

**What to Test**:
- Multi-component interactions (parent → child communication)
- API client → backend integration
- State management flow (action → reducer → UI update)
- IPC (renderer ↔ main process)

**Example: API Integration Test**:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useGetSettings, useUpdateSettings } from './hooks'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

describe('Settings Integration', () => {
  it('fetches and updates settings', async () => {
    // Arrange
    const queryClient = new QueryClient()
    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )

    // Act: Fetch settings
    const { result: getResult } = renderHook(() => useGetSettings(), { wrapper })
    await waitFor(() => expect(getResult.current.isSuccess).toBe(true))
    const initialSettings = getResult.current.data

    // Act: Update settings
    const { result: updateResult } = renderHook(() => useUpdateSettings(), { wrapper })
    updateResult.current.mutate({ theme: 'dark' })
    await waitFor(() => expect(updateResult.current.isSuccess).toBe(true))

    // Assert: Settings updated
    expect(getResult.current.data.theme).toBe('dark')
  })
})
```

---

### Layer 3: End-to-End (E2E) Tests

#### 3.1 What E2E Tests Should Cover

**Critical User Journeys**:
1. **First Launch**: App opens → Onboarding → Settings configured
2. **Chat Session**: Send message → Receive response → Tool used → Result displayed
3. **Settings Management**: Open settings → Change provider → Save → Verify applied
4. **File Operations**: Open file → Edit → Save → Verify changes persisted
5. **Recipe Creation**: Create recipe → Add steps → Save → Execute recipe
6. **Update Flow**: Check for updates → Download → Install → Restart

**Where E2E Tests Live**:
```
ui/desktop/tests/e2e/
  ├── app.spec.ts           # App launch, basic UI
  ├── chat.spec.ts          # Chat functionality
  ├── settings.spec.ts      # Settings management
  └── recipe.spec.ts        # Recipe creation
```

---

#### 3.2 Playwright E2E Test Template

**Setup**:
```typescript
// tests/e2e/setup.ts
import { _electron as electron, ElectronApplication, Page } from 'playwright'
import { test as base } from '@playwright/test'

type TestFixtures = {
  electronApp: ElectronApplication
  page: Page
}

export const test = base.extend<TestFixtures>({
  electronApp: async ({}, use) => {
    const app = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    })
    await use(app)
    await app.close()
  },

  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await use(page)
  },
})

export { expect } from '@playwright/test'
```

**E2E Test Example: Chat Session**:
```typescript
import { test, expect } from './setup'

test.describe('Chat Session', () => {
  test('sends message and receives response', async ({ page }) => {
    // Arrange: Wait for app to load
    await expect(page.locator('[data-testid="chat-input"]')).toBeVisible()

    // Act: Send message
    await page.fill('[data-testid="chat-input"]', 'Hello, what is 2+2?')
    await page.click('[data-testid="send-button"]')

    // Assert: Message appears in chat
    await expect(page.locator('[data-testid="message-user"]').last())
      .toContainText('Hello, what is 2+2?')

    // Assert: Response received (wait up to 10 seconds)
    await expect(page.locator('[data-testid="message-assistant"]').last())
      .toContainText('4', { timeout: 10000 })
  })

  test('uses tool during response', async ({ page }) => {
    // Arrange
    await expect(page.locator('[data-testid="chat-input"]')).toBeVisible()

    // Act: Ask for file operation
    await page.fill('[data-testid="chat-input"]', 'Read the README.md file')
    await page.click('[data-testid="send-button"]')

    // Assert: Tool usage indicator appears
    await expect(page.locator('[data-testid="tool-usage"]'))
      .toContainText('read_file', { timeout: 10000 })

    // Assert: File content shown
    await expect(page.locator('[data-testid="message-assistant"]').last())
      .toContainText('README', { timeout: 15000 })
  })

  test('handles error gracefully', async ({ page }) => {
    // Arrange
    await expect(page.locator('[data-testid="chat-input"]')).toBeVisible()

    // Act: Trigger error (invalid request)
    await page.fill('[data-testid="chat-input"]', 'Read non-existent file: /fake/path')
    await page.click('[data-testid="send-button"]')

    // Assert: Error displayed
    await expect(page.locator('[data-testid="error-message"]'))
      .toBeVisible({ timeout: 10000 })
    await expect(page.locator('[data-testid="error-message"]'))
      .toContainText('file not found')
  })
})
```

**E2E Test Example: Settings Management**:
```typescript
import { test, expect } from './setup'

test.describe('Settings Management', () => {
  test('changes theme and persists', async ({ page }) => {
    // Act: Open settings
    await page.click('[data-testid="settings-button"]')
    await expect(page.locator('[data-testid="settings-panel"]')).toBeVisible()

    // Act: Change theme
    await page.selectOption('[data-testid="theme-select"]', 'dark')
    await page.click('[data-testid="save-settings"]')

    // Assert: Theme applied
    await expect(page.locator('body')).toHaveClass(/dark-theme/)

    // Act: Restart app (simulate)
    await page.reload()

    // Assert: Theme persisted
    await expect(page.locator('body')).toHaveClass(/dark-theme/)
  })

  test('changes LLM provider', async ({ page }) => {
    // Act: Open settings
    await page.click('[data-testid="settings-button"]')
    await expect(page.locator('[data-testid="settings-panel"]')).toBeVisible()

    // Act: Select different provider
    await page.selectOption('[data-testid="provider-select"]', 'anthropic')
    await page.fill('[data-testid="api-key-input"]', 'sk-test-key')
    await page.click('[data-testid="save-settings"]')

    // Assert: Provider changed
    await expect(page.locator('[data-testid="provider-label"]'))
      .toContainText('Anthropic')
  })
})
```

**E2E Test Example: First Launch Onboarding**:
```typescript
import { test, expect } from './setup'
import { existsSync, rmSync } from 'fs'
import { join } from 'path'

test.describe('First Launch', () => {
  test.beforeEach(async () => {
    // Clear settings to simulate first launch
    const settingsPath = join(process.env.APPDATA || '', 'super-goose', 'settings.json')
    if (existsSync(settingsPath)) {
      rmSync(settingsPath)
    }
  })

  test('shows onboarding on first launch', async ({ page }) => {
    // Assert: Onboarding modal visible
    await expect(page.locator('[data-testid="onboarding-modal"]')).toBeVisible()
    await expect(page.locator('h1')).toContainText('Welcome to Super-Goose')

    // Act: Go through onboarding steps
    await page.click('[data-testid="next-button"]')
    await expect(page.locator('h2')).toContainText('Choose Provider')

    await page.click('[data-testid="next-button"]')
    await expect(page.locator('h2')).toContainText('Configure API Key')

    // Act: Complete onboarding
    await page.fill('[data-testid="api-key-input"]', 'sk-test-key')
    await page.click('[data-testid="finish-button"]')

    // Assert: Onboarding dismissed, main UI visible
    await expect(page.locator('[data-testid="onboarding-modal"]')).not.toBeVisible()
    await expect(page.locator('[data-testid="chat-input"]')).toBeVisible()
  })
})
```

**Run E2E Tests**:
```bash
cd ui/desktop

# All E2E tests
npm run test:e2e

# Specific spec
npx playwright test tests/e2e/chat.spec.ts

# With UI (headed mode)
npx playwright test --headed

# Debug mode
npx playwright test --debug
```

---

#### 3.3 E2E Tests in CI

**Add to `.github/workflows/ci.yml`**:
```yaml
e2e-tests:
  runs-on: windows-latest
  if: github.repository == 'Ghenghis/Super-Goose'
  steps:
    - uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'

    - name: Install dependencies
      working-directory: ui/desktop
      run: npm ci

    - name: Install Playwright
      working-directory: ui/desktop
      run: npx playwright install --with-deps

    - name: Build app
      working-directory: ui/desktop
      run: npm run build

    - name: Run E2E tests
      working-directory: ui/desktop
      run: npm run test:e2e
      env:
        NODE_ENV: test

    - name: Upload test results
      if: failure()
      uses: actions/upload-artifact@v4
      with:
        name: playwright-results
        path: ui/desktop/test-results/
```

---

### Testing Strategy Summary for ZenCoder

| Test Type | What to Test | When to Run | Tools | Coverage Target |
|-----------|--------------|-------------|-------|-----------------|
| **Unit** | Pure functions, business logic, edge cases | Every commit | Rust: `cargo test`, TS: `vitest` | 80%+ |
| **Integration** | Multi-component workflows, API chains | Before PR | `cargo test --test`, `vitest` | 60%+ |
| **E2E** | Critical user journeys, full workflows | Before release | Playwright | 100% of journeys |
| **Manual** | UX, visual regression, exploratory | Weekly | Human | N/A |

**Priority for Current 14 Test Failures**:
1. **Fix failing unit/integration tests first** (ALMAS, Evolution, Adversarial)
2. **Add missing unit tests** for fixed code (prevent regressions)
3. **Add E2E tests** for fixed workflows (ensure UI works)
4. **Manual testing** to verify fixes in real usage

**ZenCoder Testing Checklist**:
```bash
# 1. Run all tests locally
cd G:\goose
cargo test --all                                    # Rust unit + integration
cd ui/desktop && npm run test:run                   # TypeScript unit
cd ui/desktop && npm run test:e2e                   # E2E tests

# 2. Check coverage
cargo tarpaulin --out Html                          # Rust coverage
cd ui/desktop && npm run test:coverage              # TypeScript coverage

# 3. Review coverage report
# Ensure all fixed bugs have ≥90% coverage
# Ensure critical paths have 100% coverage

# 4. Run CI locally (if possible)
gh act -W .github/workflows/ci.yml                  # GitHub Actions locally

# 5. Commit with test evidence
git add .
git commit -m "fix(almas): correct RBAC permission logic

Fixes 7 failing tests in enforcer.rs. Root cause was inverted
boolean logic in check_file_access().

Tests:
- test_qa_no_edit_permissions: PASS
- test_security_read_only: PASS
- test_developer_full_permissions: PASS
- test_deployer_no_code_edit: PASS
- test_batch_operations: PASS
- test_batch_operations_enforcement: PASS
- test_role_capability_enforcement: PASS

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 🎯 Achieving 100% Test Coverage & Passing

### Coverage Philosophy
**Target**: 100% line coverage for production code
**Reality**: 90-95% is excellent, 100% may include unreachable code
**Priority**: 100% coverage of critical paths (RBAC, security, data integrity)

---

### Step 1: Measure Current Coverage

```bash
# Rust coverage (HTML report)
cargo install cargo-tarpaulin
cargo tarpaulin --out Html --output-dir coverage/

# TypeScript coverage
cd ui/desktop
npm run test:coverage

# Open reports
open coverage/index.html                    # Rust
open ui/desktop/coverage/index.html         # TypeScript
```

**Analyze Coverage Report**:
- ❌ Red lines = Not tested (HIGH PRIORITY)
- 🟡 Yellow lines = Partially tested (MEDIUM PRIORITY)
- ✅ Green lines = Fully tested

**Focus on**:
1. Functions with 0% coverage (untested)
2. Branches with missing paths (if/else, match arms)
3. Error handling paths (Result::Err, panic paths)
4. Edge cases (empty input, boundary values)

---

### Step 2: Write Tests for Uncovered Code

#### 2.1 Find Uncovered Rust Code

```bash
# Generate coverage data
cargo tarpaulin --out Json

# Parse and find 0% coverage functions
jq '.files[] | select(.coverage < 100) | {file: .file, coverage: .coverage}' tarpaulin.json

# Or use lcov format for detailed analysis
cargo tarpaulin --out Lcov
genhtml tarpaulin.lcov -o coverage/
```

**Example: Covering Uncovered Branch**:
```rust
// Original function (50% coverage - error path not tested)
pub fn divide(a: f64, b: f64) -> Result<f64, String> {
    if b == 0.0 {
        Err("Division by zero".to_string())  // ❌ NOT TESTED
    } else {
        Ok(a / b)  // ✅ TESTED
    }
}

// Add test for error path
#[test]
fn test_divide_by_zero_returns_error() {
    let result = divide(10.0, 0.0);
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), "Division by zero");
}
// Now 100% coverage ✅
```

---

#### 2.2 Find Uncovered TypeScript Code

```bash
cd ui/desktop

# Generate coverage with detailed info
npm run test:coverage -- --coverage.reporter=text --coverage.reporter=html

# View uncovered lines
npm run test:coverage -- --coverage.reporter=text | grep -A 10 "Uncovered Line"
```

**Example: Covering Error Handler**:
```typescript
// Original function (66% coverage - error path not tested)
async function fetchUser(id: string): Promise<User> {
  try {
    const response = await api.get(`/users/${id}`)  // ✅ TESTED
    return response.data  // ✅ TESTED
  } catch (error) {
    throw new Error(`Failed to fetch user: ${error.message}`)  // ❌ NOT TESTED
  }
}

// Add test for error path
it('throws error when API fails', async () => {
  vi.mocked(api.get).mockRejectedValue(new Error('Network error'))
  await expect(fetchUser('123')).rejects.toThrow('Failed to fetch user: Network error')
})
// Now 100% coverage ✅
```

---

### Step 3: Test All Match Arms / Switch Cases

```rust
// ❌ Incomplete test (only 1 of 5 roles tested)
#[test]
fn test_role_capabilities() {
    let dev = RoleCapabilities::for_role(Role::Developer);
    assert!(dev.can_edit_code);
}

// ✅ Complete test (all 5 roles tested)
#[test]
fn test_role_capabilities_all_roles() {
    // Architect
    let architect = RoleCapabilities::for_role(Role::Architect);
    assert!(architect.can_read);
    assert!(!architect.can_execute);

    // Developer
    let developer = RoleCapabilities::for_role(Role::Developer);
    assert!(developer.can_read);
    assert!(developer.can_write);
    assert!(developer.can_edit_code);

    // QA
    let qa = RoleCapabilities::for_role(Role::QA);
    assert!(qa.can_read);
    assert!(!qa.can_execute);
    assert!(!qa.can_edit_code);

    // Security
    let security = RoleCapabilities::for_role(Role::Security);
    assert!(security.can_read);
    assert!(!security.can_write);
    assert!(!security.can_execute);

    // Deployer
    let deployer = RoleCapabilities::for_role(Role::Deployer);
    assert!(deployer.can_execute);
    assert!(!deployer.can_edit_code);
}
```

---

### Step 4: Parameterized Tests (Test Multiple Inputs)

```rust
// Instead of writing 10 separate tests
#[rstest]
#[case("", false)]                      // Empty
#[case("a", false)]                     // Too short
#[case("short", false)]                 // Still too short
#[case("goodpassword", true)]           // Valid
#[case("verylongpassword123", true)]    // Long but valid
#[case("has spaces", false)]            // Invalid chars
#[case("unicode🔥", false)]              // Unicode
#[case("MixedCase123", true)]           // Mixed case valid
#[case("with\nnewline", false)]         // Newline invalid
#[case("exactlyeight", true)]           // Boundary (8 chars)
fn test_password_validation(#[case] password: &str, #[case] expected: bool) {
    assert_eq!(is_valid_password(password), expected);
}
```

**TypeScript Equivalent**:
```typescript
it.each([
  ['', false],                      // Empty
  ['a', false],                     // Too short
  ['goodpassword', true],           // Valid
  ['has spaces', false],            // Invalid
  ['unicode🔥', false],              // Unicode
])('validates password: %s → %s', (password, expected) => {
  expect(isValidPassword(password)).toBe(expected)
})
```

---

### Step 5: Ensure All Tests Pass

```bash
# Rust: Run all tests, fail on first error
cargo test --all -- --nocapture

# If any test fails, stop and fix immediately
# Don't continue until: cargo test --all → 0 failures

# TypeScript: Run all tests, no skipping
cd ui/desktop
npm run test:run

# Ensure: Tests: 100% passing, 0 failed, 0 skipped
```

**Fix Test Failures Systematically**:
1. Run failing test in isolation: `cargo test test_name -- --nocapture`
2. Add debug logging: `dbg!()` or `println!()` to see values
3. Fix the bug or fix the test (test may be wrong)
4. Re-run full suite to ensure no regressions
5. Commit fix with evidence: "All 1325 tests passing"

---

### Step 6: CI Must Pass 100%

```bash
# Simulate CI environment locally
gh act -W .github/workflows/ci.yml

# Or push and monitor
git push origin main
gh run watch

# CI must show:
# ✅ Lint Rust Code: PASSING
# ✅ Build and Test Rust Project: PASSING (1325/1325 tests)
# ✅ Test and Lint Electron Desktop App: PASSING (100% pass rate)
# ✅ Check Rust Code Format: PASSING
# ✅ Check OpenAPI Schema: PASSING
```

---

## 🛡️ Multi-Layered Audit Testing (Beyond Unit/Integration/E2E)

### Layer 4: Security Testing

#### 4.1 Security Audit Tests

**What to Test**:
- Input validation (SQL injection, XSS, command injection)
- Authentication & authorization (RBAC, permission checks)
- Secrets management (no hardcoded keys, env vars)
- File access (path traversal, directory escapes)

**Security Test Template**:
```rust
#[test]
fn test_path_traversal_blocked() {
    // Arrange: Attempt directory traversal
    let malicious_path = "../../../etc/passwd";
    let enforcer = RoleEnforcer::new(Role::Developer);

    // Act
    let result = enforcer.check_file_access(Path::new(malicious_path));

    // Assert: Should be blocked
    assert!(!result, "Path traversal should be blocked");
}

#[test]
fn test_command_injection_prevented() {
    // Arrange: Attempt command injection
    let malicious_command = "ls; rm -rf /";
    let executor = CommandExecutor::new();

    // Act & Assert: Should validate and reject
    let result = executor.validate_command(malicious_command);
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("Invalid characters"));
}

#[test]
fn test_no_secrets_in_logs() {
    // Arrange
    let api_key = "sk-secret-key-12345";
    let logger = setup_test_logger();

    // Act: Log something with secret
    log::info!("API call with key: {}", api_key);

    // Assert: Secret should be redacted
    let logs = logger.get_logs();
    assert!(!logs.contains("sk-secret-key-12345"));
    assert!(logs.contains("sk-***"));  // Redacted
}

#[test]
fn test_rbac_privilege_escalation_prevented() {
    // Arrange: QA role tries to grant itself developer permissions
    let coordinator = TeamCoordinator::new();
    coordinator.add_role(Role::QA).await?;

    // Act: QA tries to escalate privileges
    let result = coordinator
        .execute_as(Role::QA, Action::GrantPermission {
            target_role: Role::QA,
            permission: Permission::EditCode,
        })
        .await;

    // Assert: Should be denied
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("Insufficient privileges"));
}
```

**Run Security Tests**:
```bash
# Run all security-tagged tests
cargo test security -- --nocapture

# Security audit tools
cargo install cargo-audit
cargo audit

# Check for unsafe code
cargo geiger
```

---

#### 4.2 Authentication & Authorization Tests

```rust
#[tokio::test]
async fn test_unauthenticated_request_blocked() {
    let app = spawn_test_app().await;
    let client = reqwest::Client::new();

    // Act: Try to access protected endpoint without auth
    let response = client
        .get(format!("{}/api/protected", app.address))
        .send()
        .await?;

    // Assert: 401 Unauthorized
    assert_eq!(response.status(), 401);
}

#[tokio::test]
async fn test_expired_token_rejected() {
    let app = spawn_test_app().await;
    let expired_token = generate_expired_jwt();

    // Act: Use expired token
    let response = client
        .get(format!("{}/api/protected", app.address))
        .header("Authorization", format!("Bearer {}", expired_token))
        .send()
        .await?;

    // Assert: 401 Unauthorized
    assert_eq!(response.status(), 401);
    assert!(response.text().await?.contains("Token expired"));
}
```

---

### Layer 5: Performance Testing

#### 5.1 Performance Benchmarks

**What to Test**:
- Response time (API calls, function execution)
- Memory usage (no leaks, bounded growth)
- Throughput (requests per second)
- Latency (p50, p95, p99)

**Benchmark Template (Rust)**:
```rust
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn benchmark_pattern_matching(c: &mut Criterion) {
    let enforcer = RoleEnforcer::new(Role::Developer);
    let path = Path::new("src/main.rs");

    c.bench_function("check_file_access", |b| {
        b.iter(|| {
            enforcer.check_file_access(black_box(path))
        })
    });
}

criterion_group!(benches, benchmark_pattern_matching);
criterion_main!(benches);
```

**Run Benchmarks**:
```bash
# Rust benchmarks
cargo bench

# Performance regression check
cargo bench --bench pattern_matching -- --baseline main

# Generate flamegraph
cargo flamegraph --bench pattern_matching
```

**Performance Test (Integration)**:
```rust
#[tokio::test]
async fn test_api_response_time_under_100ms() {
    let start = Instant::now();

    // Act: Call API
    let response = api_client.get_settings().await?;

    // Assert: Response time < 100ms
    let duration = start.elapsed();
    assert!(duration < Duration::from_millis(100),
            "API took {:?}, expected < 100ms", duration);
}

#[tokio::test]
async fn test_memory_usage_bounded() {
    let initial_memory = get_process_memory();

    // Act: Process 1000 items
    for i in 0..1000 {
        process_item(i).await?;
    }

    // Assert: Memory growth < 10MB
    let final_memory = get_process_memory();
    let growth = final_memory - initial_memory;
    assert!(growth < 10_000_000, "Memory grew by {} bytes", growth);
}
```

---

### Layer 6: Chaos Testing (Fault Injection)

#### 6.1 What is Chaos Testing?
Deliberately inject failures to test resilience:
- Network failures (timeout, connection refused)
- Disk failures (full disk, I/O errors)
- Memory pressure (OOM conditions)
- CPU throttling
- Clock skew

**Chaos Test Template**:
```rust
#[tokio::test]
async fn test_network_failure_handled_gracefully() {
    // Arrange: Mock network that fails randomly
    let mut mock_api = MockApi::new();
    mock_api.fail_rate(0.5);  // 50% failure rate

    // Act: Retry until success
    let mut attempts = 0;
    let result = loop {
        attempts += 1;
        match api_call_with_retry(&mock_api).await {
            Ok(data) => break Ok(data),
            Err(_) if attempts < 5 => continue,
            Err(e) => break Err(e),
        }
    };

    // Assert: Eventually succeeds (resilient to failures)
    assert!(result.is_ok(), "Should succeed despite network failures");
    assert!(attempts > 1, "Should have retried at least once");
}

#[test]
fn test_full_disk_handled() {
    // Arrange: Mock filesystem that returns "disk full"
    let mock_fs = MockFilesystem::new().with_error(ErrorKind::StorageFull);

    // Act: Try to save file
    let result = save_file(&mock_fs, "test.txt", "content");

    // Assert: Returns graceful error
    assert!(result.is_err());
    assert!(matches!(result.unwrap_err(), Error::DiskFull(_)));
}
```

---

### Layer 7: Property-Based Testing (Fuzzing Inputs)

#### 7.1 What is Property-Based Testing?
Generate random inputs and verify properties always hold.

**Property-Based Test Template (using `proptest`)**:
```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn test_role_capabilities_never_grant_all_permissions(
        role in prop::sample::select(vec![
            Role::Architect,
            Role::Developer,
            Role::QA,
            Role::Security,
            Role::Deployer,
        ])
    ) {
        let caps = RoleCapabilities::for_role(role);

        // Property: No role should have ALL 7 permissions
        let total_perms = [
            caps.can_read,
            caps.can_write,
            caps.can_execute,
            caps.can_edit_code,
            caps.can_delete,
            caps.can_create_dirs,
            caps.can_search,
        ].iter().filter(|&&p| p).count();

        prop_assert!(total_perms < 7, "No role should have all permissions");
    }

    #[test]
    fn test_pattern_matching_never_panics(
        pattern in ".*",  // Random regex
        path in "(/[a-z]+)+\\.[a-z]{2,4}"  // Random file path
    ) {
        let result = std::panic::catch_unwind(|| {
            check_pattern_match(&pattern, &path)
        });

        // Property: Should never panic, even with invalid input
        prop_assert!(result.is_ok(), "Pattern matching panicked");
    }

    #[test]
    fn test_running_average_always_between_min_and_max(
        values in prop::collection::vec(0.0f32..1.0f32, 1..100)
    ) {
        let mut metrics = Metrics::new();

        let min = values.iter().cloned().fold(f32::INFINITY, f32::min);
        let max = values.iter().cloned().fold(f32::NEG_INFINITY, f32::max);

        for value in values {
            metrics.record_quality(value);
        }

        // Property: Average must be between min and max
        let avg = metrics.avg_quality;
        prop_assert!(avg >= min && avg <= max,
                     "Average {} not in range [{}, {}]", avg, min, max);
    }
}
```

---

### Layer 8: Mutation Testing (Test the Tests)

#### 8.1 What is Mutation Testing?
Modify production code (introduce bugs) and verify tests catch them.

**Example**:
```rust
// Original code
pub fn calculate_discount(price: f64, percent: f64) -> f64 {
    price * (1.0 - percent / 100.0)
}

// Mutation 1: Change operator
pub fn calculate_discount(price: f64, percent: f64) -> f64 {
    price * (1.0 + percent / 100.0)  // ❌ Mutant (should fail tests)
}

// Mutation 2: Change constant
pub fn calculate_discount(price: f64, percent: f64) -> f64 {
    price * (1.0 - percent / 10.0)  // ❌ Mutant (should fail tests)
}
```

**Run Mutation Testing**:
```bash
# Install cargo-mutants
cargo install cargo-mutants

# Run mutation tests
cargo mutants

# Output shows:
# - Caught mutants (tests failed when code mutated) ✅
# - Missed mutants (tests passed despite mutation) ❌
# - Mutation score (% of mutants caught)
```

**Goal**: 90%+ mutation score (90% of code changes cause tests to fail)

---

### Layer 9: Concurrency Testing (Race Condition Detection)

#### 9.1 Test Concurrent Operations

```rust
#[tokio::test(flavor = "multi_thread", worker_threads = 10)]
async fn test_concurrent_task_assignments_no_race() {
    let coordinator = Arc::new(TeamCoordinator::new());

    // Arrange: 100 tasks assigned concurrently
    let mut handles = vec![];
    for i in 0..100 {
        let coord = coordinator.clone();
        handles.push(tokio::spawn(async move {
            coord.assign_task(TeamTask::new(format!("Task {}", i))).await
        }));
    }

    // Act: Wait for all
    let results: Vec<_> = futures::future::join_all(handles).await;

    // Assert: All tasks assigned, no duplicates
    let task_ids: Vec<_> = results.iter().filter_map(|r| r.as_ref().ok()).collect();
    assert_eq!(task_ids.len(), 100);
    assert_eq!(task_ids.iter().collect::<HashSet<_>>().len(), 100);  // No duplicates
}

#[test]
fn test_shared_state_thread_safe() {
    let counter = Arc::new(AtomicUsize::new(0));
    let mut handles = vec![];

    // Spawn 10 threads incrementing counter
    for _ in 0..10 {
        let c = counter.clone();
        handles.push(std::thread::spawn(move || {
            for _ in 0..1000 {
                c.fetch_add(1, Ordering::SeqCst);
            }
        }));
    }

    for h in handles {
        h.join().unwrap();
    }

    // Assert: Final count correct (no race condition)
    assert_eq!(counter.load(Ordering::SeqCst), 10_000);
}
```

---

### Layer 10: Fuzz Testing (Random Data Generation)

#### 10.1 What is Fuzz Testing?
Generate completely random data (not just property-based) to find crashes.

**Setup Fuzz Testing**:
```bash
# Install cargo-fuzz
cargo install cargo-fuzz

# Initialize fuzz target
cargo fuzz init

# Create fuzz target: fuzz/fuzz_targets/pattern_matcher.rs
```

**Fuzz Target Example**:
```rust
#![no_main]
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    // Convert random bytes to string
    if let Ok(pattern) = std::str::from_utf8(data) {
        // Test pattern matching doesn't panic
        let _ = std::panic::catch_unwind(|| {
            check_pattern_match(pattern, "test/file.rs");
        });
    }
});
```

**Run Fuzz Tests**:
```bash
# Run fuzzer (will run indefinitely until crash found)
cargo fuzz run pattern_matcher

# Run for 60 seconds
cargo fuzz run pattern_matcher -- -max_total_time=60

# Analyze crashes
cargo fuzz cmin pattern_matcher  # Minimize crashing inputs
```

---

### Layer 11: Smoke Testing (Critical Paths Only)

#### 11.1 Smoke Test Suite

**What is Smoke Testing?**
Quick tests (< 1 minute) that verify critical functionality works.

**Smoke Test Examples**:
```bash
#!/bin/bash
# smoke_tests.sh

set -e  # Exit on first failure

echo "🔥 Running smoke tests..."

# 1. App launches
timeout 10s cargo run --bin goose -- --version || exit 1
echo "✅ CLI launches"

# 2. Desktop app builds
cd ui/desktop && npm run build || exit 1
echo "✅ Desktop builds"

# 3. API endpoints respond
curl -f http://localhost:3000/health || exit 1
echo "✅ API responds"

# 4. Database connects
cargo run --bin goose -- db-test || exit 1
echo "✅ Database connects"

echo "🎉 All smoke tests passed"
```

---

### Complete Testing Pyramid

```
                    Manual Exploratory
                   /                  \
                 E2E Tests (10 tests)
               /                        \
           Integration Tests (50 tests)
          /                              \
      Unit Tests (1000+ tests)
     /                                    \
-------------------------------------------
  Static Analysis (Clippy, ESLint, TypeCheck)
```

**Additional Layers**:
```
Security Tests          → Layer 4
Performance Tests       → Layer 5
Chaos Tests            → Layer 6
Property-Based Tests   → Layer 7
Mutation Tests         → Layer 8
Concurrency Tests      → Layer 9
Fuzz Tests             → Layer 10
Smoke Tests            → Layer 11
```

---

### ZenCoder Multi-Layered Testing Checklist

```bash
# ✅ Layer 1: Unit Tests
cargo test --lib && cd ui/desktop && npm run test:run

# ✅ Layer 2: Integration Tests
cargo test --test '*'

# ✅ Layer 3: E2E Tests
cd ui/desktop && npm run test:e2e

# ✅ Layer 4: Security Tests
cargo test security && cargo audit

# ✅ Layer 5: Performance Tests
cargo bench && cargo flamegraph

# ✅ Layer 6: Chaos Tests
cargo test chaos -- --nocapture

# ✅ Layer 7: Property-Based Tests
cargo test proptest

# ✅ Layer 8: Mutation Tests
cargo mutants --timeout 60

# ✅ Layer 9: Concurrency Tests
RUSTFLAGS="-Z sanitizer=thread" cargo +nightly test

# ✅ Layer 10: Fuzz Tests
cargo fuzz run --timeout=60

# ✅ Layer 11: Smoke Tests
./smoke_tests.sh
```

**Final Validation**:
```bash
# All tests must pass
cargo test --all          # 100% pass rate
cd ui/desktop && npm run test:run  # 100% pass rate

# Coverage must be high
cargo tarpaulin           # ≥90% coverage
cd ui/desktop && npm run test:coverage  # ≥80% coverage

# CI must be green
gh run watch              # All jobs passing
```

---

## 🚫 Known False Positives (IGNORE THESE)

### False Positive #1: `clippy::too_many_lines`

**Status**: ✅ DISABLED (upstream commit b18120bec)

```rust
// This warning is disabled project-wide
// Large functions are acceptable for:
// - State machines
// - Complex business logic
// - Generated code
```

**Action**: Ignore. Do not split functions just to satisfy line count.

---

### False Positive #2: SonarQube Artifacts

**Status**: ✅ CLEANED (commit `68a39bb47`)

```bash
# These are temporary analysis files
.scannerwork/
```

**Action**: Already in .gitignore. Ignore if they appear locally.

---

### False Positive #3: Windows CI Node.js Warnings

**Example**:
```
npm WARN deprecated babel-eslint@10.1.0
npm WARN deprecated @babel/plugin-proposal-private-methods@7.18.6
```

**Why False Positive**: Transitive dependencies from Electron Forge, not our code.

**Action**: Monitor for HIGH/CRITICAL security vulnerabilities only. INFO/LOW are acceptable for dev dependencies.

---

### False Positive #4: Platform-Specific Test Timeouts

**Example**:
```
Test scenario_tests::comprehensive timed out on CI (45 min)
But passes locally (2 min)
```

**Why False Positive**: CI has slower I/O, network latency, and limited parallelism.

**Action**: Don't optimize tests that pass locally. Instead, increase CI timeout or mock external dependencies.

---

### False Positive #5: Dependabot Alerts (Low Severity)

**Current**: 8 vulnerabilities (3 high, 2 moderate, 3 low)

**Why Some Are False Positives**:
- **Dev dependencies only**: Not shipped to users
- **Unreachable code paths**: Vulnerable function not called
- **Requires specific conditions**: Attack vector doesn't apply

**Action**:
- Fix HIGH/CRITICAL immediately
- Evaluate MODERATE (fix if exposed to users)
- Ignore LOW in dev dependencies

---

## 🐛 Real Bugs Found (Examples)

### Real Bug #1: TypeScript autoUpdater Type Error ✅ FIXED

**Location**: `ui/desktop/src/utils/autoUpdater.ts`

**Issue**: Type mismatch causing compilation error

**Fix**: Commit `76a950a8e` - Type annotation corrected

---

### Real Bug #2: 21 Clippy Warnings ✅ FIXED

**Locations**: Various files in `crates/goose/src/agents/`

**Issues**:
- Unnecessary clones
- Large enum variants not boxed
- Needless borrowed references
- Map-flatten anti-patterns

**Fix**: Commit `aba74e2fa` - All warnings resolved

---

### Real Bug #3: Platform Line Ending Inconsistency ⚠️ NEEDS FIX

**Location**: Rust source files

**Issue**: cargo fmt passes on Windows, fails on Linux CI

**Root Cause**: Missing .gitattributes configuration

**Fix Needed**:
```bash
# Add .gitattributes
*.rs text eol=lf
*.toml text eol=lf
*.json text eol=lf
*.md text eol=lf

# Normalize existing files
git add --renormalize .
git commit -m "fix: enforce LF line endings"
```

---

## 📋 Bug Fixing Workflow

### For Each Bug Found:

1. **Reproduce**: Can you trigger it reliably?
2. **Isolate**: Write a failing test case
3. **Root Cause**: Use debugger/logs to find why
4. **Fix**: Implement the smallest fix possible
5. **Test**: Verify fix with test
6. **Verify**: Check no regressions
7. **Commit**: Professional commit message

**Commit Message Template**:
```bash
git commit -m "fix(component): brief description of bug

Detailed explanation:
- What was wrong
- Why it happened
- How the fix works

Fixes: #issue-number (if applicable)
Tests: test_name() now passes

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 🎯 Success Criteria

**Zero Errors Goal**:
- ✅ cargo check: 0 compilation errors
- ✅ cargo clippy: 0 warnings
- ✅ cargo test: 100% pass rate
- ✅ npm run type-check: 0 errors
- ✅ npm run lint:check: 0 warnings
- ✅ npm run test:run: 100% pass rate

**Minimal Warnings Goal**:
- ⚠️ <5 low-severity Dependabot alerts
- ⚠️ <3 Clippy pedantic warnings (if enabled)
- ⚠️ <5 TypeScript strict mode warnings (if enabled)

**Bug-Free Goal**:
- ✅ No crashes during normal use
- ✅ No data loss
- ✅ No race conditions
- ✅ No memory leaks
- ✅ No deadlocks
- ✅ All features work as documented

---

## 🛠️ Tools for Bug Hunting

### Rust Tools

```bash
# Static analysis
cargo clippy --all-targets -- -D warnings

# Find unsafe code
cargo-geiger

# Detect unused dependencies
cargo-udeps

# Security audit
cargo audit

# Memory safety (valgrind)
valgrind --leak-check=full ./target/debug/binary

# Thread safety (Linux/Mac)
RUSTFLAGS="-Z sanitizer=thread" cargo +nightly test
```

### TypeScript Tools

```bash
cd ui/desktop

# Type checking
npm run type-check

# Linting
npm run lint:check

# Find unused exports
npx ts-prune

# Bundle analysis
npm run build && npx webpack-bundle-analyzer dist/stats.json
```

### General Tools

```bash
# Search for patterns
rg "TODO|FIXME|XXX|HACK" --type rust --type typescript

# Find large files (potential issues)
find . -type f -size +1M

# Dead code detection
cargo install cargo-deadlinks
cargo deadlinks

# Complexity analysis
cargo install cargo-geiger
cargo geiger --all-features
```

---

## 📞 When to Ask for Help

**Ask ZenCoder if**:
- Bug requires architectural changes
- Unsure if behavior is a bug or feature
- Fix might break backward compatibility
- Need to add new dependencies
- Testing strategy unclear

**Don't ask for**:
- Typos (just fix)
- Formatting issues (run cargo fmt/prettier)
- Obvious compilation errors (read error message)
- Simple logic bugs (debug yourself first)

---

## 📚 Additional Resources

**Rust Resources**:
- [Clippy Lints](https://rust-lang.github.io/rust-clippy/master/)
- [Rustc Error Index](https://doc.rust-lang.org/error-index.html)
- [Async Book](https://rust-lang.github.io/async-book/)

**TypeScript Resources**:
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [ESLint Rules](https://eslint.org/docs/latest/rules/)
- [React Hooks Rules](https://react.dev/reference/react/hooks#rules-of-hooks)

**Testing Resources**:
- [Rust Testing](https://doc.rust-lang.org/book/ch11-00-testing.html)
- [Tokio Testing](https://tokio.rs/tokio/topics/testing)
- [Vitest Guide](https://vitest.dev/guide/)

---

---

## 📊 Detailed Logging for Maximum Debugging Efficiency

### Logging Philosophy for Bug Fixing
**Goal**: Every error should provide enough context to fix it without reproducing
**Principle**: Log at decision points, state transitions, and error boundaries
**Standard**: Include input values, output values, timing, and context

---

### Rust Logging Best Practices

#### 1.1 Log Levels (Use Correctly)

```rust
use tracing::{trace, debug, info, warn, error};

// ❌ WRONG: Everything at INFO level
info!("Function called");
info!("Result: {:?}", result);
info!("Error occurred");

// ✅ CORRECT: Use appropriate levels
pub async fn process_task(task: &TeamTask) -> Result<TaskResult> {
    // TRACE: Very detailed, for deep debugging only
    trace!("Entering process_task with task_id={}", task.id);

    // DEBUG: Helpful for development, not production
    debug!("Task details: {:?}", task);

    // INFO: Important business events
    info!(
        task_id = %task.id,
        role = ?task.assigned_role,
        "Starting task processing"
    );

    match execute_task(task).await {
        Ok(result) => {
            // INFO: Successful completion
            info!(
                task_id = %task.id,
                duration_ms = result.duration.as_millis(),
                artifacts = result.artifacts.len(),
                "Task completed successfully"
            );
            Ok(result)
        }
        Err(e) => {
            // ERROR: Something went wrong (always log errors)
            error!(
                task_id = %task.id,
                role = ?task.assigned_role,
                error = %e,
                context = ?task.context,
                "Task execution failed"
            );
            Err(e)
        }
    }
}
```

---

#### 1.2 Structured Logging (Key-Value Pairs)

```rust
// ❌ WRONG: Unstructured string
error!("Failed to check file access for /src/main.rs by QA role");

// ✅ CORRECT: Structured with key-value pairs
error!(
    file = %path.display(),
    role = ?role,
    reason = %reason,
    allowed_patterns = ?config.allowed_patterns,
    blocked_patterns = ?config.blocked_patterns,
    "File access denied"
);

// Benefits:
// - Easily parseable (JSON logs)
// - Searchable in log aggregators
// - Clear context for debugging
```

---

#### 1.3 Log All Error Paths with Full Context

```rust
pub fn check_file_access(&self, path: &Path) -> bool {
    let path_str = path.to_string_lossy();

    // Log entry point
    debug!(
        path = %path_str,
        role = ?self.role,
        "Checking file access"
    );

    // Step 1: Check blocked patterns
    for pattern_str in &self.role_config.file_access.blocked_patterns {
        if let Ok(pattern) = Pattern::new(pattern_str) {
            if pattern.matches(&path_str) {
                // ❌ ERROR PATH: Log why access denied
                warn!(
                    path = %path_str,
                    role = ?self.role,
                    matched_pattern = %pattern_str,
                    pattern_type = "blocked",
                    "File access blocked by pattern match"
                );
                return false;  // DENIED
            }
        } else {
            // ❌ ERROR PATH: Invalid pattern
            error!(
                pattern = %pattern_str,
                role = ?self.role,
                error = "Invalid glob pattern",
                "Skipping malformed blocked pattern"
            );
        }
    }

    // Step 2: Check allowed patterns
    if self.role_config.file_access.allowed_patterns.is_empty() {
        // ✅ HAPPY PATH: No whitelist = allow all (except blocked)
        debug!(
            path = %path_str,
            role = ?self.role,
            "File access allowed (empty whitelist)"
        );
        return true;  // ALLOWED
    }

    // Step 3: Check if path matches any allowed pattern
    for pattern_str in &self.role_config.file_access.allowed_patterns {
        if let Ok(pattern) = Pattern::new(pattern_str) {
            if pattern.matches(&path_str) {
                // ✅ HAPPY PATH: Matched allowed pattern
                info!(
                    path = %path_str,
                    role = ?self.role,
                    matched_pattern = %pattern_str,
                    pattern_type = "allowed",
                    "File access granted by pattern match"
                );
                return true;  // ALLOWED
            }
        }
    }

    // ❌ ERROR PATH: No allowed pattern matched
    warn!(
        path = %path_str,
        role = ?self.role,
        allowed_patterns = ?self.role_config.file_access.allowed_patterns,
        "File access denied (no matching allowed pattern)"
    );
    false  // DENIED
}
```

**What This Logging Achieves**:
- ✅ Every return path is logged
- ✅ Can trace exact decision logic from logs
- ✅ Input (path, role) and output (true/false) always visible
- ✅ Can diagnose test failures without reproducing

---

#### 1.4 Log State Transitions

```rust
pub async fn assign_task(&mut self, task: TeamTask) -> Result<TaskId> {
    let task_id = task.id.clone();

    info!(
        task_id = %task_id,
        state = "pending",
        "Task created"
    );

    // State: pending → assigning
    info!(
        task_id = %task_id,
        state = "assigning",
        available_roles = self.available_roles().len(),
        "Finding suitable role for task"
    );

    let role = self.select_role_for_task(&task)?;

    // State: assigning → assigned
    info!(
        task_id = %task_id,
        state = "assigned",
        role = ?role,
        "Task assigned to role"
    );

    self.active_tasks.insert(task_id.clone(), task);

    // State: assigned → executing
    info!(
        task_id = %task_id,
        state = "executing",
        "Task execution started"
    );

    Ok(task_id)
}
```

**Output in Logs**:
```
[INFO] Task created task_id=task-123 state=pending
[INFO] Finding suitable role for task task_id=task-123 state=assigning available_roles=5
[INFO] Task assigned to role task_id=task-123 state=assigned role=Developer
[INFO] Task execution started task_id=task-123 state=executing
```

**Benefits**: Can trace task lifecycle through logs

---

#### 1.5 Log Performance Metrics

```rust
use std::time::Instant;

pub fn record_attempt(&mut self, success: bool, quality: f32, duration_ms: u64) {
    let start = Instant::now();

    self.attempts += 1;
    if success {
        self.successes += 1;
    }

    // OLD calculation
    let old_avg_quality = self.avg_quality;
    let old_avg_duration = self.avg_duration_ms;

    // NEW calculation
    let total_quality = self.avg_quality * (self.attempts - 1) as f32 + quality;
    self.avg_quality = total_quality / self.attempts as f32;

    let total_duration = self.avg_duration_ms * (self.attempts - 1) as u64 + duration_ms;
    self.avg_duration_ms = total_duration / self.attempts as u64;

    let calc_duration = start.elapsed();

    // Log with full details
    debug!(
        success = success,
        quality = quality,
        duration_ms = duration_ms,
        attempts = self.attempts,
        successes = self.successes,
        old_avg_quality = old_avg_quality,
        new_avg_quality = self.avg_quality,
        old_avg_duration = old_avg_duration,
        new_avg_duration = self.avg_duration_ms,
        calculation_time_us = calc_duration.as_micros(),
        "Metrics updated"
    );

    // Detect anomalies
    if quality > 1.0 || quality < 0.0 {
        error!(
            quality = quality,
            attempts = self.attempts,
            "Invalid quality value (should be 0.0-1.0)"
        );
    }

    if self.avg_quality > 1.0 {
        error!(
            avg_quality = self.avg_quality,
            attempts = self.attempts,
            total_quality = total_quality,
            "Running average calculation produced invalid result"
        );
    }
}
```

**What This Achieves**:
- ✅ Can verify calculations by hand from logs
- ✅ Detect calculation errors immediately
- ✅ Performance metrics (calculation time) tracked

---

### TypeScript Logging Best Practices

#### 2.1 Use Console Levels Correctly

```typescript
// ❌ WRONG: Everything at console.log
console.log('Starting update check')
console.log('Update available')
console.log('Error downloading update')

// ✅ CORRECT: Use appropriate levels
export async function checkForUpdates(): Promise<UpdateInfo | null> {
  console.info('Starting update check', {
    currentVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch
  })

  try {
    const result = await autoUpdater.checkForUpdates()

    if (result?.updateInfo) {
      console.info('Update available', {
        currentVersion: app.getVersion(),
        newVersion: result.updateInfo.version,
        releaseDate: result.updateInfo.releaseDate,
        downloadSize: result.updateInfo.files[0]?.size
      })
      return result.updateInfo
    } else {
      console.debug('No update available', {
        currentVersion: app.getVersion(),
        lastCheckTime: new Date().toISOString()
      })
      return null
    }
  } catch (error) {
    console.error('Update check failed', {
      currentVersion: app.getVersion(),
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      platform: process.platform
    })
    return null
  }
}
```

---

#### 2.2 Log All API Calls with Request/Response

```typescript
export async function apiCall<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const requestId = Math.random().toString(36).substring(7)
  const start = performance.now()

  console.debug('API request started', {
    requestId,
    endpoint,
    method: options?.method || 'GET',
    headers: options?.headers,
    timestamp: new Date().toISOString()
  })

  try {
    const response = await fetch(endpoint, options)
    const duration = performance.now() - start

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('API request failed', {
        requestId,
        endpoint,
        status: response.status,
        statusText: response.statusText,
        errorBody,
        duration: `${duration.toFixed(2)}ms`,
        headers: Object.fromEntries(response.headers.entries())
      })
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    console.info('API request succeeded', {
      requestId,
      endpoint,
      status: response.status,
      duration: `${duration.toFixed(2)}ms`,
      responseSize: JSON.stringify(data).length
    })

    return data
  } catch (error) {
    const duration = performance.now() - start
    console.error('API request exception', {
      requestId,
      endpoint,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${duration.toFixed(2)}ms`
    })
    throw error
  }
}
```

---

#### 2.3 Log IPC Communication (Main ↔ Renderer)

```typescript
// main process
ipcMain.handle('settings:get', async (event) => {
  const windowId = BrowserWindow.fromWebContents(event.sender)?.id
  console.debug('IPC: settings:get received', {
    windowId,
    sender: event.sender.id,
    timestamp: new Date().toISOString()
  })

  try {
    const settings = await loadSettings()
    console.info('IPC: settings:get succeeded', {
      windowId,
      settingsKeys: Object.keys(settings),
      timestamp: new Date().toISOString()
    })
    return settings
  } catch (error) {
    console.error('IPC: settings:get failed', {
      windowId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
    throw error
  }
})

// renderer process
export async function getSettings(): Promise<Settings> {
  console.debug('IPC: Invoking settings:get', {
    timestamp: new Date().toISOString()
  })

  try {
    const settings = await ipcRenderer.invoke('settings:get')
    console.info('IPC: settings:get response received', {
      settingsKeys: Object.keys(settings),
      timestamp: new Date().toISOString()
    })
    return settings
  } catch (error) {
    console.error('IPC: settings:get failed in renderer', {
      error: error instanceof Error ? error.message : String(error)
    })
    throw error
  }
}
```

---

### Running with Maximum Logging

#### Rust: TRACE level everywhere
```bash
# Development
RUST_LOG=trace cargo test -- --nocapture

# Production (filter by module)
RUST_LOG=goose=trace,hyper=info cargo run

# JSON structured logs
RUST_LOG=trace RUST_LOG_FORMAT=json cargo run

# Log to file
RUST_LOG=trace cargo run 2>&1 | tee debug.log
```

#### TypeScript: All console levels
```bash
# Development (Electron)
NODE_ENV=development npm run start

# Production with debug
DEBUG=* npm run start

# Log to file
npm run start 2>&1 | tee electron.log
```

---

### CI Logging Configuration

**.github/workflows/ci.yml**:
```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Run tests with maximum logging
        run: |
          # Rust: TRACE level, capture all output
          RUST_LOG=trace cargo test --all -- --nocapture --test-threads=1 2>&1 | tee rust-tests.log

      - name: Upload test logs
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: test-logs
          path: |
            rust-tests.log
            **/*.log
            hs_err_pid*.log
```

---

### Log Analysis for Bug Fixing

#### Find Root Cause in Logs:

```bash
# 1. Find all ERROR logs
grep "ERROR" debug.log

# 2. Find specific test failure
grep -A 20 "test_qa_no_edit_permissions" debug.log

# 3. Trace request flow (by request_id)
grep "request_id=abc123" debug.log

# 4. Find slow operations (>1000ms)
grep "duration_ms" debug.log | awk '$NF > 1000'

# 5. Count errors by type
grep "ERROR" debug.log | awk '{print $5}' | sort | uniq -c

# 6. Timeline of events for task
grep "task_id=task-123" debug.log | sort

# 7. Find state transitions
grep "state=" debug.log | grep "task_id=task-123"
```

---

### Log-Driven Debugging Workflow

**When Test Fails**:
```bash
# 1. Run test with full logging
RUST_LOG=trace cargo test test_qa_no_edit_permissions -- --nocapture > test_output.log 2>&1

# 2. Find the exact failure point
grep "FAILED\|panicked" test_output.log

# 3. Trace backwards from failure
grep -B 50 "assertion failed" test_output.log

# 4. Find related decision points
grep "File access\|Permission check" test_output.log

# 5. Identify input values at failure
grep "test_qa_no_edit_permissions" -A 100 test_output.log | grep "path=\|role="

# 6. Compare expected vs actual
# Expected: execute_result.allowed = false
# Actual: execute_result.allowed = true (from logs)

# 7. Find where boolean was set wrong
grep "allowed=" test_output.log

# 8. Fix the bug (inverted logic found!)
```

---

### Summary: Logging for Rapid Bug Fixing

**Key Principles**:
1. **Log at every decision point** (if/else, match arms)
2. **Log with full context** (inputs, outputs, state)
3. **Use structured logging** (key-value pairs, not strings)
4. **Log performance** (duration, resource usage)
5. **Log state transitions** (pending → executing → complete)
6. **Always log errors** with full stack traces and context
7. **Use appropriate log levels** (TRACE for deep debugging, ERROR for failures)
8. **Make logs searchable** (consistent field names, request IDs)

**Benefits**:
- ✅ Can diagnose bugs from CI logs without reproducing
- ✅ Can trace request flows end-to-end
- ✅ Can verify calculations/logic from logs alone
- ✅ Can identify performance bottlenecks
- ✅ Can audit state transitions for race conditions

---

**Last Updated**: 2026-02-07
**Status**: Ready for ZenCoder bug hunting with maximum logging
**Maintainer**: Super-Goose Team
