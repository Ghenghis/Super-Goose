# TimeWarp: Comprehensive Feature Specification

**Document:** Extreme-Detail Feature Specification
**Component:** TimeWarp -- Dockable Compact Timeline Bar for Super-Goose
**Design Lineage:** Fusion 360 Parametric Timeline x GitKraken Commit Graph x DAW Transport x Chrome DevTools
**Codebase:** `G:\goose` (Rust + React/Tauri)
**Date:** 2026-02-11
**Status:** MASTER SPECIFICATION -- supersedes all prior partial specs

---

## Table of Contents

1. [Complete Event Taxonomy](#1-complete-event-taxonomy)
2. [Data Model](#2-data-model)
3. [Timeline Node Types and Visual Representations](#3-timeline-node-types-and-visual-representations)
4. [Interaction Patterns](#4-interaction-patterns)
5. [Docking and Positioning Behavior](#5-docking-and-positioning-behavior)
6. [Integration Points with Super-Goose Systems](#6-integration-points-with-super-goose-systems)
7. [Storage Architecture](#7-storage-architecture)
8. [Real-Time Streaming Architecture](#8-real-time-streaming-architecture)
9. [What Makes This Better Than Anything Else](#9-what-makes-this-better-than-anything-else)

---

## 1. Complete Event Taxonomy

Every event that TimeWarp captures is classified into a category, subcategory, and specific event type. This is an exhaustive enumeration -- nothing the agent does escapes the timeline.

### 1.1 Git Operations (Local)

| Event Type | Trigger | Captured Data | Snapshot? |
|---|---|---|---|
| `git.commit` | `git commit` | SHA, message, author, timestamp, diff stat, parent SHAs | Yes |
| `git.commit.amend` | `git commit --amend` | Old SHA, new SHA, diff of changes, amended message | Yes |
| `git.branch.create` | `git branch <name>` / `git checkout -b` | Branch name, base SHA, base branch | No |
| `git.branch.delete` | `git branch -d/-D` | Branch name, was-merged flag, tip SHA before delete | No |
| `git.branch.rename` | `git branch -m` | Old name, new name | No |
| `git.checkout` | `git checkout <ref>` | Source ref, target ref, files changed count | Yes |
| `git.switch` | `git switch <branch>` | Source branch, target branch | Yes |
| `git.merge` | `git merge <branch>` | Source branch, target branch, strategy, merge SHA, conflicts list | Yes |
| `git.merge.conflict` | Merge produces conflicts | Conflicting files list, conflict markers content, base/ours/theirs for each | Yes |
| `git.merge.resolve` | User resolves conflicts | Resolution per file (ours/theirs/manual), final content | Yes |
| `git.merge.abort` | `git merge --abort` | Aborted merge source, target, reason | Yes |
| `git.rebase.start` | `git rebase <onto>` | Source branch, onto ref, commit count | Yes |
| `git.rebase.continue` | `git rebase --continue` | Current step, total steps, resolved conflicts | Yes |
| `git.rebase.abort` | `git rebase --abort` | Step aborted at, reason | Yes |
| `git.rebase.complete` | Rebase finishes | Old tip, new tip, rewritten SHA map | Yes |
| `git.rebase.interactive` | `git rebase -i` | Todo list (pick/squash/edit/drop per commit) | Yes |
| `git.cherry_pick` | `git cherry-pick <SHA>` | Source SHA, new SHA, source branch | Yes |
| `git.cherry_pick.conflict` | Cherry-pick produces conflicts | Conflicting files, conflict content | Yes |
| `git.revert` | `git revert <SHA>` | Reverted SHA, new revert SHA, changes undone | Yes |
| `git.stash.push` | `git stash` / `git stash push` | Stash ref, message, files stashed, diff | Yes |
| `git.stash.pop` | `git stash pop` | Stash ref, files restored, conflicts if any | Yes |
| `git.stash.apply` | `git stash apply` | Stash ref, files restored | Yes |
| `git.stash.drop` | `git stash drop` | Stash ref dropped, was-content hash | No |
| `git.stash.list` | `git stash list` | All stash entries with messages | No |
| `git.tag.create` | `git tag <name>` | Tag name, target SHA, annotated flag, message | No |
| `git.tag.delete` | `git tag -d` | Tag name, was-target SHA | No |
| `git.reset.soft` | `git reset --soft` | Target SHA, commits undone, index unchanged | Yes |
| `git.reset.mixed` | `git reset` / `git reset --mixed` | Target SHA, commits undone, unstaged files | Yes |
| `git.reset.hard` | `git reset --hard` | Target SHA, commits lost, files overwritten (DESTRUCTIVE) | Yes |
| `git.clean` | `git clean -fd` | Files/dirs deleted (DESTRUCTIVE) | Yes |
| `git.add` | `git add <files>` | Staged files list, diff per file | No |
| `git.restore` | `git restore <files>` | Restored files, source (HEAD/index/commit) | Yes |
| `git.diff` | `git diff` (read-only) | Diff output, files compared | No |
| `git.log` | `git log` (read-only) | Query parameters, results count | No |
| `git.status` | `git status` (read-only) | Tracked/untracked/modified counts | No |
| `git.bisect.start` | `git bisect start` | Good SHA, bad SHA | No |
| `git.bisect.step` | `git bisect good/bad` | Tested SHA, verdict, remaining range | Yes |
| `git.bisect.result` | Bisect completes | First-bad SHA, total steps | No |
| `git.worktree.add` | `git worktree add` | Path, branch, base SHA | No |
| `git.worktree.remove` | `git worktree remove` | Path removed | No |
| `git.submodule.update` | `git submodule update` | Submodule path, old SHA, new SHA | Yes |
| `git.reflog` | `git reflog` (read-only) | Entries viewed | No |

### 1.2 GitHub Integration

| Event Type | Trigger | Captured Data | Snapshot? |
|---|---|---|---|
| `github.pr.create` | `gh pr create` / API | PR number, title, body, base/head branches, draft flag, labels, reviewers | No |
| `github.pr.update` | PR title/body/labels changed | Changed fields, old/new values | No |
| `github.pr.close` | PR closed without merge | PR number, closer, reason | No |
| `github.pr.merge` | PR merged | PR number, merge SHA, merge method (merge/squash/rebase), target branch | Yes |
| `github.pr.reopen` | PR reopened | PR number, reopener | No |
| `github.pr.convert_draft` | Draft PR converted to ready | PR number | No |
| `github.pr.review.request` | Review requested | PR number, reviewer(s) | No |
| `github.pr.review.submit` | Review submitted | PR number, reviewer, state (approve/request_changes/comment), body | No |
| `github.pr.review.dismiss` | Review dismissed | PR number, dismissed reviewer, reason | No |
| `github.pr.comment` | Comment on PR | PR number, author, body, in_reply_to, file/line if line comment | No |
| `github.pr.comment.resolve` | Comment thread resolved | PR number, thread ID | No |
| `github.pr.suggestion` | Code suggestion in review | PR number, file, line range, suggested code, original code | No |
| `github.pr.suggestion.apply` | Suggestion applied | PR number, commit SHA, suggestion ID | Yes |
| `github.pr.check.run` | Check suite started | PR number, check suite ID, checks list | No |
| `github.pr.check.complete` | Check suite completed | PR number, check suite ID, conclusion (success/failure/neutral), details per check | No |
| `github.pr.conflict` | PR has merge conflicts | PR number, conflicting files | No |
| `github.pr.auto_merge.enable` | Auto-merge enabled | PR number, merge method | No |
| `github.pr.auto_merge.disable` | Auto-merge disabled | PR number, reason | No |
| `github.issue.create` | `gh issue create` / API | Issue number, title, body, labels, assignees, milestone | No |
| `github.issue.close` | Issue closed | Issue number, closer, close reason (completed/not_planned) | No |
| `github.issue.reopen` | Issue reopened | Issue number | No |
| `github.issue.comment` | Comment on issue | Issue number, author, body | No |
| `github.issue.label.add` | Label added | Issue/PR number, label name, color | No |
| `github.issue.label.remove` | Label removed | Issue/PR number, label name | No |
| `github.issue.assign` | Assignee added/removed | Issue/PR number, assignee, action (add/remove) | No |
| `github.issue.milestone` | Milestone changed | Issue/PR number, old/new milestone | No |
| `github.issue.transfer` | Issue transferred | Issue number, old/new repo | No |
| `github.actions.trigger` | Workflow triggered | Workflow name, trigger event, run ID, SHA | No |
| `github.actions.job.start` | Job started | Run ID, job name, runner | No |
| `github.actions.job.complete` | Job completed | Run ID, job name, conclusion, duration, logs URL | No |
| `github.actions.run.complete` | Full run completed | Run ID, workflow, conclusion, total duration, artifact URLs | No |
| `github.actions.run.cancel` | Run cancelled | Run ID, canceller | No |
| `github.actions.run.rerun` | Run re-triggered | Run ID, original run ID | No |
| `github.release.create` | Release published | Tag, name, body, prerelease flag, assets list | No |
| `github.release.edit` | Release edited | Tag, changed fields | No |
| `github.release.delete` | Release deleted | Tag | No |
| `github.deploy.create` | Deployment created | Environment, ref, SHA, creator | No |
| `github.deploy.status` | Deployment status update | Environment, state (pending/success/failure/error), description | No |
| `github.push` | `git push` to remote | Remote, branch, old/new SHA, forced flag, commits pushed | No |
| `github.fetch` | `git fetch` / `git pull` | Remote, branches updated, new commits count | No |
| `github.fork` | Repository forked | Source repo, fork repo | No |
| `github.star` | Repository starred/unstarred | Action (star/unstar) | No |
| `github.webhook` | Webhook received | Event type, delivery ID, payload hash | No |

### 1.3 GitLab Integration

| Event Type | Trigger | Captured Data | Snapshot? |
|---|---|---|---|
| `gitlab.mr.create` | MR created | MR IID, title, source/target branches, labels, assignees | No |
| `gitlab.mr.update` | MR updated | Changed fields | No |
| `gitlab.mr.merge` | MR merged | MR IID, merge SHA, method | Yes |
| `gitlab.mr.close` | MR closed | MR IID, closer | No |
| `gitlab.mr.approve` | MR approved | MR IID, approver, approval rules met | No |
| `gitlab.mr.unapprove` | Approval revoked | MR IID, revoker | No |
| `gitlab.mr.comment` | Note on MR | MR IID, author, body, resolvable, resolved | No |
| `gitlab.pipeline.create` | Pipeline triggered | Pipeline ID, source (push/merge_request/schedule/api), SHA, ref | No |
| `gitlab.pipeline.stage.start` | Stage started | Pipeline ID, stage name, jobs in stage | No |
| `gitlab.pipeline.stage.complete` | Stage completed | Pipeline ID, stage name, status, duration | No |
| `gitlab.pipeline.job.start` | Job started | Pipeline ID, job name, runner, stage | No |
| `gitlab.pipeline.job.complete` | Job completed | Pipeline ID, job name, status, duration, artifacts, logs | No |
| `gitlab.pipeline.complete` | Pipeline completed | Pipeline ID, overall status, total duration, stages summary | No |
| `gitlab.environment.create` | Environment created | Environment name, tier (production/staging/testing/development) | No |
| `gitlab.environment.deploy` | Deployment to environment | Environment, ref, SHA, deployer | No |
| `gitlab.environment.stop` | Environment stopped | Environment name, stopper | No |
| `gitlab.package.publish` | Package published | Package name, version, type (npm/maven/pypi/etc), registry | No |
| `gitlab.package.delete` | Package deleted | Package name, version | No |
| `gitlab.wiki.create` | Wiki page created | Page title, slug | No |
| `gitlab.wiki.update` | Wiki page updated | Page title, diff | No |

### 1.4 Other Remotes

| Event Type | Trigger | Captured Data | Snapshot? |
|---|---|---|---|
| `bitbucket.pr.create` | BB PR created | PR ID, title, source/target, reviewers | No |
| `bitbucket.pr.merge` | BB PR merged | PR ID, merge strategy | Yes |
| `bitbucket.pr.decline` | BB PR declined | PR ID, decliner | No |
| `bitbucket.pr.comment` | Comment on BB PR | PR ID, author, content | No |
| `bitbucket.pipeline.start` | Pipeline started | Pipeline UUID, trigger | No |
| `bitbucket.pipeline.complete` | Pipeline completed | Pipeline UUID, result, duration | No |
| `azure.workitem.create` | Work item created | ID, type (Bug/Task/Story/Epic), title, state | No |
| `azure.workitem.update` | Work item updated | ID, changed fields, old/new values | No |
| `azure.workitem.close` | Work item closed | ID, resolution | No |
| `azure.pipeline.run` | Pipeline run | Run ID, pipeline name, result | No |
| `azure.pr.create` | Azure PR created | PR ID, title, source/target | No |
| `azure.pr.complete` | Azure PR completed | PR ID, merge strategy, completion conditions | Yes |
| `azure.pr.abandon` | Azure PR abandoned | PR ID | No |
| `azure.release.deploy` | Release deployed | Release name, environment, status | No |
| `remote.push` | Generic push to any remote | Remote URL, branch, SHA range | No |
| `remote.fetch` | Generic fetch from any remote | Remote URL, refs updated | No |
| `remote.clone` | Repository cloned | Source URL, destination path | Yes |

### 1.5 File System Events

| Event Type | Trigger | Captured Data | Snapshot? |
|---|---|---|---|
| `fs.file.create` | New file created | Path, size, BLAKE3 hash of content, MIME type | Yes |
| `fs.file.write` | File content modified | Path, old hash, new hash, unified diff, old size, new size | Yes |
| `fs.file.delete` | File deleted | Path, last known hash, last known size, last content snapshot | Yes |
| `fs.file.rename` | File renamed/moved | Old path, new path, content hash (unchanged) | No |
| `fs.file.move` | File moved to different dir | Old path, new path, content hash | No |
| `fs.file.copy` | File copied | Source path, destination path, content hash | No |
| `fs.file.chmod` | Permissions changed | Path, old mode, new mode | No |
| `fs.file.truncate` | File truncated | Path, old size, new size (0 or smaller) | Yes |
| `fs.file.append` | Content appended (detected) | Path, old hash, new hash, appended content only | Yes |
| `fs.dir.create` | Directory created | Path | No |
| `fs.dir.delete` | Directory deleted (recursive) | Path, files contained, total size | Yes |
| `fs.dir.rename` | Directory renamed | Old path, new path, files affected count | No |
| `fs.symlink.create` | Symbolic link created | Link path, target path | No |
| `fs.symlink.delete` | Symbolic link deleted | Link path, was-target | No |
| `fs.watch.overflow` | Too many events, some lost | Estimated missed count, time range | No |
| `fs.lock.acquire` | File lock obtained | Path, lock type (shared/exclusive), holder PID | No |
| `fs.lock.release` | File lock released | Path, held duration | No |
| `fs.snapshot.full` | Full workspace snapshot taken | Root path, file count, total size, manifest hash | Yes |
| `fs.snapshot.incremental` | Incremental snapshot | Changed files list, added/modified/deleted counts | Yes |

**Before/After Snapshots:** Every `fs.file.write` and `fs.file.create` stores content-addressed blobs keyed by BLAKE3 hash. The undo/redo stack per file is reconstructed by walking events in reverse/forward order.

### 1.6 LLM/AI Operations

| Event Type | Trigger | Captured Data | Snapshot? |
|---|---|---|---|
| `llm.request.send` | Prompt sent to LLM | Provider, model, prompt (or hash if large), system prompt hash, temperature, max_tokens, top_p, tools provided | No |
| `llm.request.stream_start` | First token received | Request ID, time-to-first-token (TTFT) | No |
| `llm.request.stream_chunk` | Streaming chunk received | Request ID, chunk index, token count, content fragment | No |
| `llm.request.complete` | Full response received | Request ID, response content (or hash), finish_reason, total tokens (input/output/cached), latency_ms, cost_usd | No |
| `llm.request.error` | LLM call failed | Request ID, error type, error message, HTTP status, retry_count | No |
| `llm.request.timeout` | LLM call timed out | Request ID, timeout_ms, tokens received before timeout | No |
| `llm.request.cancel` | LLM call cancelled | Request ID, reason (user/budget/guard), tokens consumed before cancel | No |
| `llm.request.retry` | LLM call retried | Request ID, retry_number, original error, backoff_ms | No |
| `llm.model.switch` | `/model` hot-switch | Old model, new model, reason (user/auto/cost) | No |
| `llm.model.fallback` | Provider fallback triggered | Primary model, fallback model, failure reason | No |
| `llm.thinking.start` | Extended thinking block begins | Request ID, thinking mode (CoT/ToT/reflection) | No |
| `llm.thinking.step` | Thinking step produced | Request ID, step index, reasoning text, confidence | No |
| `llm.thinking.complete` | Thinking block ends | Request ID, total steps, total thinking tokens, decision | No |
| `llm.reflexion.start` | Reflexion loop begins | Task description, attempt number, previous failures list | No |
| `llm.reflexion.critique` | Self-critique generated | Attempt number, critique text, identified issues | No |
| `llm.reflexion.retry` | Reflexion retry with updated plan | Attempt number, revised plan, changes from previous | No |
| `llm.reflexion.success` | Reflexion loop succeeds | Total attempts, final approach, success criteria met | No |
| `llm.reflexion.exhausted` | Max reflexion attempts reached | Total attempts, last critique, recommendation | No |
| `llm.cost.threshold` | Budget threshold crossed | Budget limit, current spend, percentage, action taken (warn/block) | No |
| `llm.cost.session_total` | Session cost milestone | Session ID, total cost, total tokens, request count | No |
| `llm.guardrail.input` | Input guardrail triggered | Detector name, severity, confidence, blocked content hash, action taken | No |
| `llm.guardrail.output` | Output guardrail triggered | Detector name, severity, confidence, blocked content hash, action taken | No |
| `llm.cache.hit` | Prompt cache hit | Cache key hash, tokens saved, cost saved | No |
| `llm.cache.miss` | Prompt cache miss | Cache key hash, prompt length | No |
| `llm.embedding.generate` | Embedding generated | Model, input text hash, dimension, latency_ms | No |
| `llm.context.compact` | Context window compacted | Old token count, new token count, reduction ratio, strategy used | No |

### 1.7 Test Runs

| Event Type | Trigger | Captured Data | Snapshot? |
|---|---|---|---|
| `test.suite.start` | Test suite execution begins | Runner (pytest/jest/cargo-test/go-test), test count, filter pattern | No |
| `test.suite.complete` | Test suite execution ends | Runner, total/passed/failed/skipped counts, duration_ms, exit code | No |
| `test.case.pass` | Individual test passes | Test name, file, line, duration_ms | No |
| `test.case.fail` | Individual test fails | Test name, file, line, duration_ms, assertion message, stack trace, stdout, stderr | No |
| `test.case.skip` | Individual test skipped | Test name, file, line, skip reason | No |
| `test.case.error` | Test errors (not assertion) | Test name, file, line, error type, error message, stack trace | No |
| `test.case.flaky` | Flaky test detected | Test name, pass_count, fail_count, last 10 results | No |
| `test.case.timeout` | Test timed out | Test name, timeout_ms, partial output | No |
| `test.case.new` | New test detected | Test name, file, associated source file | No |
| `test.case.removed` | Test removed/deleted | Test name, file, last result | No |
| `test.coverage.report` | Coverage report generated | Total lines, covered lines, percentage, per-file breakdown | No |
| `test.coverage.change` | Coverage changed from baseline | Old percentage, new percentage, delta, files with changes | No |
| `test.coverage.threshold` | Coverage below threshold | Threshold, actual, shortfall files | No |
| `test.regression.detect` | Previously passing test now fails | Test name, last pass SHA, current fail SHA, diff of changes | No |
| `test.regression.fix` | Previously failing test now passes | Test name, failing since SHA, fixed at SHA | No |
| `test.snapshot.update` | Snapshot test updated | Test name, old snapshot hash, new snapshot hash, diff | Yes |
| `test.snapshot.mismatch` | Snapshot test mismatch | Test name, expected hash, actual hash, visual diff | No |
| `test.benchmark.run` | Benchmark executed | Benchmark name, iterations, mean/median/p99 duration, throughput | No |
| `test.benchmark.regression` | Benchmark regression detected | Benchmark name, baseline, current, regression percentage | No |
| `test.watch.trigger` | File change triggered test rerun | Changed files, tests triggered, filter applied | No |

### 1.8 Build Operations

| Event Type | Trigger | Captured Data | Snapshot? |
|---|---|---|---|
| `build.cargo.start` | `cargo build` begins | Profile (debug/release), target, features, incremental flag | No |
| `build.cargo.complete` | `cargo build` finishes | Duration_ms, exit code, warnings count, errors count | No |
| `build.cargo.warning` | Compiler warning | File, line, column, warning code, message, suggested fix | No |
| `build.cargo.error` | Compiler error | File, line, column, error code, message, help text | No |
| `build.cargo.clippy` | `cargo clippy` run | Lint count by level (warn/deny/allow), specific lints triggered | No |
| `build.cargo.test` | `cargo test` run | Test count, pass/fail, duration | No |
| `build.cargo.doc` | `cargo doc` run | Duration, warnings, generated doc size | No |
| `build.cargo.fmt` | `cargo fmt` run | Files formatted, files unchanged | No |
| `build.npm.install` | `npm install` / `npm ci` | Duration, packages installed, lockfile changed, audit warnings | No |
| `build.npm.build` | `npm run build` | Duration, exit code, output size, warnings | No |
| `build.npm.start` | `npm start` | PID, port, startup time | No |
| `build.npm.lint` | Linter run (eslint/prettier) | Errors, warnings, auto-fixed count | No |
| `build.npm.typecheck` | `tsc --noEmit` | Errors count, error details | No |
| `build.python.pip` | `pip install` | Packages installed, versions, conflicts | No |
| `build.python.venv` | Virtual env created/activated | Venv path, Python version | No |
| `build.python.lint` | Linter (ruff/pylint/mypy) | Issues found, severity breakdown | No |
| `build.go.build` | `go build` | Duration, errors, binary size | No |
| `build.go.test` | `go test` | Duration, pass/fail counts, coverage | No |
| `build.go.vet` | `go vet` | Issues found | No |
| `build.docker.build` | `docker build` | Dockerfile path, tag, layers built, cache hits, duration, image size | No |
| `build.docker.push` | `docker push` | Tag, registry, layers pushed, digest | No |
| `build.docker.pull` | `docker pull` | Image, tag, layers pulled, size | No |
| `build.make.target` | `make <target>` | Target name, duration, exit code | No |
| `build.cmake.configure` | CMake configure | Generator, build type, variables set | No |
| `build.artifact.create` | Build artifact produced | Path, size, hash, type (binary/package/bundle) | Yes |
| `build.artifact.upload` | Artifact uploaded | Destination (S3/registry/etc), URL, size | No |
| `build.cache.hit` | Build cache hit | Cache key, layer, bytes saved | No |
| `build.cache.miss` | Build cache miss | Cache key, layer, rebuild reason | No |
| `build.incremental.reuse` | Incremental compilation reuse | Crate/module reused, bytes saved | No |
| `build.cross.compile` | Cross-compilation | Host triple, target triple, toolchain | No |

### 1.9 Dependency Management

| Event Type | Trigger | Captured Data | Snapshot? |
|---|---|---|---|
| `dep.add` | Dependency added | Package name, version, registry, dev/prod, requester | Yes |
| `dep.remove` | Dependency removed | Package name, was-version, dev/prod | Yes |
| `dep.update` | Dependency updated | Package name, old version, new version, changelog URL | Yes |
| `dep.update.major` | Major version bump | Package name, old major, new major, breaking changes | Yes |
| `dep.update.security` | Security update applied | Package name, CVE IDs, severity, old version, new version | Yes |
| `dep.lockfile.update` | Lockfile regenerated | Lockfile path, packages changed count, hash diff | Yes |
| `dep.conflict.version` | Version conflict detected | Package name, required versions, resolved version, conflicting dependants | No |
| `dep.conflict.peer` | Peer dependency conflict | Package name, required peer version, actual version | No |
| `dep.vulnerability.detect` | Vulnerability found | Package name, version, CVE ID, severity (CVSS), description, fix version | No |
| `dep.vulnerability.fix` | Vulnerability fixed | Package name, old version, new version, CVE IDs resolved | Yes |
| `dep.vulnerability.suppress` | Vulnerability suppressed | Package name, CVE ID, reason, suppressor | No |
| `dep.license.change` | License changed | Package name, old license, new license, compatibility | No |
| `dep.license.violation` | License violation detected | Package name, license, violating clause, project license | No |
| `dep.audit.run` | Dependency audit executed | Tool (npm audit/cargo audit/pip-audit), total vulnerabilities by severity | No |
| `dep.graph.change` | Dependency graph changed | Nodes added/removed, edges added/removed, new transitive deps | No |
| `dep.size.increase` | Dependency size threshold | Package name, added size, total bundle impact | No |
| `dep.deprecated` | Dependency marked deprecated | Package name, deprecation message, alternative suggested | No |
| `dep.yanked` | Package version yanked from registry | Package name, version, reason | No |
| `dep.sonatype.scan` | Sonatype component analysis | Package URLs, quality score, license, security data | No |
| `dep.sonatype.recommendation` | Sonatype version recommendation | Package name, current version, recommended version, trust score | No |

### 1.10 Container/Sandbox Events

| Event Type | Trigger | Captured Data | Snapshot? |
|---|---|---|---|
| `container.create` | Container created | Container ID, image, name, command, env vars (redacted) | No |
| `container.start` | Container started | Container ID, port mappings, volume mounts, network | No |
| `container.stop` | Container stopped | Container ID, exit code, duration, reason (manual/timeout/OOM) | No |
| `container.kill` | Container force-killed | Container ID, signal, reason | No |
| `container.remove` | Container removed | Container ID, volumes cleaned | No |
| `container.restart` | Container restarted | Container ID, restart count, reason | No |
| `container.logs` | Container log checkpoint | Container ID, log lines since last checkpoint, error lines count | No |
| `container.exec` | Command executed in container | Container ID, command, exit code, stdout/stderr hash | No |
| `container.copy_to` | File copied into container | Container ID, source path, dest path, size | No |
| `container.copy_from` | File copied out of container | Container ID, source path, dest path, size | No |
| `container.commit` | Container committed to image | Container ID, new image tag, size | No |
| `container.network.create` | Network created | Network name, driver, subnet | No |
| `container.network.connect` | Container joined network | Container ID, network name, IP address | No |
| `container.volume.create` | Volume created | Volume name, driver, mountpoint | No |
| `container.volume.mount` | Volume mounted | Container ID, volume name, mount path, read-only flag | No |
| `container.health.check` | Health check result | Container ID, status (healthy/unhealthy), response time | No |
| `container.oom` | Out of memory | Container ID, memory limit, memory usage at OOM | No |
| `sandbox.create` | Agent sandbox created | Sandbox ID, type (docker/wasm/chroot), restrictions | No |
| `sandbox.destroy` | Agent sandbox destroyed | Sandbox ID, duration, files created inside | No |
| `sandbox.escape_attempt` | Sandbox escape detected | Sandbox ID, method attempted, action taken | No |
| `sandbox.resource_limit` | Resource limit hit | Sandbox ID, resource (cpu/memory/disk/network), limit, usage | No |

### 1.11 MCP Tool Calls

| Event Type | Trigger | Captured Data | Snapshot? |
|---|---|---|---|
| `mcp.tool.invoke` | Tool call initiated | Tool name, server name, arguments (redacted for secrets), request ID | No |
| `mcp.tool.success` | Tool call succeeded | Tool name, request ID, result (or hash), duration_ms, tokens if applicable | Conditional |
| `mcp.tool.error` | Tool call failed | Tool name, request ID, error type, error message, duration_ms | No |
| `mcp.tool.timeout` | Tool call timed out | Tool name, request ID, timeout_ms, partial result | No |
| `mcp.tool.cancel` | Tool call cancelled | Tool name, request ID, reason (user/guard/budget) | No |
| `mcp.tool.retry` | Tool call retried | Tool name, request ID, retry_number, original error | No |
| `mcp.tool.permission_denied` | Permission check failed | Tool name, user context, required permission, policy that denied | No |
| `mcp.tool.rate_limited` | Rate limit applied | Tool name, rate limit (calls/period), current count, backoff_ms | No |
| `mcp.tool.approval_required` | Human approval requested | Tool name, arguments, reason, approval timeout | No |
| `mcp.tool.approval_granted` | Human approval given | Tool name, approver, conditions | No |
| `mcp.tool.approval_denied` | Human approval denied | Tool name, denier, reason | No |
| `mcp.server.connect` | MCP server connected | Server name, endpoint, transport type, capabilities | No |
| `mcp.server.disconnect` | MCP server disconnected | Server name, reason, uptime_seconds | No |
| `mcp.server.error` | MCP server error | Server name, error type, error message | No |
| `mcp.server.health` | Health check result | Server name, status, response_time_ms | No |
| `mcp.server.reconnect` | Server reconnection attempt | Server name, attempt_number, backoff_ms | No |
| `mcp.notification` | Server notification received | Server name, notification type, data | No |
| `mcp.resource.read` | Resource read via MCP | Server name, resource URI, size | No |
| `mcp.resource.subscribe` | Resource subscription | Server name, resource URI, callback registered | No |
| `mcp.prompt.get` | Prompt retrieved via MCP | Server name, prompt name, arguments | No |
| `mcp.sampling.request` | Sampling request from server | Server name, model hint, messages, max_tokens | No |

### 1.12 Session Management

| Event Type | Trigger | Captured Data | Snapshot? |
|---|---|---|---|
| `session.start` | New session begins | Session ID, user, project path, goose version, model, mode (chat/auto) | Yes |
| `session.end` | Session ends | Session ID, duration, total events, total cost, total tokens | Yes |
| `session.resume` | Session resumed | Session ID, previous end time, resume reason | No |
| `session.bookmark.save` | User bookmarks a point | Bookmark name, event ID, description, tags | No |
| `session.bookmark.restore` | User restores to bookmark | Bookmark name, target event ID, current event ID | Yes |
| `session.bookmark.delete` | Bookmark deleted | Bookmark name | No |
| `session.bookmark.list` | Bookmarks listed | Count, names | No |
| `session.context.compact` | Context window compacted | Old token count, new token count, strategy, messages removed/summarized | No |
| `session.context.window` | Context window state | Total tokens, messages count, tool results count, system prompt tokens | No |
| `session.memory.consolidate` | Memory consolidation | Working to episodic count, promoted to semantic count, merged count, removed count | No |
| `session.memory.recall` | Memory recall triggered | Query, results count, sources (working/episodic/semantic), top relevance score | No |
| `session.memory.store` | Memory stored | Memory type, content hash, importance score, tags | No |
| `session.checkpoint.save` | Checkpoint saved | Checkpoint ID, size, conversation length, metadata | Yes |
| `session.checkpoint.restore` | Checkpoint restored | Checkpoint ID, timestamp, messages restored | Yes |
| `session.checkpoint.delete` | Checkpoint deleted | Checkpoint ID | No |
| `session.config.change` | Configuration changed | Key changed, old value, new value | No |
| `session.extension.load` | Extension loaded | Extension name, type, tools provided, duration_ms | No |
| `session.extension.unload` | Extension unloaded | Extension name, reason | No |
| `session.extension.error` | Extension error | Extension name, error type, message | No |
| `session.user.message` | User sends message | Message hash, length, has_attachments | No |
| `session.agent.message` | Agent sends message | Message hash, length, tool_calls count | No |
| `session.mode.switch` | Mode switched (chat/auto) | Old mode, new mode | No |
| `session.idle.start` | Agent idle period begins | Last activity event ID | No |
| `session.idle.end` | Agent idle period ends | Idle duration_seconds | No |

### 1.13 Security Events

| Event Type | Trigger | Captured Data | Snapshot? |
|---|---|---|---|
| `security.guardrail.block` | Content blocked by guardrail | Detector name, severity, confidence, content hash, direction (input/output) | No |
| `security.guardrail.warn` | Content flagged but allowed | Detector name, severity, confidence, content hash, direction | No |
| `security.pii.detect` | PII detected | PII type (email/SSN/phone/etc), redacted value, source (input/output) | No |
| `security.secret.detect` | Secret/credential detected | Secret type (API key/token/password), redacted value, source | No |
| `security.injection.detect` | Prompt injection attempt | Injection type, confidence, patterns matched | No |
| `security.jailbreak.detect` | Jailbreak attempt detected | Jailbreak type, confidence, patterns matched | No |
| `security.permission.request` | Permission escalation | Tool name, requested permission, current permissions | No |
| `security.permission.grant` | Permission granted | Tool name, granted permission, granter (user/policy) | No |
| `security.permission.deny` | Permission denied | Tool name, denied permission, denier (user/policy), reason | No |
| `security.shell.sandbox` | Shell command sandboxed | Command, sandbox type, restrictions applied | No |
| `security.shell.block` | Shell command blocked | Command, reason, guard rule that blocked | No |
| `security.shell.allow` | Shell command allowed | Command, approved by (user/policy) | No |
| `security.file.access_denied` | File access denied | Path, requested operation (read/write/exec), reason | No |
| `security.network.block` | Network access blocked | URL/IP, reason, guard rule | No |
| `security.audit.access` | Audit log accessed | Accessor, query, results count | No |
| `security.policy.update` | Security policy changed | Policy name, old rules, new rules, updater | No |
| `security.policy.violation` | Policy violation detected | Policy name, rule violated, action taken, context | No |
| `security.rate_limit.hit` | Rate limit triggered | Resource, limit, current rate, action (throttle/block) | No |
| `security.anomaly.detect` | Anomalous behavior detected | Anomaly type, confidence, baseline deviation, description | No |
| `security.credential.rotate` | Credential rotated | Credential type, scope, old expiry, new expiry | No |

### 1.14 Deployment Events

| Event Type | Trigger | Captured Data | Snapshot? |
|---|---|---|---|
| `deploy.start` | Deployment initiated | Environment (staging/production/preview), strategy (rolling/blue-green/canary), version, deployer | No |
| `deploy.complete` | Deployment finished | Environment, version, duration, status (success/failure) | No |
| `deploy.rollback.start` | Rollback initiated | Environment, from version, to version, reason | No |
| `deploy.rollback.complete` | Rollback finished | Environment, version rolled back to, duration | No |
| `deploy.canary.start` | Canary deployment begins | Environment, canary percentage, canary version | No |
| `deploy.canary.promote` | Canary promoted to full | Environment, version, metrics at promotion | No |
| `deploy.canary.rollback` | Canary rolled back | Environment, reason, metrics at rollback | No |
| `deploy.bluegreen.switch` | Blue-green switch | Environment, from (blue/green), to (blue/green) | No |
| `deploy.health.check` | Health check performed | Environment, endpoint, status code, response_time_ms, healthy flag | No |
| `deploy.health.degraded` | Health degraded | Environment, metric, threshold, current value | No |
| `deploy.health.recovered` | Health recovered | Environment, metric, recovery time | No |
| `deploy.traffic.shift` | Traffic shifted | Environment, old weights, new weights | No |
| `deploy.config.update` | Deployment config changed | Environment, key changed, old/new values (redacted) | No |
| `deploy.scale.up` | Service scaled up | Environment, service, old replicas, new replicas, reason | No |
| `deploy.scale.down` | Service scaled down | Environment, service, old replicas, new replicas, reason | No |
| `deploy.certificate.renew` | TLS cert renewed | Domain, old expiry, new expiry, issuer | No |
| `deploy.dns.update` | DNS record changed | Domain, record type, old value, new value | No |
| `deploy.preview.create` | Preview environment created | PR/MR number, URL, branch | No |
| `deploy.preview.destroy` | Preview environment destroyed | PR/MR number, duration | No |

### 1.15 Versioning and Semantic Versioning

| Event Type | Trigger | Captured Data | Snapshot? |
|---|---|---|---|
| `version.bump.suggest` | Auto-version suggestion | Current version, suggested version, bump type (major/minor/patch), reason | No |
| `version.bump.apply` | Version bumped | Old version, new version, bump type, files modified | Yes |
| `version.changelog.generate` | Changelog generated | Version, entries count, categories (feat/fix/breaking/etc) | Yes |
| `version.changelog.entry` | Single changelog entry | Version, category, description, associated commit/PR | No |
| `version.breaking.detect` | Breaking change detected | File, change description, API surface affected, severity | No |
| `version.breaking.document` | Breaking change documented | Version, breaking changes list, migration guide | No |
| `version.tag.create` | Version tag created | Version string, SHA, annotated message | No |
| `version.release.draft` | Release draft created | Version, title, body, assets | No |
| `version.release.publish` | Release published | Version, title, assets, download URLs | No |
| `version.prerelease` | Pre-release version created | Version (alpha/beta/rc), stability level | No |
| `version.conventional_commit` | Conventional commit parsed | Type (feat/fix/chore/etc), scope, description, breaking flag | No |

### 1.16 Conflict Detection and Resolution

| Event Type | Trigger | Captured Data | Snapshot? |
|---|---|---|---|
| `conflict.merge.detect` | Merge conflict found | Files conflicting, branch A, branch B, conflict type (content/rename/delete) | No |
| `conflict.merge.resolve` | Merge conflict resolved | File, resolution (ours/theirs/manual), resolved content hash | Yes |
| `conflict.merge.3way_diff` | Three-way diff generated | File, base content, ours content, theirs content, merge result | No |
| `conflict.dep.version` | Dependency version conflict | Package, version A, version B, resolution strategy | No |
| `conflict.dep.resolve` | Dependency conflict resolved | Package, chosen version, compromise strategy | No |
| `conflict.schema.migration` | Schema migration conflict | Migration files conflicting, database, resolution | No |
| `conflict.schema.drift` | Schema drift detected | Expected schema hash, actual schema hash, drifted fields | No |
| `conflict.config.drift` | Config drift detected | Config file, expected values, actual values, drift description | No |
| `conflict.config.resolve` | Config drift resolved | Config file, resolution strategy, new values | No |
| `conflict.api.breaking` | API breaking change conflict | Endpoint, old contract, new contract, consumers affected | No |
| `conflict.lockfile` | Lockfile conflict | Lockfile path, conflicting entries, auto-resolve possible | No |
| `conflict.type.incompatible` | Type incompatibility detected | File, type A, type B, location | No |
| `conflict.semantic` | Semantic conflict (logic clash) | Files involved, description, confidence, detected by (AI analysis) | No |

---

## 2. Data Model

### 2.1 Core Event Structure

Every event recorded by TimeWarp uses this base structure. This is stored in SQLite with WAL mode enabled.

```rust
/// A single immutable event in the TimeWarp DAG.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeWarpEvent {
    // === Identity ===
    /// UUID v7 (time-ordered for natural sort)
    pub event_id: Uuid,
    /// Parent event IDs (1 for linear, 2+ for merges, 0 for root)
    pub parent_ids: Vec<Uuid>,
    /// Branch this event belongs to
    pub branch_id: String,
    /// Sequential index within the branch (for display ordering)
    pub sequence_number: u64,

    // === Classification ===
    /// Event category (git, github, fs, llm, test, build, dep, container,
    ///                  mcp, session, security, deploy, version, conflict)
    pub category: EventCategory,
    /// Specific event type (e.g., "git.commit", "fs.file.write")
    pub event_type: String,
    /// Severity / importance level
    pub severity: EventSeverity,

    // === Timing ===
    /// When this event occurred (wall clock)
    pub timestamp: DateTime<Utc>,
    /// Duration of the operation (if applicable)
    pub duration_ms: Option<u64>,

    // === Content ===
    /// Structured input data (what triggered the event)
    pub inputs: serde_json::Value,
    /// Structured output data (what the event produced)
    pub outputs: serde_json::Value,
    /// Human-readable summary (generated, for search and display)
    pub summary: String,

    // === File System State ===
    /// Files touched by this event
    pub file_touches: Vec<FileTouchRecord>,
    /// Snapshot ID pointing to workspace state AFTER this event
    pub snapshot_id: Option<String>,

    // === Integrity ===
    /// BLAKE3 hash of (parent_hashes + category + event_type + inputs + outputs + timestamp)
    pub event_hash: String,
    /// BLAKE3 hash of the preceding event (hash chain link)
    pub prev_hash: String,

    // === Metadata ===
    /// Tags for filtering and search
    pub tags: Vec<String>,
    /// Agent/user that caused this event
    pub actor: ActorInfo,
    /// Annotations added after the fact (comments, flags)
    pub annotations: Vec<Annotation>,
}

/// Which files were touched and how
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTouchRecord {
    pub path: String,
    pub operation: FileOperation, // Create, Modify, Delete, Rename, Chmod
    pub before_hash: Option<String>,  // BLAKE3 hash of content before
    pub after_hash: Option<String>,   // BLAKE3 hash of content after
    pub diff_hash: Option<String>,    // BLAKE3 hash of the unified diff
    pub size_before: Option<u64>,
    pub size_after: Option<u64>,
}

/// Information about who caused the event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActorInfo {
    pub actor_type: ActorType,  // User, Agent, System, SubAgent, MCP_Server
    pub actor_id: String,       // Username, agent ID, server name
    pub session_id: Option<String>,
}

/// Post-hoc annotation on an event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Annotation {
    pub annotation_id: Uuid,
    pub author: String,
    pub content: String,
    pub created_at: DateTime<Utc>,
    pub annotation_type: AnnotationType, // Comment, Flag, Bookmark, Warning
}
```

### 2.2 Event Categories Enum

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventCategory {
    Git,
    GitHub,
    GitLab,
    Bitbucket,
    Azure,
    FileSystem,
    Llm,
    Test,
    Build,
    Dependency,
    Container,
    Mcp,
    Session,
    Security,
    Deploy,
    Version,
    Conflict,
    Custom,
}
```

### 2.3 Event Severity

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum EventSeverity {
    /// Informational (read-only, status queries)
    Info = 0,
    /// Normal operation (file writes, tool calls)
    Normal = 1,
    /// Notable event (branch create, test failure, warning)
    Notable = 2,
    /// Important event (deploy, merge, security alert)
    Important = 3,
    /// Critical event (data loss, security breach, deploy failure)
    Critical = 4,
}
```

### 2.4 Snapshot Structure

```rust
/// A workspace snapshot at a point in time
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    /// Content-addressed ID (BLAKE3 of the manifest)
    pub snapshot_id: String,
    /// Event that produced this snapshot
    pub event_id: Uuid,
    /// Type of snapshot
    pub snapshot_type: SnapshotType,  // Full, Incremental, Checkpoint
    /// File manifest (path -> BLAKE3 hash)
    pub manifest: BTreeMap<String, FileManifestEntry>,
    /// Total size of all files
    pub total_size: u64,
    /// Number of files
    pub file_count: usize,
    /// Parent snapshot (for incremental)
    pub parent_snapshot_id: Option<String>,
    /// Created timestamp
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileManifestEntry {
    pub path: String,
    pub blake3_hash: String,
    pub size: u64,
    pub mode: u32,            // File permissions
    pub modified_at: DateTime<Utc>,
    pub is_binary: bool,
}
```

### 2.5 Branch Structure

```rust
/// A branch in the TimeWarp DAG
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Branch {
    pub branch_id: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub created_from_event: Uuid,
    pub tip_event_id: Uuid,
    pub parent_branch_id: Option<String>,
    pub status: BranchStatus,  // Active, Merged, Abandoned, Archived
    pub color: String,         // Hex color for display
    pub description: Option<String>,
    pub event_count: u64,
    pub metadata: HashMap<String, Value>,
}
```

---

## 3. Timeline Node Types and Visual Representations

### 3.1 Node Shape Language

Every event on the timeline is rendered as a node with a specific shape, color, size, and badge. The visual language is designed so that a user can scan the timeline and instantly understand what happened without reading labels.

| Category | Shape | Default Color | Icon/Badge | Size |
|---|---|---|---|---|
| **Git** | Circle | `#F05032` (Git orange-red) | Git branch icon | 10px |
| **GitHub** | Octagon | `#24292E` (GitHub dark) | Octocat silhouette | 10px |
| **GitLab** | Hexagon | `#FC6D26` (GitLab orange) | Fox silhouette | 10px |
| **Bitbucket** | Pentagon | `#0052CC` (BB blue) | Bitbucket icon | 10px |
| **Azure** | Rounded square | `#0078D4` (Azure blue) | Azure icon | 10px |
| **File System** | Diamond | `#00BFFF` (Cyan) | File/folder icon | 8px (small for volume) |
| **LLM** | Star (6-point) | `#9966FF` (Purple) | Brain/sparkle icon | 12px (prominent) |
| **Test** | Triangle (up=pass, down=fail) | `#00CC66`/`#FF3366` | Check/X icon | 10px |
| **Build** | Square | `#FF9900` (Orange) | Gear/hammer icon | 10px |
| **Dependency** | Double circle | `#20B2AA` (Teal) | Package icon | 8px |
| **Container** | Rounded rect | `#2496ED` (Docker blue) | Container/ship icon | 10px |
| **MCP** | Hexagonal prism | `#8B5CF6` (Violet) | Plug/socket icon | 10px |
| **Session** | Pill | `#64748B` (Slate) | Clock/user icon | 8px |
| **Security** | Shield | `#EF4444` (Red) | Shield/lock icon | 12px (attention) |
| **Deploy** | Rocket | `#10B981` (Emerald) | Rocket icon | 12px |
| **Version** | Tag | `#F59E0B` (Amber) | Tag icon | 10px |
| **Conflict** | Lightning bolt | `#DC2626` (Red-600) | Warning/bolt icon | 12px (attention) |

### 3.2 Node Size Modifiers

Nodes scale based on impact:

| Condition | Size Multiplier | Example |
|---|---|---|
| Touches 0 files | 0.8x | Status query, read-only |
| Touches 1-5 files | 1.0x (default) | Normal edit |
| Touches 6-20 files | 1.3x | Multi-file refactor |
| Touches 20+ files | 1.6x | Large-scale change |
| Has error/failure | 1.5x + pulsing glow | Build failure, test failure |
| Is destructive | 1.5x + red ring | `git reset --hard`, file delete |
| Costs > $0.10 | 1.2x + cost badge | Expensive LLM call |
| Duration > 30s | 1.2x + clock badge | Long-running build |
| Is milestone | 2.0x + star overlay | Release, major merge |

### 3.3 Node State Indicators

| State | Visual | Meaning |
|---|---|---|
| Normal | Solid fill | Completed event |
| In-progress | Pulsing outline | Event currently executing |
| Failed | Red X overlay | Event that errored |
| Warning | Yellow triangle overlay | Event with warnings |
| Destructive | Red border ring | Event that deleted/overwrote data |
| Bookmarked | Star badge | User-bookmarked event |
| Annotated | Speech bubble badge | Has user annotations |
| Selected | Bright highlight + enlarged | Currently selected in timeline |
| Playhead | Vertical bright line through | Current time-travel position |
| Ghost | 50% opacity, dashed outline | Replayed or simulated event |
| Collapsed | `...` with count | Multiple events collapsed |

### 3.4 Connection Lines

| Connection | Visual | Meaning |
|---|---|---|
| Sequential | Solid line, category color | Events on same branch in order |
| Fork | Diagonal Bezier curve downward | Branch creation point |
| Merge | Diagonal Bezier curve upward | Branch merge point |
| Cherry-pick | Dashed diagonal line | Event copied from another branch |
| Rebase | Dotted line with arrow | Events replayed onto new base |
| Replay | Ghost dashed line (50% opacity) | Replayed simulation |
| Causation | Thin gray arrow | One event caused another (cross-category) |
| Conflict | Red jagged line | Conflicting events between branches |

### 3.5 Compact Bar Node Rendering

In the default compact single-bar mode, nodes are rendered at minimum size with maximum density:

```
Compact bar (32px height):
┌────────────────────────────────────────────────────────────────┐
│ ●●●●◆●●●▲●●●●●★●●●◆●●●▼●●●●●■●●●●◆●●●●●●★●●●●●●●●●●●●●●● │
└────────────────────────────────────────────────────────────────┘
  ^        ^     ^        ^         ^
  git      merge test     LLM       build
           ^^    pass/fail
```

- Nodes are 6px circles at minimum zoom
- Colors visible even at 6px
- Shapes degrade to circles below 8px but retain color
- Hover on any node shows tooltip with full detail
- Cluster indicator when nodes overlap: `[+12]` badge

---

## 4. Interaction Patterns

### 4.1 Hover Interactions

| Target | Hover Behavior | Tooltip Content |
|---|---|---|
| Event node | Enlarge to 1.5x, show tooltip after 200ms delay | Event type, summary, timestamp, duration, files touched count |
| Event node (Git) | Above + mini diff preview | Commit message, SHA (short), insertions/deletions |
| Event node (LLM) | Above + token/cost preview | Model, tokens (in/out), cost, latency |
| Event node (Test) | Above + pass/fail indicator | Test name, result, duration, assertion message if failed |
| Event node (Build) | Above + warnings/errors count | Build tool, duration, warnings/errors count |
| Event node (Security) | Above + severity badge | Detector, severity, confidence, action taken |
| Branch rail | Highlight entire branch, show info | Branch name, event count, creation date, status |
| Fork/merge connector | Highlight both branches | Source branch, target branch, merge strategy |
| Time ruler | Crosshair snaps to nearest event | Exact timestamp, events at this time |
| Minimap viewport bracket | Highlight viewport area | Time range visible, event count in range |
| Status bar segment | Underline, show detail | Segment-specific information (see Section 3) |
| Collapsed group `[+N]` | Show list of hidden events | Summary of N collapsed events by category |

### 4.2 Click Interactions

| Target | Single Click | Double Click |
|---|---|---|
| Event node | Select event, show in inspector panel | Open full event detail view |
| Event node + Ctrl | Add to multi-selection | -- |
| Event node + Shift | Select range from last selected | -- |
| Branch rail | Select branch, highlight all its events | Rename branch |
| Fork connector | Select both branches involved | Show fork comparison view |
| Merge connector | Select merge event | Show merge diff (3-way) |
| Time ruler | Move playhead to clicked time | -- |
| Minimap | Center viewport on clicked position | Zoom to fit clicked area |
| Status bar branch indicator | Open branch switcher | -- |
| Status bar event counter | Open jump-to-event dialog | -- |
| Empty timeline area | Deselect all | -- |
| Collapsed group `[+N]` | Expand the group | -- |

### 4.3 Drag Interactions

| Drag Source | Drag Behavior | Drop Target |
|---|---|---|
| Playhead | Scrub through timeline, preview state at each position | Release = set playhead position |
| Event node | Show ghost, enable reorder within branch (if supported) | Drop on branch = cherry-pick |
| Event node to trash | Initiate event removal (with confirmation) | Trash zone |
| Minimap viewport bracket | Pan the main timeline viewport | Release = set new viewport position |
| Time ruler (click-drag) | Select time range | Release = filter to selected range |
| Timeline edge (resize handle) | Resize bar height | Release = set new height |
| Branch track label | Reorder track position | Release = set new track order |
| Event node to branch rail | Cherry-pick event to another branch | Target branch rail |
| Selection rectangle (Shift+drag on empty area) | Select multiple events in rectangle | Release = select all enclosed events |

### 4.4 Context Menu (Right-Click)

**On Event Node:**
```
├── View Details                    Ctrl+Enter
├── View Diff                       D
├── View Full Output                O
├── ─────────────────
├── Jump to This Point              J
├── Restore Workspace to Here       Ctrl+Shift+R
├── Branch from Here...             B
├── ─────────────────
├── Compare With...                 C
│   ├── Previous Event
│   ├── Specific Event...
│   └── Current State
├── ─────────────────
├── Copy Event ID                   Ctrl+Shift+C
├── Copy Event Hash
├── Copy Summary
├── ─────────────────
├── Add Bookmark...                 Ctrl+B
├── Add Annotation...               Ctrl+A
├── Add Tag...                      T
├── ─────────────────
├── Replay From Here                Ctrl+Shift+P
├── Simulate What-If...
├── ─────────────────
├── Export Event (JSON)
└── Report Issue
```

**On Branch Rail:**
```
├── Switch to This Branch
├── Rename Branch...                F2
├── Set Branch Color...
├── ─────────────────
├── Merge Into Current...
├── Rebase Onto Current...
├── Compare with Current
├── ─────────────────
├── Show Only This Branch
├── Hide This Branch
├── ─────────────────
├── Archive Branch
├── Delete Branch...
└── Export Branch (JSON)
```

**On Empty Area:**
```
├── Create Bookmark at Playhead     Ctrl+B
├── Insert Manual Event...
├── ─────────────────
├── Select All Events               Ctrl+A
├── Deselect All                    Escape
├── ─────────────────
├── Zoom to Fit                     Ctrl+0
├── Zoom to Selection
├── ─────────────────
├── Toggle Branch Tracks
├── Toggle Detail Lane
├── Toggle Minimap
├── ─────────────────
├── Timeline Settings...
└── Export Timeline...
```

### 4.5 Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Left Arrow` | Previous event |
| `Right Arrow` | Next event |
| `Shift+Left` | Previous event (same category) |
| `Shift+Right` | Next event (same category) |
| `Home` | Jump to first event |
| `End` | Jump to latest event |
| `Space` | Play/pause auto-advance |
| `Ctrl+F` | Open search |
| `F` | Open filter panel |
| `B` | Open branch switcher |
| `J` | Jump to event number (dialog) |
| `D` | View diff for selected event |
| `O` | View output for selected event |
| `I` | Toggle inspector panel |
| `M` | Toggle minimap |
| `Ctrl+B` | Add bookmark |
| `Ctrl+A` | Add annotation to selected |
| `Ctrl+0` | Zoom to fit all |
| `Ctrl++` / `Ctrl+=` | Zoom in |
| `Ctrl+-` | Zoom out |
| `Ctrl+Shift+T` | Toggle compact/expanded mode |
| `Ctrl+Shift+H` | Hide/show TimeWarp bar |
| `Ctrl+Shift+R` | Restore workspace to selected event |
| `Ctrl+Shift+P` | Replay from selected event |
| `Ctrl+Z` | Undo last agent action (via TimeWarp) |
| `Ctrl+Shift+Z` | Redo last undone action |
| `1-9` | Quick filter (1=Git, 2=FS, 3=LLM, 4=Test, etc.) |
| `0` | Clear all filters |
| `Ctrl+1` through `Ctrl+4` | Dock position (1=bottom, 2=top, 3=left, 4=right) |
| `Ctrl+Shift+F` | Float/unfloat bar |
| `Escape` | Deselect all / close panels |

---

## 5. Docking and Positioning Behavior

### 5.1 Dock Positions

| Position | Orientation | Compact Size | Expanded Size | Layout |
|---|---|---|---|---|
| **Bottom** (default) | Horizontal | 32px height | 80-200px height | Full-width bar, content above |
| **Top** | Horizontal | 32px height | 80-200px height | Full-width bar, content below |
| **Left** | Vertical | 48px width | 240-400px width | Side panel, content right |
| **Right** | Vertical | 48px width | 240-400px width | Side panel, content left |
| **Float** | Either | Min 200x100 | Max 800x500 | Independent window, always-on-top option |

### 5.2 Dock State Machine

```
                    ┌──────────┐
                    │  HIDDEN  │
                    └────┬─────┘
                         │ Ctrl+Shift+H
                    ┌────▼─────┐
              ┌─────│ COMPACT  │─────┐
              │     └────┬─────┘     │
              │          │ Click/    │ Drag to edge
              │          │ Shortcut  │
              │     ┌────▼─────┐     │
              │     │ EXPANDED │     │
              │     └────┬─────┘     │
              │          │           │
     Drag to  │          │ Drag away │
     edge     │          │ from edge │
              │     ┌────▼─────┐     │
              └────►│ FLOATING │◄────┘
                    └──────────┘
```

### 5.3 Compact Horizontal View (Bottom/Top Dock)

```
┌─ TimeWarp ─────────────────────────────────────────────────────────────┐
│ ⏮◀ ▶ ▶⏭ │ ●●●◆●●★●●●●◆●▲●●●●●★●●●◆●●▼●●●●●●★●●│main│E47/312│3h│
└────────────────────────────────────────────────────────────────────────┘
  ^Transport    ^Event nodes on single rail                 ^Status
```

- 32px total height
- Transport controls: 80px fixed on left
- Timeline rail: flexible width, horizontal scroll
- Status indicators: 200px fixed on right
- Nodes: 6-8px circles with category color
- Hover any node: tooltip with full details
- Click: select and show mini-inspector inline

### 5.4 Compact Vertical View (Left/Right Dock)

```
┌──────┐
│ TW   │
│ ⏮    │
│ ◀    │
│ ▶    │
│ ▶⏭   │
├──────┤
│ ●    │
│ ●    │
│ ◆    │
│ ●    │
│ ★    │
│ ●    │
│ ◆    │
│ ▲    │
│ ●    │
│ ●    │
│ ●    │
│ ◆    │
│ ●    │
│ ▼    │
│ ●    │
├──────┤
│ main │
│ 47   │
│ 3h   │
└──────┘
```

- 48px total width
- Transport: vertical stack at top
- Timeline rail: vertical scroll
- Status: bottom, abbreviated
- Same node styling, rotated

### 5.5 Transition Animations

All transitions use spring physics animation (200ms, ease-out):

| Transition | Animation |
|---|---|
| Compact to Expanded | Bar smoothly grows height/width, nodes spread out |
| Expanded to Compact | Bar smoothly shrinks, nodes compress |
| Bottom to Side | Bar rotates 90 degrees, slides to new edge |
| Bottom to Float | Bar lifts off edge, becomes draggable window |
| Float to Edge | Bar docks with magnetic snap animation |
| Show/Hide | Fade + slide from edge |

### 5.6 Position Memory

```json
{
  "dock_position": "bottom",
  "view_mode": "compact",
  "expanded_size": 140,
  "float_position": { "x": 100, "y": 500 },
  "float_size": { "width": 600, "height": 300 },
  "pinned": false,
  "auto_hide": false,
  "auto_hide_delay_ms": 2000,
  "minimap_visible": true,
  "inspector_visible": false,
  "track_order": ["main", "feature/auth", "hotfix/123"],
  "collapsed_tracks": ["hotfix/123"],
  "zoom_level": 1.0,
  "active_filters": [],
  "last_scroll_position": 0.75
}
```

Persisted per-project in `.timewarp/ui_state.json`. Restored on session resume.

---

## 6. Integration Points with Super-Goose Systems

### 6.1 Agent Core (`crates/goose/src/agents/agent.rs`)

| Integration Point | How TimeWarp Connects | Data Flow |
|---|---|---|
| `Agent::reply()` main loop | Instrument each turn: emit `llm.request.send`, `llm.request.complete` | Agent -> TimeWarp event store |
| Tool execution (`tool_execution.rs`) | Wrap each `CallToolResult` with `mcp.tool.invoke`/`mcp.tool.success`/`mcp.tool.error` | Agent -> TimeWarp |
| Reflexion loop (`reflexion.rs`) | Emit `llm.reflexion.start`, `.critique`, `.retry`, `.success`/`.exhausted` | Agent -> TimeWarp |
| Cost tracking (`observability.rs`) | Feed `CostTracker` data into `llm.cost.session_total`, `llm.cost.threshold` | Observability -> TimeWarp |
| Context compaction (`context_mgmt`) | Emit `session.context.compact` with old/new token counts | Agent -> TimeWarp |
| Permission checks (`permission/`) | Emit `security.permission.request`/`.grant`/`.deny` | Agent -> TimeWarp |
| Shell guard (`shell_guard.rs`) | Emit `security.shell.sandbox`/`.block`/`.allow` | Agent -> TimeWarp |

### 6.2 Session System (`crates/goose/src/session/`)

| Integration Point | How TimeWarp Connects |
|---|---|
| `SessionManager::create_session()` | Emit `session.start` with full context |
| `SessionManager::end_session()` | Emit `session.end` with summary stats |
| `SessionManager::resume_session()` | Emit `session.resume` |
| Session bookmarks (v1.24.05) | Map directly to `session.bookmark.*` events |
| Chat history search | TimeWarp provides richer cross-session search |
| Extension loading | Emit `session.extension.load`/`.unload`/`.error` |

### 6.3 Guardrails Module (`crates/goose/src/guardrails/`)

| Integration Point | How TimeWarp Connects |
|---|---|
| `GuardrailsEngine::scan()` result | Emit `security.guardrail.block` or `security.guardrail.warn` |
| Each detector result | Emit specific `security.pii.detect`, `security.secret.detect`, etc. |
| Fail mode (FailClosed/FailOpen) | Recorded in event metadata |

### 6.4 MCP Gateway (`crates/goose/src/mcp_gateway/`)

| Integration Point | How TimeWarp Connects |
|---|---|
| `McpRouter::route_tool()` | Emit `mcp.tool.invoke` with server routing info |
| `PermissionManager::check()` | Emit `mcp.tool.permission_denied` on denial |
| `AuditLogger::log()` | Dual-write: audit log AND TimeWarp event |
| `CredentialManager::get()` | Emit credential access events (redacted) |
| Server health checks | Emit `mcp.server.health` |

### 6.5 Observability Module (`crates/goose/src/observability/`)

| Integration Point | How TimeWarp Connects |
|---|---|
| `CostTracker::record_request()` | Emit `llm.request.complete` with cost data |
| `GenAiMetrics` counters | TimeWarp aggregates for timeline cost overlays |
| `McpMetrics` | TimeWarp aggregates for tool performance overlays |
| Prometheus export | TimeWarp provides its own metrics endpoint |

### 6.6 Policies Module (`crates/goose/src/policies/`)

| Integration Point | How TimeWarp Connects |
|---|---|
| `PolicyEngine::evaluate()` | Emit `security.policy.violation` on deny |
| Rule hot-reload | Emit `security.policy.update` |
| Action execution (block/warn/etc) | Emit corresponding security events |

### 6.7 Memory System (`crates/goose/src/memory/`)

| Integration Point | How TimeWarp Connects |
|---|---|
| `MemoryManager::store()` | Emit `session.memory.store` |
| `MemoryManager::recall()` | Emit `session.memory.recall` |
| `MemoryManager::consolidate()` | Emit `session.memory.consolidate` |
| Decay operations | Emit periodic memory stats events |

### 6.8 Specialist Agents (`crates/goose/src/agents/specialists/`)

| Agent | Events |
|---|---|
| `CodeAgent` | `fs.file.write`, `build.cargo.*`, LLM events with `code_generation` tag |
| `TestAgent` | `test.suite.*`, `test.case.*`, `test.coverage.*` |
| `DeployAgent` | `deploy.*`, `container.*` |
| `SecurityAgent` | `security.*`, `dep.vulnerability.*` |
| `DocsAgent` | `fs.file.write` with documentation tag |

### 6.9 Team/ALMAS System (`crates/goose/src/agents/team/`)

| Integration Point | How TimeWarp Connects |
|---|---|
| Role handoffs | Branch-like timeline segments per role |
| RBAC capability checks | `security.permission.*` events with role context |
| Validation pass/fail | Decision points on timeline (fork if retry) |
| Pipeline completion | Milestone events with all roles' contributions |

### 6.10 Evolution System (`crates/goose/src/agents/evolution/`)

| Integration Point | How TimeWarp Connects |
|---|---|
| Prompt optimization cycles | `llm.request.*` events with optimization metadata |
| A/B test branches | Parallel timeline branches for variant A and B |
| Memory-driven context | `session.memory.*` events with evolution tags |
| Metrics tracking | Performance data overlaid on timeline |

### 6.11 Adversarial System (`crates/goose/src/agents/adversarial/`)

| Integration Point | How TimeWarp Connects |
|---|---|
| Coach review cycles | Review events on timeline with issue annotations |
| Player execution | Player action events with adversarial context |
| Quality standards | Policy violation events when standards not met |

### 6.12 Extended Thinking / Swarm (`crates/goose/src/agents/extended_thinking.rs`, `swarm.rs`)

| Integration Point | How TimeWarp Connects |
|---|---|
| Extended thinking blocks | `llm.thinking.*` events showing reasoning chain |
| Swarm agent coordination | Multi-track timeline showing parallel agents |
| Agent handoffs | Fork/merge points between agent tracks |

---

## 7. Storage Architecture

### 7.1 Directory Structure

```
.timewarp/
├── db/
│   ├── timewarp.db              # Main SQLite database (WAL mode)
│   ├── timewarp.db-wal          # Write-ahead log
│   └── timewarp.db-shm          # Shared memory file
├── blobs/
│   ├── ab/                      # First 2 chars of BLAKE3 hash
│   │   ├── ab3f...7c.blob       # Content-addressed blob
│   │   └── ab91...2d.blob
│   ├── cd/
│   │   └── cd0e...f1.blob
│   └── ...
├── blobs/.tmp/                  # Temporary writes (atomic rename)
├── backups/
│   ├── auto/                    # Auto-backup snapshots
│   │   ├── 2026-02-11T10-00-00.db
│   │   └── 2026-02-11T14-00-00.db
│   └── pre-recovery/           # Pre-recovery backups
├── exports/                     # Exported timelines
├── orphans/                     # Orphaned blobs (post-crash)
├── ui_state.json               # UI position/state
├── config.toml                  # TimeWarp configuration
└── recovery.journal             # Crash recovery journal
```

### 7.2 SQLite Schema

```sql
-- Enable WAL mode for concurrent reads + atomic writes
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA auto_vacuum = INCREMENTAL;

-- Core events table (append-only, hash-chained)
CREATE TABLE events (
    event_id        TEXT PRIMARY KEY,      -- UUID v7
    parent_ids      TEXT NOT NULL,          -- JSON array of parent UUIDs
    branch_id       TEXT NOT NULL,
    sequence_number INTEGER NOT NULL,
    category        TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    severity        INTEGER NOT NULL DEFAULT 1,
    timestamp       TEXT NOT NULL,          -- ISO 8601
    duration_ms     INTEGER,
    inputs          TEXT NOT NULL DEFAULT '{}',  -- JSON
    outputs         TEXT NOT NULL DEFAULT '{}',  -- JSON
    summary         TEXT NOT NULL DEFAULT '',
    file_touches    TEXT NOT NULL DEFAULT '[]',  -- JSON array
    snapshot_id     TEXT,
    event_hash      TEXT NOT NULL,          -- BLAKE3
    prev_hash       TEXT NOT NULL,          -- Chain link
    tags            TEXT NOT NULL DEFAULT '[]',  -- JSON array
    actor           TEXT NOT NULL DEFAULT '{}',  -- JSON
    annotations     TEXT NOT NULL DEFAULT '[]',  -- JSON array
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (branch_id) REFERENCES branches(branch_id)
);

-- Snapshots table
CREATE TABLE snapshots (
    snapshot_id         TEXT PRIMARY KEY,   -- BLAKE3 of manifest
    event_id            TEXT NOT NULL,
    snapshot_type       TEXT NOT NULL,       -- full, incremental, checkpoint
    manifest            TEXT NOT NULL,       -- JSON manifest
    total_size          INTEGER NOT NULL,
    file_count          INTEGER NOT NULL,
    parent_snapshot_id  TEXT,
    created_at          TEXT NOT NULL,
    FOREIGN KEY (event_id) REFERENCES events(event_id)
);

-- Branches table
CREATE TABLE branches (
    branch_id           TEXT PRIMARY KEY,
    name                TEXT NOT NULL UNIQUE,
    created_at          TEXT NOT NULL,
    created_from_event  TEXT,
    tip_event_id        TEXT,
    parent_branch_id    TEXT,
    status              TEXT NOT NULL DEFAULT 'active',
    color               TEXT NOT NULL DEFAULT '#4a9eff',
    description         TEXT,
    event_count         INTEGER NOT NULL DEFAULT 0,
    metadata            TEXT NOT NULL DEFAULT '{}'
);

-- Bookmarks table
CREATE TABLE bookmarks (
    bookmark_id     TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    event_id        TEXT NOT NULL,
    description     TEXT,
    tags            TEXT NOT NULL DEFAULT '[]',
    created_at      TEXT NOT NULL,
    FOREIGN KEY (event_id) REFERENCES events(event_id)
);

-- Full-text search index
CREATE VIRTUAL TABLE events_fts USING fts5(
    summary, event_type, tags,
    content='events',
    content_rowid='rowid'
);

-- Performance indexes
CREATE INDEX idx_events_branch_seq ON events(branch_id, sequence_number);
CREATE INDEX idx_events_category ON events(category, timestamp);
CREATE INDEX idx_events_type ON events(event_type, timestamp);
CREATE INDEX idx_events_timestamp ON events(timestamp);
CREATE INDEX idx_events_snapshot ON events(snapshot_id) WHERE snapshot_id IS NOT NULL;
CREATE INDEX idx_events_severity ON events(severity) WHERE severity >= 3;
CREATE INDEX idx_snapshots_event ON snapshots(event_id);
CREATE INDEX idx_branches_status ON branches(status);
CREATE INDEX idx_bookmarks_event ON bookmarks(event_id);

-- View: latest events per branch
CREATE VIEW branch_tips AS
SELECT b.branch_id, b.name, b.tip_event_id, e.timestamp, e.event_type, e.summary
FROM branches b
JOIN events e ON b.tip_event_id = e.event_id
WHERE b.status = 'active';
```

### 7.3 BLAKE3 Content-Addressed Blob Store

```
Write path:
1. Hash content with BLAKE3 -> "ab3f...7c"
2. Check if .timewarp/blobs/ab/ab3f...7c.blob exists
3. If exists -> skip (deduplication, free)
4. If not:
   a. Write to .timewarp/blobs/.tmp/{random}.blob
   b. fsync the temp file
   c. Atomic rename to .timewarp/blobs/ab/ab3f...7c.blob
   d. If rename fails (race condition) -> delete temp (blob already written by another)

Read path:
1. Look up hash from event/snapshot
2. Read .timewarp/blobs/{first-2-chars}/{full-hash}.blob
3. Verify hash on read (optional, configurable)

Deduplication:
- Identical file content across branches shares ONE blob
- Typical dedup ratio: 60-80% for active development
- Estimated storage: 20-40% of raw workspace size
```

### 7.4 Write-Ahead Protocol

Every event write follows this atomic protocol:

```
1. Write blobs to .tmp/ directory
2. Atomic rename blobs to final location
3. BEGIN TRANSACTION
4. INSERT event row
5. INSERT snapshot row (if applicable)
6. UPDATE branch tip
7. UPDATE events_fts
8. COMMIT
9. Write recovery journal entry (post-commit confirmation)

On crash recovery:
1. Check recovery journal for incomplete operations
2. Verify last N events in hash chain
3. Clean up .tmp/ directory (incomplete blob writes)
4. Scan for orphan blobs (in blobs/ but not in snapshots)
5. Move orphans to .timewarp/orphans/
6. Report recovery status
```

### 7.5 Storage Budgets

| Configuration | Default | Description |
|---|---|---|
| `max_db_size_mb` | 500 | Max SQLite database size |
| `max_blob_store_mb` | 2000 | Max blob store size |
| `max_events_count` | 100,000 | Max events before archival |
| `auto_archive_days` | 30 | Archive events older than N days |
| `blob_dedup` | true | Enable content-addressed dedup |
| `compress_blobs` | true | zstd compress blobs > 1KB |
| `wal_checkpoint_interval` | 100 | WAL checkpoint every N events |
| `auto_backup_interval_hours` | 4 | Auto backup interval |
| `auto_backup_keep_count` | 10 | Number of backups to retain |

---

## 8. Real-Time Streaming Architecture

### 8.1 Event Capture Pipeline

```
Agent Action
    │
    ▼
┌──────────────────────┐
│ MCP Middleware Proxy  │  Transparent proxy between agent and tools
│ (mcp_middleware.rs)   │  Captures inputs/outputs without modifying them
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Event Classifier      │  Determines category, event_type, severity
│                       │  Generates human-readable summary
│                       │  Computes file touches
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Hash Chain Linker     │  Computes event_hash, links to prev_hash
│                       │  Assigns sequence_number within branch
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Snapshot Capturer     │  If snapshot needed: capture affected files
│                       │  Content-address with BLAKE3
│                       │  Delta-encode against parent snapshot
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Atomic Writer         │  Blobs -> .tmp/ -> rename
│                       │  SQLite BEGIN -> INSERT -> COMMIT
│                       │  Recovery journal entry
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Event Bus             │  Broadcast to all subscribers
│ (tokio broadcast)     │  Non-blocking, bounded channel
└──────────┬───────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
┌─────────┐  ┌──────────┐
│ UI      │  │ Metrics  │
│ (Tauri) │  │ (Prom)   │
└─────────┘  └──────────┘
```

### 8.2 UI Streaming Protocol

The TimeWarp bar receives events via Tauri IPC (or WebSocket for web UI):

```typescript
// Event stream messages (Tauri -> React)
interface TimeWarpStreamMessage {
  type: 'event_created' | 'event_updated' | 'branch_created' |
        'branch_updated' | 'snapshot_created' | 'playhead_moved' |
        'recording_state_changed' | 'filter_applied';
  payload: TimeWarpEvent | Branch | Snapshot | PlayheadState | FilterState;
  timestamp: string;
}

// Client -> Server commands (React -> Tauri)
interface TimeWarpCommand {
  type: 'jump_to_event' | 'jump_to_time' | 'restore_snapshot' |
        'create_branch' | 'set_filter' | 'set_zoom' | 'search' |
        'add_bookmark' | 'add_annotation' | 'toggle_recording' |
        'compare_events' | 'replay_from' | 'export_range';
  params: Record<string, unknown>;
}
```

### 8.3 Performance Targets

| Metric | Target | Rationale |
|---|---|---|
| Event capture latency | < 5ms | Must not perceptibly slow agent operations |
| Event-to-UI latency | < 50ms | Real-time feel for timeline updates |
| Hash chain verification | < 100ms for 1000 events | Fast integrity checks |
| Snapshot capture (incremental) | < 50ms | Only changed files |
| Snapshot capture (full) | < 500ms for 10K files | Periodic full captures |
| Blob write (single file) | < 10ms | Atomic write + fsync |
| Timeline render (1000 events) | < 16ms (60fps) | Smooth scrolling |
| Search (FTS5) across 100K events | < 100ms | Fast search results |
| Memory usage (idle) | < 50MB | Background process footprint |
| Memory usage (active, 10K events) | < 200MB | With blob cache |

### 8.4 Backpressure and Throttling

When the agent generates events faster than the storage pipeline can process:

1. **Event queue**: Bounded channel (capacity: 1000). If full, events are batched.
2. **Blob writes**: Parallel writes (up to 4 concurrent), async fsync.
3. **SQLite writes**: Batched transactions (up to 100 events per transaction).
4. **UI updates**: Throttled to 60fps. Multiple events between frames are batched as a single update.
5. **Snapshot capture**: Rate-limited to 1 full snapshot per 30 seconds. Incremental snapshots are not rate-limited.
6. **FTS indexing**: Asynchronous, does not block event insertion.

---

## 9. What Makes This Better Than Anything Else

### 9.1 Competitive Landscape (February 2026)

| Tool | What It Does | What It Lacks |
|---|---|---|
| **LangGraph** (24.5K stars) | Checkpoint/branch for agent conversation state | No file system state, no visual timeline, no deterministic replay, no content-addressed storage |
| **Agent-Git** (47 stars) | Agent-level VCS with tool reversal | No visual timeline, no cross-system capture, minimal adoption |
| **OpenAI Codex** (59.9K stars) | Sandboxed coding agent (Rust rewrite) | Ephemeral sandboxes, no persistent history, no branching, no time travel |
| **Claude Code** (Anthropic) | Session resume, git-aware | No workspace reconstruction, no branching, no timeline visualization |
| **GitKraken** | Beautiful git visualization | Git-only, no AI awareness, no tool call tracking |
| **Fusion 360 Timeline** | Parametric design timeline | CAD-only, single domain |
| **Git** (raw) | Version control for files | No agent action tracking, no LLM awareness, no cost tracking |
| **Jujutsu (jj)** (25.6K stars) | Operation log with undo/redo for VCS | VCS-only, no agent integration, no visual timeline |
| **GitButler** (19K stars) | Virtual branches | Git-only, no agent awareness |
| **Agent-Prism** (289 stars) | React components for agent trace visualization | Visualization-only, no storage, no time-travel |

### 9.2 TimeWarp's Unique Value Propositions

**1. Universal Capture Across All 16 Categories**
No other tool captures git operations AND LLM calls AND file system changes AND test runs AND build operations AND dependency changes AND container events AND MCP tool calls AND session management AND security events AND deployments AND versioning AND conflict resolution -- all in one unified timeline. Every tool in the landscape covers 1-3 of these at best.

**2. Content-Addressed Workspace Reconstruction**
TimeWarp can reconstruct the exact state of every file in the workspace at any point on the timeline. Not just "what changed" (like git diff) but "what was the complete file tree, byte-for-byte, at event #247." This uses BLAKE3 content-addressed storage with deduplication, so identical files across branches share storage. LangGraph checkpoints conversation state; TimeWarp checkpoints the actual workspace.

**3. True Time Travel with Deterministic Replay**
Jump to any point on the timeline and see the workspace as it was. Then replay forward from that point in a Docker container with pinned dependencies to get deterministic reproduction. No other AI coding tool offers this -- they offer "resume from checkpoint" at best, which is conversation-level, not workspace-level.

**4. Branch Visualization for Agent Decision Trees**
When a reflexion loop retries, when an A/B test runs two prompt variants, when multiple specialist agents work in parallel -- these naturally create branches on the timeline. TimeWarp visualizes these as parallel tracks (like GitKraken for git branches) so you can see the decision tree the agent explored. Compare Branch A (failed approach) with Branch B (successful approach) side by side.

**5. Single Compact Bar That Works Without Expanding**
Most timeline tools require a full panel or separate window. TimeWarp's default state is a 32px horizontal bar at the bottom of the window -- like a macOS dock or a DAW transport bar. Every node is a colored dot you can hover for details. You never NEED to expand it, but when you do, it unfolds into a full multi-track timeline editor with GitKraken-quality branch visualization.

**6. Integrated Cost and Token Tracking on the Timeline**
Every LLM call on the timeline shows its cost. You can see exactly which agent action consumed the most tokens. Filter to show only events that cost more than $0.01. The cumulative cost counter runs along the timeline like a stock ticker. No other timeline tool integrates financial data with development activity.

**7. Security Audit Trail Built In**
Every guardrail trigger, permission check, secret detection, and shell sandboxing event appears on the timeline. For compliance, you can export the complete audit trail for a session, a date range, or a project. The hash chain provides tamper evidence -- if someone modifies an event, the chain breaks.

**8. Semantic Conflict Detection**
Beyond git's text-level merge conflicts, TimeWarp detects semantic conflicts: "Branch A changed the function signature and Branch B added a call to the old signature" or "Branch A updated the dependency version and Branch B's tests depend on the old version's API." This uses AI-powered analysis of the actual code changes, not just text diff.

**9. Cross-Session Continuity**
Sessions end, but the timeline persists. Recall what happened three sessions ago. Search for "when did I last change the authentication module?" across all sessions. Restore the workspace to any point from any session. No other AI coding tool maintains this level of cross-session state.

**10. Dockable, Multi-Position, Multi-Monitor**
The bar works docked to any edge (bottom, top, left, right), floated as an independent window, or on a second monitor. It adapts its layout to horizontal or vertical orientation. It remembers position per project. No other developer timeline tool offers this level of UI flexibility.

### 9.3 The Compound Advantage

Each feature above is incrementally better than competitors. But the compound effect is transformative: TimeWarp is the first tool that gives an AI coding agent a complete, verifiable, navigable, branch-aware, cost-tracked, security-audited operational history with true workspace time-travel. It turns the agent's opaque execution into a transparent, controllable, replayable process.

The closest analogy is the difference between a text file of git log output and a full GitKraken/SourceTree GUI -- except TimeWarp covers everything the agent does, not just git.

---

## Appendix A: Event Type String Registry

All event type strings follow the pattern `{category}.{subcategory}.{action}`. The complete registry:

```
git.commit, git.commit.amend, git.branch.create, git.branch.delete, git.branch.rename,
git.checkout, git.switch, git.merge, git.merge.conflict, git.merge.resolve, git.merge.abort,
git.rebase.start, git.rebase.continue, git.rebase.abort, git.rebase.complete, git.rebase.interactive,
git.cherry_pick, git.cherry_pick.conflict, git.revert, git.stash.push, git.stash.pop,
git.stash.apply, git.stash.drop, git.stash.list, git.tag.create, git.tag.delete,
git.reset.soft, git.reset.mixed, git.reset.hard, git.clean, git.add, git.restore,
git.diff, git.log, git.status, git.bisect.start, git.bisect.step, git.bisect.result,
git.worktree.add, git.worktree.remove, git.submodule.update, git.reflog,

github.pr.create, github.pr.update, github.pr.close, github.pr.merge, github.pr.reopen,
github.pr.convert_draft, github.pr.review.request, github.pr.review.submit,
github.pr.review.dismiss, github.pr.comment, github.pr.comment.resolve,
github.pr.suggestion, github.pr.suggestion.apply, github.pr.check.run,
github.pr.check.complete, github.pr.conflict, github.pr.auto_merge.enable,
github.pr.auto_merge.disable, github.issue.create, github.issue.close, github.issue.reopen,
github.issue.comment, github.issue.label.add, github.issue.label.remove,
github.issue.assign, github.issue.milestone, github.issue.transfer,
github.actions.trigger, github.actions.job.start, github.actions.job.complete,
github.actions.run.complete, github.actions.run.cancel, github.actions.run.rerun,
github.release.create, github.release.edit, github.release.delete,
github.deploy.create, github.deploy.status, github.push, github.fetch,
github.fork, github.star, github.webhook,

gitlab.mr.create, gitlab.mr.update, gitlab.mr.merge, gitlab.mr.close,
gitlab.mr.approve, gitlab.mr.unapprove, gitlab.mr.comment,
gitlab.pipeline.create, gitlab.pipeline.stage.start, gitlab.pipeline.stage.complete,
gitlab.pipeline.job.start, gitlab.pipeline.job.complete, gitlab.pipeline.complete,
gitlab.environment.create, gitlab.environment.deploy, gitlab.environment.stop,
gitlab.package.publish, gitlab.package.delete, gitlab.wiki.create, gitlab.wiki.update,

bitbucket.pr.create, bitbucket.pr.merge, bitbucket.pr.decline, bitbucket.pr.comment,
bitbucket.pipeline.start, bitbucket.pipeline.complete,
azure.workitem.create, azure.workitem.update, azure.workitem.close,
azure.pipeline.run, azure.pr.create, azure.pr.complete, azure.pr.abandon,
azure.release.deploy, remote.push, remote.fetch, remote.clone,

fs.file.create, fs.file.write, fs.file.delete, fs.file.rename, fs.file.move,
fs.file.copy, fs.file.chmod, fs.file.truncate, fs.file.append,
fs.dir.create, fs.dir.delete, fs.dir.rename, fs.symlink.create, fs.symlink.delete,
fs.watch.overflow, fs.lock.acquire, fs.lock.release,
fs.snapshot.full, fs.snapshot.incremental,

llm.request.send, llm.request.stream_start, llm.request.stream_chunk,
llm.request.complete, llm.request.error, llm.request.timeout,
llm.request.cancel, llm.request.retry, llm.model.switch, llm.model.fallback,
llm.thinking.start, llm.thinking.step, llm.thinking.complete,
llm.reflexion.start, llm.reflexion.critique, llm.reflexion.retry,
llm.reflexion.success, llm.reflexion.exhausted, llm.cost.threshold,
llm.cost.session_total, llm.guardrail.input, llm.guardrail.output,
llm.cache.hit, llm.cache.miss, llm.embedding.generate, llm.context.compact,

test.suite.start, test.suite.complete, test.case.pass, test.case.fail,
test.case.skip, test.case.error, test.case.flaky, test.case.timeout,
test.case.new, test.case.removed, test.coverage.report, test.coverage.change,
test.coverage.threshold, test.regression.detect, test.regression.fix,
test.snapshot.update, test.snapshot.mismatch, test.benchmark.run,
test.benchmark.regression, test.watch.trigger,

build.cargo.start, build.cargo.complete, build.cargo.warning, build.cargo.error,
build.cargo.clippy, build.cargo.test, build.cargo.doc, build.cargo.fmt,
build.npm.install, build.npm.build, build.npm.start, build.npm.lint, build.npm.typecheck,
build.python.pip, build.python.venv, build.python.lint,
build.go.build, build.go.test, build.go.vet,
build.docker.build, build.docker.push, build.docker.pull,
build.make.target, build.cmake.configure,
build.artifact.create, build.artifact.upload,
build.cache.hit, build.cache.miss, build.incremental.reuse, build.cross.compile,

dep.add, dep.remove, dep.update, dep.update.major, dep.update.security,
dep.lockfile.update, dep.conflict.version, dep.conflict.peer,
dep.vulnerability.detect, dep.vulnerability.fix, dep.vulnerability.suppress,
dep.license.change, dep.license.violation, dep.audit.run, dep.graph.change,
dep.size.increase, dep.deprecated, dep.yanked,
dep.sonatype.scan, dep.sonatype.recommendation,

container.create, container.start, container.stop, container.kill,
container.remove, container.restart, container.logs, container.exec,
container.copy_to, container.copy_from, container.commit,
container.network.create, container.network.connect,
container.volume.create, container.volume.mount,
container.health.check, container.oom,
sandbox.create, sandbox.destroy, sandbox.escape_attempt, sandbox.resource_limit,

mcp.tool.invoke, mcp.tool.success, mcp.tool.error, mcp.tool.timeout,
mcp.tool.cancel, mcp.tool.retry, mcp.tool.permission_denied,
mcp.tool.rate_limited, mcp.tool.approval_required, mcp.tool.approval_granted,
mcp.tool.approval_denied, mcp.server.connect, mcp.server.disconnect,
mcp.server.error, mcp.server.health, mcp.server.reconnect,
mcp.notification, mcp.resource.read, mcp.resource.subscribe,
mcp.prompt.get, mcp.sampling.request,

session.start, session.end, session.resume,
session.bookmark.save, session.bookmark.restore, session.bookmark.delete,
session.bookmark.list, session.context.compact, session.context.window,
session.memory.consolidate, session.memory.recall, session.memory.store,
session.checkpoint.save, session.checkpoint.restore, session.checkpoint.delete,
session.config.change, session.extension.load, session.extension.unload,
session.extension.error, session.user.message, session.agent.message,
session.mode.switch, session.idle.start, session.idle.end,

security.guardrail.block, security.guardrail.warn, security.pii.detect,
security.secret.detect, security.injection.detect, security.jailbreak.detect,
security.permission.request, security.permission.grant, security.permission.deny,
security.shell.sandbox, security.shell.block, security.shell.allow,
security.file.access_denied, security.network.block, security.audit.access,
security.policy.update, security.policy.violation, security.rate_limit.hit,
security.anomaly.detect, security.credential.rotate,

deploy.start, deploy.complete, deploy.rollback.start, deploy.rollback.complete,
deploy.canary.start, deploy.canary.promote, deploy.canary.rollback,
deploy.bluegreen.switch, deploy.health.check, deploy.health.degraded,
deploy.health.recovered, deploy.traffic.shift, deploy.config.update,
deploy.scale.up, deploy.scale.down, deploy.certificate.renew, deploy.dns.update,
deploy.preview.create, deploy.preview.destroy,

version.bump.suggest, version.bump.apply, version.changelog.generate,
version.changelog.entry, version.breaking.detect, version.breaking.document,
version.tag.create, version.release.draft, version.release.publish,
version.prerelease, version.conventional_commit,

conflict.merge.detect, conflict.merge.resolve, conflict.merge.3way_diff,
conflict.dep.version, conflict.dep.resolve, conflict.schema.migration,
conflict.schema.drift, conflict.config.drift, conflict.config.resolve,
conflict.api.breaking, conflict.lockfile, conflict.type.incompatible,
conflict.semantic
```

**Total: 340+ distinct event types across 16 categories.**

---

## Appendix B: Configuration Reference

```toml
[timewarp]
enabled = true
recording = true                    # Start recording on session start

[timewarp.storage]
db_path = ".timewarp/db/timewarp.db"
blob_path = ".timewarp/blobs"
max_db_size_mb = 500
max_blob_store_mb = 2000
max_events = 100000
wal_checkpoint_interval = 100
compress_blobs = true               # zstd for blobs > 1KB
blob_verify_on_read = false         # Verify BLAKE3 on every read

[timewarp.snapshots]
frequency = "on_change"             # on_change | every_n_events | manual | timed
full_snapshot_interval = 100        # Full snapshot every N events
incremental = true                  # Delta-encode against parent
auto_checkpoint_seconds = 60        # Time-based auto-checkpoint

[timewarp.backup]
enabled = true
interval_hours = 4
keep_count = 10
target = "local"                    # local | s3 | gcs

[timewarp.capture]
git = true
github = true
gitlab = false
bitbucket = false
azure = false
filesystem = true
llm = true
tests = true
builds = true
dependencies = true
containers = true
mcp = true
sessions = true
security = true
deployments = true
versioning = true
conflicts = true
ignore_patterns = ["node_modules/**", "target/**", ".git/**", "*.pyc"]

[timewarp.ui]
default_dock = "bottom"             # bottom | top | left | right | float
default_mode = "compact"            # compact | expanded | hidden
compact_height = 32
expanded_height = 140
minimap = true
theme = "auto"                      # auto | dark | light

[timewarp.performance]
event_queue_size = 1000
max_concurrent_blob_writes = 4
batch_size = 100
ui_throttle_fps = 60
max_snapshot_rate_ms = 30000        # Min 30s between full snapshots
```

---

*End of TimeWarp Comprehensive Feature Specification*
*340+ event types | 16 categories | 9 major sections | Content-addressed BLAKE3 storage | SQLite WAL | Real-time streaming*
