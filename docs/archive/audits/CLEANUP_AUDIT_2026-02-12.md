# Documentation Cleanup Audit

**Date:** 2026-02-12
**Agent:** 10 (CI/CD + Release)
**Branch:** `feat/resizable-layout`

---

## Actions Taken

### 1. Moved: `COMPACTION_WIRING.md` (root -> docs/)
- **From:** `G:\goose\COMPACTION_WIRING.md`
- **To:** `G:\goose\docs\COMPACTION_WIRING.md`
- **Reason:** Session completion doc was orphaned at repo root. Belongs with other compaction docs in `docs/`.

---

## Duplicate / Overlapping Documentation Found

### Compaction Docs (3 files covering same topic)
| File | Content | Recommendation |
|------|---------|----------------|
| `docs/COMPACTION_WIRING.md` | Session report on wiring CompactionManager (just moved) | **Archive** to `docs/archive/sessions/` |
| `docs/COMPACTION_WIRING_STATUS.md` | Status summary: "FULLY WIRED AND TESTED" | **Keep** — concise reference |
| `docs/TASK_COMPLETE_COMPACTION_WIRING.md` | Task completion report: "ALREADY COMPLETE" | **Archive** to `docs/archive/sessions/` |

### Agentic Cores Docs (2 files with overlapping content)
| File | Content | Recommendation |
|------|---------|----------------|
| `docs/AGENTIC_CORES.md` | 28KB overview of 6-core system | **Keep** — primary reference |
| `docs/ARCHITECTURE_AGENTIC_CORES.md` | 20KB architecture reference with TOC | **Archive** — superseded by `AGENTIC_CORES.md` and `ARCHITECTURE.md` |

### Release Checklists (3 files)
| File | Content | Recommendation |
|------|---------|----------------|
| `RELEASE_CHECKLIST.md` (root) | Upstream goose manual testing checklist (generic) | **Keep at root** — upstream file |
| `docs/RELEASE_CHECKLIST.md` | Super-Goose specific release checklist | **Keep** — active reference |
| `docs/RELEASE_CHECKLIST_v1.24.02.md` | Version-specific checklist for v1.24.02 | **Archive** — version-specific, now stale |

### Features Docs (2 files)
| File | Content | Recommendation |
|------|---------|----------------|
| `FEATURES.md` (root) | Upstream features list, v1.23.0 (Feb 7) | **Keep at root** — upstream file, but outdated |
| `docs/FEATURES.md` | Super-Goose feature catalog, v1.24.05 (Feb 12) | **Keep** — current reference |

---

## Root-Level Markdown Files: Classification

### Upstream Files (keep at root)
These came from Block's goose repo and should stay at root:
- `README.md` — Project README
- `CHANGELOG.md` — Release changelog
- `CONTRIBUTING.md` — Upstream contribution guide
- `CONTRIBUTING_RECIPES.md` — Upstream recipes guide
- `GOVERNANCE.md` — Project governance
- `MAINTAINERS.md` — Maintainer list
- `SECURITY.md` — Security policy
- `AGENTS.md` — Agent documentation
- `BUILD_LOCAL.md` — Local build instructions
- `RELEASE.md` — Release process
- `RELEASE_CHECKLIST.md` — Manual testing checklist
- `FEATURES.md` — Feature list (upstream version)

### Super-Goose Additions (recommend moving to docs/)
These are Super-Goose specific and cluttering the repo root:

| File | Recommendation |
|------|----------------|
| `AUDIO_VISUALIZER_SPEC.md` | Move to `docs/conscious/` — Conscious project spec |
| `CONSCIOUS_PROJECT_SUMMARY.md` | Move to `docs/conscious/` — Feb 8 session summary |
| `CONTRIBUTING_SUPER_GOOSE.md` | **Keep at root** — contributor guide for our fork |
| `DEVELOPMENT_STANDARDS.md` | Move to `docs/` — dev standards reference |
| `DOCUMENTATION_GAP_ANALYSIS.md` | Move to `docs/archive/sessions/` — Feb 8 audit, now stale |
| `ISSUES.md` | Move to `docs/archive/sessions/` — Feb 5 known issues, most resolved |
| `RELEASE_READY_CHECKLIST.md` | Move to `docs/archive/sessions/` — one-time "ready for release" checklist |

---

## Root-Level Batch Files

### Current State
5 `.bat` files at repo root (a `scripts/` directory already exists with `.sh`/`.ps1` equivalents):

| File | Purpose | Recommendation |
|------|---------|----------------|
| `test_compaction.bat` | Run compaction tests with LIB env | Move to `scripts/` |
| `fix-warnings.bat` | Auto-fix Clippy warnings | Move to `scripts/` |
| `measure-coverage.bat` | Run cargo-llvm-cov | Move to `scripts/` |
| `run_core_tests.bat` | Run core tests with LIB env | Move to `scripts/` — note: has outdated MSVC path (14.50 vs 14.43) |
| `run-all-quality-checks.bat` | Master quality pipeline | Move to `scripts/` |

---

## docs/ Files to Archive

### Session Completion Reports (move to `docs/archive/sessions/`)
These are one-time session reports with no ongoing reference value:

1. `docs/COMPACTION_WIRING.md` — Session wiring report
2. `docs/TASK_COMPLETE_COMPACTION_WIRING.md` — Task completion confirmation
3. `docs/ARCHITECTURE_AGENTIC_CORES.md` — Superseded by AGENTIC_CORES.md
4. `docs/RELEASE_CHECKLIST_v1.24.02.md` — Version-specific, now v1.24.05
5. `docs/e2e-conditional-skip-changes.md` — E2E change log (Feb 12 session)
6. `docs/e2e-skip-verification.md` — E2E verification guide (Feb 12 session)
7. `docs/settings-backend-migration.md` — Migration report (Feb 12 session)
8. `docs/EXTENSIONS_API_IMPLEMENTATION.md` — Implementation report (Feb 13 session)
9. `docs/maybe_useful_for_gaps.md` — Scratch notes on L8-L13 levels

### Stale Reference Docs (review for archival)
10. `docs/IMPL_EXTENDED_THINKING.md` — Implementation notes, likely captured in main ARCHITECTURE
11. `docs/IMPL_PROMPT_CACHING.md` — Implementation notes, likely captured in main ARCHITECTURE
12. `docs/CODE_SIGNING_STATUS.md` — Code signing status (Feb 6), may still be relevant
13. `docs/FREE_CODE_SIGNING_OPTIONS.md` — Research doc (Feb 6)
14. `docs/WINDOWS_CODE_SIGNING.md` — Research doc (Feb 6)

---

## docs/ Files to Keep (Active References)

| File | Reason |
|------|--------|
| `docs/AGENTIC_CORES.md` | Primary core system reference |
| `docs/ARCHITECTURE.md` | Main architecture doc |
| `docs/BUILD_AND_DEPLOY.md` | Build/deploy guide |
| `docs/CHANGELOG.md` | Super-Goose changelog |
| `docs/COMPACTION_WIRING_STATUS.md` | Concise compaction status |
| `docs/CONTINUATION_L13_ACTION_PLAN.md` | Living L13 plan |
| `docs/ENTERPRISE.md` | Enterprise features overview |
| `docs/ENTERPRISE_WORKFLOW_GUIDE.md` | Enterprise workflow guide |
| `docs/FEATURES.md` | Feature catalog (current) |
| `docs/L13.md` | L13 research doc |
| `docs/RELEASE_CHECKLIST.md` | Current release checklist |
| `docs/ROADMAP.md` | Project roadmap |
| `docs/TESTING.md` | Testing guide |
| `docs/UI_PANEL_SYSTEM.md` | Panel system reference |
| `docs/UPSTREAM_PR_PROPOSAL.md` | Upstream contribution proposal |

### Subdirectories to Keep
| Directory | Reason |
|-----------|--------|
| `docs/archive/sessions/` | Historical session docs (57 files) |
| `docs/assets/` | SVG diagrams (12 files) |
| `docs/audits/` | Audit reports (34 files) — consider archiving older ones |
| `docs/conscious/` | Conscious subsystem docs (5 files) |
| `docs/enterprise-qa/` | Enterprise QA suite (20+ files) |
| `docs/guides/` | How-to guides (15 files) |
| `docs/panel-features/` | Panel feature specs (8 files) |
| `docs/plans/` | Historical plans (29 files) — many are stale |
| `docs/timewarp/` | TimeWarp specs (16+ files) |

---

## docs/CONTINUATION_10_AGENTS_MASTER.md Status

This file documents the 10-agent workforce plan from Feb 11. Most tasks are marked DONE:
- Agent 1 (Core Wirer): 6/8 DONE, 2 TODO
- Agent 2-10: Mixed status

**Recommendation:** Archive to `docs/archive/sessions/` — this was a session planning doc, not a living document. The CONTINUATION_L13_ACTION_PLAN.md supersedes it.

---

## Subdirectories with High Stale Content

### `docs/plans/` (29 files, ~400KB)
Many files from Feb 3-7 that are now superseded:
- Multiple "GITHUB_*" workflow fix plans (5 files) — workflows are now GREEN
- Multiple "SUPER_GOOSE_*" plans (3 files) — implementation complete
- Multiple "QUALITY_*" plans (4 files) — quality system operational
- `MASTER_ACTION_PLAN.md` — Feb 3, superseded by L13 action plan

**Recommendation:** Bulk archive all 29 files to `docs/archive/plans/`. None are living documents.

### `docs/audits/` (34 files, ~500KB)
Mix of completed audits from Feb 4-9:
- 6 "AGENT_*" audit files — deep audit complete
- 3 "SONARQUBE_*" files — SonarQube setup complete
- Various security/fix reports

**Recommendation:** Keep in `docs/audits/` for reference. These are valuable historical records. Consider creating `docs/audits/README.md` as an index.

---

## UI-Level Documentation (untracked)

Several docs are scattered in `ui/desktop/`:
| File | Recommendation |
|------|----------------|
| `ui/desktop/TERMINAL_INTEGRATION.md` | Keep — module-level README for terminal feature |
| `ui/desktop/src/utils/SETTINGS_SSE_USAGE.md` | Keep — API usage guide next to code |
| `ui/desktop/tests/e2e/BACKEND_TESTING.md` | Keep — test-specific docs |
| `ui/desktop/tests/e2e/QUICK_START.md` | Keep — test-specific docs |
| `ui/desktop/tests/e2e/README_BACKEND.md` | Keep — test-specific docs |

These are fine where they are (colocated with relevant code).

---

## Summary of Recommended Actions

### Already Done
1. Moved `COMPACTION_WIRING.md` from root to `docs/`

### Recommended Moves (non-destructive)
2. Move 5 `.bat` files from root to `scripts/`
3. Move `AUDIO_VISUALIZER_SPEC.md` to `docs/conscious/`
4. Move `CONSCIOUS_PROJECT_SUMMARY.md` to `docs/conscious/`
5. Move `DEVELOPMENT_STANDARDS.md` to `docs/`
6. Move `DOCUMENTATION_GAP_ANALYSIS.md` to `docs/archive/sessions/`
7. Move `ISSUES.md` to `docs/archive/sessions/`
8. Move `RELEASE_READY_CHECKLIST.md` to `docs/archive/sessions/`

### Recommended Archives (docs/ -> docs/archive/sessions/)
9. `docs/COMPACTION_WIRING.md` (the one just moved)
10. `docs/TASK_COMPLETE_COMPACTION_WIRING.md`
11. `docs/ARCHITECTURE_AGENTIC_CORES.md`
12. `docs/RELEASE_CHECKLIST_v1.24.02.md`
13. `docs/e2e-conditional-skip-changes.md`
14. `docs/e2e-skip-verification.md`
15. `docs/settings-backend-migration.md`
16. `docs/EXTENSIONS_API_IMPLEMENTATION.md`
17. `docs/maybe_useful_for_gaps.md`
18. `docs/CONTINUATION_10_AGENTS_MASTER.md`

### Recommended Bulk Archive (docs/plans/ -> docs/archive/plans/)
19. All 29 files in `docs/plans/` — none are living documents

### No Action Needed
- `docs/audits/` — keep as-is (valuable historical records)
- `docs/conscious/` — keep as-is
- `docs/enterprise-qa/` — keep as-is
- `docs/guides/` — keep as-is
- `docs/panel-features/` — keep as-is
- `docs/timewarp/` — keep as-is
- UI-level docs — keep colocated with code
