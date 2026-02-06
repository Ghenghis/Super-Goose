# Known Issues - Day 1 (2026-02-06)

## 🔴 Critical: @types/node Installation Failure

**Status:** BLOCKING TypeScript builds
**Impact:** Cannot run `npm run lint:check` or `npm run typecheck`
**Priority:** HIGH - Must fix before Day 2

### Problem Description

The `@types/node` package is listed in `ui/desktop/package.json` devDependencies but npm refuses to install it:

```json
"@types/node": "^25.2.1"
```

**Symptoms:**
- `npm install` completes successfully but @types/node directory not created
- `npm ls @types/node` shows "(empty)"
- TypeScript compilation fails with: `error TS2688: Cannot find type definition file for 'node'`
- 16 other @types packages install successfully

**Attempted Fixes (All Failed):**
1. `npm ci --legacy-peer-deps` - Package not installed
2. `npm install @types/node --save-dev --force` - Says "up to date" but not installed
3. Clean install (`rm -rf node_modules && npm install`) - Still missing
4. `npm cache clean --force && npm install @types/node` - Says "added 2 packages" but not found
5. Direct version install `npm install @types/node@25.2.1` - Still not found

### Environment Context

- **Node.js:** v25.6.0 (package.json requires ^24.10.0)
- **npm:** 11.6.0 (package.json requires ^11.6.1)
- **Platform:** Windows
- **Working Directory:** `ui/desktop/`

**Engine Mismatch Warning:**
```
npm warn EBADENGINE Unsupported engine {
npm warn EBADENGINE   package: 'goose-app@1.23.0',
npm warn EBADENGINE   required: { node: '^24.10.0', npm: '^11.6.1' },
npm warn EBADENGINE   current: { node: 'v25.6.0', npm: '11.6.0' }
npm warn EBADENGINE }
```

### Root Cause Analysis

**Hypothesis:** Node.js v25.6.0 is slightly newer than what package.json requires (^24.10.0), which may cause npm's dependency resolver to skip @types/node installation due to engine mismatch or compatibility concerns.

**Evidence:**
- All other dependencies install successfully
- @types/node is specifically for Node.js type definitions
- npm version 11.6.0 is 0.1 behind required 11.6.1
- Engine mismatch warnings appear on every npm operation

### Recommended Solutions

**Option 1: Downgrade Node.js (Preferred)**
```powershell
# Install Node.js 24.10.0 via nvm-windows
nvm install 24.10.0
nvm use 24.10.0
cd ui\desktop
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

**Option 2: Relax Engine Requirements**
Edit `ui/desktop/package.json`:
```json
"engines": {
  "node": ">=24.10.0",  // Changed from ^24.10.0
  "npm": ">=11.6.0"      // Changed from ^11.6.1
}
```

**Option 3: Manual Installation (Workaround)**
```powershell
# Download and extract manually
mkdir -p node_modules/@types
cd node_modules/@types
curl -L https://registry.npmjs.org/@types/node/-/node-25.2.1.tgz -o node.tgz
tar -xzf node.tgz
mv package node
rm node.tgz
```

**Option 4: Use Different Node.js Type Definitions**
Install an older version that might resolve:
```powershell
npm install --no-save @types/node@24.0.0
```

### Impact Assessment

**Blocks:**
- ✅ TypeScript type checking (`npm run typecheck`)
- ✅ ESLint with type-aware rules (`npm run lint:check`)
- ✅ Pre-commit hooks (lint-staged includes typecheck)
- ✅ CI/CD pipeline (desktop-lint job will fail)

**Does NOT Block:**
- ✅ Runtime execution (dev server still works)
- ✅ Rust builds (separate toolchain)
- ✅ Production builds may still work (with warnings)

### Action Items

**Immediate (Day 2 Morning):**
1. Try Option 1 (downgrade Node.js to 24.10.0)
2. If Option 1 unavailable, try Option 2 (relax engine requirements)
3. Verify `npm run typecheck` passes
4. Run full `npm run lint:check`
5. Commit any package.json changes

**Validation:**
```powershell
# After fix, verify:
cd ui\desktop
npm run typecheck  # Should complete with 0 errors
npm run lint:check # Should pass
test -d node_modules/@types/node && echo "SUCCESS"
```

---

## ⚠️ Medium: PowerShell Script Encoding Issues

**File:** `gitlab-docker-setup.ps1`
**Status:** FIXED but requires validation

### Problem
Initial file had UTF-8 encoding issues causing PowerShell parser errors even though syntax was correct.

### Solution Applied
Rewrote entire file with proper line endings and encoding.

### Validation Needed
```powershell
powershell -File gitlab-docker-setup.ps1 -Status
# Should execute without syntax errors
```

---

## ⚠️ Medium: Husky Git Hooks Installation

**Status:** Workaround applied

### Problem
Husky tries to run during `npm install` prepare script but isn't installed yet, causing installation to fail.

### Workaround
Using `npm install --ignore-scripts` and then manually running `npx husky install` (which now shows deprecation warning).

### Long-term Solution
Update to Husky v9+ which has different installation method:
```json
// Remove from package.json:
"scripts": {
  "prepare": "husky"  // ← Remove this
}

// Add to package.json:
"scripts": {
  "prepare": "husky install"  // ← Update
}
```

---

## 📊 Day 1 Progress Summary

### ✅ Completed
1. Fixed PowerShell syntax errors (gitlab-docker-setup.ps1)
2. Regenerated Cargo.lock (fixed duplicate mio package)
3. Created comprehensive Code Signing guide (600+ lines)
4. Added local-ci.ps1 script
5. Cleaned git repository
6. Committed all changes
7. Installed desktop dependencies (partially)

### 🔴 Blocked
1. TypeScript type checking - @types/node missing
2. Desktop lint - depends on typecheck
3. Desktop tests - should work but untested
4. Full CI validation - will fail on desktop-lint job

### ⏭️ Next Steps (Day 2)
1. **CRITICAL:** Fix @types/node installation
2. Run complete lint and test suite
3. Test build-local.ps1 end-to-end
4. Push to CI and monitor results
5. **CRITICAL:** Start code signing certificate procurement

---

## Timeline Impact

**Original Plan:** Day 1 complete by EOD
**Actual Status:** 80% complete
**Blocker:** @types/node issue (est. 1-2 hours to resolve)
**Revised Timeline:** Day 1 spills into Day 2 morning

**Critical Path Not Affected:**
- Code signing cert procurement can start independently
- Rust builds work fine
- Only affects TypeScript/desktop workflow

---

## References

- Original audit: See comprehensive audit from exploration phase
- Plan: `C:\Users\Admin\.claude\plans\lazy-waddling-ember.md`
- Code signing guide: `docs/WINDOWS_CODE_SIGNING.md`
- Package.json: `ui/desktop/package.json` (line 121: @types/node)
- TypeScript config: `ui/desktop/tsconfig.json`

---

**Document Created:** 2026-02-06 16:00 UTC
**Last Updated:** 2026-02-06 16:00 UTC
**Owner:** Goose Release Engineering
**Next Review:** Day 2 morning after @types/node fix
