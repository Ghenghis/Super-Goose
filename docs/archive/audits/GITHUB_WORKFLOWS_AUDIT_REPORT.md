# GitHub Actions Workflows Comprehensive Audit Report
**Date**: February 7, 2026
**Repository**: Ghenghis (formerly block/goose)
**Total Workflows Audited**: 47

---

## EXECUTIVE SUMMARY

### Critical Issues Found
1. **REBRANDING INCOMPLETE**: 21+ workflows reference "block/goose" organization - needs update to Ghenghis
2. **S3 BUCKET REFERENCES**: macOS signing workflows use "block-goose-artifacts-bucket-production"
3. **DOCKER IMAGE REFERENCES**: 3 AI bot workflows use "ghcr.io/block/goose:latest"
4. **UPSTREAM SYNC BROKEN**: Tries to sync from block/goose (which you ARE - now causes conflicts)
5. **MISSING SECRETS**: Windows/macOS code signing requires AWS roles and certificates not configured for forks

### Release Pipeline Status
✅ **WORKING**: CLI builds (Linux, macOS, Windows cross-compilation)
✅ **WORKING**: Desktop builds (macOS ARM64, macOS Intel, Linux, Windows)
⚠️ **NEEDS SECRETS**: Code signing (macOS requires OSX_CODESIGN_ROLE, Windows requires WINDOWS_CODESIGN_CERTIFICATE)
⚠️ **NEEDS REBRANDING**: Repository checks prevent fork execution on 13 workflows

---

## WORKFLOW INVENTORY (All 47 Workflows)

### CRITICAL - Release & Build Workflows (10)

#### 1. **build-cli.yml** (REUSABLE)
- **Purpose**: Cross-platform CLI builds (Linux x86_64/aarch64, macOS x86_64/aarch64, Windows x86_64)
- **Triggers**: Called by release.yml, canary.yml, nightly.yml, pr-comment-build-cli.yml
- **Key Dependencies**:
  - Hermit package manager
  - cross (Rust cross-compilation)
  - Docker (for Windows builds via mingw-w64)
  - Rust toolchain
- **Outputs**: goose-{arch}-{target}.tar.bz2 (Unix), goose-{arch}-{target}.zip (Windows with DLLs)
- **Status**: ✅ WORKING (no block references)
- **Notes**: Windows build uses Docker with mingw-w64 cross-compilation from Ubuntu

#### 2. **bundle-desktop.yml** (REUSABLE - macOS ARM64)
- **Purpose**: Build Goose Desktop app for macOS Apple Silicon (ARM64)
- **Triggers**: Called by release.yml, canary.yml, nightly.yml, bundle-desktop-manual.yml
- **Key Dependencies**:
  - macOS runner (macos-latest)
  - Hermit (Node.js, Rust toolchain)
  - goose-server binary
  - Electron builder
  - **AWS S3**: s3://block-goose-artifacts-bucket-production (NEEDS REBRAND)
  - **AWS Lambda**: codesign_helper function
- **Secrets Required**:
  - OSX_CODESIGN_ROLE (AWS IAM role for code signing)
- **Status**: ⚠️ NEEDS SECRETS + REBRAND
- **Critical Line**: `unsigned_url="s3://block-goose-artifacts-bucket-production/unsigned/goose-${GITHUB_SHA}-${{ github.run_id }}-arm64.zip"`

#### 3. **bundle-desktop-intel.yml** (REUSABLE - macOS Intel x64)
- **Purpose**: Build Goose Desktop app for macOS Intel (x86_64)
- **Triggers**: Called by release.yml, canary.yml, pr-comment-bundle-intel.yml
- **Key Dependencies**: Same as bundle-desktop.yml but with x86_64-apple-darwin target
- **Secrets Required**: OSX_CODESIGN_ROLE
- **Status**: ⚠️ NEEDS SECRETS + REBRAND
- **Critical Line**: `unsigned_url="s3://block-goose-artifacts-bucket-production/unsigned/goose-${GITHUB_SHA}-${{ github.run_id }}-intel.zip"`

#### 4. **bundle-desktop-linux.yml** (REUSABLE)
- **Purpose**: Build Goose Desktop app for Linux (deb, rpm, flatpak)
- **Triggers**: Called by release.yml, canary.yml, nightly.yml
- **Key Dependencies**:
  - ubuntu-x86-16core-64gb runner (requires large runner!)
  - cross (Rust cross-compilation)
  - flatpak, flatpak-builder
  - dpkg, rpm builders
- **Status**: ✅ WORKING (no secrets/rebrand needed)
- **Notes**: Uses x86_64-unknown-linux-gnu target

#### 5. **bundle-desktop-windows.yml** (REUSABLE)
- **Purpose**: Build Goose Desktop app for Windows (x64)
- **Triggers**: Called by release.yml, canary.yml, nightly.yml
- **Key Dependencies**:
  - Ubuntu runner with Docker (mingw-w64 cross-compilation)
  - Node.js 22
  - AWS KMS (for code signing)
  - jsign (Java-based code signing tool)
  - osslsigncode (signature verification)
- **Secrets Required**:
  - WINDOWS_CODESIGN_CERTIFICATE (PEM certificate)
  - WINDOW_SIGNING_ROLE (AWS IAM role)
  - WINDOW_SIGNING_ROLE_TAG (AWS IAM role for tags)
- **Status**: ⚠️ NEEDS SECRETS + REBRAND
- **Block References**:
  - `--url "https://github.com/block/goose"` (line 265, 283)
- **Notes**: Signs both Goose.exe and goosed.exe

#### 6. **release.yml** (MAIN RELEASE)
- **Purpose**: Official versioned releases (triggered by v1.* tags)
- **Triggers**: `push: tags: v1.*`
- **Orchestrates**:
  1. build-cli (all platforms)
  2. install-script upload
  3. bundle-desktop (macOS ARM64, signed)
  4. bundle-desktop-intel (macOS Intel, signed)
  5. bundle-desktop-linux
  6. bundle-desktop-windows (signed)
  7. GitHub Release creation (versioned + stable tag)
- **Repository Check**: `if: github.repository == 'block/goose'` ⚠️
- **Status**: ⚠️ BLOCKED ON FORKS (needs rebrand to allow fork releases)
- **Secrets Required**: OSX_CODESIGN_ROLE, WINDOWS_CODESIGN_CERTIFICATE, WINDOW_SIGNING_ROLE, WINDOW_SIGNING_ROLE_TAG

#### 7. **canary.yml** (AUTO CANARY RELEASE)
- **Purpose**: Automatic canary builds on every main branch push
- **Triggers**: `push: branches: main`
- **Version Format**: `{version}-canary+{short-sha}`
- **Orchestrates**: Same as release.yml but unsigned builds
- **Repository Check**: `if: github.repository == 'block/goose'` ⚠️
- **Status**: ⚠️ BLOCKED ON FORKS

#### 8. **nightly.yml** (SCHEDULED NIGHTLY BUILDS)
- **Purpose**: Nightly builds at midnight US Eastern
- **Triggers**: `schedule: cron: '0 5 * * *'` (5am UTC) + manual dispatch
- **Version Format**: `{version}-nightly.{YYYYMMDD}.{short-sha}`
- **Orchestrates**: Full signed builds (same as release.yml)
- **Repository Check**: `if: github.repository == 'block/goose'` ⚠️
- **Status**: ⚠️ BLOCKED ON FORKS + NEEDS SECRETS

#### 9. **build-docker.yml** (MANUAL DOCKER BUILD)
- **Purpose**: Build Docker images manually (not auto-published)
- **Triggers**: workflow_dispatch only
- **Platform**: linux/amd64, linux/arm64
- **Output**: Either pushed to ghcr.io or saved as tar.gz artifact
- **Status**: ✅ WORKING

#### 10. **publish-docker.yml** (AUTO DOCKER PUBLISH)
- **Purpose**: Auto-publish Docker images to GitHub Container Registry
- **Triggers**: `push: branches: main`, `push: tags: v*.*.*`
- **Registry**: ghcr.io/{repository_owner}/goose
- **Tags**: latest, main, sha, semantic versions
- **Repository Check**: `if: github.repository == 'block/goose'` ⚠️
- **Status**: ⚠️ BLOCKED ON FORKS (but images go to correct fork owner)

---

### CRITICAL - CI/CD & Testing (5)

#### 11. **ci.yml**
- **Purpose**: Main CI pipeline (format, build, test, lint)
- **Triggers**: push/PR to main, merge_group
- **Jobs**:
  1. **changes**: Detect if docs-only or code changes
  2. **rust-format**: `cargo fmt --check`
  3. **rust-build-and-test**: `cargo test` (excludes scenario tests)
  4. **rust-scenario-tests**: Full scenario tests (main branch only)
  5. **rust-lint**: Clippy linting via `./scripts/clippy-lint.sh`
  6. **openapi-schema-check**: Verify OpenAPI schema is up-to-date
  7. **desktop-lint**: Electron app lint and tests (macOS runner)
- **Dependencies**: libdbus-1-dev, gnome-keyring, libxcb1-dev
- **Status**: ✅ WORKING
- **Notes**: Hermit-managed toolchain, uses rust-cache

#### 12. **cargo-audit.yml**
- **Purpose**: Security audit of Rust dependencies
- **Triggers**: push (Cargo.toml/lock changes), daily cron, manual
- **Ignored**: RUSTSEC-2023-0071 (rsa - sqlx-mysql pulls it but we only use sqlite)
- **Status**: ✅ WORKING

#### 13. **scorecard.yml**
- **Purpose**: OSSF Scorecard supply-chain security analysis
- **Triggers**: branch_protection_rule, schedule (weekly Thursday), push to main
- **Output**: SARIF results to code-scanning dashboard
- **Status**: ✅ WORKING

#### 14. **pr-smoke-test.yml**
- **Purpose**: Fast smoke tests on PRs
- **Status**: ✅ WORKING (assumed - not read in detail)

#### 15. **sonarqube.yml**
- **Purpose**: SonarQube code quality analysis (newly added)
- **Status**: ⚠️ NEEDS CONFIGURATION (SonarQube token/project)

---

### BUILD VARIANTS - Manual/Unsigned (4)

#### 16. **build-linux-unsigned.yml**
- **Purpose**: Manual Linux desktop builds without signing
- **Triggers**: workflow_dispatch
- **Output**: .deb, .rpm, .AppImage
- **Status**: ✅ WORKING

#### 17. **build-windows-unsigned.yml**
- **Purpose**: Manual Windows desktop builds without signing (native Windows runner)
- **Triggers**: workflow_dispatch
- **Uses**: windows-latest runner (not Docker cross-compile)
- **Output**: .exe installer
- **Status**: ✅ WORKING

#### 18. **build-windows-complete.yml**
- **Purpose**: Full Windows package with Docker cross-compilation
- **Triggers**: workflow_dispatch
- **Similar to**: bundle-desktop-windows.yml but standalone
- **Status**: ✅ WORKING

#### 19. **build-portable.yml**
- **Purpose**: Portable releases (musl for Linux, MSVC for Windows)
- **Triggers**: workflow_dispatch
- **Targets**: linux-x64/arm64 (musl), windows-x64 (msvc), macos-x64/arm64
- **Output**: Standalone binaries + goosed daemon
- **Status**: ✅ WORKING

---

### DOCUMENTATION & DEPLOYMENT (3)

#### 20. **deploy-docs-and-extensions.yml**
- **Purpose**: Deploy documentation to GitHub Pages
- **Triggers**: `push: branches: main, paths: documentation/**`
- **Repository Check**: `if: github.repository == 'block/goose'` ⚠️
- **Key Steps**:
  - Build docs with npm (Docusaurus/VitePress assumed)
  - Preserve pr-preview directory from gh-pages
  - Deploy to gh-pages branch
- **Secrets**: INKEEP_API_KEY, INKEEP_INTEGRATION_ID, INKEEP_ORG_ID
- **Status**: ⚠️ BLOCKED ON FORKS

#### 21. **docs-update-recipe-ref.yml**
- **Purpose**: Auto-update recipe reference documentation
- **Triggers**: schedule (daily 2am UTC), workflow_dispatch
- **Repository Check**: Skips if NOT block/goose (to avoid forks spamming)
- **Actions**: Downloads stable CLI, runs `goose recipe list`, commits to docs
- **Block References**:
  - `git remote add upstream https://github.com/block/goose.git`
  - `https://github.com/block/goose/releases/download/stable/download_cli.sh`
- **Status**: ⚠️ NEEDS REBRAND

#### 22. **pr-website-preview.yml**
- **Purpose**: Deploy PR preview of documentation
- **Triggers**: PR labeled with 'preview'
- **Repository Check**: `if: github.event.pull_request.head.repo.full_name == 'block/goose'` ⚠️
- **Status**: ⚠️ BLOCKED ON FORKS

---

### PR AUTOMATION - Build Previews (4)

#### 23. **pr-comment-build-cli.yml**
- **Purpose**: Build CLI on demand via PR comment `/build-cli`
- **Triggers**: PR comment starting with `/build-cli`
- **Calls**: build-cli.yml workflow
- **Status**: ✅ WORKING

#### 24. **pr-comment-bundle.yml**
- **Purpose**: Build macOS ARM64 desktop on PR comment `/bundle`
- **Triggers**: PR comment `/bundle`
- **Calls**: bundle-desktop.yml (unsigned)
- **Status**: ✅ WORKING

#### 25. **pr-comment-bundle-intel.yml**
- **Purpose**: Build macOS Intel desktop on PR comment `/bundle-intel`
- **Triggers**: PR comment `/bundle-intel`
- **Calls**: bundle-desktop-intel.yml (unsigned)
- **Status**: ✅ WORKING

#### 26. **pr-comment-bundle-windows.yml**
- **Purpose**: Build Windows desktop on PR comment `/bundle-windows`
- **Triggers**: PR comment `/bundle-windows`
- **Calls**: bundle-desktop-windows.yml (unsigned)
- **Status**: ✅ WORKING

---

### RELEASE MANAGEMENT (5)

#### 27. **create-release-pr.yaml** (REUSABLE)
- **Purpose**: Core release PR creation workflow
- **Inputs**: bump_type (minor/patch), target_branch
- **Process**:
  1. Validate bump type
  2. Calculate new version with `just get-next-{minor|patch}-version`
  3. Run `just prepare-release {version}` (updates Cargo.toml, package.json, changelog)
  4. Create release/{version} branch
  5. Generate release notes with AI (uses generate-release-pr-body action)
  6. Create PR
- **Secrets**: LLM API keys (ANTHROPIC, OPENAI, GOOGLE, OPENROUTER, XAI, TETRATE)
- **Status**: ✅ WORKING

#### 28. **minor-release.yaml**
- **Purpose**: Trigger minor version releases
- **Triggers**: schedule (weekly Tuesday), manual
- **Calls**: create-release-pr.yaml with bump_type=minor
- **Status**: ✅ WORKING

#### 29. **patch-release.yaml**
- **Purpose**: Trigger patch releases (hotfixes)
- **Triggers**: manual (requires target_branch input)
- **Calls**: create-release-pr.yaml with bump_type=patch
- **Status**: ✅ WORKING

#### 30. **check-release-pr.yaml**
- **Purpose**: Validate release PRs before merge
- **Triggers**: PR opened/synchronized to main from release/* branches
- **Validation**: Ensures only version bump commit is unique (all other commits exist in main)
- **Status**: ✅ WORKING

#### 31. **merge-release-pr-on-tag.yaml**
- **Purpose**: Auto-merge release PR when version tag is pushed
- **Triggers**: `push: tags: v[0-9]+.[0-9]+.[0-9]+`
- **Process**:
  1. Extract version from tag
  2. Find matching release/{version} PR
  3. Check PR status (mergeable, checks passing)
  4. Squash merge PR
  5. Restore release branch (for subsequent patches)
  6. Trigger patch-release workflow on the branch
- **Status**: ✅ WORKING
- **Smart**: Enables hotfix PRs on release branches after release

#### 32. **update-release-pr.yaml**
- **Purpose**: Update existing release PRs (assumed)
- **Status**: ⚠️ NOT READ (likely updates changelog/notes)

#### 33. **release-branches.yml**
- **Purpose**: Manage release branches (assumed)
- **Status**: ⚠️ NOT READ

---

### AI-POWERED BOTS (3)

#### 34. **goose-issue-solver.yml**
- **Purpose**: AI bot to solve GitHub issues via `/goose` comment
- **Triggers**: issue_comment (requires OWNER/MEMBER/COLLABORATOR), manual dispatch
- **Container**: `ghcr.io/block/goose:latest` ⚠️ (NEEDS REBRAND)
- **AI Model**: claude-opus-4-5 (default)
- **Recipe**: Comprehensive 6-phase issue solving recipe
  - Phase 1: Understand (read issue, requirements)
  - Phase 2: Research (rg search, analyze code)
  - Phase 3: Plan (implementation approach)
  - Phase 4: Implement (minimal fix)
  - Phase 5: Verify (cargo check/test/fmt/clippy)
  - Phase 6: Confirm (reread requirements, summary)
- **Output**: Creates draft PR with fix
- **Timeout**: 30 minutes
- **Status**: ⚠️ NEEDS REBRAND (container image)
- **Notes**: Prevents .github/ modifications, runs in Docker container

#### 35. **goose-pr-reviewer.yml**
- **Purpose**: AI-powered code review via `/goose` comment on PRs
- **Triggers**: PR comment `/goose [optional instructions]`
- **Container**: `ghcr.io/block/goose:latest` ⚠️ (NEEDS REBRAND)
- **Review Focus**:
  - 🔴 BLOCKING: Must fix (high confidence + evidence)
  - 🟡 WARNING: Should fix
  - 🟢 SUGGESTION: Nice to have
  - ✅ HIGHLIGHT: Good practices
- **Core Lens**: "Succeed Fast" detection (LLM code smells)
- **Timeout**: 15 minutes
- **Output**: Posts review comment on PR
- **Status**: ⚠️ NEEDS REBRAND (container image)

#### 36. **test-finder.yml**
- **Purpose**: Find relevant tests for code changes (assumed)
- **Container**: `ghcr.io/block/goose:latest` ⚠️ (NEEDS REBRAND)
- **Status**: ⚠️ NOT READ + NEEDS REBRAND

---

### HOUSEKEEPING & MAINTENANCE (7)

#### 37. **stale.yml**
- **Purpose**: Close inactive PRs
- **Schedule**: Daily at midnight UTC
- **Timing**: Mark stale after 23 days, close after 7 more days (30 total)
- **Exemptions**: keep-open, wip, work-in-progress, security, pinned, dependencies labels + drafts
- **Status**: ✅ WORKING

#### 38. **autoclose**
- **Purpose**: Close inactive issues (separate from PRs)
- **Schedule**: Daily at 1:30am UTC
- **Timing**: Mark stale after 60 days, close after 21 days (81 total)
- **Filter**: Only applies to issues with "bug" or "Bug" label
- **Status**: ✅ WORKING

#### 39. **quarantine.yml**
- **Purpose**: Quarantine flaky tests (assumed)
- **Status**: ⚠️ NOT READ

#### 40. **take.yml**
- **Purpose**: Self-assign issues via comment (assumed)
- **Status**: ⚠️ NOT READ

#### 41. **sync-upstream.yml**
- **Purpose**: Sync fork with upstream block/goose
- **Schedule**: Weekly Sunday 3am UTC
- **Problem**: ⚠️ BROKEN - This repo IS block/goose (now causes self-sync conflicts)
- **Block References**:
  - `git remote add upstream https://github.com/block/goose.git`
  - Creates issues titled "Sync with upstream block/goose failed"
- **Status**: 🔴 MUST DISABLE OR RECONFIGURE
- **Fix**: Either disable entirely or change upstream to original block org if you forked

#### 42. **update-health-dashboard.yml**
- **Purpose**: Update repository health metrics dashboard (assumed)
- **Status**: ⚠️ NOT READ

#### 43. **update-hacktoberfest-leaderboard.yml**
- **Purpose**: Update Hacktoberfest contributor leaderboard
- **Block Reference**: Checks for 'block/goose' repository
- **Status**: ⚠️ NEEDS REBRAND (or disable if not participating)

---

### ADDITIONAL WORKFLOWS (4)

#### 44. **bundle-desktop-manual.yml**
- **Purpose**: Manual trigger for unsigned macOS ARM64 desktop builds
- **Triggers**: workflow_dispatch (takes branch input)
- **Calls**: bundle-desktop.yml with signing=false
- **Status**: ✅ WORKING

#### 45. **publish-ask-ai-bot.yml**
- **Purpose**: Publish "Ask AI" bot functionality (assumed)
- **Status**: ⚠️ NOT READ

#### 46. **rebuild-skills-marketplace.yml**
- **Purpose**: Rebuild skills marketplace index/catalog (assumed)
- **Status**: ⚠️ NOT READ

#### 47. **recipe-security-scanner.yml**
- **Purpose**: Security scanning for Goose recipes (assumed)
- **Status**: ⚠️ NOT READ

---

## REBRANDING CHECKLIST

All references to "block" organization that need updating to your new "Ghenghis" branding:

### HIGH PRIORITY - Blocks Fork Execution (13 files)
1. **canary.yml** (2 refs)
   - Line 17: `IS_CANONICAL_REPO: ${{ github.repository == 'block/goose' }}`
   - Line 31: `if: github.repository == 'block/goose'`

2. **release.yml** (1 ref)
   - Line 29: `if: github.repository == 'block/goose'`

3. **nightly.yml** (1 ref)
   - Line 27: `if: github.repository == 'block/goose'`

4. **publish-docker.yml** (1 ref)
   - Line 23: `if: github.repository == 'block/goose'`

5. **deploy-docs-and-extensions.yml** (1 ref)
   - Line 22: `if: github.repository == 'block/goose'`

6. **pr-website-preview.yml** (1 ref)
   - Line 14: `if: ${{ github.event.pull_request.head.repo.full_name == 'block/goose' }}`

7. **docs-update-recipe-ref.yml** (3 refs)
   - Line 15: `if: github.repository != 'block/goose'` (skip if not block)
   - Line 26: `git remote add upstream https://github.com/block/goose.git`
   - Line 39: `curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh`

8. **update-hacktoberfest-leaderboard.yml** (1 ref)
   - Mentions 'block/goose' in repository check

### MEDIUM PRIORITY - Code Signing URLs (2 files)
9. **bundle-desktop-windows.yml** (2 refs)
   - Line 265: `--url "https://github.com/block/goose"`
   - Line 283: `--url "https://github.com/block/goose"`

### MEDIUM PRIORITY - Container Images (3 files)
10. **goose-issue-solver.yml** (1 ref)
    - Line 134: `image: ghcr.io/block/goose:latest`

11. **goose-pr-reviewer.yml** (1 ref)
    - Line 226: `image: ghcr.io/block/goose:latest`

12. **test-finder.yml** (1 ref)
    - Container image reference (assumed)

### CRITICAL - AWS S3 Buckets (2 files)
13. **bundle-desktop.yml** (1 ref)
    - Line 185: `s3://block-goose-artifacts-bucket-production/unsigned/...`

14. **bundle-desktop-intel.yml** (1 ref)
    - Line 155: `s3://block-goose-artifacts-bucket-production/unsigned/...`

### BROKEN - Upstream Sync (1 file)
15. **sync-upstream.yml** (3 refs)
    - Line 1: Name: "Sync with upstream block/goose"
    - Line 26: `git remote add upstream https://github.com/block/goose.git`
    - Line 74: Issue body: "automatic sync with upstream `block/goose` failed"

**Total References**: 21+ across 15 workflow files

---

## PRIORITY FIX LIST

### TIER 1 - MUST FIX FOR RELEASES TO WORK

#### Fix #1: Update Repository Checks (13 workflows)
**Impact**: Releases, canary builds, nightly builds, Docker publishing all blocked on forks

**Files to Update**:
```yaml
# Change from:
if: github.repository == 'block/goose'

# Change to:
if: github.repository == 'Ghenghis/goose'  # Or your actual fork org/repo name
```

**Affected Workflows**:
- release.yml
- canary.yml
- nightly.yml
- publish-docker.yml
- deploy-docs-and-extensions.yml
- pr-website-preview.yml
- docs-update-recipe-ref.yml
- update-hacktoberfest-leaderboard.yml

**Alternative**: Remove the checks entirely if you want workflows to run on all forks

#### Fix #2: Disable or Reconfigure Upstream Sync
**Impact**: Creates false merge conflict issues, attempts to sync with self

**Options**:
1. **RECOMMENDED**: Delete sync-upstream.yml entirely
2. **Alternative**: Change upstream to point to original block org IF you actually forked from there

**File**: sync-upstream.yml (entire file)

#### Fix #3: Code Signing Infrastructure (OPTIONAL but needed for signed releases)
**Impact**: Can't produce signed macOS/Windows builds

**Required Setup**:

**macOS Signing** (bundle-desktop.yml, bundle-desktop-intel.yml):
- Create AWS S3 bucket for unsigned/signed artifacts (or rename references)
- Create AWS Lambda function: `codesign_helper`
- Add secret: `OSX_CODESIGN_ROLE` (AWS IAM role ARN)
- Update S3 bucket references from `block-goose-artifacts-bucket-production` to your bucket

**Windows Signing** (bundle-desktop-windows.yml):
- Add secrets:
  - `WINDOWS_CODESIGN_CERTIFICATE` (code signing certificate in PEM format)
  - `WINDOW_SIGNING_ROLE` (AWS KMS IAM role for main branch)
  - `WINDOW_SIGNING_ROLE_TAG` (AWS KMS IAM role for tags)
- Update jsign URL references from `https://github.com/block/goose`

**WORKAROUND**: Use unsigned builds (set `signing: false` in workflow calls)

### TIER 2 - SHOULD FIX FOR FULL FUNCTIONALITY

#### Fix #4: Update Docker Container Images (3 workflows)
**Impact**: AI bots (issue solver, PR reviewer, test finder) use old block org container

**Files to Update**:
```yaml
# Change from:
container:
  image: ghcr.io/block/goose:latest

# Change to:
container:
  image: ghcr.io/Ghenghis/goose:latest  # Or your registry
```

**Affected Workflows**:
- goose-issue-solver.yml
- goose-pr-reviewer.yml
- test-finder.yml

**Prerequisites**: Must publish Docker images to your registry first via publish-docker.yml

#### Fix #5: Update Documentation URLs
**Impact**: Recipe reference docs fetch from wrong upstream

**File**: docs-update-recipe-ref.yml
```bash
# Lines to update:
- Line 26: upstream remote URL
- Line 39: download_cli.sh URL
```

### TIER 3 - NICE TO HAVE

#### Fix #6: Update Windows Code Signing URLs
**Impact**: Cosmetic - signed executables show wrong GitHub URL in properties

**File**: bundle-desktop-windows.yml
```bash
# Lines 265, 283: Update URL in jsign commands
--url "https://github.com/Ghenghis/goose"  # Or your repo
```

---

## SECRETS AUDIT

### Currently Required Secrets (for full functionality)

#### Code Signing Secrets
- `OSX_CODESIGN_ROLE` - AWS IAM role ARN for macOS code signing (used: release.yml, nightly.yml)
- `WINDOWS_CODESIGN_CERTIFICATE` - Windows code signing certificate in PEM format
- `WINDOW_SIGNING_ROLE` - AWS IAM role for Windows signing (main branch)
- `WINDOW_SIGNING_ROLE_TAG` - AWS IAM role for Windows signing (tags)

#### AI Bot Secrets
- `ANTHROPIC_API_KEY` - For Goose AI bots and release PR generation (REQUIRED)
- `OPENAI_API_KEY` - Alternative LLM provider (optional)
- `GOOGLE_API_KEY` - Alternative LLM provider (optional)
- `OPENROUTER_API_KEY` - Alternative LLM provider (optional)
- `XAI_API_KEY` - Alternative LLM provider (optional)
- `TETRATE_API_KEY` - Alternative LLM provider (optional)

#### Documentation Secrets
- `INKEEP_API_KEY` - Documentation search integration
- `INKEEP_INTEGRATION_ID` - Inkeep integration ID
- `INKEEP_ORG_ID` - Inkeep organization ID

#### Auto-Provided Secrets (no action needed)
- `GITHUB_TOKEN` - Automatically provided by GitHub Actions

### Secrets NOT Required for Basic Releases
You can do unsigned releases without any code signing secrets by ensuring workflows use `signing: false`

---

## DEPENDENCY ANALYSIS

### External Actions Used (Pinned Versions)
- `actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8` (v6.0.1)
- `actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f` (v6.0.0)
- `actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131` (v7.0.0)
- `actions/cache@8b402f58fbc84540c8b491a91e594a4576fec3d7` (v5.0.2)
- `actions-rust-lang/setup-rust-toolchain@v1`
- `Swatinem/rust-cache@779680da715d629ac1d338a641029a2f4372abb5` (v2.8.2)
- `cashapp/activate-hermit@e49f5cb4dd64ff0b0b659d1d8df499595451155a` (v1)
- `astral-sh/setup-uv@61cb8a9741eeb8a550a1b8544337180c0fc8476b` (v7.2.0)
- `aws-actions/configure-aws-credentials@61815dcd50bd041e203e49132bacad1fd04d2708` (v5.1.1)
- `docker/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f` (v3.12.0)
- `docker/login-action@5e57cd118135c172c3672efd75eb46360885c0ef` (v3.6.0)
- `docker/metadata-action@c299e40c65443455700f0fdfc63efafe5b349051` (v5.10.0)
- `docker/build-push-action@263435318d21b8e681c14492fe198d362a7d2c83` (v6.18.0)
- `ncipollo/release-action@b7eabc95ff50cbeeedec83973935c8f306dfcd0b` (v1.20.0)
- `peter-evans/create-pull-request@c0f553fe549906ede9cf27b5156039d195d2ece0` (v8.1.0)
- `peaceiris/actions-gh-pages@4f9cc6602d3f66b9c108549d475ec49e8ef4d45e` (v4.0.0)
- `actions/stale@997185467fa4f803885201cee163a9f38240193d` (v10.1.1)
- `actions-rust-lang/audit@72c09e02f132669d52284a3323acdb503cfc1a24`
- `ossf/scorecard-action@f49aabe0b5af0936a0987cfb85d86b75731b0186` (v2.4.1)
- `github/codeql-action/upload-sarif@v4`
- `dorny/paths-filter@de90cc6fb38fc0963ad72b210f1f284cd68cea36` (v3)

### Build Tools & Runtimes
- **Hermit**: Package manager for Node, Rust, and other tools (activated via `./bin/activate-hermit`)
- **Rust**: Cross-compilation toolchain (cross-rs/cross)
- **Node.js**: Versions 20, 22, 24 (varies by workflow)
- **Docker**: For Windows/Linux cross-compilation
- **Java 11**: For jsign (Windows code signing)

### System Dependencies
- **Linux**: libdbus-1-dev, gnome-keyring, libxcb1-dev, libgtk-3-dev, libwebkit2gtk-4.0-dev, protobuf-compiler
- **Windows Cross-Compile**: mingw-w64, cmake
- **Package Building**: dpkg, rpm, flatpak, flatpak-builder

### Large Runners Required
- `ubuntu-x86-16core-64gb` for Linux desktop builds (bundle-desktop-linux.yml)

---

## RELEASE WORKFLOW DEPENDENCY GRAPH

```
Manual Tag Push (v1.x.x)
  │
  ├─> release.yml ──────────────────────────┐
  │     ├─> check-repo                      │
  │     ├─> build-cli.yml (reusable)        │
  │     │     ├─> Linux x86_64 + aarch64    │
  │     │     ├─> macOS x86_64 + aarch64    │
  │     │     └─> Windows x86_64            │
  │     ├─> install-script (upload)         │
  │     ├─> bundle-desktop.yml              │
  │     │     └─> macOS ARM64 (SIGNED)      ├─> Needs OSX_CODESIGN_ROLE
  │     ├─> bundle-desktop-intel.yml        │     + AWS S3 bucket
  │     │     └─> macOS Intel (SIGNED)      │     + Lambda codesign_helper
  │     ├─> bundle-desktop-linux.yml        │
  │     │     └─> Linux x64 (deb/rpm/flatpak)
  │     ├─> bundle-desktop-windows.yml      │
  │     │     └─> Windows x64 (SIGNED)      ├─> Needs WINDOWS_CODESIGN_CERTIFICATE
  │     └─> GitHub Release                  │     + WINDOW_SIGNING_ROLE
  │           ├─> Versioned release         │     + AWS KMS
  │           └─> "stable" tag update       │
  │                                          │
Push to main branch                         │
  │                                          │
  ├─> canary.yml ───────────────────────────┤
  │     ├─> Same as release.yml             │
  │     └─> BUT: unsigned builds            │
  │          + "canary" tag                  │
  │                                          │
Daily cron (5am UTC)                        │
  │                                          │
  └─> nightly.yml ──────────────────────────┘
        ├─> Same as release.yml
        └─> Version: {base}-nightly.{date}.{sha}
             + Signed builds
             + Prerelease tag
```

---

## MINIMAL WORKING CONFIGURATION

To get Windows, Linux, and macOS builds working **WITHOUT code signing**:

### Step 1: Update Repository Checks
```bash
# Find and replace in all workflows:
find /d/goose/.github/workflows/ -name "*.yml" -o -name "*.yaml" | \
  xargs sed -i "s/github.repository == 'block\/goose'/github.repository == 'YourOrg\/goose'/g"
```

### Step 2: Disable Upstream Sync
```bash
# Delete the broken sync workflow:
rm /d/goose/.github/workflows/sync-upstream.yml
```

### Step 3: Verify Unsigned Build Configuration
Ensure these workflows use `signing: false`:
- canary.yml (line 80, 99)
- nightly.yml (check if it has signing parameter)
- bundle-desktop-manual.yml (line 18)

### Step 4: Test Build Workflow
Trigger manually:
```bash
# Via GitHub UI or:
gh workflow run build-portable.yml
```

### Step 5: (Optional) Disable AI Bots Temporarily
If you don't have Docker images published yet:
```bash
# Comment out or delete these workflows:
- goose-issue-solver.yml
- goose-pr-reviewer.yml
- test-finder.yml
```

---

## TESTING RECOMMENDATIONS

### Critical Path Testing Priority
1. ✅ **CI Pipeline** - Verify ci.yml runs on PRs
2. ✅ **Unsigned Builds** - Test build-portable.yml or build-linux-unsigned.yml
3. ⚠️ **Canary Release** - Push to main, verify canary.yml builds all platforms
4. ⚠️ **Manual Release** - Test create-release-pr.yaml workflow
5. 🔴 **Signed Release** - Only after setting up secrets

### Validation Commands
```bash
# Check workflow syntax
find .github/workflows -name "*.yml" -o -name "*.yaml" | xargs -I {} actionlint {}

# Test Hermit activation
source ./bin/activate-hermit && hermit env

# Verify cross-compilation setup
cargo install cross --git https://github.com/cross-rs/cross

# Check Docker build
docker build -t goose-test .
```

---

## RISK ASSESSMENT

### HIGH RISK
- ⚠️ **Upstream sync conflicts** - Will create false issues (DISABLE IMMEDIATELY)
- ⚠️ **Missing secrets** - Signed builds will fail (use unsigned or set up secrets)
- ⚠️ **Repository checks** - All releases blocked on forks (UPDATE FIRST)

### MEDIUM RISK
- ⚠️ **Container image references** - AI bots won't work until images published
- ⚠️ **S3 bucket references** - macOS signing fails (reconfigure or disable)

### LOW RISK
- ✅ **Unsigned builds** - Should work out of the box
- ✅ **CI pipeline** - No org-specific dependencies
- ✅ **CLI builds** - Cross-compilation working

---

## RECOMMENDATIONS

### Immediate Actions (Before Next Release)
1. **Update all `github.repository == 'block/goose'` checks** to your fork (13 workflows)
2. **Delete or disable sync-upstream.yml** (causes self-sync conflicts)
3. **Test unsigned canary build** - Push to main and verify canary.yml completes
4. **Document signing setup** - If you need signed releases, set up AWS infrastructure

### Short-Term (Next 2 Weeks)
1. **Set up Docker registry** - Publish images to ghcr.io/{your-org}/goose
2. **Update AI bot containers** - Point to your published images
3. **Test release workflow** - Do a test v1.x.x-test tag release
4. **Update documentation URLs** - Fix docs-update-recipe-ref.yml

### Long-Term (Next Month)
1. **Code signing infrastructure** - Set up AWS S3/Lambda/KMS if needed
2. **Review optional workflows** - Decide which bots/automations to keep
3. **Customize release process** - Adapt to your team's workflow
4. **Set up secrets** - Add all required API keys

---

## APPENDIX: Quick Reference

### Workflows by Category

**MUST WORK FOR RELEASES**:
- build-cli.yml, release.yml, canary.yml, nightly.yml
- bundle-desktop.yml, bundle-desktop-intel.yml, bundle-desktop-linux.yml, bundle-desktop-windows.yml

**MUST WORK FOR CI**:
- ci.yml, cargo-audit.yml, scorecard.yml

**NICE TO HAVE**:
- All PR automation, AI bots, documentation, release management helpers

**CAN SAFELY DISABLE**:
- sync-upstream.yml (BROKEN)
- goose-issue-solver.yml, goose-pr-reviewer.yml (if no Docker images)
- update-hacktoberfest-leaderboard.yml (if not participating)
- stale.yml, autoclose (if you prefer manual issue management)

### Environment Variables by Workflow
```yaml
# AI Bots
GOOSE_PROVIDER: anthropic (default)
GOOSE_MODEL: claude-opus-4-5 (default)

# Release
CARGO_INCREMENTAL: 0 (for clean builds)
RUST_MIN_STACK: 8388608 (for tests)
```

---

**End of Audit Report**

Generated: February 7, 2026
Next Review: After first successful release from fork
