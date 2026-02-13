# Repository Cleanup Report

**Status:** Investigated - recommendations provided

---

## 1. Untracked Temp Files (DELETE)

Three untracked files with mangled paths in the root:
```
C:UsersAdmin.claude-worktreesgoosepensive-heisenbergtemp_smoke_log.txt
C:UsersAdmin.claude-worktreesgoosepensive-heisenbergtemp_windows_cli_log.txt
C:UsersAdmin.claude-worktreesgoosepensive-heisenbergtemp_windows_desktop_log.txt
```

**Action:** Delete these files. They are artifacts from scripts that incorrectly used a path as a filename.

---

## 2. workflows-backup Directory

**Path:** `.github/workflows-backup-20260207-123124/`
**Status:** NOT in our branch's diff - exists only on main
**Contents:** Complete backup of all workflow files from before security hardening
**Action:** Should be removed from main in a separate cleanup PR

---

## 3. PowerShell Scripts (21 files)

All fork-specific, tracked on main, not modified by our branch:

| Script | Purpose |
|--------|---------|
| analyze-code.ps1 | Code analysis |
| build-goose.ps1 | Local build |
| build-goose-installer.ps1 | Installer build |
| build-local.ps1 | Local build |
| cleanup-repo.ps1 | Repo cleanup |
| download_cli.ps1 | CLI download |
| fix-warnings.ps1 | Warning fixes |
| gitlab-*.ps1 (3 files) | GitLab CI setup |
| measure-coverage.ps1 | Code coverage |
| run-all-quality-checks.ps1 | Quality checks |
| RUN-GOOSE.ps1 | Run goose locally |
| RUN_VALIDATION_TESTS.ps1 | Validation |
| TEST_VALIDATION_COMPLETE.ps1 | Test validation |
| upgrade-node.ps1 | Node upgrade |
| scripts/*.ps1 (5 files) | Various CI scripts |

**Action:** Consider moving to `scripts/` directory in a future cleanup PR.

---

## 4. Build Artifacts in Git (SHOULD REMOVE)

| File | Issue |
|------|-------|
| crates/clippy-report.json | Generated lint output |
| crates/clippy-results.json | Generated lint output |
| crates/goose/canonical_mapping_report.json | Generated report |

**Action:** Add to `.gitignore` and remove from tracking.

---

## 5. .gitignore Gaps

| Pattern Needed | Files Affected |
|----------------|---------------|
| `temp_*.txt` | 3 untracked temp files |
| `clippy-report.json` | 1 tracked artifact |
| `clippy-results.json` | 1 tracked artifact |
| `**/.scannerwork/` | SonarQube workdir in ui/ |
| `goose/audit_out/` | 11 generated audit files |

---

## 6. Unusual Files (Informational)

| File | Status | Notes |
|------|--------|-------|
| .gitlab-ci.yml | Intentional | Fork has GitLab remote for local builds |
| CONSCIOUS_PROJECT_SUMMARY.md | Fork addition | Project documentation |
| AUDIO_VISUALIZER_SPEC.md | Fork addition | Feature spec |
| sonar-project.properties | Fork addition | SonarQube config |

---

## 7. CodeQL Workflow Deletion (STAGED)

`.github/workflows/codeql.yml` is staged for deletion. This resolves the conflict:
> "CodeQL analyses from advanced configurations cannot be processed when the default setup is enabled"

The default CodeQL setup in GitHub repo settings will handle scanning. The exclusion config at `.github/codeql/codeql-config.yml` remains but needs to be configured in the repo settings UI.

---

## 8. Fork Bloat Assessment

The fork's main branch has **1,288 files added** vs upstream `block/goose`:
- ~225 markdown/PS1/JSON documentation files
- ~1,063 code files (Rust agents, teams, specialists, etc.)
- Third-party code in `goose/temp/` (ansible, vibes-cli, openlit, etc.)

**Our branch touches 50 of these files** — all security-focused changes.
