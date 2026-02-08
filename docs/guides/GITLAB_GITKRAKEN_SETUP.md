# GitLab + GitKraken Integration Guide

Perfect setup for Claude Code, Windsurf IDE, and CLI workflows!

## Why GitLab + GitKraken?

✅ **GitKraken** - Beautiful GUI for Git operations
✅ **GitLab** - Self-hosted with unlimited CI/CD
✅ **CLI Compatible** - Works with all IDEs and Claude
✅ **Universal** - Claude Code, Windsurf, VS Code all work seamlessly

## Quick Setup

### 1. Install GitLab (5 minutes)
```powershell
.\gitlab-docker-setup.ps1 -Install
# Wait 5 minutes, then access: http://localhost:8080
```

### 2. Install GitKraken (2 minutes)
```powershell
winget install Axosoft.GitKraken
```

### 3. Connect GitKraken to GitLab

1. Open GitKraken
2. File → Preferences → Integrations
3. GitLab → Connect
4. Host Domain: `http://localhost:8080`
5. Personal Access Token:
   - Go to GitLab → User Settings → Access Tokens
   - Name: `GitKraken`
   - Scopes: ✓ api, ✓ read_repository, ✓ write_repository
   - Create token
   - Copy and paste into GitKraken

### 4. Clone/Open Repository

**In GitKraken:**
- File → Clone → GitLab
- Select your repo
- Clone to local folder

**Or use existing:**
- File → Open → Browse to: `C:\Users\Admin\Downloads\projects\goose`

## How It All Works Together

```
GitLab (localhost:8080)
    ↓
    ├──→ GitKraken (GUI - visual operations)
    ├──→ Claude Code (CLI - git commands)
    ├──→ Windsurf IDE (CLI - git commands)
    └──→ Terminal (CLI - git commands)
```

**All use the same Git CLI underneath!**

## Claude Code + GitLab

Claude Code uses standard `git` commands, so it works automatically:

```bash
# Claude can run:
git status
git add .
git commit -m "message"
git push gitlab main
git pull gitlab main
```

**No special setup needed!** Just add GitLab as a remote:

```powershell
git remote add gitlab http://localhost:8080/root/goose.git
git push gitlab main
```

## Windsurf IDE + GitLab

Windsurf uses built-in Git CLI, works perfectly:

1. Open Windsurf
2. Source Control panel (Ctrl+Shift+G)
3. Works with GitLab automatically
4. Push/pull/commit all work

**GitKraken shows the same commits** - they all use the same Git!

## GitKraken Benefits

### Visual Operations
- See commit graph
- Drag-and-drop branches
- Merge conflict resolution
- Interactive rebase
- Beautiful diffs

### CLI Still Works
GitKraken doesn't replace CLI - it complements it:
- Claude uses CLI → GitKraken shows it
- GitKraken commits → Claude sees them
- Both work on same repo

### Multi-Remote Management
```
GitKraken can manage:
├── origin (GitHub)
├── gitlab (GitLab local)
└── backup (any other remote)
```

Push to multiple remotes with one click!

## Typical Workflow

### Option 1: Claude Code (CLI)
```bash
# Claude commits and pushes
git add .
git commit -m "Add feature"
git push gitlab main

# GitKraken updates automatically
# Shows new commit in graph
```

### Option 2: GitKraken (GUI)
```
1. Stage files (click checkboxes)
2. Write commit message
3. Click "Commit"
4. Click "Push"

# Claude/Windsurf see changes immediately
git pull  # Gets GitKraken's commits
```

### Option 3: Windsurf IDE (Built-in)
```
1. Source Control panel
2. Stage changes
3. Commit
4. Push

# Works with GitLab + visible in GitKraken
```

## Best Practices

### Use Each Tool for Its Strengths

**GitKraken:**
- Complex merges
- Branch visualization
- Interactive rebase
- Reviewing history
- Managing remotes

**Claude Code:**
- Quick commits
- Automated workflows
- Bulk operations
- CI/CD fixes
- Code generation + commit

**Windsurf IDE:**
- While coding
- Quick commits
- Simple pushes
- Built-in review

## Example: Full Workflow

```powershell
# 1. Claude writes code
# Claude: "Add LM Studio provider fixes"
# → Code written → Committed via CLI

# 2. Push to GitLab
git push gitlab main

# 3. GitLab CI/CD runs automatically
# → Build and test
# → View in: http://localhost:8080/root/goose/-/pipelines

# 4. Check in GitKraken
# → See commit graph
# → Verify CI passed
# → Create release branch

# 5. Windsurf makes quick fix
# → Edit file
# → Commit via Source Control panel
# → Push

# All tools see the same Git history!
```

## Configuration

### Set Default Remote

```powershell
# Use GitLab by default
git config branch.main.remote gitlab

# Or push to both GitHub + GitLab
git remote set-url --add --push origin https://github.com/Ghenghis/goose.git
git remote set-url --add --push origin http://localhost:8080/root/goose.git
```

### GitKraken Preferences

**Recommended settings:**
- General → Auto-fetch: Every 5 minutes
- Commit → GPG sign commits: Optional
- Editor → External editor: VS Code or Windsurf

## Troubleshooting

### GitKraken can't see GitLab
```
- Check GitLab is running: .\gitlab-docker-setup.ps1 -Status
- Regenerate access token in GitLab
- Re-add integration in GitKraken
```

### Claude push fails
```powershell
# Check remotes
git remote -v

# Re-add GitLab remote
git remote add gitlab http://localhost:8080/root/goose.git
```

### Windsurf not showing changes
```
- Click refresh icon in Source Control
- Or: Ctrl+Shift+P → "Git: Refresh"
```

## Why This Setup is Perfect

| Tool | Purpose | Uses CLI? |
|------|---------|-----------|
| GitLab | Git server + CI/CD | N/A |
| GitKraken | Visual Git client | Yes (underneath) |
| Claude Code | AI coding + automation | Yes |
| Windsurf IDE | Code editor | Yes |

**All work together!** No conflicts, all see same Git state.

## Cost Comparison

| Solution | Monthly Cost |
|----------|--------------|
| GitHub + Actions | $100+ |
| GitLab.com | $19-99 |
| GitKraken Cloud | $4-9/user |
| **Local Setup** | **$0** |

GitKraken has a free tier for local repos!

## Next Steps

1. ✅ Install GitLab: `.\gitlab-docker-setup.ps1 -Install`
2. ✅ Install GitKraken: `winget install Axosoft.GitKraken`
3. ✅ Connect GitKraken to GitLab (access token)
4. ✅ Push code: `git push gitlab main`
5. ✅ Open GitKraken to see commit graph
6. ✅ Continue using Claude/Windsurf as normal!

Everything works together seamlessly! 🎉
