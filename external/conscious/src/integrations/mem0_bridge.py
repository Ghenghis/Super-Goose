"""
Mem0 Bridge - Graph memory integration for Super-Goose.

Provides async graph memory backed by Mem0's ``AsyncMemory`` class with
Neo4j (graph store) and Qdrant (vector store).  All operations are fully
async, scoped by ``user_id`` / ``agent_id`` / ``run_id``, and include a
graceful fallback chain:

    1. **AsyncMemory SDK** -- full graph + vector via Neo4j + Qdrant
    2. **Vector-only SDK** -- if Neo4j is down, reinitialize without graph
    3. **HTTP REST client** -- aiohttp calls to a running Mem0 API server
    4. **JSON file store** -- minimal local fallback (no infra required)

Key operations exposed through ``execute()``:

    store_trajectory    - Persist a run trajectory as an entity graph
    query_memory        - Semantic search across vector and graph
    add_entity          - Add a memory entry with agent/run scoping
    search              - Hybrid vector + graph search
    get_trajectory      - Retrieve a stored trajectory by run_id
    delete_old          - Prune memories older than N days
    store_memory        - Persist a fact or observation
    search_memory       - Search memories by semantic similarity
    get_all_memories    - List all memories for a scope
    delete_memory       - Remove a specific memory by ID
    get_graph_entities  - Traverse the Neo4j entity-relationship graph
    health_check        - Verify Neo4j + Qdrant connectivity

Configuration (environment variables with defaults):

    NEO4J_URL           - Bolt endpoint    (default: bolt://localhost:7687)
    NEO4J_USER          - Neo4j user       (default: neo4j)
    NEO4J_PASSWORD      - Neo4j password   (default: supergoose)
    QDRANT_HOST         - Qdrant hostname  (default: localhost)
    QDRANT_PORT         - Qdrant gRPC port (default: 6333)
    MEM0_API_URL        - REST API base    (default: http://localhost:8080)
    MEM0_STORE_PATH     - JSON fallback    (default: ~/.mem0/goose_memory.json)

Reference:
    Mem0 source: G:/goose/external/mem0
    Mem0 docs:   https://docs.mem0.ai
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Import ToolStatus from registry (with fallback)
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

from integrations.resource_coordinator import get_coordinator


# ---------------------------------------------------------------------------
# Graceful import of Mem0 SDK (AsyncMemory + sync Memory)
# ---------------------------------------------------------------------------

_MEM0_AVAILABLE = False
_MEM0_IMPORT_ERROR: Optional[str] = None

try:
    from mem0 import AsyncMemory, Memory

    _MEM0_AVAILABLE = True
except ImportError as exc:
    _MEM0_IMPORT_ERROR = (
        f"Mem0 SDK not installed or cannot be imported: {exc}. "
        "Install with: pip install -e G:/goose/external/mem0"
    )
    logger.info(_MEM0_IMPORT_ERROR)
    AsyncMemory = None  # type: ignore[assignment,misc]
    Memory = None  # type: ignore[assignment,misc]

# Optional: aiohttp for HTTP health checks and REST fallback
_AIOHTTP_AVAILABLE = False
try:
    import aiohttp

    _AIOHTTP_AVAILABLE = True
except ImportError:
    aiohttp = None  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEFAULT_CONFIG: Dict[str, Any] = {
    "graph_store": {
        "provider": "neo4j",
        "config": {
            "url": os.environ.get("NEO4J_URL", "bolt://localhost:7687"),
            "username": os.environ.get("NEO4J_USER", "neo4j"),
            "password": os.environ.get("NEO4J_PASSWORD", "supergoose"),
        },
    },
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "host": os.environ.get("QDRANT_HOST", "localhost"),
            "port": int(os.environ.get("QDRANT_PORT", "6333")),
        },
    },
}

# Vector-only config (fallback when Neo4j is unavailable)
VECTOR_ONLY_CONFIG: Dict[str, Any] = {
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "host": os.environ.get("QDRANT_HOST", "localhost"),
            "port": int(os.environ.get("QDRANT_PORT", "6333")),
        },
    },
}

# Mem0 REST API URL (fallback tier)
MEM0_API_URL = os.environ.get("MEM0_API_URL", "http://localhost:8080")

# JSON fallback path (last resort)
MEM0_STORE_PATH = Path(
    os.environ.get("MEM0_STORE_PATH", str(Path.home() / ".mem0" / "goose_memory.json"))
)

# Health check endpoints
NEO4J_HTTP_URL = os.environ.get("NEO4J_HTTP_URL", "http://localhost:7474")
QDRANT_HTTP_URL = (
    f"http://{os.environ.get('QDRANT_HOST', 'localhost')}"
    f":{os.environ.get('QDRANT_PORT', '6333')}"
)

# Timeouts
HTTP_TIMEOUT = 30  # seconds
HEALTH_CHECK_TIMEOUT = 10  # seconds


# ---------------------------------------------------------------------------
# Internal state
# ---------------------------------------------------------------------------

_initialized: bool = False
_init_lock = threading.Lock()
_backend: Optional[str] = None  # "async_sdk", "vector_only", "http", or "json"
_memory: Any = None  # AsyncMemory instance (async_sdk or vector_only)
_version: Optional[str] = None


# ---------------------------------------------------------------------------
# Backend: JSON file store (last-resort fallback)
# ---------------------------------------------------------------------------


class _JsonMemoryStore:
    """Minimal JSON-based memory store for environments without infrastructure.

    Stores memories as a flat list in a JSON file.  Provides basic substring
    search but no vector similarity or graph traversal.
    """

    def __init__(self, path: Path) -> None:
        self.path = path
        self._memories: List[Dict[str, Any]] = []
        self._load()

    def _load(self) -> None:
        if self.path.exists():
            try:
                data = json.loads(self.path.read_text(encoding="utf-8"))
                self._memories = data if isinstance(data, list) else []
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("Failed to load JSON memory store: %s", exc)
                self._memories = []
        else:
            self._memories = []

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(self._memories, indent=2, default=str),
            encoding="utf-8",
        )

    async def add(
        self,
        messages: Any,
        *,
        user_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        run_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        content = messages if isinstance(messages, str) else str(messages)
        memory_id = uuid.uuid4().hex
        entry = {
            "id": memory_id,
            "content": content,
            "user_id": user_id or "goose",
            "agent_id": agent_id,
            "run_id": run_id,
            "metadata": metadata or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        self._memories.append(entry)
        self._save()
        return {"results": [{"id": memory_id, "event": "ADD", "memory": content}]}

    async def search(
        self,
        query: str,
        *,
        user_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        run_id: Optional[str] = None,
        limit: int = 10,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        query_lower = query.lower()
        uid = user_id or "goose"
        matches = []
        for mem in self._memories:
            if mem.get("user_id") != uid:
                continue
            if agent_id and mem.get("agent_id") != agent_id:
                continue
            if run_id and mem.get("run_id") != run_id:
                continue
            content = mem.get("content", "")
            if query_lower in content.lower():
                matches.append({
                    "id": mem["id"],
                    "memory": content,
                    "score": 1.0,
                    "metadata": mem.get("metadata", {}),
                    "created_at": mem.get("created_at"),
                })
                if len(matches) >= limit:
                    break
        return {"results": matches}

    async def get_all(
        self,
        *,
        user_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        run_id: Optional[str] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        uid = user_id or "goose"
        results = []
        for mem in self._memories:
            if mem.get("user_id") != uid:
                continue
            if agent_id and mem.get("agent_id") != agent_id:
                continue
            if run_id and mem.get("run_id") != run_id:
                continue
            results.append({
                "id": mem["id"],
                "memory": mem.get("content", ""),
                "metadata": mem.get("metadata", {}),
                "created_at": mem.get("created_at"),
            })
        return {"results": results}

    async def delete(self, memory_id: str) -> Dict[str, Any]:
        before = len(self._memories)
        self._memories = [m for m in self._memories if m.get("id") != memory_id]
        removed = before - len(self._memories)
        if removed > 0:
            self._save()
        return {"success": removed > 0, "id": memory_id}

    async def delete_all(
        self,
        *,
        user_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        run_id: Optional[str] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        uid = user_id or "goose"
        before = len(self._memories)
        self._memories = [m for m in self._memories if m.get("user_id") != uid]
        removed = before - len(self._memories)
        if removed > 0:
            self._save()
        return {"success": True, "deleted_count": removed}

    async def delete_old(self, retention_days: int = 30) -> Dict[str, Any]:
        cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
        before = len(self._memories)
        kept = []
        for mem in self._memories:
            created = mem.get("created_at")
            if created:
                try:
                    dt = datetime.fromisoformat(created)
                    if dt >= cutoff:
                        kept.append(mem)
                        continue
                except (ValueError, TypeError):
                    pass
            kept.append(mem)  # Keep entries we cannot parse
        self._memories = kept
        removed = before - len(self._memories)
        if removed > 0:
            self._save()
        return {"success": True, "deleted_count": removed, "retention_days": retention_days}


# ---------------------------------------------------------------------------
# Lifecycle: init / status / capabilities
# ---------------------------------------------------------------------------


async def init(
    *,
    force_backend: Optional[str] = None,
) -> Dict[str, Any]:
    """Initialize the Mem0 bridge with AsyncMemory.

    Attempts backends in order: AsyncMemory (graph+vector) -> AsyncMemory
    (vector-only fallback) -> HTTP REST -> JSON file store.

    Args:
        force_backend: Force a specific backend. One of ``"async_sdk"``,
            ``"vector_only"``, ``"http"``, or ``"json"``.

    Returns:
        dict with ``success``, ``backend``, and diagnostic info.
    """
    global _initialized, _backend, _memory, _version

    with _init_lock:
        if _initialized:
            return {
                "success": True,
                "backend": _backend,
                "message": "Already initialized",
            }

        # --- Tier 1: AsyncMemory with full graph + vector ---
        if force_backend in (None, "async_sdk") and _MEM0_AVAILABLE:
            try:
                _memory = await AsyncMemory.from_config(DEFAULT_CONFIG)
                _backend = "async_sdk"
                _initialized = True
                _version = _get_mem0_version()
                logger.info(
                    "Mem0 bridge initialized with AsyncMemory (Neo4j + Qdrant)"
                )
                return {
                    "success": True,
                    "backend": "async_sdk",
                    "version": _version,
                    "message": (
                        "AsyncMemory initialized with Neo4j graph store "
                        "and Qdrant vector store"
                    ),
                }
            except Exception as exc:
                logger.warning(
                    "AsyncMemory full init failed: %s -- trying vector-only", exc
                )
                if force_backend == "async_sdk":
                    return {
                        "success": False,
                        "backend": "async_sdk",
                        "error": f"AsyncMemory init failed: {exc}",
                    }

        # --- Tier 2: AsyncMemory vector-only (no graph) ---
        if force_backend in (None, "vector_only") and _MEM0_AVAILABLE:
            try:
                _memory = await AsyncMemory.from_config(VECTOR_ONLY_CONFIG)
                _backend = "vector_only"
                _initialized = True
                _version = _get_mem0_version()
                logger.info(
                    "Mem0 bridge initialized with AsyncMemory (Qdrant only, no graph)"
                )
                return {
                    "success": True,
                    "backend": "vector_only",
                    "version": _version,
                    "message": (
                        "AsyncMemory initialized with Qdrant vector store only. "
                        "Graph operations unavailable. Start Neo4j for full functionality."
                    ),
                }
            except Exception as exc:
                logger.warning(
                    "AsyncMemory vector-only init failed: %s -- trying HTTP", exc
                )
                if force_backend == "vector_only":
                    return {
                        "success": False,
                        "backend": "vector_only",
                        "error": f"Vector-only init failed: {exc}",
                    }

        # --- Tier 3: HTTP REST API ---
        if force_backend in (None, "http") and _AIOHTTP_AVAILABLE:
            try:
                reachable = await _check_mem0_api_health()
                if reachable:
                    _backend = "http"
                    _initialized = True
                    logger.info(
                        "Mem0 bridge initialized with HTTP backend (%s)", MEM0_API_URL
                    )
                    return {
                        "success": True,
                        "backend": "http",
                        "api_url": MEM0_API_URL,
                        "message": f"Mem0 HTTP API at {MEM0_API_URL}",
                    }
                else:
                    logger.info("Mem0 API not reachable at %s", MEM0_API_URL)
                    if force_backend == "http":
                        return {
                            "success": False,
                            "backend": "http",
                            "error": f"Mem0 API not reachable at {MEM0_API_URL}",
                        }
            except Exception as exc:
                logger.warning("Mem0 HTTP check failed: %s", exc)
                if force_backend == "http":
                    return {
                        "success": False,
                        "backend": "http",
                        "error": f"HTTP check failed: {exc}",
                    }

        # --- Tier 4: JSON file store ---
        if force_backend in (None, "json"):
            try:
                _memory = _JsonMemoryStore(MEM0_STORE_PATH)
                _backend = "json"
                _initialized = True
                logger.info(
                    "Mem0 bridge initialized with JSON fallback at %s", MEM0_STORE_PATH
                )
                return {
                    "success": True,
                    "backend": "json",
                    "path": str(MEM0_STORE_PATH),
                    "message": (
                        f"Using JSON file store at {MEM0_STORE_PATH}. "
                        "No vector search or graph traversal available. "
                        "Start Neo4j + Qdrant for full functionality."
                    ),
                }
            except Exception as exc:
                return {
                    "success": False,
                    "backend": "json",
                    "error": f"JSON store init failed: {exc}",
                }

        return {
            "success": False,
            "error": "No backend could be initialized. Install mem0 or aiohttp.",
        }


def status() -> ToolStatus:
    """Return the current health status of the Mem0 integration."""
    if not _initialized:
        return ToolStatus(
            name="Mem0",
            available=False,
            healthy=False,
            error="Not initialized (call init() first)",
        )

    return ToolStatus(
        name="Mem0",
        available=True,
        healthy=True,
        error=None,
        version=_version,
    )


def capabilities() -> List[str]:
    """Return the list of operations this bridge supports."""
    return [
        "store_trajectory",
        "query_memory",
        "add_entity",
        "search",
        "get_trajectory",
        "delete_old",
        "store_memory",
        "search_memory",
        "get_all_memories",
        "delete_memory",
        "get_graph_entities",
        "health_check",
    ]


# ---------------------------------------------------------------------------
# Core operations
# ---------------------------------------------------------------------------


async def store_trajectory(
    run_id: str,
    trajectory_data: Dict[str, Any],
    agent_id: str = "goose",
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Store a run trajectory as a graph in Mem0.

    Trajectories capture the sequence of actions, tools used, and outcome
    for a given run.  When using the full graph backend, entities (tools,
    files, APIs) are automatically linked via Neo4j relationships.

    Args:
        run_id: Unique identifier for the run.
        trajectory_data: Trajectory payload containing ``actions``,
            ``outcome``, and any other structured data.
        agent_id: Agent identifier for scoping.
        metadata: Additional metadata attached to the trajectory.

    Returns:
        dict with ``success`` and stored trajectory info.
    """
    _ensure_ready()

    actions = trajectory_data.get("actions", [])
    outcome = trajectory_data.get("outcome", "unknown")
    tools_used = list({a.get("tool", "unknown") for a in actions})

    # Build a natural-language summary for embedding
    action_summaries = []
    for i, action in enumerate(actions, 1):
        tool = action.get("tool", "unknown")
        output_summary = str(action.get("output", ""))[:200]
        action_summaries.append(f"  Step {i}: {tool} -> {output_summary}")

    content = (
        f"Task trajectory [run_id={run_id}]\n"
        f"Outcome: {outcome}\n"
        f"Tools used: {', '.join(tools_used)}\n"
        f"Actions ({len(actions)} steps):\n"
        + "\n".join(action_summaries)
    )

    traj_metadata = {
        "type": "trajectory",
        "run_id": run_id,
        "outcome": outcome,
        "tools_used": ",".join(tools_used),
        "action_count": len(actions),
    }
    if metadata:
        traj_metadata.update(metadata)

    try:
        if _backend in ("async_sdk", "vector_only"):
            try:
                result = await _memory.add(
                    content,
                    user_id="goose",
                    agent_id=agent_id,
                    run_id=run_id,
                    metadata=traj_metadata,
                )
            except Exception as graph_err:
                logger.warning(
                    "Graph store_trajectory failed, falling back to vector: %s",
                    graph_err,
                )
                result = await _vector_only_add(
                    content,
                    user_id="goose",
                    agent_id=agent_id,
                    run_id=run_id,
                    metadata=traj_metadata,
                )
            return {
                "success": True,
                "backend": _backend,
                "run_id": run_id,
                "action_count": len(actions),
                **_normalize_result(result),
            }

        elif _backend == "http":
            payload = {
                "messages": [{"role": "user", "content": content}],
                "user_id": "goose",
                "agent_id": agent_id,
                "run_id": run_id,
                "metadata": traj_metadata,
            }
            result = await _http_post("/v1/memories/", payload)
            return {
                "success": True,
                "backend": "http",
                "run_id": run_id,
                "action_count": len(actions),
                **result,
            }

        elif _backend == "json":
            result = await _memory.add(
                content,
                user_id="goose",
                agent_id=agent_id,
                run_id=run_id,
                metadata=traj_metadata,
            )
            return {
                "success": True,
                "backend": "json",
                "run_id": run_id,
                "action_count": len(actions),
                **result,
            }

        else:
            return {"success": False, "error": f"Unknown backend: {_backend}"}

    except Exception as exc:
        logger.error("store_trajectory failed: %s", exc)
        return {"success": False, "error": str(exc)}


async def query_memory(
    query: str,
    agent_id: str = "goose",
    top_k: int = 10,
    filters: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Search both vector and graph stores.

    Performs a hybrid search: vector similarity from Qdrant combined with
    graph traversal from Neo4j (when available).

    Args:
        query: Natural-language search query.
        agent_id: Agent scope for the search.
        top_k: Maximum number of results.
        filters: Additional metadata filters to apply.

    Returns:
        dict with ``success`` and ``results`` list.
    """
    _ensure_ready()

    try:
        if _backend in ("async_sdk", "vector_only"):
            try:
                result = await _memory.search(
                    query,
                    user_id="goose",
                    agent_id=agent_id,
                    limit=top_k,
                    filters=filters,
                )
            except Exception as graph_err:
                logger.warning(
                    "Graph search failed, falling back to vector: %s", graph_err
                )
                result = await _vector_only_search(
                    query,
                    user_id="goose",
                    agent_id=agent_id,
                    limit=top_k,
                )
            return {
                "success": True,
                "backend": _backend,
                "query": query,
                **_normalize_result(result),
            }

        elif _backend == "http":
            payload = {
                "query": query,
                "user_id": "goose",
                "agent_id": agent_id,
                "limit": top_k,
            }
            result = await _http_post("/v1/memories/search/", payload)
            return {"success": True, "backend": "http", "query": query, **result}

        elif _backend == "json":
            result = await _memory.search(
                query,
                user_id="goose",
                agent_id=agent_id,
                limit=top_k,
            )
            return {"success": True, "backend": "json", "query": query, **result}

        else:
            return {"success": False, "error": f"Unknown backend: {_backend}"}

    except Exception as exc:
        logger.error("query_memory failed: %s", exc)
        return {"success": False, "error": str(exc)}


async def add_entity(
    content: str,
    user_id: str = "goose",
    agent_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Add a memory entry (entity) with agent/run scoping.

    Persists a fact, observation, preference, or any natural-language
    content.  When using the graph backend, Mem0 automatically extracts
    entities and relationships for Neo4j.

    Args:
        content: The memory content (natural language text).
        user_id: Scope identifier for the memory owner.
        agent_id: Optional agent identifier for scoping.
        metadata: Optional key-value metadata.

    Returns:
        dict with ``success`` and memory operation results.
    """
    _ensure_ready()

    try:
        if _backend in ("async_sdk", "vector_only"):
            try:
                result = await _memory.add(
                    content,
                    user_id=user_id,
                    agent_id=agent_id,
                    metadata=metadata,
                )
            except Exception as graph_err:
                logger.warning(
                    "Graph add failed, falling back to vector: %s", graph_err
                )
                result = await _vector_only_add(
                    content,
                    user_id=user_id,
                    agent_id=agent_id,
                    metadata=metadata,
                )
            return {"success": True, "backend": _backend, **_normalize_result(result)}

        elif _backend == "http":
            payload = {
                "messages": [{"role": "user", "content": content}],
                "user_id": user_id,
                "agent_id": agent_id,
                "metadata": metadata or {},
            }
            result = await _http_post("/v1/memories/", payload)
            return {"success": True, "backend": "http", **result}

        elif _backend == "json":
            result = await _memory.add(
                content,
                user_id=user_id,
                agent_id=agent_id,
                metadata=metadata,
            )
            return {"success": True, "backend": "json", **result}

        else:
            return {"success": False, "error": f"Unknown backend: {_backend}"}

    except Exception as exc:
        logger.error("add_entity failed: %s", exc)
        return {"success": False, "error": str(exc)}


async def search(
    query: str,
    user_id: str = "goose",
    agent_id: Optional[str] = None,
    top_k: int = 10,
) -> Dict[str, Any]:
    """Hybrid vector + graph search.

    Combines Qdrant vector similarity with Neo4j graph traversal
    for comprehensive memory retrieval.

    Args:
        query: Natural-language search query.
        user_id: User scope for the search.
        agent_id: Optional agent scope.
        top_k: Maximum number of results.

    Returns:
        dict with ``success`` and ``results`` list.
    """
    _ensure_ready()

    try:
        if _backend in ("async_sdk", "vector_only"):
            try:
                result = await _memory.search(
                    query,
                    user_id=user_id,
                    agent_id=agent_id,
                    limit=top_k,
                )
            except Exception as graph_err:
                logger.warning(
                    "Graph search failed, falling back to vector: %s", graph_err
                )
                result = await _vector_only_search(
                    query,
                    user_id=user_id,
                    agent_id=agent_id,
                    limit=top_k,
                )
            return {
                "success": True,
                "backend": _backend,
                "query": query,
                **_normalize_result(result),
            }

        elif _backend == "http":
            payload = {
                "query": query,
                "user_id": user_id,
                "agent_id": agent_id,
                "limit": top_k,
            }
            result = await _http_post("/v1/memories/search/", payload)
            return {"success": True, "backend": "http", "query": query, **result}

        elif _backend == "json":
            result = await _memory.search(
                query,
                user_id=user_id,
                agent_id=agent_id,
                limit=top_k,
            )
            return {"success": True, "backend": "json", "query": query, **result}

        else:
            return {"success": False, "error": f"Unknown backend: {_backend}"}

    except Exception as exc:
        logger.error("search failed: %s", exc)
        return {"success": False, "error": str(exc)}


async def get_trajectory(
    run_id: str,
) -> Dict[str, Any]:
    """Retrieve a stored trajectory by run_id.

    Searches for trajectory-type memories scoped to the given run_id.

    Args:
        run_id: The run identifier used when the trajectory was stored.

    Returns:
        dict with ``success`` and trajectory data.
    """
    _ensure_ready()

    try:
        if _backend in ("async_sdk", "vector_only"):
            try:
                result = await _memory.get_all(
                    user_id="goose",
                    run_id=run_id,
                )
            except Exception as graph_err:
                logger.warning(
                    "Graph get_trajectory failed: %s", graph_err
                )
                result = {"results": []}

            normalized = _normalize_result(result)
            # Filter to trajectory-type entries
            trajectories = _filter_trajectories(
                normalized.get("results", [])
            )
            return {
                "success": True,
                "backend": _backend,
                "run_id": run_id,
                "trajectories": trajectories,
                "count": len(trajectories),
            }

        elif _backend == "http":
            result = await _http_get(
                f"/v1/memories/?user_id=goose&run_id={run_id}"
            )
            trajectories = _filter_trajectories(result.get("results", []))
            return {
                "success": True,
                "backend": "http",
                "run_id": run_id,
                "trajectories": trajectories,
                "count": len(trajectories),
            }

        elif _backend == "json":
            result = await _memory.get_all(
                user_id="goose",
                run_id=run_id,
            )
            trajectories = _filter_trajectories(result.get("results", []))
            return {
                "success": True,
                "backend": "json",
                "run_id": run_id,
                "trajectories": trajectories,
                "count": len(trajectories),
            }

        else:
            return {"success": False, "error": f"Unknown backend: {_backend}"}

    except Exception as exc:
        logger.error("get_trajectory failed: %s", exc)
        return {"success": False, "error": str(exc)}


async def delete_old(
    retention_days: int = 30,
) -> Dict[str, Any]:
    """Prune memories older than the specified retention period.

    Args:
        retention_days: Number of days to retain. Memories older than
            this are deleted.

    Returns:
        dict with ``success`` and deletion count.
    """
    _ensure_ready()

    try:
        if _backend in ("async_sdk", "vector_only"):
            # Get all memories, filter by date, delete old ones
            result = await _memory.get_all(user_id="goose")
            normalized = _normalize_result(result)
            all_memories = normalized.get("results", [])

            cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
            deleted_count = 0

            for mem in all_memories:
                created = mem.get("created_at")
                if not created:
                    continue
                try:
                    if isinstance(created, str):
                        dt = datetime.fromisoformat(created)
                    elif isinstance(created, datetime):
                        dt = created
                    else:
                        continue

                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)

                    if dt < cutoff:
                        mem_id = mem.get("id")
                        if mem_id:
                            await _memory.delete(mem_id)
                            deleted_count += 1
                except (ValueError, TypeError) as parse_err:
                    logger.debug(
                        "Skipping memory with unparseable date: %s", parse_err
                    )

            return {
                "success": True,
                "backend": _backend,
                "deleted_count": deleted_count,
                "retention_days": retention_days,
            }

        elif _backend == "json":
            result = await _memory.delete_old(retention_days=retention_days)
            return {"success": True, "backend": "json", **result}

        elif _backend == "http":
            # HTTP backend: no bulk delete, return unsupported
            return {
                "success": False,
                "backend": "http",
                "error": (
                    "delete_old is not supported via the HTTP REST API. "
                    "Use the SDK backend for pruning."
                ),
            }

        else:
            return {"success": False, "error": f"Unknown backend: {_backend}"}

    except Exception as exc:
        logger.error("delete_old failed: %s", exc)
        return {"success": False, "error": str(exc)}


async def store_memory(
    content: str,
    user_id: str = "goose",
    metadata: Optional[Dict[str, Any]] = None,
    *,
    infer: bool = True,
) -> Dict[str, Any]:
    """Store a memory via Mem0.

    Persists a fact, observation, user preference, or any natural-language
    content.

    Args:
        content: The memory content (natural language text).
        user_id: Scope identifier for the memory owner.
        metadata: Optional key-value metadata attached to the memory.
        infer: If True, Mem0 uses an LLM to extract and deduplicate facts.

    Returns:
        dict with ``success`` and memory operation results.
    """
    _ensure_ready()

    try:
        if _backend in ("async_sdk", "vector_only"):
            try:
                result = await _memory.add(
                    content,
                    user_id=user_id,
                    metadata=metadata,
                    infer=infer,
                )
            except Exception as graph_err:
                logger.warning(
                    "Graph store_memory failed, falling back to vector: %s",
                    graph_err,
                )
                result = await _vector_only_add(
                    content,
                    user_id=user_id,
                    metadata=metadata,
                )
            return {"success": True, "backend": _backend, **_normalize_result(result)}

        elif _backend == "http":
            payload = {
                "messages": [{"role": "user", "content": content}],
                "user_id": user_id,
                "metadata": metadata or {},
                "infer": infer,
            }
            result = await _http_post("/v1/memories/", payload)
            return {"success": True, "backend": "http", **result}

        elif _backend == "json":
            result = await _memory.add(
                content,
                user_id=user_id,
                metadata=metadata,
            )
            return {"success": True, "backend": "json", **result}

        else:
            return {"success": False, "error": f"Unknown backend: {_backend}"}

    except Exception as exc:
        logger.error("store_memory failed: %s", exc)
        return {"success": False, "error": str(exc)}


async def search_memory(
    query: str,
    user_id: str = "goose",
    limit: int = 10,
) -> Dict[str, Any]:
    """Search memories via semantic similarity.

    Args:
        query: Natural-language search query.
        user_id: Scope to search within.
        limit: Maximum number of results.

    Returns:
        dict with ``success`` and ``results`` list.
    """
    _ensure_ready()

    try:
        if _backend in ("async_sdk", "vector_only"):
            try:
                result = await _memory.search(
                    query,
                    user_id=user_id,
                    limit=limit,
                )
            except Exception as graph_err:
                logger.warning(
                    "Graph search_memory failed, falling back to vector: %s",
                    graph_err,
                )
                result = await _vector_only_search(
                    query,
                    user_id=user_id,
                    limit=limit,
                )
            return {"success": True, "backend": _backend, **_normalize_result(result)}

        elif _backend == "http":
            payload = {"query": query, "user_id": user_id, "limit": limit}
            result = await _http_post("/v1/memories/search/", payload)
            return {"success": True, "backend": "http", **result}

        elif _backend == "json":
            result = await _memory.search(
                query,
                user_id=user_id,
                limit=limit,
            )
            return {"success": True, "backend": "json", **result}

        else:
            return {"success": False, "error": f"Unknown backend: {_backend}"}

    except Exception as exc:
        logger.error("search_memory failed: %s", exc)
        return {"success": False, "error": str(exc)}


async def get_all_memories(
    user_id: str = "goose",
) -> Dict[str, Any]:
    """List all memories for a given user scope.

    Args:
        user_id: The user/agent scope to list memories for.

    Returns:
        dict with ``success`` and ``results`` list.
    """
    _ensure_ready()

    try:
        if _backend in ("async_sdk", "vector_only"):
            result = await _memory.get_all(user_id=user_id)
            return {"success": True, "backend": _backend, **_normalize_result(result)}

        elif _backend == "http":
            result = await _http_get(f"/v1/memories/?user_id={user_id}")
            return {"success": True, "backend": "http", **result}

        elif _backend == "json":
            result = await _memory.get_all(user_id=user_id)
            return {"success": True, "backend": "json", **result}

        else:
            return {"success": False, "error": f"Unknown backend: {_backend}"}

    except Exception as exc:
        logger.error("get_all_memories failed: %s", exc)
        return {"success": False, "error": str(exc)}


async def delete_memory(
    memory_id: str,
) -> Dict[str, Any]:
    """Delete a specific memory by ID.

    Args:
        memory_id: The unique identifier of the memory to delete.

    Returns:
        dict with ``success`` and deletion confirmation.
    """
    _ensure_ready()

    try:
        if _backend in ("async_sdk", "vector_only"):
            await _memory.delete(memory_id)
            return {"success": True, "backend": _backend, "deleted_id": memory_id}

        elif _backend == "http":
            result = await _http_delete(f"/v1/memories/{memory_id}/")
            return {
                "success": True,
                "backend": "http",
                "deleted_id": memory_id,
                **result,
            }

        elif _backend == "json":
            result = await _memory.delete(memory_id)
            return {
                "success": result.get("success", False),
                "backend": "json",
                **result,
            }

        else:
            return {"success": False, "error": f"Unknown backend: {_backend}"}

    except Exception as exc:
        logger.error("delete_memory failed: %s", exc)
        return {"success": False, "error": str(exc)}


async def get_graph_entities(
    user_id: str = "goose",
) -> Dict[str, Any]:
    """Get entity-relationship graph from Neo4j.

    Only available when using the async_sdk backend with graph store
    enabled.

    Args:
        user_id: Scope to query graph entities for.

    Returns:
        dict with ``success``, ``entities``, and ``relations``.
    """
    _ensure_ready()

    if _backend == "async_sdk":
        try:
            if not getattr(_memory, "enable_graph", False):
                return {
                    "success": False,
                    "error": (
                        "Graph store is not enabled. Start Neo4j and "
                        "reinitialize with graph_store configuration."
                    ),
                }

            graph = getattr(_memory, "graph", None)
            if graph is None:
                return {
                    "success": False,
                    "error": "Graph store object not available on memory instance.",
                }

            entities: List[Dict[str, Any]] = []
            relations: List[Dict[str, Any]] = []

            if hasattr(graph, "get_all"):
                graph_data = graph.get_all(user_id=user_id)
                if isinstance(graph_data, dict):
                    entities = graph_data.get("entities", [])
                    relations = graph_data.get("relations", [])
                elif isinstance(graph_data, list):
                    for item in graph_data:
                        if "source" in item and "target" in item:
                            relations.append(item)
                        else:
                            entities.append(item)

            return {
                "success": True,
                "backend": "async_sdk",
                "user_id": user_id,
                "entities": entities,
                "relations": relations,
                "entity_count": len(entities),
                "relation_count": len(relations),
            }

        except Exception as exc:
            logger.error("get_graph_entities failed: %s", exc)
            return {"success": False, "error": str(exc)}

    elif _backend == "http":
        try:
            result = await _http_get(f"/v1/entities/?user_id={user_id}")
            return {"success": True, "backend": "http", **result}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    else:
        return {
            "success": False,
            "backend": _backend,
            "error": (
                "Graph entities require the async_sdk backend with Neo4j. "
                f"Current backend: {_backend}"
            ),
        }


async def health_check() -> Dict[str, Any]:
    """Check connectivity to Neo4j and Qdrant.

    Pings both Neo4j HTTP interface and Qdrant REST API to verify
    infrastructure health.

    Returns:
        dict with ``success``, ``neo4j``, ``qdrant``, and ``backend`` status.
    """
    result: Dict[str, Any] = {
        "success": False,
        "backend": _backend or "none",
        "initialized": _initialized,
        "neo4j": {"healthy": False, "error": None},
        "qdrant": {"healthy": False, "error": None},
        "mem0_api": {"healthy": False, "error": None},
    }

    # Check Neo4j via HTTP
    if _AIOHTTP_AVAILABLE:
        try:
            timeout = aiohttp.ClientTimeout(total=HEALTH_CHECK_TIMEOUT)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(NEO4J_HTTP_URL) as resp:
                    neo4j_ok = resp.status == 200
                    result["neo4j"] = {
                        "healthy": neo4j_ok,
                        "url": NEO4J_HTTP_URL,
                        "status_code": resp.status,
                    }
        except Exception as exc:
            result["neo4j"] = {
                "healthy": False,
                "error": str(exc),
                "url": NEO4J_HTTP_URL,
            }
    else:
        # Fallback: TCP socket check
        try:
            import socket

            bolt_url = DEFAULT_CONFIG["graph_store"]["config"]["url"]
            host = bolt_url.replace("bolt://", "").replace("neo4j://", "").split(":")[0]
            port_str = bolt_url.split("//")[-1]
            port = int(port_str.split(":")[-1]) if ":" in port_str else 7687
            sock = socket.create_connection((host, port), timeout=HEALTH_CHECK_TIMEOUT)
            sock.close()
            result["neo4j"] = {"healthy": True, "url": bolt_url}
        except Exception as exc:
            result["neo4j"] = {"healthy": False, "error": str(exc)}

    # Check Qdrant via HTTP
    if _AIOHTTP_AVAILABLE:
        try:
            timeout = aiohttp.ClientTimeout(total=HEALTH_CHECK_TIMEOUT)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                collections_url = f"{QDRANT_HTTP_URL}/collections"
                async with session.get(collections_url) as resp:
                    qdrant_ok = resp.status == 200
                    result["qdrant"] = {
                        "healthy": qdrant_ok,
                        "url": collections_url,
                        "status_code": resp.status,
                    }
        except Exception as exc:
            result["qdrant"] = {
                "healthy": False,
                "error": str(exc),
                "url": QDRANT_HTTP_URL,
            }
    else:
        # Fallback: TCP socket check
        try:
            import socket

            qdrant_host = DEFAULT_CONFIG["vector_store"]["config"]["host"]
            qdrant_port = DEFAULT_CONFIG["vector_store"]["config"]["port"]
            sock = socket.create_connection(
                (qdrant_host, qdrant_port), timeout=HEALTH_CHECK_TIMEOUT
            )
            sock.close()
            result["qdrant"] = {
                "healthy": True,
                "host": qdrant_host,
                "port": qdrant_port,
            }
        except Exception as exc:
            result["qdrant"] = {"healthy": False, "error": str(exc)}

    # Check Mem0 API (if applicable)
    if _AIOHTTP_AVAILABLE:
        try:
            reachable = await _check_mem0_api_health()
            result["mem0_api"] = {"healthy": reachable, "url": MEM0_API_URL}
        except Exception as exc:
            result["mem0_api"] = {
                "healthy": False,
                "error": str(exc),
                "url": MEM0_API_URL,
            }

    # Overall success based on active backend
    if _backend == "async_sdk":
        result["success"] = (
            result["neo4j"]["healthy"] or result["qdrant"]["healthy"]
        )
    elif _backend == "vector_only":
        result["success"] = result["qdrant"]["healthy"]
    elif _backend == "http":
        result["success"] = result["mem0_api"]["healthy"]
    elif _backend == "json":
        result["success"] = True  # JSON is always healthy
    else:
        result["success"] = False

    return result


# ---------------------------------------------------------------------------
# Unified execute dispatch (called by ToolRegistry)
# ---------------------------------------------------------------------------


async def execute(operation: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Route a named operation to the appropriate bridge function.

    This is the entry-point used by ``ToolRegistry.execute()`` when it
    dispatches to this module.

    Args:
        operation: One of the operation names returned by ``capabilities()``.
        params: Keyword arguments forwarded to the operation function.

    Returns:
        dict with ``success`` and operation-specific payload.
    """
    import inspect

    ops: Dict[str, Callable[..., Any]] = {
        "store_trajectory": store_trajectory,
        "query_memory": query_memory,
        "add_entity": add_entity,
        "search": search,
        "get_trajectory": get_trajectory,
        "delete_old": delete_old,
        "store_memory": store_memory,
        "search_memory": search_memory,
        "get_all_memories": get_all_memories,
        "delete_memory": delete_memory,
        "get_graph_entities": get_graph_entities,
        "health_check": health_check,
        "init": init,
        "status": lambda **_: status(),
        "capabilities": lambda **_: capabilities(),
    }

    fn = ops.get(operation)
    if fn is None:
        return {
            "success": False,
            "error": (
                f"Unknown operation '{operation}'. "
                f"Available: {', '.join(sorted(ops.keys()))}"
            ),
        }

    async def _do_operation():
        result = fn(**params)
        if inspect.isawaitable(result):
            result = await result

        if not isinstance(result, dict):
            return {"success": True, "result": result}
        return result

    coordinator = get_coordinator()
    try:
        async with coordinator.acquire("mem0", "memory"):
            return await _do_operation()
    except Exception as coord_err:
        logger.warning(
            "ResourceCoordinator unavailable, running without coordination: %s",
            coord_err,
        )
        try:
            return await _do_operation()
        except TypeError as exc:
            return {
                "success": False,
                "error": f"Invalid parameters for '{operation}': {exc}",
            }
        except Exception as exc:
            logger.error("execute(%s) failed: %s", operation, exc)
            return {"success": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _ensure_ready() -> None:
    """Raise if the bridge has not been initialized."""
    if not _initialized:
        raise RuntimeError(
            "Mem0 bridge not initialized. Call 'await init()' first."
        )


def _get_mem0_version() -> Optional[str]:
    """Attempt to read the installed Mem0 version."""
    try:
        import importlib.metadata

        return importlib.metadata.version("mem0ai")
    except Exception:
        pass
    try:
        import mem0

        return getattr(mem0, "__version__", None)
    except Exception:
        return None


def _normalize_result(result: Any) -> Dict[str, Any]:
    """Normalize Mem0 SDK results into a consistent dict format."""
    if isinstance(result, dict):
        return result
    if isinstance(result, list):
        return {"results": result}
    return {"results": [], "raw": str(result)}


def _filter_trajectories(
    results: List[Dict[str, Any]],
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """Filter search results to trajectory-type memories only."""
    trajectories = []
    for item in results:
        metadata = item.get("metadata", {})
        content = item.get("memory", "") or item.get("content", "")

        is_trajectory = (
            metadata.get("type") == "trajectory"
            or "Task trajectory" in content
        )

        if is_trajectory:
            trajectories.append(item)
            if len(trajectories) >= limit:
                break

    return trajectories


async def _vector_only_add(
    content: str,
    *,
    user_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    run_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Fallback: reinitialize with vector-only config and add.

    Used when the graph backend is down but Qdrant is still available.
    """
    global _memory, _backend

    if _MEM0_AVAILABLE and _backend == "async_sdk":
        try:
            _memory = await AsyncMemory.from_config(VECTOR_ONLY_CONFIG)
            _backend = "vector_only"
            logger.info("Fell back to vector-only AsyncMemory after graph failure")
        except Exception as reinit_err:
            logger.error("Vector-only reinit also failed: %s", reinit_err)
            return {"results": [], "error": str(reinit_err)}

    return await _memory.add(
        content,
        user_id=user_id,
        agent_id=agent_id,
        run_id=run_id,
        metadata=metadata,
    )


async def _vector_only_search(
    query: str,
    *,
    user_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    limit: int = 10,
) -> Dict[str, Any]:
    """Fallback: reinitialize with vector-only config and search."""
    global _memory, _backend

    if _MEM0_AVAILABLE and _backend == "async_sdk":
        try:
            _memory = await AsyncMemory.from_config(VECTOR_ONLY_CONFIG)
            _backend = "vector_only"
            logger.info("Fell back to vector-only AsyncMemory after graph failure")
        except Exception as reinit_err:
            logger.error("Vector-only reinit also failed: %s", reinit_err)
            return {"results": [], "error": str(reinit_err)}

    return await _memory.search(
        query,
        user_id=user_id,
        agent_id=agent_id,
        limit=limit,
    )


def _tool_status_to_dict(ts: ToolStatus) -> Dict[str, Any]:
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
# HTTP client helpers (fallback tier)
# ---------------------------------------------------------------------------


async def _check_mem0_api_health() -> bool:
    """Check if the Mem0 REST API is reachable."""
    if not _AIOHTTP_AVAILABLE:
        return False

    try:
        timeout = aiohttp.ClientTimeout(total=HEALTH_CHECK_TIMEOUT)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            for endpoint in ["/health", "/v1/health", "/api/health", "/"]:
                try:
                    async with session.get(f"{MEM0_API_URL}{endpoint}") as resp:
                        if resp.status < 500:
                            return True
                except aiohttp.ClientError:
                    continue
    except Exception:
        pass

    return False


async def _http_post(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Send a POST request to the Mem0 REST API."""
    if not _AIOHTTP_AVAILABLE:
        raise RuntimeError("aiohttp is required for HTTP backend")

    url = f"{MEM0_API_URL}{path}"
    timeout = aiohttp.ClientTimeout(total=HTTP_TIMEOUT)

    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(url, json=payload) as resp:
            if resp.status >= 400:
                body = await resp.text()
                raise RuntimeError(
                    f"Mem0 API error {resp.status} at {path}: {body[:500]}"
                )
            return await resp.json()


async def _http_get(path: str) -> Dict[str, Any]:
    """Send a GET request to the Mem0 REST API."""
    if not _AIOHTTP_AVAILABLE:
        raise RuntimeError("aiohttp is required for HTTP backend")

    url = f"{MEM0_API_URL}{path}"
    timeout = aiohttp.ClientTimeout(total=HTTP_TIMEOUT)

    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(url) as resp:
            if resp.status >= 400:
                body = await resp.text()
                raise RuntimeError(
                    f"Mem0 API error {resp.status} at {path}: {body[:500]}"
                )
            return await resp.json()


async def _http_delete(path: str) -> Dict[str, Any]:
    """Send a DELETE request to the Mem0 REST API."""
    if not _AIOHTTP_AVAILABLE:
        raise RuntimeError("aiohttp is required for HTTP backend")

    url = f"{MEM0_API_URL}{path}"
    timeout = aiohttp.ClientTimeout(total=HTTP_TIMEOUT)

    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.delete(url) as resp:
            if resp.status >= 400:
                body = await resp.text()
                raise RuntimeError(
                    f"Mem0 API error {resp.status} at {path}: {body[:500]}"
                )
            try:
                return await resp.json()
            except Exception:
                return {}


# ---------------------------------------------------------------------------
# Main entry point (--selftest support)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser(
        description="Mem0 Graph Memory Bridge for Super-Goose"
    )
    parser.add_argument(
        "--selftest",
        action="store_true",
        help="Run a self-test: init, store, search, trajectory, delete",
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Alias for --selftest",
    )
    parser.add_argument(
        "--backend",
        choices=["async_sdk", "vector_only", "http", "json"],
        default=None,
        help="Force a specific backend (default: auto-detect)",
    )
    parser.add_argument(
        "--health",
        action="store_true",
        help="Run health check and print results",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Show bridge status",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    async def _run_health() -> None:
        await init(force_backend=args.backend)
        result = await health_check()
        print(json.dumps(result, indent=2, default=str))
        sys.exit(0 if result["success"] else 1)

    async def _run_selftest() -> None:
        print("=" * 60)
        print("Mem0 Graph Memory Bridge -- Self-Test")
        print("=" * 60)

        # 1. Initialize
        print("\n--- Initializing ---")
        init_result = await init(force_backend=args.backend)
        print(json.dumps(init_result, indent=2, default=str))

        if not init_result.get("success"):
            print("FAIL: Initialization failed")
            sys.exit(1)

        # 2. Add entity
        print("\n--- Adding entity ---")
        add_result = await add_entity(
            "Super-Goose uses Neo4j for graph memory and Qdrant for vectors.",
            user_id="goose-test",
            agent_id="selftest",
            metadata={"source": "selftest", "category": "architecture"},
        )
        print(json.dumps(add_result, indent=2, default=str))

        # 3. Store memory
        print("\n--- Storing memory ---")
        store_result = await store_memory(
            "The Conscious bridge layer orchestrates all tool integrations.",
            user_id="goose-test",
            metadata={"source": "selftest"},
        )
        print(json.dumps(store_result, indent=2, default=str))

        # 4. Store trajectory
        print("\n--- Storing trajectory ---")
        traj_result = await store_trajectory(
            run_id="selftest-run-001",
            trajectory_data={
                "actions": [
                    {"tool": "aider", "input": {"file": "test.py"}, "output": "edited"},
                    {"tool": "pytest", "input": {"args": ["-x"]}, "output": "3 passed"},
                ],
                "outcome": "tests passing",
            },
            agent_id="selftest",
            metadata={"repo": "super-goose"},
        )
        print(json.dumps(traj_result, indent=2, default=str))

        # 5. Search
        print("\n--- Searching (hybrid) ---")
        search_result = await search(
            "graph memory architecture",
            user_id="goose-test",
            agent_id="selftest",
            top_k=5,
        )
        print(json.dumps(search_result, indent=2, default=str))

        # 6. Query memory
        print("\n--- Querying memory ---")
        query_result = await query_memory(
            "tool integrations",
            agent_id="selftest",
            top_k=5,
        )
        print(json.dumps(query_result, indent=2, default=str))

        # 7. Get trajectory
        print("\n--- Getting trajectory ---")
        get_traj = await get_trajectory("selftest-run-001")
        print(json.dumps(get_traj, indent=2, default=str))

        # 8. Get all memories
        print("\n--- Listing all memories ---")
        all_result = await get_all_memories(user_id="goose-test")
        print(json.dumps(all_result, indent=2, default=str))

        # 9. Graph entities (may only work with async_sdk)
        print("\n--- Getting graph entities ---")
        graph_result = await get_graph_entities(user_id="goose-test")
        print(json.dumps(graph_result, indent=2, default=str))

        # 10. Health check
        print("\n--- Health check ---")
        health_result = await health_check()
        print(json.dumps(health_result, indent=2, default=str))

        # 11. Status
        print("\n--- Bridge status ---")
        s = status()
        print(f"  Name:      {s.name}")
        print(f"  Available: {s.available}")
        print(f"  Healthy:   {s.healthy}")
        print(f"  Version:   {s.version}")
        print(f"  Error:     {s.error}")

        # 12. Clean up test memories
        print("\n--- Cleaning up ---")
        all_mems = await get_all_memories(user_id="goose-test")
        for mem in all_mems.get("results", []):
            mid = mem.get("id")
            if mid:
                del_result = await delete_memory(mid)
                print(f"  Deleted {mid}: {del_result.get('success')}")

        print("\n" + "=" * 60)
        print("Self-test complete.")
        print("=" * 60)

    if args.health:
        asyncio.run(_run_health())
    elif args.selftest or args.test:
        asyncio.run(_run_selftest())
    elif args.status:
        asyncio.run(init(force_backend=args.backend))
        s = status()
        print(f"Mem0 Bridge: {s.name}")
        print(f"  Available: {s.available}")
        print(f"  Healthy:   {s.healthy}")
        print(f"  Backend:   {_backend}")
        print(f"  Version:   {s.version}")
        if s.error:
            print(f"  Error:     {s.error}")
    else:
        parser.print_help()
