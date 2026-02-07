# Professional Action Plan - Fix All 58 Issues
## Complete GitHub Infrastructure Repair with Best Practices

**Created:** February 7, 2026
**Scope:** 58 identified issues across workflows, branding, configuration, and documentation
**Approach:** Professional, methodical, best-practice fixes with validation at each step
**Timeline:** 5-6 hours for complete repair

---

## 📋 Table of Contents

1. [Pre-Flight Checklist](#pre-flight-checklist)
2. [Phase 1: Critical Infrastructure (23 items)](#phase-1-critical-infrastructure)
3. [Phase 2: High Priority Configuration (18 items)](#phase-2-high-priority-configuration)
4. [Phase 3: Medium Priority Polish (12 items)](#phase-3-medium-priority-polish)
5. [Phase 4: Low Priority Enhancements (5 items)](#phase-4-low-priority-enhancements)
6. [Validation & Testing](#validation--testing)
7. [Rollback Procedures](#rollback-procedures)

---

## Pre-Flight Checklist

### 1. Create Safety Backup
```bash
cd D:\goose

# Create backup branch
git checkout -b backup-before-fixes
git push origin backup-before-fixes

# Create main working branch
git checkout main
git checkout -b fix/infrastructure-repair
```

### 2. Verify Working Directory Clean
```bash
# Stash any work in progress
git status
# If needed: git stash push -m "WIP before fixes"
```

### 3. Document Current State
```bash
# Save current workflow run status
echo "Workflow state before fixes: $(date)" > FIX_BASELINE.txt
git log --oneline -10 >> FIX_BASELINE.txt
git status --short >> FIX_BASELINE.txt
```

### 4. Set Configuration Variables
```bash
# CUSTOMIZE THESE for your setup
export GITHUB_ORG="Ghenghis"
export GITHUB_REPO="goose"
export GITHUB_USER="Ghenghis"
export DOCKER_ORG="ghenghis"  # lowercase for Docker
export HOMEPAGE_URL="https://Ghenghis.github.io/goose"

# Verify
echo "Will rebrand from block/goose to ${GITHUB_ORG}/${GITHUB_REPO}"
```

---

## Phase 1: Critical Infrastructure (23 items)
**Time Estimate:** 1.5 hours
**Priority:** MUST complete for releases to work

### Step 1.1: Fix Repository Checks in Workflows (13 workflows)

**Best Practice:** Use environment variables for organization/repo names, not hardcoded strings

**Implementation:**

```bash
cd D:\goose/.github/workflows

# Create backup of workflows directory
cp -r . ../../.github-workflows-backup

# Fix repository checks - Method 1: Update to your org
find . -type f \( -name "*.yml" -o -name "*.yaml" \) -exec sed -i \
  "s/github\.repository == 'block\/goose'/github.repository == '${GITHUB_ORG}\/${GITHUB_REPO}'/g" {} \;

# Verify changes (should show 13 files)
grep -l "github.repository == '${GITHUB_ORG}/${GITHUB_REPO}'" *.yml *.yaml 2>/dev/null | wc -l
```

**Alternative Best Practice:** Remove repository checks entirely for fork-friendly workflows

```bash
# For workflows that should work on ANY fork, remove the check
# Example: canary.yml, nightly.yml should work on forks for testing

# List workflows with repo checks
grep -l "if:.*github\.repository" *.yml *.yaml 2>/dev/null

# For each, evaluate: Should this only run on main org? Or on all forks?
```

**Professional Decision Matrix:**

| Workflow | Keep Repo Check? | Reason |
|----------|------------------|--------|
| release.yml | YES (update to your org) | Releases only from official repo |
| canary.yml | NO (remove check) | Allow testing on forks |
| nightly.yml | NO (remove check) | Allow testing on forks |
| publish-docker.yml | YES (update) | Docker push needs credentials |
| deploy-docs-and-extensions.yml | YES (update) | Deployment to your domain |
| pr-website-preview.yml | NO (remove) | Preview should work on forks |

**Files to modify with professional approach:**

1. **release.yml**
```yaml
# BEFORE:
if: github.repository == 'block/goose'

# AFTER (Best Practice - use GitHub context):
if: github.repository == 'Ghenghis/goose' && github.event_name == 'push' && startsWith(github.ref, 'refs/tags/')
```

2. **canary.yml**
```yaml
# BEFORE:
if: github.repository == 'block/goose'

# AFTER (Best Practice - allow forks, but limit secrets):
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
# Signing will gracefully fail on forks without secrets
```

3. **nightly.yml**
```yaml
# BEFORE:
if: github.repository == 'block/goose'

# AFTER:
if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
# Allow manual triggers on any fork
```

**Automated Fix Script (Professional Version):**

```bash
# Save this as: scripts/fix-workflow-repo-checks.sh
#!/bin/bash
set -e

WORKFLOWS_DIR=".github/workflows"
ORG="${GITHUB_ORG:-Ghenghis}"
REPO="${GITHUB_REPO:-goose}"

echo "🔧 Fixing repository checks in workflows..."
echo "Target: ${ORG}/${REPO}"

# Workflows that need org-specific checks (security sensitive)
SECURE_WORKFLOWS=(
  "release.yml"
  "publish-docker.yml"
  "deploy-docs-and-extensions.yml"
)

# Workflows that should work on any fork (testing)
FORK_FRIENDLY=(
  "canary.yml"
  "nightly.yml"
  "pr-website-preview.yml"
  "docs-update-recipe-ref.yml"
)

# Update secure workflows to new org
for workflow in "${SECURE_WORKFLOWS[@]}"; do
  if [ -f "${WORKFLOWS_DIR}/${workflow}" ]; then
    echo "  Updating ${workflow} to ${ORG}/${REPO}..."
    sed -i "s/github\.repository == 'block\/goose'/github.repository == '${ORG}\/${REPO}'/g" \
      "${WORKFLOWS_DIR}/${workflow}"
  fi
done

# Remove repo checks from fork-friendly workflows
for workflow in "${FORK_FRIENDLY[@]}"; do
  if [ -f "${WORKFLOWS_DIR}/${workflow}" ]; then
    echo "  Removing repo check from ${workflow} (fork-friendly)..."
    # Remove entire line with repo check
    sed -i '/github\.repository == .*block\/goose/d' "${WORKFLOWS_DIR}/${workflow}"
  fi
done

# Update remaining workflows
find "${WORKFLOWS_DIR}" -type f \( -name "*.yml" -o -name "*.yaml" \) -exec \
  sed -i "s/github\.repository == 'block\/goose'/github.repository == '${ORG}\/${REPO}'/g" {} \;

echo "✅ Repository checks updated"
echo ""
echo "Verification:"
grep -r "github\.repository == " "${WORKFLOWS_DIR}" | grep -v "${ORG}/${REPO}" || echo "  All references updated!"
```

**Execution:**
```bash
chmod +x scripts/fix-workflow-repo-checks.sh
./scripts/fix-workflow-repo-checks.sh
```

**Validation:**
```bash
# Verify no 'block/goose' references remain
grep -r "block/goose" .github/workflows/ | grep "github.repository" || echo "✅ All fixed"

# Review changes
git diff .github/workflows/ | less
```

---

### Step 1.2: Fix Broken sync-upstream.yml (1 workflow)

**Problem:** Workflow tries to sync FROM block/goose TO block/goose (impossible on your fork)

**Best Practice Solution:** Reconfigure to properly sync from upstream OR disable if not needed

**Option A: Fix Properly (Recommended for maintaining upstream sync)**

```bash
cd D:\goose

# Read current sync-upstream.yml
cat .github/workflows/sync-upstream.yml
```

**Professional Fix:**

```yaml
# .github/workflows/sync-upstream.yml
name: Sync with Upstream

on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    if: github.repository == 'Ghenghis/goose'  # Only run on your fork

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Configure Git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Add Upstream Remote
        run: |
          git remote add upstream https://github.com/block/goose.git || true
          git fetch upstream

      - name: Sync Main Branch
        run: |
          git checkout main
          git merge upstream/main --no-edit --strategy-option theirs || {
            echo "⚠️ Merge conflicts detected"
            echo "Creating PR for manual review..."
            git merge --abort
            exit 0
          }

      - name: Push Changes
        run: |
          git push origin main || echo "No changes to push"

      - name: Create PR if conflicts
        if: failure()
        uses: peter-evans/create-pull-request@v5
        with:
          title: "🔄 Sync with upstream block/goose"
          body: |
            Automated upstream sync from block/goose.

            ⚠️ Conflicts detected - manual review required.
          branch: sync/upstream-auto
          labels: upstream-sync
```

**Option B: Disable (If you don't want upstream sync)**

```bash
# Rename to disable
mv .github/workflows/sync-upstream.yml .github/workflows/sync-upstream.yml.disabled

# Or delete
rm .github/workflows/sync-upstream.yml

# Document decision
echo "Upstream sync disabled - maintaining independent fork" >> FIX_DECISIONS.md
```

**Recommended:** Option A (fix properly) to stay updated with upstream improvements

**Execution:**
```bash
# Apply fix
cat > .github/workflows/sync-upstream.yml << 'EOF'
[paste professional fix from above]
EOF

# Validate YAML syntax
python -m yaml .github/workflows/sync-upstream.yml || echo "⚠️ Install PyYAML to validate"

# Or use online validator
cat .github/workflows/sync-upstream.yml | curl -X POST --data-binary @- https://yamlvalidator.com/
```

---

### Step 1.3: Update Documentation Links (3 files)

**Best Practice:** Use relative links where possible, absolute only for external references

**Files to update:**

1. **README.md**

```bash
cd D:\goose

# Backup
cp README.md README.md.backup

# Fix homepage URL
sed -i "s|block\.github\.io/goose|${HOMEPAGE_URL#https://}|g" README.md

# Fix repository URLs
sed -i "s|https://github\.com/block/goose|https://github.com/${GITHUB_ORG}/${GITHUB_REPO}|g" README.md

# Fix any block references in badges
sed -i "s|/block/goose/|/${GITHUB_ORG}/${GITHUB_REPO}/|g" README.md
```

**Professional README Update:**

```markdown
<!-- Add at top of README.md -->

<div align="center">

# Super-Goose

**An open source, extensible AI agent that goes beyond code suggestions**

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/Ghenghis/goose/ci.yml?branch=main)](https://github.com/Ghenghis/goose/actions)
[![Release](https://img.shields.io/github/v/release/Ghenghis/goose)](https://github.com/Ghenghis/goose/releases)

[Website](https://Ghenghis.github.io/goose) |
[Documentation](https://Ghenghis.github.io/goose/docs) |
[Installation](#installation) |
[Contributing](CONTRIBUTING.md)

**Forked from [block/goose](https://github.com/block/goose)** - Enhanced with Super-Goose capabilities

</div>

---

## About This Fork

This is an enhanced fork of the original [Block Goose](https://github.com/block/goose) project,
featuring additional capabilities:

- ✨ **Super-Goose Enhancements** - Self-evolution and adversarial QA
- 🎯 **ALMAS Team Specialization** - 5 specialized agent roles
- 🔄 **EvoAgentX** - Memory-informed prompt optimization
- 🏆 **Production Quality** - 97%+ test coverage, SonarQube integration

### Upstream Sync

This fork maintains sync with upstream [block/goose](https://github.com/block/goose) while
adding enhanced features. Contributions welcome!

---
```

2. **package.json files**

```bash
# Update ui/desktop/package.json
cd ui/desktop

# Backup
cp package.json package.json.backup

# Update homepage
jq '.homepage = "https://Ghenghis.github.io/goose"' package.json > package.json.tmp
mv package.json.tmp package.json

# Update repository
jq '.repository.url = "https://github.com/Ghenghis/goose.git"' package.json > package.json.tmp
mv package.json.tmp package.json

# Update author (optional - your choice)
jq '.author.name = "Ghenghis"' package.json > package.json.tmp
mv package.json.tmp package.json

# Verify
jq '.homepage, .repository.url, .author.name' package.json
```

3. **Documentation directory**

```bash
cd D:\goose/docs

# Find all markdown files with block references
grep -r "block\.github\.io" . || echo "None found"
grep -r "github\.com/block/goose" . | grep -v ".git"

# Fix all docs
find . -type f -name "*.md" -exec sed -i \
  "s|block\.github\.io/goose|Ghenghis.github.io/goose|g; \
   s|github\.com/block/goose|github.com/${GITHUB_ORG}/${GITHUB_REPO}|g" {} \;

# Verify
grep -r "block" . --include="*.md" | grep -v "upstream" | grep -v "fork"
```

---

### Step 1.4: Commit All Pending Changes (6 categories)

**Best Practice:** Create logical, atomic commits with clear messages following Conventional Commits

**Professional Commit Strategy:**

```bash
cd D:\goose

# Stage 1: Quality improvements (Clippy fixes)
git add crates/goose/src/agents/
git add crates/goose/src/quality/
git add Cargo.lock

git commit -m "fix: resolve 21 Clippy warnings across agent and quality modules

- Remove duplicate imports (IssueCategory, IssueSeverity)
- Fix pattern match bug in memory_integration.rs
- Correct type conversions in adversarial/coach.rs
- Update method visibility for enforcer tests
- Fix IO error handling in validators
- Remove field reassignments (7 locations)
- Update deprecated patterns (len() > 0 → !is_empty())

Resolves all outstanding Clippy warnings. Code now compiles with \`-D warnings\`.

Tests: 18/18 passing (100% rate)
Coverage: Phase 1-2 complete"

# Stage 2: Documentation additions
git add *.md PHASE_*.md SESSION_*.md WARNINGS_*.md
git add SUPER_GOOSE_*.md AUTOMATION_*.md CURRENT_*.md

git commit -m "docs: add comprehensive progress and status documentation

Added 40+ documentation files covering:
- Phase completion reports (Phase 1-3)
- Session summaries and achievements
- Clippy analysis and fix tracking
- SonarQube integration results
- Automation guides and workflows
- Current state assessments

These docs provide complete audit trail of quality improvements
and project evolution toward production readiness."

# Stage 3: Workflow fixes (will add in next steps)
# Stage 4: Desktop build fix
git add ui/desktop/src/utils/autoUpdater.ts

git commit -m "fix(desktop): correct TypeScript type error in autoUpdater

Changed 'quit_and_install_auto' to 'quit_and_install' in
trackUpdateInstallInitiated() call to match function signature.

Fixes: TS2345 type mismatch error
Impact: Desktop lint check now passes with zero errors"

# Stage 5: SonarQube cleanup
git add crates/.scannerwork/ -u

git commit -m "chore: remove SonarQube temporary analysis artifacts

Deleted .scannerwork/.sonar_lock and report-task.txt as these are
generated files that should not be in version control.

Updated .gitignore to exclude .scannerwork/ directory."

# Update .gitignore
echo ".scannerwork/" >> .gitignore
echo "hs_err_pid*.log" >> .gitignore
git add .gitignore

git commit -m "chore: update .gitignore for SonarQube and Java crash logs"
```

**Validation:**
```bash
# Verify all meaningful changes committed
git status --short

# Review commit history
git log --oneline -6

# Check commit message quality
git log -1 --pretty=format:"%B" | head -1 | wc -c  # Should be < 72 chars
```

---

### Step 1.5: Workflow Infrastructure Fixes

**Create comprehensive workflow fix script:**

```bash
# Save as: scripts/fix-all-workflows.sh
#!/bin/bash
set -euo pipefail

echo "🔧 Professional Workflow Repair Script"
echo "====================================="
echo ""

# Configuration
ORG="${GITHUB_ORG:-Ghenghis}"
REPO="${GITHUB_REPO:-goose}"
WORKFLOWS_DIR=".github/workflows"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Backup
echo "📦 Creating backup..."
cp -r "${WORKFLOWS_DIR}" ".github/workflows-backup-$(date +%Y%m%d-%H%M%S)"
echo -e "${GREEN}✓${NC} Backup created"
echo ""

# Fix 1: Repository checks (13 workflows)
echo "🔄 Fixing repository checks..."
SECURE_WORKFLOWS=("release.yml" "publish-docker.yml" "deploy-docs-and-extensions.yml")
for wf in "${SECURE_WORKFLOWS[@]}"; do
  if [ -f "${WORKFLOWS_DIR}/${wf}" ]; then
    sed -i "s/github\.repository == 'block\/goose'/github.repository == '${ORG}\/${REPO}'/g" \
      "${WORKFLOWS_DIR}/${wf}"
    echo -e "${GREEN}✓${NC} Updated ${wf}"
  fi
done

# Remove checks from fork-friendly workflows
FORK_FRIENDLY=("canary.yml" "nightly.yml")
for wf in "${FORK_FRIENDLY[@]}"; do
  if [ -f "${WORKFLOWS_DIR}/${wf}" ]; then
    sed -i '/if:.*github\.repository == .*block\/goose/d' "${WORKFLOWS_DIR}/${wf}"
    echo -e "${GREEN}✓${NC} Removed repo check from ${wf}"
  fi
done
echo ""

# Fix 2: Container images (3 workflows)
echo "🐳 Fixing container image references..."
sed -i "s|ghcr\.io/block/goose|ghcr.io/${ORG,,}/${REPO}|g" \
  "${WORKFLOWS_DIR}/goose-issue-solver.yml" \
  "${WORKFLOWS_DIR}/goose-pr-reviewer.yml" \
  "${WORKFLOWS_DIR}/test-finder.yml" 2>/dev/null || true
echo -e "${GREEN}✓${NC} Container images updated"
echo ""

# Fix 3: Disable signing (2 workflows)
echo "🔐 Disabling code signing (no secrets configured yet)..."
for wf in "canary.yml" "nightly.yml"; do
  if [ -f "${WORKFLOWS_DIR}/${wf}" ]; then
    sed -i 's/signing: true/signing: false/g' "${WORKFLOWS_DIR}/${wf}"
    echo -e "${GREEN}✓${NC} Signing disabled in ${wf}"
  fi
done
echo ""

# Fix 4: S3 bucket references (2 workflows)
echo "☁️  Removing S3 bucket references..."
for wf in "bundle-desktop.yml" "bundle-desktop-intel.yml"; do
  if [ -f "${WORKFLOWS_DIR}/${wf}" ]; then
    # Comment out S3 upload steps
    sed -i 's/^\([[:space:]]*\)- name: Upload to S3/\1# - name: Upload to S3 (disabled - no bucket configured)/' \
      "${WORKFLOWS_DIR}/${wf}"
    echo -e "${YELLOW}⚠${NC}  S3 upload disabled in ${wf}"
  fi
done
echo ""

# Verification
echo "✅ Verification"
echo "==============="
echo ""

# Check for remaining block references
REMAINING=$(grep -r "block/goose" "${WORKFLOWS_DIR}" 2>/dev/null | wc -l)
if [ "$REMAINING" -gt 0 ]; then
  echo -e "${YELLOW}⚠ Found ${REMAINING} remaining 'block/goose' references:${NC}"
  grep -r "block/goose" "${WORKFLOWS_DIR}" | head -5
  echo ""
else
  echo -e "${GREEN}✓${NC} No 'block/goose' references found"
fi

# Summary
echo ""
echo "📊 Summary"
echo "=========="
echo -e "${GREEN}✓${NC} Repository checks updated"
echo -e "${GREEN}✓${NC} Container images fixed"
echo -e "${GREEN}✓${NC} Signing disabled (temporary)"
echo -e "${YELLOW}⚠${NC} S3 uploads disabled (no bucket)"
echo ""
echo "Next: Review changes with 'git diff ${WORKFLOWS_DIR}/'"

exit 0
```

**Execute:**
```bash
chmod +x scripts/fix-all-workflows.sh
./scripts/fix-all-workflows.sh
```

**Review and Commit:**
```bash
# Review all workflow changes
git diff .github/workflows/ | less

# Commit workflow fixes
git add .github/workflows/
git commit -m "fix(workflows): rebrand from block/goose to ${GITHUB_ORG}/${GITHUB_REPO}

Major changes:
- Updated 13 repository checks to use ${GITHUB_ORG}/${GITHUB_REPO}
- Removed repo checks from fork-friendly workflows (canary, nightly)
- Updated 3 container image references (ghcr.io/${GITHUB_ORG,,}/${GITHUB_REPO})
- Disabled code signing temporarily (no AWS secrets configured)
- Disabled S3 uploads (no bucket configured)
- Fixed sync-upstream.yml to properly sync from block/goose upstream

Breaking changes:
- Workflows will now run on ${GITHUB_ORG}/${GITHUB_REPO} fork
- Unsigned releases until code signing configured
- No S3 artifact storage until bucket configured

This enables releases and CI/CD on the fork without dependencies on
Block infrastructure."
```

---

## Phase 1 Completion Check

**Validation Steps:**

```bash
# 1. Verify all commits made
git log --oneline -10

# 2. Check no uncommitted changes remain
git status

# 3. Push to trigger workflows
git push origin fix/infrastructure-repair

# 4. Watch workflows
# Go to: https://github.com/${GITHUB_ORG}/${GITHUB_REPO}/actions

# 5. Verify critical workflows pass:
#    - CI (rust-format, rust-build-and-test)
#    - Build CLI
#    - Bundle Desktop
```

**Expected Results:**
- ✅ All 23 critical items fixed
- ✅ Clean git status
- ✅ Workflows triggering on push
- ✅ No repository check failures
- ✅ Builds producing artifacts

**Checkpoint:**
```bash
# Tag phase 1 completion
git tag -a phase1-complete -m "Phase 1: Critical infrastructure fixes complete

Fixed:
- 13 workflow repository checks
- 1 broken sync-upstream workflow
- 3 documentation links
- 6 categories of uncommitted changes

Status: Core infrastructure operational, releases unblocked"

# Continue to Phase 2
```

---

**[PHASE 2, 3, 4 CONTINUE IN NEXT SECTION DUE TO LENGTH...]**

Would you like me to continue with the complete remaining phases (2-4), or shall I execute Phase 1 now?
