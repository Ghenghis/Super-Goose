"""
Arrakis Bridge - VM snapshot and deterministic replay for Super-Goose.

Wraps the Arrakis Go service to provide VM snapshot management,
deterministic replay, and state-forking capabilities.  Arrakis operates
on top of microsandbox MicroVMs and adds a snapshot layer that enables
LATS (Language Agent Tree Search) style branching -- agents can
checkpoint execution state, explore multiple paths, and restore to
any previous point.

Arrakis architecture:
    arrakis-server/   -- Go REST API for snapshot management
    arrakis-store/    -- Content-addressable snapshot storage (Btrfs/ZFS)

Architecture:
    Goose Agent --> Conscious Bridge --> arrakis_bridge.py --> Arrakis REST API
                                                          --> microsandbox_bridge

Capabilities registered in external_tools.toml:
    vm_snapshot, vm_restore, deterministic_replay, state_fork, list_snapshots

Typical usage via the ToolRegistry::

    result = await registry.execute("arrakis", "snapshot_create", {
        "sandbox_id": "sb-abc123",
        "label": "before-refactor",
    })

Reference:
    Arrakis service: http://localhost:8081 (default)
    microsandbox bridge: external/conscious/src/integrations/microsandbox_bridge.py
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Any, Optional

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

#: Default Arrakis REST API base URL
ARRAKIS_BASE_URL: str = os.environ.get("ARRAKIS_URL", "http://localhost:8081")

#: Default timeout for API calls (seconds)
DEFAULT_API_TIMEOUT: float = 30.0

#: Health-check endpoint path
HEALTH_ENDPOINT = "/api/v1/health"

#: Snapshot API prefix
SNAPSHOT_PREFIX = "/api/v1/snapshots"

#: Sandbox API prefix (for fork operations)
SANDBOX_PREFIX = "/api/v1/sandboxes"

#: Replay API prefix
REPLAY_PREFIX = "/api/v1/replay"


# ---------------------------------------------------------------------------
# Internal HTTP helper
# ---------------------------------------------------------------------------

async def _api_call(
    method: str,
    path: str,
    data: Optional[dict[str, Any]] = None,
    *,
    timeout: float = DEFAULT_API_TIMEOUT,
    base_url: Optional[str] = None,
) -> tuple[int, dict[str, Any]]:
    """Make an HTTP request to the Arrakis REST API.

    Attempts aiohttp first; falls back to a curl subprocess if aiohttp
    is not installed.

    Args:
        method: HTTP method (GET, POST, PUT, DELETE).
        path: API path (e.g. ``/api/v1/snapshots``).
        data: Optional JSON body for POST/PUT requests.
        timeout: Request timeout in seconds.
        base_url: Override the default Arrakis base URL.

    Returns:
        Tuple of (status_code, response_json_dict).
        On error, status_code is -1 and response contains an "error" key.
    """
    url = f"{base_url or ARRAKIS_BASE_URL}{path}"

    # Try aiohttp
    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            kwargs: dict[str, Any] = {
                "timeout": aiohttp.ClientTimeout(total=timeout),
            }
            if data is not None:
                kwargs["json"] = data

            async with session.request(method, url, **kwargs) as resp:
                try:
                    body = await resp.json()
                except Exception:
                    body = {"raw": await resp.text()}
                return resp.status, body

    except ImportError:
        pass  # fall through to curl
    except (OSError, asyncio.TimeoutError) as exc:
        return -1, {"error": f"Connection error: {exc}"}

    # Fallback: curl subprocess
    cmd = ["curl", "-s", "-X", method, "-w", "\n%{http_code}"]
    if data is not None:
        cmd.extend([
            "-H", "Content-Type: application/json",
            "-d", json.dumps(data),
        ])
    cmd.append(url)

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_bytes, stderr_bytes = await asyncio.wait_for(
            proc.communicate(), timeout=timeout
        )
    except asyncio.TimeoutError:
        return -1, {"error": f"curl timed out after {timeout}s"}
    except FileNotFoundError:
        return -1, {"error": "curl not found on PATH"}

    stdout = stdout_bytes.decode(errors="replace").strip()
    if (proc.returncode or 0) != 0:
        stderr = stderr_bytes.decode(errors="replace").strip()
        return -1, {"error": stderr or f"curl exited with code {proc.returncode}"}

    # Parse HTTP status code from the last line
    lines = stdout.rsplit("\n", 1)
    body_str = lines[0] if len(lines) > 1 else ""
    try:
        status_code = int(lines[-1]) if lines else -1
    except ValueError:
        status_code = -1
        body_str = stdout

    try:
        body = json.loads(body_str) if body_str else {}
    except json.JSONDecodeError:
        body = {"raw": body_str}

    return status_code, body


# ---------------------------------------------------------------------------
# ArrakisBridge class
# ---------------------------------------------------------------------------

class ArrakisBridge:
    """Bridge for Arrakis VM snapshot and replay management.

    Provides snapshot creation/restore, state forking for LATS-style
    exploration, and deterministic replay bundling.

    Example::

        bridge = ArrakisBridge()
        info = await bridge.init()
        snap = await bridge.execute("snapshot_create", {
            "sandbox_id": "sb-abc123",
            "label": "checkpoint-1",
        })
        restored = await bridge.execute("snapshot_restore", {
            "snapshot_id": snap["snapshot_id"],
        })
    """

    def __init__(self, base_url: Optional[str] = None) -> None:
        """Initialize the ArrakisBridge.

        Args:
            base_url: Override the default Arrakis REST API URL.
        """
        self._base_url = base_url or ARRAKIS_BASE_URL
        self._initialized = False
        self._healthy = False
        self._version: Optional[str] = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def init(self) -> dict[str, Any]:
        """Initialize the bridge by checking Arrakis connectivity.

        Pings the Arrakis health endpoint and, if available, the
        microsandbox bridge to verify the full stack is operational.

        Returns:
            Dictionary with initialization results.
        """
        if self._initialized:
            return {
                "success": True,
                "initialized": True,
                "healthy": self._healthy,
                "version": self._version,
                "base_url": self._base_url,
            }

        # 1. Ping Arrakis health endpoint
        health = await self.health_check()
        self._healthy = health.get("healthy", False)
        self._version = health.get("version")
        self._initialized = True

        if not self._healthy:
            return {
                "success": False,
                "initialized": True,
                "healthy": False,
                "version": None,
                "base_url": self._base_url,
                "error": health.get("error", "Arrakis service not reachable"),
                "instructions": (
                    "Start Arrakis with: "
                    "cd external/arrakis && go run ./cmd/server "
                    f"--listen {self._base_url}"
                ),
            }

        logger.info(
            "Arrakis bridge initialized: url=%s, version=%s",
            self._base_url, self._version,
        )
        return {
            "success": True,
            "initialized": True,
            "healthy": True,
            "version": self._version,
            "base_url": self._base_url,
        }

    def status(self) -> ToolStatus:
        """Return the current health status of the Arrakis bridge.

        Returns:
            ToolStatus with availability and health information.
        """
        if not self._initialized:
            return ToolStatus(
                name="arrakis",
                available=False,
                healthy=False,
                error="Bridge not initialized. Call init() first.",
            )
        return ToolStatus(
            name="arrakis",
            available=True,
            healthy=self._healthy,
            version=self._version,
            error=None if self._healthy else "Arrakis service not reachable",
        )

    def capabilities(self) -> list[str]:
        """Return the list of capabilities this bridge provides.

        Returns:
            List of capability strings.
        """
        return [
            "vm_snapshot",
            "vm_restore",
            "deterministic_replay",
            "state_fork",
            "list_snapshots",
        ]

    # ------------------------------------------------------------------
    # Health check
    # ------------------------------------------------------------------

    async def health_check(self) -> dict[str, Any]:
        """Check Arrakis server and microsandbox dependency availability.

        Returns:
            Dictionary with health-check results.
        """
        result: dict[str, Any] = {
            "healthy": False,
            "arrakis_reachable": False,
            "microsandbox_reachable": False,
        }

        # 1. Check Arrakis itself
        try:
            status_code, body = await _api_call(
                "GET", HEALTH_ENDPOINT, base_url=self._base_url, timeout=5,
            )
            if status_code == 200:
                result["arrakis_reachable"] = True
                result["version"] = body.get("version")
                result["uptime"] = body.get("uptime")
            else:
                result["error"] = body.get(
                    "error", f"Arrakis returned HTTP {status_code}"
                )
        except Exception as exc:
            result["error"] = f"Failed to reach Arrakis: {exc}"

        # 2. Check microsandbox dependency
        try:
            from integrations.microsandbox_bridge import health_check as msb_health
            # Module-level convenience function is sync, but the bridge's
            # health_check is async -- use the bridge's singleton.
            from integrations.microsandbox_bridge import _get_bridge
            msb_result = await _get_bridge().health_check()
            result["microsandbox_reachable"] = msb_result.get("healthy", False)
        except ImportError:
            result["microsandbox_reachable"] = False
            logger.debug("microsandbox_bridge not importable for health check")
        except Exception:
            result["microsandbox_reachable"] = False

        # Overall healthy only if Arrakis itself is reachable
        result["healthy"] = result["arrakis_reachable"]
        return result

    # ------------------------------------------------------------------
    # Snapshot operations
    # ------------------------------------------------------------------

    async def snapshot_create(
        self,
        sandbox_id: str,
        label: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create a VM snapshot of the given sandbox.

        Args:
            sandbox_id: ID of the microsandbox sandbox to snapshot.
            label: Optional human-readable label for the snapshot.

        Returns:
            Dictionary with snapshot creation results including
            ``snapshot_id``.
        """
        payload: dict[str, Any] = {"sandbox_id": sandbox_id}
        if label:
            payload["label"] = label

        status_code, body = await _api_call(
            "POST", SNAPSHOT_PREFIX, data=payload,
            base_url=self._base_url,
        )

        if status_code < 0 or status_code >= 400:
            return self._error_response(
                "snapshot_create", status_code, body, sandbox_id=sandbox_id,
            )

        logger.info(
            "Snapshot created: snapshot_id=%s, sandbox_id=%s, label=%s",
            body.get("snapshot_id"), sandbox_id, label,
        )
        return {"success": True, **body}

    async def snapshot_restore(
        self, snapshot_id: str
    ) -> dict[str, Any]:
        """Restore a sandbox to a previous snapshot state.

        Args:
            snapshot_id: ID of the snapshot to restore.

        Returns:
            Dictionary with restore results.
        """
        status_code, body = await _api_call(
            "POST", f"{SNAPSHOT_PREFIX}/{snapshot_id}/restore",
            base_url=self._base_url,
        )

        if status_code < 0 or status_code >= 400:
            return self._error_response(
                "snapshot_restore", status_code, body,
                snapshot_id=snapshot_id,
            )

        logger.info("Snapshot restored: snapshot_id=%s", snapshot_id)
        return {"success": True, **body}

    async def snapshot_list(
        self, sandbox_id: str
    ) -> dict[str, Any]:
        """List all snapshots for a sandbox.

        Args:
            sandbox_id: ID of the sandbox whose snapshots to list.

        Returns:
            Dictionary with snapshot list results.
        """
        status_code, body = await _api_call(
            "GET", f"{SNAPSHOT_PREFIX}?sandbox_id={sandbox_id}",
            base_url=self._base_url,
        )

        if status_code < 0 or status_code >= 400:
            return self._error_response(
                "snapshot_list", status_code, body, sandbox_id=sandbox_id,
            )

        return {
            "success": True,
            "sandbox_id": sandbox_id,
            "snapshots": body.get("snapshots", []),
            "count": len(body.get("snapshots", [])),
        }

    async def snapshot_delete(
        self, snapshot_id: str
    ) -> dict[str, Any]:
        """Delete a snapshot.

        Args:
            snapshot_id: ID of the snapshot to delete.

        Returns:
            Dictionary with deletion results.
        """
        status_code, body = await _api_call(
            "DELETE", f"{SNAPSHOT_PREFIX}/{snapshot_id}",
            base_url=self._base_url,
        )

        if status_code < 0 or status_code >= 400:
            return self._error_response(
                "snapshot_delete", status_code, body,
                snapshot_id=snapshot_id,
            )

        logger.info("Snapshot deleted: snapshot_id=%s", snapshot_id)
        return {"success": True, "snapshot_id": snapshot_id}

    # ------------------------------------------------------------------
    # Fork (for LATS pattern)
    # ------------------------------------------------------------------

    async def fork(
        self,
        snapshot_id: str,
        label: Optional[str] = None,
    ) -> dict[str, Any]:
        """Fork a new sandbox from an existing snapshot.

        This is the key primitive for LATS (Language Agent Tree Search):
        it creates a brand-new sandbox whose initial state is a copy of
        the given snapshot, allowing parallel exploration of different
        strategies from the same checkpoint.

        Args:
            snapshot_id: Snapshot to fork from.
            label: Optional label for the new sandbox.

        Returns:
            Dictionary with fork results including the new sandbox_id.
        """
        payload: dict[str, Any] = {"snapshot_id": snapshot_id}
        if label:
            payload["label"] = label

        status_code, body = await _api_call(
            "POST", f"{SANDBOX_PREFIX}/fork", data=payload,
            base_url=self._base_url,
        )

        if status_code < 0 or status_code >= 400:
            return self._error_response(
                "fork", status_code, body, snapshot_id=snapshot_id,
            )

        logger.info(
            "Forked sandbox: new_sandbox_id=%s from snapshot_id=%s",
            body.get("sandbox_id"), snapshot_id,
        )
        return {"success": True, **body}

    # ------------------------------------------------------------------
    # Replay bundling
    # ------------------------------------------------------------------

    async def replay_bundle(
        self,
        run_id: str,
        snapshot_id: str,
        inputs: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Package a deterministic replay bundle.

        Bundles a snapshot reference with a sequence of inputs so the
        execution can be reproduced deterministically.

        Args:
            run_id: Unique identifier for this replay run.
            snapshot_id: Starting snapshot for the replay.
            inputs: Ordered list of input events to replay.

        Returns:
            Dictionary with replay bundle results.
        """
        payload = {
            "run_id": run_id,
            "snapshot_id": snapshot_id,
            "inputs": inputs,
        }

        status_code, body = await _api_call(
            "POST", f"{REPLAY_PREFIX}/bundle", data=payload,
            base_url=self._base_url,
        )

        if status_code < 0 or status_code >= 400:
            return self._error_response(
                "replay_bundle", status_code, body,
                run_id=run_id, snapshot_id=snapshot_id,
            )

        logger.info(
            "Replay bundle created: run_id=%s, snapshot_id=%s, inputs=%d",
            run_id, snapshot_id, len(inputs),
        )
        return {"success": True, **body}

    # ------------------------------------------------------------------
    # Registry dispatch
    # ------------------------------------------------------------------

    async def execute(
        self, operation: str, params: dict[str, Any]
    ) -> dict[str, Any]:
        """Dispatch an operation from the ToolRegistry.

        This is the unified entry point called by
        ``ToolRegistry.execute("arrakis", operation, params)``.

        Args:
            operation: The operation name to perform.
            params: Keyword arguments forwarded to the operation function.

        Returns:
            Operation result dictionary.  Always includes a ``"success"`` key.

        Supported operations:
            - ``"init"`` -- initialize the bridge
            - ``"health_check"`` -- check service health
            - ``"status"`` -- bridge health status
            - ``"capabilities"`` -- list capabilities
            - ``"snapshot_create"`` -- create VM snapshot
            - ``"snapshot_restore"`` -- restore VM to snapshot
            - ``"snapshot_list"`` -- list snapshots for a sandbox
            - ``"snapshot_delete"`` -- delete a snapshot
            - ``"fork"`` -- fork new sandbox from snapshot
            - ``"replay_bundle"`` -- package deterministic replay
        """
        async_ops: dict[str, Any] = {
            "init": self.init,
            "health_check": self.health_check,
            "snapshot_create": self.snapshot_create,
            "snapshot_restore": self.snapshot_restore,
            "snapshot_list": self.snapshot_list,
            "snapshot_delete": self.snapshot_delete,
            "fork": self.fork,
            "replay_bundle": self.replay_bundle,
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
            logger.exception("Error executing arrakis.%s", operation)
            return {"success": False, "error": str(exc)}

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _error_response(
        operation: str,
        status_code: int,
        body: dict[str, Any],
        **extra: Any,
    ) -> dict[str, Any]:
        """Build a standardised error response dict."""
        error_msg = body.get("error", body.get("raw", f"HTTP {status_code}"))
        result: dict[str, Any] = {
            "success": False,
            "error": f"{operation} failed: {error_msg}",
        }
        result.update(extra)

        if status_code == -1:
            result["instructions"] = (
                "Arrakis service is not reachable.  Start it with: "
                "cd external/arrakis && go run ./cmd/server"
            )

        return result


# ---------------------------------------------------------------------------
# Module-level convenience functions
# ---------------------------------------------------------------------------

_bridge: Optional[ArrakisBridge] = None


def _get_bridge() -> ArrakisBridge:
    """Get or create the singleton bridge instance."""
    global _bridge
    if _bridge is None:
        _bridge = ArrakisBridge()
    return _bridge


async def init() -> dict[str, Any]:
    """Initialize the Arrakis bridge (module-level convenience)."""
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
            async with coordinator.acquire("arrakis", "snapshot"):
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
# CLI entry point (--selftest)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Arrakis Bridge - VM snapshot management for Super-Goose",
    )
    parser.add_argument(
        "--selftest", action="store_true",
        help="Run a basic self-test to verify bridge functionality",
    )
    parser.add_argument(
        "--url", type=str, default=ARRAKIS_BASE_URL,
        help=f"Arrakis API base URL (default: {ARRAKIS_BASE_URL})",
    )
    args = parser.parse_args()

    async def _self_test() -> None:
        """Run a self-test of the Arrakis bridge."""
        print("=" * 60)
        print("Arrakis Bridge Self-Test")
        print("=" * 60)

        bridge = ArrakisBridge(base_url=args.url)

        # 1. Init
        print("\n[1/5] Initializing bridge...")
        result = await bridge.init()
        print(f"  Base URL: {result.get('base_url')}")
        print(f"  Version:  {result.get('version', 'unknown')}")
        print(f"  Healthy:  {result.get('healthy', False)}")
        if result.get("error"):
            print(f"  Error:    {result['error']}")
        if result.get("instructions"):
            print(f"  Hint:     {result['instructions']}")

        # 2. Status
        print("\n[2/5] Checking status...")
        st = bridge.status()
        print(f"  Available: {st.available}")
        print(f"  Healthy:   {st.healthy}")
        if st.error:
            print(f"  Error:     {st.error}")

        # 3. Capabilities
        print("\n[3/5] Listing capabilities...")
        caps = bridge.capabilities()
        print(f"  Capabilities: {', '.join(caps)}")

        # 4. Health check
        print("\n[4/5] Health check...")
        health = await bridge.health_check()
        print(f"  Arrakis reachable:      {health.get('arrakis_reachable', False)}")
        print(f"  Microsandbox reachable: {health.get('microsandbox_reachable', False)}")
        if health.get("error"):
            print(f"  Error: {health['error']}")

        if not result.get("healthy"):
            print("\n[5/5] Skipping snapshot test (Arrakis not available).")
            print("\n" + "=" * 60)
            print("Self-test complete (partial -- Arrakis not running).")
            print("=" * 60)
            return

        # 5. Try snapshot operations
        print("\n[5/5] Testing snapshot operations...")
        test_sandbox_id = "selftest-sandbox"

        # Create snapshot
        snap = await bridge.snapshot_create(
            sandbox_id=test_sandbox_id, label="selftest-snap"
        )
        if snap.get("success"):
            snapshot_id = snap.get("snapshot_id", "unknown")
            print(f"  Snapshot created: {snapshot_id}")

            # List snapshots
            snap_list = await bridge.snapshot_list(sandbox_id=test_sandbox_id)
            print(f"  Snapshots listed: {snap_list.get('count', 0)}")

            # Fork
            fork_result = await bridge.fork(
                snapshot_id=snapshot_id, label="selftest-fork"
            )
            print(f"  Fork result: success={fork_result.get('success')}")

            # Restore
            restore_result = await bridge.snapshot_restore(
                snapshot_id=snapshot_id
            )
            print(f"  Restore result: success={restore_result.get('success')}")

            # Delete
            del_result = await bridge.snapshot_delete(snapshot_id=snapshot_id)
            print(f"  Delete result: success={del_result.get('success')}")
        else:
            print(f"  Snapshot create failed: {snap.get('error')}")

        print("\n" + "=" * 60)
        print("Self-test complete.")
        print("=" * 60)

    asyncio.run(_self_test())
