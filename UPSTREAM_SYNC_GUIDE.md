# Upstream Sync Guide - Staying in Sync with block/goose

## ✅ You're Now Connected!

Your fork `Ghenghis/goose` is now properly connected to `block/goose` with automatic syncing enabled.

---

## 🔄 Automatic Syncing (Enabled!)

**GitHub Actions Workflow**: `.github/workflows/sync-upstream.yml`

### How It Works
1. ⏰ **Runs daily at 3 AM UTC**
2. 🔍 **Checks** how many commits behind block/goose
3. 🔀 **Merges** automatically if no conflicts
4. ✅ **Pushes** to your fork
5. 🚨 **Creates issue** if conflicts detected

### Status
- ✅ Workflow committed and active
- ✅ Will run tomorrow at 3 AM UTC
- ✅ Can trigger manually anytime

---

## 🎮 Manual Sync (Anytime)

### Option 1: GitHub Web Interface (Easiest)
1. Go to https://github.com/Ghenghis/goose/actions
2. Click "Sync with upstream block/goose" workflow
3. Click "Run workflow" → "Run workflow"
4. Wait ~30 seconds
5. Check if merge succeeded

### Option 2: Command Line (What We Just Did)
```bash
cd /c/Users/Admin/Downloads/projects/goose

# Fetch latest from block
git fetch block main

# Check commits behind
git log --oneline main..block/main

# Merge upstream
git merge block/main --no-edit

# Push to your fork
git push origin main
```

---

## 📊 Current Status (2026-02-06)

**Before Sync**:
- 🔴 13 commits behind block/goose
- 🔴 Disconnected in GitHub UI

**After Sync** (NOW):
- ✅ Fully up-to-date with block/goose
- ✅ Connected and syncing automatically
- ✅ All 13 upstream commits merged
- ✅ No conflicts

**Your Commits**: 21 commits (your work)
**Block Commits**: 13 commits merged (just now)
**Total**: 34 commits ahead of original fork point

---

## 🔍 What Got Merged (13 Commits from block/goose)

Recent upstream commits merged:
1. `4dc1fbedd` - fix: ensure animated elements visible with prefers-reduced-motion
2. `3dcb03c6c` - Show recommended model on failure
3. `459ae33df` - feat(ui): add session content search via API
4. `99c25c4f0` - docs: fix img url
5. `0853e9fc1` - Desktop UI for deleting custom providers
6. `7ed5b4cf8` - Add blog post: How I Used RPI to Build an OpenClaw Alternative
7. `ac786197e` - Remove build-dependencies section from Cargo.toml
8. `dd675a2de` - add /rp-why skill blog post
9. `ca058c461` - fix: fix snake_case function names in code_execution
10. `966ced19b` - Document max_turns settings for recipes and subagents
11. `01e31f7c8` - feat: update Groq declarative data with Preview Models
12. `3324711c9` - fix(codex): propagate extended PATH to codex subprocess
13. `14a9d1e61` - Switch tetrate tool filtering back to supports_computer_use

**Impact**: Added new features, blog posts, bug fixes, documentation improvements

---

## 🚨 When Conflicts Happen

### Automatic Detection
If the workflow encounters merge conflicts:
1. ❌ Merge aborts automatically (safe)
2. 🎫 GitHub issue created automatically
3. 📧 You get notified
4. 📝 Issue includes merge instructions

### Manual Resolution
```bash
# Fetch updates
git fetch block main

# Try merge
git merge block/main

# If conflicts occur:
# 1. Git shows conflict markers in files
# 2. Edit files to resolve conflicts
# 3. Remove conflict markers (<<<<, ====, >>>>)
# 4. Stage resolved files
git add <resolved-files>

# Complete merge
git commit

# Push
git push origin main
```

---

## 📋 Common Sync Scenarios

### Scenario 1: Check if Behind
```bash
git fetch block main
git log --oneline main..block/main | wc -l
# Shows number of commits behind
```

### Scenario 2: See What's New Upstream
```bash
git fetch block main
git log --oneline --no-decorate main..block/main
# Shows commit messages
```

### Scenario 3: Preview Changes Before Merge
```bash
git fetch block main
git diff main..block/main
# Shows full diff of changes
```

### Scenario 4: Sync All Branches
```bash
# Fetch all branches from block
git fetch block

# List all upstream branches
git branch -r | grep block/

# Sync specific branch
git checkout feature-branch
git merge block/feature-branch
```

---

## ⚙️ Configuration

### Git Remotes
```bash
# Your current setup:
origin  -> https://github.com/Ghenghis/goose.git (your fork)
block   -> https://github.com/block/goose.git (upstream)
fork    -> https://github.com/Ghenghis/goose.git (duplicate, can remove)
gitlab  -> https://gitlab.com/Ghenghis/goose.git (your GitLab)
```

### Optional: Clean Up Duplicate Remote
```bash
git remote remove fork  # Remove duplicate
git remote -v           # Verify
```

---

## 🎯 Best Practices

### Before Starting New Work
```bash
# Always sync first!
git fetch block main
git merge block/main
git push origin main
# Now your work starts from latest upstream
```

### After Finishing Work
```bash
# Commit your work
git add .
git commit -m "feat: your feature"

# Sync before pushing
git fetch block main
git merge block/main  # Merge any new upstream changes

# Push
git push origin main
```

### Regular Maintenance
- ✅ Let auto-sync run daily (no action needed)
- ✅ Check Actions tab weekly for issues
- ✅ Manually sync before big changes
- ✅ Keep feature branches short-lived

---

## 🔗 Useful Links

**Your Fork**: https://github.com/Ghenghis/goose
**Upstream**: https://github.com/block/goose
**Actions**: https://github.com/Ghenghis/goose/actions
**Sync Workflow**: https://github.com/Ghenghis/goose/actions/workflows/sync-upstream.yml

---

## 📞 Troubleshooting

### Workflow Not Running?
1. Check Actions tab is enabled: Settings → Actions → General → "Allow all actions"
2. Workflow file committed: `.github/workflows/sync-upstream.yml`
3. Wait until 3 AM UTC tomorrow for first auto-run

### Merge Conflicts Every Time?
- Your changes conflict with upstream frequently
- Solution: Work in feature branches, not main
- Merge upstream into feature branches before PR

### Want to Disable Auto-Sync?
```bash
# Delete workflow file
rm .github/workflows/sync-upstream.yml
git add .github/workflows/sync-upstream.yml
git commit -m "disable auto-sync"
git push
```

### Want to Sync More/Less Often?
Edit `.github/workflows/sync-upstream.yml`:
```yaml
schedule:
  # Every 6 hours
  - cron: '0 */6 * * *'

  # Every Monday at 9 AM
  - cron: '0 9 * * 1'

  # Twice daily (9 AM and 9 PM UTC)
  - cron: '0 9,21 * * *'
```

---

## ✅ Success Checklist

- [x] Fork connected to block/goose
- [x] 13 commits merged successfully
- [x] Auto-sync workflow active
- [x] No merge conflicts
- [x] All changes pushed
- [x] Documentation created

**Status**: ✅ **Fully synchronized and automated!**

---

**Last Sync**: 2026-02-06
**Commits Merged**: 13
**Auto-Sync**: Enabled (daily at 3 AM UTC)
**Next Auto-Sync**: Tomorrow
