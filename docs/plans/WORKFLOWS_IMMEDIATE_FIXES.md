# GitHub Workflows - Immediate Fix Checklist

**Priority**: Get Windows, Linux, macOS releases working NOW

---

## STEP 1: Fix Repository Checks (13 files)

Replace all `block/goose` references with your actual repository name.

**If your repo is at `github.com/YourOrg/goose`:**

```bash
# From D:\goose directory:
cd /d/goose/.github/workflows

# Update all repository checks
find . -type f \( -name "*.yml" -o -name "*.yaml" \) -exec sed -i \
  -e "s/github\.repository == 'block\/goose'/github.repository == 'YourOrg\/goose'/g" \
  -e "s/github\.repository != 'block\/goose'/github.repository != 'YourOrg\/goose'/g" \
  -e "s/github\.event\.pull_request\.head\.repo\.full_name == 'block\/goose'/github.event.pull_request.head.repo.full_name == 'YourOrg\/goose'/g" \
  {} \;
```

**Files affected**:
- canary.yml (lines 17, 31)
- release.yml (line 29)
- nightly.yml (line 27)
- publish-docker.yml (line 23)
- deploy-docs-and-extensions.yml (line 22)
- pr-website-preview.yml (line 14)
- docs-update-recipe-ref.yml (line 15)
- update-hacktoberfest-leaderboard.yml

**Verification**:
```bash
grep -r "block/goose" /d/goose/.github/workflows/
# Should show ONLY:
# - Container image references (ghcr.io/block/goose)
# - S3 bucket names
# - Code signing URLs
```

---

## STEP 2: Disable Broken Upstream Sync

This workflow tries to sync FROM block/goose TO block/goose (infinite loop!)

```bash
# Delete the file:
rm /d/goose/.github/workflows/sync-upstream.yml

# OR rename it to disable:
mv /d/goose/.github/workflows/sync-upstream.yml \
   /d/goose/.github/workflows/sync-upstream.yml.DISABLED
```

---

## STEP 3: Configure for Unsigned Builds

Verify these workflows are set to `signing: false`:

### Check canary.yml
```yaml
# Line 80 - macOS ARM64
bundle-desktop:
  needs: [prepare-version]
  uses: ./.github/workflows/bundle-desktop.yml
  permissions:
    id-token: write
    contents: read
  with:
    version: ${{ needs.prepare-version.outputs.version }}
    signing: false  # ← Should be false

# Line 99 - Windows
bundle-desktop-windows:
  needs: [prepare-version]
  uses: ./.github/workflows/bundle-desktop-windows.yml
  with:
    version: ${{ needs.prepare-version.outputs.version }}
    signing: false  # ← Should be false
```

### Check nightly.yml
Same as above - ensure `signing: false` if you don't have secrets

### release.yml
```yaml
# Lines 63, 76, 92 - Set signing: false IF you don't have secrets
# OR leave as signing: true IF you have:
#   - OSX_CODESIGN_ROLE
#   - WINDOWS_CODESIGN_CERTIFICATE
#   - WINDOW_SIGNING_ROLE, WINDOW_SIGNING_ROLE_TAG
```

---

## STEP 4: Test Unsigned Build

**Quick Test** - Build portable binaries:
```bash
# Via GitHub CLI:
gh workflow run build-portable.yml

# Check status:
gh run list --workflow=build-portable.yml

# Download artifacts when done:
gh run download <run-id>
```

**Full Test** - Canary release:
```bash
# Make a small commit to main:
echo "# Test" >> README.md
git add README.md
git commit -m "test: trigger canary build"
git push origin main

# Monitor the build:
gh run watch
```

Expected artifacts:
- ✅ goose-x86_64-unknown-linux-gnu.tar.bz2
- ✅ goose-aarch64-unknown-linux-gnu.tar.bz2
- ✅ goose-x86_64-apple-darwin.tar.bz2
- ✅ goose-aarch64-apple-darwin.tar.bz2
- ✅ goose-x86_64-pc-windows-gnu.zip
- ✅ Goose-darwin-arm64.zip (macOS desktop)
- ✅ Goose-linux-x64-deb/rpm/flatpak
- ✅ Goose-win32-x64.zip (Windows desktop)

---

## STEP 5: (Optional) Disable AI Bots Temporarily

If you haven't published Docker images yet, these will fail:

```bash
# Rename to disable:
mv /d/goose/.github/workflows/goose-issue-solver.yml \
   /d/goose/.github/workflows/goose-issue-solver.yml.DISABLED

mv /d/goose/.github/workflows/goose-pr-reviewer.yml \
   /d/goose/.github/workflows/goose-pr-reviewer.yml.DISABLED

mv /d/goose/.github/workflows/test-finder.yml \
   /d/goose/.github/workflows/test-finder.yml.DISABLED
```

**To re-enable later**:
1. Publish Docker images: `gh workflow run publish-docker.yml`
2. Update container image references to `ghcr.io/YourOrg/goose:latest`
3. Rename files back (remove .DISABLED)

---

## VERIFICATION CHECKLIST

After making changes:

- [ ] **Repository checks updated** - All "block/goose" changed to your org
- [ ] **sync-upstream.yml disabled** - File deleted or renamed
- [ ] **Unsigned builds configured** - `signing: false` in canary/nightly
- [ ] **Test build successful** - Run build-portable.yml manually
- [ ] **CI passing** - Push a commit, verify ci.yml passes
- [ ] **Canary build successful** - Push to main, verify full release artifacts

---

## IMMEDIATE NEXT STEPS

### For Unsigned Releases (Quickest Path)
1. Apply fixes above
2. Test canary build
3. Create release: `git tag v1.0.0-test && git push origin v1.0.0-test`
4. Verify release.yml completes with unsigned builds

### For Signed Releases (Requires Setup)
1. Apply fixes above
2. Set up AWS infrastructure:
   - S3 bucket for artifacts (replace `block-goose-artifacts-bucket-production`)
   - Lambda function `codesign_helper` for macOS
   - KMS key for Windows signing
3. Add GitHub secrets:
   - `OSX_CODESIGN_ROLE`
   - `WINDOWS_CODESIGN_CERTIFICATE`
   - `WINDOW_SIGNING_ROLE`
   - `WINDOW_SIGNING_ROLE_TAG`
4. Update S3 bucket references in bundle-desktop.yml and bundle-desktop-intel.yml
5. Update code signing URLs in bundle-desktop-windows.yml
6. Set `signing: true` in release workflows
7. Test release

---

## TROUBLESHOOTING

### "workflow must be checked in to the branch"
**Cause**: Trying to run workflow that doesn't exist on branch
**Fix**: Commit and push workflow changes first

### "Resource not accessible by integration"
**Cause**: Missing repository permissions
**Fix**: Go to Settings → Actions → General → Workflow permissions → Read and write permissions

### Build fails with "repository check"
**Cause**: Didn't update `github.repository == 'block/goose'`
**Fix**: Run STEP 1 again

### Windows build fails "goose.exe not found"
**Cause**: Docker cross-compilation issue
**Fix**: Check Docker logs, verify mingw-w64 installation

### macOS build fails "signing timeout"
**Cause**: Missing OSX_CODESIGN_ROLE or S3 bucket
**Fix**: Set `signing: false` or set up AWS infrastructure

---

## ROLLBACK PLAN

If builds break after changes:

```bash
# Revert workflow changes:
cd /d/goose
git checkout origin/main -- .github/workflows/

# Or revert specific workflow:
git checkout origin/main -- .github/workflows/release.yml
```

---

## SUCCESS CRITERIA

✅ You'll know it's working when:
1. Canary build completes without errors
2. All 8 artifacts uploaded to GitHub Release "canary" tag
3. You can download and run goose binaries on Windows/Linux/macOS
4. CI pipeline passes on PRs

---

**Next**: See GITHUB_WORKFLOWS_AUDIT_REPORT.md for complete analysis
