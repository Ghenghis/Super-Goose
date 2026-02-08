# GitLab Runner Local Setup Guide

Run CI/CD pipelines locally on your Windows machine to avoid cloud costs.

## Why GitLab Runner?

- ✅ **Free**: Run unlimited builds locally
- ✅ **Fast**: Uses local hardware, no upload/download delays
- ✅ **Private**: Builds never leave your machine
- ✅ **Cache**: Reuses dependencies between builds
- ✅ **Cost**: $0 vs $100+ for GitHub Actions

## Quick Setup (Windows)

### 1. Install GitLab Runner

```powershell
# Download GitLab Runner for Windows
Invoke-WebRequest -Uri "https://gitlab-runner-downloads.s3.amazonaws.com/latest/binaries/gitlab-runner-windows-amd64.exe" -OutFile "gitlab-runner.exe"

# Move to Program Files
New-Item -ItemType Directory -Force -Path "C:\GitLab-Runner"
Move-Item gitlab-runner.exe "C:\GitLab-Runner\gitlab-runner.exe"

# Install as Windows service
cd C:\GitLab-Runner
.\gitlab-runner.exe install
.\gitlab-runner.exe start
```

### 2. Register Local Runner

```powershell
# Register runner for local execution
cd C:\GitLab-Runner
.\gitlab-runner.exe register

# When prompted:
# GitLab URL: https://gitlab.com (or leave blank for local)
# Token: (press Enter to skip - for local use)
# Description: Local Windows Builder
# Tags: windows,local
# Executor: shell
```

### 3. Run Builds Locally

```powershell
# Navigate to your project
cd C:\Users\Admin\Downloads\projects\goose

# Run specific job
gitlab-runner exec shell build-windows-portable

# Run desktop build
gitlab-runner exec shell build-windows-desktop

# Check available jobs
cat .gitlab-ci.yml | findstr "^[a-z].*:"
```

## Alternative: Use PowerShell Script (Simpler)

If you don't want to install GitLab Runner, just use the build script:

```powershell
# Build everything
.\build-local.ps1 -All

# Build only CLI
.\build-local.ps1 -PortableCLI

# Build only desktop
.\build-local.ps1 -Desktop
```

## GitLab Runner vs PowerShell Script

| Feature | GitLab Runner | PowerShell Script |
|---------|---------------|-------------------|
| Setup | Needs installation | Ready to use |
| Caching | Built-in smart cache | Manual |
| Docker support | Yes (Linux builds) | No |
| CI/CD integration | Yes | No |
| Simplicity | Medium | Very simple |
| Best for | Multi-platform builds | Windows-only quick builds |

## Recommended Approach

**For Windows-only builds (fastest):**
```powershell
.\build-local.ps1 -All
```

**For multi-platform builds (Windows + Linux + Docker):**
```powershell
# Install GitLab Runner (one-time setup)
# Then run all platforms:
gitlab-runner exec shell build-windows-portable
gitlab-runner exec docker build-linux-portable
gitlab-runner exec docker build-docker
```

## Build Times & Costs

| Method | Time | Cost | Platforms |
|--------|------|------|-----------|
| GitHub Actions | 30-60 min | $100+ | All |
| GitLab Runner (local) | 15-30 min | $0 | All |
| PowerShell script | 10-15 min | $0 | Windows only |

## Troubleshooting

### GitLab Runner not found
```powershell
# Add to PATH
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\GitLab-Runner", "Machine")
```

### Docker executor fails
```powershell
# Install Docker Desktop
winget install Docker.DockerDesktop

# Restart GitLab Runner
.\gitlab-runner.exe restart
```

### Shell executor fails
```powershell
# Use PowerShell executor
# Edit: C:\GitLab-Runner\config.toml
# Change: shell = "powershell"
```

## Next Steps

1. Choose your method (GitLab Runner or PowerShell script)
2. Run your first build
3. Test the output binaries
4. Upload to GitHub release

## Cost Savings Example

**Before (GitHub Actions):**
- 10 failed builds × $10 each = $100+
- Each retry costs more

**After (Local builds):**
- Unlimited builds × $0 = $0
- Faster iteration
- No waiting in queue

## Support

- GitLab Runner docs: https://docs.gitlab.com/runner/
- PowerShell script: See BUILD_LOCAL.md
- Questions: Check .gitlab-ci.yml for job definitions
