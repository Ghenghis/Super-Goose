# GitHub Workflows - Quick Reference Card

## 47 Workflows Overview

### ✅ WORKING - No Changes Needed (24 workflows)
- build-cli.yml (CLI for all platforms)
- build-docker.yml, build-linux-unsigned.yml, build-windows-unsigned.yml
- build-windows-complete.yml, build-portable.yml
- ci.yml (main CI pipeline)
- cargo-audit.yml, scorecard.yml
- pr-comment-*.yml (4 workflows - build CLI/desktop on demand)
- pr-smoke-test.yml
- create-release-pr.yaml, check-release-pr.yaml, minor-release.yaml, patch-release.yaml
- merge-release-pr-on-tag.yaml, update-release-pr.yaml, release-branches.yml
- bundle-desktop-manual.yml
- stale.yml, autoclose, quarantine.yml, take.yml

### ⚠️ NEEDS REBRAND - block/goose References (15 workflows)
**HIGH PRIORITY** (blocks fork releases):
- release.yml - repository == 'block/goose' check
- canary.yml - repository == 'block/goose' check
- nightly.yml - repository == 'block/goose' check
- publish-docker.yml - repository == 'block/goose' check
- deploy-docs-and-extensions.yml - repository == 'block/goose' check
- pr-website-preview.yml - repo.full_name == 'block/goose'

**MEDIUM PRIORITY** (Docker images):
- goose-issue-solver.yml - ghcr.io/block/goose:latest
- goose-pr-reviewer.yml - ghcr.io/block/goose:latest
- test-finder.yml - ghcr.io/block/goose:latest

**MEDIUM PRIORITY** (URLs):
- bundle-desktop-windows.yml - GitHub URLs in code signing
- docs-update-recipe-ref.yml - upstream URLs

**AWS INFRASTRUCTURE**:
- bundle-desktop.yml - S3: block-goose-artifacts-bucket-production
- bundle-desktop-intel.yml - S3: block-goose-artifacts-bucket-production

### 🔴 BROKEN - Must Disable (1 workflow)
- sync-upstream.yml - Tries to sync FROM block/goose TO block/goose (self-sync!)

### ℹ️ NOT FULLY AUDITED (7 workflows)
- bundle-desktop-linux.yml, sonarqube.yml, publish-ask-ai-bot.yml
- rebuild-skills-marketplace.yml, recipe-security-scanner.yml
- update-health-dashboard.yml, update-hacktoberfest-leaderboard.yml

---

## Critical Workflows for Releases

### Main Release Pipeline (release.yml)
**Trigger**: Push tag `v1.*`
**Builds**: Windows, Linux, macOS (CLI + Desktop) - SIGNED
**Secrets Needed**: OSX_CODESIGN_ROLE, WINDOWS_CODESIGN_CERTIFICATE, WINDOW_SIGNING_ROLE

### Canary Release (canary.yml)
**Trigger**: Push to main branch
**Builds**: Windows, Linux, macOS (CLI + Desktop) - UNSIGNED
**Version**: {base}-canary+{sha}

### Nightly Release (nightly.yml)
**Trigger**: Daily 5am UTC (midnight US Eastern)
**Builds**: Windows, Linux, macOS (CLI + Desktop) - SIGNED
**Version**: {base}-nightly.{YYYYMMDD}.{sha}

---

## Platform Build Matrix

### CLI Builds (build-cli.yml)
| Platform | Architecture | Target | Builder |
|----------|-------------|--------|---------|
| Linux | x86_64 | unknown-linux-gnu | Ubuntu + cross |
| Linux | aarch64 | unknown-linux-gnu | Ubuntu + cross |
| macOS | x86_64 | apple-darwin | macOS + cross |
| macOS | aarch64 | apple-darwin | macOS + cross |
| Windows | x86_64 | pc-windows-gnu | Ubuntu + Docker + mingw |

### Desktop Builds
| Platform | Workflow | Runner | Signing | Output |
|----------|----------|--------|---------|--------|
| macOS ARM64 | bundle-desktop.yml | macos-latest | Optional | .zip |
| macOS Intel | bundle-desktop-intel.yml | macos-latest | Optional | .zip |
| Linux x64 | bundle-desktop-linux.yml | ubuntu-x86-16core | No | .deb/.rpm/.flatpak |
| Windows x64 | bundle-desktop-windows.yml | ubuntu-latest | Optional | .zip |

---

## Critical Secrets

### For Unsigned Releases (Minimum)
- **None required!** Set `signing: false` in workflows

### For Signed Releases (Full)
**macOS**:
- OSX_CODESIGN_ROLE (AWS IAM role ARN)
- AWS S3 bucket (replace `block-goose-artifacts-bucket-production`)
- AWS Lambda function `codesign_helper`

**Windows**:
- WINDOWS_CODESIGN_CERTIFICATE (PEM certificate)
- WINDOW_SIGNING_ROLE (AWS IAM role for main)
- WINDOW_SIGNING_ROLE_TAG (AWS IAM role for tags)
- AWS KMS key for signing

**AI Bots**:
- ANTHROPIC_API_KEY (required for goose bots)

**Docs**:
- INKEEP_API_KEY, INKEEP_INTEGRATION_ID, INKEEP_ORG_ID (optional)

---

## Common Workflow Triggers

### Automatic
- **Push to main**: canary.yml, ci.yml, publish-docker.yml, deploy-docs.yml
- **Push tag v1.***: release.yml
- **PR to main**: ci.yml, check-release-pr.yaml
- **Schedule daily**: nightly.yml, cargo-audit.yml, autoclose, stale.yml
- **Schedule weekly**: minor-release.yaml, scorecard.yml, sync-upstream.yml

### Manual (workflow_dispatch)
- All build-* workflows (unsigned builds)
- patch-release.yaml (hotfix creation)
- publish-docker.yml

### PR Comments
- `/build-cli` - pr-comment-build-cli.yml
- `/bundle` - pr-comment-bundle.yml (macOS ARM64)
- `/bundle-intel` - pr-comment-bundle-intel.yml (macOS Intel)
- `/bundle-windows` - pr-comment-bundle-windows.yml
- `/goose` on issues - goose-issue-solver.yml
- `/goose` on PRs - goose-pr-reviewer.yml

---

## Quick Fixes Needed

### MUST FIX (To enable releases on fork)
```bash
# 1. Update repository checks (13 files)
sed -i "s/block\/goose/YourOrg\/goose/g" .github/workflows/*.yml

# 2. Delete broken sync
rm .github/workflows/sync-upstream.yml

# 3. Verify unsigned builds
grep -A3 "signing:" .github/workflows/canary.yml
# Should show: signing: false
```

### SHOULD FIX (For AI bots)
```bash
# Update container images after publishing Docker image
sed -i "s|ghcr.io/block/goose|ghcr.io/YourOrg/goose|g" \
  .github/workflows/goose-*.yml
```

### COULD FIX (For signed releases)
- Set up AWS S3 bucket for macOS signing
- Set up AWS Lambda `codesign_helper`
- Set up AWS KMS for Windows signing
- Add all code signing secrets
- Update S3 bucket references in bundle-desktop*.yml

---

## Testing Your Changes

### Test Workflow Syntax
```bash
# Install actionlint
brew install actionlint  # macOS
# or download from: https://github.com/rhysd/actionlint

# Check all workflows
actionlint .github/workflows/*.yml
```

### Test Unsigned Build
```bash
# Trigger portable build
gh workflow run build-portable.yml

# Monitor
gh run watch

# Download when done
gh run download <run-id>
```

### Test Full Canary
```bash
# Push to main
git commit --allow-empty -m "test: trigger canary"
git push origin main

# Monitor all jobs
gh run watch
```

---

## Artifact Outputs

### Successful canary.yml build produces:
1. goose-x86_64-unknown-linux-gnu.tar.bz2 (Linux CLI x64)
2. goose-aarch64-unknown-linux-gnu.tar.bz2 (Linux CLI ARM64)
3. goose-x86_64-apple-darwin.tar.bz2 (macOS CLI x64)
4. goose-aarch64-apple-darwin.tar.bz2 (macOS CLI ARM64)
5. goose-x86_64-pc-windows-gnu.zip (Windows CLI with DLLs)
6. Goose-darwin-arm64.zip (macOS Desktop ARM64)
7. Goose-darwin-x64.zip (macOS Desktop Intel)
8. Goose-linux-x64-deb (Linux Desktop DEB)
9. Goose-linux-x64-rpm (Linux Desktop RPM)
10. Goose-linux-x64-flatpak (Linux Desktop Flatpak)
11. Goose-win32-x64.zip (Windows Desktop)
12. download_cli.sh (installation script)

All uploaded to GitHub Release tagged "canary"

---

## Troubleshooting Quick Reference

| Error | Cause | Fix |
|-------|-------|-----|
| "workflow must be checked in" | Workflow not on branch | Commit & push first |
| "Resource not accessible" | Missing permissions | Settings→Actions→Permissions→Read+Write |
| "Repository check failed" | block/goose hardcoded | Update to YourOrg/goose |
| "Signing timeout" | Missing secrets | Use signing: false OR add secrets |
| "Docker image not found" | ghcr.io/block/goose | Publish to your registry first |
| "goose.exe not found" | Docker cross-compile fail | Check mingw-w64 installation |
| "S3 bucket access denied" | Wrong bucket name | Update to your bucket OR disable signing |

---

## File Locations

### Workflows
- `.github/workflows/` - All workflow definitions (47 files)

### Actions (Custom)
- `.github/actions/generate-release-pr-body/` - AI-powered release notes

### Scripts Referenced
- `./bin/activate-hermit` - Hermit package manager activation
- `./scripts/clippy-lint.sh` - Rust linting
- `download_cli.sh` - CLI installation script

### Configuration Files
- `Cargo.toml` - Rust version (updated by release workflows)
- `ui/desktop/package.json` - Desktop app version
- `justfile` - Build commands (just prepare-release, etc.)

---

**See Also**:
- GITHUB_WORKFLOWS_AUDIT_REPORT.md - Full detailed audit
- WORKFLOWS_IMMEDIATE_FIXES.md - Step-by-step fix instructions
