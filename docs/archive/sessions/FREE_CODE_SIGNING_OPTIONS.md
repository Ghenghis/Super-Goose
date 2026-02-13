# Free Code Signing Options for Windows

**Last Updated:** 2026-02-06
**Audience:** Open source projects, developers on budget, testing environments

---

## 🎯 Quick Recommendation

| Use Case | Best Option | SmartScreen Warnings |
|----------|-------------|----------------------|
| **Internal Testing** | Self-Signed Cert | ✅ Yes (expected) |
| **Open Source Release** | SignPath.io Free | ✅ Yes (initially) |
| **Production Release** | Commercial EV Cert | ❌ No |

**Reality Check:** Free certificates still trigger SmartScreen warnings initially. Only paid EV certificates avoid warnings from day one.

---

## Option 1: Self-Signed Certificate (Free, Immediate)

### When to Use
- Internal testing and development
- Private distribution within your organization
- Proof-of-concept builds
- Learning and experimentation

### Pros & Cons
✅ **Pros:**
- Completely free
- Immediate (5 minutes to create)
- No external dependencies
- Works offline

❌ **Cons:**
- Still triggers SmartScreen warnings
- Users must manually trust certificate
- Not suitable for public distribution
- Zero reputation with Microsoft

### Step-by-Step Guide

**1. Create Self-Signed Certificate**
```powershell
# Create certificate (valid for 3 years)
$cert = New-SelfSignedCertificate `
    -Type CodeSigning `
    -Subject "CN=Goose Development" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -NotAfter (Get-Date).AddYears(3)

# View certificate
Get-ChildItem -Path Cert:\CurrentUser\My -CodeSigningCert
```

**2. Export to PFX (for CI/CD)**
```powershell
$password = ConvertTo-SecureString -String "YourSecurePassword123!" -Force -AsPlainText
Export-PfxCertificate `
    -Cert $cert `
    -FilePath "C:\certs\goose-selfsigned.pfx" `
    -Password $password
```

**3. Sign Your Executable**
```powershell
# With certificate from store
Set-AuthenticodeSignature `
    -FilePath "target\release\goose.exe" `
    -Certificate $cert `
    -TimestampServer "http://timestamp.digicert.com"

# Or with PFX file
$pfxCert = Get-PfxCertificate -FilePath "C:\certs\goose-selfsigned.pfx"
Set-AuthenticodeSignature `
    -FilePath "target\release\goose.exe" `
    -Certificate $pfxCert `
    -TimestampServer "http://timestamp.digicert.com"
```

**4. Verify Signature**
```powershell
Get-AuthenticodeSignature "target\release\goose.exe" | Format-List
```

### User Instructions

When distributing self-signed executables, provide these instructions:

**For Users:**
1. Download will show security warning
2. Click "More info"
3. Click "Run anyway"
4. Optionally: Install root certificate to "Trusted Root" to avoid future warnings

**Installing Trust Certificate:**
```powershell
# Users run this once to trust all your future builds
Import-Certificate `
    -FilePath "goose-root-ca.cer" `
    -CertStoreLocation "Cert:\LocalMachine\Root"
```

---

## Option 2: SignPath.io (Free for Open Source)

### When to Use
- Open source projects on GitHub/GitLab
- Public releases with CI/CD
- Projects with regular updates

### Features
- **Cost:** Free for open source (with limitations)
- **Type:** Standard code signing certificate
- **CI/CD Integration:** GitHub Actions, Azure DevOps, GitLab CI
- **Automated:** Sign on every release
- **Limitation:** 10 releases/month on free tier

### Setup Process

**1. Sign Up (5 minutes)**
- Go to https://signpath.io
- Create account with GitHub
- Select "Open Source Project"

**2. Verify Open Source Status (1-2 days)**
- Link your GitHub repository
- SignPath verifies repo is public
- Approval typically within 48 hours

**3. Create Signing Policy**
```yaml
# signpath-policy.yml
Metadata:
  Name: Goose Signing Policy
  Description: Sign Windows executables for Goose project

Elements:
  - Kind: File
    Pattern: "*.exe"
    SigningMethod: AuthenticodeSigningMethod
```

**4. GitHub Actions Integration**
```yaml
# .github/workflows/release.yml
name: Release with Signing

on:
  push:
    tags:
      - 'v*'

jobs:
  build-and-sign:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build
        run: cargo build --release

      - name: Sign with SignPath
        uses: signpath/github-action-submit-signing-request@v1
        with:
          api-token: ${{ secrets.SIGNPATH_API_TOKEN }}
          organization-id: ${{ secrets.SIGNPATH_ORG_ID }}
          project-slug: 'goose'
          signing-policy-slug: 'release-signing'
          artifact-configuration-slug: 'windows-exe'
          input-artifact-path: 'target/release/goose.exe'
          output-artifact-path: 'target/release/goose-signed.exe'
```

**5. GitLab CI Integration**
```yaml
# .gitlab-ci.yml
sign-windows-binary:
  stage: release
  script:
    - cargo build --release
    - |
      curl -X POST "https://app.signpath.io/API/v1/$SIGNPATH_ORG_ID/SigningRequests" \
        -H "Authorization: Bearer $SIGNPATH_API_TOKEN" \
        -F "ProjectSlug=goose" \
        -F "SigningPolicySlug=release-signing" \
        -F "Artifact=@target/release/goose.exe" \
        -o target/release/goose-signed.exe
```

### Limitations
- **Free Tier:** 10 releases per month
- **Still shows SmartScreen** initially (standard cert, not EV)
- **Requires public repository**
- **Manual approval** for first few releases

---

## Option 3: Certum Open Source Code Signing

### When to Use
- Verified open source projects
- Need longer-term free solution
- Can wait 7-14 days for approval

### Features
- **Cost:** Free for verified OSS projects
- **Type:** Standard code signing certificate
- **Duration:** 1 year (renewable)
- **Delivered:** Physical USB token or HSM

### Application Process

**1. Prepare Documents**
- Proof of open source project (GitHub link)
- Project description and purpose
- Maintainer information
- Evidence of community (stars, contributors, downloads)

**2. Apply Online**
- URL: https://www.certum.eu/en/cert_offer/code-signing-for-open-source/
- Fill application form
- Upload documentation
- Wait 7-14 days for review

**3. Verification**
- Certum reviews project authenticity
- May request additional information
- Email verification
- Project homepage verification

**4. Certificate Delivery**
- Delivered on USB token (shipped) or
- Software-based HSM solution
- Includes installation instructions

**5. Signing Process**
Same as commercial certificate (see main guide)

### Eligibility Requirements
- ✅ Project must be open source (OSI-approved license)
- ✅ Publicly available source code
- ✅ Active development (recent commits)
- ✅ Clear open source purpose
- ❌ Not for commercial products
- ❌ Not for proprietary software

---

## Option 4: Community and Sponsorship Programs

### Microsoft MVP Program
If you're a Microsoft MVP:
- May receive code signing certificate as benefit
- Contact your MVP program manager
- Usually standard certificate (not EV)

### GitHub Sponsors
Some companies sponsor certificates for popular OSS:
- Look for sponsors offering infrastructure support
- Add to GitHub Sponsors goals
- Typical sponsorship: $500-1000/year covers certificate cost

### Open Source Foundations
Join an established foundation:
- **Software Freedom Conservancy** - Infrastructure support
- **NumFOCUS** - For scientific computing projects
- **Linux Foundation** - Large ecosystem projects

---

## Comparison Matrix

| Option | Cost | Setup Time | SmartScreen | Best For |
|--------|------|------------|-------------|----------|
| Self-Signed | Free | 5 minutes | ⚠️ Yes | Testing |
| SignPath.io | Free (OSS) | 2-3 days | ⚠️ Yes* | CI/CD |
| Certum OSS | Free (OSS) | 7-14 days | ⚠️ Yes* | Long-term |
| Commercial EV | $299-474/yr | 7-19 days | ✅ No | Production |

*SmartScreen warnings for 3-6 months until reputation builds

---

## Reality Check: SmartScreen Warnings

**All free options still show Windows SmartScreen warnings** because:
1. Standard certificates (not EV) have no instant reputation
2. Microsoft requires time to build application reputation
3. Reputation based on: downloads, user feedback, time

**Building Reputation:**
- Takes 3-6 months of regular downloads
- Requires consistent signing (same certificate)
- Based on user behavior (not blocking the app)
- No way to speed up (except paying for EV certificate)

**User Impact:**
- 60-80% of users click through warnings (desktop tools)
- 90-95% abandonment for consumer apps
- Enterprise IT may block unsigned/low-reputation apps

---

## Recommended Workflow for Free Option

### Phase 1: Development (Self-Signed)
```
Weeks 1-4: Use self-signed certificate
- Internal testing only
- Team members trust certificate
- Rapid iteration without costs
```

### Phase 2: Alpha/Beta (SignPath.io or Certum)
```
Weeks 5-8: Public testing with free certificate
- Apply to SignPath.io (if using CI/CD)
- Or apply to Certum Open Source
- Warn testers about SmartScreen
- Document installation process
```

### Phase 3: Production (Consider Commercial)
```
Week 9+: Evaluate commercial certificate
- If user feedback is negative about SmartScreen
- If targeting enterprise customers
- If application becomes revenue-generating
- Budget $299-474/year for peace of mind
```

---

## Implementation Guide for Goose

### Current Situation
- **Project:** Open source (GitHub/GitLab)
- **Distribution:** Public release
- **CI/CD:** GitLab CI configured
- **Target:** Windows 10/11 users

### Recommended Approach

**Option A: SignPath.io (Recommended)**

**Pros for Goose:**
- ✅ Integrates with GitLab CI (already set up)
- ✅ Automated signing on release
- ✅ Free for open source
- ✅ 10 releases/month sufficient

**Implementation:**
1. Apply to SignPath.io (today, 2-3 days approval)
2. Configure GitLab CI integration
3. Update `forge.config.ts` to use SignPath-signed binaries
4. Document SmartScreen warnings in README

**Option B: Self-Signed + Migrate Later**

**Pros for Goose:**
- ✅ Immediate (no waiting)
- ✅ Free forever
- ✅ Can migrate to commercial later
- ✅ Good for MVP/alpha releases

**Implementation:**
1. Create self-signed certificate (5 minutes)
2. Update CI/CD to sign with self-signed cert
3. Release with clear installation instructions
4. Budget for commercial certificate later

---

## Updated CI/CD Configuration

### Self-Signed Certificate in GitLab CI

```yaml
# .gitlab-ci.yml
build-windows-desktop:
  stage: build
  tags: [windows, local]
  before_script:
    # Use self-signed certificate from CI/CD variables
    - $cert = Get-PfxCertificate -FilePath $env:SELFSIGNED_CERT_FILE
  script:
    - cargo build --release --bin goosed
    - cp target/release/goosed.exe ui/desktop/src/bin/
    - cd ui/desktop
    - npm ci --legacy-peer-deps
    - npm run package
    - npm run make
    # Sign the installer
    - Set-AuthenticodeSignature -FilePath "out/make/squirrel.windows/x64/*.exe" -Certificate $cert
  artifacts:
    paths:
      - ui/desktop/out/make/**/*.exe
```

**Store in GitLab CI/CD Variables:**
- `SELFSIGNED_CERT_FILE`: PFX file (as base64)
- `SELFSIGNED_CERT_PASSWORD`: Certificate password (masked)

---

## User Communication Template

### For README.md

```markdown
## Windows Installation

**Note:** Goose is signed with a code signing certificate, but Windows SmartScreen may show a warning on first install. This is normal for new applications.

### Installation Steps

1. Download `Goose-Setup.exe`
2. If Windows shows "Windows protected your PC":
   - Click **"More info"**
   - Click **"Run anyway"**
3. Follow the installation wizard

**Why the warning?** New applications need time to build reputation with Microsoft (3-6 months). The application is safe and signed by the Goose development team.

**For IT Admins:** You can deploy the included certificate to your organization's Trusted Root store to bypass warnings.
```

---

## Cost-Benefit Analysis

### Free Certificate Total Cost of Ownership

| Item | Cost | Notes |
|------|------|-------|
| Certificate | $0 | Free |
| Setup Time | 2-8 hours | Initial configuration |
| User Support | High | Handling SmartScreen questions |
| User Abandonment | 20-40% | Users scared by warning |
| Reputation Building | 3-6 months | Unavoidable wait |
| **Total "Cost"** | **High support burden** | |

### Commercial EV Certificate Total Cost of Ownership

| Item | Cost | Notes |
|------|------|-------|
| Certificate | $299-474/year | Annual fee |
| Setup Time | 2-4 hours | Initial configuration |
| User Support | Low | No SmartScreen questions |
| User Abandonment | <5% | No scary warnings |
| Reputation Building | Instant | EV benefit |
| **Total "Cost"** | **$299-474 + 2-4 hours** | |

**Break-even:** If you spend >10 hours/year on SmartScreen support, commercial certificate pays for itself.

---

## Final Recommendation

For **Goose Windows Release:**

### Immediate (This Week)
1. **Create self-signed certificate** for internal testing
2. **Apply to SignPath.io** for public releases (2-3 day wait)
3. Document SmartScreen warnings prominently

### Short-term (Month 1-2)
1. Use SignPath.io for all releases
2. Monitor user feedback on SmartScreen warnings
3. Track installation success rate

### Long-term (Month 3+)
1. If user complaints are high, budget for commercial EV certificate
2. If targeting enterprise, invest in EV certificate immediately
3. Otherwise, continue with free option and build reputation

---

## Quick Start: Self-Signed Today

**5-Minute Setup:**

```powershell
# 1. Create certificate
$cert = New-SelfSignedCertificate -Type CodeSigning -Subject "CN=Goose" -CertStoreLocation Cert:\CurrentUser\My

# 2. Sign your executable
Set-AuthenticodeSignature -FilePath "target\release\goose.exe" -Certificate $cert -TimestampServer "http://timestamp.digicert.com"

# 3. Verify
Get-AuthenticodeSignature "target\release\goose.exe"
```

**Done!** Your executable is now signed (with expected SmartScreen warnings).

---

## Support Resources

- **SignPath.io Docs:** https://about.signpath.io/documentation
- **Certum OSS Program:** https://www.certum.eu/en/cert_offer/code-signing-for-open-source/
- **Microsoft SmartScreen:** https://docs.microsoft.com/en-us/windows/security/threat-protection/microsoft-defender-smartscreen/
- **Self-Signed Certs:** https://docs.microsoft.com/en-us/powershell/module/pki/new-selfsignedcertificate

---

**Document Version:** 1.0
**Last Updated:** 2026-02-06
**Maintained by:** Goose Release Engineering
