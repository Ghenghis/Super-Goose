# Super-Goose Build and Deployment Guide

Comprehensive build, configuration, and deployment reference for Super-Goose.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Rust** | stable (1.82+) | Backend compilation |
| **Node.js** | v20-24 (v25+ needs patch) | Frontend tooling |
| **npm** | Bundled with Node.js | Package management |
| **Windows SDK** | 10.0.22621.0 | Windows builds (um + ucrt libs) |
| **Visual Studio Build Tools** | MSVC v14.43+ | Windows linker |
| **Git** | 2.30+ | Source control |

---

## Environment Setup

### Windows

Set the Rust `LIB` path so the linker can find Windows SDK and MSVC libraries:

```bash
# Set Rust LIB path (required before any cargo command on Windows)
export LIB="C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.22621.0\\um\\x64;C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.22621.0\\ucrt\\x64;C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\14.43.34808\\lib\\x64"
```

Or using `cmd.exe`:

```cmd
set LIB=C:\Program Files (x86)\Windows Kits\10\Lib\10.0.22621.0\um\x64;C:\Program Files (x86)\Windows Kits\10\Lib\10.0.22621.0\ucrt\x64;C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC\14.43.34808\lib\x64
```

Adjust the MSVC version (`14.43.34808`) to match your installation.

### macOS

```bash
xcode-select --install
brew install protobuf pkg-config
```

### Linux

```bash
sudo apt update && sudo apt install -y \
  build-essential pkg-config libssl-dev libdbus-1-dev \
  protobuf-compiler libprotobuf-dev libxcb1-dev ca-certificates
```

---

## Building

### Rust Backend

```bash
# Debug build (faster compilation, larger binary)
cargo build -p goose-cli -p goose-server

# Release build (optimized, slower compilation)
cargo build -p goose-cli -p goose-server --release
```

Build outputs:

| Binary | Crate | Description |
|--------|-------|-------------|
| `goose` | goose-cli | CLI client for interactive sessions |
| `goosed` | goose-server | HTTP server (port 3284 by default) |

### Frontend (Electron)

```bash
cd ui/desktop

# Install dependencies (NODE_ENV must NOT be "production")
NODE_ENV=development npm install --include=dev

# Type check
npx tsc --noEmit

# Unit tests (Vitest)
npx vitest run

# Build the Electron installer
npx electron-forge make
```

### Full Build Pipeline

1. **Build Rust binaries:**
   ```bash
   cargo build -p goose-cli -p goose-server --release
   ```

2. **Copy goosed binary to Electron resource directory:**
   ```bash
   # Windows
   copy target\release\goosed.exe ui\desktop\src\bin\

   # Linux / macOS
   cp target/release/goosed ui/desktop/src/bin/
   ```

3. **Install frontend dependencies:**
   ```bash
   cd ui/desktop
   NODE_ENV=development npm install --include=dev
   ```

4. **Build Electron app:**
   ```bash
   npx electron-forge make
   ```

5. **Output artifact:** `Super-Goose-win32-x64-1.24.02.zip` (~285 MB) under `ui/desktop/out/make/`

---

## Running Tests

### Rust Backend Tests

```bash
# Full workspace library tests
cargo test --workspace --lib -- --skip scenario_tests

# Agentic core tests only (87 tests)
cargo test --lib -p goose -- core::

# Learning engine tests (52 tests)
cargo test --lib -p goose -- experience_store::
cargo test --lib -p goose -- insight_extractor::
cargo test --lib -p goose -- skill_library::
cargo test --lib -p goose -- reflexion::

# OTA tests (90 tests)
cargo test --lib -p goose -- ota::

# Autonomous daemon tests (86 tests)
cargo test --lib -p goose -- autonomous::

# Lint
cargo fmt --check
cargo clippy --all-targets -- -D warnings
```

### Frontend Tests

```bash
cd ui/desktop

# Type check (should produce zero errors)
npx tsc --noEmit

# Unit tests — Vitest (2097 tests, 199 test files)
npx vitest run

# Lint
npm run lint:check
```

### Playwright E2E Tests

```bash
cd ui/desktop

# IMPORTANT: Kill any zombie goosed.exe processes first (Windows)
taskkill //F //IM goosed.exe

# Run E2E tests
npx playwright test
```

- **291 passed**, 68 skipped, 0 failed
- Backend-dependent tests (47): skipped unless `GOOSE_BACKEND=1` is set
- AxeBuilder tests (17): skipped (uses `browserContext.newPage()`, unsupported in Electron CDP)
- Zombie `goosed.exe` processes can cause ALL tests to timeout

### Test Summary

| Suite | Total | Passed | Skipped | Failed |
|-------|-------|--------|---------|--------|
| Rust | 1763 | 1754 | 0 | 9 (pre-existing) |
| Vitest | 2097 | 2097 | 3 | 0 |
| Playwright E2E | 359 | 291 | 68 | 0 |

---

## Docker

### Build and Run

```bash
# Build the Docker image
docker build -t super-goose .

# Run in server mode
docker run -p 3284:3284 super-goose

# Run with environment configuration
docker run -p 3284:3284 \
  -e GOOSE_PROVIDER__TYPE=openai \
  -e GOOSE_PROVIDER__HOST=https://api.openai.com \
  -e GOOSE_PROVIDER__MODEL=gpt-4o \
  -e OPENAI_API_KEY=sk-... \
  super-goose goosed
```

### Image Details

| Property | Value |
|----------|-------|
| **Registry** | `ghcr.io/ghenghis/super-goose` |
| **Architecture** | `linux/amd64` |
| **Default port** | `3284` |

### Publish

```bash
VERSION=1.24.02
docker build -t ghcr.io/ghenghis/super-goose:${VERSION} .
docker push ghcr.io/ghenghis/super-goose:${VERSION}
docker tag ghcr.io/ghenghis/super-goose:${VERSION} ghcr.io/ghenghis/super-goose:latest
docker push ghcr.io/ghenghis/super-goose:latest
```

---

## Feature Flags

Feature flags are defined in `crates/goose/Cargo.toml`:

| Flag | Default | Description |
|------|---------|-------------|
| `memory` | **ON** | Memory, bookmarks, HITL, extended thinking |
| `swarm-experimental` | OFF | Experimental swarm mode (empty stub) |

Non-gated subsystems (always compiled): Reflexion, guardrails, cost tracking, rate limiting, project auto-detection.

```bash
# Default features only
cargo build -p goose

# With experimental swarm
cargo build -p goose --features swarm-experimental

# Without default features
cargo build -p goose --no-default-features
```

---

## Common Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| `npm ci` fails with lockfile error | `package-lock.json` out of sync | Run `npm install --package-lock-only` first |
| `forge.config.ts` bin mismatch | `bin:` must match `productName` | Both must be `"Super-Goose"` in `forge.config.ts` and `package.json` |
| devDependencies not installed | `NODE_ENV=production` during install | Use `NODE_ENV=development npm install --include=dev` |
| `cross-zip: fs.rmdir is not a function` | Node.js v25+ removed `fs.rmdir` recursive | Downgrade to Node.js v24 or patch cross-zip to use `fs.rm` |
| All Playwright tests timeout | Zombie `goosed.exe` holding port 3284 | `taskkill //F //IM goosed.exe` (Windows) or `pkill -f goosed` (Linux/macOS) |
| Flatpak maker fails | Runtime not available | Flatpak maker was REMOVED from `forge.config.ts` (failure killed concurrent makers) |
| `LINK : fatal error LNK1181` | Missing `LIB` env var on Windows | Set `LIB` to SDK + MSVC lib paths |
| `npm run make` produces no output | Missing goosed binary in `src/bin/` | Copy release binary before running make |

---

## CI/CD

### Workflow Files

| File | Purpose | Status |
|------|---------|--------|
| `ci-main.yml` | Standard CI on push/PR to main | GREEN |
| `ci-comprehensive.yml` | Full test suite with change detection (371 lines) | GREEN |
| Release workflows | 12 platform build jobs | ALL GREEN (12/12) |
| Docker workflow | Container image build and push | GREEN |
| Docs workflow | Docusaurus deploy to GitHub Pages | GREEN |

### ci-comprehensive.yml Details

- **Triggers:** Push to `main`/`feat/*`, PRs to `main`, `workflow_dispatch`
- **Change detection:** Only runs relevant test suites based on changed files
- **Jobs:** Rust tests, Vitest, `tsc --noEmit`, Playwright E2E
- **Concurrency groups:** Prevents duplicate runs on same PR
- **Artifacts:** Test results uploaded as build artifacts
- **Summaries:** Test result summaries posted to GitHub Actions UI

### Key CI Settings

- Rust cache via `Swatinem/rust-cache@v2`
- Node.js 22 with npm cache
- `RUST_BACKTRACE=1` for test output
- `RUST_MIN_STACK=8388608` for deep stack tests
- `gnome-keyring-daemon` unlocked for keyring tests on Linux

**Note:** Release workflow builds and packages only -- it contains NO runtime tests.

---

## Extension System (3-Tier)

### Tier 1: Builtin Extensions (Rust)

Compiled into the `goose-mcp` crate. Always available, lowest latency.

| Extension | Description |
|-----------|-------------|
| `developer` | File editing, shell commands, code analysis |
| `computercontroller` | Screen control, mouse/keyboard automation |
| `autovisualiser` | Automatic visualization generation |
| `memory` | Cross-session memory and recall |
| `tutorial` | Interactive onboarding tutorials |

### Tier 2: Bundled Extensions (JSON-defined)

Defined in `ui/desktop/src/components/settings/extensions/bundled-extensions.ts`. Approximately 30 bundled MCP servers covering file ops, git, databases, web, containers, and cloud.

### Tier 3: Custom Extensions (User-Configured)

Added through `config.yaml` or Settings UI. Supported transports: `stdio` and `streamable_http`.

```yaml
extensions:
  my-custom-tool:
    type: stdio
    command: /path/to/my-mcp-server
    args: ["--mode", "production"]
    env:
      MY_API_KEY: "secret"

  remote-service:
    type: streamable_http
    uri: https://my-mcp-server.example.com/mcp
```

---

## Release Process

See [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) for the full pre-release verification steps.

### Quick Checklist

1. All Rust tests pass: `cargo test --workspace --lib -- --skip scenario_tests`
2. All Vitest tests pass: `cd ui/desktop && npx vitest run`
3. TypeScript compiles cleanly: `cd ui/desktop && npx tsc --noEmit`
4. Playwright E2E tests pass: `cd ui/desktop && npx playwright test`
5. Full build completes: `npx electron-forge make`
6. Docker image builds and runs
7. CI/CD pipelines are green

### Build Artifacts by Platform

| Platform | Format | Approximate Size |
|----------|--------|-----------------|
| Windows | `.zip`, `.exe` (Squirrel), `.msi` (WiX) | ~285 MB (zip) |
| Linux | `.deb`, `.rpm`, `.zip` | ~250 MB |
| macOS | `.dmg`, `.zip` | ~260 MB |

### Makers Configured in forge.config.ts

| Maker | Platforms | Notes |
|-------|-----------|-------|
| `maker-zip` | darwin, win32, linux | Universal fallback |
| `maker-squirrel` | win32 | Auto-update capable |
| `maker-wix` | win32 | MSI installer (requires WiX) |
| `maker-dmg` | darwin | ULFO format |
| `maker-deb` | linux | Debian/Ubuntu package |
| `maker-rpm` | linux | RHEL/Fedora package |

---

## Project Links

- **GitHub:** [Ghenghis/Super-Goose](https://github.com/Ghenghis/Super-Goose)
- **Docker:** `ghcr.io/ghenghis/super-goose`
- **Docs:** [ghenghis.github.io/Super-Goose](https://ghenghis.github.io/Super-Goose/)
