# GitLab CE Docker Setup Guide

Run your own GitLab instance locally - no cloud costs, unlimited CI/CD!

## Quick Start (5 minutes)

```powershell
# Install GitLab CE
.\gitlab-docker-setup.ps1 -Install

# Wait 3-5 minutes for startup, then open desktop shortcut:
# "GitLab Local" on your desktop → http://localhost:8080
```

## What You Get

- ✅ **GitLab CE** - Full-featured Git server
- ✅ **CI/CD Pipelines** - Unlimited free builds
- ✅ **GitLab Runner** - Run jobs locally
- ✅ **Private** - Everything on your machine
- ✅ **Desktop Shortcut** - Quick access
- ✅ **Auto-start** - Starts with Docker

## System Requirements

- **Docker Desktop** - Required (auto-installed if missing)
- **Disk Space** - 10GB for GitLab + builds
- **RAM** - 4GB minimum, 8GB recommended
- **Port** - 8080 (customizable)

## Installation Steps

### 1. Install GitLab

```powershell
.\gitlab-docker-setup.ps1 -Install
```

This will:
- Check/install Docker Desktop
- Pull GitLab CE image (~2GB)
- Create data directory: `C:\Users\Admin\gitlab-data`
- Start GitLab container
- Create desktop shortcut

**Wait 3-5 minutes** for GitLab to fully start!

### 2. Get Initial Password

```powershell
.\gitlab-docker-setup.ps1 -Status
```

Or manually:
```powershell
docker exec -it gitlab-ce-local cat /etc/gitlab/initial_root_password
```

### 3. Login

1. Double-click **"GitLab Local"** desktop shortcut
2. Username: `root`
3. Password: (from step 2)
4. Change password on first login

## Daily Usage

### Start/Stop GitLab

```powershell
# Start
.\gitlab-docker-setup.ps1 -Start

# Stop
.\gitlab-docker-setup.ps1 -Stop

# Check status
.\gitlab-docker-setup.ps1 -Status
```

### Create Your First Project

1. Click **"GitLab Local"** shortcut
2. New Project → Create blank project
3. Name: `goose`
4. Visibility: Private
5. Initialize with README: ✓

### Push Existing Code

```powershell
cd C:\Users\Admin\Downloads\projects\goose

# Add GitLab remote
git remote add gitlab http://localhost:8080/root/goose.git

# Push code
git push gitlab main
```

### Setup CI/CD Pipeline

Your `.gitlab-ci.yml` is already configured! Just push and it runs automatically.

```powershell
git push gitlab main
# CI pipeline starts automatically
# View at: http://localhost:8080/root/goose/-/pipelines
```

## Advanced Usage

### Custom Port

```powershell
.\gitlab-docker-setup.ps1 -Install -Port 9000
# Access at: http://localhost:9000
```

### Uninstall

```powershell
.\gitlab-docker-setup.ps1 -Uninstall
# Removes container and all data
```

### View Logs

```powershell
docker logs gitlab-ce-local --tail 100
```

### Restart GitLab

```powershell
docker restart gitlab-ce-local
```

## GitLab Runner Setup (for CI/CD)

After GitLab is running, install the runner:

```powershell
# Download GitLab Runner
Invoke-WebRequest -Uri "https://gitlab-runner-downloads.s3.amazonaws.com/latest/binaries/gitlab-runner-windows-amd64.exe" -OutFile "C:\GitLab-Runner\gitlab-runner.exe"

# Install as service
cd C:\GitLab-Runner
.\gitlab-runner.exe install
.\gitlab-runner.exe start

# Register runner
.\gitlab-runner.exe register
# URL: http://localhost:8080
# Token: (get from GitLab → Settings → CI/CD → Runners)
# Tags: windows,local
# Executor: shell
```

Now your `.gitlab-ci.yml` pipelines will run automatically!

## Data Location

All GitLab data is stored in:
```
C:\Users\Admin\gitlab-data\
├── config/   # GitLab configuration
├── logs/     # Application logs
└── data/     # Git repositories, database, etc.
```

**Backup this folder** to save your repos and settings!

## Troubleshooting

### "Docker not found"
```powershell
winget install Docker.DockerDesktop
# Restart computer
```

### "GitLab not responding"
```powershell
# Wait 5 minutes (initial startup is slow)
# Check status:
docker logs gitlab-ce-local --tail 50
```

### "Port 8080 already in use"
```powershell
# Use different port:
.\gitlab-docker-setup.ps1 -Install -Port 9000
```

### "Container won't start"
```powershell
# Check Docker is running:
docker ps

# Restart Docker Desktop
# Try again:
.\gitlab-docker-setup.ps1 -Start
```

## Cost Comparison

| Solution | Monthly Cost | Build Minutes | Storage |
|----------|--------------|---------------|---------|
| GitHub Actions | $100+ | 3,000 (then $0.008/min) | 500MB |
| GitLab.com | $19-99 | 10,000-50,000 | 10-100GB |
| **GitLab Docker (Local)** | **$0** | **Unlimited** | **Unlimited** |

## Why Local GitLab?

1. **Zero Cost** - No cloud bills
2. **Unlimited CI/CD** - Run as many builds as you want
3. **Private** - Never leaves your machine
4. **Fast** - Local network speeds
5. **Full Control** - Configure everything
6. **Learning** - Practice GitLab/DevOps

## Next Steps

1. ✅ Install GitLab: `.\gitlab-docker-setup.ps1 -Install`
2. ⏳ Wait 5 minutes for startup
3. 🔐 Get root password: `.\gitlab-docker-setup.ps1 -Status`
4. 🌐 Open "GitLab Local" shortcut
5. 📝 Create project and push code
6. 🚀 CI/CD runs automatically!

## Need Help?

- GitLab docs: https://docs.gitlab.com/ee/install/docker.html
- Check status: `.\gitlab-docker-setup.ps1 -Status`
- View logs: `docker logs gitlab-ce-local`
