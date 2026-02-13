# Workflow Security Fixes

**Alerts:** #1-15, #22-35
**Count:** 28 alerts
**Status:** PARTIALLY FIXED (permissions blocks added, some jobs pending)

---

## Category 1: Missing Workflow Permissions (20 alerts)

### Problem
GitHub Actions workflows without explicit `permissions:` blocks inherit the repository's default permissions, which may grant more access than needed.

### Fixes Applied

| Workflow | Alert(s) | Fix |
|----------|----------|-----|
| build-cli.yml | #7 | Added top-level `permissions: contents: read` |
| bundle-desktop-linux.yml | #8 | Added `permissions: contents: read` |
| check-release-pr.yaml | #9 | Added `permissions: contents: read, pull-requests: read` |
| canary.yml | #10-15 | Added top-level `permissions: contents: read` |
| nightly.yml | #22-26 | Added top-level `permissions: contents: read` |
| pr-smoke-test.yml | #27-32 | Added per-job `permissions:` blocks |
| pr-website-preview.yml | #30 | Added `permissions: contents: read, pull-requests: write` |

### Pattern Used
```yaml
# Top-level: restrict to minimum
permissions:
  contents: read

jobs:
  build:
    # Job inherits top-level permissions
    ...
  release:
    # Job that needs write access escalates explicitly
    permissions:
      contents: write
    ...
```

---

## Category 2: Cache Poisoning (3 alerts)

### Alerts #33, #34, #35: build-cli.yml

**Problem:** Running `cargo build` after checking out PR code in a `pull_request_target` context can poison the cache with malicious artifacts.

**Analysis:** The `build-cli.yml` workflow has jobs triggered by `issue_comment` (PR comment commands). These jobs:
1. Check out the PR's HEAD commit
2. Run `cargo build`
3. Share the cache

A malicious PR could modify `build.rs` or `Cargo.toml` to execute arbitrary code during `cargo build`, poisoning the shared cache.

**Mitigation Applied:**
- Added `permissions: contents: read` to limit blast radius
- The jobs already use `ref: ${{ github.event.issue.pull_request.head_sha }}` which checks out a specific commit
- **Recommendation:** Consider running these builds with `--no-cache` or in an isolated environment

---

## Category 3: Untrusted Checkout (5 alerts)

### Alert #3, #2, #1: build-cli.yml - Critical

**Problem:** `pull_request_target` trigger checks out PR code with write permissions (GITHUB_TOKEN has write access).

**Current State:** The workflow uses `actions/checkout` with `ref: ${{ github.event.issue.pull_request.head_sha }}` to check out the PR's code. This means untrusted code runs with elevated permissions.

**Mitigation:**
- Added read-only `permissions: contents: read` to limit the GITHUB_TOKEN scope
- The `issue_comment` trigger already requires a repo collaborator to post the trigger comment
- **Recommendation:** Move untrusted code execution to a separate workflow with `pull_request` trigger

### Alert #4, #6: goose-pr-reviewer.yml

**Problem:** Checks out PR code and runs review logic.

**Current State:** Uses `pull_request_target` for access to secrets needed for the review bot.

**Mitigation:**
- Workflow already has `permissions: pull-requests: write` (needed for posting review comments)
- Added explicit `contents: read` scope
- The review logic only reads code, doesn't execute it

### Alert #5: recipe-security-scanner.yml

**Problem:** Checks out PR code to scan recipes.

**Current State:** Uses `pull_request_target` to access secrets.

**Mitigation:**
- Scanner reads TOML/YAML files, doesn't execute arbitrary code
- Added explicit permission scoping

---

## Remaining Work

The following workflow jobs still need per-job permissions blocks:
- `nightly.yml`: Individual build matrix jobs
- `canary.yml`: Individual build matrix jobs
- `pr-smoke-test.yml`: Some nested jobs

These are lower priority as the top-level `permissions: contents: read` already restricts the default.
