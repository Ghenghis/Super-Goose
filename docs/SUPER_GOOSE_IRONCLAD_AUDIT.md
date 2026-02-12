# Super-Goose Ironclad Codebase Audit Specification

**Version**: 1.0 — February 2026
**Target**: `G:\goose` — Full codebase, every file, every line
**Philosophy**: Triple-redundant tooling per category. If one tool misses it, the other two catch it.
**Stack**: Python (primary), TypeScript/JS (UI), Docker, LangGraph, MCP servers

---

## Table of Contents

1. [Core Principles](#1-core-principles)
2. [Tool Matrix — Triple Redundancy Per Category](#2-tool-matrix)
3. [Category 1: Formatting & Style](#3-formatting)
4. [Category 2: Linting & Static Analysis](#4-linting)
5. [Category 3: Type Checking](#5-type-checking)
6. [Category 4: Security — SAST](#6-sast)
7. [Category 5: Secret Scanning](#7-secrets)
8. [Category 6: Dependency & Supply Chain](#8-dependencies)
9. [Category 7: Dead Code & Unused Imports](#9-dead-code)
10. [Category 8: Test Execution & Coverage](#10-testing)
11. [Category 9: GUI / Visual Regression Testing](#11-visual)
12. [Category 10: E2E / Integration Testing](#12-e2e)
13. [Category 11: Runtime & Performance](#13-runtime)
14. [Category 12: Documentation & Completeness](#14-docs)
15. [Category 13: Docker & Infrastructure](#15-docker)
16. [Category 14: Anti-Pattern & Forbidden-Pattern Scanning](#16-antipattern)
17. [Sweep Methodology — 3 Sweeps](#17-sweeps)
18. [Audit Output Structure](#18-outputs)
19. [Hard Pass/Fail Gates](#19-gates)
20. [Agent Instructions — Drop-In Prompt](#20-agent-prompt)
21. [Installation Script](#21-install)

---

## 1. Core Principles <a id="1-core-principles"></a>

### The "No Skipping" Contract

- **NO "pre-existing"**: If it exists in the codebase, it gets audited.
- **NO "not my task"**: Every file, every line, every config is in scope.
- **NO "later"**: If found, it gets logged AND fixed OR justified with owner + deadline.
- **NO "it probably works"**: Every claim requires proof via tool output saved to `/audit/`.

### What "100% Coverage" Means

"100% coverage" is not a single metric. It is the conjunction of ALL of these passing:

1. **Build correctness** — Clean install, clean build, clean start, clean production build
2. **Static analysis clean** — Zero warnings from ALL formatters, linters, type checkers, analyzers
3. **Test coverage** — All unit/integration/e2e tests pass, zero skipped, zero flaky
4. **Security clean** — SAST, secret scan, dependency scan all pass
5. **Runtime correctness** — Core flows exercised, API endpoints validated, UI renders without errors
6. **Visual correctness** — GUI screenshots match baselines, no visual regressions
7. **Dead code elimination** — Zero unused functions, imports, variables, classes
8. **Anti-pattern clean** — Zero TODOs, stubs, mocks-only, placeholders, empty catches in production code

### Triple Redundancy Rule

For EVERY category, use a MINIMUM of 3 tools from different vendors/projects. The rationale is proven by research:

- Gitleaks and TruffleHog together find 30%+ more secrets than either alone (per NC State study on secret scanner overlap)
- No single SAST tool achieves >70% recall across all vulnerability classes
- Different linters catch different classes of issues (stylistic vs. semantic vs. security)

**If Tool A finds 0 issues but Tools B and C find issues, Tool A's "clean" result is suspect — investigate why.**

---

## 2. Tool Matrix — Triple Redundancy Per Category <a id="2-tool-matrix"></a>

| # | Category | Tool 1 (Primary) | Tool 2 (Backup) | Tool 3 (Failsafe) | Tool 4+ (Bonus) |
|---|----------|-------------------|-------------------|---------------------|-------------------|
| 1 | **Formatting** | Ruff (`ruff format`) | Black | autopep8 | — |
| 2 | **Linting** | Ruff (`ruff check`) | Pylint | Flake8 + plugins | Prospector |
| 3 | **Type Checking** | ty (Astral, Rust-based) | Mypy (strict) | Pyright | — |
| 4 | **SAST Security** | Semgrep | Bandit | CodeQL | SonarQube CE |
| 5 | **Secret Scanning** | Gitleaks | TruffleHog v3 | detect-secrets | — |
| 6 | **Dependency Scan** | pip-audit | Safety | Trivy (fs mode) | Snyk (free tier) |
| 7 | **Dead Code** | Vulture | Ruff (F401/F841) | Pylint (unused-*) | — |
| 8 | **Testing** | pytest + coverage | pytest-xdist | Hypothesis (property) | — |
| 9 | **GUI/Visual** | Playwright (screenshots) | Cypress | BackstopJS | Pixeleye |
| 10 | **E2E/Integration** | Playwright | pytest + httpx | Selenium | — |
| 11 | **Runtime/Perf** | py-spy (profiler) | memray (memory) | scalene (CPU+mem) | locust (load) |
| 12 | **Docs Quality** | pydocstyle | interrogate | doc8 | — |
| 13 | **Docker** | hadolint | docker-compose config | Trivy (image) | Dockle |
| 14 | **Anti-Patterns** | Custom grep scripts | Semgrep rules | Ruff custom rules | — |

---

## 3. Category 1: Formatting & Style <a id="3-formatting"></a>

### Why 3 Tools

Ruff and Black agree on most formatting but differ on edge cases. autopep8 catches PEP 8 violations that opinionated formatters intentionally ignore.

### Tools

| Tool | Install | Command | What It Catches |
|------|---------|---------|-----------------|
| **Ruff format** | `pip install ruff` | `ruff format --check .` | Opinionated formatting, fast (Rust) |
| **Black** | `pip install black` | `black --check --diff .` | Deterministic formatting, industry standard |
| **autopep8** | `pip install autopep8` | `autopep8 --diff -r .` | PEP 8 compliance, less opinionated |

### isort (Import Sorting)

| Tool | Install | Command |
|------|---------|---------|
| **Ruff (isort)** | built-in | `ruff check --select I .` |
| **isort** | `pip install isort` | `isort --check-only --diff .` |

### Pass Criteria

```
✅ ruff format --check . → 0 files would be reformatted
✅ black --check . → 0 files would be reformatted  
✅ All imports sorted consistently
```

---

## 4. Category 2: Linting & Static Analysis <a id="4-linting"></a>

### Tools

| Tool | Install | Command | Unique Strength |
|------|---------|---------|-----------------|
| **Ruff** | `pip install ruff` | `ruff check . --output-format=json > audit/ruff.json` | 10-100x faster than alternatives, 800+ rules |
| **Pylint** | `pip install pylint` | `pylint --output-format=json src/ > audit/pylint.json` | Deepest semantic analysis, catches design issues |
| **Flake8** | `pip install flake8 flake8-bugbear flake8-comprehensions flake8-simplify` | `flake8 --format=json . > audit/flake8.json` | Plugin ecosystem catches niche issues |
| **Prospector** | `pip install prospector[with_everything]` | `prospector --output-format json > audit/prospector.json` | Meta-linter wrapping multiple tools |

### Configuration — Strict Mode

```toml
# pyproject.toml
[tool.ruff]
target-version = "py311"
line-length = 120

[tool.ruff.lint]
select = ["ALL"]  # Enable ALL rules, then exclude what's justified
ignore = ["D203", "D213"]  # Must document why each is ignored

[tool.pylint.messages_control]
max-line-length = 120
disable = []  # Start with nothing disabled

[tool.pylint.basic]
good-names = ["i", "j", "k", "v", "e", "f", "db"]
```

### Pass Criteria

```
✅ ruff check . → 0 errors, 0 warnings
✅ pylint src/ → score >= 9.5/10 (document anything below 10.0)
✅ flake8 . → 0 issues
✅ ALL issues from ALL tools must be reconciled (fixed or documented in EXCEPTIONS.md)
```

---

## 5. Category 3: Type Checking <a id="5-type-checking"></a>

### Why 3 Type Checkers

Each uses different inference engines. ty (Astral) uses Rust-based analysis with intersection types. Mypy is the standard. Pyright catches issues Mypy misses (and vice versa — studies show 15-20% non-overlap).

### Tools

| Tool | Install | Command | Unique Strength |
|------|---------|---------|-----------------|
| **ty** | `pip install ty` | `ty check . 2>&1 > audit/ty.txt` | 10-60x faster than mypy/pyright, Rust-based, advanced narrowing |
| **Mypy** | `pip install mypy` | `mypy --strict . > audit/mypy.txt` | Most mature, largest community, plugin ecosystem |
| **Pyright** | `npm install -g pyright` | `pyright --outputjson . > audit/pyright.json` | Best VS Code integration, strictest inference |

### Configuration — Maximum Strictness

```toml
# pyproject.toml
[tool.mypy]
python_version = "3.11"
strict = true
warn_return_any = true
warn_unused_configs = true
warn_redundant_casts = true
warn_unused_ignores = true
disallow_untyped_defs = true
disallow_incomplete_defs = true
check_untyped_defs = true
no_implicit_optional = true
show_error_codes = true
```

```json
// pyrightconfig.json
{
  "typeCheckingMode": "strict",
  "reportMissingTypeStubs": true,
  "reportUnusedImport": "error",
  "reportUnusedVariable": "error",
  "reportMissingParameterType": "error",
  "reportUnnecessaryTypeIgnoreComment": "error",
  "pythonVersion": "3.11"
}
```

### Pass Criteria

```
✅ mypy --strict . → Success: no issues found
✅ pyright . → 0 errors, 0 warnings
✅ ty check . → 0 diagnostics
✅ Cross-check: If mypy says clean but pyright finds 5 issues → fix those 5
```

---

## 6. Category 4: Security — SAST <a id="6-sast"></a>

### Tools

| Tool | Install | Command | Unique Strength |
|------|---------|---------|-----------------|
| **Semgrep** | `pip install semgrep` | `semgrep scan --config=auto --json -o audit/semgrep.json .` | Pattern matching, custom rules, multi-language |
| **Bandit** | `pip install bandit` | `bandit -r . -f json -o audit/bandit.json` | Python-specific AST analysis, OWASP coverage |
| **CodeQL** | GitHub CLI or local | `codeql database create db --language=python && codeql database analyze db python-security-and-quality.qls --format=sarif-latest -o audit/codeql.sarif` | Deep dataflow/taint analysis |
| **SonarQube CE** | Docker | `docker run sonarqube:community` + scanner | Broadest rule coverage, tracks tech debt |

### Custom Semgrep Rules for Agentic AI Projects

```yaml
# .semgrep/agentic-safety.yml
rules:
  - id: unbounded-llm-loop
    pattern: |
      while True:
        ...
        $MODEL.generate(...)
        ...
    message: "Unbounded LLM generation loop — add max_iterations guard"
    severity: ERROR
    languages: [python]

  - id: raw-exec-in-agent
    patterns:
      - pattern: exec(...)
      - pattern: eval(...)
      - pattern: subprocess.call($CMD, shell=True, ...)
    message: "Dangerous execution in agent code path — sandbox required"
    severity: ERROR
    languages: [python]

  - id: missing-timeout-on-api-call
    pattern: |
      requests.get(...) 
    pattern-not: |
      requests.get(..., timeout=..., ...)
    message: "HTTP request without timeout — will hang agent"
    severity: WARNING
    languages: [python]

  - id: hardcoded-model-name
    pattern: model="gpt-$VERSION"
    message: "Hardcoded model name — use config/env variable"
    severity: WARNING
    languages: [python]
```

### Pass Criteria

```
✅ semgrep → 0 findings (or all waived in EXCEPTIONS.md)
✅ bandit → 0 high/critical severity
✅ codeql → 0 errors in security-and-quality suite
✅ Cross-check all tools — union of findings must be addressed
```

---

## 7. Category 5: Secret Scanning <a id="7-secrets"></a>

### Why 3 Tools Is Critical Here

Research from NC State University proves Gitleaks and TruffleHog have only ~60% overlap in detected secrets. Running both catches 30%+ more. Adding detect-secrets (Yelp) covers entropy-based patterns the others miss.

### Tools

| Tool | Install | Command | Unique Strength |
|------|---------|---------|-----------------|
| **Gitleaks** | `brew install gitleaks` or binary | `gitleaks detect --source . --report-path audit/gitleaks.json --report-format json` | Fastest (Go), best regex patterns, lowest false positives |
| **TruffleHog v3** | `pip install trufflehog` or binary | `trufflehog filesystem . --json > audit/trufflehog.json` | 800+ detectors, active verification against APIs, scans beyond code |
| **detect-secrets** | `pip install detect-secrets` | `detect-secrets scan . --all-files > audit/detect-secrets.json` | Yelp's tool, baseline methodology, best for entropy detection |

### Scan Scope

```bash
# Scan current files
gitleaks detect --source . --report-path audit/gitleaks-current.json

# Scan entire git history (catches secrets in old commits)
gitleaks detect --source . --report-path audit/gitleaks-history.json --log-opts="--all"

# TruffleHog also scans git history by default
trufflehog git file://. --json > audit/trufflehog-git.json

# detect-secrets baseline
detect-secrets scan . --all-files > .secrets.baseline
detect-secrets audit .secrets.baseline
```

### Pass Criteria

```
✅ gitleaks → 0 findings (current files AND git history)
✅ trufflehog → 0 verified secrets
✅ detect-secrets → 0 unaudited findings
✅ Union of all 3 tools' findings must be addressed
✅ Any found secret must be rotated immediately
```

---

## 8. Category 6: Dependency & Supply Chain <a id="8-dependencies"></a>

### Tools

| Tool | Install | Command | Unique Strength |
|------|---------|---------|-----------------|
| **pip-audit** | `pip install pip-audit` | `pip-audit --format json -o audit/pip-audit.json` | Official PyPA tool, uses OSV database |
| **Safety** | `pip install safety` | `safety check --json > audit/safety.json` | PyUp database, policy engine |
| **Trivy** | Docker or binary | `trivy fs --scanners vuln --format json -o audit/trivy-deps.json .` | Multi-ecosystem (pip, npm, Go, Rust), also scans containers |
| **Snyk** | `npm install -g snyk` | `snyk test --json > audit/snyk.json` | Largest vuln database, remediation advice |

### Additional Checks

```bash
# Lockfile consistency
pip freeze > requirements-actual.txt
diff requirements.txt requirements-actual.txt > audit/lockfile-diff.txt

# License scan
pip install pip-licenses
pip-licenses --format=json --output-file=audit/licenses.json

# Dependency graph
pipdeptree --json > audit/dependency-tree.json

# Check for typosquatting
pip install pipconfused  # or manual review of package names
```

### Pass Criteria

```
✅ pip-audit → 0 known vulnerabilities (critical/high)
✅ safety → 0 known vulnerabilities
✅ trivy → 0 critical/high unaddressed
✅ No unlicensed or GPL-incompatible deps (if project is permissive)
✅ Lockfile matches installed packages exactly
✅ Dependency graph has no circular dependencies
```

---

## 9. Category 7: Dead Code & Unused Imports <a id="9-dead-code"></a>

### Tools

| Tool | Install | Command | Unique Strength |
|------|---------|---------|-----------------|
| **Vulture** | `pip install vulture` | `vulture . --min-confidence 80 > audit/vulture.txt` | Dedicated dead code finder, finds unused functions/classes/variables |
| **Ruff (F401/F841)** | built-in | `ruff check --select F401,F841 .` | Catches unused imports and variables at lint speed |
| **Pylint** | built-in | `pylint --disable=all --enable=unused-import,unused-variable,unused-argument .` | Deep semantic analysis of unused code |

### What "Dead Code" Means

- **Unused imports**: `import os` where os is never used
- **Unused variables**: `x = compute()` where x is never read
- **Unused functions**: `def helper():` never called anywhere
- **Unused classes**: `class OldProcessor:` never instantiated
- **Unreachable code**: Code after `return`, `break`, `raise`, `sys.exit()`
- **Commented-out code**: Large blocks of `# old_function()` left in place

### Pass Criteria

```
✅ vulture → 0 findings at confidence >= 80%
✅ ruff F401/F841 → 0 unused imports/variables
✅ No commented-out code blocks > 5 lines
✅ Every function/class has at least one caller (or is explicitly @public API)
```

---

## 10. Category 8: Test Execution & Coverage <a id="10-testing"></a>

### Tools

| Tool | Install | Command | Unique Strength |
|------|---------|---------|-----------------|
| **pytest** | `pip install pytest pytest-cov pytest-xdist pytest-timeout` | `pytest --cov=src --cov-report=json:audit/coverage.json --cov-report=html:audit/htmlcov -x -v` | Standard Python testing, plugin ecosystem |
| **pytest-xdist** | included above | `pytest -n auto` | Parallel execution, catches race conditions |
| **Hypothesis** | `pip install hypothesis` | Add `@given(...)` decorators | Property-based testing, finds edge cases humans miss |
| **pytest-randomly** | `pip install pytest-randomly` | `pytest -p randomly` | Randomizes test order, catches hidden dependencies |
| **mutmut** | `pip install mutmut` | `mutmut run --paths-to-mutate=src/` | Mutation testing — proves tests actually catch bugs |

### Coverage Configuration

```toml
# pyproject.toml
[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = [
    "--strict-markers",
    "--strict-config",
    "-ra",
    "--tb=short",
    "--timeout=60",
]
markers = [
    "slow: marks tests as slow",
    "integration: marks integration tests",
    "e2e: marks end-to-end tests",
]

[tool.coverage.run]
source = ["src"]
branch = true
parallel = true

[tool.coverage.report]
fail_under = 85
show_missing = true
exclude_lines = [
    "pragma: no cover",
    "if TYPE_CHECKING:",
    "if __name__ == .__main__.:",
]
```

### Test Hierarchy

```
Priority 1: Smoke tests (does it boot?)
Priority 2: Unit tests (does each function work?)
Priority 3: Integration tests (do components work together?)
Priority 4: Contract tests (do APIs match schemas?)
Priority 5: E2E tests (do user flows complete?)
Priority 6: Property tests (do invariants hold for all inputs?)
Priority 7: Mutation tests (do tests actually catch bugs?)
```

### Pass Criteria

```
✅ pytest → 0 failures, 0 errors
✅ 0 skipped tests (unless whitelisted in EXCEPTIONS.md with deadline)
✅ Coverage >= 85% line coverage, >= 75% branch coverage
✅ No flaky tests (run 3x with --count=3, all must pass)
✅ mutmut → >= 70% mutation score (tests catch real bugs)
✅ hypothesis → no falsifying examples found
```

---

## 11. Category 9: GUI / Visual Regression Testing <a id="11-visual"></a>

### Tools

| Tool | Install | Command | Unique Strength |
|------|---------|---------|-----------------|
| **Playwright** | `pip install playwright && playwright install` | `pytest tests/visual/ --browser=chromium` | Microsoft-backed, cross-browser, built-in screenshot comparison |
| **Cypress** | `npm install cypress` | `npx cypress run --spec "tests/visual/**"` | Developer-friendly, time-travel debugging, real browser |
| **BackstopJS** | `npm install -g backstopjs` | `backstop test` | Purpose-built for visual regression, HTML diff reports |
| **Pixeleye** | `npm install pixeleye` | Self-hosted visual review platform | Open-source, multi-browser, CI integration |

### Playwright Visual Test Example

```python
# tests/visual/test_gui_screenshots.py
import pytest
from playwright.sync_api import sync_playwright

@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        yield browser
        browser.close()

class TestVisualRegression:
    """Screenshot every page/component and compare to baselines."""

    def test_main_dashboard(self, browser):
        page = browser.new_page()
        page.goto("http://localhost:8000")
        page.wait_for_load_state("networkidle")
        # Pixel-perfect comparison with 0.1% threshold
        expect(page).to_have_screenshot(
            "dashboard.png",
            max_diff_pixel_ratio=0.001,
            full_page=True
        )

    def test_settings_panel(self, browser):
        page = browser.new_page()
        page.goto("http://localhost:8000/settings")
        page.wait_for_load_state("networkidle")
        expect(page).to_have_screenshot("settings.png", max_diff_pixel_ratio=0.001)

    def test_tool_execution_flow(self, browser):
        page = browser.new_page()
        page.goto("http://localhost:8000")
        page.click('[data-testid="run-tool"]')
        page.wait_for_selector('[data-testid="tool-result"]')
        expect(page).to_have_screenshot("tool-result.png", max_diff_pixel_ratio=0.001)

    def test_error_states(self, browser):
        """Verify error states render correctly."""
        page = browser.new_page()
        page.goto("http://localhost:8000/404")
        expect(page).to_have_screenshot("error-404.png", max_diff_pixel_ratio=0.001)

    def test_console_no_errors(self, browser):
        """Capture and fail on any console errors."""
        errors = []
        page = browser.new_page()
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
        page.goto("http://localhost:8000")
        page.wait_for_load_state("networkidle")
        assert len(errors) == 0, f"Console errors found: {errors}"
```

### BackstopJS Configuration

```json
{
  "id": "super-goose",
  "viewports": [
    { "label": "desktop", "width": 1920, "height": 1080 },
    { "label": "laptop", "width": 1366, "height": 768 }
  ],
  "scenarios": [
    {
      "label": "Dashboard",
      "url": "http://localhost:8000",
      "delay": 3000,
      "misMatchThreshold": 0.1,
      "requireSameDimensions": true
    }
  ],
  "engine": "playwright",
  "report": ["browser", "json"],
  "paths": {
    "bitmaps_reference": "audit/visual/reference",
    "bitmaps_test": "audit/visual/test",
    "html_report": "audit/visual/report"
  }
}
```

### What Visual Testing Catches That Code Tests Don't

- CSS layout breaking (elements overlapping, off-screen, wrong z-index)
- Font rendering issues (missing fonts, wrong sizes, wrong weights)
- Color/theme regressions (wrong colors, dark mode breaks)
- Responsive breakpoint failures
- Animation/transition glitches
- Icon/image loading failures (broken src, wrong paths)
- Tooltip/popover positioning errors
- Scroll behavior regressions

### Pass Criteria

```
✅ Playwright screenshots → all match baselines within 0.1% threshold
✅ BackstopJS → 0 visual regressions across all viewports
✅ Console errors → 0 errors captured during any visual test
✅ All visual test reports saved to audit/visual/
✅ Screenshots captured on failure for forensic analysis
```

---

## 12. Category 10: E2E / Integration Testing <a id="12-e2e"></a>

### Tools

| Tool | Install | Command | Unique Strength |
|------|---------|---------|-----------------|
| **Playwright** | `pip install playwright` | `pytest tests/e2e/ --tracing=on` | Full browser automation, network interception, traces |
| **pytest + httpx** | `pip install httpx` | `pytest tests/integration/` | Async HTTP testing, direct API validation |
| **Selenium** | `pip install selenium` | `pytest tests/e2e_selenium/` | Widest browser support, longest track record |

### E2E Test Scenarios for Super-Goose

```python
# tests/e2e/test_core_workflows.py
"""
Every core workflow must be exercised end-to-end.
These are the "happy path" scenarios that prove the system works.
"""

class TestGooseCorePaths:
    """Test all 16 tools work end-to-end."""

    def test_agent_boots_and_responds(self, goose_server):
        """Agent starts, accepts input, returns structured response."""
        response = goose_server.send("What tools do you have?")
        assert response.status == "success"
        assert len(response.tools) >= 16

    def test_tool_execution_roundtrip(self, goose_server):
        """Each tool: invoke → execute → return valid result."""
        for tool in goose_server.list_tools():
            result = goose_server.invoke_tool(tool.name, tool.test_input)
            assert result.status != "error", f"Tool {tool.name} failed: {result.error}"

    def test_mcp_server_connectivity(self, goose_server):
        """All MCP servers respond to health checks."""
        for server in goose_server.mcp_servers:
            health = server.health_check()
            assert health.status == "healthy", f"MCP server {server.name} unhealthy"

    def test_langgraph_state_transitions(self, goose_server):
        """StateGraph completes a full cycle without hanging."""
        result = goose_server.run_graph(
            input="Simple test task",
            timeout=30,
            max_steps=10
        )
        assert result.final_state is not None
        assert not result.timed_out

    def test_graceful_shutdown(self, goose_server):
        """Agent shuts down cleanly, no orphan processes."""
        goose_server.shutdown(timeout=10)
        assert goose_server.process.returncode == 0
        assert len(goose_server.orphan_processes()) == 0
```

### Pass Criteria

```
✅ All E2E tests pass with real dependencies (not mocked)
✅ Every tool responds successfully to at least one real invocation
✅ All MCP servers pass health checks
✅ StateGraph completes without timeout or infinite loop
✅ Clean shutdown with exit code 0
✅ Playwright traces saved for all failures
```

---

## 13. Category 11: Runtime & Performance <a id="13-runtime"></a>

### Tools

| Tool | Install | Command | Unique Strength |
|------|---------|---------|-----------------|
| **py-spy** | `pip install py-spy` | `py-spy record -o audit/profile.svg -- python main.py` | Sampling profiler, flame graphs, no code changes needed |
| **memray** | `pip install memray` | `memray run -o audit/memray.bin main.py && memray flamegraph audit/memray.bin` | Memory profiler, finds leaks, Bloomberg-developed |
| **Scalene** | `pip install scalene` | `scalene --json --outfile audit/scalene.json main.py` | CPU + memory + GPU profiling in one tool |
| **Locust** | `pip install locust` | `locust -f tests/load/locustfile.py --headless -u 10 -r 2 --run-time 60s` | Load testing for APIs/services |

### Memory Leak Detection

```python
# tests/runtime/test_memory_leaks.py
import tracemalloc
import gc

def test_no_memory_leak_in_agent_loop():
    """Run 100 iterations, verify memory doesn't grow unboundedly."""
    tracemalloc.start()
    agent = create_agent()

    initial = tracemalloc.get_traced_memory()[0]
    for _ in range(100):
        agent.process("test input")
        gc.collect()

    final = tracemalloc.get_traced_memory()[0]
    growth = final - initial
    # Allow max 50MB growth over 100 iterations
    assert growth < 50 * 1024 * 1024, f"Memory grew by {growth / 1024 / 1024:.1f}MB"
    tracemalloc.stop()
```

### Pass Criteria

```
✅ No memory leaks detected (memray + tracemalloc)
✅ No CPU hotspots > 50% in single function (scalene)
✅ Response time p95 < 5s for standard operations (locust)
✅ No unbounded queues growing during sustained load
✅ All background tasks support cancellation
✅ All network calls have timeouts configured
```

---

## 14. Category 12: Documentation & Completeness <a id="14-docs"></a>

### Tools

| Tool | Install | Command | Unique Strength |
|------|---------|---------|-----------------|
| **pydocstyle** | `pip install pydocstyle` | `pydocstyle src/ > audit/pydocstyle.txt` | Checks docstring conventions (Google/NumPy/Sphinx) |
| **interrogate** | `pip install interrogate` | `interrogate -vv src/ --fail-under 80` | Measures docstring coverage percentage |
| **doc8** | `pip install doc8` | `doc8 docs/` | RST/Markdown doc linting |

### Required Documentation Files

```
✅ README.md — what, why, how to install/run/test
✅ ARCHITECTURE.md — components, data flow, Mermaid diagrams
✅ CHANGELOG.md — versioned changes
✅ SECURITY.md — threat model, risky surfaces
✅ CONTRIBUTING.md — how to contribute
✅ All public functions/classes have docstrings
✅ All MCP servers have endpoint documentation
✅ All tools have usage examples
```

### Pass Criteria

```
✅ interrogate → >= 80% docstring coverage
✅ pydocstyle → 0 violations (Google style)
✅ All required docs exist and are not stale
✅ All Mermaid diagrams render correctly
```

---

## 15. Category 13: Docker & Infrastructure <a id="15-docker"></a>

### Tools

| Tool | Install | Command | Unique Strength |
|------|---------|---------|-----------------|
| **Hadolint** | `docker run hadolint/hadolint` | `hadolint Dockerfile > audit/hadolint.txt` | Dockerfile best-practices linter |
| **Trivy** | Binary or Docker | `trivy image super-goose:latest --format json -o audit/trivy-image.json` | Container vulnerability scanner |
| **Dockle** | Binary | `dockle super-goose:latest > audit/dockle.txt` | CIS Benchmark for Docker images |
| **docker compose config** | built-in | `docker compose config > audit/compose-validated.yml` | Validates compose file syntax |

### Pass Criteria

```
✅ hadolint → 0 errors, 0 warnings (DL-level)
✅ trivy image → 0 critical/high vulnerabilities
✅ dockle → PASS on CIS benchmarks
✅ docker compose config → validates without errors
✅ Container builds from scratch (no cache) successfully
✅ Container starts and passes health check
```

---

## 16. Category 14: Anti-Pattern & Forbidden-Pattern Scanning <a id="16-antipattern"></a>

### Custom Forbidden Pattern Scanner

```bash
#!/bin/bash
# scripts/scan-forbidden-patterns.sh
# Scans for patterns that should NEVER exist in production code

set -euo pipefail

AUDIT_DIR="audit/forbidden-patterns"
mkdir -p "$AUDIT_DIR"
FAILURES=0

echo "=== Scanning for forbidden patterns ==="

# Category: Placeholders and stubs
echo "--- Placeholders/Stubs ---"
grep -rn --include="*.py" -i \
  -e "TODO" -e "FIXME" -e "HACK" -e "XXX" \
  -e "STUB" -e "PLACEHOLDER" -e "NOT_IMPLEMENTED" \
  -e "MOCK_DATA" -e "FAKE_DATA" -e "SAMPLE_DATA" \
  -e "coming soon" -e "not yet implemented" \
  -e "implement later" -e "implement me" \
  . > "$AUDIT_DIR/placeholders.txt" 2>/dev/null || true

if [ -s "$AUDIT_DIR/placeholders.txt" ]; then
  echo "❌ FAIL: Found placeholders/stubs"
  FAILURES=$((FAILURES + 1))
else
  echo "✅ PASS: No placeholders found"
fi

# Category: Empty catch blocks
echo "--- Empty catch blocks ---"
grep -rn --include="*.py" -A2 "except.*:" . | \
  grep -B1 "pass$" > "$AUDIT_DIR/empty-catches.txt" 2>/dev/null || true

if [ -s "$AUDIT_DIR/empty-catches.txt" ]; then
  echo "❌ FAIL: Found empty catch blocks"
  FAILURES=$((FAILURES + 1))
else
  echo "✅ PASS: No empty catch blocks"
fi

# Category: Hardcoded credentials
echo "--- Hardcoded credentials ---"
grep -rn --include="*.py" -i \
  -e "password\s*=" -e "passwd\s*=" -e "secret\s*=" \
  -e "api_key\s*=" -e "apikey\s*=" -e "token\s*=" \
  . | grep -v "\.env" | grep -v "test_" | grep -v "#" \
  > "$AUDIT_DIR/hardcoded-creds.txt" 2>/dev/null || true

if [ -s "$AUDIT_DIR/hardcoded-creds.txt" ]; then
  echo "⚠️  REVIEW: Potential hardcoded credentials (may be false positives)"
  FAILURES=$((FAILURES + 1))
fi

# Category: Debug/print statements in production
echo "--- Debug statements ---"
grep -rn --include="*.py" \
  -e "print(" -e "breakpoint()" -e "pdb.set_trace()" \
  -e "import pdb" -e "import ipdb" \
  src/ > "$AUDIT_DIR/debug-statements.txt" 2>/dev/null || true

if [ -s "$AUDIT_DIR/debug-statements.txt" ]; then
  echo "❌ FAIL: Found debug statements in production code"
  FAILURES=$((FAILURES + 1))
else
  echo "✅ PASS: No debug statements"
fi

# Category: Dangerous patterns in agent code
echo "--- Dangerous agent patterns ---"
grep -rn --include="*.py" \
  -e "eval(" -e "exec(" \
  -e "shell=True" \
  -e "__import__(" \
  -e "os.system(" \
  . > "$AUDIT_DIR/dangerous-patterns.txt" 2>/dev/null || true

if [ -s "$AUDIT_DIR/dangerous-patterns.txt" ]; then
  echo "⚠️  REVIEW: Dangerous patterns found (must be sandboxed)"
fi

# Category: Mock-only tests
echo "--- Mock-heavy tests ---"
grep -rn --include="*.py" -c "@mock\|@patch\|MagicMock\|AsyncMock" tests/ | \
  awk -F: '$2 > 5 {print $0}' > "$AUDIT_DIR/mock-heavy-tests.txt" 2>/dev/null || true

if [ -s "$AUDIT_DIR/mock-heavy-tests.txt" ]; then
  echo "⚠️  REVIEW: Tests with >5 mocks — need integration test companion"
fi

# Category: Return None / pass-only functions
echo "--- Stub functions ---"
python3 -c "
import ast, sys, os
for root, dirs, files in os.walk('src'):
    for f in files:
        if f.endswith('.py'):
            path = os.path.join(root, f)
            try:
                tree = ast.parse(open(path).read())
                for node in ast.walk(tree):
                    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        body = node.body
                        if len(body) == 1:
                            stmt = body[0]
                            if isinstance(stmt, ast.Pass):
                                print(f'{path}:{node.lineno}: {node.name}() is pass-only stub')
                            elif isinstance(stmt, ast.Return) and stmt.value is None:
                                print(f'{path}:{node.lineno}: {node.name}() returns None only')
                            elif isinstance(stmt, ast.Expr) and isinstance(stmt.value, (ast.Constant, ast.Str)):
                                # docstring-only function
                                print(f'{path}:{node.lineno}: {node.name}() is docstring-only stub')
            except:
                pass
" > "$AUDIT_DIR/stub-functions.txt" 2>/dev/null

if [ -s "$AUDIT_DIR/stub-functions.txt" ]; then
  echo "❌ FAIL: Found stub/empty functions"
  FAILURES=$((FAILURES + 1))
else
  echo "✅ PASS: No stub functions"
fi

echo ""
echo "=== Forbidden Pattern Scan Complete ==="
echo "Total categories with findings: $FAILURES"
echo "Full reports in: $AUDIT_DIR/"
exit $FAILURES
```

### Semgrep Custom Rules for Anti-Patterns

```yaml
# .semgrep/anti-patterns.yml
rules:
  - id: empty-except-pass
    pattern: |
      try:
          ...
      except ...:
          pass
    message: "Empty except block swallows errors silently"
    severity: ERROR
    languages: [python]

  - id: bare-except
    pattern: |
      try:
          ...
      except:
          ...
    message: "Bare except catches SystemExit, KeyboardInterrupt — use specific exception"
    severity: ERROR
    languages: [python]

  - id: return-none-placeholder
    pattern: |
      def $FUNC(...):
          return None
    message: "Function returns None — likely a placeholder/stub"
    severity: WARNING
    languages: [python]

  - id: unused-ui-handler
    pattern: |
      def $HANDLER(self, event):
          pass
    message: "UI event handler does nothing — remove or implement"
    severity: ERROR
    languages: [python]

  - id: mock-without-integration-test
    patterns:
      - pattern: |
          @mock.patch(...)
          def test_$NAME(...):
              ...
      - metavariable-regex:
          metavariable: $NAME
          regex: "^(?!.*integration).*$"
    message: "Mock-only test without integration companion"
    severity: WARNING
    languages: [python]
```

### Pass Criteria

```
✅ 0 TODOs/FIXMEs/STUBs/PLACEHOLDERs in production code (src/)
✅ 0 empty catch blocks
✅ 0 pass-only or return-None-only functions in production code
✅ 0 print()/breakpoint()/pdb statements in production code
✅ All eval()/exec()/shell=True instances documented and sandboxed
✅ Every mock-heavy test has an integration test companion
```

---

## 17. Sweep Methodology — 3 Sweeps <a id="17-sweeps"></a>

### Sweep 1 — Inventory & Mapping (NO FIXES)

**Goal**: Understand what exists. Do not change anything.

**Actions**:
1. Generate file tree: `find . -type f | head -5000 > audit/00_inventory/file_tree.txt`
2. Detect stacks: languages, frameworks, tools → `audit/00_inventory/stacks.md`
3. Map entrypoints: frontend, backend, workers, CLI, MCP servers → `audit/00_inventory/entrypoints.md`
4. Generate dependency graph: `pipdeptree --graph-output png > audit/00_inventory/deps.png`
5. Count lines per file type: `cloc . --json > audit/00_inventory/cloc.json`
6. List all config files: `.env`, `pyproject.toml`, `docker-compose.yml`, etc.

**Output**: `/audit/00_inventory/` — reference only, no changes made

### Sweep 2 — Diagnostics (RUN EVERYTHING, RECORD FAILURES)

**Goal**: Run every tool, record every finding. Do not fix anything yet.

**Actions**: Run ALL tools from the Tool Matrix. Save every output to `/audit/01_diagnostics/`.

```bash
# Run all tools in sequence, capturing all output
mkdir -p audit/01_diagnostics

# Formatting
ruff format --check . > audit/01_diagnostics/ruff-format.txt 2>&1 || true
black --check . > audit/01_diagnostics/black.txt 2>&1 || true

# Linting
ruff check . --output-format=json > audit/01_diagnostics/ruff-lint.json 2>&1 || true
pylint --output-format=json src/ > audit/01_diagnostics/pylint.json 2>&1 || true
flake8 . > audit/01_diagnostics/flake8.txt 2>&1 || true

# Type checking
mypy --strict . > audit/01_diagnostics/mypy.txt 2>&1 || true
pyright . > audit/01_diagnostics/pyright.txt 2>&1 || true

# Security
semgrep scan --config=auto --json . > audit/01_diagnostics/semgrep.json 2>&1 || true
bandit -r . -f json > audit/01_diagnostics/bandit.json 2>&1 || true

# Secrets
gitleaks detect --source . --report-path audit/01_diagnostics/gitleaks.json 2>&1 || true
trufflehog filesystem . --json > audit/01_diagnostics/trufflehog.json 2>&1 || true
detect-secrets scan . > audit/01_diagnostics/detect-secrets.json 2>&1 || true

# Dependencies
pip-audit --format json > audit/01_diagnostics/pip-audit.json 2>&1 || true
safety check --json > audit/01_diagnostics/safety.json 2>&1 || true

# Dead code
vulture . --min-confidence 80 > audit/01_diagnostics/vulture.txt 2>&1 || true

# Tests
pytest --tb=short -q > audit/01_diagnostics/pytest.txt 2>&1 || true

# Docs
interrogate -vv src/ > audit/01_diagnostics/interrogate.txt 2>&1 || true

# Docker
hadolint Dockerfile > audit/01_diagnostics/hadolint.txt 2>&1 || true

# Forbidden patterns
bash scripts/scan-forbidden-patterns.sh > audit/01_diagnostics/forbidden.txt 2>&1 || true
```

**Output**: `/audit/01_diagnostics/` + create `audit/01_diagnostics/failures.md` ranked by severity:
1. **BLOCKING** — Cannot build/run at all
2. **CRITICAL** — Security vulnerabilities, leaked secrets
3. **HIGH** — Test failures, type errors, unused code
4. **MEDIUM** — Lint warnings, formatting inconsistencies
5. **LOW** — Doc coverage gaps, style preferences

### Sweep 3 — Fix & Verify (FIX IN PRIORITY ORDER, RE-RUN GATES)

**Goal**: Fix everything, highest priority first. After each fix batch, re-run the relevant gate.

**Fix Order** (highest leverage first):
1. **Secrets** → Rotate any found credentials IMMEDIATELY
2. **Dependencies** → Fix install/build issues, resolve vulnerabilities
3. **Build** → Make it compile/start
4. **Type errors** → Fix strict type checking issues
5. **Test failures** → Fix broken tests, add missing tests
6. **Lint/format** → Clean up warnings
7. **Dead code** → Remove unused code
8. **Anti-patterns** → Fix stubs, placeholders, empty catches
9. **Visual regressions** → Update baselines or fix UI
10. **Documentation** → Add missing docstrings, update docs

**After each fix batch**:
```bash
# Re-run the relevant gate
pytest -x  # stop on first failure
ruff check .
mypy --strict .
# Save verification log
cp audit/01_diagnostics/tool.json audit/02_fixes/verification/tool-after-fix-N.json
```

**Output**:
- `/audit/02_fixes/patches/` — diffs of all changes
- `/audit/02_fixes/verification_logs/` — tool output after fixes
- `/audit/FINAL_REPORT.md` — Before/After comparison

---

## 18. Audit Output Structure <a id="18-outputs"></a>

```
audit/
├── 00_inventory/
│   ├── file_tree.txt
│   ├── stacks.md
│   ├── entrypoints.md
│   ├── dependency_graph.png
│   └── cloc.json
├── 01_diagnostics/
│   ├── ruff-format.txt
│   ├── ruff-lint.json
│   ├── pylint.json
│   ├── flake8.txt
│   ├── mypy.txt
│   ├── pyright.txt
│   ├── semgrep.json
│   ├── bandit.json
│   ├── gitleaks.json
│   ├── trufflehog.json
│   ├── detect-secrets.json
│   ├── pip-audit.json
│   ├── safety.json
│   ├── vulture.txt
│   ├── pytest.txt
│   ├── interrogate.txt
│   ├── hadolint.txt
│   ├── forbidden.txt
│   └── failures.md          ← ranked summary
├── 02_fixes/
│   ├── patches/             ← git diffs
│   └── verification_logs/   ← re-run results
├── visual/
│   ├── reference/           ← baseline screenshots
│   ├── test/                ← current screenshots
│   └── report/              ← HTML diff report
├── FINAL_REPORT.md           ← Before/After evidence
├── EXCEPTIONS.md             ← Justified skips with owners + deadlines
└── TOOL_VERSIONS.md          ← Exact versions of all tools used
```

---

## 19. Hard Pass/Fail Gates <a id="19-gates"></a>

**ALL of these must pass before declaring "audit complete":**

| Gate | Tool(s) | Criterion |
|------|---------|-----------|
| ✅ Installs clean | `pip install -e .` | Exit code 0 from clean venv |
| ✅ Builds clean | `python -m build` or Docker build | Exit code 0, no warnings |
| ✅ Starts clean | `python main.py` or `docker compose up` | Health check passes within 30s |
| ✅ Format clean | Ruff + Black | 0 files would be reformatted |
| ✅ Lint clean | Ruff + Pylint + Flake8 | 0 errors, 0 warnings |
| ✅ Type clean | Mypy + Pyright (+ ty if available) | 0 errors |
| ✅ Tests green | pytest | 0 failures, 0 errors, 0 skipped |
| ✅ Coverage met | pytest-cov | >= 85% lines, >= 75% branches |
| ✅ SAST clean | Semgrep + Bandit | 0 high/critical findings |
| ✅ Secrets clean | Gitleaks + TruffleHog + detect-secrets | 0 findings (or rotated + documented) |
| ✅ Deps clean | pip-audit + Safety + Trivy | 0 critical/high unaddressed |
| ✅ Dead code clean | Vulture + Ruff F401 | 0 unused code |
| ✅ Visual clean | Playwright + BackstopJS | 0 regressions, 0 console errors |
| ✅ Anti-patterns clean | Custom scanner + Semgrep rules | 0 stubs, 0 placeholders, 0 empty catches |
| ✅ Docker clean | Hadolint + Dockle + Trivy image | 0 critical/high findings |
| ✅ Docs complete | interrogate + pydocstyle | >= 80% coverage |
| ✅ Shutdown clean | E2E test | Exit code 0, 0 orphan processes |

---

## 20. Agent Instructions — Drop-In Prompt <a id="20-agent-prompt"></a>

Copy-paste the following into Claude Code, Goose, or any coding agent:

```markdown
# CODEBASE AUDIT — IRONCLAD SPECIFICATION

You are performing a full codebase audit of `G:\goose` (Super-Goose project).

## NON-NEGOTIABLES
- NO SKIPPING: Every file, every line is in scope
- NO "pre-existing" or "not my task" excuses
- PROOF REQUIRED: Every claim backed by tool output in `/audit/`
- TRIPLE REDUNDANCY: Use 3+ tools per category

## METHODOLOGY
Perform THREE sweeps in order:

### SWEEP 1 — INVENTORY (no fixes)
Map: file tree, stacks, entrypoints, dependency graph, line counts
Output: `/audit/00_inventory/`

### SWEEP 2 — DIAGNOSTICS (run everything, record failures)
Run ALL of these tools, save output to `/audit/01_diagnostics/`:

FORMATTING: ruff format --check . | black --check .
LINTING: ruff check . | pylint src/ | flake8 .
TYPE CHECK: mypy --strict . | pyright .
SAST: semgrep scan --config=auto . | bandit -r .
SECRETS: gitleaks detect | trufflehog filesystem . | detect-secrets scan .
DEPS: pip-audit | safety check | trivy fs .
DEAD CODE: vulture . --min-confidence 80 | ruff check --select F401,F841 .
TESTS: pytest --cov=src -v
DOCS: interrogate -vv src/ | pydocstyle src/
DOCKER: hadolint Dockerfile | trivy image
ANTI-PATTERNS: grep for TODO/STUB/PLACEHOLDER/FIXME + empty catches + pass-only functions

Create `/audit/01_diagnostics/failures.md` ranked: BLOCKING > CRITICAL > HIGH > MEDIUM > LOW

### SWEEP 3 — FIX & VERIFY
Fix in this order: secrets → deps → build → types → tests → lint → dead code → anti-patterns → visual → docs
After each fix batch, re-run relevant gate and save to `/audit/02_fixes/verification_logs/`
Create `/audit/FINAL_REPORT.md` with Before/After evidence

## EXIT CRITERIA (ALL must pass)
✅ Installs from clean venv
✅ Builds without warnings
✅ Starts and passes health check
✅ ruff + black → 0 format issues
✅ ruff + pylint + flake8 → 0 lint issues
✅ mypy + pyright → 0 type errors
✅ pytest → 0 failures, coverage >= 85%
✅ semgrep + bandit → 0 high/critical
✅ gitleaks + trufflehog + detect-secrets → 0 secrets
✅ pip-audit + safety → 0 critical/high vulns
✅ vulture → 0 dead code
✅ 0 TODO/STUB/PLACEHOLDER in production code
✅ 0 empty catch blocks
✅ 0 pass-only functions
✅ All MCP servers respond to health checks
✅ All 16 tools execute successfully

## EXCEPTION RULES
Any skipped check MUST be listed in `/audit/EXCEPTIONS.md` with:
- Reason why it cannot be fixed now
- Risk assessment (low/medium/high)
- Owner responsible
- Deadline for resolution
- What would be required to remove the exception
```

---

## 21. Installation Script <a id="21-install"></a>

```bash
#!/bin/bash
# scripts/install-audit-tools.sh
# Installs ALL audit tools for the Super-Goose Ironclad Audit

set -euo pipefail

echo "=== Installing Super-Goose Audit Toolchain ==="

# Python tools
echo "--- Python tools ---"
pip install --break-system-packages \
  ruff \
  black \
  autopep8 \
  pylint \
  flake8 flake8-bugbear flake8-comprehensions flake8-simplify \
  mypy \
  bandit \
  semgrep \
  vulture \
  pydocstyle \
  interrogate \
  doc8 \
  pip-audit \
  safety \
  detect-secrets \
  pytest pytest-cov pytest-xdist pytest-timeout pytest-randomly \
  hypothesis \
  mutmut \
  playwright \
  httpx \
  py-spy \
  memray \
  scalene \
  locust \
  pipdeptree \
  pip-licenses \
  prospector[with_everything] \
  isort

# Playwright browsers
echo "--- Playwright browsers ---"
playwright install chromium firefox

# Node.js tools
echo "--- Node.js tools ---"
npm install -g \
  pyright \
  backstopjs

# Binary tools (check if available)
echo "--- Binary tools ---"

# Gitleaks
if ! command -v gitleaks &> /dev/null; then
  echo "Installing Gitleaks..."
  GITLEAKS_VERSION="8.18.4"
  curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" | tar xz -C /usr/local/bin gitleaks
fi

# TruffleHog
if ! command -v trufflehog &> /dev/null; then
  echo "Installing TruffleHog..."
  curl -sSfL https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/scripts/install.sh | sh -s -- -b /usr/local/bin
fi

# Trivy
if ! command -v trivy &> /dev/null; then
  echo "Installing Trivy..."
  curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
fi

# Hadolint
if ! command -v hadolint &> /dev/null; then
  echo "Installing Hadolint..."
  curl -sSfL "https://github.com/hadolint/hadolint/releases/latest/download/hadolint-Linux-x86_64" -o /usr/local/bin/hadolint
  chmod +x /usr/local/bin/hadolint
fi

# Dockle
if ! command -v dockle &> /dev/null; then
  echo "Installing Dockle..."
  DOCKLE_VERSION=$(curl -s "https://api.github.com/repos/goodwithtech/dockle/releases/latest" | grep '"tag_name":' | sed -E 's/.*"v([^"]+)".*/\1/')
  curl -sSfL "https://github.com/goodwithtech/dockle/releases/download/v${DOCKLE_VERSION}/dockle_${DOCKLE_VERSION}_Linux-64bit.tar.gz" | tar xz -C /usr/local/bin dockle
fi

# cloc (count lines of code)
if ! command -v cloc &> /dev/null; then
  echo "Installing cloc..."
  apt-get install -y cloc 2>/dev/null || brew install cloc 2>/dev/null || pip install cloc
fi

echo ""
echo "=== Audit Toolchain Installed ==="
echo ""
echo "Verify with:"
echo "  ruff --version"
echo "  black --version"
echo "  mypy --version"
echo "  pyright --version"
echo "  semgrep --version"
echo "  bandit --version"
echo "  gitleaks version"
echo "  trufflehog --version"
echo "  trivy --version"
echo "  hadolint --version"
echo "  playwright --version"
echo ""
echo "Total tools installed: 35+"
echo "Ready for Ironclad Audit. Run: bash scripts/run-full-audit.sh"
```

---

## Quick Reference: Tool Count Summary

| Category | Tool Count | Open Source? | Total Install Size |
|----------|-----------|--------------|-------------------|
| Formatting | 3 | ✅ All | ~50MB |
| Linting | 4 | ✅ All | ~100MB |
| Type Checking | 3 | ✅ All | ~200MB |
| SAST Security | 4 | ✅ All | ~300MB |
| Secret Scanning | 3 | ✅ All | ~100MB |
| Dependency Scan | 4 | ✅ 3/4 | ~50MB |
| Dead Code | 3 | ✅ All | ~10MB |
| Testing | 5 | ✅ All | ~100MB |
| Visual/GUI | 4 | ✅ All | ~500MB (browsers) |
| E2E | 3 | ✅ All | (shared with visual) |
| Runtime/Perf | 4 | ✅ All | ~50MB |
| Documentation | 3 | ✅ All | ~20MB |
| Docker | 4 | ✅ All | ~100MB |
| Anti-Patterns | 3 | ✅ All | (shared with lint/SAST) |
| **TOTAL** | **50+** | **All open-source** | **~1.5GB** |

---

## Why This Works When "Nothing Else Has"

1. **Triple redundancy** — No single tool can be gamed or have blind spots
2. **Proof-based** — Every claim requires saved tool output, not "I checked"
3. **Priority-ordered fixes** — Secrets first, polish last
4. **No skip escape hatch** — EXCEPTIONS.md requires owner, deadline, risk assessment
5. **Visual testing** — Catches what code-only analysis misses (layout, rendering, CSS)
6. **Anti-pattern scanning** — Custom scripts catch the exact patterns AI agents love to leave behind (stubs, TODOs, empty handlers)
7. **Mutation testing** — Proves tests actually work, not just pass
8. **Memory/performance profiling** — Catches resource leaks that only manifest at runtime
9. **Before/After evidence** — FINAL_REPORT.md proves the audit did something real

---

*This specification is designed for use with Goose, Claude Code, Cursor, Windsurf, or any agentic coding assistant. The agent MUST follow the 3-sweep methodology and produce all artifacts in `/audit/` with timestamps.*
