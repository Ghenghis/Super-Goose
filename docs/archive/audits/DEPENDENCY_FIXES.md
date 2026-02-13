# Dependency Vulnerability Fixes

**Dependabot Alerts:** #3, #5, #163, #164, #165, #166
**Status:** PARTIALLY FIXED (overrides added, npm install needed)

---

## Alert #164, #165, #166: node-tar Vulnerabilities

**Package:** `tar` (npm)
**Installed Version:** 6.2.1 (deprecated)
**CVEs:** CVE-2024-28863 (ReDoS), CVE-2021-37701/37712/37713 (path traversal)
**Dependency Type:** Transitive dev dependency

**How it's pulled in:**
| Consumer | Specifies | Purpose |
|----------|-----------|---------|
| @electron/node-gyp | `tar: ^6.2.1` | Native module building |
| @electron/rebuild | `tar: ^6.0.5` | Electron rebuild |
| cacache | `tar: ^6.1.11` | npm cache |

**Fix Applied:**
- Override in `ui/desktop/package.json`: `"tar": ">=6.2.1"` (already present)
- **Recommended:** Bump to `"tar": ">=7.4.3"` for full CVE coverage
- **Action Required:** Run `npm install` to regenerate lock file

---

## Alert #163: tmp Arbitrary File Write

**Package:** `tmp` (npm)
**Installed Version:** 0.0.33
**CVE:** CVE-2020-28469 (symlink dir parameter write)
**Dependency Type:** Transitive dev dependency

**How it's pulled in:**
| Consumer | Specifies |
|----------|-----------|
| external-editor | `tmp: ^0.0.33` |
| tmp-promise | `tmp: ^0.2.0` |

**Fix Applied:**
- Override in `ui/desktop/package.json`: `"tmp": ">=0.2.3"` (already present)
- **Problem:** Lock file still has 0.0.33 — override wasn't applied because `npm install` hasn't been run since the override was added
- **Action Required:** Run `npm install` to regenerate lock file

---

## Alerts #3, #5: jsonwebtoken Type Confusion

**Package:** `jsonwebtoken`
**CVEs:** CVE-2022-23529 (type confusion), CVE-2022-23539/23540/23541 (auth bypass)

**Analysis: FALSE POSITIVE**

These CVEs apply to the **npm** `jsonwebtoken` package. This codebase does NOT use the npm package — it uses the **Rust** `jsonwebtoken` crate (version 10.3.0) by a completely different author.

| | npm package | Rust crate (this project) |
|---|---|---|
| Author | auth0 | Keats |
| Version | 8.x/9.x | 10.3.0 |
| Affected | YES | NO |
| In package.json | NO | N/A |
| In Cargo.toml | N/A | YES |

**Recommendation:** Dismiss alerts #3 and #5 as "not applicable" with note: "This project uses the Rust jsonwebtoken crate, not the npm package."

---

## Summary of Required Actions

| Priority | Action | File |
|----------|--------|------|
| MEDIUM | Run `npm install` to apply overrides | `ui/desktop/` |
| LOW | Bump tar override to `>=7.4.3` | `ui/desktop/package.json` |
| LOW | Dismiss jsonwebtoken alerts | GitHub Dependabot UI |
