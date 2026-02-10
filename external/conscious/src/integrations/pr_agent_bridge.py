"""
PR-Agent Bridge - Automated PR review and improvement for Super-Goose.

Wraps the ``pr-agent`` CLI tool via subprocess to provide automated pull
request review, description generation, and code improvement suggestions
for Goose agents through the Conscious bridge layer.

PR-Agent (https://github.com/Codium-ai/pr-agent) is an AI-powered tool
for automated code review.  It analyzes pull requests and provides:
  - Code review with actionable feedback
  - PR description generation
  - Code improvement suggestions

Bridge operations:
    review      - Review a pull request and provide feedback
    describe    - Generate a description for a pull request
    improve     - Suggest code improvements for a pull request

Binary resolution order:
    1. ``pr-agent`` on PATH
    2. ``python -m pr_agent`` (module invocation)

Architecture:
    Goose Agent --> Conscious Bridge --> pr_agent_bridge.py --> subprocess
                                                            --> pr-agent CLI

Capabilities registered in external_tools.toml:
    pr_review, pr_describe, pr_improve

Tier: Stage 6-7 (CI/CD integration)
Port: N/A (CLI tool, no server port)

Typical usage via the ToolRegistry::

    result = await registry.execute("pr_agent", "review", {
        "pr_url": "https://github.com/owner/repo/pull/123",
    })

Reference:
    PR-Agent docs:   https://pr-agent-docs.codium.ai/
    PR-Agent GitHub: https://github.com/Codium-ai/pr-agent
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import subprocess
import sys
import threading
from dataclasses import dataclass
from typing import Any, Optional

# ---------------------------------------------------------------------------
# Registry import
# ---------------------------------------------------------------------------

try:
    from integrations.resource_coordinator import get_coordinator
except ImportError:
    get_coordinator = None  # type: ignore[assignment,misc]

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

#: Subprocess timeout defaults (seconds)
COMMAND_TIMEOUT = 300  # 5 minutes -- PR analysis can be slow

# ---------------------------------------------------------------------------
# Module-level state (lazy init)
# ---------------------------------------------------------------------------

_initialized: bool = False
_init_lock = threading.Lock()
_pr_agent_cmd: Optional[list[str]] = None
_pr_agent_version: Optional[str] = None


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------

def init() -> dict[str, Any]:
    """Initialize the PR-Agent bridge.

    Performs lazy discovery of the ``pr-agent`` CLI and caches the
    result for subsequent calls.  Safe to call multiple times.

    Resolution order:
        1. ``pr-agent`` on system PATH
        2. ``python -m pr_agent`` (module invocation)

    Returns:
        dict with keys:
            success (bool):   True if pr-agent is available.
            command (list):   Command list to invoke pr-agent, or None.
            version (str):    Version string, or None.
            error (str):      Error message if not found, else None.
    """
    global _initialized, _pr_agent_cmd, _pr_agent_version

    with _init_lock:
        if _initialized:
            return {
                "success": _pr_agent_cmd is not None,
                "command": _pr_agent_cmd,
                "version": _pr_agent_version,
                "error": None if _pr_agent_cmd else "pr-agent not found",
            }

        cmd: Optional[list[str]] = None

        # 1. Try pr-agent on PATH
        exe = shutil.which("pr-agent")
        if exe:
            cmd = [exe]

        # 2. Try python -m pr_agent
        if cmd is None:
            try:
                result = subprocess.run(
                    [sys.executable, "-m", "pr_agent", "--help"],
                    capture_output=True, text=True, timeout=15,
                )
                if result.returncode == 0:
                    cmd = [sys.executable, "-m", "pr_agent"]
            except (subprocess.TimeoutExpired, OSError):
                pass

        # 3. Try import to check availability
        if cmd is None:
            try:
                import pr_agent  # noqa: F401
                cmd = [sys.executable, "-m", "pr_agent"]
            except ImportError:
                pass

        # 4. Get version if found
        if cmd and _pr_agent_version is None:
            try:
                result = subprocess.run(
                    cmd + ["--version"],
                    capture_output=True, text=True, timeout=15,
                )
                if result.returncode == 0:
                    _pr_agent_version = result.stdout.strip()
            except (subprocess.TimeoutExpired, OSError):
                # Version retrieval is optional; pr-agent may not support --version
                _pr_agent_version = "unknown"

        _pr_agent_cmd = cmd
        _initialized = True

        if _pr_agent_cmd:
            logger.info(
                "PR-Agent bridge initialized: %s (v%s)",
                " ".join(_pr_agent_cmd), _pr_agent_version,
            )
        else:
            logger.warning(
                "PR-Agent bridge: pr-agent not found. "
                "Install with: pip install pr-agent"
            )

        return {
            "success": _pr_agent_cmd is not None,
            "command": _pr_agent_cmd,
            "version": _pr_agent_version,
            "error": None if _pr_agent_cmd else "pr-agent not found",
        }


# ---------------------------------------------------------------------------
# Status / capabilities
# ---------------------------------------------------------------------------

def status() -> ToolStatus:
    """Return the current health status of the PR-Agent tool.

    Returns:
        ToolStatus with availability and version information.
    """
    state = init()
    return ToolStatus(
        name="PR-Agent",
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
        "pr_review",
        "pr_describe",
        "pr_improve",
    ]


# ---------------------------------------------------------------------------
# Core operations
# ---------------------------------------------------------------------------

async def review(pr_url: str) -> dict[str, Any]:
    """Review a pull request and provide feedback.

    Runs ``pr-agent --pr_url <pr_url> review`` to analyze the pull
    request and generate review comments.

    Args:
        pr_url: Full URL of the pull request to review
                (e.g. ``"https://github.com/owner/repo/pull/123"``).

    Returns:
        dict with keys:
            success (bool):  True if the review completed.
            pr_url (str):    The PR URL that was reviewed.
            output (str):    Raw output from pr-agent.
            error (str):     Error message if failed, else None.
    """
    state = init()
    if not state["success"]:
        return _error_not_installed()

    cmd = list(_pr_agent_cmd) + ["--pr_url", pr_url, "review"]
    return await _run_pr_agent(cmd, context={"pr_url": pr_url, "operation": "review"})


async def describe(pr_url: str) -> dict[str, Any]:
    """Generate a description for a pull request.

    Runs ``pr-agent --pr_url <pr_url> describe`` to analyze the pull
    request and generate a descriptive summary.

    Args:
        pr_url: Full URL of the pull request to describe
                (e.g. ``"https://github.com/owner/repo/pull/123"``).

    Returns:
        dict with keys:
            success (bool):  True if description was generated.
            pr_url (str):    The PR URL that was described.
            output (str):    Raw output from pr-agent.
            error (str):     Error message if failed, else None.
    """
    state = init()
    if not state["success"]:
        return _error_not_installed()

    cmd = list(_pr_agent_cmd) + ["--pr_url", pr_url, "describe"]
    return await _run_pr_agent(cmd, context={"pr_url": pr_url, "operation": "describe"})


async def improve(pr_url: str) -> dict[str, Any]:
    """Suggest code improvements for a pull request.

    Runs ``pr-agent --pr_url <pr_url> improve`` to analyze the pull
    request and suggest code improvements.

    Args:
        pr_url: Full URL of the pull request to improve
                (e.g. ``"https://github.com/owner/repo/pull/123"``).

    Returns:
        dict with keys:
            success (bool):  True if improvements were generated.
            pr_url (str):    The PR URL that was analyzed.
            output (str):    Raw output from pr-agent.
            error (str):     Error message if failed, else None.
    """
    state = init()
    if not state["success"]:
        return _error_not_installed()

    cmd = list(_pr_agent_cmd) + ["--pr_url", pr_url, "improve"]
    return await _run_pr_agent(cmd, context={"pr_url": pr_url, "operation": "improve"})


# ---------------------------------------------------------------------------
# Registry dispatch
# ---------------------------------------------------------------------------

async def execute(operation: str, params: dict[str, Any]) -> dict[str, Any]:
    """Dispatch an operation from the ToolRegistry.

    This is the unified entry point called by
    ``ToolRegistry.execute("pr_agent", operation, params)``.

    Args:
        operation: The operation name to perform.
        params: Keyword arguments forwarded to the operation function.

    Returns:
        Operation result dictionary.  Always includes a ``success`` key.

    Supported operations:
        - ``"init"``          -- initialize the bridge
        - ``"status"``        -- get bridge health status
        - ``"capabilities"``  -- list capabilities
        - ``"review"``        -- review a pull request
        - ``"describe"``      -- describe a pull request
        - ``"improve"``       -- suggest improvements for a pull request
    """
    async_dispatch: dict[str, Any] = {
        "review": review,
        "describe": describe,
        "improve": improve,
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

    async def _do_operation() -> dict[str, Any]:
        return await async_dispatch[operation](**params)

    coordinator = get_coordinator() if get_coordinator is not None else None
    if coordinator is not None:
        try:
            async with coordinator.acquire("pr_agent", "review"):
                return await _do_operation()
        except Exception as coord_err:
            logger.warning(
                "ResourceCoordinator unavailable, running without coordination: %s",
                coord_err,
            )

    try:
        return await _do_operation()
    except TypeError as exc:
        return {"success": False, "error": f"Invalid parameters for {operation}: {exc}"}
    except Exception as exc:
        logger.exception("execute(%s) failed", operation)
        return {"success": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _error_not_installed() -> dict[str, Any]:
    """Return a standardized error when pr-agent is not available."""
    return {
        "success": False,
        "output": "",
        "error": (
            "PR-Agent is not installed or not found on PATH. "
            "Install with: pip install pr-agent"
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


async def _run_pr_agent(
    cmd: list[str],
    timeout: int = COMMAND_TIMEOUT,
    context: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Execute a pr-agent subprocess asynchronously.

    Uses ``asyncio.create_subprocess_exec`` for non-blocking execution.

    Args:
        cmd: Full command list (executable + arguments).
        timeout: Maximum execution time in seconds.
        context: Additional key-value pairs merged into the return dict.

    Returns:
        dict with ``success``, ``output``, ``stderr``, and ``error`` keys.
    """
    result: dict[str, Any] = {
        "success": False,
        "output": "",
        "stderr": "",
        "error": None,
    }
    if context:
        result.update(context)

    logger.debug("pr-agent exec: %s (timeout=%ds)", " ".join(cmd[:6]), timeout)

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            result["error"] = f"pr-agent timed out after {timeout}s"
            logger.warning("pr-agent timed out: %s", " ".join(cmd[:5]))
            return result

        stdout = stdout_bytes.decode("utf-8", errors="replace").strip()
        stderr = stderr_bytes.decode("utf-8", errors="replace").strip()

        result["output"] = stdout
        result["stderr"] = stderr

        if process.returncode == 0:
            result["success"] = True
        else:
            result["success"] = False
            result["error"] = stderr or f"pr-agent exited with code {process.returncode}"
            logger.warning(
                "pr-agent exit %d: %s", process.returncode, stderr[:200],
            )

    except FileNotFoundError:
        result["error"] = f"pr-agent binary not found: {cmd[0]}"
        global _initialized
        _initialized = False
        logger.error("pr-agent binary vanished: %s", cmd[0])

    except OSError as exc:
        result["error"] = f"Failed to start pr-agent process: {exc}"
        logger.error("pr-agent OSError: %s", exc)

    return result


# ---------------------------------------------------------------------------
# CLI test entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="PR-Agent Bridge - Automated PR review for Super-Goose",
    )
    parser.add_argument(
        "--test", "--selftest", action="store_true",
        help="Run a quick self-test of bridge functionality",
    )
    parser.add_argument(
        "--status", action="store_true",
        help="Show bridge status",
    )
    parser.add_argument(
        "--review", type=str, default=None, metavar="PR_URL",
        help="Review a pull request by URL",
    )
    parser.add_argument(
        "--describe", type=str, default=None, metavar="PR_URL",
        help="Generate description for a pull request by URL",
    )
    parser.add_argument(
        "--improve", type=str, default=None, metavar="PR_URL",
        help="Suggest improvements for a pull request by URL",
    )
    args = parser.parse_args()

    async def _run_test() -> None:
        """Execute the self-test sequence."""
        print("=" * 60)
        print("PR-Agent Bridge Self-Test")
        print("=" * 60)

        # Init
        result = init()
        print(f"\n[init] command={result['command']}")
        print(f"[init] version={result['version']}")
        print(f"[init] success={result['success']}")

        if not result["success"]:
            print("\nWARNING: pr-agent not found. Install with: pip install pr-agent")
            print("Continuing with offline tests only...")

        # Status
        s = status()
        print(f"\n[status] available={s.available}, healthy={s.healthy}")

        # Capabilities
        caps = capabilities()
        print(f"[capabilities] {caps}")

        print("\n" + "=" * 60)
        print("Self-test complete.")
        print("=" * 60)

    async def _run_review(pr_url: str) -> None:
        """Run a review from CLI."""
        init()
        result = await review(pr_url)
        print(f"Success: {result['success']}")
        if result.get("output"):
            print(f"Output:\n{result['output']}")
        if result.get("error"):
            print(f"Error: {result['error']}")

    async def _run_describe(pr_url: str) -> None:
        """Run describe from CLI."""
        init()
        result = await describe(pr_url)
        print(f"Success: {result['success']}")
        if result.get("output"):
            print(f"Output:\n{result['output']}")
        if result.get("error"):
            print(f"Error: {result['error']}")

    async def _run_improve(pr_url: str) -> None:
        """Run improve from CLI."""
        init()
        result = await improve(pr_url)
        print(f"Success: {result['success']}")
        if result.get("output"):
            print(f"Output:\n{result['output']}")
        if result.get("error"):
            print(f"Error: {result['error']}")

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
    elif args.review:
        asyncio.run(_run_review(args.review))
    elif args.describe:
        asyncio.run(_run_describe(args.describe))
    elif args.improve:
        asyncio.run(_run_improve(args.improve))
    else:
        parser.print_help()
