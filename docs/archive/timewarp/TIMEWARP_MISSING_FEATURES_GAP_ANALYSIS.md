# TimeWarp: Missing Features Gap Analysis

**Project:** Super-Goose TimeWarp Feature
**Date:** February 2026
**Scope:** Complete gap analysis of what is MISSING from the existing TimeWarp design for true end-to-end failsafe coding project management
**Input Documents Audited:** ARCHITECTURE_BLUEPRINT.md, IMPLEMENTATION_ROADMAP.md, TIMEWARP_SOTA_RESEARCH.md, COMPETITIVE_ANALYSIS.md, TIMEWARP_BAR_UI_UX_SPEC.md, GITHUB_REPOS_REFERENCE.md, SUPER_GOOSE_INTEGRATION.md, TIMEWARP_DIAGRAMS.md, README1.md

---

## Priority Definitions

| Priority | Meaning | Timeline |
|----------|---------|----------|
| **P0** | Critical — system is unsafe or unreliable without this | Must ship in Phase 1 |
| **P1** | High — significant gap that affects real-world usability | Must ship by Phase 2-3 |
| **P2** | Medium — important for production use, competitive parity | Phase 3-4 |
| **P3** | Low — nice-to-have, future differentiator | Phase 5+ |

---

## Category 1: Auto-Backup & Failsafe Features

The existing TimeWarp design has **zero backup, crash recovery, or failsafe mechanisms**. The ARCHITECTURE_BLUEPRINT.md defines an append-only SQLite event store and content-addressed blob store, but never addresses what happens when things go wrong: power loss during a write, disk corruption, accidental deletion, or running out of space. This is the single largest gap in the entire design.

### 1.1 Write-Ahead Logging (WAL) for Atomic Operations

**Priority: P0**

**What is missing:** The SQLite schema in ARCHITECTURE_BLUEPRINT.md (Section 12) defines tables for events, snapshots, and branches, but does not specify WAL mode or any transactional guarantees for multi-table operations. A single agent action can trigger writes to the `events` table, the `snapshots` table, and the blob filesystem simultaneously. If the process crashes mid-write, the event store and blob store can become inconsistent — an event may reference a snapshot that was never fully written, or blobs may exist with no snapshot referencing them.

**Why it matters:** Without WAL mode and transaction boundaries, TimeWarp's core integrity guarantee (the hash chain) is built on a foundation that can silently corrupt. A single unclean shutdown during a file_write event could leave the database in a state where the hash chain appears broken — not because of tampering, but because of incomplete writes. Users would lose trust in the system.

**What needs to be specified:**
- Enable SQLite WAL mode at database initialization: `PRAGMA journal_mode=WAL;`
- Define transaction boundaries: each event recording (event row + snapshot row + blob writes) must be a single atomic transaction
- Blob writes must occur BEFORE the SQLite transaction commits (write blobs to temp location, then rename atomically, then commit SQL)
- Checkpoint strategy: WAL checkpoint after every N events (suggested: 100) or every M seconds (suggested: 30)
- Recovery procedure: on startup, verify last N events in hash chain, detect incomplete writes, and repair or mark as corrupt

**Implementation notes:**
- rusqlite supports WAL mode natively
- Blob store needs a write-ahead pattern: write to `.timewarp/blobs/.tmp/`, then atomic rename to final location
- Consider SQLite's `PRAGMA synchronous=NORMAL` for WAL mode (safe with WAL, faster than FULL)

---

### 1.2 Configurable Auto-Save Intervals

**Priority: P0**

**What is missing:** The SUPER_GOOSE_INTEGRATION.md config shows `snapshot_frequency = "on_change"` with options for `on_change | every_n_events | manual`, but there is no concept of time-based auto-save. If an agent is performing a long-running operation (e.g., a 10-minute build), and the process crashes, there is no periodic checkpoint of the event store state.

**Why it matters:** Developers working with AI agents often run long sessions. Without time-based auto-save, a crash during a long operation means losing all unsaved state since the last event. More critically, there is no "auto-save draft" concept — if the agent is mid-thought (generating a multi-file change), the partially-complete work is lost entirely.

**What needs to be specified:**
- Time-based auto-save interval: default 60 seconds, configurable 10s to 600s
- Auto-save creates a "checkpoint event" (type: `auto_checkpoint`) with current workspace snapshot
- Auto-checkpoint events are lightweight: they capture file tree state without recording an explicit action
- Configuration option: `auto_save_interval_seconds = 60`
- Auto-save must be non-blocking: snapshot capture runs in background thread
- Progress checkpoints for long-running commands: every 30 seconds during a build/test, capture intermediate output
- Idle detection: stop auto-saving if no agent activity for 5+ minutes (configurable)

---

### 1.3 Crash Recovery with Journal Replay

**Priority: P0**

**What is missing:** The existing design has no crash recovery mechanism at all. The ARCHITECTURE_BLUEPRINT.md describes the event store as append-only, but never addresses what happens when the append is interrupted. There is no journal, no recovery log, no startup integrity check, and no mechanism to detect or repair a corrupted state.

**Why it matters:** Crash recovery is not optional for a system that stores development history. If TimeWarp corrupts its database on an unclean shutdown, users lose their entire timeline — exactly the thing TimeWarp was designed to prevent. This would be a catastrophic trust failure.

**What needs to be specified:**
- **Startup integrity check:** On initialization, verify the hash chain of the last 100 events (configurable). If broken, identify the break point and attempt recovery.
- **Recovery journal:** Before any multi-step operation (event write + snapshot write + blob write), write a recovery journal entry describing the intended operation. On crash recovery, replay the journal to complete or roll back the operation.
- **Orphan blob cleanup:** After crash recovery, scan for blobs not referenced by any snapshot (orphans from incomplete writes). Quarantine rather than delete — move to `.timewarp/orphans/` for manual inspection.
- **Database backup before recovery:** Before attempting any automatic recovery, copy the database to `.timewarp/backups/pre-recovery-{timestamp}.db`
- **Recovery status reporting:** After recovery, report to the user what was recovered, what was lost, and the current integrity state.

---

### 1.4 Incremental Cloud Backup

**Priority: P1**

**What is missing:** The entire TimeWarp design is local-only. The `.timewarp/` directory lives on the local filesystem. There is no mention of cloud backup, remote replication, or off-site disaster recovery anywhere in any of the 9 documents. The GITHUB_REPOS_REFERENCE.md mentions libsql for replication but only as a passing note — no design for actually using it.

**Why it matters:** Local-only storage means a single disk failure destroys the entire timeline. For enterprise users, this is unacceptable. Even for individual developers, laptop theft/failure/OS reinstall means losing all development history.

**What needs to be specified:**
- **Backup targets:** Support at minimum: local path (NAS/external drive), S3-compatible (AWS S3, MinIO, Backblaze B2), and Google Cloud Storage
- **Incremental backup strategy:** Only upload new events and blobs since last backup. Use the event_id as a watermark.
- **Backup format:** Export the SQLite database plus a manifest of blob hashes. Blobs are already content-addressed, so deduplication is built-in.
- **Configuration:**
  ```toml
  [timewarp.backup]
  enabled = true
  target = "s3"                           # local | s3 | gcs
  bucket = "my-timewarp-backups"
  prefix = "project-name/"
  interval_minutes = 30                    # backup every 30 minutes
  max_backup_age_days = 90                 # retention policy
  encryption = "aes-256-gcm"              # encrypt at rest
  encryption_key_source = "env:TW_BACKUP_KEY"
  ```
- **Restore procedure:** `tw restore --from s3://bucket/prefix --to .timewarp/`
- **Backup verification:** After each backup, verify the remote copy by checking blob hash integrity
- **Bandwidth awareness:** Compress and deduplicate before upload. Estimated overhead: ~10% of blob store size for metadata.

**Rust crates needed:** `aws-sdk-s3`, `google-cloud-storage`, or `opendal` (unified storage abstraction)

---

### 1.5 Backup Verification & Integrity Checking

**Priority: P1**

**What is missing:** The hash chain provides integrity verification for the event log, but there is no scheduled or on-demand integrity verification for the blob store, the snapshot index, or backup copies. The ARCHITECTURE_BLUEPRINT.md describes hash computation but not verification procedures.

**Why it matters:** Silent corruption (bit rot, filesystem bugs, incomplete writes) can go undetected for weeks. By the time someone tries to jump to a past state, the blob they need may be corrupt — and they discover this at the worst possible time.

**What needs to be specified:**
- **Full integrity scan:** `tw verify --full` — verify every blob hash, every snapshot tree, and the complete hash chain. Report any mismatches.
- **Quick integrity scan:** `tw verify --quick` — verify hash chain only (fast, < 1 second for 10K events)
- **Scheduled verification:** Background job that runs full verification every 24 hours (configurable)
- **Blob integrity:** For each blob, recompute SHA-256/BLAKE3 and compare to stored hash. Report corrupt blobs with their affected snapshots and events.
- **Snapshot consistency:** For each snapshot, verify all referenced blobs exist and are valid.
- **Backup integrity:** After backup completes, verify remote copy matches local hashes.
- **Self-healing:** If a blob is corrupt but the same content exists in a backup, auto-restore it.
- **Corruption report:** When corruption is detected, generate a report showing: which events are affected, which files cannot be reconstructed, and suggested recovery actions.

---

### 1.6 Disaster Recovery from Corrupted State

**Priority: P1**

**What is missing:** No procedure exists for recovering from a corrupted TimeWarp database. If the SQLite file is damaged, or the blob store is partially deleted, the user has no path to recovery.

**Why it matters:** Users need confidence that TimeWarp is itself recoverable. A tool that promises "never lose your work" but can itself be irrecoverably lost is self-contradictory.

**What needs to be specified:**
- **Database rebuild from blobs:** If the SQLite database is lost but blobs are intact, reconstruct the snapshot index from blob contents + any remaining metadata files.
- **Event reconstruction from Git:** If TimeWarp had Git Sync enabled (Phase 2), reconstruct the event timeline from Git commit history.
- **Partial recovery:** If only some blobs are corrupt, identify which snapshots are still fully reconstructible and mark others as "partial — N files unrecoverable."
- **Export/Import:** `tw export --format archive --output timeline.tar.zst` — create a self-contained archive of the entire TimeWarp state. `tw import timeline.tar.zst` — restore from archive.
- **Emergency workspace recovery:** Even if the database is fully corrupt, provide `tw emergency-restore --latest` that attempts to find the most recent readable snapshot blobs and reconstruct the workspace from them.

---

### 1.7 Backup Rotation & Retention Policies

**Priority: P2**

**What is missing:** No concept of backup lifecycle management. Without rotation, backups grow unbounded.

**Why it matters:** Without retention policies, cloud backup costs grow linearly with time. A project running for 6 months could accumulate hundreds of GB of backup data.

**What needs to be specified:**
- **Retention policies:**
  - Keep all backups for last 7 days
  - Keep daily backups for last 30 days
  - Keep weekly backups for last 90 days
  - Keep monthly backups indefinitely (or configurable max age)
- **Storage quotas:** Maximum total backup size (e.g., 10GB). When exceeded, oldest non-retained backups are pruned.
- **Compaction:** Periodically compact the event store by creating a new full snapshot base, allowing old delta chains to be pruned.
- **Archive mode:** For completed projects, `tw archive` creates a final optimized backup and marks the project as archived (no further events recorded).

---

## Category 2: Git/GitHub/GitLab/Local Integration Gaps

The existing design mentions Git integration superficially. IMPLEMENTATION_ROADMAP.md Phase 2 lists "Git Sync" with "export branches to git" and "map events to commits." The ARCHITECTURE_BLUEPRINT.md shows a dashed "sync" line from Event Store to Git. But the actual specification is extremely thin — no PR/MR workflows, no hooks, no stash management, no submodule support, no LFS handling, no CI/CD integration.

### 2.1 Auto-Commit on Milestone Events

**Priority: P1**

**What is missing:** The Git Sync in Phase 2 maps events to commits, but there is no concept of automatic Git commits triggered by milestone events. Milestones are mentioned nowhere in the existing design — there is no way to mark certain events as more significant than others.

**Why it matters:** Not every TimeWarp event should become a Git commit (that would create thousands of commits). But key milestones — test suite passes, build succeeds, agent completes a task, user explicitly approves — should automatically create well-formatted Git commits. This bridges the gap between TimeWarp's fine-grained history and Git's coarser commit history.

**What needs to be specified:**
- **Milestone event types:** Define which events trigger auto-commits:
  - Test suite passes (`cmd_exec` where output contains "tests passed" or exit code 0 for test commands)
  - Build succeeds (`cmd_exec` for build commands with exit code 0)
  - User approval (explicit user action in CLI or UI)
  - ALMAS role handoff (Architect-to-Developer, Developer-to-QA, etc.)
  - Coach/Player final approval
  - Session end (configurable: auto-commit workspace state when session ends)
- **Commit message format:**
  ```
  [TimeWarp] {milestone_type}: {description}

  Events: {event_range}
  Branch: {timewarp_branch}
  Snapshot: {snapshot_hash}
  Reproducibility: {score}
  ```
- **Configuration:** `auto_commit = true | false`, `auto_commit_on = ["test_pass", "build_success", "user_approval"]`

---

### 2.2 PR/MR Auto-Creation from TimeWarp Branches

**Priority: P1**

**What is missing:** The IMPLEMENTATION_ROADMAP.md Phase 6+ (Future) lists "GitHub/GitLab integration — PR creation from TimeWarp branches" with zero detail. There is no specification for how a TimeWarp branch becomes a Pull Request.

**Why it matters:** TimeWarp branches are the natural unit of work for AI agents. The ability to say "create a PR from this TimeWarp branch" is the bridge between TimeWarp's internal history and team collaboration via GitHub/GitLab.

**What needs to be specified:**
- **PR creation command:** `tw pr create --branch oauth-feature --target main --title "Add OAuth" --body "Auto-generated from TimeWarp branch"`
- **PR body auto-generation:** Include timeline summary, file changes, test results, reproducibility score, and link to TimeWarp timeline view
- **Platform support:** GitHub (via `gh` CLI or API), GitLab (via API), Bitbucket (via API)
- **Draft PR support:** Create as draft by default, promote to ready when user confirms
- **PR update on new events:** When new events are added to the TimeWarp branch, update the PR (push new commits, update description)
- **PR merge back to TimeWarp:** When a PR is merged, record the merge as a TimeWarp event with the PR URL and merge commit hash
- **Configuration:**
  ```toml
  [timewarp.git.pr]
  platform = "github"              # github | gitlab | bitbucket
  auto_create = false              # create PR automatically on branch creation
  draft_by_default = true
  include_timeline_summary = true
  include_reproducibility_score = true
  ```

---

### 2.3 Git Hooks Integration

**Priority: P1**

**What is missing:** No mention of Git hooks anywhere in the design. TimeWarp should integrate with Git's hook system to capture Git operations that happen outside of TimeWarp (manual git commits, interactive rebases, etc.).

**Why it matters:** Developers often make manual Git changes between agent sessions. Without hook integration, TimeWarp has a blind spot — it sees agent actions via MCP but misses manual Git operations. This creates gaps in the timeline.

**What needs to be specified:**
- **post-commit hook:** After any Git commit (manual or agent), create a TimeWarp event recording the commit hash, message, and affected files
- **post-checkout hook:** When switching branches in Git, update TimeWarp's awareness of the current workspace state
- **pre-push hook (optional):** Before pushing, verify TimeWarp timeline integrity for the branch being pushed
- **post-merge hook:** After a Git merge, create a TimeWarp merge event
- **Hook installation:** `tw hooks install` — adds hooks to `.git/hooks/` (or configures `core.hooksPath`)
- **Hook uninstallation:** `tw hooks uninstall`
- **Non-intrusive:** Hooks must not block Git operations. Use async recording with timeout (max 500ms).

---

### 2.4 Stash Management Across Time Jumps

**Priority: P2**

**What is missing:** The Jump operation (Section 11.1 of ARCHITECTURE_BLUEPRINT.md) restores workspace files from a snapshot, but there is no mention of what happens to uncommitted changes when jumping. If the user has unsaved work and runs `tw jump E7`, that work is silently overwritten.

**Why it matters:** Losing unsaved work during a time jump is exactly the kind of data loss TimeWarp is supposed to prevent. Without stash management, the very tool designed to protect against data loss can itself cause data loss.

**What needs to be specified:**
- **Auto-stash on jump:** Before restoring a snapshot, auto-stash any uncommitted changes as a TimeWarp event (type: `auto_stash`)
- **Stash list:** `tw stash list` — show all auto-stashed states with timestamps and descriptions
- **Stash apply:** `tw stash apply [stash_id]` — restore stashed changes on top of current workspace
- **Stash drop:** `tw stash drop [stash_id]` — discard a stash
- **Warning prompt:** If jumping would discard uncommitted changes, warn the user and offer to stash first
- **Git stash integration:** Optionally link TimeWarp stashes to `git stash` entries

---

### 2.5 Submodule and Monorepo Support

**Priority: P2**

**What is missing:** The snapshot model assumes a single workspace directory. There is no handling for Git submodules, Git worktrees, or monorepo structures where multiple packages share a repository.

**Why it matters:** Many real-world projects use submodules (for shared libraries) or monorepo structures (for microservices). TimeWarp must handle these correctly or it will produce incomplete or incorrect snapshots.

**What needs to be specified:**
- **Submodule awareness:** Snapshot store must track submodule paths, commit hashes, and optionally submodule contents
- **Monorepo package detection:** Detect workspace packages (Cargo workspaces, npm workspaces, Lerna, Turborepo, Bazel) and create per-package snapshots in addition to full workspace snapshots
- **Selective snapshot scope:** Configuration to limit snapshots to specific directories:
  ```toml
  [timewarp.scope]
  include = ["packages/api", "packages/web"]
  exclude = ["node_modules", "target", ".git"]
  ```
- **Submodule snapshot strategy:** `shallow` (record commit hash only) vs `deep` (snapshot submodule contents)

---

### 2.6 Git LFS Support for Large Binary Files

**Priority: P2**

**What is missing:** The blob store caps at `max_blob_size_mb = 100` (from the config spec), but there is no handling for Git LFS-tracked files. Large binaries (images, models, compiled assets) are common in real projects.

**Why it matters:** Without LFS awareness, TimeWarp either wastes storage by duplicating LFS-tracked files in its blob store, or misses them entirely, making snapshot reconstruction incomplete.

**What needs to be specified:**
- **LFS detection:** Detect `.gitattributes` LFS patterns and identify LFS-tracked files
- **LFS reference storage:** Instead of storing the full binary content, store the LFS pointer (hash + size) in the snapshot
- **LFS blob caching:** Optionally cache LFS blobs locally for faster reconstruction
- **LFS restore:** When reconstructing a snapshot, use `git lfs pull` for LFS files rather than restoring from blob store
- **Size threshold:** Files above a configurable size (e.g., 10MB) are automatically treated as LFS-like (stored as references, not content)

---

### 2.7 Force Push Protection

**Priority: P1**

**What is missing:** No protection against force pushes that rewrite Git history. If a developer force-pushes after TimeWarp has synced branches to Git, the Git history and TimeWarp history diverge irrecoverably.

**Why it matters:** Force pushes are the #1 cause of lost work in Git workflows. TimeWarp should be the safety net, not a victim.

**What needs to be specified:**
- **Force push detection:** Git hooks detect `--force` push and warn the user
- **Pre-push snapshot:** Before any push (especially force push), create a TimeWarp snapshot of the affected branch
- **Force push recovery:** `tw recover --from-force-push` — restore the pre-force-push state from TimeWarp's event store
- **Branch protection rules:** Configurable rules that prevent force-pushing branches that have TimeWarp events:
  ```toml
  [timewarp.git.protection]
  prevent_force_push = ["main", "develop"]
  warn_force_push = true
  ```

---

### 2.8 Remote Sync Status & Conflict Resolution

**Priority: P2**

**What is missing:** No concept of remote state awareness. TimeWarp operates purely locally and has no mechanism to detect that the remote Git repository has diverged from the local state.

**Why it matters:** AI agents often work asynchronously. If two agents (or a human and an agent) work on the same repository, their TimeWarp timelines will diverge. There needs to be a way to detect and resolve this.

**What needs to be specified:**
- **Remote status check:** `tw remote status` — compare local HEAD with remote HEAD for each Git-synced branch
- **Divergence detection:** When local and remote have diverged, show the divergence point and number of events on each side
- **Pull integration:** `tw pull` — fetch remote changes and integrate them as TimeWarp events
- **Push integration:** `tw push` — sync local TimeWarp events to a shared remote store (beyond Git)

---

### 2.9 CI/CD Pipeline Triggers

**Priority: P2**

**What is missing:** No integration with CI/CD systems. When TimeWarp creates a Git branch or PR, it should be able to trigger CI pipelines and record the results.

**Why it matters:** The developer workflow does not end at code generation. CI/CD feedback (test results, build status, deployment outcomes) should be part of the timeline.

**What needs to be specified:**
- **CI status recording:** When a CI pipeline runs on a TimeWarp-managed branch, record the result as a TimeWarp event (type: `ci_result`)
- **GitHub Actions integration:** Read workflow run status via GitHub API and record as events
- **GitLab CI integration:** Read pipeline status via GitLab API
- **Webhook receiver:** Accept webhooks from CI systems and record as events
- **CI-triggered snapshots:** When CI passes, auto-create a snapshot (useful for deployment verification)

---

### 2.10 Bitbucket Support

**Priority: P3**

**What is missing:** Only GitHub and GitLab are mentioned in passing. Bitbucket is not addressed.

**Why it matters:** Bitbucket is the third major Git hosting platform, used extensively in enterprise (Atlassian ecosystem). Not supporting it limits TimeWarp's enterprise adoption.

**What needs to be specified:**
- Bitbucket Cloud API integration for PR creation, status checks, and webhooks
- Bitbucket Server (self-hosted) support
- Bitbucket Pipelines CI/CD integration

---

## Category 3: Multi-Language / Project Type Support

The existing design mentions tree-sitter for AST parsing in Phase 4, listing "TypeScript, Python, Rust initially." This covers only 3 of 13+ common project types. More critically, there is no concept of project type detection — TimeWarp does not know what kind of project it is instrumenting, which means it cannot make smart decisions about what to snapshot, how to detect milestones, or how to interpret build outputs.

### 3.1 Project Type Auto-Detection

**Priority: P1**

**What is missing:** TimeWarp has no mechanism to detect what kind of project it is running in. It treats all projects identically — a Rust Cargo workspace and a Python Django app get the same treatment.

**Why it matters:** Different project types have different build systems, test frameworks, dependency managers, and conventions. TimeWarp needs to know what it is working with to provide intelligent features like auto-milestone detection, smart snapshot triggers, and dependency health checking.

**What needs to be specified:**
- **Detection by marker files:**

| Project Type | Marker Files | Build Command | Test Command | Lock File |
|---|---|---|---|---|
| Rust/Cargo | `Cargo.toml`, `Cargo.lock` | `cargo build` | `cargo test` | `Cargo.lock` |
| Node.js/npm | `package.json`, `package-lock.json` | `npm run build` | `npm test` | `package-lock.json` |
| Node.js/yarn | `package.json`, `yarn.lock` | `yarn build` | `yarn test` | `yarn.lock` |
| Node.js/pnpm | `package.json`, `pnpm-lock.yaml` | `pnpm build` | `pnpm test` | `pnpm-lock.yaml` |
| Python/pip | `requirements.txt`, `setup.py`, `pyproject.toml` | varies | `pytest` | `requirements.txt` |
| Python/Poetry | `pyproject.toml`, `poetry.lock` | `poetry build` | `poetry run pytest` | `poetry.lock` |
| Go | `go.mod`, `go.sum` | `go build ./...` | `go test ./...` | `go.sum` |
| Java/Maven | `pom.xml` | `mvn package` | `mvn test` | N/A |
| Java/Gradle | `build.gradle`, `build.gradle.kts` | `./gradlew build` | `./gradlew test` | `gradle.lockfile` |
| Kotlin | `build.gradle.kts` (with kotlin) | `./gradlew build` | `./gradlew test` | `gradle.lockfile` |
| C/C++/CMake | `CMakeLists.txt` | `cmake --build build` | `ctest` | N/A |
| C/C++/Make | `Makefile` | `make` | `make test` | N/A |
| Swift/SPM | `Package.swift` | `swift build` | `swift test` | `Package.resolved` |
| Ruby/Bundler | `Gemfile`, `Gemfile.lock` | varies | `bundle exec rspec` | `Gemfile.lock` |
| PHP/Composer | `composer.json`, `composer.lock` | varies | `./vendor/bin/phpunit` | `composer.lock` |
| .NET/C# | `*.csproj`, `*.sln` | `dotnet build` | `dotnet test` | `packages.lock.json` |
| Docker | `Dockerfile`, `docker-compose.yml` | `docker build .` | varies | N/A |
| Kubernetes | `*.yaml` (with apiVersion), `kustomization.yaml` | `kubectl apply` | varies | N/A |
| Terraform/IaC | `*.tf`, `terraform.tfstate` | `terraform plan` | `terraform validate` | `.terraform.lock.hcl` |

- **Multi-project detection:** A repository may contain multiple project types (e.g., Rust backend + TypeScript frontend). Detect all and report as a multi-project workspace.
- **Configuration override:** Users can specify project type explicitly:
  ```toml
  [timewarp.project]
  type = "rust"                    # auto | rust | node | python | ...
  build_command = "cargo build"
  test_command = "cargo test"
  lock_files = ["Cargo.lock"]
  ```

---

### 3.2 Language-Specific Snapshot Exclusions

**Priority: P1**

**What is missing:** The config shows generic exclusion but no language-aware defaults. Every developer has to manually configure exclusions for their project type.

**Why it matters:** Without smart defaults, TimeWarp will snapshot `node_modules/` (potentially hundreds of MB), `target/` (Rust build artifacts, potentially GB), `__pycache__/`, `.gradle/`, etc. This wastes storage and slows down snapshot operations.

**What needs to be specified:**
- **Default exclusion patterns by project type:**

| Project Type | Default Exclusions |
|---|---|
| Rust | `target/`, `*.rlib`, `*.rmeta`, `*.d` |
| Node.js | `node_modules/`, `.next/`, `dist/`, `build/`, `.cache/` |
| Python | `__pycache__/`, `*.pyc`, `.venv/`, `venv/`, `.tox/`, `*.egg-info/` |
| Go | vendor/ (if not vendoring), `*.test` |
| Java/Kotlin | `build/`, `.gradle/`, `*.class`, `*.jar` (except in lib/) |
| C/C++ | `build/`, `*.o`, `*.obj`, `*.so`, `*.dylib`, `*.dll` |
| .NET | `bin/`, `obj/`, `*.dll`, `packages/` |
| Docker | (none — Dockerfiles are small) |
| Universal | `.git/`, `.timewarp/`, `.DS_Store`, `Thumbs.db`, `*.swp`, `*.swo` |

- **Smart exclusion:** Detect gitignore patterns and use them as a baseline, adding TimeWarp-specific exclusions on top.

---

### 3.3 Language-Specific Semantic Analysis Expansion

**Priority: P2**

**What is missing:** Phase 4 specifies tree-sitter for TypeScript, Python, and Rust. This leaves Go, Java, Kotlin, C, C++, Swift, Ruby, PHP, and C# without semantic conflict detection.

**Why it matters:** Semantic conflict detection is one of TimeWarp's key differentiators. Limiting it to 3 languages significantly reduces its value for the majority of developers.

**What needs to be specified:**
- **Priority order for language support:**
  1. TypeScript/JavaScript (largest developer population)
  2. Python (second largest, heavy AI/ML usage)
  3. Rust (Super-Goose's own language)
  4. Go (growing, simple AST)
  5. Java/Kotlin (enterprise, complex but well-structured AST)
  6. C/C++ (complex, but tree-sitter support exists)
  7. Ruby, PHP, Swift, C# (later phases)
- **Tree-sitter grammar availability:** All listed languages have tree-sitter grammars available
- **Minimum semantic analysis per language:**
  - Function/method rename detection
  - Type/return type change detection
  - Import/dependency change detection
  - Variable scope conflict detection

---

### 3.4 Multi-Language Project Handling

**Priority: P2**

**What is missing:** No handling for projects that use multiple languages (e.g., Rust backend + TypeScript frontend, Python ML + Go API).

**Why it matters:** Most modern projects are polyglot. TimeWarp needs to apply the correct language-specific analysis to each file based on its language, not the project type.

**What needs to be specified:**
- **Per-file language detection:** Use file extension and optional shebang line to detect language per file
- **Multi-parser support:** Load multiple tree-sitter parsers simultaneously for polyglot projects
- **Cross-language conflict detection:** Detect conflicts that span languages (e.g., TypeScript API client expects a field that the Rust API server removed)

---

### 3.5 Docker/Kubernetes Project Support

**Priority: P2**

**What is missing:** Docker and Kubernetes projects have unique requirements not addressed in the current design: image digests, Helm chart values, ConfigMaps, and Secrets all need special handling.

**What needs to be specified:**
- **Dockerfile change tracking:** Detect base image changes, multi-stage build modifications
- **docker-compose change tracking:** Detect service configuration changes, port mapping changes, volume mount changes
- **Kubernetes manifest tracking:** Detect resource changes, image tag updates, ConfigMap/Secret changes
- **Image digest pinning:** For replay, pin Docker image digests (not tags) so the exact same image is used

---

### 3.6 Terraform / Infrastructure-as-Code Support

**Priority: P3**

**What is missing:** IaC projects (Terraform, Pulumi, CloudFormation) have unique time-travel requirements — state files represent live infrastructure, and "jumping back" could imply infrastructure rollback.

**What needs to be specified:**
- **State file tracking:** Snapshot Terraform state files with special handling (they contain sensitive data)
- **Plan output recording:** Record `terraform plan` output as event metadata for audit trail
- **Drift detection for infrastructure:** Compare current infrastructure state to TimeWarp snapshots
- **Safety warning:** When jumping to a past state in an IaC project, warn that this does NOT roll back actual infrastructure

---

## Category 4: Missing Safety Features

The existing design focuses on the hash chain for integrity but has minimal safety features to protect users from accidental data loss, unauthorized access, or resource exhaustion.

### 4.1 Undo Protection (Double-Confirm Destructive Operations)

**Priority: P0**

**What is missing:** The TIMEWARP_BAR_UI_UX_SPEC.md mentions "Ctrl+Z to undo" but there is no specification for protecting against destructive operations like branch deletion, snapshot pruning, or event store compaction.

**Why it matters:** TimeWarp manages the developer's safety net. Accidentally deleting a branch or pruning snapshots means losing the safety net itself.

**What needs to be specified:**
- **Destructive operation list:**
  - Branch deletion
  - Snapshot pruning/compaction
  - Event store truncation
  - Clear/reset entire TimeWarp state
  - Force jump (overwriting unsaved changes)
- **Confirmation requirements:**
  - CLI: Require `--force` flag or interactive "Type 'DELETE' to confirm" prompt
  - UI: Two-step confirmation dialog with operation description and impact summary
- **Soft delete:** Deleted branches are moved to "trash" (archived status) and retained for 30 days before permanent deletion
- **Undo window:** All destructive operations are reversible within 60 seconds via `tw undo`

---

### 4.2 Branch Protection Rules

**Priority: P1**

**What is missing:** No concept of branch protection. Any operation can target any branch, including main/production branches.

**Why it matters:** In team environments, certain branches should be protected from accidental modification, deletion, or forced jumps.

**What needs to be specified:**
- **Protection levels:**
  - `none` — No restrictions
  - `warn` — Warn before modifying, require confirmation
  - `protect` — Prevent modification by non-admin users
  - `lock` — Fully immutable (archive only)
- **Default protection:** Main branch is `warn` by default
- **Configuration:**
  ```toml
  [timewarp.branches.protection]
  main = "protect"
  develop = "warn"
  "release/*" = "protect"
  ```

---

### 4.3 Snapshot Size Limits & Storage Quotas

**Priority: P1**

**What is missing:** The config has `max_blob_size_mb = 100` but no overall storage quota, no per-snapshot size limit, and no warning system for approaching limits.

**Why it matters:** Without storage management, TimeWarp can consume unbounded disk space. A long-running agent session in a large project could generate hundreds of GB of snapshots.

**What needs to be specified:**
- **Storage quota:** Maximum total `.timewarp/` size (default: 10GB, configurable)
- **Per-snapshot size limit:** Maximum size of a single snapshot (default: 500MB)
- **Warning thresholds:** Warn at 70%, 85%, and 95% of quota
- **Auto-compaction:** When quota is approached, automatically compact old delta chains and prune unreferenced blobs
- **Storage reporting:** `tw storage` — show current usage, largest snapshots, largest blobs, and compaction recommendations

---

### 4.4 Disk Space Monitoring

**Priority: P1**

**What is missing:** No monitoring of available disk space. TimeWarp will happily fill the disk and crash.

**Why it matters:** Running out of disk space during a snapshot write can corrupt the blob store and the database.

**What needs to be specified:**
- **Pre-write check:** Before any blob write, verify that at least 500MB (configurable) of free disk space is available
- **Low space warning:** When available space drops below 2GB, warn the user and suggest compaction
- **Critical space protection:** When available space drops below 500MB, stop recording new snapshots (events still recorded, but without snapshots)
- **Background monitoring:** Check disk space every 60 seconds during active sessions

---

### 4.5 Network Failure Handling During Remote Sync

**Priority: P2**

**What is missing:** No handling for network failures during cloud backup or remote sync operations.

**Why it matters:** Network failures during backup can leave partial uploads that waste storage and create inconsistent remote state.

**What needs to be specified:**
- **Resumable uploads:** Use multipart upload with checkpointing so failed uploads can resume from the last successful part
- **Retry policy:** Exponential backoff with jitter: 1s, 2s, 4s, 8s, max 60s, max 5 retries
- **Offline mode:** Queue backup operations when offline, execute when connectivity is restored
- **Partial backup detection:** On startup, check for incomplete backups and complete or clean them up

---

### 4.6 Permission Model for Multi-User Environments

**Priority: P2**

**What is missing:** No access control or permission model. The SUPER_GOOSE_INTEGRATION.md mentions ALMAS with RBAC, but TimeWarp itself has no user concept.

**Why it matters:** In team settings, not everyone should be able to delete branches, prune snapshots, or modify the event store.

**What needs to be specified:**
- **User identification:** Each TimeWarp event records the user who initiated it (from Git config, environment variable, or explicit config)
- **Permission levels:**
  - `viewer` — Read-only access to timeline and snapshots
  - `contributor` — Can create branches, add events, and jump
  - `maintainer` — Can merge, prune, and manage branches
  - `admin` — Full access including deletion and configuration
- **Configuration:**
  ```toml
  [timewarp.users]
  default_role = "contributor"

  [[timewarp.users.roles]]
  user = "admin@example.com"
  role = "admin"
  ```

---

### 4.7 Audit Trail for TimeWarp Operations

**Priority: P2**

**What is missing:** The event store records agent actions, but there is no audit trail for TimeWarp's own operations (jumps, branch creations, merges, deletions, configuration changes).

**Why it matters:** For enterprise compliance, every modification to the development history must be auditable. If someone deleted a branch, there should be a record of who did it and when.

**What needs to be specified:**
- **TimeWarp operation log:** Separate from the event store, record all TimeWarp operations:
  - `tw_jump` — who jumped, from where, to where
  - `tw_branch_create` — who created, fork point, name
  - `tw_branch_delete` — who deleted, branch name, last event
  - `tw_merge` — who merged, source, target, conflicts
  - `tw_prune` — who pruned, what was removed
  - `tw_config_change` — who changed what setting
- **Operation log storage:** Append-only SQLite table (separate from events), cannot be deleted by any user
- **Export:** `tw audit export --from 2026-01-01 --to 2026-02-01 --format json`

---

## Category 5: Missing Agent Intelligence

The existing design records events passively. The Instrumentation Middleware captures what happens, but TimeWarp makes no intelligent decisions about what is important, what is risky, or what the developer should know. This section covers the intelligence layer that would make TimeWarp proactive rather than reactive.

### 5.1 Auto-Milestone Detection

**Priority: P1**

**What is missing:** There is no concept of automatically detecting when significant events occur. All events are treated equally — a file read and a successful deployment carry the same weight in the timeline.

**Why it matters:** Without milestones, the timeline is a flat sequence of events with no structure. Users have to manually scan through hundreds of events to find the important moments. Auto-milestone detection makes the timeline navigable and meaningful.

**What needs to be specified:**
- **Milestone detection rules:**

| Milestone Type | Detection Signal | Importance |
|---|---|---|
| Tests Pass | `cmd_exec` with test command + exit code 0 | High |
| Tests Fail | `cmd_exec` with test command + exit code != 0 | High (negative) |
| Build Success | `cmd_exec` with build command + exit code 0 | Medium |
| Build Failure | `cmd_exec` with build command + exit code != 0 | Medium (negative) |
| First Compile | First successful build after a series of failures | High |
| Green-to-Red | Tests were passing, now failing | Critical |
| Red-to-Green | Tests were failing, now passing | Critical |
| New File Created | `file_write` for a path that did not exist before | Low |
| Large Refactor | 5+ files changed in a single event sequence | Medium |
| Deploy | `cmd_exec` matching deploy patterns (e.g., `kubectl apply`, `docker push`) | Critical |
| ALMAS Role Handoff | Metadata indicates role transition | High |
| Coach Approval | Coach/Player system approves code | High |
| Session Start/End | First/last event in a session | Medium |

- **Milestone markers in timeline UI:** Milestones shown as larger, color-coded nodes on the timeline bar
- **Milestone-based navigation:** `tw jump --milestone latest-green` — jump to the last passing test milestone
- **Milestone filtering:** `tw log --milestones-only` — show only milestone events

---

### 5.2 Smart Snapshot Triggers

**Priority: P1**

**What is missing:** The current snapshot strategy is simple: `on_change` (every state-changing event), `every_n_events`, or `manual`. There is no intelligence about when snapshots are most valuable.

**Why it matters:** Not all snapshots are equally valuable. A snapshot right before a test run is more valuable than a snapshot after a trivial whitespace change. Smart triggers optimize storage while ensuring the most important states are captured.

**What needs to be specified:**
- **Value-based snapshotting:**
  - Always snapshot: before and after test runs, before and after builds, before and after deploys
  - Always snapshot: when a new file is created, when a file is deleted
  - Sometimes snapshot: on every Nth file_write to the same file (avoid snapshotting every character change in rapid edits)
  - Never snapshot: file_read events (read-only, no state change)
- **Consolidation:** When rapid edits produce many snapshots in quick succession (< 5 seconds apart), consolidate to keep only the first and last snapshot of the burst
- **Importance scoring:** Each snapshot gets an importance score based on what events reference it. High-importance snapshots are retained longer during compaction.

---

### 5.3 Dependency Health Checking at Snapshots

**Priority: P2**

**What is missing:** No concept of checking dependency health. TimeWarp snapshots file state but does not analyze whether dependencies are healthy, up-to-date, or secure at each snapshot point.

**Why it matters:** A snapshot might capture a workspace that was working at the time but had a vulnerable dependency. When replaying from that snapshot, the vulnerability is reintroduced. Dependency health at snapshot time is critical metadata for security-conscious teams.

**What needs to be specified:**
- **Lock file tracking:** At each snapshot, hash the lock file (Cargo.lock, package-lock.json, poetry.lock, etc.) and record the hash as snapshot metadata
- **Dependency version recording:** Record the top-level dependency versions at each milestone snapshot
- **Vulnerability check (optional):** At milestone snapshots, run a lightweight vulnerability check against a local advisory database (e.g., `cargo audit`, `npm audit --json`)
- **Dependency drift detection:** When jumping to a past snapshot, compare the lock file at that snapshot to the current lock file and report differences
- **Configuration:**
  ```toml
  [timewarp.dependencies]
  track_lock_files = true
  vulnerability_check = "on_milestone"    # never | on_milestone | on_every_snapshot
  advisory_db = "local"                   # local | online
  ```

---

### 5.4 Security Scanning Integration at Checkpoints

**Priority: P2**

**What is missing:** No security scanning integration. TimeWarp records events but does not analyze the security implications of agent actions.

**Why it matters:** AI agents can introduce security vulnerabilities (e.g., hardcoded credentials, SQL injection, insecure dependencies). TimeWarp is the natural place to catch these because it sees every code change.

**What needs to be specified:**
- **Secret detection at events:** When a `file_write` event occurs, scan the written content for secrets (API keys, passwords, tokens) using regex patterns similar to GitHub's secret scanning
- **Vulnerability annotation:** If a snapshot has known vulnerabilities in its dependency tree, annotate the snapshot with vulnerability severity
- **Security milestone:** Create a special milestone when a security issue is introduced or resolved
- **Integration with existing tools:** Support running external scanners (Semgrep, Snyk, trivy) and recording results as TimeWarp event metadata
- **Configuration:**
  ```toml
  [timewarp.security]
  secret_scanning = true
  vulnerability_scanning = "on_milestone"
  external_scanner = "semgrep"
  ```

---

### 5.5 Cost Tracking Per Timeline Branch

**Priority: P2**

**What is missing:** No tracking of LLM API costs per branch or session. The event store records `llm_call` events but does not track token usage or cost.

**Why it matters:** AI agent sessions can be expensive. Developers need to understand the cost of different approaches. "Branch A cost $4.50 in API calls, Branch B cost $12.00" is actionable information for choosing which approach to keep.

**What needs to be specified:**
- **Token recording:** For each `llm_call` event, record: model, input_tokens, output_tokens, cached_tokens
- **Cost calculation:** Apply model-specific pricing to compute cost per event (using pricing tables from the existing Observability module if available)
- **Per-branch aggregation:** Sum costs for all events in a branch
- **Per-session aggregation:** Sum costs for all events in a session (across branches)
- **Cost display in timeline UI:** Show cumulative cost alongside the timeline
- **Cost comparison:** When comparing branches, show cost difference
- **CLI command:** `tw cost [--branch <name>] [--session <id>]` — show cost breakdown

---

### 5.6 Performance Regression Detection Across Snapshots

**Priority: P3**

**What is missing:** No tracking of performance metrics across snapshots. If test execution time doubles between snapshots, or build time increases by 50%, there is no detection or alerting.

**Why it matters:** Performance regressions are often introduced silently. By tracking performance metrics at milestone snapshots, TimeWarp can detect when things get slower and pinpoint which event caused the regression.

**What needs to be specified:**
- **Metrics to track:**
  - Test execution time (from `cmd_exec` events for test commands)
  - Build time (from `cmd_exec` events for build commands)
  - Test count (number of tests passing/failing)
  - Binary size (if applicable)
  - Memory usage (if available from test output)
- **Regression detection:** Compare metrics at each milestone to the previous milestone. If any metric degrades by more than a configurable threshold (default: 20%), flag the milestone.
- **Trend visualization:** Show performance trends on the timeline UI (sparklines or mini-charts)
- **Regression alerts:** When a regression is detected, annotate the timeline event and optionally notify the user
- **Baseline management:** Allow users to set a baseline snapshot for performance comparison: `tw baseline set E47`

---

## Summary: Gap Count by Category and Priority

| Category | P0 | P1 | P2 | P3 | Total |
|----------|----|----|----|----|-------|
| 1. Auto-Backup & Failsafe | 3 | 3 | 1 | 0 | **7** |
| 2. Git Integration | 0 | 4 | 4 | 1 | **9** |
| 3. Multi-Language Support | 0 | 2 | 3 | 1 | **6** |
| 4. Safety Features | 1 | 3 | 3 | 0 | **7** |
| 5. Agent Intelligence | 0 | 2 | 3 | 1 | **6** |
| **Total** | **4** | **14** | **14** | **3** | **35** |

### Critical Path (P0 Items — Must Ship in Phase 1)

1. **1.1 WAL for Atomic Operations** — Without this, the event store can corrupt on any crash
2. **1.2 Configurable Auto-Save Intervals** — Without this, long operations risk data loss
3. **1.3 Crash Recovery with Journal Replay** — Without this, any crash is potentially catastrophic
4. **4.1 Undo Protection** — Without this, users can accidentally destroy their safety net

### High Priority (P1 Items — Must Ship by Phase 2-3)

1. 1.4 Incremental Cloud Backup
2. 1.5 Backup Verification & Integrity Checking
3. 1.6 Disaster Recovery
4. 2.1 Auto-Commit on Milestones
5. 2.2 PR/MR Auto-Creation
6. 2.3 Git Hooks Integration
7. 2.7 Force Push Protection
8. 3.1 Project Type Auto-Detection
9. 3.2 Language-Specific Snapshot Exclusions
10. 4.2 Branch Protection Rules
11. 4.3 Snapshot Size Limits
12. 4.4 Disk Space Monitoring
13. 5.1 Auto-Milestone Detection
14. 5.2 Smart Snapshot Triggers

---

## Recommended Implementation Order

### Phase 1 Additions (Critical Failsafe)
Add to existing Phase 1 spec:
- 1.1 WAL mode + transaction boundaries
- 1.2 Auto-save interval configuration
- 1.3 Startup integrity check + recovery journal
- 4.1 Destructive operation confirmation
- 4.4 Disk space monitoring

### Phase 2 Additions (Git Integration)
Add to existing Phase 2 spec:
- 2.1 Auto-commit on milestones
- 2.3 Git hooks integration
- 2.4 Stash management on jump
- 2.7 Force push protection
- 3.1 Project type auto-detection
- 3.2 Language-specific snapshot exclusions

### Phase 3 Additions (Safety + Intelligence)
Add to existing Phase 3 spec:
- 1.4 Incremental cloud backup
- 1.5 Backup verification
- 4.2 Branch protection rules
- 4.3 Storage quotas
- 5.1 Auto-milestone detection
- 5.2 Smart snapshot triggers

### Phase 4 Additions (Semantic + Security)
Add to existing Phase 4 spec:
- 3.3 Expanded language support (Go, Java, Kotlin)
- 3.4 Multi-language project handling
- 5.3 Dependency health checking
- 5.4 Security scanning integration

### Phase 5 Additions (UI + Advanced)
Add to existing Phase 5 spec:
- 2.2 PR/MR auto-creation (UI integration)
- 5.5 Cost tracking per branch (UI display)
- 5.6 Performance regression detection (trend visualization)
- 4.6 Permission model (user management in UI)
- 4.7 Audit trail (operation history view)

### Phase 6+ Additions (Enterprise)
- 1.6 Disaster recovery procedures
- 1.7 Backup rotation policies
- 2.5 Submodule/monorepo support
- 2.6 Git LFS support
- 2.8 Remote sync status
- 2.9 CI/CD pipeline triggers
- 2.10 Bitbucket support
- 3.5 Docker/K8s project support
- 3.6 Terraform/IaC support
- 4.5 Network failure handling

---

*Analysis based on comprehensive review of all 9 existing TimeWarp design documents. Every gap identified represents a feature that is absent from the current specification, not merely under-specified.*
