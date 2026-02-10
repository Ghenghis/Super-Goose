"""
Microsandbox Bridge - MicroVM code execution for Super-Goose.

Wraps microsandbox's MCP-native server to provide hardware-isolated MicroVM
sandboxes for safe code execution.  Microsandbox uses libkrun to boot full
Linux MicroVMs in sub-200ms, providing hardware-level isolation (not
container-level) via KVM virtualization.

Microsandbox architecture:
    microsandbox-cli/    -- CLI binary for management commands
    microsandbox-core/   -- Core MicroVM engine (libkrun backend)
    microsandbox-server/ -- MCP server (Rust, JSON-RPC over HTTP)
    microsandbox-portal/ -- Web portal for monitoring

Architecture:
    Goose Agent --> Conscious Bridge --> microsandbox_bridge.py --> REST API
                                                                --> MCP endpoint

On Windows, microsandbox requires WSL2 + KVM.  The bridge automatically
detects the platform and routes commands through WSL2 when necessary.

Capabilities registered in external_tools.toml:
    microvm_exec, sandbox, mcp_server, code_execution

Typical usage via the ToolRegistry::

    result = await registry.execute("microsandbox", "execute_code", {
        "sandbox_id": "sb-abc123",
        "code": "print('Hello from MicroVM!')",
        "language": "python",
    })

Reference:
    microsandbox source: G:/goose/external/microsandbox
    microsandbox docs:   https://microsandbox.dev
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import platform
import shutil
import sys
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import aiohttp  # optional -- _http_request falls back to curl if missing

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Resource coordination
# ---------------------------------------------------------------------------

try:
    from integrations.resource_coordinator import get_coordinator
except ImportError:
    get_coordinator = None  # type: ignore[assignment,misc]

# ---------------------------------------------------------------------------
# Registry-compatible ToolStatus
# ---------------------------------------------------------------------------

try:
    from integrations.registry import ToolStatus
except ImportError:
    @dataclass
    class ToolStatus:  # type: ignore[no-redef]
        """Fallback ToolStatus when registry is not importable."""
        name: str
        available: bool
        healthy: bool
        error: Optional[str] = None
        version: Optional[str] = None


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Root of the microsandbox installation (sibling of this package)
MICROSANDBOX_ROOT = Path(__file__).resolve().parents[3] / "microsandbox"

#: Path to the compiled microsandbox binary (after cargo build --release)
MICROSANDBOX_BIN = MICROSANDBOX_ROOT / "target" / "release" / "microsandbox"

#: Default MCP server port
DEFAULT_SERVER_PORT = 8100

#: Default MCP server host
DEFAULT_SERVER_HOST = "127.0.0.1"

#: Default timeout for sandbox code execution (seconds)
DEFAULT_EXEC_TIMEOUT = 300

#: Default timeout for HTTP API calls (seconds)
DEFAULT_API_TIMEOUT = 30

#: Default timeout for sandbox creation (seconds)
DEFAULT_CREATE_TIMEOUT = 10

#: Default timeout for server startup (seconds)
SERVER_START_TIMEOUT = 30

#: Maximum boot time per sandbox (microsandbox claims sub-200ms)
SANDBOX_BOOT_TIMEOUT = 5

#: Maximum number of concurrent sandboxes (enforced via asyncio.Semaphore)
MAX_CONCURRENT_SANDBOXES = 4

#: Number of retry attempts for transient HTTP failures
HTTP_MAX_RETRIES = 3

#: Base delay (in seconds) for exponential backoff between retries
HTTP_RETRY_BASE_DELAY = 1.0

#: Default TTL for the local sandbox cache (seconds)
DEFAULT_CACHE_TTL = 30

#: Supported languages for code execution
SUPPORTED_LANGUAGES: dict[str, dict[str, str]] = {
    "python": {"image": "python:3.12", "cmd": "python3"},
    "node": {"image": "node:22", "cmd": "node"},
    "javascript": {"image": "node:22", "cmd": "node"},
    "bash": {"image": "ubuntu:24.04", "cmd": "bash"},
    "sh": {"image": "alpine:latest", "cmd": "sh"},
    "ruby": {"image": "ruby:3.3", "cmd": "ruby"},
    "go": {"image": "golang:1.22", "cmd": "go run"},
    "rust": {"image": "rust:1.77", "cmd": "rustc"},
}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class SandboxInfo:
    """Metadata about a running MicroVM sandbox."""
    sandbox_id: str
    language: str
    status: str  # "running", "stopped", "creating", "error"
    created_at: float
    timeout: int
    port: Optional[int] = None
    image: Optional[str] = None


@dataclass
class ExecResult:
    """Result of executing code in a MicroVM sandbox."""
    success: bool
    exit_code: int
    stdout: str
    stderr: str
    duration_ms: float
    language: str
    sandbox_id: str


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _run_cmd(
    args: list[str],
    *,
    timeout: float = DEFAULT_API_TIMEOUT,
    input_data: Optional[str] = None,
    cwd: Optional[str] = None,
) -> tuple[int, str, str]:
    """Run a subprocess asynchronously and return (exit_code, stdout, stderr).

    Args:
        args: Command and arguments list.
        timeout: Maximum wall-clock seconds before the process is killed.
        input_data: Optional string to send on stdin.
        cwd: Optional working directory.

    Returns:
        Tuple of (exit_code, stdout_text, stderr_text).
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            stdin=asyncio.subprocess.PIPE if input_data else asyncio.subprocess.DEVNULL,
            cwd=cwd,
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
        try:
            proc.kill()  # type: ignore[union-attr]
        except ProcessLookupError:
            pass
        return (-1, "", f"Command timed out after {timeout}s: {' '.join(args)}")
    except FileNotFoundError:
        return (-1, "", f"Command not found: {args[0]}")
    except Exception as exc:
        return (-1, "", f"Unexpected error running command: {exc}")


def _is_retryable_error(status_code: int, is_connection_error: bool) -> bool:
    """Return True if the request should be retried.

    Retries on:
        - Connection errors (status_code == -1 and is_connection_error is True)
        - Server errors (5xx status codes)

    Does NOT retry on:
        - Client errors (4xx status codes)
        - Successful responses (2xx/3xx)
    """
    if is_connection_error and status_code < 0:
        return True
    if 500 <= status_code < 600:
        return True
    return False


async def _http_request(
    method: str,
    url: str,
    *,
    json_body: Optional[dict[str, Any]] = None,
    timeout: float = DEFAULT_API_TIMEOUT,
    max_retries: int = HTTP_MAX_RETRIES,
) -> tuple[int, dict[str, Any]]:
    """Make an HTTP request using aiohttp or fall back to curl.

    Implements exponential backoff retry logic for transient failures.
    Retries on connection errors and 5xx server errors only.  Client
    errors (4xx) are returned immediately without retry.

    Args:
        method: HTTP method (GET, POST, PUT, DELETE).
        url: Full URL to request.
        json_body: Optional JSON body for POST/PUT requests.
        timeout: Request timeout in seconds.
        max_retries: Maximum number of retry attempts (default 3).

    Returns:
        Tuple of (status_code, response_json_dict).
        On error, status_code is -1 and response contains an "error" key.
    """
    last_status = -1
    last_data: dict[str, Any] = {"error": "No attempts made"}

    for attempt in range(max_retries):
        is_connection_error = False

        # Try aiohttp first
        try:
            import aiohttp as _aiohttp
            async with _aiohttp.ClientSession() as session:
                kwargs: dict[str, Any] = {
                    "timeout": _aiohttp.ClientTimeout(total=timeout),
                }
                if json_body is not None:
                    kwargs["json"] = json_body

                async with session.request(method, url, **kwargs) as resp:
                    try:
                        data = await resp.json()
                    except Exception:
                        data = {"raw": await resp.text()}
                    last_status, last_data = resp.status, data

                    if not _is_retryable_error(last_status, False):
                        return last_status, last_data
                    # 5xx -- fall through to retry logic below

        except ImportError:
            # aiohttp not installed -- fall through to curl
            pass
        except (OSError, asyncio.TimeoutError) as exc:
            # Connection-level or timeout error from aiohttp
            is_connection_error = True
            last_status = -1
            last_data = {"error": f"Connection error: {exc}"}
        else:
            # If aiohttp succeeded (even with 5xx), skip the curl fallback
            if _is_retryable_error(last_status, is_connection_error):
                delay = HTTP_RETRY_BASE_DELAY * (2 ** attempt)
                logger.warning(
                    "HTTP %s %s attempt %d/%d returned %d, retrying in %.1fs",
                    method, url, attempt + 1, max_retries, last_status, delay,
                )
                await asyncio.sleep(delay)
                continue
            return last_status, last_data

        # Fallback: use curl via subprocess (only reached when aiohttp
        # is not importable or raised a connection error)
        if not is_connection_error:
            cmd = ["curl", "-s", "-X", method, "-w", "\n%{http_code}"]
            if json_body is not None:
                cmd.extend([
                    "-H", "Content-Type: application/json",
                    "-d", json.dumps(json_body),
                ])
            cmd.append(url)

            exit_code, stdout, stderr = await _run_cmd(cmd, timeout=timeout)
            if exit_code != 0:
                is_connection_error = True
                last_status = -1
                last_data = {"error": stderr or f"curl failed with exit code {exit_code}"}
            else:
                # Parse status code from last line
                lines = stdout.rsplit("\n", 1)
                body = lines[0] if len(lines) > 1 else ""
                try:
                    last_status = int(lines[-1]) if lines else -1
                except ValueError:
                    last_status = -1
                    body = stdout

                try:
                    last_data = json.loads(body) if body else {}
                except json.JSONDecodeError:
                    last_data = {"raw": body}

                if not _is_retryable_error(last_status, False):
                    return last_status, last_data

        # Retry with exponential backoff
        if attempt < max_retries - 1:
            delay = HTTP_RETRY_BASE_DELAY * (2 ** attempt)
            logger.warning(
                "HTTP %s %s attempt %d/%d failed (status=%d, conn_err=%s), "
                "retrying in %.1fs",
                method, url, attempt + 1, max_retries,
                last_status, is_connection_error, delay,
            )
            await asyncio.sleep(delay)

    # All retries exhausted
    logger.error(
        "HTTP %s %s failed after %d attempts (last status=%d)",
        method, url, max_retries, last_status,
    )
    return last_status, last_data


def _is_windows() -> bool:
    """Check if running on Windows."""
    return platform.system() == "Windows"


def _wsl_wrap(args: list[str]) -> list[str]:
    """Wrap a command for execution through WSL2 on Windows.

    On non-Windows platforms, returns the args unchanged.
    """
    if _is_windows():
        return ["wsl", "--"] + args
    return args


# ---------------------------------------------------------------------------
# MicrosandboxBridge class
# ---------------------------------------------------------------------------

class MicrosandboxBridge:
    """Bridge for microsandbox MicroVM code execution.

    Manages the microsandbox MCP server lifecycle and provides methods for
    creating, executing code in, and destroying MicroVM sandboxes.

    Microsandbox provides hardware-level VM isolation with sub-200ms boot
    times, making it suitable for safe execution of untrusted code.

    Example::

        bridge = MicrosandboxBridge()
        await bridge.init()
        await bridge.start_server()
        result = await bridge.create_sandbox(language="python")
        exec_result = await bridge.execute_code(
            result["sandbox_id"], "print('Hello!')"
        )
        await bridge.destroy_sandbox(result["sandbox_id"])
        await bridge.stop_server()
    """

    def __init__(
        self,
        host: str = DEFAULT_SERVER_HOST,
        port: int = DEFAULT_SERVER_PORT,
    ) -> None:
        """Initialize the MicrosandboxBridge.

        Args:
            host: Hostname for the microsandbox MCP server.
            port: Port for the microsandbox MCP server.
        """
        self._host = host
        self._port = port
        self._base_url = f"http://{host}:{port}"
        self._server_process: Optional[asyncio.subprocess.Process] = None
        self._initialized = False
        self._binary_path: Optional[str] = None
        self._version: Optional[str] = None
        self._sandboxes: dict[str, SandboxInfo] = {}
        self._mcp_connected = False

        # Concurrency limiter -- prevents creating more than
        # MAX_CONCURRENT_SANDBOXES sandboxes simultaneously.
        self._sandbox_semaphore = asyncio.Semaphore(MAX_CONCURRENT_SANDBOXES)

        # Cache TTL tracking -- _sandboxes is refreshed from the server
        # when the cache is stale (older than _cache_ttl seconds).
        self._cache_ttl: float = DEFAULT_CACHE_TTL
        self._cache_updated_at: float = 0.0

    # ------------------------------------------------------------------
    # Async context manager for proper lifecycle
    # ------------------------------------------------------------------

    async def __aenter__(self) -> "MicrosandboxBridge":
        """Start the server when entering the async context manager."""
        await self.start_server()
        return self

    async def __aexit__(
        self,
        exc_type: Optional[type],
        exc_val: Optional[BaseException],
        exc_tb: Optional[Any],
    ) -> None:
        """Stop the server when exiting the async context manager."""
        await self.stop_server()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def init(self) -> dict[str, Any]:
        """Initialize the bridge by locating the microsandbox binary.

        Checks for the microsandbox binary on PATH or in the expected
        build location.  Also verifies KVM availability (Linux) or WSL2
        (Windows).

        Returns:
            Dictionary with initialization results including binary path,
            version, platform info, and any errors.
        """
        if self._initialized:
            return {
                "success": True,
                "initialized": True,
                "binary": self._binary_path,
                "version": self._version,
                "platform": platform.system(),
            }

        # 1. Locate the binary
        binary = shutil.which("microsandbox")

        if binary is None:
            # Check the local build path
            candidates = [
                MICROSANDBOX_BIN,
                MICROSANDBOX_BIN.with_suffix(".exe"),
                MICROSANDBOX_ROOT / "target" / "debug" / "microsandbox",
            ]
            for candidate in candidates:
                if candidate.exists():
                    binary = str(candidate)
                    break

        # 2. On Windows, check WSL2 availability
        if binary is None and _is_windows():
            wsl_bin = shutil.which("wsl")
            if wsl_bin:
                # Try finding microsandbox inside WSL
                code, stdout, _ = await _run_cmd(
                    ["wsl", "--", "which", "microsandbox"], timeout=10
                )
                if code == 0 and stdout.strip():
                    binary = stdout.strip()
                    logger.info("Found microsandbox in WSL2: %s", binary)

        if binary is None:
            error_msg = (
                f"microsandbox binary not found. Build with: "
                f"cd {MICROSANDBOX_ROOT} && cargo build --release"
            )
            logger.warning("Microsandbox bridge: %s", error_msg)
            self._initialized = True
            return {
                "success": False,
                "initialized": True,
                "binary": None,
                "version": None,
                "platform": platform.system(),
                "error": error_msg,
            }

        self._binary_path = binary

        # 3. Get version
        if _is_windows():
            version_cmd = _wsl_wrap([binary, "--version"])
        else:
            version_cmd = [binary, "--version"]
        code, stdout, _ = await _run_cmd(version_cmd, timeout=10)
        if code == 0:
            self._version = stdout.strip()

        # 4. Check KVM availability (Linux) or WSL2 + KVM (Windows)
        kvm_error = await self._check_kvm()

        self._initialized = True
        logger.info(
            "Microsandbox bridge initialized: binary=%s, version=%s",
            self._binary_path, self._version,
        )

        result: dict[str, Any] = {
            "success": True,
            "initialized": True,
            "binary": self._binary_path,
            "version": self._version,
            "platform": platform.system(),
            "error": None,
        }
        if kvm_error:
            result["kvm_warning"] = kvm_error
        return result

    async def _check_kvm(self) -> Optional[str]:
        """Check KVM availability.  Returns an error message or None."""
        if _is_windows():
            code, stdout, _ = await _run_cmd(
                ["wsl", "--", "test", "-e", "/dev/kvm"], timeout=5
            )
            if code != 0:
                return (
                    "KVM not available in WSL2.  Microsandbox requires "
                    "nested virtualization.  Enable it in .wslconfig: "
                    "[wsl2] nestedVirtualization=true"
                )
        elif platform.system() == "Linux":
            if not Path("/dev/kvm").exists():
                return (
                    "KVM not available (/dev/kvm not found).  "
                    "Microsandbox requires KVM for MicroVM isolation."
                )
        else:
            return (
                f"Unsupported platform: {platform.system()}.  "
                "Microsandbox requires Linux/WSL2 + KVM."
            )
        return None

    # ------------------------------------------------------------------
    # Cache management
    # ------------------------------------------------------------------

    def _is_cache_stale(self) -> bool:
        """Return True when the local sandbox cache has expired."""
        if self._cache_updated_at == 0.0:
            return True
        return (time.monotonic() - self._cache_updated_at) > self._cache_ttl

    async def _refresh_cache(self) -> None:
        """Refresh the local _sandboxes cache from the server.

        Calls list_sandboxes() and updates _cache_updated_at on success.
        Errors are logged but do not propagate so callers can proceed
        with potentially stale data.
        """
        try:
            result = await self.list_sandboxes()
            if result.get("success") and result.get("source") == "server":
                self._cache_updated_at = time.monotonic()
                logger.debug(
                    "Sandbox cache refreshed, %d sandboxes",
                    result.get("count", 0),
                )
        except Exception as exc:
            logger.warning("Failed to refresh sandbox cache: %s", exc)

    async def _ensure_cache_fresh(self) -> None:
        """Refresh the sandbox cache if it has exceeded the TTL."""
        if self._is_cache_stale():
            await self._refresh_cache()

    def status(self) -> ToolStatus:
        """Return the current health status of the microsandbox bridge.

        Returns:
            ToolStatus with availability and health information.
        """
        if not self._initialized:
            return ToolStatus(
                name="microsandbox",
                available=False,
                healthy=False,
                error="Bridge not initialized. Call init() first.",
            )

        if not self._binary_path:
            return ToolStatus(
                name="microsandbox",
                available=False,
                healthy=False,
                error=f"microsandbox binary not found at {MICROSANDBOX_ROOT}",
            )

        server_running = (
            self._server_process is not None
            and self._server_process.returncode is None
        )
        return ToolStatus(
            name="microsandbox",
            available=True,
            healthy=server_running,
            version=self._version,
            error=None if server_running else "MCP server not running. Call start_server() first.",
        )

    def capabilities(self) -> list[str]:
        """Return the list of capabilities this bridge provides.

        Returns:
            List of capability strings.
        """
        return [
            "microvm_exec",
            "sandbox",
            "mcp_server",
            "code_execution",
            "snapshot_restore",
        ]

    # ------------------------------------------------------------------
    # Server lifecycle
    # ------------------------------------------------------------------

    async def start_server(self, port: Optional[int] = None) -> dict[str, Any]:
        """Start the microsandbox MCP server.

        Launches the microsandbox server process in the background.  If the
        server is already running, returns success without starting a new one.

        Args:
            port: Override the default server port.

        Returns:
            Dictionary with server start results.
        """
        if not self._initialized:
            init_result = await self.init()
            if not init_result.get("success"):
                return {
                    "success": False,
                    "error": init_result.get("error", "Initialization failed"),
                }

        if not self._binary_path:
            return {
                "success": False,
                "error": "microsandbox binary not found",
            }

        if port is not None:
            self._port = port
            self._base_url = f"http://{self._host}:{port}"

        # Check if server is already running
        if self._server_process and self._server_process.returncode is None:
            health = await self.health_check()
            if health.get("healthy"):
                return {
                    "success": True,
                    "message": "Server already running",
                    "port": self._port,
                    "pid": self._server_process.pid,
                }

        # Build the server command
        server_cmd = [
            self._binary_path, "server",
            "--host", self._host,
            "--port", str(self._port),
        ]
        if _is_windows():
            server_cmd = _wsl_wrap(server_cmd)

        try:
            self._server_process = await asyncio.create_subprocess_exec(
                *server_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(MICROSANDBOX_ROOT) if MICROSANDBOX_ROOT.exists() else None,
            )
        except (FileNotFoundError, OSError) as exc:
            return {
                "success": False,
                "error": f"Failed to start microsandbox server: {exc}",
            }

        # Wait for the server to become ready
        start_time = time.monotonic()
        while (time.monotonic() - start_time) < SERVER_START_TIMEOUT:
            await asyncio.sleep(0.5)

            # Check if process died
            if self._server_process.returncode is not None:
                stderr = ""
                if self._server_process.stderr:
                    try:
                        stderr_bytes = await asyncio.wait_for(
                            self._server_process.stderr.read(4096), timeout=2
                        )
                        stderr = stderr_bytes.decode(errors="replace")
                    except (asyncio.TimeoutError, Exception):
                        pass
                return {
                    "success": False,
                    "error": (
                        f"Server process exited with code "
                        f"{self._server_process.returncode}: {stderr}"
                    ),
                }

            # Try health check
            health = await self.health_check()
            if health.get("healthy"):
                logger.info(
                    "Microsandbox server started on port %d (pid=%d)",
                    self._port, self._server_process.pid,
                )
                return {
                    "success": True,
                    "port": self._port,
                    "pid": self._server_process.pid,
                    "startup_ms": round(
                        (time.monotonic() - start_time) * 1000, 2
                    ),
                }

        return {
            "success": False,
            "error": f"Server did not become ready within {SERVER_START_TIMEOUT}s",
        }

    async def stop_server(self) -> dict[str, Any]:
        """Stop the microsandbox MCP server.

        Sends a graceful shutdown request, then terminates the process
        if it does not exit within a reasonable time.

        Returns:
            Dictionary with shutdown results.
        """
        if not self._server_process or self._server_process.returncode is not None:
            self._server_process = None
            return {
                "success": True,
                "message": "Server was not running",
            }

        pid = self._server_process.pid

        # Try graceful shutdown via API
        try:
            await _http_request(
                "POST", f"{self._base_url}/api/v1/shutdown", timeout=5
            )
        except Exception:
            pass  # Will force-kill below if needed

        # Wait for process to exit
        try:
            await asyncio.wait_for(self._server_process.wait(), timeout=10)
        except asyncio.TimeoutError:
            # Force kill
            try:
                self._server_process.terminate()
                await asyncio.wait_for(self._server_process.wait(), timeout=5)
            except (asyncio.TimeoutError, ProcessLookupError):
                try:
                    self._server_process.kill()
                except ProcessLookupError:
                    pass

        self._server_process = None
        self._sandboxes.clear()
        self._mcp_connected = False
        self._cache_updated_at = 0.0
        logger.info("Microsandbox server stopped (pid=%d)", pid)

        return {
            "success": True,
            "message": f"Server stopped (pid={pid})",
        }

    # ------------------------------------------------------------------
    # Sandbox lifecycle
    # ------------------------------------------------------------------

    async def create_sandbox(
        self,
        language: str = "python",
        timeout: int = DEFAULT_EXEC_TIMEOUT,
        *,
        name: Optional[str] = None,
        image: Optional[str] = None,
        memory_mb: int = 512,
        vcpus: int = 1,
    ) -> dict[str, Any]:
        """Create a new MicroVM sandbox.

        Provisions a hardware-isolated MicroVM optimized for the given
        programming language.  Boot time is typically sub-200ms.

        Creation is gated by an asyncio.Semaphore so that at most
        ``MAX_CONCURRENT_SANDBOXES`` sandboxes can be created
        concurrently.

        Args:
            language: Programming language for the sandbox.  One of:
                python, node, javascript, bash, sh, ruby, go, rust.
            timeout: Maximum execution timeout in seconds for commands
                run in this sandbox.
            name: Optional human-readable name for the sandbox.
            image: Override the default MicroVM image for the language.
            memory_mb: Memory allocation in megabytes (default 512).
            vcpus: Number of virtual CPUs (default 1).

        Returns:
            Dictionary with sandbox creation results including sandbox_id.
        """
        if not self._initialized:
            await self.init()

        if language not in SUPPORTED_LANGUAGES:
            return {
                "success": False,
                "error": (
                    f"Unsupported language: {language!r}. "
                    f"Supported: {', '.join(sorted(SUPPORTED_LANGUAGES))}"
                ),
            }

        # Enforce concurrent sandbox limit
        active_count = len([
            s for s in self._sandboxes.values()
            if s.status == "running"
        ])
        if active_count >= MAX_CONCURRENT_SANDBOXES:
            return {
                "success": False,
                "error": (
                    f"Concurrent sandbox limit reached "
                    f"({MAX_CONCURRENT_SANDBOXES}).  Destroy an existing "
                    f"sandbox before creating a new one."
                ),
            }

        lang_config = SUPPORTED_LANGUAGES[language]
        sandbox_id = name or f"sb-{uuid.uuid4().hex[:12]}"
        sandbox_image = image or lang_config["image"]

        payload = {
            "sandbox_id": sandbox_id,
            "language": language,
            "image": sandbox_image,
            "timeout": timeout,
            "memory_mb": memory_mb,
            "vcpus": vcpus,
        }

        async with self._sandbox_semaphore:
            start_time = time.monotonic()
            status_code, response = await _http_request(
                "POST",
                f"{self._base_url}/api/v1/sandboxes",
                json_body=payload,
                timeout=DEFAULT_CREATE_TIMEOUT,
            )
            boot_ms = round((time.monotonic() - start_time) * 1000, 2)

        if status_code < 0 or status_code >= 400:
            error_msg = response.get(
                "error", response.get("raw", f"HTTP {status_code}")
            )
            return {
                "success": False,
                "sandbox_id": sandbox_id,
                "error": f"Failed to create sandbox: {error_msg}",
            }

        # Track the sandbox locally
        info = SandboxInfo(
            sandbox_id=sandbox_id,
            language=language,
            status="running",
            created_at=time.time(),
            timeout=timeout,
            image=sandbox_image,
        )
        self._sandboxes[sandbox_id] = info
        self._cache_updated_at = time.monotonic()

        logger.info(
            "Sandbox created: id=%s, language=%s, boot_ms=%.1f",
            sandbox_id, language, boot_ms,
        )

        return {
            "success": True,
            "sandbox_id": sandbox_id,
            "language": language,
            "image": sandbox_image,
            "boot_ms": boot_ms,
            "memory_mb": memory_mb,
            "vcpus": vcpus,
        }

    async def execute_code(
        self,
        sandbox_id: str,
        code: str,
        language: Optional[str] = None,
        *,
        timeout: Optional[float] = None,
        stdin_data: Optional[str] = None,
    ) -> dict[str, Any]:
        """Execute code in a MicroVM sandbox.

        Sends code to the specified sandbox for execution.  The sandbox
        must have been previously created with ``create_sandbox()``.

        Requires the MCP connection to be established.  If
        ``_mcp_connected`` is False, returns an error advising the
        caller to call ``connect_mcp()`` first.

        Args:
            sandbox_id: ID of the sandbox to execute in.
            code: Source code to execute.
            language: Override the sandbox's default language.
            timeout: Override the sandbox's default execution timeout.
            stdin_data: Optional data to provide on stdin.

        Returns:
            Dictionary with execution results including stdout, stderr,
            exit_code, and duration_ms.
        """
        # Guard: ensure MCP connection is active
        if not self._mcp_connected:
            return {
                "success": False,
                "sandbox_id": sandbox_id,
                "error": (
                    "MCP endpoint not connected.  Call connect_mcp() "
                    "before executing code."
                ),
            }

        # Refresh sandbox cache if stale
        await self._ensure_cache_fresh()

        info = self._sandboxes.get(sandbox_id)
        if info is None:
            return {
                "success": False,
                "sandbox_id": sandbox_id,
                "error": (
                    f"Sandbox '{sandbox_id}' not found. "
                    "Create it first with create_sandbox()."
                ),
            }

        exec_language = language or info.language
        exec_timeout = timeout or info.timeout

        payload: dict[str, Any] = {
            "code": code,
            "language": exec_language,
            "timeout": exec_timeout,
        }
        if stdin_data:
            payload["stdin"] = stdin_data

        start_time = time.monotonic()
        status_code, response = await _http_request(
            "POST",
            f"{self._base_url}/api/v1/sandboxes/{sandbox_id}/exec",
            json_body=payload,
            timeout=exec_timeout + 5,  # Extra buffer for HTTP overhead
        )
        duration_ms = round((time.monotonic() - start_time) * 1000, 2)

        if status_code < 0 or status_code >= 400:
            error_msg = response.get(
                "error", response.get("raw", f"HTTP {status_code}")
            )
            return {
                "success": False,
                "sandbox_id": sandbox_id,
                "exit_code": -1,
                "stdout": "",
                "stderr": "",
                "duration_ms": duration_ms,
                "language": exec_language,
                "error": f"Execution request failed: {error_msg}",
            }

        exit_code = response.get("exit_code", -1)
        return {
            "success": exit_code == 0,
            "sandbox_id": sandbox_id,
            "exit_code": exit_code,
            "stdout": response.get("stdout", ""),
            "stderr": response.get("stderr", ""),
            "duration_ms": duration_ms,
            "language": exec_language,
            "error": (
                None if exit_code == 0
                else f"Process exited with code {exit_code}"
            ),
        }

    async def destroy_sandbox(self, sandbox_id: str) -> dict[str, Any]:
        """Destroy a MicroVM sandbox.

        Stops the MicroVM and releases all associated resources.

        Args:
            sandbox_id: ID of the sandbox to destroy.

        Returns:
            Dictionary with destruction results.
        """
        # Refresh sandbox cache if stale
        await self._ensure_cache_fresh()

        if sandbox_id not in self._sandboxes:
            return {
                "success": False,
                "sandbox_id": sandbox_id,
                "error": f"Sandbox '{sandbox_id}' not found",
            }

        status_code, response = await _http_request(
            "DELETE",
            f"{self._base_url}/api/v1/sandboxes/{sandbox_id}",
            timeout=DEFAULT_API_TIMEOUT,
        )

        # Remove from local tracking regardless of API response
        self._sandboxes.pop(sandbox_id, None)

        if status_code < 0 or status_code >= 400:
            error_msg = response.get(
                "error", response.get("raw", f"HTTP {status_code}")
            )
            logger.warning(
                "Error destroying sandbox %s: %s", sandbox_id, error_msg
            )
            return {
                "success": False,
                "sandbox_id": sandbox_id,
                "error": f"Destroy failed: {error_msg}",
            }

        logger.info("Sandbox destroyed: %s", sandbox_id)
        return {
            "success": True,
            "sandbox_id": sandbox_id,
        }

    async def list_sandboxes(self) -> dict[str, Any]:
        """List all active sandboxes.

        Queries the microsandbox server for active sandboxes and merges
        with local tracking information.

        Returns:
            Dictionary with list of active sandboxes.
        """
        status_code, response = await _http_request(
            "GET",
            f"{self._base_url}/api/v1/sandboxes",
            timeout=DEFAULT_API_TIMEOUT,
        )

        if status_code < 0 or status_code >= 400:
            # Fall back to local tracking
            sandboxes = [
                {
                    "sandbox_id": info.sandbox_id,
                    "language": info.language,
                    "status": info.status,
                    "created_at": info.created_at,
                    "image": info.image,
                }
                for info in self._sandboxes.values()
            ]
            return {
                "success": True,
                "sandboxes": sandboxes,
                "count": len(sandboxes),
                "source": "local_cache",
            }

        sandboxes = response.get("sandboxes", [])

        # Update local tracking for removed sandboxes
        remote_ids = {
            s.get("sandbox_id")
            for s in sandboxes
            if isinstance(s, dict)
        }
        for sid in list(self._sandboxes.keys()):
            if sid not in remote_ids:
                self._sandboxes[sid].status = "unknown"

        # Mark cache as fresh
        self._cache_updated_at = time.monotonic()

        return {
            "success": True,
            "sandboxes": sandboxes,
            "count": len(sandboxes),
            "source": "server",
        }

    async def get_sandbox_status(self, sandbox_id: str) -> dict[str, Any]:
        """Get the status of a specific sandbox.

        Args:
            sandbox_id: ID of the sandbox to query.

        Returns:
            Dictionary with sandbox status information.
        """
        # Refresh sandbox cache if stale before checking
        await self._ensure_cache_fresh()

        status_code, response = await _http_request(
            "GET",
            f"{self._base_url}/api/v1/sandboxes/{sandbox_id}",
            timeout=DEFAULT_API_TIMEOUT,
        )

        if status_code < 0 or status_code >= 400:
            # Fall back to local tracking
            info = self._sandboxes.get(sandbox_id)
            if info:
                return {
                    "success": True,
                    "sandbox_id": sandbox_id,
                    "status": info.status,
                    "language": info.language,
                    "created_at": info.created_at,
                    "image": info.image,
                    "source": "local_cache",
                }
            return {
                "success": False,
                "sandbox_id": sandbox_id,
                "error": f"Sandbox '{sandbox_id}' not found",
            }

        return {
            "success": True,
            "sandbox_id": sandbox_id,
            "source": "server",
            **response,
        }

    # ------------------------------------------------------------------
    # MCP connectivity
    # ------------------------------------------------------------------

    async def connect_mcp(
        self, endpoint_url: Optional[str] = None
    ) -> dict[str, Any]:
        """Connect to the microsandbox MCP endpoint.

        Microsandbox is natively an MCP server -- this method verifies
        connectivity to the MCP JSON-RPC endpoint and caches the
        connection state.

        Args:
            endpoint_url: Override the default MCP endpoint URL.
                Defaults to ``http://{host}:{port}/mcp``.

        Returns:
            Dictionary with MCP connection results.
        """
        url = endpoint_url or f"{self._base_url}/mcp"

        # Send an MCP initialize request (JSON-RPC 2.0)
        mcp_init = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "super-goose-microsandbox-bridge",
                    "version": "1.0.0",
                },
            },
        }

        status_code, response = await _http_request(
            "POST", url, json_body=mcp_init, timeout=DEFAULT_API_TIMEOUT
        )

        if status_code < 0 or status_code >= 400:
            self._mcp_connected = False
            error_msg = response.get(
                "error", response.get("raw", f"HTTP {status_code}")
            )
            return {
                "success": False,
                "endpoint": url,
                "error": f"MCP connection failed: {error_msg}",
            }

        self._mcp_connected = True
        mcp_result = response.get("result", response)

        logger.info("MCP connected to microsandbox at %s", url)
        return {
            "success": True,
            "endpoint": url,
            "server_info": mcp_result.get("serverInfo", {}),
            "capabilities": mcp_result.get("capabilities", {}),
            "protocol_version": mcp_result.get(
                "protocolVersion", "unknown"
            ),
        }

    # ------------------------------------------------------------------
    # Health check
    # ------------------------------------------------------------------

    async def health_check(self) -> dict[str, Any]:
        """Check microsandbox server availability.

        Sends a lightweight health probe to the server.

        Returns:
            Dictionary with health check results.
        """
        try:
            status_code, response = await _http_request(
                "GET",
                f"{self._base_url}/api/v1/health",
                timeout=5,
            )

            if status_code == 200:
                return {
                    "healthy": True,
                    "status_code": status_code,
                    "server_version": response.get("version"),
                    "uptime": response.get("uptime"),
                }
            return {
                "healthy": False,
                "status_code": status_code,
                "error": response.get(
                    "error", f"Unexpected status: {status_code}"
                ),
            }
        except Exception as exc:
            return {
                "healthy": False,
                "status_code": -1,
                "error": str(exc),
            }

    # ------------------------------------------------------------------
    # Registry dispatch
    # ------------------------------------------------------------------

    async def execute(
        self, operation: str, params: dict[str, Any]
    ) -> dict[str, Any]:
        """Dispatch an operation from the ToolRegistry.

        This is the unified entry point called by
        ``ToolRegistry.execute("microsandbox", operation, params)``.

        Args:
            operation: The operation name to perform.
            params: Keyword arguments forwarded to the operation function.

        Returns:
            Operation result dictionary.  Always includes a ``"success"`` key.

        Supported operations:
            - ``"init"`` -- initialize the bridge
            - ``"start_server"`` -- start the MCP server
            - ``"stop_server"`` -- stop the MCP server
            - ``"create_sandbox"`` -- create a MicroVM sandbox
            - ``"execute_code"`` -- run code in a sandbox
            - ``"destroy_sandbox"`` -- destroy a sandbox
            - ``"list_sandboxes"`` -- list active sandboxes
            - ``"get_sandbox_status"`` -- get sandbox status
            - ``"connect_mcp"`` -- connect to MCP endpoint
            - ``"health_check"`` -- server health probe
            - ``"status"`` -- bridge health status
            - ``"capabilities"`` -- list capabilities
        """
        async_ops: dict[str, Any] = {
            "init": self.init,
            "start_server": self.start_server,
            "stop_server": self.stop_server,
            "create_sandbox": self.create_sandbox,
            "execute_code": self.execute_code,
            "destroy_sandbox": self.destroy_sandbox,
            "list_sandboxes": self.list_sandboxes,
            "get_sandbox_status": self.get_sandbox_status,
            "connect_mcp": self.connect_mcp,
            "health_check": self.health_check,
        }

        sync_ops: dict[str, Any] = {
            "status": lambda **kw: _tool_status_to_dict(self.status()),
            "capabilities": lambda **kw: {
                "capabilities": self.capabilities(), "success": True
            },
        }

        if operation in sync_ops:
            try:
                return sync_ops[operation](**params)
            except Exception as exc:
                return {"success": False, "error": str(exc)}

        if operation not in async_ops:
            all_ops = sorted(list(async_ops) + list(sync_ops))
            return {
                "success": False,
                "error": (
                    f"Unknown operation: {operation!r}. "
                    f"Available: {', '.join(all_ops)}"
                ),
            }

        try:
            return await async_ops[operation](**params)
        except TypeError as exc:
            return {
                "success": False,
                "error": f"Invalid parameters for {operation}: {exc}",
            }
        except Exception as exc:
            logger.exception("Error executing microsandbox.%s", operation)
            return {"success": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# Module-level convenience functions
# ---------------------------------------------------------------------------

# Singleton bridge instance for module-level access
_bridge: Optional[MicrosandboxBridge] = None


def _get_bridge() -> MicrosandboxBridge:
    """Get or create the singleton bridge instance."""
    global _bridge
    if _bridge is None:
        _bridge = MicrosandboxBridge()
    return _bridge


async def init() -> dict[str, Any]:
    """Initialize the microsandbox bridge (module-level convenience)."""
    return await _get_bridge().init()


def status() -> ToolStatus:
    """Return bridge health status (module-level convenience)."""
    return _get_bridge().status()


def capabilities() -> list[str]:
    """Return bridge capabilities (module-level convenience)."""
    return _get_bridge().capabilities()


async def execute(operation: str, params: dict[str, Any]) -> dict[str, Any]:
    """Dispatch operation via the singleton bridge (module-level convenience)."""
    coordinator = get_coordinator() if get_coordinator is not None else None
    if coordinator is not None:
        try:
            async with coordinator.acquire("microsandbox", "sandbox"):
                return await _get_bridge().execute(operation, params)
        except Exception as exc:
            logger.warning(
                "ResourceCoordinator unavailable, running without coordination: %s",
                exc,
            )
    return await _get_bridge().execute(operation, params)


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


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description=(
            "Microsandbox Bridge - MicroVM code execution for Super-Goose"
        ),
    )
    parser.add_argument(
        "--test", action="store_true",
        help="Run a basic self-test to verify bridge functionality",
    )
    parser.add_argument(
        "--port", type=int, default=DEFAULT_SERVER_PORT,
        help=f"Server port (default: {DEFAULT_SERVER_PORT})",
    )
    parser.add_argument(
        "--host", type=str, default=DEFAULT_SERVER_HOST,
        help=f"Server host (default: {DEFAULT_SERVER_HOST})",
    )
    args = parser.parse_args()

    async def _self_test() -> None:
        """Run a self-test of the microsandbox bridge."""
        print("=" * 60)
        print("Microsandbox Bridge Self-Test")
        print("=" * 60)

        bridge = MicrosandboxBridge(host=args.host, port=args.port)

        # 1. Init
        print("\n[1/6] Initializing bridge...")
        result = await bridge.init()
        print(f"  Binary:   {result.get('binary', 'NOT FOUND')}")
        print(f"  Version:  {result.get('version', 'unknown')}")
        print(f"  Platform: {result.get('platform')}")
        if result.get("kvm_warning"):
            print(f"  WARNING:  {result['kvm_warning']}")
        if not result.get("success"):
            print(f"  ERROR:    {result.get('error')}")
            print("\nSelf-test cannot continue without microsandbox binary.")
            return

        # 2. Status
        print("\n[2/6] Checking status...")
        st = bridge.status()
        print(f"  Available: {st.available}")
        print(f"  Healthy:   {st.healthy}")
        if st.error:
            print(f"  Error:     {st.error}")

        # 3. Capabilities
        print("\n[3/6] Listing capabilities...")
        caps = bridge.capabilities()
        print(f"  Capabilities: {', '.join(caps)}")

        # 4. Health check (server may not be running)
        print("\n[4/6] Health check (server may not be running)...")
        health = await bridge.health_check()
        print(f"  Healthy: {health.get('healthy', False)}")
        if not health.get("healthy"):
            print(f"  Note: {health.get('error', 'Server not running')}")

        # 5. Start server (if binary exists)
        print("\n[5/6] Attempting to start server...")
        start_result = await bridge.start_server(port=args.port)
        if start_result.get("success"):
            print(f"  Server started on port {start_result.get('port')}")
            print(f"  PID: {start_result.get('pid')}")
            print(f"  Startup: {start_result.get('startup_ms')}ms")

            # 6. Create and test sandbox
            print("\n[6/6] Creating test sandbox...")
            sb = await bridge.create_sandbox(
                language="python", name="test-sandbox"
            )
            if sb.get("success"):
                print(f"  Sandbox: {sb.get('sandbox_id')}")
                print(f"  Boot:    {sb.get('boot_ms')}ms")

                # Execute test code
                print("  Executing test code...")
                er = await bridge.execute_code(
                    sb["sandbox_id"],
                    "import sys; print(f'Python {sys.version}')",
                )
                print(f"  Exit code: {er.get('exit_code')}")
                print(f"  Output:    {er.get('stdout', '')[:100]}")
                print(f"  Duration:  {er.get('duration_ms')}ms")

                # Cleanup
                await bridge.destroy_sandbox(sb["sandbox_id"])
                print("  Sandbox destroyed.")
            else:
                print(
                    f"  Could not create sandbox: {sb.get('error')}"
                )

            # Stop server
            await bridge.stop_server()
            print("  Server stopped.")
        else:
            print(
                f"  Could not start server: {start_result.get('error')}"
            )
            print("\n[6/6] Skipping sandbox test (server not available).")

        print("\n" + "=" * 60)
        print("Self-test complete.")
        print("=" * 60)

    asyncio.run(_self_test())
