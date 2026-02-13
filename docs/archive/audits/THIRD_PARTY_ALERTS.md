# Third-Party Code Alerts (goose/temp/)

**Alerts:** #39, #43, #48-54, #56-73
**Count:** ~25 alerts
**Status:** NOT IN OUR BRANCH (exist only on main)

---

## Overview

These alerts come from third-party code in the `goose/temp/` directory on the main branch. This directory does **NOT exist** in our worktree/branch. These are vendored/cloned external projects.

---

## Affected Third-Party Projects

### ansible-2.20.2 (9 alerts)
| Alert | Rule | File | Line |
|-------|------|------|------|
| #56 | py/clear-text-logging-sensitive-data | lib/ansible/cli/_ssh_askpass.py | 52 |
| #57 | py/clear-text-logging-sensitive-data | lib/ansible/utils/display.py | 487 |
| #58 | py/clear-text-logging-sensitive-data | lib/ansible/utils/display.py | 528 |
| #60 | py/clear-text-logging-sensitive-data | test/.../ansible-vault/password-script.py | 27 |
| #61 | py/clear-text-logging-sensitive-data | test/.../ansible-vault/test-vault-client.py | 59 |
| #62 | py/clear-text-logging-sensitive-data | lib/ansible/cli/vault.py | 387 |
| #63 | py/clear-text-storage-sensitive-data | lib/ansible/plugins/lookup/password.py | 263 |
| #64 | py/incomplete-url-substring-sanitization | lib/ansible/playbook/role/requirement.py | 101 |
| #65 | py/weak-crypto-key | test/.../ssh_agent/action_plugins/ssh_keygen.py | 26 |
| #66 | py/path-injection | test/.../uri/files/testserver.py | 23 |
| #67 | py/insecure-temporary-file | test/.../sanity/.../bad.py | 15 |
| #68 | py/insecure-protocol | test/.../ansible-galaxy/files/testserver.py | 12 |

### vibes-cli-main (3 alerts)
| Alert | Rule | File | Line |
|-------|------|------|------|
| #49 | js/incomplete-sanitization | scripts/lib/transforms/import-map.js | 200 |
| #51 | js/regex-injection | scripts/lib/backup.js | 47 |
| #53 | js/tainted-format-string | scripts/__tests__/e2e/local-server.js | 201 |
| #54 | js/identity-replacement | scripts/lib/transforms/import-map.js | 200 |

### openlit-main (2 alerts)
| Alert | Rule | File | Line |
|-------|------|------|------|
| #43 | js/command-line-injection | src/client/src/helpers/server/cron.ts | 88 |
| #52 | js/code-injection | src/client/src/lib/platform/manage-dashboard/widget.ts | 178 |

### watchflow-main (3 alerts)
| Alert | Rule | File | Line |
|-------|------|------|------|
| #71 | py/stack-trace-exposure | src/main.py | 149 |
| #72 | py/stack-trace-exposure | src/api/scheduler.py | 13 |
| #73 | py/stack-trace-exposure | src/api/scheduler.py | 27 |

### agentic-rag-main (2 alerts)
| Alert | Rule | File | Line |
|-------|------|------|------|
| #69 | py/stack-trace-exposure | app.py | 54 |
| #70 | py/stack-trace-exposure | app.py | 57 |

### evolving-agents-main (1 alert)
| Alert | Rule | File | Line |
|-------|------|------|------|
| #59 | py/clear-text-logging-sensitive-data | examples/.../openai_agent_evolution_demo.py | 665 |

### gate22-main (1 alert)
| Alert | Rule | File | Line |
|-------|------|------|------|
| #39 | js/incomplete-url-substring-sanitization | frontend/src/components/layout/user-profile-dropdown.tsx | 54 |

---

## Recommendation

These are all issues in third-party code that was cloned/vendored into `goose/temp/` on the main branch. They should be:

1. **Excluded from CodeQL scanning** via `.github/codeql/codeql-config.yml` (already done):
   ```yaml
   paths-ignore:
     - 'goose/temp'
   ```
2. **Ideally removed** from the repository entirely (the `goose/temp/` directory appears to be temporary working copies of external projects)
3. **NOT fixed in our branch** — these are upstream bugs in external projects
