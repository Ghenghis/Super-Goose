# Super-Goose Release Checklist

## Pre-Release Validation

### Backend (Rust)
- [ ] `cargo test --workspace --lib -- --skip scenario_tests` -- 0 failures
- [ ] `cargo test --lib -p goose -- core::` -- all agentic core tests pass
- [ ] `cargo test --lib -p goose -- experience_store::` -- ExperienceStore tests pass
- [ ] `cargo test --lib -p goose -- insight_extractor::` -- InsightExtractor tests pass
- [ ] `cargo test --lib -p goose -- skill_library::` -- SkillLibrary tests pass
- [ ] `cargo test --lib -p goose -- reflexion::` -- Reflexion tests pass
- [ ] `cargo test --lib -p goose -- reflection_store::` -- ReflectionStore tests pass
- [ ] `cargo test --lib -p goose -- planner::` -- Planner tests pass
- [ ] `cargo fmt --check` -- no formatting issues
- [ ] `cargo clippy --all-targets -- -D warnings` -- no clippy warnings

### Frontend (TypeScript)
- [ ] `npx tsc --noEmit` -- 0 TypeScript errors (run from `ui/desktop/`)
- [ ] `npx vitest run` -- 0 test failures (run from `ui/desktop/`)
- [ ] `npm run lint:check` -- 0 lint errors (run from `ui/desktop/`)

### CI
- [ ] All CI checks green on the PR
- [ ] `ci-main.yml` -- passed
- [ ] `ci-comprehensive.yml` -- passed
- [ ] `cargo-deny.yml` -- no new advisories

## Version Bump
- [ ] Version bumped in root `Cargo.toml` (workspace.package.version)
- [ ] Version bumped in `ui/desktop/package.json`
- [ ] CHANGELOG.md updated with release notes
- [ ] All version references consistent

## Build Artifacts

### Windows
- [ ] `cargo build --release -p goose-cli -p goose-server`
- [ ] Copy `goosed.exe` to `ui/desktop/src/bin/`
- [ ] `npm run make -- --platform=win32` (from `ui/desktop/`)
- [ ] Artifact: `Super-Goose-win32-x64-{version}.zip`

### Linux
- [ ] `cargo build --release`
- [ ] Copy `goosed` to `ui/desktop/src/bin/`
- [ ] `npm run make -- --platform=linux --arch=x64` (from `ui/desktop/`)
- [ ] Artifacts: `.deb` and `.rpm` packages

### macOS
- [ ] `cargo build --release` (ARM)
- [ ] `cargo build --release --target x86_64-apple-darwin` (Intel)
- [ ] Copy `goosed` to `ui/desktop/src/bin/`
- [ ] `npm run make` (from `ui/desktop/`)
- [ ] Artifact: `.dmg` installer

### Docker
- [ ] `docker build -t ghcr.io/ghenghis/super-goose:{version} .`
- [ ] `docker push ghcr.io/ghenghis/super-goose:{version}`
- [ ] `docker tag ... ghcr.io/ghenghis/super-goose:latest`
- [ ] `docker push ghcr.io/ghenghis/super-goose:latest`

## Release

### Git
- [ ] All changes committed and pushed
- [ ] PR merged to `main`
- [ ] Git tag created: `v{version}`
- [ ] Tag pushed to remote

### GitHub Release
- [ ] GitHub Release created from tag
- [ ] Release notes / changelog attached
- [ ] All platform artifacts uploaded:
  - [ ] Windows: `.exe`, `.zip`
  - [ ] Linux: `.deb`, `.rpm`
  - [ ] macOS: `.dmg`
  - [ ] CLI: `goose-{arch}-{os}.tar.bz2` (all platforms)
- [ ] `download_cli.sh` install script uploaded

### Documentation
- [ ] GitHub Pages: Docusaurus deploy (`documentation/`)
- [ ] Architecture docs updated if APIs changed
- [ ] README badges reflect current version

## Post-Release
- [ ] Verify install script works: `curl -fsSL https://ghenghis.github.io/Super-Goose/download_cli.sh | bash`
- [ ] Verify Docker image pulls and runs
- [ ] Verify desktop app launches on at least one platform
- [ ] Monitor CI for regressions on `main`
- [ ] Close associated milestone/issues
