"""
OpenHands Bridge - Docker-sandboxed code execution for Super-Goose.

Wraps OpenHands's core capabilities (sandboxed execution, multi-agent routing,
browser automation) for use by Goose agents through the Conscious bridge layer.

OpenHands (https://github.com/All-Hands-AI/OpenHands) is an AI software engineer
platform that runs code inside Docker containers with 3-layer security, supports
6 agent types, and provides Playwright-based browser automation.

Architecture:
    Goose Agent --> Conscious Bridge --> openhands_bridge.py --> Docker CLI
                                                            --> OpenHands Python API

This bridge manages Docker containers via subprocess (not the Docker SDK) so it
works without requiring the ``docker`` Python package to be installed. Only the
Docker CLI binary (``docker`` / ``docker.exe``) is required on PATH.

Capabilities registered in external_tools.toml:
    sandbox_exec, docker, browser, multi_agent, security_scan

Typical usage via the ToolRegistry::

    result = await registry.execute("openhands", "sandbox_execute", {
        "command": "python3 -c 'print(1+1)'"
    })
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from integrations.resource_coordinator import get_coordinator

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Container name prefix matching OpenHands convention (see docker_runtime.py)
CONTAINER_NAME_PREFIX = "supergoose-oh-sandbox-"

#: Default sandbox image (matches OpenHands config.template.toml [sandbox])
DEFAULT_SANDBOX_IMAGE = "nikolaik/python-nodejs:python3.12-nodejs22"

#: Fallback lightweight image when the full OpenHands image is not needed
FALLBACK_SANDBOX_IMAGE = "python:3.12-slim"

#: Maximum seconds to wait for a command inside the sandbox
DEFAULT_EXEC_TIMEOUT = 120

#: Maximum seconds to wait for container creation / startup
CONTAINER_START_TIMEOUT = 60

#: Working directory inside the sandbox container
SANDBOX_WORKDIR = "/workspace"

#: Path to the OpenHands installation (sibling of this package)
OPENHANDS_ROOT = Path(__file__).resolve().parents[3] / "OpenHands"

#: Known OpenHands agent types (from openhands/agenthub/__init__.py)
AGENT_TYPES: dict[str, str] = {
    "CodeActAgent": "Primary coding agent with shell, editor, and Jupyter tools",
    "BrowsingAgent": "Web browsing and information retrieval agent",
    "ReadOnlyAgent": "Read-only analysis agent that cannot modify files",
    "VisualBrowsingAgent": "Visual browsing agent with screenshot understanding",
    "LocAgent": "Lines-of-code focused agent for targeted edits",
    "DummyAgent": "Testing/development placeholder agent",
}

#: Security layers available in OpenHands (from openhands/security/)
SECURITY_LAYERS = ("neural_network", "policy_invariant", "llm_risk_analyzer")


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class ToolStatus:
    """Runtime health status returned by ``status()``."""
    name: str
    available: bool
    healthy: bool
    error: Optional[str] = None
    version: Optional[str] = None


@dataclass
class SandboxInfo:
    """Metadata about a running sandbox container."""
    container_id: str
    container_name: str
    image: str
    status: str
    created_at: str
    workdir: str = SANDBOX_WORKDIR


@dataclass
class ExecResult:
    """Result of executing a command or code block in the sandbox."""
    success: bool
    exit_code: int
    stdout: str
    stderr: str
    duration_ms: float
    command: str
    language: str = "bash"


@dataclass
class AgentResult:
    """Result of running an OpenHands agent on a task."""
    success: bool
    agent_type: str
    task: str
    output: str
    error: Optional[str] = None
    iterations: int = 0
    duration_ms: float = 0.0


# ---------------------------------------------------------------------------
# Module-level state (lazy initialisation)
# ---------------------------------------------------------------------------

_docker_path: Optional[str] = None
_docker_available: bool = False
_openhands_available: bool = False
_active_container: Optional[str] = None  # container name
_initialized: bool = False
_init_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _run_cmd(
    args: list[str],
    *,
    timeout: float = DEFAULT_EXEC_TIMEOUT,
    input_data: Optional[str] = None,
) -> tuple[int, str, str]:
    """Run a subprocess asynchronously and return (exit_code, stdout, stderr).

    Args:
        args: Command and arguments list.
        timeout: Maximum wall-clock seconds before the process is killed.
        input_data: Optional string to send on stdin.

    Returns:
        Tuple of (exit_code, stdout_text, stderr_text).
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            stdin=asyncio.subprocess.PIPE if input_data else asyncio.subprocess.DEVNULL,
        )
        stdout_bytes, stderr_bytes = await asyncio.wait_for(
            proc.communicate(input=input_data.encode() if input_data else None),
            timeout=timeout,
        )
        return (
            proc.returncode or 0,
            stdout_bytes.decode(errors="replace").strip(),
            stderr_bytes.decode(errors="replace").strip(),
        )
    except asyncio.TimeoutError:
        # Kill the timed-out process
        try:
            proc.kill()  # type: ignore[union-attr]
        except ProcessLookupError:
            pass
        return (-1, "", f"Command timed out after {timeout}s: {' '.join(args)}")
    except FileNotFoundError:
        return (-1, "", f"Command not found: {args[0]}")
    except Exception as exc:
        return (-1, "", f"Unexpected error running command: {exc}")


def _docker(*args: str) -> list[str]:
    """Build a docker CLI command list.

    Returns:
        List starting with the docker binary path followed by the given args.

    Raises:
        RuntimeError: If Docker is not available.
    """
    if not _docker_available or not _docker_path:
        raise RuntimeError(
            "Docker is not available. Install Docker Desktop or Docker Engine "
            "and ensure the 'docker' command is on PATH."
        )
    return [_docker_path, *args]


def _container_name(suffix: Optional[str] = None) -> str:
    """Generate a unique container name with the standard prefix."""
    tag = suffix or uuid.uuid4().hex[:12]
    return f"{CONTAINER_NAME_PREFIX}{tag}"


async def _container_exists(name: str) -> bool:
    """Check whether a Docker container with the given name exists."""
    code, stdout, _ = await _run_cmd(
        _docker("ps", "-a", "--filter", f"name=^/{name}$", "--format", "{{.Names}}"),
        timeout=10,
    )
    return code == 0 and name in stdout.splitlines()


async def _container_running(name: str) -> bool:
    """Check whether a Docker container is currently running."""
    code, stdout, _ = await _run_cmd(
        _docker("ps", "--filter", f"name=^/{name}$", "--format", "{{.Status}}"),
        timeout=10,
    )
    return code == 0 and bool(stdout.strip())


async def _detect_docker() -> tuple[bool, Optional[str], Optional[str]]:
    """Detect whether Docker CLI is available and the daemon is reachable.

    Returns:
        Tuple of (available, docker_binary_path, version_string_or_error).
    """
    docker_bin = shutil.which("docker")
    if not docker_bin:
        return False, None, "Docker CLI not found on PATH"

    code, stdout, stderr = await _run_cmd([docker_bin, "version", "--format", "{{.Server.Version}}"], timeout=10)
    if code != 0:
        # Docker CLI exists but daemon may not be running
        return False, docker_bin, f"Docker daemon unreachable: {stderr or stdout}"

    return True, docker_bin, stdout.strip()


def _read_openhands_version() -> Optional[str]:
    """Read the OpenHands version from its pyproject.toml."""
    pyproject = OPENHANDS_ROOT / "pyproject.toml"
    if not pyproject.is_file():
        return None
    try:
        with open(pyproject, "r", encoding="utf-8") as fh:
            for line in fh:
                stripped = line.strip()
                if stripped.startswith("version") and "=" in stripped:
                    return stripped.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def init() -> dict[str, Any]:
    """Initialise the OpenHands bridge.

    Checks for Docker availability and locates the OpenHands installation.
    Safe to call multiple times; subsequent calls return cached state.

    Returns:
        Dictionary with initialisation results::

            {
                "initialized": bool,
                "docker_available": bool,
                "docker_version": str | None,
                "openhands_path": str,
                "openhands_available": bool,
                "openhands_version": str | None,
                "agents": list[str],
            }
    """
    global _docker_path, _docker_available, _openhands_available, _initialized

    with _init_lock:
        if _initialized:
            return {
                "initialized": True,
                "docker_available": _docker_available,
                "docker_version": None,
                "openhands_path": str(OPENHANDS_ROOT),
                "openhands_available": _openhands_available,
                "openhands_version": _read_openhands_version(),
                "agents": list(AGENT_TYPES.keys()),
            }

        docker_ok, docker_bin, docker_info = await _detect_docker()
        _docker_available = docker_ok
        _docker_path = docker_bin

        _openhands_available = OPENHANDS_ROOT.is_dir() and (OPENHANDS_ROOT / "openhands").is_dir()

        _initialized = True

        docker_version = docker_info if docker_ok else None
        if not docker_ok:
            logger.warning("OpenHands bridge: Docker not available - %s", docker_info)
        if not _openhands_available:
            logger.warning(
                "OpenHands bridge: OpenHands not found at %s", OPENHANDS_ROOT
            )

        logger.info(
            "OpenHands bridge initialised: docker=%s, openhands=%s",
            _docker_available,
            _openhands_available,
        )

        return {
            "initialized": True,
            "docker_available": _docker_available,
            "docker_version": docker_version,
            "openhands_path": str(OPENHANDS_ROOT),
            "openhands_available": _openhands_available,
            "openhands_version": _read_openhands_version(),
            "agents": list(AGENT_TYPES.keys()),
        }


def status() -> ToolStatus:
    """Return current health status of the OpenHands bridge.

    This is the entry point called by ``ToolRegistry.check_status("openhands")``.

    Returns:
        ToolStatus with availability and health information.
    """
    if not _initialized:
        return ToolStatus(
            name="openhands",
            available=False,
            healthy=False,
            error="Bridge not initialised. Call init() first.",
        )

    if not _docker_available:
        return ToolStatus(
            name="openhands",
            available=_openhands_available,
            healthy=False,
            error="Docker is not available. Sandbox operations require Docker.",
            version=_read_openhands_version(),
        )

    if not _openhands_available:
        return ToolStatus(
            name="openhands",
            available=False,
            healthy=False,
            error=f"OpenHands not found at {OPENHANDS_ROOT}",
        )

    return ToolStatus(
        name="openhands",
        available=True,
        healthy=True,
        version=_read_openhands_version(),
    )


def capabilities() -> list[str]:
    """Return the list of capabilities this bridge provides.

    These match the capability strings in external_tools.toml.
    """
    return ["sandbox_exec", "docker", "browser", "multi_agent", "security_scan"]


# ---------------------------------------------------------------------------
# Sandbox lifecycle
# ---------------------------------------------------------------------------

async def create_sandbox(
    image: str = DEFAULT_SANDBOX_IMAGE,
    *,
    name: Optional[str] = None,
    workdir: str = SANDBOX_WORKDIR,
    env_vars: Optional[dict[str, str]] = None,
    memory_limit: str = "2g",
    cpu_limit: str = "2",
    network: str = "none",
) -> dict[str, Any]:
    """Create and start a new Docker sandbox container.

    The container is started in detached mode with ``tail -f /dev/null``
    to keep it alive, then commands are injected via ``docker exec``.

    Args:
        image: Docker image to use. Defaults to the OpenHands standard image
            (nikolaik/python-nodejs:python3.12-nodejs22).
        name: Optional container name. If not given a unique name is generated.
        workdir: Working directory inside the container.
        env_vars: Optional environment variables to set in the container.
        memory_limit: Docker memory limit (e.g. ``"2g"``).
        cpu_limit: Docker CPU limit (e.g. ``"2"``).
        network: Docker network mode. Defaults to ``"none"`` for isolation.

    Returns:
        Dictionary with container details::

            {
                "success": bool,
                "container_name": str,
                "container_id": str | None,
                "image": str,
                "error": str | None,
            }
    """
    global _active_container

    if not _initialized:
        await init()

    if not _docker_available:
        return {
            "success": False,
            "container_name": "",
            "container_id": None,
            "image": image,
            "error": "Docker is not available",
        }

    cname = name or _container_name()

    # If there is already an active container, refuse to leak resources
    if _active_container:
        exists = await _container_exists(_active_container)
        if exists:
            return {
                "success": False,
                "container_name": _active_container,
                "container_id": None,
                "image": image,
                "error": (
                    f"Sandbox already active: {_active_container}. "
                    "Call destroy_sandbox() first."
                ),
            }
        # Previous container no longer exists, clear stale reference
        _active_container = None

    # Build the docker run command
    cmd = _docker(
        "run", "-d",
        "--name", cname,
        "--workdir", workdir,
        "--memory", memory_limit,
        "--cpus", cpu_limit,
        "--network", network,
        "--security-opt", "no-new-privileges:true",
        "--cap-drop", "ALL",
        "--cap-add", "CHOWN",
        "--cap-add", "DAC_OVERRIDE",
        "--cap-add", "FOWNER",
        "--cap-add", "SETGID",
        "--cap-add", "SETUID",
    )

    # Environment variables
    if env_vars:
        for key, value in env_vars.items():
            cmd.extend(["-e", f"{key}={value}"])

    # Image and command to keep container alive
    cmd.extend([image, "tail", "-f", "/dev/null"])

    code, stdout, stderr = await _run_cmd(cmd, timeout=CONTAINER_START_TIMEOUT)

    if code != 0:
        logger.error("Failed to create sandbox container: %s", stderr)
        return {
            "success": False,
            "container_name": cname,
            "container_id": None,
            "image": image,
            "error": f"docker run failed (exit {code}): {stderr}",
        }

    container_id = stdout.strip()[:12]
    _active_container = cname

    logger.info(
        "Sandbox created: name=%s, id=%s, image=%s",
        cname, container_id, image,
    )

    return {
        "success": True,
        "container_name": cname,
        "container_id": container_id,
        "image": image,
        "error": None,
    }


async def destroy_sandbox(
    *,
    name: Optional[str] = None,
    force: bool = True,
) -> dict[str, Any]:
    """Stop and remove a sandbox container.

    Args:
        name: Container name to destroy. Defaults to the active container.
        force: If True, forcibly kill the container before removing.

    Returns:
        Dictionary with result::

            {"success": bool, "container_name": str, "error": str | None}
    """
    global _active_container

    if not _initialized:
        await init()

    if not _docker_available:
        return {
            "success": False,
            "container_name": name or "",
            "error": "Docker is not available",
        }

    target = name or _active_container
    if not target:
        return {
            "success": False,
            "container_name": "",
            "error": "No active sandbox to destroy",
        }

    # Stop the container
    stop_args = ["stop"]
    if force:
        stop_args = ["kill"]
    code, _, stderr = await _run_cmd(_docker(*stop_args, target), timeout=30)
    if code != 0 and "No such container" not in stderr:
        logger.warning("Error stopping container %s: %s", target, stderr)

    # Remove the container
    code, _, stderr = await _run_cmd(
        _docker("rm", "-f", target), timeout=30
    )

    if code != 0 and "No such container" not in stderr:
        return {
            "success": False,
            "container_name": target,
            "error": f"Failed to remove container: {stderr}",
        }

    if target == _active_container:
        _active_container = None

    logger.info("Sandbox destroyed: %s", target)

    return {
        "success": True,
        "container_name": target,
        "error": None,
    }


async def sandbox_status() -> dict[str, Any]:
    """Get the status of the current sandbox container.

    Returns:
        Dictionary with container status::

            {
                "active": bool,
                "container_name": str | None,
                "container_id": str | None,
                "image": str | None,
                "status": str,        # "running" | "stopped" | "none"
                "docker_available": bool,
            }
    """
    if not _initialized:
        await init()

    result: dict[str, Any] = {
        "active": False,
        "container_name": _active_container,
        "container_id": None,
        "image": None,
        "status": "none",
        "docker_available": _docker_available,
    }

    if not _docker_available or not _active_container:
        return result

    # Query Docker for container info
    code, stdout, _ = await _run_cmd(
        _docker(
            "inspect",
            "--format",
            '{"id":"{{.Id}}","image":"{{.Config.Image}}","status":"{{.State.Status}}","running":{{.State.Running}}}',
            _active_container,
        ),
        timeout=10,
    )

    if code != 0:
        # Container no longer exists
        result["status"] = "removed"
        return result

    try:
        info = json.loads(stdout)
        result["active"] = info.get("running", False)
        result["container_id"] = info.get("id", "")[:12]
        result["image"] = info.get("image")
        result["status"] = info.get("status", "unknown")
    except (json.JSONDecodeError, KeyError):
        result["status"] = "unknown"

    return result


# ---------------------------------------------------------------------------
# Command execution
# ---------------------------------------------------------------------------

async def sandbox_execute(
    command: str,
    language: str = "bash",
    *,
    timeout: float = DEFAULT_EXEC_TIMEOUT,
    workdir: Optional[str] = None,
    user: str = "root",
) -> dict[str, Any]:
    """Execute a command inside the Docker sandbox.

    If no sandbox is active, one is created automatically with the default
    image.

    Args:
        command: The command string to execute.
        language: Execution language / shell. Supported values:

            - ``"bash"`` (default) -- runs via ``bash -c``
            - ``"sh"`` -- runs via ``sh -c``
            - ``"python"`` -- runs via ``python3 -c``
            - ``"node"`` -- runs via ``node -e``

        timeout: Maximum seconds for the command to run.
        workdir: Override the working directory for this command.
        user: User to run as inside the container.

    Returns:
        Dictionary with execution results::

            {
                "success": bool,
                "exit_code": int,
                "stdout": str,
                "stderr": str,
                "duration_ms": float,
                "command": str,
                "language": str,
                "error": str | None,
            }
    """
    if not _initialized:
        await init()

    if not _docker_available:
        return {
            "success": False,
            "exit_code": -1,
            "stdout": "",
            "stderr": "",
            "duration_ms": 0.0,
            "command": command,
            "language": language,
            "error": "Docker is not available",
        }

    # Auto-create sandbox if none is active
    if not _active_container or not await _container_running(_active_container):
        create_result = await create_sandbox()
        if not create_result["success"]:
            return {
                "success": False,
                "exit_code": -1,
                "stdout": "",
                "stderr": "",
                "duration_ms": 0.0,
                "command": command,
                "language": language,
                "error": f"Auto-create sandbox failed: {create_result.get('error')}",
            }

    # Build the exec command based on language
    shell_map = {
        "bash": ["bash", "-c", command],
        "sh": ["sh", "-c", command],
        "python": ["python3", "-c", command],
        "node": ["node", "-e", command],
    }

    inner_cmd = shell_map.get(language)
    if inner_cmd is None:
        return {
            "success": False,
            "exit_code": -1,
            "stdout": "",
            "stderr": "",
            "duration_ms": 0.0,
            "command": command,
            "language": language,
            "error": f"Unsupported language: {language!r}. Use: {', '.join(shell_map)}",
        }

    exec_args = ["exec", "--user", user]
    if workdir:
        exec_args.extend(["--workdir", workdir])
    exec_args.append(_active_container)
    exec_args.extend(inner_cmd)

    start = time.monotonic()
    exit_code, stdout, stderr = await _run_cmd(
        _docker(*exec_args), timeout=timeout
    )
    duration_ms = (time.monotonic() - start) * 1000

    return {
        "success": exit_code == 0,
        "exit_code": exit_code,
        "stdout": stdout,
        "stderr": stderr,
        "duration_ms": round(duration_ms, 2),
        "command": command,
        "language": language,
        "error": None if exit_code == 0 else f"Command exited with code {exit_code}",
    }


async def sandbox_python(
    code: str,
    *,
    timeout: float = DEFAULT_EXEC_TIMEOUT,
) -> dict[str, Any]:
    """Execute Python code inside the Docker sandbox.

    Convenience wrapper around :func:`sandbox_execute` with
    ``language="python"``.

    Args:
        code: Python source code to execute. Can be multi-line.
        timeout: Maximum seconds for execution.

    Returns:
        Same result dictionary as :func:`sandbox_execute`.
    """
    return await sandbox_execute(code, language="python", timeout=timeout)


# ---------------------------------------------------------------------------
# Browser automation
# ---------------------------------------------------------------------------

async def browse_url(
    url: str,
    *,
    timeout: float = 30,
    user_agent: Optional[str] = None,
) -> dict[str, Any]:
    """Fetch URL content safely inside the sandbox.

    Uses ``curl`` inside the sandbox container so the host machine is never
    directly exposed.  For richer browser automation (JavaScript rendering),
    use :func:`run_agent` with ``agent_type="BrowsingAgent"``.

    Args:
        url: The URL to fetch.
        timeout: Maximum seconds for the HTTP request.
        user_agent: Optional User-Agent header string.

    Returns:
        Dictionary with fetch results::

            {
                "success": bool,
                "url": str,
                "status_code": int | None,
                "content": str,
                "content_type": str | None,
                "error": str | None,
            }
    """
    # Validate URL to prevent command injection
    if not url.startswith(("http://", "https://")):
        return {
            "success": False,
            "url": url,
            "status_code": None,
            "content": "",
            "content_type": None,
            "error": "URL must start with http:// or https://",
        }

    # Build curl command with write-out for metadata
    curl_cmd = (
        f'curl -sS -L --max-time {int(timeout)} '
        f'--max-filesize 10485760 '  # 10 MB limit
        f'-w "\\n---SUPERGOOSE_HTTP_CODE:%{{http_code}}---\\n---SUPERGOOSE_CONTENT_TYPE:%{{content_type}}---" '
    )
    if user_agent:
        # Escape single quotes in user agent
        safe_ua = user_agent.replace("'", "'\\''")
        curl_cmd += f"-A '{safe_ua}' "
    curl_cmd += f'"{url}"'

    result = await sandbox_execute(curl_cmd, language="bash", timeout=timeout + 10)

    if not result["success"] and result["exit_code"] != 0:
        return {
            "success": False,
            "url": url,
            "status_code": None,
            "content": "",
            "content_type": None,
            "error": result.get("error") or result.get("stderr", "curl failed"),
        }

    # Parse out the HTTP code and content type from curl write-out
    stdout = result["stdout"]
    status_code = None
    content_type = None
    content = stdout

    if "---SUPERGOOSE_HTTP_CODE:" in stdout:
        parts = stdout.rsplit("---SUPERGOOSE_HTTP_CODE:", 1)
        content = parts[0].rstrip("\n")
        trailer = parts[1] if len(parts) > 1 else ""
        try:
            code_str = trailer.split("---", 1)[0]
            status_code = int(code_str)
        except (ValueError, IndexError):
            pass

    if "---SUPERGOOSE_CONTENT_TYPE:" in result["stdout"]:
        try:
            ct_part = result["stdout"].rsplit("---SUPERGOOSE_CONTENT_TYPE:", 1)[1]
            content_type = ct_part.split("---", 1)[0].strip() or None
        except (IndexError, ValueError):
            pass

    return {
        "success": status_code is not None and 200 <= status_code < 400,
        "url": url,
        "status_code": status_code,
        "content": content,
        "content_type": content_type,
        "error": None,
    }


# ---------------------------------------------------------------------------
# Agent operations
# ---------------------------------------------------------------------------

def list_agents() -> dict[str, Any]:
    """List all available OpenHands agent types.

    Returns:
        Dictionary with agent information::

            {
                "agents": {
                    "CodeActAgent": "Primary coding agent with shell, editor, and Jupyter tools",
                    ...
                },
                "default": "CodeActAgent",
                "count": int,
            }
    """
    return {
        "agents": dict(AGENT_TYPES),
        "default": "CodeActAgent",
        "count": len(AGENT_TYPES),
    }


async def run_agent(
    agent_type: str,
    task: str,
    *,
    sandbox: bool = True,
    timeout: float = 300,
    max_iterations: int = 50,
    model: str = "gpt-4o",
) -> dict[str, Any]:
    """Run an OpenHands agent on a task.

    Launches the OpenHands CLI (``python -m openhands.core.main``) inside
    the host Python environment or, when ``sandbox=True``, delegates the
    execution to the sandbox container.

    .. note::
        This requires the OpenHands package to be installed
        (``pip install -e G:/goose/external/OpenHands``).

    Args:
        agent_type: One of the keys from :data:`AGENT_TYPES`.
        task: Natural-language task description for the agent.
        sandbox: If True, run the agent's commands inside the Docker sandbox.
        timeout: Maximum seconds for the entire agent run.
        max_iterations: Maximum agent iterations before forced stop.
        model: LLM model identifier for the agent to use.

    Returns:
        Dictionary with agent run results::

            {
                "success": bool,
                "agent_type": str,
                "task": str,
                "output": str,
                "error": str | None,
                "exit_code": int,
                "duration_ms": float,
            }
    """
    if not _initialized:
        await init()

    if agent_type not in AGENT_TYPES:
        return {
            "success": False,
            "agent_type": agent_type,
            "task": task,
            "output": "",
            "error": (
                f"Unknown agent type: {agent_type!r}. "
                f"Available: {', '.join(AGENT_TYPES)}"
            ),
            "exit_code": -1,
            "duration_ms": 0.0,
        }

    if not _openhands_available:
        return {
            "success": False,
            "agent_type": agent_type,
            "task": task,
            "output": "",
            "error": f"OpenHands not found at {OPENHANDS_ROOT}",
            "exit_code": -1,
            "duration_ms": 0.0,
        }

    # Build the OpenHands headless CLI command
    oh_cmd = (
        f"python -m openhands.core.main "
        f"-t {_shell_quote(task)} "
        f"-c {agent_type} "
        f"-m {model} "
        f"-i {max_iterations}"
    )

    if sandbox:
        # Set the runtime to local inside the container since Docker-in-Docker
        # is not available inside our sandbox
        env_prefix = "RUNTIME=local INSTALL_DOCKER=0 "
        oh_cmd = env_prefix + oh_cmd

    start = time.monotonic()

    if sandbox and _docker_available and _active_container:
        result = await sandbox_execute(
            oh_cmd, language="bash", timeout=timeout
        )
    else:
        # Run on host (requires OpenHands to be pip-installed)
        code, stdout, stderr = await _run_cmd(
            ["bash", "-c", oh_cmd],
            timeout=timeout,
        )
        result = {
            "success": code == 0,
            "exit_code": code,
            "stdout": stdout,
            "stderr": stderr,
            "error": None if code == 0 else f"Agent exited with code {code}",
        }

    duration_ms = (time.monotonic() - start) * 1000

    return {
        "success": result.get("success", False),
        "agent_type": agent_type,
        "task": task,
        "output": result.get("stdout", ""),
        "error": result.get("error"),
        "exit_code": result.get("exit_code", -1),
        "duration_ms": round(duration_ms, 2),
    }


# ---------------------------------------------------------------------------
# Registry dispatch (called by ToolRegistry.execute)
# ---------------------------------------------------------------------------

async def execute(operation: str, params: dict[str, Any]) -> dict[str, Any]:
    """Dispatch an operation from the ToolRegistry.

    This is the unified entry point called by
    ``ToolRegistry.execute("openhands", operation, params)``.

    Args:
        operation: The operation name to perform.
        params: Keyword arguments forwarded to the operation function.

    Returns:
        Operation result dictionary. Always includes ``"success"`` key.

    Supported operations:
        - ``"init"`` -- initialise the bridge
        - ``"status"`` -- get bridge health status
        - ``"capabilities"`` -- list capabilities
        - ``"create_sandbox"`` -- create a Docker sandbox
        - ``"destroy_sandbox"`` -- tear down the sandbox
        - ``"sandbox_status"`` -- query sandbox container state
        - ``"sandbox_execute"`` -- run a command in the sandbox
        - ``"sandbox_python"`` -- run Python code in the sandbox
        - ``"browse_url"`` -- fetch a URL inside the sandbox
        - ``"list_agents"`` -- list OpenHands agent types
        - ``"run_agent"`` -- run an OpenHands agent
    """
    dispatch: dict[str, Any] = {
        "init": init,
        "create_sandbox": create_sandbox,
        "destroy_sandbox": destroy_sandbox,
        "sandbox_status": sandbox_status,
        "sandbox_execute": sandbox_execute,
        "sandbox_python": sandbox_python,
        "browse_url": browse_url,
        "run_agent": run_agent,
    }

    # Synchronous operations
    sync_dispatch: dict[str, Any] = {
        "status": lambda **kw: _tool_status_to_dict(status()),
        "capabilities": lambda **kw: {"capabilities": capabilities(), "success": True},
        "list_agents": lambda **kw: {**list_agents(), "success": True},
    }

    if operation in sync_dispatch:
        try:
            return sync_dispatch[operation](**params)
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    if operation not in dispatch:
        return {
            "success": False,
            "error": (
                f"Unknown operation: {operation!r}. "
                f"Available: {', '.join(list(dispatch) + list(sync_dispatch))}"
            ),
        }

    async def _do_operation():
        return await dispatch[operation](**params)

    coordinator = get_coordinator()
    try:
        async with coordinator.acquire("openhands", "execute"):
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
            logger.exception("Error executing openhands.%s", operation)
            return {"success": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

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


def _shell_quote(s: str) -> str:
    """Minimally quote a string for safe use in a shell command.

    Uses single quotes with proper escaping of embedded single quotes.
    """
    return "'" + s.replace("'", "'\\''") + "'"
