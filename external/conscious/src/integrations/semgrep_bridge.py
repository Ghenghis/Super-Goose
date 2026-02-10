"""
Semgrep Bridge - Static analysis and policy enforcement for Super-Goose.

Wraps the ``semgrep`` CLI (Python package + binary) via subprocess to provide
static analysis scanning, security policy checks, autofix, diff-based scanning,
and CI gate enforcement for Goose agents through the Conscious bridge layer.

Semgrep is a fast, open-source static analysis tool that supports 30+
languages.  It uses pattern-matching rules (written in YAML) to find bugs,
enforce coding standards, and detect security vulnerabilities.

Bridge operations:
    scan            - Run Semgrep against a directory with rules
    check_policy    - Check code against a policy file (default: .semgrep/stage6.yml)
    autofix         - Auto-fix violations using Semgrep's autofix capability
    scan_diff       - Scan only changed code (for pre-commit hooks)
    ci_gate         - CI blocking check that returns pass/fail

Binary resolution order:
    1. ``semgrep`` on PATH
    2. ``python -m semgrep`` (module invocation)

Policy file:
    .semgrep/stage6.yml in the repository root provides baseline rules for
    AI-generated code safety (no eval, no exec, no hardcoded secrets, etc.).

Severity mapping:
    INFO    -> allow  (informational, no action required)
    WARNING -> warn   (review recommended)
    ERROR   -> block  (must fix before merge)

Reference:
    Semgrep docs:   https://semgrep.dev/docs
    Semgrep GitHub: https://github.com/semgrep/semgrep
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

# ---------------------------------------------------------------------------
# Resource coordination
# ---------------------------------------------------------------------------

try:
    from integrations.resource_coordinator import get_coordinator
except ImportError:
    get_coordinator = None  # type: ignore[assignment,misc]

# ---------------------------------------------------------------------------
# Registry import
# ---------------------------------------------------------------------------

try:
    from integrations.registry import ToolStatus
except ImportError:
    @dataclass
    class ToolStatus:  # type: ignore[no-redef]
        name: str
        available: bool
        healthy: bool
        error: Optional[str] = None
        version: Optional[str] = None


logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Repository root (4 levels up from this file)
REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
# Equivalent: G:/goose

# Default policy file location
DEFAULT_POLICY_FILE = REPO_ROOT / ".semgrep" / "stage6.yml"

# Subprocess timeout defaults (seconds)
SCAN_TIMEOUT = 300      # 5 minutes -- large codebases
AUTOFIX_TIMEOUT = 180   # 3 minutes
DIFF_TIMEOUT = 60       # 1 minute -- diff scans are small
CI_TIMEOUT = 300        # 5 minutes -- full CI scan

# Maximum findings to return from a single scan
DEFAULT_MAX_FINDINGS = 200

# Severity mapping: Semgrep severity -> action level
SEVERITY_MAP: dict[str, str] = {
    "INFO": "allow",
    "WARNING": "warn",
    "ERROR": "block",
}

# ---------------------------------------------------------------------------
# Module-level state (lazy init)
# ---------------------------------------------------------------------------

_initialized: bool = False
_init_lock = threading.Lock()
_semgrep_cmd: Optional[list[str]] = None
_semgrep_version: Optional[str] = None


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------

def init() -> dict[str, Any]:
    """Initialize the Semgrep bridge.

    Performs lazy discovery of the ``semgrep`` CLI and caches the
    result for subsequent calls.  Safe to call multiple times.

    Resolution order:
        1. ``semgrep`` on system PATH
        2. ``python -m semgrep`` (module invocation)

    Returns:
        dict with keys:
            success (bool):   True if semgrep is available.
            command (list):   Command list to invoke semgrep, or None.
            version (str):    Version string, or None.
            error (str):      Error message if not found, else None.
    """
    global _initialized, _semgrep_cmd, _semgrep_version

    with _init_lock:
        if _initialized:
            return {
                "success": _semgrep_cmd is not None,
                "command": _semgrep_cmd,
                "version": _semgrep_version,
                "error": None if _semgrep_cmd else "semgrep not found",
            }

        cmd: Optional[list[str]] = None

        # 1. Try semgrep on PATH
        exe = shutil.which("semgrep")
        if exe:
            cmd = [exe]

        # 2. Try python -m semgrep
        if cmd is None:
            try:
                result = subprocess.run(
                    [sys.executable, "-m", "semgrep", "--version"],
                    capture_output=True, text=True, timeout=15,
                )
                if result.returncode == 0:
                    cmd = [sys.executable, "-m", "semgrep"]
                    _semgrep_version = result.stdout.strip()
            except (subprocess.TimeoutExpired, OSError):
                pass

        # 3. Get version if found via direct executable
        if cmd and _semgrep_version is None:
            try:
                result = subprocess.run(
                    cmd + ["--version"],
                    capture_output=True, text=True, timeout=15,
                )
                if result.returncode == 0:
                    _semgrep_version = result.stdout.strip()
            except (subprocess.TimeoutExpired, OSError):
                pass

        _semgrep_cmd = cmd
        _initialized = True

        if _semgrep_cmd:
            logger.info(
                "Semgrep bridge initialized: %s (v%s)",
                " ".join(_semgrep_cmd), _semgrep_version,
            )
        else:
            logger.warning(
                "Semgrep bridge: semgrep not found. "
                "Install with: pip install semgrep"
            )

        return {
            "success": _semgrep_cmd is not None,
            "command": _semgrep_cmd,
            "version": _semgrep_version,
            "error": None if _semgrep_cmd else "semgrep not found",
        }


# ---------------------------------------------------------------------------
# Status / capabilities
# ---------------------------------------------------------------------------

def status() -> ToolStatus:
    """Return the current health status of the Semgrep tool.

    Returns:
        ToolStatus with availability and version information.
    """
    state = init()
    return ToolStatus(
        name="Semgrep",
        available=state["success"],
        healthy=state["success"],
        version=state["version"],
        error=state["error"],
    )


def capabilities() -> list[str]:
    """Return the list of operations this bridge supports.

    Returns:
        List of capability strings.
    """
    return [
        "static_analysis",
        "security_scan",
        "policy_check",
        "custom_rules",
        "autofix",
        "ci_gate",
    ]


# ---------------------------------------------------------------------------
# Core operations
# ---------------------------------------------------------------------------

async def scan(
    target: str,
    config: Optional[str] = None,
    severity: Optional[str] = None,
    json_output: bool = True,
    max_findings: int = DEFAULT_MAX_FINDINGS,
) -> dict[str, Any]:
    """Scan a directory or file with Semgrep rules.

    Runs Semgrep against the specified target using the given
    configuration (rule file, directory, or registry string).

    Args:
        target: Path to the directory or file to scan.
        config: Semgrep config string.  Can be:
            - A path to a YAML rules file
            - A path to a directory containing rules
            - A Semgrep registry string (e.g. ``"p/python"``)
            - ``"auto"`` for automatic rule selection
            If None, uses the default Stage 6 policy file.
        severity: Minimum severity to report (``"INFO"``, ``"WARNING"``,
            ``"ERROR"``).  If None, all severities are included.
        json_output: Whether to request JSON output (default True).
        max_findings: Maximum number of findings to return.

    Returns:
        dict with keys:
            success (bool):    True if the scan completed.
            findings (list):   List of finding dicts.
            count (int):       Number of findings.
            target (str):      The target that was scanned.
            config (str):      The config that was used.
            severity_summary (dict): Count of findings per severity.
            error (str):       Error message if failed, else None.
    """
    state = init()
    if not state["success"]:
        return _error_not_installed()

    target_path = Path(target)
    if not target_path.exists():
        return {
            "success": False,
            "findings": [],
            "count": 0,
            "target": target,
            "config": config,
            "severity_summary": {},
            "error": f"Target not found: {target}",
        }

    # Resolve config
    effective_config = config
    if effective_config is None:
        if DEFAULT_POLICY_FILE.exists():
            effective_config = str(DEFAULT_POLICY_FILE)
        else:
            effective_config = "auto"

    cmd = list(_semgrep_cmd)
    cmd += ["scan"]

    if json_output:
        cmd += ["--json"]

    cmd += ["--config", effective_config]

    if severity:
        cmd += ["--severity", severity.upper()]

    cmd.append(str(target_path.resolve()))

    result = await _run_semgrep(cmd, timeout=SCAN_TIMEOUT)

    if not result["success"] and not result["output"]:
        return {
            "success": False,
            "findings": [],
            "count": 0,
            "target": target,
            "config": effective_config,
            "severity_summary": {},
            "error": result.get("error", "Scan failed"),
        }

    findings = _parse_semgrep_output(result["output"])
    truncated = findings[:max_findings]
    severity_summary = _count_severities(truncated)

    return {
        "success": True,
        "findings": truncated,
        "count": len(truncated),
        "total_findings": len(findings),
        "target": target,
        "config": effective_config,
        "severity_summary": severity_summary,
        "error": None,
    }


async def check_policy(
    target: str,
    policy_file: Optional[str] = None,
) -> dict[str, Any]:
    """Check code against a policy file.

    Runs Semgrep with the specified policy file (defaulting to
    ``.semgrep/stage6.yml``) and reports any violations.

    Args:
        target: Path to the directory or file to check.
        policy_file: Path to the policy YAML file.  Defaults to
            ``.semgrep/stage6.yml`` in the repository root.

    Returns:
        dict with keys:
            success (bool):         True if the check completed.
            passed (bool):          True if no ERROR-level findings.
            findings (list):        List of finding dicts.
            count (int):            Number of findings.
            blocked (list):         Findings at ERROR severity (must fix).
            warnings (list):        Findings at WARNING severity.
            allowed (list):         Findings at INFO severity.
            target (str):           The target that was checked.
            policy_file (str):      The policy file used.
            error (str):            Error message if failed, else None.
    """
    state = init()
    if not state["success"]:
        return _error_not_installed()

    # Resolve policy file
    if policy_file:
        policy_path = Path(policy_file)
    else:
        policy_path = DEFAULT_POLICY_FILE

    if not policy_path.exists():
        return {
            "success": False,
            "passed": False,
            "findings": [],
            "count": 0,
            "blocked": [],
            "warnings": [],
            "allowed": [],
            "target": target,
            "policy_file": str(policy_path),
            "error": f"Policy file not found: {policy_path}",
        }

    # Run scan with the policy file
    scan_result = await scan(
        target=target,
        config=str(policy_path),
        json_output=True,
    )

    if not scan_result["success"]:
        return {
            "success": False,
            "passed": False,
            "findings": scan_result.get("findings", []),
            "count": scan_result.get("count", 0),
            "blocked": [],
            "warnings": [],
            "allowed": [],
            "target": target,
            "policy_file": str(policy_path),
            "error": scan_result.get("error"),
        }

    # Categorize findings by severity
    findings = scan_result.get("findings", [])
    blocked = [f for f in findings if f.get("severity", "").upper() == "ERROR"]
    warnings = [f for f in findings if f.get("severity", "").upper() == "WARNING"]
    allowed = [f for f in findings if f.get("severity", "").upper() == "INFO"]

    return {
        "success": True,
        "passed": len(blocked) == 0,
        "findings": findings,
        "count": len(findings),
        "blocked": blocked,
        "warnings": warnings,
        "allowed": allowed,
        "target": target,
        "policy_file": str(policy_path),
        "error": None,
    }


async def autofix(
    target: str,
    config: Optional[str] = None,
) -> dict[str, Any]:
    """Auto-fix violations using Semgrep's autofix capability.

    Runs Semgrep with ``--autofix`` to automatically apply fixes for
    rules that define a ``fix`` key.

    Args:
        target: Path to the directory or file to fix.
        config: Semgrep config string.  If None, uses default policy.

    Returns:
        dict with keys:
            success (bool):     True if autofix completed.
            fixed (int):        Number of fixes applied (estimated).
            findings (list):    Findings that triggered fixes.
            target (str):       The target that was fixed.
            error (str):        Error message if failed, else None.
    """
    state = init()
    if not state["success"]:
        return _error_not_installed()

    target_path = Path(target)
    if not target_path.exists():
        return {
            "success": False,
            "fixed": 0,
            "findings": [],
            "target": target,
            "error": f"Target not found: {target}",
        }

    # Resolve config
    effective_config = config
    if effective_config is None:
        if DEFAULT_POLICY_FILE.exists():
            effective_config = str(DEFAULT_POLICY_FILE)
        else:
            effective_config = "auto"

    cmd = list(_semgrep_cmd)
    cmd += [
        "scan",
        "--json",
        "--autofix",
        "--config", effective_config,
        str(target_path.resolve()),
    ]

    result = await _run_semgrep(cmd, timeout=AUTOFIX_TIMEOUT)

    if not result["success"] and not result["output"]:
        return {
            "success": False,
            "fixed": 0,
            "findings": [],
            "target": target,
            "error": result.get("error", "Autofix failed"),
        }

    findings = _parse_semgrep_output(result["output"])
    # Findings that have a fix field indicate applied fixes
    fixed_findings = [f for f in findings if f.get("fix")]

    return {
        "success": True,
        "fixed": len(fixed_findings),
        "findings": findings,
        "target": target,
        "error": None,
    }


async def scan_diff(
    diff_text: str,
    config: Optional[str] = None,
) -> dict[str, Any]:
    """Scan only changed code from a diff.

    Writes the diff to a temporary file and runs Semgrep in
    diff-aware mode.  Useful for pre-commit hooks that only want
    to flag issues in changed lines.

    Args:
        diff_text: The unified diff text to scan.
        config: Semgrep config string.  If None, uses default policy.

    Returns:
        dict with keys:
            success (bool):    True if the scan completed.
            findings (list):   List of finding dicts in changed code.
            count (int):       Number of findings.
            error (str):       Error message if failed, else None.
    """
    state = init()
    if not state["success"]:
        return _error_not_installed()

    if not diff_text or not diff_text.strip():
        return {
            "success": True,
            "findings": [],
            "count": 0,
            "error": None,
        }

    # Resolve config
    effective_config = config
    if effective_config is None:
        if DEFAULT_POLICY_FILE.exists():
            effective_config = str(DEFAULT_POLICY_FILE)
        else:
            effective_config = "auto"

    # Write diff to a temporary file for Semgrep's --baseline-commit
    # alternative: use stdin with --diff-depth
    tmp_diff = None
    try:
        tmp_diff = tempfile.NamedTemporaryFile(
            mode="w", suffix=".diff", delete=False, encoding="utf-8",
        )
        tmp_diff.write(diff_text)
        tmp_diff.close()

        # Semgrep can scan with --json and a target directory
        # For diff scanning, we parse the diff to find affected files
        affected_files = _extract_files_from_diff(diff_text)

        if not affected_files:
            return {
                "success": True,
                "findings": [],
                "count": 0,
                "error": None,
            }

        # Scan each affected file
        all_findings: list[dict[str, Any]] = []
        for file_path in affected_files:
            if Path(file_path).exists():
                file_result = await scan(
                    target=file_path,
                    config=effective_config,
                    json_output=True,
                )
                if file_result.get("findings"):
                    all_findings.extend(file_result["findings"])

        # Filter findings to only those on changed lines
        changed_lines = _extract_changed_lines(diff_text)
        filtered = _filter_findings_by_changed_lines(all_findings, changed_lines)

        return {
            "success": True,
            "findings": filtered,
            "count": len(filtered),
            "error": None,
        }

    except Exception as exc:
        return {
            "success": False,
            "findings": [],
            "count": 0,
            "error": f"Diff scan failed: {exc}",
        }
    finally:
        if tmp_diff and Path(tmp_diff.name).exists():
            try:
                os.unlink(tmp_diff.name)
            except OSError:
                pass


async def ci_gate(
    target: str,
    config: Optional[str] = None,
    fail_on: str = "ERROR",
) -> dict[str, Any]:
    """CI blocking check that returns a clear pass/fail verdict.

    Runs a Semgrep scan and determines whether the build should
    pass or fail based on the severity of findings.

    Args:
        target: Path to the directory or file to check.
        config: Semgrep config string.  If None, uses default policy.
        fail_on: Minimum severity to fail on.  One of ``"INFO"``,
            ``"WARNING"``, ``"ERROR"``.  Default is ``"ERROR"``
            (only block on ERROR-severity findings).

    Returns:
        dict with keys:
            success (bool):         True if the gate check completed.
            passed (bool):          True if the code passed the gate.
            verdict (str):          ``"PASS"`` or ``"FAIL"``.
            fail_on (str):          The severity threshold used.
            total_findings (int):   Total number of findings.
            blocking_findings (int): Number of findings at or above threshold.
            findings (list):        All findings.
            severity_summary (dict): Count per severity level.
            target (str):           The target that was checked.
            error (str):            Error message if failed, else None.
    """
    state = init()
    if not state["success"]:
        return _error_not_installed()

    scan_result = await scan(
        target=target,
        config=config,
        json_output=True,
    )

    if not scan_result["success"]:
        return {
            "success": False,
            "passed": False,
            "verdict": "ERROR",
            "fail_on": fail_on,
            "total_findings": 0,
            "blocking_findings": 0,
            "findings": [],
            "severity_summary": {},
            "target": target,
            "error": scan_result.get("error"),
        }

    findings = scan_result.get("findings", [])
    severity_summary = _count_severities(findings)

    # Determine blocking findings based on fail_on threshold
    fail_on_upper = fail_on.upper()
    severity_order = ["INFO", "WARNING", "ERROR"]
    try:
        threshold_idx = severity_order.index(fail_on_upper)
    except ValueError:
        threshold_idx = 2  # Default to ERROR

    blocking_severities = set(severity_order[threshold_idx:])
    blocking = [
        f for f in findings
        if f.get("severity", "").upper() in blocking_severities
    ]

    passed = len(blocking) == 0
    verdict = "PASS" if passed else "FAIL"

    return {
        "success": True,
        "passed": passed,
        "verdict": verdict,
        "fail_on": fail_on_upper,
        "total_findings": len(findings),
        "blocking_findings": len(blocking),
        "findings": findings,
        "severity_summary": severity_summary,
        "target": target,
        "error": None,
    }


# ---------------------------------------------------------------------------
# Registry dispatch
# ---------------------------------------------------------------------------

async def execute(operation: str, params: dict[str, Any]) -> dict[str, Any]:
    """Dispatch an operation from the ToolRegistry.

    This is the unified entry point called by
    ``ToolRegistry.execute("semgrep", operation, params)``.

    Args:
        operation: The operation name to perform.
        params: Keyword arguments forwarded to the operation function.

    Returns:
        Operation result dictionary.  Always includes a ``success`` key.

    Supported operations:
        - ``"init"``          -- initialise the bridge
        - ``"status"``        -- get bridge health status
        - ``"capabilities"``  -- list capabilities
        - ``"scan"``          -- scan directory with rules
        - ``"check_policy"``  -- check against policy file
        - ``"autofix"``       -- auto-fix violations
        - ``"scan_diff"``     -- scan only changed code
        - ``"ci_gate"``       -- CI blocking check
    """
    coordinator = get_coordinator() if get_coordinator is not None else None
    if coordinator is not None:
        try:
            async with coordinator.acquire("semgrep", "scan"):
                return await _execute_inner(operation, params)
        except Exception as exc:
            logger.warning(
                "ResourceCoordinator unavailable, running without coordination: %s",
                exc,
            )
    return await _execute_inner(operation, params)


async def _execute_inner(operation: str, params: dict[str, Any]) -> dict[str, Any]:
    """Inner dispatch logic (separated for resource coordination wrapping)."""
    async_dispatch: dict[str, Any] = {
        "scan": scan,
        "check_policy": check_policy,
        "autofix": autofix,
        "scan_diff": scan_diff,
        "ci_gate": ci_gate,
    }

    sync_dispatch: dict[str, Any] = {
        "init": lambda **kw: init(),
        "status": lambda **kw: _tool_status_to_dict(status()),
        "capabilities": lambda **kw: {"success": True, "capabilities": capabilities()},
    }

    if operation in sync_dispatch:
        try:
            result = sync_dispatch[operation](**params)
            if not isinstance(result, dict):
                return {"success": True, "result": result}
            return result
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    if operation not in async_dispatch:
        all_ops = sorted(list(async_dispatch) + list(sync_dispatch))
        return {
            "success": False,
            "error": (
                f"Unknown operation: {operation!r}. "
                f"Available: {', '.join(all_ops)}"
            ),
        }

    try:
        return await async_dispatch[operation](**params)
    except TypeError as exc:
        return {"success": False, "error": f"Invalid parameters for {operation}: {exc}"}
    except Exception as exc:
        logger.exception("execute(%s) failed", operation)
        return {"success": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _error_not_installed() -> dict[str, Any]:
    """Return a standardized error when semgrep is not available."""
    return {
        "success": False,
        "error": (
            "Semgrep is not installed or not found on PATH. "
            "Install with: pip install semgrep"
        ),
    }


def _tool_status_to_dict(ts: ToolStatus) -> dict[str, Any]:
    """Convert a ToolStatus dataclass to a plain dictionary."""
    return {
        "name": ts.name,
        "available": ts.available,
        "healthy": ts.healthy,
        "error": ts.error,
        "version": ts.version,
        "success": ts.healthy,
    }


async def _run_semgrep(
    cmd: list[str],
    timeout: int,
    cwd: Optional[str] = None,
) -> dict[str, Any]:
    """Execute a Semgrep subprocess asynchronously.

    Uses ``asyncio.create_subprocess_exec`` for non-blocking execution.

    Args:
        cmd: Full command list (executable + arguments).
        timeout: Maximum execution time in seconds.
        cwd: Optional working directory.

    Returns:
        dict with ``success``, ``output``, ``stderr``, and ``error`` keys.
    """
    result: dict[str, Any] = {
        "success": False,
        "output": "",
        "stderr": "",
        "error": None,
    }

    logger.debug("semgrep exec: %s (timeout=%ds)", " ".join(cmd[:6]), timeout)

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
        )

        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            result["error"] = f"Semgrep timed out after {timeout}s"
            logger.warning("Semgrep timed out: %s", " ".join(cmd[:5]))
            return result

        stdout = stdout_bytes.decode("utf-8", errors="replace").strip()
        stderr = stderr_bytes.decode("utf-8", errors="replace").strip()

        result["output"] = stdout
        result["stderr"] = stderr

        # Semgrep returns exit code 0 for clean scan, 1 when findings exist
        # Exit code >= 2 indicates an actual error
        result["success"] = process.returncode in (0, 1)

        if process.returncode >= 2:
            result["success"] = False
            result["error"] = stderr or f"Semgrep exited with code {process.returncode}"
            logger.warning(
                "Semgrep exit %d: %s", process.returncode, stderr[:200],
            )
        elif stderr:
            logger.debug("Semgrep stderr (non-fatal): %s", stderr[:200])

    except FileNotFoundError:
        result["error"] = f"Semgrep binary not found: {cmd[0]}"
        global _initialized
        _initialized = False
        logger.error("Semgrep binary vanished: %s", cmd[0])

    except OSError as exc:
        result["error"] = f"Failed to start Semgrep process: {exc}"
        logger.error("Semgrep OSError: %s", exc)

    return result


def _parse_semgrep_output(output: str) -> list[dict[str, Any]]:
    """Parse Semgrep JSON output into structured findings.

    Semgrep's ``--json`` flag outputs a JSON object with a ``results``
    array containing finding objects.

    Args:
        output: Raw stdout from a ``semgrep scan --json`` invocation.

    Returns:
        List of normalized finding dicts.
    """
    findings: list[dict[str, Any]] = []

    if not output or not output.strip():
        return findings

    try:
        data = json.loads(output)
    except json.JSONDecodeError:
        logger.debug("Failed to parse Semgrep JSON output: %s", output[:200])
        return findings

    # Semgrep JSON format: { "results": [...], "errors": [...], ... }
    raw_results = []
    if isinstance(data, dict):
        raw_results = data.get("results", [])
    elif isinstance(data, list):
        raw_results = data

    for item in raw_results:
        findings.append(_normalize_finding(item))

    return findings


def _normalize_finding(item: dict[str, Any]) -> dict[str, Any]:
    """Normalize a raw Semgrep finding into a standard format.

    Args:
        item: Raw finding dict from Semgrep JSON output.

    Returns:
        Normalized finding dict with standard keys.
    """
    # Extract location information
    start = item.get("start", {})
    end = item.get("end", {})
    extra = item.get("extra", {})

    severity = extra.get("severity", item.get("severity", "WARNING")).upper()
    action = SEVERITY_MAP.get(severity, "warn")

    return {
        "rule_id": item.get("check_id", item.get("rule_id", "unknown")),
        "message": extra.get("message", item.get("message", "")),
        "severity": severity,
        "action": action,
        "file": item.get("path", ""),
        "line_start": start.get("line", 0),
        "col_start": start.get("col", 0),
        "line_end": end.get("line", 0),
        "col_end": end.get("col", 0),
        "text": extra.get("lines", item.get("extra", {}).get("matched_code", "")),
        "fix": extra.get("fix", None),
        "metadata": extra.get("metadata", {}),
    }


def _count_severities(findings: list[dict[str, Any]]) -> dict[str, int]:
    """Count findings per severity level.

    Args:
        findings: List of normalized finding dicts.

    Returns:
        dict mapping severity strings to counts.
    """
    counts: dict[str, int] = {"ERROR": 0, "WARNING": 0, "INFO": 0}
    for f in findings:
        sev = f.get("severity", "WARNING").upper()
        if sev in counts:
            counts[sev] += 1
        else:
            counts[sev] = 1
    return counts


def _extract_files_from_diff(diff_text: str) -> list[str]:
    """Extract affected file paths from a unified diff.

    Parses ``--- a/path`` and ``+++ b/path`` lines to find which
    files are affected by the diff.

    Args:
        diff_text: Unified diff text.

    Returns:
        List of unique file paths found in the diff.
    """
    files: list[str] = []
    seen: set[str] = set()

    for line in diff_text.splitlines():
        if line.startswith("+++ b/"):
            path = line[6:].strip()
            if path and path != "/dev/null" and path not in seen:
                files.append(path)
                seen.add(path)
        elif line.startswith("+++ ") and not line.startswith("+++ /dev/null"):
            # Handle diffs without a/ b/ prefix
            path = line[4:].strip()
            if path and path not in seen:
                files.append(path)
                seen.add(path)

    return files


def _extract_changed_lines(diff_text: str) -> dict[str, set[int]]:
    """Extract changed line numbers per file from a unified diff.

    Args:
        diff_text: Unified diff text.

    Returns:
        dict mapping file paths to sets of changed line numbers.
    """
    changed: dict[str, set[int]] = {}
    current_file: Optional[str] = None
    current_line = 0

    for line in diff_text.splitlines():
        if line.startswith("+++ b/"):
            current_file = line[6:].strip()
            if current_file not in changed:
                changed[current_file] = set()
        elif line.startswith("+++ "):
            current_file = line[4:].strip()
            if current_file and current_file != "/dev/null":
                if current_file not in changed:
                    changed[current_file] = set()
        elif line.startswith("@@ "):
            # Parse hunk header: @@ -old_start,old_count +new_start,new_count @@
            try:
                parts = line.split("+")[1].split(",")[0]
                current_line = int(parts) - 1  # Will be incremented below
            except (IndexError, ValueError):
                current_line = 0
        elif line.startswith("+") and not line.startswith("+++"):
            current_line += 1
            if current_file and current_file in changed:
                changed[current_file].add(current_line)
        elif line.startswith("-") and not line.startswith("---"):
            # Deleted line -- don't increment current_line
            pass
        else:
            current_line += 1

    return changed


def _filter_findings_by_changed_lines(
    findings: list[dict[str, Any]],
    changed_lines: dict[str, set[int]],
) -> list[dict[str, Any]]:
    """Filter findings to only include those on changed lines.

    Args:
        findings: List of normalized finding dicts.
        changed_lines: dict mapping file paths to changed line sets.

    Returns:
        Filtered list of findings.
    """
    filtered: list[dict[str, Any]] = []

    for finding in findings:
        file_path = finding.get("file", "")
        line = finding.get("line_start", 0)

        # Check if this file has changed lines
        for changed_file, lines in changed_lines.items():
            # Match by file basename or full path
            if (
                file_path == changed_file
                or file_path.endswith(changed_file)
                or changed_file.endswith(file_path)
            ):
                if line in lines:
                    filtered.append(finding)
                    break

    return filtered


# ---------------------------------------------------------------------------
# CLI test entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Semgrep Bridge - Super-Goose")
    parser.add_argument(
        "--test", "--selftest", action="store_true",
        help="Run a quick self-test of bridge functionality",
    )
    parser.add_argument(
        "--status", action="store_true",
        help="Show bridge status",
    )
    parser.add_argument(
        "--scan", type=str, default=None,
        help="Scan a target directory or file",
    )
    parser.add_argument(
        "--config", type=str, default=None,
        help="Semgrep config (rule file, directory, or registry string)",
    )
    parser.add_argument(
        "--policy", type=str, default=None,
        help="Check against a policy file",
    )
    parser.add_argument(
        "--ci-gate", type=str, default=None,
        help="Run CI gate check on a target",
    )
    args = parser.parse_args()

    async def _run_test() -> None:
        """Execute the self-test sequence."""
        print("=" * 60)
        print("Semgrep Bridge Self-Test")
        print("=" * 60)

        # Init
        result = init()
        print(f"\n[init] command={result['command']}")
        print(f"[init] version={result['version']}")
        print(f"[init] success={result['success']}")

        if not result["success"]:
            print("\nWARNING: Semgrep not found. Install with: pip install semgrep")
            print("Continuing with offline tests only...")

        # Status
        s = status()
        print(f"\n[status] available={s.available}, healthy={s.healthy}")

        # Capabilities
        caps = capabilities()
        print(f"[capabilities] {caps}")

        # Check if policy file exists
        print(f"\n[policy] default policy file: {DEFAULT_POLICY_FILE}")
        print(f"[policy] exists: {DEFAULT_POLICY_FILE.exists()}")

        # If semgrep is available, run a quick scan
        if result["success"]:
            # Scan this file as a test target
            test_target = str(Path(__file__).parent)
            print(f"\n[scan] target={test_target}")

            if DEFAULT_POLICY_FILE.exists():
                scan_result = await scan(
                    target=test_target,
                    config=str(DEFAULT_POLICY_FILE),
                    max_findings=10,
                )
                print(f"[scan] count={scan_result['count']}, "
                      f"severity={scan_result.get('severity_summary', {})}")
                for f in scan_result.get("findings", [])[:3]:
                    print(f"  - [{f['severity']}] {f['rule_id']}: "
                          f"{f['file']}:{f['line_start']} {f['message'][:60]}")

                # CI gate
                gate_result = await ci_gate(
                    target=test_target,
                    config=str(DEFAULT_POLICY_FILE),
                    fail_on="ERROR",
                )
                print(f"\n[ci_gate] verdict={gate_result['verdict']}, "
                      f"blocking={gate_result['blocking_findings']}")
            else:
                print("[scan] skipped -- no policy file found")

        print("\n" + "=" * 60)
        print("Self-test complete.")
        print("=" * 60)

    async def _run_scan(target: str, config: Optional[str]) -> None:
        """Run a scan from CLI."""
        init()
        result = await scan(target, config=config)
        print(json.dumps(result, indent=2, default=str))
        sys.exit(0 if result["success"] else 1)

    async def _run_policy(target: str, policy_file: Optional[str]) -> None:
        """Run a policy check from CLI."""
        init()
        result = await check_policy(target, policy_file=policy_file)
        print(json.dumps(result, indent=2, default=str))
        sys.exit(0 if result.get("passed") else 1)

    async def _run_ci_gate(target: str, config: Optional[str]) -> None:
        """Run CI gate from CLI."""
        init()
        result = await ci_gate(target, config=config)
        print(json.dumps(result, indent=2, default=str))
        sys.exit(0 if result.get("passed") else 1)

    if args.test:
        asyncio.run(_run_test())
    elif args.status:
        result = init()
        s = status()
        print(f"Name:      {s.name}")
        print(f"Available: {s.available}")
        print(f"Healthy:   {s.healthy}")
        print(f"Version:   {s.version}")
        print(f"Command:   {result['command']}")
        print(f"Error:     {s.error}")
    elif args.scan:
        asyncio.run(_run_scan(args.scan, args.config))
    elif args.policy:
        asyncio.run(_run_policy(args.policy, args.config))
    elif args.ci_gate:
        asyncio.run(_run_ci_gate(args.ci_gate, args.config))
    else:
        parser.print_help()
