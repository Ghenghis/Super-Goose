# GitHub Secrets Configuration Guide

This document lists all GitHub secrets required for full workflow functionality.

## 🔴 Critical (Required for Signed Releases)

### Windows Code Signing
```
WINDOWS_CODESIGN_CERTIFICATE
```
**Purpose:** Signs Windows executables and installers
**Type:** Base64-encoded PFX certificate
**Current Status:** ⏳ SignPath approval pending (expected Feb 8-9)
**Setup:**
1. Wait for SignPath approval email
2. Download certificate from SignPath
3. Or use certificate from `C:\Users\Admin\Downloads\projects\CA-Goose\`
4. Add to GitHub Secrets

**Testing:** Currently disabled - builds work unsigned

### macOS Code Signing
```
OSX_CODESIGN_ROLE
```
**Purpose:** AWS IAM role for macOS code signing
**Type:** ARN string
**Current Status:** ❌ Not configured
**Alternative:** Build unsigned or use local developer certificate

---

## 🟡 High Priority (Recommended)

### Docker Registry
```
DOCKER_USERNAME
DOCKER_PASSWORD
```
**Purpose:** Push Docker images to ghcr.io
**Setup:**
1. Use GitHub token: `gh auth token`
2. Add as DOCKER_PASSWORD
3. Username: Your GitHub username

**Testing:** Workflows skip Docker push if not configured

### Anthropic AI (For Bots)
```
ANTHROPIC_API_KEY
```
**Purpose:** Powers AI bot features (issue solver, PR reviewer)
**Status:** Optional - bots show friendly message if missing
**Setup:** Get from anthropic.com

---

## 🟢 Optional (Nice to Have)

### AWS Infrastructure (Optional)
```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
```
**Purpose:** Upload build artifacts to S3
**Current Status:** Disabled - using GitHub Actions artifacts
**Alternative:** Keep disabled, GitHub artifacts work fine

---

## 📊 Configuration Priority

### For Testing Right Now (0 secrets needed):
✅ Workflows build unsigned artifacts
✅ Artifacts uploaded to GitHub
✅ Releases work without signing

### For Public Beta (1-2 secrets):
1. `WINDOWS_CODESIGN_CERTIFICATE` (most important)
2. `ANTHROPIC_API_KEY` (if using bots)

### For Professional Release (All critical):
1. Windows signing
2. macOS signing (optional)
3. Docker credentials

---

## Adding Secrets

### GitHub UI:
1. Go to: https://github.com/Ghenghis/Super-Goose/settings/secrets/actions
2. Click "New repository secret"
3. Add name and value
4. Save

### GitHub CLI:
```bash
gh secret set WINDOWS_CODESIGN_CERTIFICATE < cert.txt
gh secret set ANTHROPIC_API_KEY --body "sk-ant-..."
```

---

## Verification

```bash
# List configured secrets
gh secret list

# Test workflows
gh workflow run canary.yml
```

---

## Security Best Practices

✅ **DO:**
- Rotate certificates annually
- Use scoped API keys
- Enable secret scanning
- Document all secrets

❌ **DON'T:**
- Commit secrets to repository
- Share secrets in issues/PRs
- Use overly permissive tokens

---

**Last Updated:** February 7, 2026
**Next Review:** When SignPath approves certificate
