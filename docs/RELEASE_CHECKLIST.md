# Release Checklist

Comprehensive release verification and deployment checklist for Super-Goose.

**Current Version**: v1.24.7

---

## Pre-Release Verification

### 1. Code Quality Checks

- [ ] `tsc --noEmit` — 0 errors (TypeScript type checking)
- [ ] `cargo check --workspace` — 0 warnings (Rust compilation)
- [ ] All `#[allow(dead_code)]` annotations are intentional and documented
- [ ] No temporary debug code (`console.log`, `dbg!`, etc.)
- [ ] No commented-out code blocks (unless documented as examples)

### 2. Test Suites

- [ ] **Vitest**: `npx vitest run` — all tests passing
  - Currently: 239 files, 3,378 tests
  - Expected: 0 failures, 2 todos allowed
- [ ] **Rust lib tests**: `cargo test --lib -p goose -p goose-server` — all tests passing
  - goose-server: 37/37 core + 5 broadcast + 8 GPU parser
  - goose core: 87/87 + 29 integration
  - OTA: 198/198
  - Autonomous: 86/86
  - Learning: 52/52
  - TimeWarp: 8/8
  - Known: 3 pre-existing evolution test failures (not blockers)
- [ ] **Playwright E2E**: `npx playwright test` — all critical tests passing
  - Currently: 291 pass, 68 skipped
  - No new failures introduced
- [ ] No pre-commit hook failures

### 3. App Runtime Verification

- [ ] Clear Vite cache: delete `.vite/` directory in `ui/desktop/`
- [ ] Clear node_modules cache: `rm -rf node_modules/.vite` in `ui/desktop/`
- [ ] Run `npm run start-gui` and verify:
  - [ ] App window opens without white screen
  - [ ] No CJS export errors in console (`react`, `react-dom`, `lodash/*`, etc.)
  - [ ] No `electron-updater` semver crash
  - [ ] Chat input loads and responds to messages
  - [ ] Super-Goose sidebar panels render correctly
  - [ ] Pipeline visualization animates smoothly
  - [ ] Right panel (Agent/Super Goose tabs) toggles correctly
  - [ ] All 16 Super-Goose panels load without errors
- [ ] Check DevTools console (F12) for errors
- [ ] Verify AG-UI SSE stream connects: check Network tab for `/api/ag-ui/stream`
- [ ] Test core switching: `/cores` then `/core structured` — should work without errors

### 4. Version Consistency

- [ ] `Cargo.toml` workspace.package.version matches (e.g., `1.24.7`)
- [ ] `ui/desktop/package.json` version matches
- [ ] `README.md` version badge matches
- [ ] `CHANGELOG.md` has entry for this version with release date
- [ ] Version is valid semver (no leading zeros in segments)
- [ ] Git tag does not already exist: `git tag -l v1.24.7` returns empty

### 5. Dependency Checks

- [ ] **No yanked crates**: `cargo deny check advisories` or manual Cargo.lock review
  - Last known issue: `zip v7.4.0` yanked, downgraded to `v7.2.0`
- [ ] **npm audit**: `npm audit --production` — no critical vulnerabilities
- [ ] **CJS packages**: All CJS packages are in `optimizeDeps.include` in `vite.renderer.config.mts`
  - Required: `shell-quote`, `lodash`, `lodash/*` subpackages
  - Rule: ESM packages (date-fns, uuid, react-resizable-panels, react-markdown) must NOT be in include
- [ ] **Bundled extensions**: `ui/desktop/bundled-extensions.json` loads correctly (30 entries)

### 6. Documentation

- [ ] `README.md` is up to date
- [ ] `CHANGELOG.md` has entry for this version
- [ ] `docs/` directory has current API documentation
- [ ] No broken links in documentation
- [ ] All referenced paths exist (e.g., `RELEASE_CHECKLIST.md`)

---

## Version Bump

### Steps

1. **Update Cargo.toml**
   ```toml
   [workspace.package]
   version = "1.24.7"
   ```

2. **Update Cargo.lock**
   ```bash
   cargo check
   ```

3. **Update package.json**
   ```json
   {
     "version": "1.24.7",
     "productName": "Super-Goose"
   }
   ```

4. **Update README.md version badge**
   ```markdown
   ![Version](https://img.shields.io/badge/version-1.24.7-blue)
   ```

5. **Add CHANGELOG.md entry**
   ```markdown
   ## [1.24.7] - 2026-02-15
   ### Added
   - Feature description
   ### Fixed
   - Bug fix description
   ```

### Semver Rules

- Format: `MAJOR.MINOR.PATCH`
- Each segment is a non-negative integer
- **NO leading zeros** (e.g., `1.24.07` is INVALID, `1.24.7` is valid)
- Pre-release: `1.24.7-beta.1` (optional)
- Build metadata: `1.24.7+20130313144700` (optional)

**Incrementing**:
- `MAJOR`: Breaking changes (API incompatible)
- `MINOR`: New features (backward compatible)
- `PATCH`: Bug fixes (backward compatible)

---

## Build

### Rust Backend

#### Windows
```bash
# Set MSVC library path (required on Windows)
export LIB="C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.22621.0\\um\\x64;C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.22621.0\\ucrt\\x64;C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\14.50.35717\\lib\\x64"

# Build release binaries
cargo build --release -p goose-cli -p goose-server

# Verify binaries
./target/release/goose-cli.exe --version
./target/release/goosed.exe --version
```

#### Linux/macOS
```bash
cargo build --release -p goose-cli -p goose-server

# Verify binaries
./target/release/goose-cli --version
./target/release/goosed --version
```

### Desktop (Electron)

```bash
cd ui/desktop

# Install dependencies (NODE_ENV must NOT be "production")
npm install --include=dev

# Build desktop app
npm run make

# Output location: out/
# Artifacts: .exe (Windows), .dmg (macOS), .deb/.rpm (Linux)
```

**Critical Requirements**:
- `forge.config.ts` `bin:` must match `package.json` `productName` (both "Super-Goose")
- `NODE_ENV` must NOT be "production" during `npm install` (devDependencies would be skipped)
- `package.json` `main` field must point to correct entry: `.vite/build/main.js`

### Docker

```bash
# Build image
docker build -t ghcr.io/ghenghis/super-goose:v1.24.7 .

# Tag as latest
docker tag ghcr.io/ghenghis/super-goose:v1.24.7 ghcr.io/ghenghis/super-goose:latest

# Test image
docker run --rm -p 3284:3284 ghcr.io/ghenghis/super-goose:v1.24.7
```

---

## Git & Release

### Pre-Commit

```bash
# Verify clean working directory
git status

# Verify all tests pass
npm test
cargo test --lib

# Verify no warnings
cargo check --workspace
tsc --noEmit
```

### Commit

```bash
git add -A
git commit -m "release: v1.24.7"
```

**Commit Message Format**:
- Prefix: `release:`
- Format: `release: v{version}`
- Example: `release: v1.24.7`

### Tag

```bash
# Create annotated tag
git tag -a v1.24.7 -m "Release v1.24.7"

# Push branch
git push origin feat/resizable-layout

# Push tag (triggers release workflow)
git push origin v1.24.7
```

**Tag Format**:
- Prefix: `v` (lowercase)
- Format: `v{version}`
- Example: `v1.24.7`

### GitHub Release

The release workflow (`.github/workflows/release.yml`) triggers on tag push and handles:

1. **Cross-platform Rust binary builds**
   - Windows x86_64
   - macOS ARM64 (M1/M2)
   - macOS x86_64 (Intel)
   - Linux x86_64
   - Linux ARM64

2. **Electron desktop packaging**
   - Windows: `.exe` installer
   - macOS: `.dmg` disk image
   - Linux: `.deb` and `.rpm` packages

3. **Docker image publish**
   - Push to `ghcr.io/ghenghis/super-goose:v1.24.7`
   - Tag as `latest`

4. **GitHub Release creation**
   - Automatic release notes from commits
   - Attach all binary artifacts
   - Mark as latest release

**Workflow Jobs** (12 total):
- `build-rust-*` (6 jobs): Cross-platform Rust binaries
- `build-electron-*` (3 jobs): Desktop app packaging
- `build-docker` (1 job): Docker image
- `create-release` (1 job): GitHub Release creation
- `publish-docker` (1 job): GHCR publish

### Post-Release Verification

- [ ] **CI workflows pass**
  - `ci-main.yml`: Basic CI (Rust + TypeScript + tests)
  - `ci-comprehensive.yml`: Full test suite
- [ ] **Release workflow completes** (all 12 jobs green)
- [ ] **Docker image accessible**
  ```bash
  docker pull ghcr.io/ghenghis/super-goose:v1.24.7
  docker pull ghcr.io/ghenghis/super-goose:latest
  ```
- [ ] **GitHub Release page** has all artifacts
  - Rust binaries for all platforms
  - Electron installers for all platforms
  - Source code archives
- [ ] **Auto-updater config** points to correct repo
  - Currently: `Ghenghis/Super-Goose`
  - Check `ui/desktop/package.json` `repository.url`

---

## Common Issues

### 1. Vite CJS Pre-bundling

**Symptom**: White screen on app launch, console shows "does not provide an export named 'Fragment'" or similar ESM/CJS errors.

**Root Cause**: Vite pre-bundles dependencies incorrectly when CJS packages are not in `optimizeDeps.include` or ESM packages are incorrectly added.

**Fix**:
1. Ensure `@vitejs/plugin-react` is in `plugins` array in `vite.renderer.config.mts`
2. Add all CJS packages to `optimizeDeps.include`:
   ```typescript
   optimizeDeps: {
     include: [
       'shell-quote',
       'lodash',
       'lodash/debounce',
       'lodash/throttle',
       // ... other CJS packages
     ],
   }
   ```
3. **Never** add ESM packages (date-fns, uuid, react-resizable-panels, react-markdown) to `include`
4. Delete `.vite/` cache and restart

**Prevention**: Review `optimizeDeps.include` before every release.

---

### 2. Invalid Semver

**Symptom**: `electron-updater` crashes with "App version is not a valid semver version" on startup.

**Root Cause**: Version has leading zeros (e.g., `1.24.07`) which are invalid in semver.

**Fix**:
1. Remove leading zeros: `1.24.07` → `1.24.7`
2. Update version in `Cargo.toml`, `package.json`, `README.md`
3. Run `cargo check` to update `Cargo.lock`

**Prevention**: Always validate version format before committing.

---

### 3. Zombie goosed.exe (Windows)

**Symptom**: Port 3284 already in use, E2E tests fail with "EADDRINUSE".

**Root Cause**: Previous `goosed.exe` process did not terminate cleanly.

**Fix**:
```bash
# Windows
taskkill /F /IM goosed.exe

# Linux/macOS
killall goosed
```

**Prevention**: Always run this before E2E tests, add to pre-test script.

---

### 4. Yanked Crates

**Symptom**: `cargo deny` warnings or build errors about yanked versions.

**Root Cause**: Dependency version was yanked from crates.io due to security or correctness issues.

**Fix**:
```bash
# Update specific crate
cargo update -p <crate-name>

# Or pin to specific version in Cargo.toml
[dependencies]
zip = "=7.2.0"  # Pinned to avoid yanked 7.4.0
```

**Known Cases**:
- `zip v7.4.0` → yanked, downgraded to `v7.2.0`

**Prevention**: Run `cargo deny check advisories` before every release.

---

### 5. NODE_ENV=production Breaks Build

**Symptom**: `npm install` completes but app fails to start, missing devDependencies.

**Root Cause**: When `NODE_ENV=production`, npm skips devDependencies installation.

**Fix**:
```bash
# Unset NODE_ENV or set to development
unset NODE_ENV
# Or
export NODE_ENV=development

npm install --include=dev
```

**Prevention**: Never set `NODE_ENV=production` during build. Only set in runtime environment.

---

### 6. Electron Forge Binary Path Mismatch

**Symptom**: Packaged app fails to find `goosed.exe`, shows error "Cannot find module".

**Root Cause**: `forge.config.ts` `bin:` field does not match `package.json` `productName`.

**Fix**:
- Ensure both are set to `"Super-Goose"`
- `package.json`: `"productName": "Super-Goose"`
- `forge.config.ts`: `bin: "Super-Goose"`

**Prevention**: Review both files before `npm run make`.

---

### 7. LLVM Out of Memory During Linking

**Symptom**: `cargo test` fails with "LLVM ERROR: out of memory".

**Root Cause**: Linking all tests in workspace uses excessive memory.

**Fix**:
```bash
# Test individual crates
cargo test --lib -p goose
cargo test --lib -p goose-server

# Or skip integration tests
cargo test --lib
```

**Prevention**: Use `--lib` flag for unit tests, run integration tests separately.

---

### 8. Git Bash Missing Cargo

**Symptom**: `cargo: command not found` in Git Bash on Windows.

**Root Cause**: Cargo is not in Git Bash PATH by default.

**Fix**:
```bash
# Add to PATH
export PATH="$PATH:/c/Users/Admin/.cargo/bin"

# Or use PowerShell/cmd.exe instead
```

**Prevention**: Use PowerShell or cmd.exe for Rust commands on Windows.

---

### 9. React Hook "Cannot read property of undefined"

**Symptom**: Runtime error in console: "Cannot read property 'useState' of undefined".

**Root Cause**: Vite is not applying React JSX transform correctly.

**Fix**:
1. Ensure `@vitejs/plugin-react` is in `plugins` array
2. Verify `react` and `react-dom` are NOT in `optimizeDeps.include` (they are ESM)
3. Modern JSX transform does not require `import React` in files

**Prevention**: Do not add React packages to `optimizeDeps.include`.

---

## Test Count Reference

**Version v1.24.7 Test Suite Baseline**

| Suite | Count | Status |
|-------|-------|--------|
| **Vitest** | 3,378 tests (239 files) | 0 failures, 2 todos |
| **Playwright E2E** | 291 pass + 68 skip | 0 failures |
| **Rust lib tests** | 67+ tests | 3 pre-existing failures |
| **tsc --noEmit** | — | 0 errors |
| **cargo check** | — | 0 warnings |
| **Total** | **5,423+ verified assertions** | **Zero new failures** |

### Detailed Rust Test Counts

| Crate/Module | Tests | Status |
|--------------|-------|--------|
| goose-server core | 37/37 | Pass |
| goose-server broadcast | 5/5 | Pass |
| goose-server GPU parser | 8/8 | Pass |
| goose core | 87/87 | Pass |
| goose integration | 29/29 | Pass |
| OTA | 198/198 | Pass |
| Autonomous | 86/86 | Pass |
| Learning | 52/52 | Pass |
| TimeWarp | 8/8 | Pass |
| **Total** | **510+** | **3 pre-existing failures** |

**Pre-existing Failures** (not blockers):
- Evolution tests: 3 known failures (legacy, low priority)

---

## Release Automation

### Automated Tasks (via GitHub Actions)

On tag push (`v*`):
1. Trigger `release.yml` workflow
2. Build cross-platform binaries (6 platforms)
3. Package Electron apps (3 platforms)
4. Build and publish Docker image
5. Create GitHub Release with all artifacts

### Manual Tasks

- [ ] Update `CHANGELOG.md` with human-readable summary
- [ ] Write release notes on GitHub Release page
- [ ] Announce release (Discord, Twitter, etc.)
- [ ] Update documentation site (if applicable)
- [ ] Monitor for issues in first 24 hours

---

## Rollback Procedure

If critical issues are found post-release:

### Option 1: Hotfix Release

1. Create hotfix branch from tag
2. Apply fix
3. Increment PATCH version (e.g., `1.24.7` → `1.24.8`)
4. Follow release checklist
5. Tag and release

### Option 2: Revert Release

1. Delete GitHub Release
2. Delete git tag locally and remotely:
   ```bash
   git tag -d v1.24.7
   git push --delete origin v1.24.7
   ```
3. Revert commit:
   ```bash
   git revert <commit-hash>
   git push origin feat/resizable-layout
   ```
4. Mark Docker image as deprecated (cannot delete from GHCR)

### Option 3: OTA Rollback (Future)

Once OTA system is production-ready:
1. Trigger rollback via `/ota rollback` command
2. Users auto-update to previous stable version
3. Monitor rollback success rate

---

## Appendix: File Locations

### Version Files
- `Cargo.toml` (workspace.package.version)
- `ui/desktop/package.json` (version)
- `README.md` (version badge)
- `CHANGELOG.md` (version entries)

### Build Artifacts
- Rust binaries: `target/release/`
- Electron app: `ui/desktop/out/`
- Docker image: `ghcr.io/ghenghis/super-goose`

### Configuration Files
- Electron: `ui/desktop/forge.config.ts`
- Vite: `ui/desktop/vite.renderer.config.mts`
- Rust: `Cargo.toml`, `Cargo.lock`
- CI/CD: `.github/workflows/release.yml`

---

## Contact

For release issues or questions:
- GitHub Issues: https://github.com/Ghenghis/Super-Goose/issues
- Repository: https://github.com/Ghenghis/Super-Goose
- Documentation: https://ghenghis.github.io/Super-Goose

---

**Last Updated**: 2026-02-15
**Document Version**: 1.0.0
**Maintained By**: Super-Goose Release Team
