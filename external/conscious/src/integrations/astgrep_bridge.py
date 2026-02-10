"""
ast-grep Bridge - AST-aware code search and structural replacement for Super-Goose.

Wraps the ``ast-grep`` (``sg``) Rust binary via subprocess to provide
structural code search, pattern-based replacement, and lint rule execution
for Goose agents through the Conscious bridge layer.

ast-grep uses tree-sitter parsers to understand code structure, enabling
searches that match on AST nodes rather than raw text.  This makes it
significantly more accurate than regex-based search for code patterns.

Bridge operations:
    search          - AST pattern search across files
    replace         - Structural code replacement
    lint            - Run ast-grep linting rules
    list_languages  - List supported programming languages
    parse_matches   - Parse sg JSON output into structured results
    create_rule     - Create a YAML lint rule

Binary resolution order:
    1. ``external/ast-grep/target/release/sg`` (local build)
    2. ``sg`` on PATH (system install)
    3. ``ast-grep`` on PATH (alternative name)

Supported languages:
    Python, JavaScript, TypeScript, Rust, Go, Java, C, C++, C#, Kotlin,
    Swift, Ruby, Lua, Bash, HTML, CSS, and more.

Reference:
    ast-grep docs:   https://ast-grep.github.io
    ast-grep GitHub: https://github.com/ast-grep/ast-grep
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import subprocess
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

# Path to the local ast-grep build
ASTGREP_ROOT = Path(__file__).resolve().parent.parent.parent.parent / "ast-grep"
# Equivalent: G:/goose/external/ast-grep

# Subprocess timeout defaults (seconds)
SEARCH_TIMEOUT = 120    # 2 minutes -- large codebases
REPLACE_TIMEOUT = 60    # 1 minute
LINT_TIMEOUT = 180      # 3 minutes -- full lint passes

# Maximum results to return from a single search
DEFAULT_MAX_RESULTS = 50

# Languages supported by ast-grep (via tree-sitter grammars)
SUPPORTED_LANGUAGES: dict[str, str] = {
    "python": "Python",
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "tsx": "TypeScript JSX",
    "jsx": "JavaScript JSX",
    "rust": "Rust",
    "go": "Go",
    "java": "Java",
    "c": "C",
    "cpp": "C++",
    "csharp": "C#",
    "kotlin": "Kotlin",
    "swift": "Swift",
    "ruby": "Ruby",
    "lua": "Lua",
    "bash": "Bash/Shell",
    "html": "HTML",
    "css": "CSS",
    "json": "JSON",
    "yaml": "YAML",
    "toml": "TOML",
    "sql": "SQL",
    "dart": "Dart",
    "elixir": "Elixir",
    "haskell": "Haskell",
    "scala": "Scala",
    "php": "PHP",
}

# ---------------------------------------------------------------------------
# Module-level state (lazy init)
# ---------------------------------------------------------------------------

_initialized: bool = False
_init_lock = threading.Lock()
_sg_executable: Optional[str] = None
_sg_version: Optional[str] = None


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------

def init() -> dict[str, Any]:
    """Initialize the ast-grep bridge.

    Performs lazy discovery of the ``sg`` CLI binary and caches the
    result for subsequent calls.  Safe to call multiple times.

    Resolution order:
        1. Local build at ``external/ast-grep/target/release/sg``
        2. ``sg`` on system PATH
        3. ``ast-grep`` on system PATH

    Returns:
        dict with keys:
            success (bool):   True if sg is available.
            executable (str): Resolved path to the binary, or None.
            version (str):    Version string, or None.
            error (str):      Error message if not found, else None.
    """
    global _initialized, _sg_executable, _sg_version

    with _init_lock:
        if _initialized:
            return {
                "success": _sg_executable is not None,
                "executable": _sg_executable,
                "version": _sg_version,
                "error": None if _sg_executable else "sg binary not found",
            }

        exe = None

        # 1. Try local build
        local_candidates = [
            ASTGREP_ROOT / "target" / "release" / "sg.exe",      # Windows release
            ASTGREP_ROOT / "target" / "release" / "sg",           # Unix release
            ASTGREP_ROOT / "target" / "debug" / "sg.exe",         # Windows debug
            ASTGREP_ROOT / "target" / "debug" / "sg",             # Unix debug
        ]
        for candidate in local_candidates:
            if candidate.exists():
                exe = str(candidate)
                break

        # 2. Try sg on PATH
        if exe is None:
            exe = shutil.which("sg")

        # 3. Try ast-grep on PATH
        if exe is None:
            exe = shutil.which("ast-grep")

        # 4. Get version
        if exe:
            try:
                result = subprocess.run(
                    [exe, "--version"],
                    capture_output=True, text=True, timeout=10,
                )
                if result.returncode == 0:
                    _sg_version = result.stdout.strip()
            except (subprocess.TimeoutExpired, OSError):
                pass

        _sg_executable = exe
        _initialized = True

        if _sg_executable:
            logger.info("ast-grep bridge initialized: %s (v%s)", _sg_executable, _sg_version)
        else:
            logger.warning(
                "ast-grep bridge: sg binary not found. "
                "Install with: cargo install ast-grep --locked"
            )

        return {
            "success": _sg_executable is not None,
            "executable": _sg_executable,
            "version": _sg_version,
            "error": None if _sg_executable else "sg binary not found",
        }


# ---------------------------------------------------------------------------
# Status / capabilities
# ---------------------------------------------------------------------------

def status() -> ToolStatus:
    """Return the current health status of the ast-grep tool.

    Returns:
        ToolStatus with availability and version information.
    """
    state = init()
    return ToolStatus(
        name="ast-grep",
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
        "structural_search",
        "ast_edit",
        "code_pattern",
        "refactor",
        "multi_language",
        "lint",
        "ast_search",
        "structural_replace",
        "ast_lint",
        "code_analysis",
        "pattern_matching",
    ]


# ---------------------------------------------------------------------------
# Core operations
# ---------------------------------------------------------------------------

async def search(
    pattern: str,
    language: str,
    directory: str = ".",
    max_results: int = DEFAULT_MAX_RESULTS,
) -> dict[str, Any]:
    """Search for AST patterns in code files.

    Uses ast-grep's structural pattern matching to find code that matches
    the given pattern.  Patterns use the target language's syntax with
    metavariables (``$NAME``, ``$$$ARGS``) for wildcards.

    Examples::

        # Find all function calls to ``print``
        await search("print($$$ARGS)", "python")

        # Find all if statements with empty bodies
        await search("if ($COND) {}", "javascript")

        # Find all struct definitions
        await search("struct $NAME { $$$FIELDS }", "rust")

    Args:
        pattern: AST pattern to search for.  Use ``$NAME`` for single-node
            metavariables and ``$$$NAME`` for multi-node (variadic) ones.
        language: Target language (e.g. ``"python"``, ``"javascript"``).
            Must be one of the keys in :data:`SUPPORTED_LANGUAGES`.
        directory: Root directory to search in.  Defaults to current dir.
        max_results: Maximum number of matches to return.

    Returns:
        dict with keys:
            success (bool):    True if the search completed.
            matches (list):    List of match dicts, each containing:
                - ``file`` (str): File path.
                - ``line`` (int): Line number (1-based).
                - ``column`` (int): Column number (0-based).
                - ``text`` (str): Matched source text.
                - ``metavars`` (dict): Captured metavariable bindings.
            count (int):       Number of matches found.
            pattern (str):     The search pattern used.
            language (str):    The language searched.
            error (str):       Error message if failed, else None.
    """
    state = init()
    if not state["success"]:
        return _error_not_installed()

    if language not in SUPPORTED_LANGUAGES:
        return {
            "success": False,
            "matches": [],
            "count": 0,
            "pattern": pattern,
            "language": language,
            "error": (
                f"Unsupported language: {language!r}. "
                f"Supported: {', '.join(sorted(SUPPORTED_LANGUAGES.keys()))}"
            ),
        }

    cmd = [
        _sg_executable,
        "run",
        "--pattern", pattern,
        "--lang", language,
        "--json",
        str(Path(directory).resolve()),
    ]

    result = await _run_sg(cmd, timeout=SEARCH_TIMEOUT)

    if not result["success"]:
        return {
            "success": False,
            "matches": [],
            "count": 0,
            "pattern": pattern,
            "language": language,
            "error": result.get("error", "Search failed"),
        }

    matches = parse_matches(result["output"])
    truncated = matches[:max_results]

    return {
        "success": True,
        "matches": truncated,
        "count": len(truncated),
        "total_matches": len(matches),
        "pattern": pattern,
        "language": language,
        "error": None,
    }


async def replace(
    pattern: str,
    replacement: str,
    language: str,
    file_path: str,
) -> dict[str, Any]:
    """Perform structural code replacement in a file.

    Finds all occurrences of ``pattern`` in the given file and replaces
    them with ``replacement``.  Both pattern and replacement use
    ast-grep's metavariable syntax, so captured names carry over.

    Example::

        # Rename a function
        await replace(
            pattern="old_func($$$ARGS)",
            replacement="new_func($$$ARGS)",
            language="python",
            file_path="src/utils.py",
        )

    Args:
        pattern: AST pattern to find.
        replacement: Replacement pattern (can reference metavariables
            from the search pattern).
        language: Target language.
        file_path: Path to the file to modify.

    Returns:
        dict with keys:
            success (bool):        True if replacement was applied.
            replacements (int):    Number of replacements made.
            file (str):            The file that was modified.
            pattern (str):         The search pattern.
            replacement (str):     The replacement pattern.
            error (str):           Error message if failed, else None.
    """
    state = init()
    if not state["success"]:
        return _error_not_installed()

    target = Path(file_path)
    if not target.exists():
        return {
            "success": False,
            "replacements": 0,
            "file": file_path,
            "pattern": pattern,
            "replacement": replacement,
            "error": f"File not found: {file_path}",
        }

    if language not in SUPPORTED_LANGUAGES:
        return {
            "success": False,
            "replacements": 0,
            "file": file_path,
            "pattern": pattern,
            "replacement": replacement,
            "error": f"Unsupported language: {language!r}",
        }

    # Read original for diff comparison
    try:
        original_content = target.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        return {
            "success": False,
            "replacements": 0,
            "file": file_path,
            "pattern": pattern,
            "replacement": replacement,
            "error": f"Cannot read file: {exc}",
        }

    cmd = [
        _sg_executable,
        "run",
        "--pattern", pattern,
        "--rewrite", replacement,
        "--lang", language,
        "--update-all",
        str(target.resolve()),
    ]

    result = await _run_sg(cmd, timeout=REPLACE_TIMEOUT)

    if not result["success"]:
        return {
            "success": False,
            "replacements": 0,
            "file": file_path,
            "pattern": pattern,
            "replacement": replacement,
            "error": result.get("error", "Replace failed"),
        }

    # Count replacements by comparing file content
    try:
        new_content = target.read_text(encoding="utf-8")
        # Rough replacement count: count differences in lines
        orig_lines = set(original_content.splitlines())
        new_lines = set(new_content.splitlines())
        changed_lines = len(orig_lines.symmetric_difference(new_lines))
        # Estimate: each replacement changes at least one line
        replacement_count = max(changed_lines // 2, 1) if original_content != new_content else 0
    except (OSError, UnicodeDecodeError):
        replacement_count = 0

    return {
        "success": True,
        "replacements": replacement_count,
        "file": file_path,
        "pattern": pattern,
        "replacement": replacement,
        "error": None,
    }


async def lint(
    rules_file: str,
    directory: str = ".",
) -> dict[str, Any]:
    """Run ast-grep linting rules against a directory.

    Executes the rules defined in a YAML rules file and reports any
    violations found.

    Args:
        rules_file: Path to the YAML rules file or directory containing
            ``sgconfig.yml``.
        directory: Root directory to lint.  Defaults to current dir.

    Returns:
        dict with keys:
            success (bool):     True if linting completed.
            findings (list):    List of finding dicts, each containing:
                - ``rule_id`` (str): The rule identifier.
                - ``message`` (str): Human-readable message.
                - ``severity`` (str): ``"error"``, ``"warning"``, or ``"hint"``.
                - ``file`` (str): File path.
                - ``line`` (int): Line number.
                - ``column`` (int): Column number.
                - ``text`` (str): Matched code.
            count (int):        Number of findings.
            rules_file (str):   The rules file used.
            error (str):        Error message if failed, else None.
    """
    state = init()
    if not state["success"]:
        return _error_not_installed()

    rules_path = Path(rules_file)
    if not rules_path.exists():
        return {
            "success": False,
            "findings": [],
            "count": 0,
            "rules_file": rules_file,
            "error": f"Rules file not found: {rules_file}",
        }

    cmd = [
        _sg_executable,
        "scan",
        "--json",
    ]

    # If rules_file points to a directory, use --config
    if rules_path.is_dir():
        cmd += ["--config", str(rules_path.resolve())]
    else:
        cmd += ["--rule", str(rules_path.resolve())]

    cmd.append(str(Path(directory).resolve()))

    result = await _run_sg(cmd, timeout=LINT_TIMEOUT)

    # sg scan returns exit code 1 when findings exist, which is expected
    output = result["output"]
    findings = _parse_lint_output(output)

    return {
        "success": True,
        "findings": findings,
        "count": len(findings),
        "rules_file": rules_file,
        "error": None,
    }


async def scan(
    rules_dir: str,
    directory: str = ".",
    json_output: bool = True,
) -> dict[str, Any]:
    """Scan a directory using ast-grep rule files.

    Similar to :func:`lint` but oriented toward scanning with a directory
    of rule files rather than a single rule file.  This matches the
    ``sg scan`` CLI interface.

    Args:
        rules_dir: Path to the directory containing rule YAML files or
            an ``sgconfig.yml`` file.
        directory: Root directory to scan.  Defaults to current dir.
        json_output: Whether to request JSON output (default True).

    Returns:
        dict with keys:
            success (bool):     True if scanning completed.
            findings (list):    List of finding dicts.
            count (int):        Number of findings.
            rules_dir (str):    The rules directory used.
            error (str):        Error message if failed, else None.
    """
    state = init()
    if not state["success"]:
        return _error_not_installed()

    rules_path = Path(rules_dir)
    if not rules_path.exists():
        return {
            "success": False,
            "findings": [],
            "count": 0,
            "rules_dir": rules_dir,
            "error": f"Rules directory not found: {rules_dir}",
        }

    cmd = [
        _sg_executable,
        "scan",
    ]

    if json_output:
        cmd.append("--json")

    # Use --config for directories (expects sgconfig.yml inside)
    if rules_path.is_dir():
        cmd += ["--config", str(rules_path.resolve())]
    else:
        cmd += ["--rule", str(rules_path.resolve())]

    cmd.append(str(Path(directory).resolve()))

    result = await _run_sg(cmd, timeout=LINT_TIMEOUT)

    # sg scan returns exit code 1 when findings exist, which is expected
    output = result["output"]
    findings = _parse_lint_output(output)

    return {
        "success": True,
        "findings": findings,
        "count": len(findings),
        "rules_dir": rules_dir,
        "error": None,
    }


def list_languages() -> dict[str, Any]:
    """List all programming languages supported by ast-grep.

    Returns:
        dict with keys:
            success (bool):      Always True.
            languages (dict):    Mapping of language key to display name.
            count (int):         Number of supported languages.
    """
    return {
        "success": True,
        "languages": dict(SUPPORTED_LANGUAGES),
        "count": len(SUPPORTED_LANGUAGES),
    }


def parse_matches(output: str) -> list[dict[str, Any]]:
    """Parse ast-grep JSON output into structured match results.

    ast-grep's ``--json`` flag outputs one JSON object per line (NDJSON).
    Each object contains the match details including file, range, text,
    and metavariable bindings.

    Args:
        output: Raw stdout from an ``sg run --json`` invocation.

    Returns:
        List of match dicts with normalized fields.
    """
    matches = []

    if not output or not output.strip():
        return matches

    # Try parsing as a JSON array first
    try:
        data = json.loads(output)
        if isinstance(data, list):
            for item in data:
                matches.append(_normalize_match(item))
            return matches
    except json.JSONDecodeError:
        pass

    # Fall back to NDJSON (one JSON object per line)
    for line in output.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
            matches.append(_normalize_match(item))
        except json.JSONDecodeError:
            logger.debug("Skipping non-JSON line from sg output: %s", line[:100])
            continue

    return matches


def create_rule(
    pattern: str,
    replacement: str,
    language: str,
    message: str,
    rule_id: Optional[str] = None,
    severity: str = "warning",
) -> dict[str, Any]:
    """Create an ast-grep YAML lint rule.

    Generates a YAML rule definition that can be saved to a file and
    used with :func:`lint`.

    Args:
        pattern: AST pattern to match.
        replacement: Suggested fix/replacement pattern.
        language: Target language for the rule.
        message: Human-readable message describing the issue.
        rule_id: Optional rule identifier.  Generated from the message
            if not provided.
        severity: Rule severity: ``"error"``, ``"warning"``, or ``"hint"``.

    Returns:
        dict with keys:
            success (bool):   True always (rule generation is offline).
            rule_id (str):    The rule identifier.
            yaml (str):       The complete YAML rule definition.
            language (str):   Target language.
    """
    if rule_id is None:
        # Generate a slug from the message
        slug = message.lower()
        for ch in " -/\\:;.,!?'\"()[]{}":
            slug = slug.replace(ch, "_")
        slug = "_".join(part for part in slug.split("_") if part)
        rule_id = slug[:64]

    yaml_content = f"""id: {rule_id}
language: {language}
severity: {severity}
message: "{message}"
rule:
  pattern: "{pattern}"
fix: "{replacement}"
"""

    return {
        "success": True,
        "rule_id": rule_id,
        "yaml": yaml_content,
        "language": language,
    }


# ---------------------------------------------------------------------------
# Registry dispatch
# ---------------------------------------------------------------------------

async def execute(operation: str, params: dict[str, Any]) -> dict[str, Any]:
    """Dispatch an operation from the ToolRegistry.

    This is the unified entry point called by
    ``ToolRegistry.execute("astgrep", operation, params)``.

    Args:
        operation: The operation name to perform.
        params: Keyword arguments forwarded to the operation function.

    Returns:
        Operation result dictionary.  Always includes a ``success`` key.

    Supported operations:
        - ``"init"``           -- initialise the bridge
        - ``"status"``         -- get bridge health status
        - ``"capabilities"``   -- list capabilities
        - ``"search"``         -- AST pattern search
        - ``"replace"``        -- structural code replacement
        - ``"lint"``           -- run lint rules
        - ``"scan"``           -- scan with rule directory
        - ``"list_languages"`` -- list supported languages
        - ``"create_rule"``    -- create a YAML lint rule
    """
    coordinator = get_coordinator() if get_coordinator is not None else None
    if coordinator is not None:
        try:
            async with coordinator.acquire("ast_grep", "refactor"):
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
        "search": search,
        "replace": replace,
        "lint": lint,
        "scan": scan,
    }

    sync_dispatch: dict[str, Any] = {
        "init": lambda **kw: init(),
        "status": lambda **kw: _tool_status_to_dict(status()),
        "capabilities": lambda **kw: {"success": True, "capabilities": capabilities()},
        "list_languages": lambda **kw: list_languages(),
        "create_rule": lambda **kw: create_rule(**kw),
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
    """Return a standardized error when sg is not available."""
    return {
        "success": False,
        "error": (
            "ast-grep (sg) is not installed or not found on PATH. "
            "Install with: cargo install ast-grep --locked  "
            "or: npm install -g @ast-grep/cli"
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


async def _run_sg(
    cmd: list[str],
    timeout: int,
    cwd: Optional[str] = None,
) -> dict[str, Any]:
    """Execute an ast-grep subprocess asynchronously.

    Uses ``asyncio.create_subprocess_exec`` for non-blocking execution.

    Args:
        cmd: Full command list (executable + arguments).
        timeout: Maximum execution time in seconds.
        cwd: Optional working directory.

    Returns:
        dict with ``success``, ``output``, and ``error`` keys.
    """
    result = {
        "success": False,
        "output": "",
        "error": None,
    }

    logger.debug("ast-grep exec: %s (timeout=%ds)", " ".join(cmd[:6]), timeout)

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
            result["error"] = f"ast-grep timed out after {timeout}s"
            logger.warning("ast-grep timed out: %s", " ".join(cmd[:5]))
            return result

        stdout = stdout_bytes.decode("utf-8", errors="replace").strip()
        stderr = stderr_bytes.decode("utf-8", errors="replace").strip()

        result["output"] = stdout
        # sg returns exit code 1 when matches/findings are found (not an error)
        result["success"] = process.returncode in (0, 1)

        if process.returncode not in (0, 1):
            result["success"] = False
            result["error"] = stderr or f"sg exited with code {process.returncode}"
            logger.warning("ast-grep exit %d: %s", process.returncode, stderr[:200])
        elif stderr:
            logger.debug("ast-grep stderr (non-fatal): %s", stderr[:200])

    except FileNotFoundError:
        result["error"] = f"sg binary not found: {cmd[0]}"
        global _initialized
        _initialized = False
        logger.error("sg binary vanished: %s", cmd[0])

    except OSError as exc:
        result["error"] = f"Failed to start sg process: {exc}"
        logger.error("ast-grep OSError: %s", exc)

    return result


def _normalize_match(item: dict[str, Any]) -> dict[str, Any]:
    """Normalize a raw ast-grep JSON match into a standard format.

    Handles differences between ast-grep output versions.

    Args:
        item: Raw match dict from ast-grep JSON output.

    Returns:
        Normalized match dict with ``file``, ``line``, ``column``,
        ``text``, and ``metavars`` keys.
    """
    # ast-grep JSON format varies; handle common shapes
    match_range = item.get("range", {})
    start = match_range.get("start", {}) if isinstance(match_range, dict) else {}

    # Metavariables may be under "metaVariables" or "env"
    metavars_raw = item.get("metaVariables", item.get("env", {}))
    metavars = {}
    if isinstance(metavars_raw, dict):
        for key, val in metavars_raw.items():
            if isinstance(val, dict):
                metavars[key] = val.get("text", str(val))
            elif isinstance(val, list):
                metavars[key] = [
                    v.get("text", str(v)) if isinstance(v, dict) else str(v)
                    for v in val
                ]
            else:
                metavars[key] = str(val)

    return {
        "file": item.get("file", item.get("path", "")),
        "line": start.get("line", item.get("line", 0)),
        "column": start.get("column", item.get("column", 0)),
        "text": item.get("text", item.get("matchedCode", "")),
        "metavars": metavars,
        "rule_id": item.get("ruleId", None),
        "message": item.get("message", None),
    }


def _parse_lint_output(output: str) -> list[dict[str, Any]]:
    """Parse lint/scan output from ast-grep into finding records.

    Args:
        output: Raw stdout from ``sg scan --json``.

    Returns:
        List of finding dicts with rule_id, message, severity, file,
        line, column, and text.
    """
    findings = []

    if not output or not output.strip():
        return findings

    # Try as JSON array
    try:
        data = json.loads(output)
        if isinstance(data, list):
            for item in data:
                findings.append(_normalize_finding(item))
            return findings
    except json.JSONDecodeError:
        pass

    # NDJSON fallback
    for line in output.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
            findings.append(_normalize_finding(item))
        except json.JSONDecodeError:
            continue

    return findings


def _normalize_finding(item: dict[str, Any]) -> dict[str, Any]:
    """Normalize a raw lint finding into a standard format.

    Args:
        item: Raw finding dict from ast-grep scan JSON.

    Returns:
        Normalized finding dict.
    """
    match_range = item.get("range", {})
    start = match_range.get("start", {}) if isinstance(match_range, dict) else {}

    return {
        "rule_id": item.get("ruleId", item.get("id", "unknown")),
        "message": item.get("message", ""),
        "severity": item.get("severity", "warning"),
        "file": item.get("file", item.get("path", "")),
        "line": start.get("line", item.get("line", 0)),
        "column": start.get("column", item.get("column", 0)),
        "text": item.get("text", item.get("matchedCode", "")),
        "fix": item.get("fix", item.get("replacement", None)),
    }


# ---------------------------------------------------------------------------
# CLI test entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="ast-grep Bridge - Super-Goose")
    parser.add_argument(
        "--test", "--selftest", action="store_true",
        help="Run a quick self-test of bridge functionality",
    )
    parser.add_argument(
        "--status", action="store_true",
        help="Show bridge status",
    )
    parser.add_argument(
        "--search", type=str, default=None,
        help="Search pattern (requires --lang)",
    )
    parser.add_argument(
        "--lang", type=str, default="python",
        help="Language for search (default: python)",
    )
    parser.add_argument(
        "--dir", type=str, default=".",
        help="Directory to search (default: current)",
    )
    args = parser.parse_args()

    async def _run_test() -> None:
        """Execute the self-test sequence."""
        print("=" * 60)
        print("ast-grep Bridge Self-Test")
        print("=" * 60)

        # Init
        result = init()
        print(f"\n[init] executable={result['executable']}")
        print(f"[init] version={result['version']}")
        print(f"[init] success={result['success']}")

        if not result["success"]:
            print("\nERROR: sg binary not found. Cannot run further tests.")
            print("Install with: cargo install ast-grep --locked")
            sys.exit(1)

        # Status
        s = status()
        print(f"\n[status] available={s.available}, healthy={s.healthy}")

        # List languages
        langs = list_languages()
        print(f"\n[list_languages] count={langs['count']}")

        # Create rule
        rule = create_rule(
            pattern="eval($EXPR)",
            replacement="safe_eval($EXPR)",
            language="python",
            message="Avoid using eval() directly",
        )
        print(f"\n[create_rule] rule_id={rule['rule_id']}")
        print(f"[create_rule] yaml:\n{rule['yaml']}")

        # Search (only if we have a Python file to test against)
        test_dir = Path(__file__).parent
        search_result = await search(
            pattern="import $MOD",
            language="python",
            directory=str(test_dir),
            max_results=5,
        )
        print(f"\n[search] matches={search_result['count']}")
        for m in search_result.get("matches", [])[:3]:
            print(f"  - {m['file']}:{m['line']} -> {m['text'][:60]}")

        print("\n" + "=" * 60)
        print("Self-test complete.")
        print("=" * 60)

    async def _run_search(pattern: str, lang: str, directory: str) -> None:
        """Run a search from CLI."""
        init()
        result = await search(pattern, lang, directory)
        print(json.dumps(result, indent=2, default=str))
        sys.exit(0 if result["success"] else 1)

    if args.test:
        asyncio.run(_run_test())
    elif args.status:
        result = init()
        s = status()
        print(f"Name:       {s.name}")
        print(f"Available:  {s.available}")
        print(f"Healthy:    {s.healthy}")
        print(f"Version:    {s.version}")
        print(f"Executable: {result['executable']}")
        print(f"Error:      {s.error}")
    elif args.search:
        asyncio.run(_run_search(args.search, args.lang, args.dir))
    else:
        parser.print_help()
