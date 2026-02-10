"""
Resource Coordinator — Prevents conflicts between the 16 Super-Goose tools.

Manages:
  - Exclusive locks (repo writes, DSPy LM config)
  - Shared read locks (repo reads, DB queries)
  - Semaphore-based rate limiting (LLM API, Docker socket, sandbox pool)
  - Dependency health checks (Neo4j, Qdrant, Langfuse stack)
  - LLM API budget tracking

Usage:
    coordinator = ResourceCoordinator()

    # Acquire before tool execution
    async with coordinator.acquire("aider", "edit_file"):
        result = await bridge.execute("edit_file", params)

    # Or manual acquire/release
    token = await coordinator.acquire_resources("dspy", "optimize")
    try:
        result = await bridge.execute("optimize", params)
    finally:
        await coordinator.release_resources(token)
"""

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from uuid import uuid4

import aiohttp

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Enums & Data Classes
# ---------------------------------------------------------------------------

class LockType(Enum):
    EXCLUSIVE = "exclusive"
    SHARED_READ = "shared_read"
    SEMAPHORE = "semaphore"


class ResourceId(Enum):
    REPO_WRITE = "repo_write"
    REPO_READ = "repo_read"
    LLM_API = "llm_api"
    DOCKER_SOCKET = "docker_socket"
    NEO4J = "neo4j"
    QDRANT = "qdrant"
    LANGFUSE = "langfuse"
    SANDBOX_POOL = "sandbox_pool"
    DSPY_LM_CONFIG = "dspy_lm_config"


@dataclass
class ResourceRequirement:
    resource: ResourceId
    lock_type: LockType


@dataclass
class AcquiredToken:
    token_id: str
    tool_name: str
    operation: str
    resources: list[ResourceId]
    acquired_at: datetime


@dataclass
class LLMUsageRecord:
    timestamp: datetime
    tool_name: str
    tokens_used: int
    cost_usd: float


@dataclass
class InfraHealthCheck:
    url: str
    method: str = "GET"
    expected_status: int = 200
    timeout_seconds: float = 5.0


# ---------------------------------------------------------------------------
# Tool → Resource Mapping
# ---------------------------------------------------------------------------

TOOL_RESOURCES: dict[str, dict[str, list[ResourceRequirement]]] = {
    "aider": {
        "edit_file": [
            ResourceRequirement(ResourceId.REPO_WRITE, LockType.EXCLUSIVE),
            ResourceRequirement(ResourceId.LLM_API, LockType.SEMAPHORE),
        ],
        "map_repo": [
            ResourceRequirement(ResourceId.REPO_READ, LockType.SHARED_READ),
        ],
        "auto_commit": [
            ResourceRequirement(ResourceId.REPO_WRITE, LockType.EXCLUSIVE),
        ],
    },
    "ast_grep": {
        "search": [ResourceRequirement(ResourceId.REPO_READ, LockType.SHARED_READ)],
        "replace": [ResourceRequirement(ResourceId.REPO_WRITE, LockType.EXCLUSIVE)],
        "scan": [ResourceRequirement(ResourceId.REPO_READ, LockType.SHARED_READ)],
    },
    "openhands": {
        "sandbox_exec": [
            ResourceRequirement(ResourceId.DOCKER_SOCKET, LockType.SEMAPHORE),
            ResourceRequirement(ResourceId.REPO_WRITE, LockType.EXCLUSIVE),
        ],
        "browse": [],
        "status": [],
    },
    "dspy": {
        "optimize": [
            ResourceRequirement(ResourceId.DSPY_LM_CONFIG, LockType.EXCLUSIVE),
            ResourceRequirement(ResourceId.LLM_API, LockType.SEMAPHORE),
        ],
        "compile": [
            ResourceRequirement(ResourceId.DSPY_LM_CONFIG, LockType.EXCLUSIVE),
            ResourceRequirement(ResourceId.LLM_API, LockType.SEMAPHORE),
        ],
        "create_signature": [
            ResourceRequirement(ResourceId.DSPY_LM_CONFIG, LockType.SHARED_READ),
        ],
        "export_compiled": [],
    },
    "inspect_ai": {
        "run_eval": [
            ResourceRequirement(ResourceId.DOCKER_SOCKET, LockType.SEMAPHORE),
            ResourceRequirement(ResourceId.LLM_API, LockType.SEMAPHORE),
        ],
        "score": [
            ResourceRequirement(ResourceId.LLM_API, LockType.SEMAPHORE),
        ],
        "load_dataset": [],
    },
    "mem0": {
        "store_trajectory": [
            ResourceRequirement(ResourceId.NEO4J, LockType.SEMAPHORE),
            ResourceRequirement(ResourceId.QDRANT, LockType.SEMAPHORE),
        ],
        "query_memory": [
            ResourceRequirement(ResourceId.NEO4J, LockType.SHARED_READ),
            ResourceRequirement(ResourceId.QDRANT, LockType.SHARED_READ),
        ],
        "add_entity": [
            ResourceRequirement(ResourceId.NEO4J, LockType.SEMAPHORE),
            ResourceRequirement(ResourceId.QDRANT, LockType.SEMAPHORE),
        ],
        "search": [
            ResourceRequirement(ResourceId.NEO4J, LockType.SHARED_READ),
            ResourceRequirement(ResourceId.QDRANT, LockType.SHARED_READ),
        ],
    },
    "microsandbox": {
        "create_sandbox": [ResourceRequirement(ResourceId.SANDBOX_POOL, LockType.SEMAPHORE)],
        "run_command": [ResourceRequirement(ResourceId.SANDBOX_POOL, LockType.SEMAPHORE)],
        "destroy_sandbox": [ResourceRequirement(ResourceId.SANDBOX_POOL, LockType.SEMAPHORE)],
        "snapshot": [ResourceRequirement(ResourceId.SANDBOX_POOL, LockType.SEMAPHORE)],
    },
    "arrakis": {
        "snapshot": [ResourceRequirement(ResourceId.SANDBOX_POOL, LockType.SEMAPHORE)],
        "restore": [ResourceRequirement(ResourceId.SANDBOX_POOL, LockType.EXCLUSIVE)],
        "list_snapshots": [],
        "fork": [ResourceRequirement(ResourceId.SANDBOX_POOL, LockType.SEMAPHORE)],
    },
    "langfuse": {
        "log_trace": [ResourceRequirement(ResourceId.LANGFUSE, LockType.SEMAPHORE)],
        "log_span": [ResourceRequirement(ResourceId.LANGFUSE, LockType.SEMAPHORE)],
        "get_metrics": [ResourceRequirement(ResourceId.LANGFUSE, LockType.SHARED_READ)],
    },
    "semgrep": {
        "scan": [ResourceRequirement(ResourceId.REPO_READ, LockType.SHARED_READ)],
        "check_policy": [ResourceRequirement(ResourceId.REPO_READ, LockType.SHARED_READ)],
        "autofix": [ResourceRequirement(ResourceId.REPO_WRITE, LockType.EXCLUSIVE)],
    },
    "crosshair": {
        "verify": [ResourceRequirement(ResourceId.REPO_READ, LockType.SHARED_READ)],
        "check_contracts": [ResourceRequirement(ResourceId.REPO_READ, LockType.SHARED_READ)],
        "find_counterexample": [ResourceRequirement(ResourceId.REPO_READ, LockType.SHARED_READ)],
    },
    "pr_agent": {
        "review": [ResourceRequirement(ResourceId.LLM_API, LockType.SEMAPHORE)],
        "describe": [ResourceRequirement(ResourceId.LLM_API, LockType.SEMAPHORE)],
        "improve": [ResourceRequirement(ResourceId.LLM_API, LockType.SEMAPHORE)],
    },
    "pydantic_ai": {
        "validate_output": [],
        "run_typed_agent": [ResourceRequirement(ResourceId.LLM_API, LockType.SEMAPHORE)],
    },
    "conscious": {
        "voice_start": [],
        "voice_status": [],
        "voice_audio": [],
    },
    "langgraph": {
        "create_workflow": [],
        "run_workflow": [ResourceRequirement(ResourceId.LLM_API, LockType.SEMAPHORE)],
        "checkpoint": [],
        "resume": [ResourceRequirement(ResourceId.LLM_API, LockType.SEMAPHORE)],
    },
}

# Tool dependency chains — tool B cannot execute if dependency A is unhealthy
TOOL_DEPENDENCIES: dict[str, list[str]] = {
    "mem0": ["neo4j", "qdrant"],
    "langfuse": ["langfuse_stack"],
    "arrakis": ["microsandbox"],
    "overnight_gym": ["dspy", "inspect_ai", "mem0"],
}

# Infrastructure health endpoints
INFRA_HEALTH_CHECKS: dict[str, InfraHealthCheck] = {
    "neo4j": InfraHealthCheck(url="http://localhost:7474"),
    "qdrant": InfraHealthCheck(url="http://localhost:6333/collections"),
    "langfuse_stack": InfraHealthCheck(url="http://localhost:3000"),
}


# ---------------------------------------------------------------------------
# Resource Lock Primitives
# ---------------------------------------------------------------------------

class ReadWriteLock:
    """Async read-write lock. Multiple concurrent readers OR one exclusive writer."""

    def __init__(self):
        self._readers: int = 0
        self._writer: bool = False
        self._read_lock = asyncio.Lock()
        self._write_lock = asyncio.Lock()
        self._no_readers = asyncio.Event()
        self._no_readers.set()
        self._holder: Optional[str] = None

    async def acquire_read(self, holder: str = "") -> None:
        async with self._read_lock:
            while self._writer:
                await asyncio.sleep(0.01)
            self._readers += 1
            self._no_readers.clear()

    async def release_read(self) -> None:
        async with self._read_lock:
            self._readers -= 1
            if self._readers == 0:
                self._no_readers.set()

    async def acquire_write(self, holder: str = "", timeout: float = 30.0) -> bool:
        deadline = time.monotonic() + timeout
        acquired = await asyncio.wait_for(
            self._write_lock.acquire(), timeout=timeout
        )
        if not acquired:
            return False
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            self._write_lock.release()
            return False
        try:
            await asyncio.wait_for(self._no_readers.wait(), timeout=remaining)
        except asyncio.TimeoutError:
            self._write_lock.release()
            return False
        self._writer = True
        self._holder = holder
        return True

    async def release_write(self) -> None:
        self._writer = False
        self._holder = None
        self._write_lock.release()


# ---------------------------------------------------------------------------
# LLM Budget Manager
# ---------------------------------------------------------------------------

class LLMBudgetManager:
    """Tracks and limits LLM API usage across all tools."""

    def __init__(
        self,
        max_requests_per_minute: int = 60,
        max_tokens_per_minute: int = 200_000,
        max_cost_per_hour_usd: float = 20.0,
    ):
        self.max_rpm = max_requests_per_minute
        self.max_tpm = max_tokens_per_minute
        self.max_cost_per_hour = max_cost_per_hour_usd
        self._semaphore = asyncio.Semaphore(max_requests_per_minute)
        self._usage: list[LLMUsageRecord] = []
        self._lock = asyncio.Lock()

    async def acquire(self, tool_name: str, estimated_tokens: int = 1000) -> bool:
        """Check budget and acquire a request slot. Returns False if over budget."""
        async with self._lock:
            self._prune_old_records()
            minute_tokens = sum(r.tokens_used for r in self._usage if self._within_minute(r))
            hour_cost = sum(r.cost_usd for r in self._usage if self._within_hour(r))
            minute_requests = sum(1 for r in self._usage if self._within_minute(r))

            if minute_requests >= self.max_rpm:
                logger.warning(f"LLM rate limit hit ({minute_requests}/{self.max_rpm} RPM) by {tool_name}")
                return False
            if minute_tokens + estimated_tokens > self.max_tpm:
                logger.warning(f"LLM token limit approaching ({minute_tokens}/{self.max_tpm} TPM) by {tool_name}")
                return False
            if hour_cost >= self.max_cost_per_hour:
                logger.warning(f"LLM cost limit hit (${hour_cost:.2f}/${self.max_cost_per_hour} /hr) by {tool_name}")
                return False
            return True

    async def record_usage(self, tool_name: str, tokens: int, cost_usd: float) -> None:
        async with self._lock:
            self._usage.append(LLMUsageRecord(
                timestamp=datetime.now(timezone.utc),
                tool_name=tool_name,
                tokens_used=tokens,
                cost_usd=cost_usd,
            ))

    def get_usage_summary(self) -> dict[str, Any]:
        self._prune_old_records()
        hour_records = [r for r in self._usage if self._within_hour(r)]
        by_tool: dict[str, float] = {}
        for r in hour_records:
            by_tool[r.tool_name] = by_tool.get(r.tool_name, 0.0) + r.cost_usd
        return {
            "requests_last_minute": sum(1 for r in self._usage if self._within_minute(r)),
            "tokens_last_minute": sum(r.tokens_used for r in self._usage if self._within_minute(r)),
            "cost_last_hour_usd": sum(r.cost_usd for r in hour_records),
            "cost_by_tool": by_tool,
        }

    def _within_minute(self, record: LLMUsageRecord) -> bool:
        return (datetime.now(timezone.utc) - record.timestamp).total_seconds() < 60

    def _within_hour(self, record: LLMUsageRecord) -> bool:
        return (datetime.now(timezone.utc) - record.timestamp).total_seconds() < 3600

    def _prune_old_records(self) -> None:
        cutoff = datetime.now(timezone.utc)
        self._usage = [r for r in self._usage if self._within_hour(r)]


# ---------------------------------------------------------------------------
# Main Coordinator
# ---------------------------------------------------------------------------

class ResourceCoordinator:
    """
    Central resource coordinator for all 16 Super-Goose tools.

    Prevents conflicts by managing locks, rate limits, and dependency checks.
    """

    def __init__(self):
        # Read-write locks for repo access
        self._repo_lock = ReadWriteLock()

        # Exclusive locks for single-holder resources
        self._exclusive_locks: dict[ResourceId, asyncio.Lock] = {
            ResourceId.DSPY_LM_CONFIG: asyncio.Lock(),
        }

        # Semaphores for limited-concurrency resources
        self._semaphores: dict[ResourceId, asyncio.Semaphore] = {
            ResourceId.LLM_API: asyncio.Semaphore(10),
            ResourceId.DOCKER_SOCKET: asyncio.Semaphore(3),
            ResourceId.NEO4J: asyncio.Semaphore(5),
            ResourceId.QDRANT: asyncio.Semaphore(5),
            ResourceId.LANGFUSE: asyncio.Semaphore(10),
            ResourceId.SANDBOX_POOL: asyncio.Semaphore(4),
        }

        # Budget manager
        self.llm_budget = LLMBudgetManager()

        # Active operations tracking
        self._active_ops: dict[str, AcquiredToken] = {}
        self._ops_lock = asyncio.Lock()

        # Infrastructure health cache
        self._health_cache: dict[str, tuple[bool, float]] = {}
        self._health_cache_ttl: float = 30.0  # seconds

    @asynccontextmanager
    async def acquire(self, tool_name: str, operation: str):
        """Context manager to acquire and release resources for a tool operation."""
        token = await self.acquire_resources(tool_name, operation)
        try:
            yield token
        finally:
            await self.release_resources(token)

    async def acquire_resources(
        self, tool_name: str, operation: str, timeout: float = 30.0
    ) -> AcquiredToken:
        """Acquire all resources needed for a tool operation."""
        requirements = self._get_requirements(tool_name, operation)
        if not requirements:
            # No resources needed — return empty token
            token = AcquiredToken(
                token_id=str(uuid4()),
                tool_name=tool_name,
                operation=operation,
                resources=[],
                acquired_at=datetime.now(timezone.utc),
            )
            async with self._ops_lock:
                self._active_ops[token.token_id] = token
            return token

        # Check dependency health first
        await self._check_dependencies(tool_name)

        # Check LLM budget if needed
        llm_needed = any(r.resource == ResourceId.LLM_API for r in requirements)
        if llm_needed:
            budget_ok = await self.llm_budget.acquire(tool_name)
            if not budget_ok:
                raise ResourceBudgetExceeded(
                    f"LLM API budget exceeded for {tool_name}.{operation}"
                )

        # Acquire locks in a consistent order to prevent deadlocks
        acquired_resources: list[ResourceId] = []
        sorted_reqs = sorted(requirements, key=lambda r: r.resource.value)

        try:
            for req in sorted_reqs:
                await self._acquire_single(req, tool_name, timeout)
                acquired_resources.append(req.resource)
        except Exception:
            # Rollback on failure
            for rid in reversed(acquired_resources):
                matching = [r for r in sorted_reqs if r.resource == rid]
                if matching:
                    await self._release_single(matching[0], tool_name)
            raise

        token = AcquiredToken(
            token_id=str(uuid4()),
            tool_name=tool_name,
            operation=operation,
            resources=acquired_resources,
            acquired_at=datetime.now(timezone.utc),
        )
        async with self._ops_lock:
            self._active_ops[token.token_id] = token

        logger.debug(
            f"Resources acquired for {tool_name}.{operation}: "
            f"{[r.value for r in acquired_resources]}"
        )
        return token

    async def release_resources(self, token: AcquiredToken) -> None:
        """Release all resources held by a token."""
        requirements = self._get_requirements(token.tool_name, token.operation)
        for req in reversed(requirements):
            if req.resource in token.resources:
                await self._release_single(req, token.tool_name)

        async with self._ops_lock:
            self._active_ops.pop(token.token_id, None)

        logger.debug(
            f"Resources released for {token.tool_name}.{token.operation}: "
            f"{[r.value for r in token.resources]}"
        )

    async def check_infra_health(self, service: str) -> bool:
        """Check if an infrastructure service is healthy (with caching)."""
        now = time.monotonic()
        cached = self._health_cache.get(service)
        if cached and (now - cached[1]) < self._health_cache_ttl:
            return cached[0]

        check = INFRA_HEALTH_CHECKS.get(service)
        if not check:
            return True  # Unknown services assumed healthy

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    check.url, timeout=aiohttp.ClientTimeout(total=check.timeout_seconds)
                ) as resp:
                    healthy = resp.status == check.expected_status
        except Exception as e:
            logger.warning(f"Infrastructure health check failed for {service}: {e}")
            healthy = False

        self._health_cache[service] = (healthy, now)
        return healthy

    def get_active_operations(self) -> list[dict[str, Any]]:
        """Return list of currently active tool operations."""
        return [
            {
                "tool": t.tool_name,
                "operation": t.operation,
                "resources": [r.value for r in t.resources],
                "duration_s": (datetime.now(timezone.utc) - t.acquired_at).total_seconds(),
            }
            for t in self._active_ops.values()
        ]

    def get_status(self) -> dict[str, Any]:
        """Return coordinator status for monitoring."""
        return {
            "active_operations": len(self._active_ops),
            "operations": self.get_active_operations(),
            "llm_budget": self.llm_budget.get_usage_summary(),
            "health_cache": {
                k: {"healthy": v[0], "age_s": time.monotonic() - v[1]}
                for k, v in self._health_cache.items()
            },
        }

    # --- Private helpers ---

    def _get_requirements(
        self, tool_name: str, operation: str
    ) -> list[ResourceRequirement]:
        tool_ops = TOOL_RESOURCES.get(tool_name, {})
        return tool_ops.get(operation, [])

    async def _acquire_single(
        self, req: ResourceRequirement, holder: str, timeout: float
    ) -> None:
        if req.resource == ResourceId.REPO_WRITE:
            success = await self._repo_lock.acquire_write(holder, timeout)
            if not success:
                raise ResourceAcquisitionTimeout(
                    f"Timeout acquiring REPO_WRITE for {holder}"
                )
        elif req.resource == ResourceId.REPO_READ:
            await self._repo_lock.acquire_read(holder)
        elif req.lock_type == LockType.EXCLUSIVE:
            lock = self._exclusive_locks.get(req.resource)
            if lock:
                try:
                    await asyncio.wait_for(lock.acquire(), timeout=timeout)
                except asyncio.TimeoutError:
                    raise ResourceAcquisitionTimeout(
                        f"Timeout acquiring {req.resource.value} for {holder}"
                    )
        elif req.lock_type == LockType.SEMAPHORE:
            sem = self._semaphores.get(req.resource)
            if sem:
                try:
                    await asyncio.wait_for(sem.acquire(), timeout=timeout)
                except asyncio.TimeoutError:
                    raise ResourceAcquisitionTimeout(
                        f"Timeout acquiring {req.resource.value} semaphore for {holder}"
                    )

    async def _release_single(
        self, req: ResourceRequirement, holder: str
    ) -> None:
        try:
            if req.resource == ResourceId.REPO_WRITE:
                await self._repo_lock.release_write()
            elif req.resource == ResourceId.REPO_READ:
                await self._repo_lock.release_read()
            elif req.lock_type == LockType.EXCLUSIVE:
                lock = self._exclusive_locks.get(req.resource)
                if lock and lock.locked():
                    lock.release()
            elif req.lock_type == LockType.SEMAPHORE:
                sem = self._semaphores.get(req.resource)
                if sem:
                    sem.release()
        except Exception as e:
            logger.error(f"Error releasing {req.resource.value} for {holder}: {e}")

    async def _check_dependencies(self, tool_name: str) -> None:
        deps = TOOL_DEPENDENCIES.get(tool_name, [])
        for dep in deps:
            healthy = await self.check_infra_health(dep)
            if not healthy:
                raise DependencyUnavailable(
                    f"Dependency '{dep}' is unhealthy for tool '{tool_name}'"
                )


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class ResourceCoordinatorError(Exception):
    """Base exception for resource coordination."""
    pass


class ResourceAcquisitionTimeout(ResourceCoordinatorError):
    """Timed out waiting for a resource lock."""
    pass


class ResourceBudgetExceeded(ResourceCoordinatorError):
    """LLM API budget exceeded."""
    pass


class DependencyUnavailable(ResourceCoordinatorError):
    """A required infrastructure dependency is not healthy."""
    pass


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_coordinator: Optional[ResourceCoordinator] = None


def get_coordinator() -> ResourceCoordinator:
    """Get the singleton ResourceCoordinator instance."""
    global _coordinator
    if _coordinator is None:
        _coordinator = ResourceCoordinator()
    return _coordinator


# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------

async def _selftest():
    """Run basic coordination self-test."""
    coord = ResourceCoordinator()

    # Test 1: Acquire and release repo write lock
    async with coord.acquire("aider", "edit_file") as token:
        assert len(token.resources) > 0
        assert ResourceId.REPO_WRITE in token.resources
        print(f"  [PASS] aider.edit_file acquired: {[r.value for r in token.resources]}")

    # Test 2: Concurrent reads should not block
    async def read_op(name):
        async with coord.acquire(name, "scan"):
            await asyncio.sleep(0.1)
            return True

    results = await asyncio.gather(
        read_op("semgrep"), read_op("crosshair"), read_op("ast_grep")
    )
    assert all(results)
    print("  [PASS] Concurrent reads (semgrep + crosshair + ast_grep) succeeded")

    # Test 3: LLM budget tracking
    await coord.llm_budget.record_usage("dspy", 5000, 0.05)
    summary = coord.llm_budget.get_usage_summary()
    assert summary["cost_last_hour_usd"] > 0
    print(f"  [PASS] LLM budget tracking: ${summary['cost_last_hour_usd']:.2f}")

    # Test 4: Status report
    status = coord.get_status()
    assert "active_operations" in status
    print(f"  [PASS] Status report: {status['active_operations']} active ops")

    print("\nAll resource_coordinator self-tests passed!")


if __name__ == "__main__":
    print("Running resource_coordinator self-tests...\n")
    asyncio.run(_selftest())
