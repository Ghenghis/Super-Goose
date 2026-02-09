# Development Standards

**Super-Goose Project** | Version 1.0 | Last Updated: 2026-02-08

This document defines the mandatory development standards for all contributors to the
Super-Goose project. Every pull request, commit, and release MUST comply with these
standards. No exceptions without documented exemptions approved by a maintainer.

---

## Table of Contents

1. [Pre-Commit Requirements](#1-pre-commit-requirements)
2. [CI/CD Gate Rules](#2-cicd-gate-rules)
3. [Workflow Management Standards](#3-workflow-management-standards)
4. [Code Quality Standards](#4-code-quality-standards)
5. [Security Standards](#5-security-standards)
6. [Release Process](#6-release-process)
7. [Dependency and RUSTSEC Policy](#7-dependency-and-rustsec-policy)
8. [Branch and Git Conventions](#8-branch-and-git-conventions)
9. [Fork-Specific Considerations](#9-fork-specific-considerations)
10. [Enforcement and Escalation](#10-enforcement-and-escalation)

---

## 1. Pre-Commit Requirements

Every developer MUST validate their changes locally before pushing. The project provides
tooling to enforce this automatically, but developers are expected to understand what
is being checked and why.

### 1.1 Automated Pre-Commit Hook

The project uses Husky (configured in `ui/desktop/package.json`) with a pre-commit hook
at `.husky/pre-commit`. The hook currently checks for incomplete code markers (TODO,
FIXME, HACK, XXX) in staged `.ts`, `.tsx`, `.js`, `.jsx`, and `.rs` files.

**Developers MUST NOT bypass hooks with `--no-verify` except in documented emergencies.**
Any commit pushed with `--no-verify` must be explained in the PR description.

### 1.2 Rust Checks (MANDATORY before push)

Run all of the following. The `just check-everything` command covers most of these:

```bash
# Format all Rust code (auto-fixes formatting)
cargo fmt --all

# Verify formatting is clean (CI uses --check which fails on drift)
cargo fmt --all --check

# Run Clippy with deny-warnings (matches CI exactly)
cargo clippy --all-targets -- -D warnings

# Run unit tests
cargo test --lib --all

# Run integration tests
cargo test --test '*' --all
```

**Key rules:**
- `cargo fmt --check` MUST pass with zero diff.
- `cargo clippy` MUST produce zero warnings (warnings are treated as errors via `-D warnings`).
- All tests MUST pass. Flaky tests must be quarantined (see Section 3.4), never ignored.

### 1.3 TypeScript Checks (MANDATORY before push)

```bash
cd ui/desktop

# Type checking (no emit, just verify types)
npm run typecheck

# ESLint with zero warnings tolerance
npm run lint:check

# Prettier formatting check
npm run format:check

# Run unit tests
npm run test:run
```

**Key rules:**
- `npm run typecheck` (which runs `tsc --noEmit`) MUST pass with zero errors.
- `npm run lint:check` MUST pass with zero warnings (`--max-warnings 0`).
- `npm run format:check` MUST show no formatting drift.
- All Vitest tests MUST pass.

The project has `lint-staged` configured in `ui/desktop/package.json` which auto-runs
typecheck, ESLint fix, and Prettier on staged `.ts`/`.tsx` files.

### 1.4 Secret Scanning (MANDATORY before push)

**NEVER commit secrets, tokens, API keys, passwords, or credentials.**

Before every commit, verify:
```bash
# Search staged files for common secret patterns
git diff --cached --name-only | xargs grep -nE \
  '(password|secret|api_key|token|private_key)\s*[:=]' \
  --include='*.rs' --include='*.ts' --include='*.tsx' \
  --include='*.json' --include='*.yaml' --include='*.yml' \
  --include='*.toml' --include='*.env'
```

Files that MUST NEVER be committed:
- `.env` files (already in `.gitignore`)
- `credentials.json`, `secrets.yaml`, or similar
- Any file containing hardcoded API keys, tokens, or passwords
- SSH private keys, PEM files, or certificate private keys

### 1.5 Quick Validation Command

Use the project's built-in validation:

```bash
# Runs: cargo fmt, cargo clippy, TLS crate check, UI lint, OpenAPI schema check
just check-everything
```

This covers most pre-commit requirements in a single command. Supplement with
`cargo test` and `npm run test:run` for full coverage.

---

## 2. CI/CD Gate Rules

### 2.1 Zero Tolerance Policy

**No pull request may be merged unless ALL required CI checks pass.**

There are no exceptions. If a check is broken by infrastructure (not by your code), the
correct response is to fix the infrastructure or get a maintainer to temporarily mark
the check as non-required -- never to merge with failures.

### 2.2 Required Status Checks

The following checks from `ci-main.yml` MUST pass before merge to `main`:

| Check | What It Validates |
|-------|-------------------|
| `ci-status` | Aggregate gate -- fails if any sub-check fails |
| `lint-rust` | `cargo fmt --check` and `cargo clippy --all-targets -- -D warnings` |
| `lint-typescript` | `tsc --noEmit` and ESLint with zero warnings |
| `build-rust` | Full release build of all crates |
| `build-typescript` | Full desktop app build |
| `test-rust-unit` | `cargo test --lib --all` |
| `test-rust-integration` | `cargo test --test '*' --all` |
| `test-typescript` | `vitest run` |

The CI system uses smart change detection (`dorny/paths-filter@v3`). If only
documentation files change, code checks are skipped. If only Rust files change,
TypeScript checks are skipped, and vice versa.

### 2.3 Branch Protection Rules (GitHub Settings)

The following branch protection rules MUST be configured on `main`:

- **Require pull request reviews before merging**: Minimum 1 approval required.
- **Require status checks to pass before merging**: Enable with the checks listed
  in Section 2.2 as required.
- **Require branches to be up to date before merging**: Enabled. PRs must be
  rebased or merged with the latest `main`.
- **Require signed commits**: Recommended but not currently enforced.
- **Restrict who can push to matching branches**: Only maintainers may push
  directly to `main`.
- **Do not allow bypassing the above settings**: Even administrators must comply.

### 2.4 Additional CI Workflows

Beyond the main CI pipeline, the following workflows provide additional gates:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `cargo-audit.yml` | Push to dependency files, daily schedule | RUSTSEC advisory scanning |
| `scorecard.yml` | Push to `main`, weekly schedule | OpenSSF supply-chain security scoring |
| `recipe-security-scanner.yml` | PR with recipe changes | AI-powered recipe security scanning |
| `pr-smoke-test.yml` | PR comment trigger | On-demand smoke testing |

### 2.5 CI Performance Standards

- All CI jobs SHOULD complete within their defined `timeout-minutes`.
- The full CI pipeline SHOULD complete in under 20 minutes for typical changes.
- Use the concurrency group (`cancel-in-progress: true`) to avoid wasting resources
  on superseded runs.
- Rust dependency caching (`Swatinem/rust-cache@v2`) is mandatory for all Rust jobs.
- Node.js dependency caching (`cache: 'npm'`) is mandatory for all TypeScript jobs.

---

## 3. Workflow Management Standards

### 3.1 Workflow Inventory

The project currently maintains ~40 GitHub Actions workflows. Each workflow MUST be in
one of three states:

1. **Active**: Runs on its defined triggers and MUST pass.
2. **Disabled**: Renamed with `.DISABLED` suffix (e.g., `ci-OLD.yml.DISABLED`).
   Kept for reference but does not run.
3. **Scheduled-only**: Runs on cron but not on push/PR. Used for periodic scans.

### 3.2 When to Disable vs Fix a Workflow

**Fix the workflow when:**
- The failure is caused by code in this repository.
- The fix is straightforward (wrong path, missing dependency, config error).
- The workflow validates something important for code quality or security.

**Disable the workflow when:**
- It depends on secrets that are not available in the fork (see Section 9).
- It validates something irrelevant to this fork (e.g., upstream-specific deployment).
- It has been broken for more than 2 weeks with no clear fix path.
- It is superseded by a newer, better workflow.

**To disable a workflow:**
1. Rename the file with a `.DISABLED` suffix.
2. Add a comment at the top explaining why it was disabled and what would be needed
   to re-enable it.
3. Open a tracking issue if re-enablement is planned.

**NEVER delete a workflow file** unless it is confirmed to have no value and no
upstream equivalent. Deletion loses git history context.

### 3.3 Creating New Workflows

New workflows MUST:
- Use pinned action versions with SHA hashes (not floating tags like `@v4`).
  Example: `actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8  # v6.0.1`
- Include `timeout-minutes` on every job.
- Include a concurrency group if triggered by push or PR.
- Use `permissions` at the workflow or job level with least-privilege.
- Use `Swatinem/rust-cache@v2` for any job that runs cargo commands.
- Be documented in this file's workflow inventory table (Section 2.4) if they
  serve as merge gates.

### 3.4 Quarantine Policy for Flaky Tests

If a test is flaky (passes sometimes, fails sometimes without code changes):

1. Move it to the quarantine workflow (`quarantine.yml`).
2. Open a GitHub issue tagged `flaky-test` with reproduction steps.
3. The quarantine workflow runs separately and does NOT block merges.
4. Flaky tests MUST be fixed or removed within 30 days.
5. Never mark a consistently failing test as flaky. That is a real failure.

---

## 4. Code Quality Standards

### 4.1 Rust Standards

**Formatting:**
- All Rust code MUST be formatted with `rustfmt` (default configuration).
- No `rustfmt.toml` overrides are currently used; the project uses Rust edition 2021
  defaults.

**Linting:**
- All Rust code MUST pass `cargo clippy --all-targets -- -D warnings`.
- The workspace has the following Clippy configuration in `Cargo.toml`:
  - `uninlined_format_args = "allow"` (permits `format!("{}", x)` style)
  - `string_slice = "warn"` (warns on string slicing which can panic on non-ASCII)
- Adding new `#[allow(...)]` annotations requires a comment explaining why the lint
  does not apply.

**Error Handling:**
- Use `anyhow::Result` for application-level error handling.
- Use `thiserror` for library-level error types that callers need to match on.
- Never use `.unwrap()` in production code. Use `.expect("descriptive message")`
  only when the invariant is genuinely guaranteed and documented.
- Never use `panic!()` in library code.

**Testing:**
- Unit tests go in the same file as the code (`#[cfg(test)]` module).
- Integration tests go in `crates/<crate>/tests/`.
- Tests MUST be deterministic. Non-deterministic tests belong in quarantine.
- Scenario tests that require external services are excluded from default CI
  (`--skip scenario_tests`).

**Dependencies:**
- New dependencies MUST be added to `[workspace.dependencies]` in the root
  `Cargo.toml` and referenced with `workspace = true` in crate-level Cargo.toml files.
- Avoid adding dependencies for trivial functionality.
- Prefer `no-default-features` and enable only what is needed.

### 4.2 TypeScript Standards

**Formatting:**
- All TypeScript/TSX code MUST be formatted with Prettier.
- All CSS and JSON files in `ui/desktop/src/` MUST be formatted with Prettier.
- Run `npm run format` to auto-fix, `npm run format:check` to verify.

**Linting:**
- ESLint with the TypeScript plugin is mandatory.
- Zero warnings policy: `--max-warnings 0`.
- The ESLint configuration is in `ui/desktop/eslint.config.js` and
  `ui/desktop/.eslintrc.json`.
- React hooks rules (`eslint-plugin-react-hooks`) are enforced.

**Type Safety:**
- `strict` mode is expected in `tsconfig.json`.
- No `any` types without a comment explaining why.
- No `@ts-ignore` without a comment explaining why and a linked issue for removal.

**Testing:**
- Vitest is the test framework (`npm run test:run`).
- Playwright is used for E2E tests (`npm run test-e2e`).
- React components should be tested with `@testing-library/react`.

**Node.js Version:**
- The project requires Node.js `^24.10.0` and npm `^11.6.1` (see `engines` in
  `ui/desktop/package.json`).
- Use `npm ci` (not `npm install`) in CI for reproducible installs.

### 4.3 Test Coverage

**Targets (aspirational, enforced progressively):**

| Scope | Minimum Coverage | Enforcement |
|-------|-----------------|-------------|
| Rust unit tests | 70% line coverage | Advisory (not blocking) |
| Rust integration tests | Critical paths covered | PR review |
| TypeScript unit tests | 70% line coverage | Advisory (not blocking) |
| TypeScript E2E tests | Happy paths covered | PR review |

Coverage tools:
- Rust: `cargo-tarpaulin` or `cargo-llvm-cov` (not yet integrated in CI)
- TypeScript: `vitest --coverage` using `@vitest/coverage-v8`

Coverage SHOULD trend upward. PRs that significantly decrease coverage will be
flagged in review.

---

## 5. Security Standards

### 5.1 Mandatory Security Scanning

The following security scans are part of the project's CI pipeline:

| Scanner | Workflow | Frequency | Scope |
|---------|----------|-----------|-------|
| `cargo audit` | `cargo-audit.yml` | Daily + on dependency changes | Rust RUSTSEC advisories |
| OpenSSF Scorecard | `scorecard.yml` | Weekly + on push to `main` | Supply-chain security |
| GitHub Code Scanning | CodeQL (GitHub-managed) | On PR + push to `main` | Code vulnerabilities |
| Recipe Security Scanner | `recipe-security-scanner.yml` | On PR with recipe changes | Recipe content safety |
| Step Security Harden Runner | Used in security-sensitive workflows | Per-workflow | Egress policy enforcement |

### 5.2 Secret Management

**Rules:**
1. **NEVER commit secrets to the repository.** This includes API keys, tokens,
   passwords, certificates, and private keys.
2. All secrets MUST be stored in GitHub Actions Secrets or environment-specific
   secret stores.
3. Secret names MUST be descriptive: `OPENAI_API_KEY`, not `KEY1`.
4. Rotate secrets immediately if any exposure is suspected.
5. The `.gitignore` MUST include common secret file patterns (`.env`, `*.pem`,
   `credentials.*`).

**Fork-specific secret considerations:** See Section 9.2.

### 5.3 Cleartext Logging Policy

**NEVER log sensitive information.** This includes:
- API keys, tokens, or passwords
- User credentials or session identifiers
- Private keys or certificates
- Full request/response bodies that may contain sensitive data

Use structured logging with `tracing` and ensure sensitive fields are redacted:
```rust
// BAD
tracing::info!("API key: {}", api_key);

// GOOD
tracing::info!("API key: [REDACTED]");
tracing::info!(api_key_prefix = &api_key[..8], "Using API key");
```

### 5.4 Cryptographic Standards

- Never hardcode cryptographic keys, salts, or initialization vectors.
- Use OS-provided randomness (`rand::rngs::OsRng` in Rust, `crypto.randomBytes` in
  Node.js).
- Use well-established crates for cryptography (`ring`, `rustls`, `aes-gcm`).
- Never use `native-tls` -- the project enforces `rustls` only
  (`scripts/check-no-native-tls.sh`).

### 5.5 Dependency Pinning

All GitHub Actions used in workflows SHOULD be pinned to full SHA hashes:
```yaml
# GOOD - pinned to specific commit
- uses: actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8  # v6.0.1

# BAD - floating tag, vulnerable to supply-chain attacks
- uses: actions/checkout@v4
```

This is enforced by the OpenSSF Scorecard workflow. New workflows MUST follow this
pattern.

---

## 6. Release Process

### 6.1 Version Scheme

The project uses [Semantic Versioning 2.0.0](https://semver.org/):
- **MAJOR**: Breaking API changes
- **MINOR**: New features, backward-compatible
- **PATCH**: Bug fixes, backward-compatible

The current version is maintained in two places that MUST stay synchronized:
1. `Cargo.toml` (`workspace.package.version`)
2. `ui/desktop/package.json` (`version`)

The `just prepare-release <version>` command updates both automatically.

### 6.2 Release Workflow

1. **Decide version bump type**: `minor` or `patch`.
2. **Create release PR**: Use the `create-release-pr.yaml` workflow or manually:
   ```bash
   just prepare-release <version>
   ```
   This creates a `release/<version>` branch, updates version numbers, updates
   `Cargo.lock`, regenerates the OpenAPI schema, and creates a commit.
3. **Push release branch**: `git push origin release/<version>`
4. **Create PR**: Target `main`, title: `chore(release): release version <version>`
5. **Review and merge**: All CI checks MUST pass. At least 1 approval required.
6. **Tag the release**: After merge to `main`:
   ```bash
   just tag       # Creates v<version> tag
   just tag-push  # Pushes tag to origin, triggers release workflow
   ```
7. **Automated release**: The `release.yml` workflow builds CLI binaries and desktop
   bundles for macOS (ARM + Intel), Linux, and Windows, then creates a GitHub Release.

### 6.3 Changelog

The project maintains `CHANGELOG.md` following the
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format.

**Rules:**
- Every PR that changes user-visible behavior MUST include a changelog entry
  under `[Unreleased]`.
- Categories: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
- At release time, `[Unreleased]` is renamed to `[<version>] - <date>`.
- Upstream merges are documented under `Merged from Upstream (block/goose)`.

### 6.4 Release Checklist

Before tagging a release:

- [ ] All CI checks pass on `main`
- [ ] `CHANGELOG.md` updated with release date
- [ ] Version numbers synchronized (`Cargo.toml`, `package.json`)
- [ ] `cargo audit` shows no new critical/high advisories
- [ ] No critical or high GitHub code scanning alerts introduced since last release
- [ ] Desktop app tested on at least one platform
- [ ] Release notes drafted

---

## 7. Dependency and RUSTSEC Policy

### 7.1 Rust Dependency Management

**Adding dependencies:**
1. Check for RUSTSEC advisories on the crate: `cargo audit -d <crate>`.
2. Evaluate the crate's maintenance status, download count, and last update.
3. Prefer crates with a strong track record and active maintenance.
4. Add to `[workspace.dependencies]` in root `Cargo.toml`.
5. Use `workspace = true` in crate-level `Cargo.toml`.

**Updating dependencies:**
- Run `cargo update` at least monthly to pick up patch releases.
- Run `cargo audit` after every update.
- Dependabot PRs for Rust dependencies should be reviewed and merged within 1 week
  for high/critical advisories, 2 weeks for medium, 1 month for low.

### 7.2 RUSTSEC Advisory Handling

When `cargo audit` flags an advisory:

**Direct dependency:**
1. Update to a patched version immediately if available.
2. If no patch exists, evaluate the risk and document a decision.
3. If the advisory is not applicable (e.g., the vulnerable code path is not used),
   add an exemption to `audit.toml`:
   ```toml
   [advisories]
   ignore = ["RUSTSEC-YYYY-NNNN"]  # Reason: <explain why this is safe>
   ```

**Transitive dependency:**
1. Check if updating the direct dependency resolves it.
2. If not, check if the vulnerable code path is reachable from our code.
3. Document unreachable vulnerabilities with a comment in `audit.toml`.
4. Example from this project: `RUSTSEC-2023-0071` is ignored because `sqlx-mysql`
   pulls in `rsa`, but goose only uses sqlite.

**Unmaintained crate advisories:**
- These are lower priority but should be tracked.
- Open a GitHub issue tagged `unmaintained-dep` for each.
- Evaluate replacement crates when capacity allows.
- Do not let unmaintained crate counts grow unbounded -- review quarterly.

### 7.3 audit.toml Exemption Policy

Every entry in `audit.toml` MUST include:
1. The RUSTSEC ID.
2. A comment explaining why the exemption is safe.
3. A date when the exemption was added.
4. An issue link for tracking resolution (if applicable).

Exemptions MUST be reviewed every 90 days. Stale exemptions (where a fix is now
available) MUST be removed and the dependency updated.

### 7.4 TypeScript Dependency Management

- Use `npm ci` in CI (never `npm install`) for reproducible builds.
- Review `npm audit` output monthly.
- Dependabot PRs for npm dependencies follow the same SLA as Rust (Section 7.1).
- The project uses `overrides` in `package.json` for React version alignment --
  document any new overrides.

### 7.5 Dependency Update Cadence

| Action | Frequency | Owner |
|--------|-----------|-------|
| `cargo update` (patch versions) | Monthly | Any contributor |
| `npm update` (patch versions) | Monthly | Any contributor |
| Dependabot PR review (critical/high) | Within 1 week | Maintainers |
| Dependabot PR review (medium) | Within 2 weeks | Maintainers |
| Dependabot PR review (low) | Within 1 month | Maintainers |
| `cargo audit` review | Daily (automated) + on dependency changes | Automated/Maintainers |
| `audit.toml` exemption review | Every 90 days | Maintainers |
| RUSTSEC unmaintained crate review | Quarterly | Maintainers |

---

## 8. Branch and Git Conventions

### 8.1 Branch Naming

| Branch Pattern | Purpose |
|---------------|---------|
| `main` | Production-ready code. Protected. |
| `release/<version>` | Release preparation branches. Created by `just prepare-release`. |
| `feature/<description>` | New feature development. |
| `fix/<description>` | Bug fixes. |
| `chore/<description>` | Maintenance, dependency updates, CI changes. |
| `claude/<slug>` | AI-assisted development branches (Claude Code worktrees). |

### 8.2 Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `chore`: Maintenance (deps, CI, build)
- `docs`: Documentation only
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding or correcting tests
- `perf`: Performance improvement
- `security`: Security fix

**Scopes** (examples):
- `goose`, `goose-cli`, `goose-server`, `goose-mcp`, `goose-acp` (Rust crates)
- `ui`, `desktop` (TypeScript/Electron)
- `ci`, `workflows` (CI/CD)
- `deps` (dependency updates)
- `release` (release process)

**Examples:**
```
feat(goose): add ALMAS multi-agent team coordination
fix(ui): resolve electron updater crash on Windows
chore(deps): update tokio to 1.49
security(goose-server): redact API keys in log output
chore(release): release version 1.24.0
```

### 8.3 Pull Request Standards

Every PR MUST:
1. Have a clear, descriptive title following Conventional Commits format.
2. Include a description of what changed and why.
3. Reference any related GitHub issues (e.g., `Fixes #123`, `Relates to #456`).
4. Pass all required CI checks.
5. Have at least 1 approval from a maintainer.
6. Not introduce new `TODO`/`FIXME` markers without a linked tracking issue.

Every PR SHOULD:
- Be small and focused (under 500 lines changed when possible).
- Include tests for new functionality.
- Update documentation if behavior changes.
- Include a `CHANGELOG.md` entry if user-facing.

---

## 9. Fork-Specific Considerations

### 9.1 Upstream Relationship

Super-Goose is a fork of [block/goose](https://github.com/block/goose). This creates
specific obligations and constraints:

**Syncing with upstream:**
- Regularly pull from `block/goose` to stay current.
- Upstream merges should be documented in `CHANGELOG.md` under
  `Merged from Upstream (block/goose)`.
- Resolve merge conflicts promptly. Do not let the fork drift significantly.

**Contributing back:**
- Bug fixes and non-Super-Goose-specific improvements SHOULD be contributed back
  to upstream via PRs to `block/goose`.
- Super-Goose-specific features (ALMAS, EvoAgentX, Coach/Player) are NOT
  contributed upstream.

### 9.2 Fork Secret Management

Many upstream workflows require secrets that are not available in this fork. The
following secrets are fork-specific and MUST be configured in GitHub Settings:

| Secret | Used By | Required For |
|--------|---------|-------------|
| `GITHUB_TOKEN` | All workflows | Automatic (provided by GitHub) |
| `OPENAI_API_KEY` | Recipe scanner, release PR | Security scanning, release notes |
| `OSX_CODESIGN_ROLE` | Desktop bundle (macOS) | Code signing |
| `WINDOWS_CODESIGN_CERTIFICATE` | Desktop bundle (Windows) | Code signing |

Workflows that require secrets not available in the fork MUST:
1. Include a conditional check: `if: github.repository == 'Ghenghis/Super-Goose'`
2. OR be disabled with a `.DISABLED` suffix and explanation.
3. OR gracefully skip when secrets are missing (preferred).

### 9.3 Handling Upstream Workflows

When upstream adds or modifies workflows:

1. **Evaluate relevance**: Does this workflow apply to our fork?
2. **Check secret requirements**: Does it need secrets we do not have?
3. **Adapt or disable**: If relevant, adapt to our fork. If not, disable with
   documentation.
4. **Never silently break**: A workflow that exists must either pass or be explicitly
   disabled.

---

## 10. Enforcement and Escalation

### 10.1 Automated Enforcement

The following are enforced automatically and cannot be bypassed:

| Check | Enforced By | Consequence of Failure |
|-------|------------|----------------------|
| Rust formatting | CI (`cargo fmt --check`) | PR cannot merge |
| Rust linting | CI (`cargo clippy -D warnings`) | PR cannot merge |
| TypeScript type checking | CI (`tsc --noEmit`) | PR cannot merge |
| TypeScript linting | CI (ESLint `--max-warnings 0`) | PR cannot merge |
| Rust tests | CI (`cargo test`) | PR cannot merge |
| TypeScript tests | CI (`vitest run`) | PR cannot merge |
| Secret scanning | GitHub Advanced Security | Commit blocked |
| RUSTSEC advisories | `cargo-audit.yml` (daily) | Issue created |

### 10.2 Review-Time Enforcement

The following are enforced during code review:

- No new `#[allow(...)]` without justification comment
- No new `@ts-ignore` without justification comment and tracking issue
- No new `.unwrap()` in production code
- Changelog updated for user-facing changes
- Test coverage does not decrease significantly
- No hardcoded secrets, keys, or credentials
- Dependencies added to workspace level

### 10.3 Escalation Process

If a CI check is blocking a legitimate, urgent change:

1. **First**: Try to fix the check. Most failures are real problems.
2. **If infrastructure**: Document the infrastructure issue in a GitHub issue.
3. **If truly blocked**: A maintainer may temporarily remove the check from
   required status checks with a documented reason and a timeline for restoration.
4. **Never**: Merge with failures, delete a workflow to avoid its check, or use
   force-push to bypass protections.

### 10.4 Exception Requests

To request an exception to any standard in this document:

1. Open a GitHub issue tagged `standards-exception`.
2. Describe: What standard, why the exception is needed, what the risk is,
   and when the exception expires.
3. Get approval from at least 1 maintainer.
4. Document the exception in the PR description.
5. Set a calendar reminder for the expiration date.

---

## Appendix A: Quick Reference Commands

```bash
# === Full local validation (do this before pushing) ===
just check-everything          # Rust fmt + clippy + TLS check + UI lint + OpenAPI
cargo test --lib --all         # Rust unit tests
cargo test --test '*' --all    # Rust integration tests
cd ui/desktop && npm run test:run  # TypeScript unit tests

# === Individual checks ===
cargo fmt --all --check        # Rust formatting check
cargo clippy --all-targets -- -D warnings  # Rust linting
cd ui/desktop && npm run typecheck   # TypeScript type checking
cd ui/desktop && npm run lint:check  # TypeScript linting
cd ui/desktop && npm run format:check  # Prettier formatting check

# === Security ===
cargo audit                    # Check for RUSTSEC advisories
cd ui/desktop && npm audit     # Check for npm advisories

# === Release ===
just prepare-release <version> # Create release branch and bump versions
just tag                       # Create git tag from Cargo.toml version
just tag-push                  # Push tag to trigger release workflow
just get-tag-version           # Show current version from Cargo.toml
just get-next-minor-version    # Calculate next minor version
just get-next-patch-version    # Calculate next patch version
```

## Appendix B: Tool Versions

| Tool | Version Requirement | Notes |
|------|-------------------|-------|
| Rust | Stable (latest) | Updated via `rustup update stable` |
| Node.js | `^24.10.0` | See `engines` in `package.json` |
| npm | `^11.6.1` | See `engines` in `package.json` |
| just | Latest | Task runner, see `Justfile` |
| Husky | `^9.1.7` | Git hooks |

## Appendix C: File Organization

```
Super-Goose/
  Cargo.toml              # Workspace root with shared dependencies
  Justfile                 # Task runner commands
  CHANGELOG.md             # Release history
  DEVELOPMENT_STANDARDS.md # This document
  crates/
    goose/                 # Core agent library
    goose-cli/             # CLI binary
    goose-server/          # HTTP server
    goose-mcp/             # MCP protocol support
    goose-acp/             # ACP protocol support
    goose-bench/           # Benchmarking
    goose-test/            # Test utilities
  ui/
    desktop/               # Electron + React desktop app
      package.json         # Node.js dependencies and scripts
      eslint.config.js     # ESLint configuration
      .eslintrc.json       # ESLint configuration (legacy)
  .github/
    workflows/             # CI/CD workflow definitions
  .husky/
    pre-commit             # Pre-commit hook (code marker check)
    pre-push               # Pre-push hook (SonarQube gate)
```

---

*This document is maintained by the Super-Goose maintainers. Changes to this document
require the same PR review process as code changes. Last reviewed: 2026-02-08.*
