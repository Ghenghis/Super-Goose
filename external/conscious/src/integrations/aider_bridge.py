"""
Aider Bridge - Super-Goose integration for the Aider AI pair programming tool.

Wraps Aider's CLI interface to provide async code editing, repository mapping,
auto-commit, and lint-fix operations for use by Goose agents via the Conscious
bridge layer.

Aider is invoked through subprocess to maintain process isolation and avoid
import-time side effects from Aider's heavy dependency tree (LiteLLM, tree-sitter,
pygments, etc.).

Bridge operations:
    edit_file       - Edit a file using one of Aider's 14+ edit strategies
    map_repo        - Generate a tree-sitter repository context map
    auto_commit     - Create a git commit with Aider's smart commit messages
    lint_and_fix    - Run linter and auto-fix issues on a file
    list_strategies - Return all available code editing strategies
    status          - Check Aider availability and version
    init            - Lazy initialization and validation
    capabilities    - List supported operations
    execute         - Unified dispatch for the ToolRegistry

Configuration is read from config/external_tools.toml under [tools.aider].

Reference:
    Aider source: G:/goose/external/aider
    Aider docs:   https://aider.chat
    Version:      0.86.2.dev (local fork)
"""

import asyncio
import logging
import os
import shutil
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any, Optional

# Import ToolStatus from the registry to maintain a consistent interface
# across all bridge modules.
from integrations.registry import ToolStatus
from integrations.resource_coordinator import get_coordinator

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Path to the local Aider installation
AIDER_ROOT = Path(__file__).resolve().parent.parent.parent.parent / "aider"
# Equivalent: G:/goose/external/aider

# All edit format strategies supported by Aider coders, derived from each
# coder class's edit_format attribute.  Kept in alphabetical order.
EDIT_STRATEGIES: dict[str, str] = {
    "architect":          "Two-phase: architect LLM proposes, editor LLM applies changes",
    "ask":                "Ask-only mode -- no file edits, just discussion",
    "context":            "Context-aware editing with focused file ranges",
    "diff":               "Search/replace block editing (default, most reliable)",
    "diff-fenced":        "Fenced search/replace blocks with markdown delimiters",
    "editor-diff":        "Editor sub-agent with search/replace block format",
    "editor-diff-fenced": "Editor sub-agent with fenced diff format",
    "editor-whole":       "Editor sub-agent with whole-file replacement",
    "help":               "Help/instruction mode -- no file edits",
    "patch":              "Patch-style editing with context lines",
    "udiff":              "Unified diff format editing",
    "udiff-simple":       "Simplified unified diff format",
    "whole":              "Whole-file replacement (safest, highest token cost)",
}

# Default edit strategy when none is specified
DEFAULT_EDIT_STRATEGY = "diff"

# Default model -- can be overridden via environment or function params.
# None means Aider will use its own default selection logic.
DEFAULT_MODEL: Optional[str] = os.environ.get("AIDER_MODEL")

# Subprocess timeout defaults (seconds)
EDIT_TIMEOUT = 300      # 5 minutes -- LLM calls can be slow
MAP_TIMEOUT = 120       # 2 minutes -- tree-sitter parsing
COMMIT_TIMEOUT = 60     # 1 minute  -- git operations
LINT_TIMEOUT = 120      # 2 minutes -- linting + auto-fix

# ---------------------------------------------------------------------------
# Module-level state (lazy init)
# ---------------------------------------------------------------------------

_initialized: bool = False
_init_lock = threading.Lock()
_aider_executable: Optional[str] = None
_aider_version: Optional[str] = None


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------

def init() -> dict[str, Any]:
    """
    Initialize the Aider bridge.

    Performs lazy discovery of the ``aider`` CLI executable and caches the
    result for subsequent calls.  Safe to call multiple times -- subsequent
    calls are no-ops that return the cached state.

    Returns:
        dict with keys:
            success (bool):   True if Aider is available and functional.
            executable (str): Resolved path to the ``aider`` binary, or None.
            version (str):    Aider version string, or None.
            error (str):      Error message if initialization failed.
    """
    global _initialized, _aider_executable, _aider_version

    with _init_lock:
        if _initialized:
            return {
                "success": _aider_executable is not None,
                "executable": _aider_executable,
                "version": _aider_version,
                "error": None if _aider_executable else "Aider executable not found",
            }

        # 1. Try to find aider on PATH
        exe = shutil.which("aider")

        # 2. Fallback: check the local installation's scripts directory
        if exe is None:
            local_candidates = [
                AIDER_ROOT / ".venv" / "Scripts" / "aider.exe",   # Windows venv
                AIDER_ROOT / ".venv" / "bin" / "aider",           # Unix venv
                AIDER_ROOT / "venv" / "Scripts" / "aider.exe",
                AIDER_ROOT / "venv" / "bin" / "aider",
            ]
            for candidate in local_candidates:
                if candidate.exists():
                    exe = str(candidate)
                    break

        # 3. Fallback: invoke via python -m aider
        if exe is None and AIDER_ROOT.exists():
            # Verify the package is importable from the local tree
            try:
                result = subprocess.run(
                    [sys.executable, "-c", "import aider; print(aider.__version__)"],
                    capture_output=True, text=True, timeout=15,
                    cwd=str(AIDER_ROOT),
                    env={**os.environ, "PYTHONPATH": str(AIDER_ROOT)},
                )
                if result.returncode == 0 and result.stdout.strip():
                    # Use python -m invocation
                    exe = f"{sys.executable} -m aider"
                    _aider_version = result.stdout.strip()
            except (subprocess.TimeoutExpired, OSError):
                pass

        # 4. Retrieve version if we found a direct executable
        if exe and _aider_version is None:
            try:
                result = subprocess.run(
                    _split_cmd(exe) + ["--version"],
                    capture_output=True, text=True, timeout=15,
                )
                if result.returncode == 0:
                    _aider_version = result.stdout.strip()
            except (subprocess.TimeoutExpired, OSError):
                pass

        _aider_executable = exe if exe else None
        _initialized = True

        if _aider_executable:
            logger.info(f"Aider bridge initialized: {_aider_executable} (v{_aider_version})")
        else:
            logger.warning(
                "Aider bridge: executable not found. "
                f"Install with: pip install -e {AIDER_ROOT}"
            )

        return {
            "success": _aider_executable is not None,
            "executable": _aider_executable,
            "version": _aider_version,
            "error": None if _aider_executable else "Aider executable not found",
        }


# ---------------------------------------------------------------------------
# Status / capabilities
# ---------------------------------------------------------------------------

def status() -> ToolStatus:
    """
    Return the current health status of the Aider tool.

    Called by ``ToolRegistry.check_status("aider")`` to populate the
    registry dashboard.

    Returns:
        ToolStatus dataclass with availability, health, version, and
        any error information.
    """
    state = init()
    return ToolStatus(
        name="Aider",
        available=state["success"],
        healthy=state["success"],
        version=state["version"],
        error=state["error"],
    )


def capabilities() -> list[str]:
    """
    Return the list of operations this bridge supports.

    Matches the ``capabilities`` field in external_tools.toml so the
    registry can validate routing.

    Returns:
        List of capability strings.
    """
    return ["code_edit", "repo_map", "auto_commit", "auto_lint", "voice_input"]


# ---------------------------------------------------------------------------
# Core operations
# ---------------------------------------------------------------------------

async def edit_file(
    file_path: str,
    instruction: str,
    edit_strategy: str = DEFAULT_EDIT_STRATEGY,
    model: Optional[str] = None,
    auto_commit: bool = False,
    auto_lint: bool = True,
    extra_args: Optional[list[str]] = None,
) -> dict[str, Any]:
    """
    Edit a file using Aider with the specified instruction and strategy.

    Invokes Aider in non-interactive (``--message``) mode so it processes
    the instruction, applies edits, and exits.

    Args:
        file_path:      Absolute or repo-relative path to the file to edit.
        instruction:    Natural-language instruction describing the desired change.
        edit_strategy:  One of the keys from ``EDIT_STRATEGIES``.
                        Defaults to ``"diff"`` (search/replace blocks).
        model:          LLM model identifier (e.g. ``"claude-3-opus-20240229"``).
                        If None, Aider uses its own default model selection.
        auto_commit:    Whether to auto-commit changes after editing.
        auto_lint:      Whether to auto-lint after editing.
        extra_args:     Additional CLI arguments forwarded to Aider verbatim.

    Returns:
        dict with keys:
            success (bool):  True if Aider exited cleanly.
            output (str):    Combined stdout from the Aider process.
            error (str):     Error message if the operation failed, else None.
            file (str):      The file path that was edited.
            strategy (str):  The edit strategy that was used.
    """
    state = init()
    if not state["success"]:
        return _error_not_installed()

    # Validate edit strategy
    if edit_strategy not in EDIT_STRATEGIES:
        return {
            "success": False,
            "output": "",
            "error": (
                f"Unknown edit strategy '{edit_strategy}'. "
                f"Valid strategies: {', '.join(sorted(EDIT_STRATEGIES.keys()))}"
            ),
            "file": file_path,
            "strategy": edit_strategy,
        }

    # Validate file exists
    target = Path(file_path)
    if not target.exists():
        return {
            "success": False,
            "output": "",
            "error": f"File not found: {file_path}",
            "file": file_path,
            "strategy": edit_strategy,
        }

    # Build command
    cmd = _split_cmd(_aider_executable)
    cmd += [
        "--message", instruction,
        "--edit-format", edit_strategy,
        "--yes-always",
        "--no-auto-commits" if not auto_commit else "--auto-commits",
        "--auto-lint" if auto_lint else "--no-auto-lint",
        "--no-gui",
    ]

    if model or DEFAULT_MODEL:
        cmd += ["--model", model or DEFAULT_MODEL]

    if extra_args:
        cmd += extra_args

    # The target file must come last as a positional argument
    cmd.append(str(target))

    # Derive working directory from the file's location
    cwd = str(target.parent)

    return await _run_aider(cmd, cwd=cwd, timeout=EDIT_TIMEOUT, context={
        "file": file_path,
        "strategy": edit_strategy,
    })


async def map_repo(
    repo_path: str,
    map_tokens: int = 2048,
    model: Optional[str] = None,
) -> dict[str, Any]:
    """
    Generate a repository context map using Aider's tree-sitter integration.

    Aider builds a ranked tag map of the repository -- function signatures,
    class definitions, imports -- that fits within the specified token budget.
    This is useful for providing an LLM with a high-level view of the codebase.

    Args:
        repo_path:   Path to the repository root directory.
        map_tokens:  Target token budget for the map output.
        model:       LLM model identifier (used for tokenizer selection).

    Returns:
        dict with keys:
            success (bool):  True if the map was generated.
            output (str):    The repository map text.
            error (str):     Error message if the operation failed, else None.
            repo (str):      The repository path that was mapped.
    """
    state = init()
    if not state["success"]:
        return _error_not_installed()

    repo = Path(repo_path)
    if not repo.is_dir():
        return {
            "success": False,
            "output": "",
            "error": f"Repository path not found or not a directory: {repo_path}",
            "repo": repo_path,
        }

    # Use --show-repo-map to dump the map and exit
    cmd = _split_cmd(_aider_executable)
    cmd += [
        "--show-repo-map",
        "--map-tokens", str(map_tokens),
        "--yes-always",
        "--no-auto-commits",
        "--no-git",          # Don't require a git repo
        "--exit",            # Exit immediately after showing the map
    ]

    if model or DEFAULT_MODEL:
        cmd += ["--model", model or DEFAULT_MODEL]

    return await _run_aider(cmd, cwd=str(repo), timeout=MAP_TIMEOUT, context={
        "repo": repo_path,
    })


async def auto_commit_changes(
    repo_path: str,
    message: Optional[str] = None,
    model: Optional[str] = None,
) -> dict[str, Any]:
    """
    Create a git commit using Aider's smart commit message generation.

    If ``message`` is provided, it is used directly as the commit message.
    Otherwise, Aider generates a descriptive message from the staged changes
    using an LLM.

    This function stages all modified tracked files before committing.  To
    commit specific files, stage them manually beforehand and pass an explicit
    message.

    Args:
        repo_path:  Path to the git repository.
        message:    Optional explicit commit message.  If None, Aider
                    generates one from the diff.
        model:      LLM model identifier for commit message generation.

    Returns:
        dict with keys:
            success (bool):  True if the commit was created.
            output (str):    Git/Aider output including the commit hash.
            error (str):     Error message if the operation failed, else None.
            repo (str):      The repository path.
    """
    state = init()
    if not state["success"]:
        return _error_not_installed()

    repo = Path(repo_path)
    if not repo.is_dir():
        return {
            "success": False,
            "output": "",
            "error": f"Repository path not found: {repo_path}",
            "repo": repo_path,
        }

    # Aider's --commit flag triggers a commit of pending changes and exits
    cmd = _split_cmd(_aider_executable)
    cmd += [
        "--commit",
        "--yes-always",
    ]

    if message:
        cmd += ["--commit-prompt", message]

    if model or DEFAULT_MODEL:
        cmd += ["--model", model or DEFAULT_MODEL]

    return await _run_aider(cmd, cwd=str(repo), timeout=COMMIT_TIMEOUT, context={
        "repo": repo_path,
    })


async def lint_and_fix(
    file_path: str,
    lint_cmd: Optional[str] = None,
    model: Optional[str] = None,
    auto_commit: bool = False,
) -> dict[str, Any]:
    """
    Run a linter on a file and use Aider to auto-fix any issues found.

    Aider's ``--auto-lint`` feature runs the configured linter after each
    edit and automatically applies fixes.  This function triggers a
    lint-fix cycle on the specified file by sending a minimal instruction.

    Args:
        file_path:   Path to the file to lint and fix.
        lint_cmd:    Custom lint command (e.g. ``"ruff check --fix"``).
                     If None, Aider uses its built-in Python linter for
                     ``.py`` files, or the globally configured linter.
        model:       LLM model identifier.
        auto_commit: Whether to auto-commit the fixes.

    Returns:
        dict with keys:
            success (bool):  True if linting completed (even if no issues found).
            output (str):    Linter and Aider output.
            error (str):     Error message if the operation failed, else None.
            file (str):      The file path that was linted.
    """
    state = init()
    if not state["success"]:
        return _error_not_installed()

    target = Path(file_path)
    if not target.exists():
        return {
            "success": False,
            "output": "",
            "error": f"File not found: {file_path}",
            "file": file_path,
        }

    cmd = _split_cmd(_aider_executable)
    cmd += [
        "--message", "Lint this file and fix any issues found.",
        "--auto-lint",
        "--yes-always",
        "--no-auto-commits" if not auto_commit else "--auto-commits",
    ]

    if lint_cmd:
        cmd += ["--lint-cmd", lint_cmd]

    if model or DEFAULT_MODEL:
        cmd += ["--model", model or DEFAULT_MODEL]

    cmd.append(str(target))

    cwd = str(target.parent)

    return await _run_aider(cmd, cwd=cwd, timeout=LINT_TIMEOUT, context={
        "file": file_path,
    })


def list_strategies() -> dict[str, Any]:
    """
    Return all available code editing strategies with descriptions.

    This is a synchronous convenience function that does not require
    Aider to be installed -- the strategy list is maintained statically
    in this module and kept in sync with the coder classes in
    ``aider/coders/``.

    Returns:
        dict with keys:
            success (bool):       Always True.
            strategies (dict):    Mapping of strategy name to description.
            default (str):        The default strategy name.
            count (int):          Number of available strategies.
    """
    return {
        "success": True,
        "strategies": dict(EDIT_STRATEGIES),
        "default": DEFAULT_EDIT_STRATEGY,
        "count": len(EDIT_STRATEGIES),
    }


# ---------------------------------------------------------------------------
# Unified execute dispatch (called by ToolRegistry)
# ---------------------------------------------------------------------------

async def execute(operation: str, params: dict[str, Any]) -> dict[str, Any]:
    """
    Unified dispatch for the ToolRegistry.

    Routes an operation name and parameter dict to the appropriate bridge
    function.  This is the primary entry point used by
    ``ToolRegistry.execute("aider", operation, params)``.

    Supported operations:
        edit_file       -> edit_file(**params)
        map_repo        -> map_repo(**params)
        auto_commit     -> auto_commit_changes(**params)
        lint_and_fix    -> lint_and_fix(**params)
        list_strategies -> list_strategies()
        status          -> status().__dict__
        init            -> init()

    Args:
        operation:  Name of the operation to execute.
        params:     Keyword arguments forwarded to the operation function.

    Returns:
        dict with at least ``success`` and ``error`` keys.
    """
    dispatch = {
        "edit_file":       edit_file,
        "map_repo":        map_repo,
        "auto_commit":     auto_commit_changes,
        "lint_and_fix":    lint_and_fix,
        "list_strategies": None,  # sync, handled separately
        "status":          None,  # sync, handled separately
        "init":            None,  # sync, handled separately
    }

    if operation not in dispatch:
        return {
            "success": False,
            "error": (
                f"Unknown operation '{operation}'. "
                f"Available: {', '.join(sorted(dispatch.keys()))}"
            ),
        }

    # Synchronous operations
    if operation == "list_strategies":
        return list_strategies()
    if operation == "status":
        s = status()
        return {
            "success": s.healthy,
            "name": s.name,
            "available": s.available,
            "healthy": s.healthy,
            "version": s.version,
            "error": s.error,
        }
    if operation == "init":
        return init()

    # Async operations with ResourceCoordinator
    async def _do_operation():
        func = dispatch[operation]
        return await func(**params)

    coordinator = get_coordinator()
    try:
        async with coordinator.acquire("aider", "edit"):
            return await _do_operation()
    except Exception as coord_err:
        logger.warning(
            "ResourceCoordinator unavailable, running without coordination: %s",
            coord_err,
        )
        try:
            return await _do_operation()
        except TypeError as e:
            return {
                "success": False,
                "error": f"Invalid parameters for '{operation}': {e}",
            }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _split_cmd(cmd_str: str) -> list[str]:
    """
    Split a command string into a list suitable for subprocess.

    Handles the case where ``_aider_executable`` might be a multi-word
    string like ``"python -m aider"``.

    Args:
        cmd_str: The command string to split.

    Returns:
        List of command components.
    """
    if cmd_str is None:
        return []
    return cmd_str.split()


def _error_not_installed() -> dict[str, Any]:
    """
    Return a standardized error dict when Aider is not available.

    Returns:
        dict with success=False and an informative error message including
        the install command.
    """
    return {
        "success": False,
        "output": "",
        "error": (
            "Aider is not installed or not found on PATH. "
            f"Install with: pip install -e {AIDER_ROOT}"
        ),
    }


async def _run_aider(
    cmd: list[str],
    cwd: str,
    timeout: int,
    context: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Execute an Aider subprocess asynchronously and capture its output.

    Uses ``asyncio.create_subprocess_exec`` for non-blocking execution so
    the bridge does not stall the event loop during long LLM calls.

    The subprocess inherits the current environment with ``AIDER_YES=true``
    injected to suppress interactive prompts, and ``PYTHONUNBUFFERED=1``
    to ensure real-time output capture.

    Args:
        cmd:      Full command list (executable + arguments).
        cwd:      Working directory for the subprocess.
        timeout:  Maximum execution time in seconds.
        context:  Additional key-value pairs merged into the return dict.

    Returns:
        dict with keys:
            success (bool):  True if the process exited with code 0.
            output (str):    Combined stdout from the process.
            error (str):     Stderr content or timeout message, else None.
            Plus any keys from ``context``.
    """
    env = {**os.environ}
    env["AIDER_YES"] = "true"
    env["PYTHONUNBUFFERED"] = "1"
    # Prevent Aider from launching a browser or interactive prompts
    env["AIDER_NO_GUI"] = "true"

    result = {
        "success": False,
        "output": "",
        "error": None,
    }
    if context:
        result.update(context)

    logger.debug(f"Aider bridge exec: {' '.join(cmd)} (cwd={cwd}, timeout={timeout}s)")

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
            env=env,
        )

        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            result["error"] = (
                f"Aider process timed out after {timeout}s. "
                "Consider increasing the timeout or simplifying the instruction."
            )
            logger.warning(f"Aider timed out: {' '.join(cmd[:5])}...")
            return result

        stdout = stdout_bytes.decode("utf-8", errors="replace").strip()
        stderr = stderr_bytes.decode("utf-8", errors="replace").strip()

        result["output"] = stdout
        result["success"] = process.returncode == 0

        if process.returncode != 0:
            result["error"] = stderr or f"Aider exited with code {process.returncode}"
            logger.warning(
                f"Aider exited {process.returncode}: "
                f"{stderr[:200] if stderr else '(no stderr)'}"
            )
        elif stderr:
            # Non-fatal stderr (warnings, progress messages)
            logger.debug(f"Aider stderr (non-fatal): {stderr[:200]}")

    except FileNotFoundError:
        result["error"] = (
            f"Aider executable not found: {cmd[0]}. "
            "The tool may have been uninstalled since initialization."
        )
        # Reset initialization state so next call re-discovers
        global _initialized
        _initialized = False
        logger.error(f"Aider executable vanished: {cmd[0]}")

    except OSError as e:
        result["error"] = f"Failed to start Aider process: {e}"
        logger.error(f"Aider OSError: {e}")

    return result
