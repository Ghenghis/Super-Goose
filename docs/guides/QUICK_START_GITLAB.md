# Quick Start: GitLab + GitKraken

You have GitKraken Pro! Let's set up GitLab and start using it.

## What's Happening Now

✅ **Desktop Shortcut Created** - "GitLab Local" on your desktop
⏳ **GitLab Image Downloading** - ~2GB, takes 5-10 minutes
⏳ **Container Will Start** - Automatically once download completes

## Next Steps (Once GitLab Starts)

### 1. Wait for GitLab to Start (~5 minutes)

The download is running in background. When complete:
- Container starts automatically
- GitLab initializes (3-5 minutes)
- Then it's ready at: http://localhost:8080

### 2. Get Root Password

```powershell
docker exec -it gitlab-ce-local cat /etc/gitlab/initial_root_password
```

Or:
```bash
docker exec -it gitlab-ce-local grep 'Password:' /etc/gitlab/initial_root_password
```

### 3. Login to GitLab

1. Double-click **"GitLab Local"** desktop shortcut
2. Username: `root`
3. Password: (from step 2)
4. **Change password** on first login

### 4. Create Personal Access Token (for GitKraken)

1. In GitLab → Click your avatar (top right)
2. Preferences → Access Tokens
3. Name: `GitKraken`
4. Scopes: ✓ `api`, ✓ `read_repository`, ✓ `write_repository`
5. Click "Create personal access token"
6. **Copy the token** (you can't see it again!)

### 5. Connect GitKraken to GitLab

1. Open GitKraken (already installed at `C:\Users\Admin\AppData\Local\gitkraken`)
2. File → Preferences → Integrations
3. GitLab Self-Hosted → Connect
4. Host Domain: `http://localhost:8080`
5. Personal Access Token: (paste from step 4)
6. Click "Connect"

### 6. Create Project in GitLab

1. Click **"GitLab Local"** shortcut
2. New Project → Create blank project
3. Project name: `goose`
4. Visibility: Private
5. Initialize with README: ✓
6. Create project

### 7. Push Goose Code to GitLab

```bash
cd C:\Users\Admin\Downloads\projects\goose

# Add GitLab remote
git remote add gitlab http://localhost:8080/root/goose.git

# Push code
git push gitlab main
```

### 8. Open in GitKraken

In GitKraken:
- Click "goose" in Recent Repos
- Or: File → Open → `C:\Users\Admin\Downloads\projects\goose`
- You'll see GitHub (origin) AND GitLab remotes!

## Daily Usage

### Start/Stop GitLab

```powershell
# Check status
docker ps | findstr gitlab

# Start (if stopped)
docker start gitlab-ce-local

# Stop (to save resources)
docker stop gitlab-ce-local
```

### Using GitKraken with GitLab

**Push to GitLab:**
1. Make commits in GitKraken (or Claude/Windsurf)
2. Click Push button
3. Select `gitlab/main`
4. CI/CD runs automatically!

**Pull from GitLab:**
1. Click Pull button
2. Select `gitlab/main`
3. Gets latest changes

**View CI/CD:**
1. Open GitLab Local shortcut
2. Your Project → CI/CD → Pipelines
3. See build status, logs, artifacts

## Troubleshooting

### Check if GitLab is running
```bash
docker ps | grep gitlab
```

### View GitLab logs
```bash
docker logs gitlab-ce-local --tail 100
```

### GitLab not responding
Wait 5 minutes after first start - it's slow to initialize!

### Get root password again
```bash
docker exec -it gitlab-ce-local cat /etc/gitlab/initial_root_password
```

## What You Get

✅ **Unlimited CI/CD** - Run builds locally, zero cost
✅ **Private Git Server** - Never leaves your machine
✅ **GitKraken Integration** - Beautiful visual interface
✅ **Claude/Windsurf Work** - All use same Git CLI
✅ **Desktop Shortcut** - Quick access

## Cost Savings

- GitHub Actions: $100+ (your case)
- **GitLab Local: $0**
- Unlimited builds forever!

## Ready?

Once the download completes (check with `docker images | grep gitlab`), the container will start automatically and you can begin at step 2 above!
