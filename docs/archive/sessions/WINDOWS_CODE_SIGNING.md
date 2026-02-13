# Windows Code Signing Certificate Procurement Guide

**Status:** 🔴 CRITICAL PATH ITEM - Start immediately (Day 1)
**Lead Time:** 1-2 weeks
**Last Updated:** 2026-02-06

## Executive Summary

Code signing certificates are **mandatory** for professional Windows releases. Unsigned executables trigger Windows SmartScreen warnings, which severely impact user trust and adoption rates. This guide provides step-by-step instructions for procuring an EV (Extended Validation) Code Signing Certificate.

---

## Why EV Certificates Are Required

### Standard OV vs. EV Certificates

| Feature | OV (Organization Validation) | EV (Extended Validation) |
|---------|------------------------------|--------------------------|
| **SmartScreen Warnings** | Yes, until reputation built | No warnings immediately |
| | Reputation build time: 3-6 months | Instant reputation from Microsoft |
| **Validation Level** | Basic business verification | Enhanced verification + physical token |
| **Price** | $100-200/year | $300-500/year |
| **Delivery Time** | 1-3 days | 5-10 days (includes physical token ship) |
| **Storage** | File-based (.pfx) | HSM/USB token required |
| **Recommendation** | ❌ Not recommended for new software | ✅ **Required for production releases** |

### Impact of Unsigned Executables

- **Windows SmartScreen:** "Windows protected your PC" warning
- **User Experience:** Users must click "More info" → "Run anyway" (3 clicks)
- **Enterprise:** Often blocked by IT security policies
- **Reputation:** Appears unprofessional, damages brand trust
- **Download Rates:** 60-80% abandonment rate on SmartScreen warnings

---

## Recommended Certificate Authorities

### Top Tier (Recommended)

1. **DigiCert** (Industry Leader)
   - URL: https://www.digicert.com/signing/code-signing-certificates
   - EV Price: ~$474/year
   - Validation Time: 3-5 business days
   - Support: Excellent (24/7)
   - Token: USB eToken included
   - **Recommended for:** Enterprises, professional releases

2. **Sectigo (formerly Comodo)**
   - URL: https://sectigo.com/ssl-certificates-tls/code-signing
   - EV Price: ~$299/year
   - Validation Time: 5-7 business days
   - Support: Good (business hours)
   - Token: SafeNet eToken included
   - **Recommended for:** Budget-conscious teams, good quality/price ratio

### Alternative Options

3. **SSL.com**
   - EV Price: ~$299/year
   - Validation Time: 3-7 business days
   - Good support, reliable

4. **GlobalSign**
   - EV Price: ~$449/year
   - Validation Time: 5-10 business days
   - Enterprise-focused

---

## Procurement Process (Step-by-Step)

### Phase 1: Pre-Requisites (1 hour)

Before contacting a CA, gather these documents:

#### For US-based Organizations:
- [ ] **Business Registration Documents**
  - Articles of Incorporation
  - Business License
  - EIN (Employer Identification Number) letter from IRS

- [ ] **Contact Information**
  - Business phone number (listed in public directories)
  - Business address (must match registration)
  - Technical contact email
  - Authorized signer name and title

- [ ] **Domain Verification**
  - Company website (must be operational)
  - Domain registration matching business name

#### For Non-US Organizations:
- [ ] Local business registration documents
- [ ] Utility bill (business address proof, <90 days old)
- [ ] Bank reference letter
- [ ] Government-issued business ID

### Phase 2: Application (30 minutes)

1. **Choose Certificate Authority**
   - Recommended: DigiCert (fastest) or Sectigo (budget-friendly)
   - Go to CA website and select "EV Code Signing Certificate"

2. **Complete Online Application**
   - Organization name (must match legal registration **exactly**)
   - DUNS number (if available - speeds up validation)
   - Business address
   - Technical contact info
   - Authorized signer information

3. **Submit Documents**
   - Upload all pre-requisite documents
   - Ensure scans are clear and legible
   - PDF format preferred

4. **Payment**
   - Most CAs accept credit card, wire transfer, or PO
   - **Tip:** Some CAs offer discounts for multi-year purchases (2-3 years)

### Phase 3: Validation (3-10 business days)

**What the CA will do:**

1. **Document Verification** (1-2 days)
   - Review submitted documents
   - Verify business registration with government databases
   - Check DUNS database (if provided)

2. **Phone Verification** (1 day)
   - CA will call the business phone number
   - Must reach authorized signer or someone who can verify them
   - **Important:** Ensure receptionist/phone system knows to expect call

3. **Domain Verification** (1 day)
   - Verify domain ownership matches business
   - Check website is operational
   - May require DNS TXT record or email verification

4. **Final Approval** (1-2 days)
   - CA compliance team reviews all data
   - Approval email sent once complete

**Common Delays & How to Avoid:**
- ❌ Phone number not in public directory → Use a listed number
- ❌ Business address mismatch → Ensure exact match with registration
- ❌ Authorized signer unavailable → Provide backup contact
- ❌ Incomplete documents → Upload everything upfront

### Phase 4: Token Delivery (3-7 days)

**After Approval:**

1. **Token Shipping**
   - CA ships USB eToken/SafeNet token via courier
   - Shipping time: 3-5 days (domestic), 5-10 days (international)
   - **Expedited shipping available** (add $50-100)

2. **Certificate Installation**
   - Token arrives with installation instructions
   - Certificate is pre-loaded on the hardware token
   - **CRITICAL:** Store token in secure location (treat like a physical key)

3. **PIN Setup**
   - Set token PIN (usually 6-8 digits)
   - **NEVER share this PIN**
   - Document PIN in secure password manager

---

## Certificate Installation & Configuration

### Step 1: Install Token Drivers

**Windows:**
```powershell
# For SafeNet eToken (Sectigo)
# Download from: https://support.sectigo.com/articles/Knowledge/SafeNet-Authentication-Client-downloads

# For DigiCert Token
# Drivers usually auto-install when token is inserted
```

Verify token is recognized:
```powershell
certutil -scinfo
```

### Step 2: Export Certificate for CI/CD (Optional)

**⚠️ Security Warning:** Only do this if absolutely necessary for automated builds.

```powershell
# Export certificate with private key (requires token PIN)
$cert = Get-ChildItem -Path Cert:\CurrentUser\My | Where-Object { $_.Subject -like "*YourCompanyName*" }
$pwd = ConvertTo-SecureString -String "YourStrongPassword" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "C:\secure\cert.pfx" -Password $pwd
```

**Security Best Practices:**
- Encrypt .pfx file before storing
- Use Azure Key Vault or GitLab CI/CD secrets (never commit to repo)
- Limit access to certificate to CI/CD pipeline only
- Rotate password regularly

### Step 3: Configure GitLab CI/CD

Add to GitLab CI/CD Variables (Settings → CI/CD → Variables):

```yaml
# Variable Name: WINDOWS_CERTIFICATE_FILE
# Type: File
# Value: Upload cert.pfx file (base64 encoded)
# Protected: Yes
# Masked: No (file variables can't be masked)

# Variable Name: WINDOWS_CERTIFICATE_PASSWORD
# Type: Variable
# Value: Your certificate password
# Protected: Yes
# Masked: Yes
```

Update `.gitlab-ci.yml`:
```yaml
build-windows-desktop:
  stage: build
  tags: [windows, local]
  before_script:
    # Install certificate
    - $securePassword = ConvertTo-SecureString -String $env:WINDOWS_CERTIFICATE_PASSWORD -Force -AsPlainText
    - Import-PfxCertificate -FilePath $env:WINDOWS_CERTIFICATE_FILE -CertStoreLocation Cert:\CurrentUser\My -Password $securePassword
  script:
    # ... existing build commands ...
    - npm run make
    # Verify signing
    - Get-AuthenticodeSignature ui\desktop\out\make\squirrel.windows\x64\*.exe
  after_script:
    # Clean up certificate (security)
    - Get-ChildItem -Path Cert:\CurrentUser\My | Where-Object { $_.Subject -like "*YourCompanyName*" } | Remove-Item
```

---

## Signing Executables

### Manual Signing (Development)

```powershell
# With token (requires PIN entry)
$cert = Get-ChildItem -Path Cert:\CurrentUser\My -CodeSigningCert
Set-AuthenticodeSignature -FilePath "goose.exe" -Certificate $cert -TimestampServer "http://timestamp.digicert.com"

# With .pfx file
$cert = Get-PfxCertificate -FilePath "C:\secure\cert.pfx"
Set-AuthenticodeSignature -FilePath "goose.exe" -Certificate $cert -TimestampServer "http://timestamp.digicert.com"
```

### Electron Forge Signing (Already Configured)

File: `ui/desktop/forge.config.ts`

```typescript
win32: {
  icon: 'src/images/icon.ico',
  certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,  // ← CI/CD variable
  certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,  // ← CI/CD variable
  rfc3161TimeStampServer: 'http://timestamp.digicert.com',
  signWithParams: '/fd sha256 /tr http://timestamp.digicert.com /td sha256',
}
```

### Verification

```powershell
# Check signature validity
Get-AuthenticodeSignature "goose.exe" | Format-List *

# Expected output:
# Status: Valid
# StatusMessage: Signature verified.
# SignerCertificate: CN=Your Company Name, O=Your Company Name, ...
```

**Valid Signature Indicators:**
- ✅ Status: Valid
- ✅ Timestamp present
- ✅ Certificate chain trusted
- ✅ No SmartScreen warning when running

---

## Troubleshooting

### Issue: "The token is not recognized"
**Solution:**
1. Install latest SafeNet/eToken drivers
2. Reinsert USB token
3. Run `certutil -scinfo` to verify

### Issue: "Wrong PIN" or "Token locked"
**Solution:**
- Most tokens lock after 3-5 failed attempts
- Contact CA support to unlock (may require re-issuance)
- **Prevention:** Document PIN in secure password manager

### Issue: "Certificate not trusted"
**Solution:**
- Ensure Windows Update has run (updates root certificates)
- Manually install CA root certificate from CA website
- Check timestamp server is reachable

### Issue: SmartScreen still shows warning
**Solution:**
- EV certificates should NOT show warnings
- Verify certificate is actually EV (check "Extended Validation" in properties)
- If using OV certificate, wait 3-6 months for reputation to build
- Sign with correct timestamp server

---

## Timeline Summary

| Phase | Duration | Can Be Expedited? |
|-------|----------|-------------------|
| Pre-requisites gathering | 1-2 hours | N/A |
| Application submission | 30 min | N/A |
| CA validation | 3-10 business days | Yes ($100-200 rush fee) |
| Token shipping | 3-7 days | Yes ($50-100 expedited) |
| Installation & testing | 1-2 hours | N/A |
| **Total (Normal)** | **7-19 days** | - |
| **Total (Expedited)** | **4-8 days** | Add $150-300 |

---

## Cost Breakdown

| Item | Cost | Frequency |
|------|------|-----------|
| EV Certificate (DigiCert) | $474 | Annual |
| EV Certificate (Sectigo) | $299 | Annual |
| Expedited Processing | $100-200 | One-time (optional) |
| Expedited Shipping | $50-100 | One-time (optional) |
| **Total First Year** | **$299-774** | - |
| **Renewal (Year 2+)** | **$299-474** | Annual |

**Multi-Year Discounts:**
- 2-year purchase: 10-15% discount
- 3-year purchase: 15-20% discount

---

## Action Items (Start Today)

### Immediate (Today)
- [ ] **Assign owner** - Who will manage certificate procurement?
- [ ] **Choose CA** - DigiCert (fast) or Sectigo (budget)?
- [ ] **Gather documents** - Complete pre-requisites checklist
- [ ] **Create account** - Register at chosen CA website

### This Week
- [ ] **Submit application** - Complete online form
- [ ] **Upload documents** - All pre-requisites
- [ ] **Pay invoice** - Speed up processing
- [ ] **Notify team** - Expect validation phone call
- [ ] **Track progress** - Monitor CA portal daily

### Upon Certificate Arrival
- [ ] **Install token** - Test on local machine
- [ ] **Test signing** - Sign dummy .exe file
- [ ] **Configure CI/CD** - Add secrets to GitLab
- [ ] **Update build scripts** - Verify forge.config.ts
- [ ] **Document** - Record PIN, storage location, renewal date

---

## Security Best Practices

### Storage
- 🔐 Store physical token in locked cabinet/safe
- 🔐 Never leave token unattended in workstation
- 🔐 Backup token if CA provides option (extra cost)

### Access Control
- 👤 Limit token access to 2-3 authorized personnel
- 👤 Log all signing operations
- 👤 Review signed files regularly

### Password Management
- 🔑 Use 16+ character password for .pfx files
- 🔑 Store passwords in enterprise password manager (1Password, LastPass, Azure KeyVault)
- 🔑 Never share passwords via email/chat

### Revocation Planning
- 📋 Document revocation procedure
- 📋 Know CA's revocation hotline (24/7)
- 📋 Have backup certificate ready (for critical situations)

---

## Renewal Process (Annual)

**Timeline:** Start 30 days before expiration

1. **30 days before:** CA sends renewal notice
2. **Login to CA portal** and initiate renewal
3. **Validation** (usually faster - 1-3 days for existing customers)
4. **New token shipped** (if token expires) or certificate updated on existing token
5. **Update CI/CD secrets** with new certificate

**Tip:** Set calendar reminder 60 days before expiration to avoid last-minute rush.

---

## Support Contacts

### DigiCert
- Phone: +1 (801) 701-9600
- Email: support@digicert.com
- Support Hours: 24/7
- Portal: https://www.digicert.com/account/

### Sectigo
- Phone: +1 (888) 266-6361
- Email: support@sectigo.com
- Support Hours: Mon-Fri 9AM-9PM ET
- Portal: https://sectigo.com/support

### Microsoft SmartScreen Issues
- Report False Positive: https://www.microsoft.com/wdsi/filesubmission
- SmartScreen FAQ: https://aka.ms/smartscreenfaq

---

## Checklist: Certificate Procurement Complete

Before marking this task as done, verify:

- [ ] EV Code Signing Certificate received
- [ ] Token installed and recognized by Windows
- [ ] PIN documented in secure location
- [ ] Test signing completed successfully (dummy .exe file)
- [ ] GitLab CI/CD secrets configured
- [ ] `.gitlab-ci.yml` updated with signing steps
- [ ] `forge.config.ts` certificate paths verified
- [ ] Signed .exe tested on clean Windows VM (no SmartScreen warning)
- [ ] Renewal reminder set (60 days before expiration)
- [ ] Team trained on token usage and security

---

## Related Documentation

- [Windows Build & Release Guide](WINDOWS_RELEASE.md)
- [CI/CD Pipeline Configuration](.gitlab-ci.yml)
- [Electron Forge Config](../ui/desktop/forge.config.ts)
- [Security Best Practices](SECURITY.md)

---

**Document Owner:** Goose Release Engineering Team
**Last Review:** 2026-02-06
**Next Review:** Upon certificate arrival or 2026-03-06 (whichever is first)
