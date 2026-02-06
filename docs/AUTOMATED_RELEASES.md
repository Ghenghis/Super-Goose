# Automated Releases, Packages & Deployments Guide

## Overview

This guide explains how to set up fully automated releases for the Goose project, including building, signing, packaging, and deploying for Windows, Linux, and macOS.

## Current Status (2026-02-06)

- ✅ GitLab CI/CD configured for builds
- ⏳ Code signing certificate submitted (awaiting SignPath approval)
- 🔴 Automated release workflow not yet configured
- 🔴 Release tagging not automated

---

## Automated Release Strategy

### Three-Tier Approach

1. **Development Builds** (Every commit to `main`)
2. **Canary Releases** (Nightly/Weekly)
3. **Production Releases** (Version tags: `v1.23.0`)

---

## 1. Development Builds (Continuous)

**Trigger**: Every push to `main` branch
**Purpose**: Catch issues early, ensure buildability
**Artifacts**: None published (CI validation only)

### GitLab CI Configuration

Already configured in `.gitlab-ci.yml`:
- `build-rust` - Validates Rust compilation
- `build-windows-cli` - Builds portable CLI
- `build-windows-desktop` - Builds Electron app

**Status**: ✅ Already working

---

## 2. Canary Releases (Preview Builds)

**Trigger**: Scheduled (e.g., daily at 2 AM) or manual
**Purpose**: Testing latest features before official release
**Artifacts**: Unsigned builds for internal testing
**Distribution**: GitLab package registry or internal server

### Implementation

Add to `.gitlab-ci.yml`:

```yaml
canary-release:
  stage: release
  only:
    - schedules  # Triggered by GitLab pipeline schedule
    - web        # Allow manual trigger
  script:
    # Build all platforms
    - pwsh build-local.ps1 -PortableCLI
    - cd ui/desktop && npm run make

    # Tag with canary version
    - $CANARY_VERSION = "canary-$(Get-Date -Format 'yyyyMMdd-HHmm')"

    # Create GitLab release
    - |
      curl --request POST --header "PRIVATE-TOKEN: $CI_JOB_TOKEN" \
        "https://gitlab.com/api/v4/projects/$CI_PROJECT_ID/releases" \
        --form "name=Canary $CANARY_VERSION" \
        --form "tag_name=$CANARY_VERSION" \
        --form "description=Automated canary build from commit $CI_COMMIT_SHORT_SHA"

  artifacts:
    paths:
      - target/release/goose.exe
      - ui/desktop/out/make/**/*.exe
    expire_in: 7 days
```

### Setup Pipeline Schedule

1. Go to GitLab: **CI/CD → Schedules**
2. Click **New schedule**
3. Description: "Daily Canary Release"
4. Interval: `0 2 * * *` (2 AM daily)
5. Target branch: `main`
6. Variable: `CANARY_BUILD=true`

---

## 3. Production Releases (Version Tags)

**Trigger**: Git tag push (e.g., `git tag v1.23.0 && git push origin v1.23.0`)
**Purpose**: Official releases for end users
**Artifacts**: Signed installers, checksums, release notes
**Distribution**: GitHub Releases (upstream) + GitLab Releases (fork)

### Semantic Versioning

Follow semantic versioning (https://semver.org/):
- `v1.2.3` - MAJOR.MINOR.PATCH
- `v1.2.3-beta.1` - Pre-release
- `v1.2.3-rc.1` - Release candidate

### Automated Release Workflow

Add to `.gitlab-ci.yml`:

```yaml
production-release:
  stage: release
  only:
    refs:
      - tags           # Only run on version tags
    variables:
      - $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/  # Match v1.2.3 format
  script:
    # Extract version from tag
    - $VERSION = $CI_COMMIT_TAG -replace '^v',''

    # Build all platforms
    - pwsh build-local.ps1 -PortableCLI
    - cd ui/desktop && npm run make

    # Code signing (when certificate approved)
    - |
      if ($env:SIGNPATH_API_TOKEN) {
        # Submit to SignPath for signing
        # (Implementation depends on SignPath API)
      }

    # Generate checksums
    - Get-FileHash target/release/goose.exe -Algorithm SHA256 | Out-File checksums.txt
    - Get-FileHash ui/desktop/out/make/**/*.exe -Algorithm SHA256 | Out-File -Append checksums.txt

    # Create release notes from CHANGELOG
    - $RELEASE_NOTES = Get-Content CHANGELOG.md | Select-String -Pattern "## \[$VERSION\]" -Context 0,20

    # Create GitLab release
    - |
      curl --request POST \
        --header "PRIVATE-TOKEN: $GITLAB_API_TOKEN" \
        "https://gitlab.com/api/v4/projects/$CI_PROJECT_ID/releases" \
        --form "name=Goose v$VERSION" \
        --form "tag_name=$CI_COMMIT_TAG" \
        --form "description=$RELEASE_NOTES" \
        --form "assets[links][][name]=Windows CLI" \
        --form "assets[links][][url]=$CI_PROJECT_URL/-/jobs/$CI_JOB_ID/artifacts/raw/target/release/goose.exe"

  artifacts:
    paths:
      - target/release/goose.exe
      - ui/desktop/out/make/**/*
      - checksums.txt
    expire_in: never  # Keep production releases forever
```

---

## 4. Release Automation Script

Create `scripts/create-release.ps1` for one-command releases:

```powershell
<#
.SYNOPSIS
    Create a new Goose release automatically
.PARAMETER Version
    Version number (e.g., 1.23.0)
.PARAMETER Type
    Release type: major, minor, or patch
#>
param(
    [string]$Version,
    [ValidateSet('major','minor','patch')]
    [string]$Type = 'patch'
)

# Validate clean working tree
if (git status --porcelain) {
    Write-Error "Working tree is not clean. Commit or stash changes first."
    exit 1
}

# Auto-increment version if not specified
if (-not $Version) {
    $CurrentTag = git describe --tags --abbrev=0 2>$null
    if ($CurrentTag -match 'v(\d+)\.(\d+)\.(\d+)') {
        $Major = [int]$Matches[1]
        $Minor = [int]$Matches[2]
        $Patch = [int]$Matches[3]

        switch ($Type) {
            'major' { $Major++; $Minor=0; $Patch=0 }
            'minor' { $Minor++; $Patch=0 }
            'patch' { $Patch++ }
        }

        $Version = "$Major.$Minor.$Patch"
    } else {
        $Version = "1.0.0"  # First release
    }
}

$Tag = "v$Version"

Write-Host "Creating release $Tag"

# Update version in files
(Get-Content ui/desktop/package.json) -replace '"version": "[\d\.]+"', "`"version`": `"$Version`"" | Set-Content ui/desktop/package.json
(Get-Content Cargo.toml) -replace 'version = "[\d\.]+"', "version = `"$Version`"" | Set-Content Cargo.toml

# Commit version bump
git add ui/desktop/package.json Cargo.toml
git commit -m "chore: bump version to $Version"

# Create and push tag
git tag -a $Tag -m "Release $Tag"
git push origin main
git push origin $Tag

Write-Host "✅ Release $Tag created!"
Write-Host "📦 GitLab CI will build and publish artifacts automatically"
Write-Host "🔗 Track progress: https://gitlab.com/Ghenghis/goose/-/pipelines"
```

### Usage

```powershell
# Patch release (1.23.0 → 1.23.1)
pwsh scripts/create-release.ps1 -Type patch

# Minor release (1.23.1 → 1.24.0)
pwsh scripts/create-release.ps1 -Type minor

# Specific version
pwsh scripts/create-release.ps1 -Version 2.0.0
```

---

## 5. Code Signing Integration

### SignPath.io Setup (When Certificate Approved)

Update `.gitlab-ci.yml` with signing step:

```yaml
sign-windows:
  stage: sign
  only:
    - tags
  script:
    # Submit to SignPath
    - |
      $response = Invoke-RestMethod -Method Post `
        -Uri "https://app.signpath.io/API/v1/$env:SIGNPATH_ORG_ID/SigningRequests" `
        -Headers @{ "Authorization" = "Bearer $env:SIGNPATH_API_TOKEN" } `
        -Form @{
          "ProjectSlug" = "goose"
          "SigningPolicySlug" = "release-signing"
          "ArtifactConfigurationSlug" = "default"
          "InputArtifactFile" = Get-Item "ui/desktop/out/make/**/*.exe"
        }

    # Wait for signing to complete
    - $signingRequestId = $response.SigningRequestId
    - |
      while ($true) {
        $status = Invoke-RestMethod `
          -Uri "https://app.signpath.io/API/v1/$env:SIGNPATH_ORG_ID/SigningRequests/$signingRequestId" `
          -Headers @{ "Authorization" = "Bearer $env:SIGNPATH_API_TOKEN" }

        if ($status.Status -eq "Completed") {
          # Download signed artifact
          Invoke-WebRequest `
            -Uri "https://app.signpath.io/API/v1/$env:SIGNPATH_ORG_ID/SigningRequests/$signingRequestId/SignedArtifact" `
            -Headers @{ "Authorization" = "Bearer $env:SIGNPATH_API_TOKEN" } `
            -OutFile "ui/desktop/out/make/signed-installer.exe"
          break
        } elseif ($status.Status -eq "Failed") {
          throw "Signing failed: $($status.ErrorMessage)"
        }

        Start-Sleep -Seconds 30
      }
```

### Required GitLab CI Variables

Go to **Settings → CI/CD → Variables** and add:

- `SIGNPATH_ORG_ID` - Your SignPath organization ID
- `SIGNPATH_API_TOKEN` - API token from SignPath (masked, protected)
- `GITLAB_API_TOKEN` - GitLab personal access token for releases

---

## 6. Release Checklist

### Pre-Release (Manual Steps)

- [ ] All tests passing (`npm run test` and `cargo test`)
- [ ] CHANGELOG.md updated with new version section
- [ ] Version numbers consistent across files
- [ ] Git working tree clean (no uncommitted changes)
- [ ] Code signing certificate approved (for production)

### Automated Steps (Triggered by Tag Push)

- [ ] Rust compilation (all platforms)
- [ ] TypeScript compilation and lint
- [ ] Unit tests (Rust + TypeScript)
- [ ] Portable CLI build
- [ ] Desktop installer build
- [ ] Code signing (Windows executables)
- [ ] Checksum generation
- [ ] GitLab release creation
- [ ] Artifact upload

### Post-Release (Manual Verification)

- [ ] Download and test Windows installer
- [ ] Verify code signature (Right-click → Properties → Digital Signatures)
- [ ] Test auto-update mechanism
- [ ] Announce release (if public)

---

## 7. Auto-Update Configuration

### Electron Auto-Updater

The desktop app already has auto-update configured in `src/utils/autoUpdater.ts`.

**Update server URL**: Configure in Electron Forge:

```typescript
// ui/desktop/forge.config.ts
export const config = {
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'Ghenghis',
          name: 'goose'
        },
        prerelease: false,
        draft: true  // Releases start as drafts
      }
    }
  ]
}
```

### Update Manifest

Auto-updater checks for updates by comparing versions. Ensure:
1. `package.json` version matches release tag
2. Release has proper RELEASES file (Squirrel.Windows)
3. Update server is accessible

---

## 8. Multi-Platform Releases

### Windows (Primary Platform)

**Formats**:
- `.exe` installer (Squirrel.Windows)
- Portable CLI (standalone exe)

**Code Signing**: Required to avoid SmartScreen warnings

### Linux

**Formats**:
- `.deb` (Debian/Ubuntu)
- `.rpm` (Fedora/RHEL)
- AppImage (universal)

**Add to CI**:

```yaml
build-linux:
  image: electronuserland/builder:wine
  stage: build
  only:
    - tags
  script:
    - cd ui/desktop
    - npm run make -- --platform linux
  artifacts:
    paths:
      - ui/desktop/out/make/**/*
```

### macOS

**Formats**:
- `.dmg` installer
- `.zip` (for Homebrew)

**Code Signing**: Requires Apple Developer account + certificate

**Add to CI** (requires macOS runner):

```yaml
build-macos:
  tags:
    - macos
  only:
    - tags
  script:
    - cd ui/desktop
    - npm run make -- --platform darwin
  artifacts:
    paths:
      - ui/desktop/out/make/**/*
```

---

## 9. Release Notes Automation

### CHANGELOG.md Format

Use Keep a Changelog format (https://keepachangelog.com/):

```markdown
# Changelog

## [1.23.0] - 2026-02-06

### Added
- LM Studio provider support
- Automatic upstream sync workflow

### Fixed
- React 19 test compatibility
- TypeScript compilation errors

### Changed
- Relaxed Node.js version requirement to 24+

## [1.22.0] - 2026-01-15
...
```

### Auto-Generate from Git

```powershell
# Extract commits since last tag
$LastTag = git describe --tags --abbrev=0
$Commits = git log $LastTag..HEAD --pretty=format:"- %s (%an)"

# Categorize by commit type (conventional commits)
$Added = $Commits | Select-String "^- feat:"
$Fixed = $Commits | Select-String "^- fix:"
$Changed = $Commits | Select-String "^- chore:|^- refactor:"

# Append to CHANGELOG.md
@"
## [$NewVersion] - $(Get-Date -Format 'yyyy-MM-dd')

### Added
$($Added -join "`n")

### Fixed
$($Fixed -join "`n")

### Changed
$($Changed -join "`n")
"@ | Add-Content CHANGELOG.md -Encoding UTF8
```

---

## 10. Monitoring & Notifications

### GitLab CI Notifications

**Slack Integration**:

```yaml
notify-slack:
  stage: .post
  when: on_failure
  script:
    - |
      curl -X POST $SLACK_WEBHOOK_URL \
        -H 'Content-Type: application/json' \
        -d "{\"text\":\"❌ Release build failed: $CI_COMMIT_TAG\nPipeline: $CI_PIPELINE_URL\"}"
```

**Email Notifications**:
- GitLab: **Settings → Integrations → Emails on push**
- Configure to notify on failed pipelines

---

## 11. Quick Start Guide

### First-Time Setup (One-Time)

1. **Configure GitLab CI Variables**:
   ```
   SIGNPATH_ORG_ID = <your-org-id>
   SIGNPATH_API_TOKEN = <masked-token>
   GITLAB_API_TOKEN = <personal-access-token>
   ```

2. **Create release script**:
   ```powershell
   New-Item scripts/create-release.ps1
   # Copy script content from section 4
   ```

3. **Test canary build**:
   ```
   CI/CD → Pipelines → Run pipeline → Add variable: CANARY_BUILD=true
   ```

### Creating a Release (Every Time)

**Method 1: Automated Script**
```powershell
cd C:\Users\Admin\Downloads\projects\goose
pwsh scripts/create-release.ps1 -Type patch
```

**Method 2: Manual**
```bash
# 1. Update CHANGELOG.md
# 2. Bump version in package.json and Cargo.toml
# 3. Commit changes
git add .
git commit -m "chore: prepare release v1.23.1"

# 4. Create and push tag
git tag v1.23.1
git push origin main
git push origin v1.23.1

# 5. CI automatically builds and publishes
```

---

## 12. Troubleshooting

### Build Fails on Tag Push

**Check**:
1. All tests passing locally?
2. Version numbers consistent?
3. CHANGELOG.md has entry for this version?

**Fix**:
```bash
# Delete bad tag
git tag -d v1.23.0
git push origin :refs/tags/v1.23.0

# Fix issues, then retry
git tag v1.23.0
git push origin v1.23.0
```

### Code Signing Fails

**Common Issues**:
- SignPath certificate not yet approved
- API token expired
- Certificate doesn't match signing policy

**Workaround**:
Temporarily disable signing in CI (for internal testing only):

```yaml
sign-windows:
  stage: sign
  when: manual  # Require manual trigger
```

### Auto-Update Not Working

**Check**:
1. `autoUpdater.ts` configured with correct update server URL
2. Release has RELEASES file (Squirrel.Windows requirement)
3. User's installed version < latest release version
4. Firewall not blocking update server

---

## Summary

**Current Status**:
- ✅ Build pipeline configured
- ⏳ Code signing pending approval
- 🔴 Automated releases not yet enabled

**Next Steps**:
1. Wait for SignPath certificate approval (2-3 days)
2. Add production release job to `.gitlab-ci.yml`
3. Create `scripts/create-release.ps1`
4. Test with first automated release (v1.24.0)

**Timeline**: Ready for first automated release in 1 week (after certificate approval)

---

**Document Version**: 1.0
**Created**: 2026-02-06
**Last Updated**: 2026-02-06
**Status**: Planning Phase
