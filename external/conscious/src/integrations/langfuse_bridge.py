"""
Langfuse Bridge - Observability and tracing for Super-Goose via Langfuse.

Wraps the Langfuse SDK (``langfuse`` Python package) to provide async trace
and span management, LLM generation tracking, tool-call logging, and
aggregate metrics retrieval for Goose agents through the Conscious bridge
layer.

Langfuse is an open-source LLM engineering platform that provides tracing,
evaluations, prompt management, and metrics.  This bridge exposes:

    start_trace       - Begin a new observability trace
    end_trace         - Close a trace with final status
    add_span          - Attach a span (sub-operation) to a trace
    add_generation    - Record an LLM generation event (tokens, cost, latency)
    log_tool_call     - Record a tool/function invocation within a trace
    get_trace         - Retrieve trace details by ID
    list_traces       - List recent traces with optional filters
    get_metrics       - Aggregate metrics (tokens, cost, latency) over time
    health_check      - Verify Langfuse server is reachable

The bridge attempts to use the ``langfuse`` Python SDK for native
integration.  When the SDK is unavailable, it falls back to the Langfuse
REST API via ``aiohttp``.

Configuration is read from environment variables:
    LANGFUSE_HOST           - Langfuse server URL (default: http://localhost:3000)
    LANGFUSE_PUBLIC_KEY     - Public API key
    LANGFUSE_SECRET_KEY     - Secret API key

Reference:
    Langfuse docs:    https://langfuse.com/docs
    Langfuse GitHub:  https://github.com/langfuse/langfuse
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
from datetime import datetime, timezone
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

DEFAULT_HOST = os.environ.get("LANGFUSE_HOST", "http://localhost:3000")
PUBLIC_KEY = os.environ.get("LANGFUSE_PUBLIC_KEY", "")
SECRET_KEY = os.environ.get("LANGFUSE_SECRET_KEY", "")

# Timeouts (seconds)
API_TIMEOUT = 30
HEALTH_TIMEOUT = 10

# ---------------------------------------------------------------------------
# Graceful import of langfuse SDK
# ---------------------------------------------------------------------------

_SDK_AVAILABLE = False
_IMPORT_ERROR: Optional[str] = None
_langfuse_mod = None

try:
    import langfuse as _langfuse_mod
    from langfuse import Langfuse

    _SDK_AVAILABLE = True
except ImportError as exc:
    _IMPORT_ERROR = (
        f"Langfuse SDK is not installed: {exc}. "
        "Install with: pip install langfuse"
    )
    logger.warning(_IMPORT_ERROR)
    Langfuse = None  # type: ignore[assignment,misc]

# Graceful import of aiohttp for REST fallback
_AIOHTTP_AVAILABLE = False
try:
    import aiohttp

    _AIOHTTP_AVAILABLE = True
except ImportError:
    aiohttp = None  # type: ignore[assignment]

# ---------------------------------------------------------------------------
# Internal state
# ---------------------------------------------------------------------------

_initialized: bool = False
_init_lock = threading.Lock()
_client: Any = None  # Langfuse SDK client instance


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class TraceRecord:
    """Internal record of a trace with its spans and generations."""

    trace_id: str
    name: str
    status: str = "active"
    metadata: dict[str, Any] = field(default_factory=dict)
    started_at: str = ""
    ended_at: Optional[str] = None
    spans: list[dict[str, Any]] = field(default_factory=list)
    generations: list[dict[str, Any]] = field(default_factory=list)
    tool_calls: list[dict[str, Any]] = field(default_factory=list)


# Local trace store for fallback mode
_trace_store: dict[str, TraceRecord] = {}


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

def init() -> dict[str, Any]:
    """Initialize the Langfuse bridge.

    Attempts to create a Langfuse SDK client using environment variables.
    If the SDK is unavailable, enables REST API fallback mode via aiohttp.

    Safe to call multiple times -- subsequent calls return cached state.

    Returns:
        dict with keys:
            success (bool):  True if at least one communication mode is available.
            mode (str):      ``"sdk"``, ``"rest"``, or ``"local"`` (no connectivity).
            host (str):      The Langfuse server URL.
            error (str):     Error message if initialization failed, else None.
    """
    global _initialized, _client

    with _init_lock:
        if _initialized:
            mode = "sdk" if _client else ("rest" if _AIOHTTP_AVAILABLE else "local")
            return {
                "success": True,
                "mode": mode,
                "host": DEFAULT_HOST,
                "error": None,
            }

        # Try SDK first
        if _SDK_AVAILABLE and PUBLIC_KEY and SECRET_KEY:
            try:
                _client = Langfuse(
                    public_key=PUBLIC_KEY,
                    secret_key=SECRET_KEY,
                    host=DEFAULT_HOST,
                )
                _initialized = True
                logger.info("Langfuse bridge initialized via SDK at %s", DEFAULT_HOST)
                return {
                    "success": True,
                    "mode": "sdk",
                    "host": DEFAULT_HOST,
                    "error": None,
                }
            except Exception as exc:
                logger.warning("Langfuse SDK init failed: %s, trying REST fallback", exc)
                _client = None

        # REST fallback via aiohttp
        if _AIOHTTP_AVAILABLE:
            _initialized = True
            logger.info(
                "Langfuse bridge initialized in REST mode at %s "
                "(SDK %s)",
                DEFAULT_HOST,
                "unavailable" if not _SDK_AVAILABLE else "keys not set",
            )
            return {
                "success": True,
                "mode": "rest",
                "host": DEFAULT_HOST,
                "error": None,
            }

        # Local-only mode -- traces stored in memory, no server comms
        _initialized = True
        logger.warning(
            "Langfuse bridge initialized in LOCAL mode (no SDK, no aiohttp). "
            "Traces will only be stored in memory."
        )
        return {
            "success": True,
            "mode": "local",
            "host": DEFAULT_HOST,
            "error": "No langfuse SDK or aiohttp available; running in local-only mode",
        }


def status() -> ToolStatus:
    """Return the current health status of the Langfuse integration.

    Returns:
        ToolStatus with availability, health, and version information.
    """
    if not _initialized:
        init()

    version: Optional[str] = None
    if _langfuse_mod is not None:
        version = getattr(_langfuse_mod, "__version__", None)

    has_connectivity = _client is not None or _AIOHTTP_AVAILABLE

    return ToolStatus(
        name="Langfuse",
        available=_initialized,
        healthy=_initialized and has_connectivity,
        error=None if has_connectivity else "No server connectivity (local-only mode)",
        version=version,
    )


def capabilities() -> list[str]:
    """Return the list of operations this bridge supports.

    Returns:
        List of capability strings matching external_tools.toml.
    """
    return [
        "tracing",
        "span_logging",
        "cost_tracking",
        "prompt_versioning",
        "evaluation",
        "run_correlation",
        "observability",
        "llm_monitoring",
        "latency_tracking",
        "tool_logging",
    ]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    """Return current UTC timestamp in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat()


def _gen_id() -> str:
    """Generate a unique ID for traces, spans, etc."""
    return uuid.uuid4().hex


def _create_trace_id(run_id: str) -> str:
    """Create a deterministic trace ID seeded from a Goose run_id.

    This ensures that traces for the same run are always correlated,
    even across process restarts or retries.

    Args:
        run_id: The Goose agent run identifier.

    Returns:
        A 32-character hex string derived from the run_id.
    """
    import hashlib
    return hashlib.sha256(f"goose-{run_id}".encode()).hexdigest()[:32]


async def _rest_request(
    method: str,
    path: str,
    *,
    json_data: Optional[dict[str, Any]] = None,
    params: Optional[dict[str, str]] = None,
) -> dict[str, Any]:
    """Make an authenticated REST API request to the Langfuse server.

    Args:
        method: HTTP method (GET, POST, etc.)
        path: API path (e.g. ``"/api/public/traces"``).
        json_data: Optional JSON body for POST/PUT requests.
        params: Optional query parameters for GET requests.

    Returns:
        dict with ``success`` and response data or ``error``.
    """
    if not _AIOHTTP_AVAILABLE:
        return {"success": False, "error": "aiohttp not available for REST calls"}

    url = f"{DEFAULT_HOST}{path}"
    auth = None
    if PUBLIC_KEY and SECRET_KEY:
        auth = aiohttp.BasicAuth(PUBLIC_KEY, SECRET_KEY)

    try:
        timeout_obj = aiohttp.ClientTimeout(total=API_TIMEOUT)
        async with aiohttp.ClientSession(timeout=timeout_obj) as session:
            async with session.request(
                method,
                url,
                json=json_data,
                params=params,
                auth=auth,
                headers={"Content-Type": "application/json"},
            ) as resp:
                body = await resp.text()
                if resp.status >= 400:
                    return {
                        "success": False,
                        "status_code": resp.status,
                        "error": f"HTTP {resp.status}: {body[:500]}",
                    }
                try:
                    data = json.loads(body)
                except json.JSONDecodeError:
                    data = {"raw": body}
                return {"success": True, "data": data, "status_code": resp.status}
    except asyncio.TimeoutError:
        return {"success": False, "error": f"Request to {url} timed out after {API_TIMEOUT}s"}
    except Exception as exc:
        return {"success": False, "error": f"REST request failed: {exc}"}


# ---------------------------------------------------------------------------
# Core operations
# ---------------------------------------------------------------------------

async def create_trace(
    run_id: str,
    name: str,
    tags: Optional[list[str]] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Create a trace with a deterministic ID seeded from run_id.

    Unlike :func:`start_trace`, this function produces a reproducible
    trace ID from the ``run_id``, enabling trace correlation across
    retries and process restarts.

    Args:
        run_id: Goose agent run identifier (used to seed the trace ID).
        name: Human-readable name for the trace.
        tags: Optional list of tags for filtering/grouping.
        metadata: Optional metadata dict attached to the trace.

    Returns:
        dict with keys:
            success (bool):   True if the trace was created.
            trace_id (str):   Deterministic trace identifier.
            run_id (str):     The original run_id.
            name (str):       The trace name.
            started_at (str): ISO 8601 timestamp.
            error (str):      Error message if failed, else None.
    """
    if not _initialized:
        init()

    trace_id = _create_trace_id(run_id)
    started_at = _now_iso()
    meta = metadata or {}
    meta["run_id"] = run_id
    if tags:
        meta["tags"] = tags

    # SDK path
    if _client is not None:
        try:
            _client.trace(
                id=trace_id,
                name=name,
                metadata=meta,
            )
        except Exception as exc:
            logger.warning("SDK create_trace failed: %s, continuing with local store", exc)

    # REST fallback
    elif _AIOHTTP_AVAILABLE:
        await _rest_request("POST", "/api/public/ingestion", json_data={
            "batch": [{
                "id": _gen_id(),
                "type": "trace-create",
                "timestamp": started_at,
                "body": {
                    "id": trace_id,
                    "name": name,
                    "metadata": meta,
                },
            }],
        })

    # Always store locally
    _trace_store[trace_id] = TraceRecord(
        trace_id=trace_id,
        name=name,
        metadata=meta,
        started_at=started_at,
    )

    return {
        "success": True,
        "trace_id": trace_id,
        "run_id": run_id,
        "name": name,
        "started_at": started_at,
        "error": None,
    }


async def start_trace(
    name: str,
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Start a new observability trace.

    A trace represents a complete operation (e.g., an agent turn, a tool
    invocation chain, a user request).  Spans and generations are attached
    to traces.

    Args:
        name: Human-readable name for the trace (e.g. ``"agent_turn"``).
        metadata: Optional metadata dict attached to the trace.

    Returns:
        dict with keys:
            success (bool):   True if the trace was created.
            trace_id (str):   Unique identifier for the new trace.
            name (str):       The trace name.
            started_at (str): ISO 8601 timestamp.
            error (str):      Error message if failed, else None.
    """
    if not _initialized:
        init()

    trace_id = _gen_id()
    started_at = _now_iso()
    meta = metadata or {}

    # SDK path
    if _client is not None:
        try:
            _client.trace(
                id=trace_id,
                name=name,
                metadata=meta,
            )
            _trace_store[trace_id] = TraceRecord(
                trace_id=trace_id,
                name=name,
                metadata=meta,
                started_at=started_at,
            )
            return {
                "success": True,
                "trace_id": trace_id,
                "name": name,
                "started_at": started_at,
                "error": None,
            }
        except Exception as exc:
            logger.warning("SDK start_trace failed: %s, falling back to REST", exc)

    # REST fallback
    if _AIOHTTP_AVAILABLE:
        result = await _rest_request("POST", "/api/public/ingestion", json_data={
            "batch": [{
                "id": _gen_id(),
                "type": "trace-create",
                "timestamp": started_at,
                "body": {
                    "id": trace_id,
                    "name": name,
                    "metadata": meta,
                },
            }],
        })
        if not result["success"]:
            logger.warning("REST start_trace failed: %s", result.get("error"))

    # Always store locally
    _trace_store[trace_id] = TraceRecord(
        trace_id=trace_id,
        name=name,
        metadata=meta,
        started_at=started_at,
    )

    return {
        "success": True,
        "trace_id": trace_id,
        "name": name,
        "started_at": started_at,
        "error": None,
    }


async def end_trace(
    trace_id: str,
    trace_status: str = "success",
) -> dict[str, Any]:
    """End a previously started trace.

    Args:
        trace_id: The trace identifier returned by :func:`start_trace`.
        trace_status: Final status string (e.g. ``"success"``, ``"error"``,
            ``"cancelled"``).

    Returns:
        dict with keys:
            success (bool):  True if the trace was ended.
            trace_id (str):  The trace ID.
            status (str):    The final status.
            ended_at (str):  ISO 8601 timestamp.
            duration_ms (float): Total trace duration in milliseconds.
            error (str):     Error message if failed, else None.
    """
    if not _initialized:
        init()

    ended_at = _now_iso()
    record = _trace_store.get(trace_id)

    duration_ms = 0.0
    if record:
        record.status = trace_status
        record.ended_at = ended_at
        try:
            start_dt = datetime.fromisoformat(record.started_at)
            end_dt = datetime.fromisoformat(ended_at)
            duration_ms = (end_dt - start_dt).total_seconds() * 1000
        except (ValueError, TypeError):
            pass

    # SDK path
    if _client is not None:
        try:
            _client.trace(
                id=trace_id,
                metadata={"status": trace_status, "ended_at": ended_at},
            )
        except Exception as exc:
            logger.warning("SDK end_trace failed: %s", exc)

    # REST fallback
    elif _AIOHTTP_AVAILABLE:
        await _rest_request("POST", "/api/public/ingestion", json_data={
            "batch": [{
                "id": _gen_id(),
                "type": "trace-create",
                "timestamp": ended_at,
                "body": {
                    "id": trace_id,
                    "metadata": {"status": trace_status, "ended_at": ended_at},
                },
            }],
        })

    if not record:
        return {
            "success": False,
            "trace_id": trace_id,
            "status": trace_status,
            "ended_at": ended_at,
            "duration_ms": 0.0,
            "error": f"Trace {trace_id} not found in local store",
        }

    return {
        "success": True,
        "trace_id": trace_id,
        "status": trace_status,
        "ended_at": ended_at,
        "duration_ms": round(duration_ms, 2),
        "error": None,
    }


async def add_span(
    trace_id: str,
    name: str,
    input_data: Optional[dict[str, Any]] = None,
    output_data: Optional[dict[str, Any]] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Add a span (sub-operation) to an existing trace.

    Spans represent discrete operations within a trace, such as a
    preprocessing step, a database query, or a sub-agent call.

    Args:
        trace_id: Parent trace identifier.
        name: Human-readable span name.
        input_data: Optional input data for the span.
        output_data: Optional output data from the span.
        metadata: Optional metadata dict.

    Returns:
        dict with keys:
            success (bool):  True if the span was added.
            span_id (str):   Unique identifier for the new span.
            trace_id (str):  Parent trace ID.
            name (str):      The span name.
            error (str):     Error message if failed, else None.
    """
    if not _initialized:
        init()

    span_id = _gen_id()
    timestamp = _now_iso()
    span_record = {
        "span_id": span_id,
        "name": name,
        "input": input_data,
        "output": output_data,
        "metadata": metadata or {},
        "timestamp": timestamp,
    }

    # SDK path
    if _client is not None:
        try:
            _client.span(
                id=span_id,
                trace_id=trace_id,
                name=name,
                input=input_data,
                output=output_data,
                metadata=metadata,
            )
        except Exception as exc:
            logger.warning("SDK add_span failed: %s", exc)

    # REST fallback
    elif _AIOHTTP_AVAILABLE:
        await _rest_request("POST", "/api/public/ingestion", json_data={
            "batch": [{
                "id": _gen_id(),
                "type": "span-create",
                "timestamp": timestamp,
                "body": {
                    "id": span_id,
                    "traceId": trace_id,
                    "name": name,
                    "input": input_data,
                    "output": output_data,
                    "metadata": metadata or {},
                },
            }],
        })

    # Local store
    record = _trace_store.get(trace_id)
    if record:
        record.spans.append(span_record)

    return {
        "success": True,
        "span_id": span_id,
        "trace_id": trace_id,
        "name": name,
        "error": None,
    }


async def add_generation(
    trace_id: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    latency_ms: float,
    cost: Optional[float] = None,
) -> dict[str, Any]:
    """Track an LLM generation event within a trace.

    Records token usage, latency, cost, and model information for a
    single LLM call.

    Args:
        trace_id: Parent trace identifier.
        model: LLM model identifier (e.g. ``"claude-sonnet-4-20250514"``).
        input_tokens: Number of input/prompt tokens.
        output_tokens: Number of output/completion tokens.
        latency_ms: Generation latency in milliseconds.
        cost: Optional cost in USD for this generation.

    Returns:
        dict with keys:
            success (bool):       True if the generation was recorded.
            generation_id (str):  Unique identifier for this generation record.
            trace_id (str):       Parent trace ID.
            model (str):          The model used.
            total_tokens (int):   Sum of input and output tokens.
            error (str):          Error message if failed, else None.
    """
    if not _initialized:
        init()

    gen_id = _gen_id()
    timestamp = _now_iso()
    total_tokens = input_tokens + output_tokens

    gen_record = {
        "generation_id": gen_id,
        "model": model,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "latency_ms": latency_ms,
        "cost_usd": cost,
        "timestamp": timestamp,
    }

    # SDK path
    if _client is not None:
        try:
            _client.generation(
                id=gen_id,
                trace_id=trace_id,
                name=f"generation-{model}",
                model=model,
                usage={
                    "input": input_tokens,
                    "output": output_tokens,
                    "total": total_tokens,
                    "unit": "TOKENS",
                },
                metadata={
                    "latency_ms": latency_ms,
                    "cost_usd": cost,
                },
            )
        except Exception as exc:
            logger.warning("SDK add_generation failed: %s", exc)

    # REST fallback
    elif _AIOHTTP_AVAILABLE:
        await _rest_request("POST", "/api/public/ingestion", json_data={
            "batch": [{
                "id": _gen_id(),
                "type": "generation-create",
                "timestamp": timestamp,
                "body": {
                    "id": gen_id,
                    "traceId": trace_id,
                    "name": f"generation-{model}",
                    "model": model,
                    "usage": {
                        "input": input_tokens,
                        "output": output_tokens,
                        "total": total_tokens,
                        "unit": "TOKENS",
                    },
                    "metadata": {
                        "latency_ms": latency_ms,
                        "cost_usd": cost,
                    },
                },
            }],
        })

    # Local store
    record = _trace_store.get(trace_id)
    if record:
        record.generations.append(gen_record)

    return {
        "success": True,
        "generation_id": gen_id,
        "trace_id": trace_id,
        "model": model,
        "total_tokens": total_tokens,
        "error": None,
    }


async def log_tool_call(
    trace_id: str,
    tool_name: str,
    input_params: Any,
    output: Any,
    duration_ms: float,
) -> dict[str, Any]:
    """Log a tool/function execution within a trace.

    Records the tool name, parameters, output, and execution time as a
    span within the parent trace.

    Args:
        trace_id: Parent trace identifier.
        tool_name: Name of the tool that was invoked.
        input_params: Input parameters passed to the tool.
        output: Output returned by the tool.
        duration_ms: Execution duration in milliseconds.

    Returns:
        dict with keys:
            success (bool):      True if the tool call was logged.
            span_id (str):       Unique identifier for this tool call span.
            trace_id (str):      Parent trace ID.
            tool_name (str):     The tool name.
            duration_ms (float): Execution duration.
            error (str):         Error message if failed, else None.
    """
    if not _initialized:
        init()

    span_id = _gen_id()
    timestamp = _now_iso()

    # Serialize input/output for storage
    input_serialized = input_params
    if not isinstance(input_params, dict):
        input_serialized = {"value": str(input_params)}

    output_serialized = output
    if not isinstance(output, dict):
        output_serialized = {"value": str(output)}

    tool_record = {
        "span_id": span_id,
        "tool_name": tool_name,
        "input": input_serialized,
        "output": output_serialized,
        "duration_ms": duration_ms,
        "timestamp": timestamp,
    }

    # SDK path -- log as a span with tool metadata
    if _client is not None:
        try:
            _client.span(
                id=span_id,
                trace_id=trace_id,
                name=f"tool:{tool_name}",
                input=input_serialized,
                output=output_serialized,
                metadata={
                    "tool_name": tool_name,
                    "duration_ms": duration_ms,
                    "type": "tool_call",
                },
            )
        except Exception as exc:
            logger.warning("SDK log_tool_call failed: %s", exc)

    # REST fallback
    elif _AIOHTTP_AVAILABLE:
        await _rest_request("POST", "/api/public/ingestion", json_data={
            "batch": [{
                "id": _gen_id(),
                "type": "span-create",
                "timestamp": timestamp,
                "body": {
                    "id": span_id,
                    "traceId": trace_id,
                    "name": f"tool:{tool_name}",
                    "input": input_serialized,
                    "output": output_serialized,
                    "metadata": {
                        "tool_name": tool_name,
                        "duration_ms": duration_ms,
                        "type": "tool_call",
                    },
                },
            }],
        })

    # Local store
    record = _trace_store.get(trace_id)
    if record:
        record.tool_calls.append(tool_record)

    return {
        "success": True,
        "span_id": span_id,
        "trace_id": trace_id,
        "tool_name": tool_name,
        "duration_ms": duration_ms,
        "error": None,
    }


async def log_span(
    trace_id: str,
    name: str,
    input_data: Optional[dict[str, Any]] = None,
    output_data: Optional[dict[str, Any]] = None,
    metadata: Optional[dict[str, Any]] = None,
    duration_ms: Optional[float] = None,
) -> dict[str, Any]:
    """Log a span to an existing trace (alias for add_span with duration).

    This is the Stage 6 interface for span logging, adding duration_ms
    tracking on top of :func:`add_span`.

    Args:
        trace_id: Parent trace identifier.
        name: Human-readable span name.
        input_data: Optional input data for the span.
        output_data: Optional output data from the span.
        metadata: Optional metadata dict.
        duration_ms: Optional span duration in milliseconds.

    Returns:
        dict with span_id, trace_id, name, duration_ms, and error keys.
    """
    meta = metadata or {}
    if duration_ms is not None:
        meta["duration_ms"] = duration_ms

    result = await add_span(
        trace_id=trace_id,
        name=name,
        input_data=input_data,
        output_data=output_data,
        metadata=meta,
    )

    result["duration_ms"] = duration_ms
    return result


async def log_generation(
    trace_id: str,
    name: str,
    model: str,
    input_data: Optional[Any] = None,
    output_data: Optional[Any] = None,
    tokens: Optional[dict[str, int]] = None,
    cost_usd: Optional[float] = None,
) -> dict[str, Any]:
    """Log an LLM generation event with detailed tracking.

    This is the Stage 6 interface for generation logging, providing a
    richer API than :func:`add_generation` with named input/output and
    structured token counts.

    Args:
        trace_id: Parent trace identifier.
        name: Human-readable generation name (e.g. ``"main_completion"``).
        model: LLM model identifier (e.g. ``"claude-sonnet-4-20250514"``).
        input_data: Optional input (prompt) data.
        output_data: Optional output (completion) data.
        tokens: Optional dict with ``input``, ``output``, and ``total`` keys.
        cost_usd: Optional cost in USD for this generation.

    Returns:
        dict with generation_id, trace_id, model, tokens, cost, and error keys.
    """
    if not _initialized:
        init()

    gen_id = _gen_id()
    timestamp = _now_iso()

    input_tokens = 0
    output_tokens = 0
    total_tokens = 0
    if tokens:
        input_tokens = tokens.get("input", 0)
        output_tokens = tokens.get("output", 0)
        total_tokens = tokens.get("total", input_tokens + output_tokens)

    gen_record = {
        "generation_id": gen_id,
        "name": name,
        "model": model,
        "input": input_data,
        "output": output_data,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "cost_usd": cost_usd,
        "timestamp": timestamp,
    }

    # SDK path
    if _client is not None:
        try:
            _client.generation(
                id=gen_id,
                trace_id=trace_id,
                name=name,
                model=model,
                input=input_data,
                output=output_data,
                usage={
                    "input": input_tokens,
                    "output": output_tokens,
                    "total": total_tokens,
                    "unit": "TOKENS",
                },
                metadata={
                    "cost_usd": cost_usd,
                },
            )
        except Exception as exc:
            logger.warning("SDK log_generation failed: %s", exc)

    # REST fallback
    elif _AIOHTTP_AVAILABLE:
        await _rest_request("POST", "/api/public/ingestion", json_data={
            "batch": [{
                "id": _gen_id(),
                "type": "generation-create",
                "timestamp": timestamp,
                "body": {
                    "id": gen_id,
                    "traceId": trace_id,
                    "name": name,
                    "model": model,
                    "input": input_data,
                    "output": output_data,
                    "usage": {
                        "input": input_tokens,
                        "output": output_tokens,
                        "total": total_tokens,
                        "unit": "TOKENS",
                    },
                    "metadata": {
                        "cost_usd": cost_usd,
                    },
                },
            }],
        })

    # Local store
    record = _trace_store.get(trace_id)
    if record:
        record.generations.append(gen_record)

    return {
        "success": True,
        "generation_id": gen_id,
        "trace_id": trace_id,
        "name": name,
        "model": model,
        "total_tokens": total_tokens,
        "cost_usd": cost_usd,
        "error": None,
    }


async def flush() -> dict[str, Any]:
    """Force flush all pending events to the Langfuse server.

    Ensures any buffered traces, spans, and generations are sent
    immediately rather than waiting for the SDK's internal flush timer.

    Returns:
        dict with keys:
            success (bool):  True if flush completed.
            mode (str):      Current bridge mode (sdk/rest/local).
            error (str):     Error message if flush failed, else None.
    """
    if not _initialized:
        init()

    mode = "sdk" if _client else ("rest" if _AIOHTTP_AVAILABLE else "local")

    if _client is not None:
        try:
            _client.flush()
            return {
                "success": True,
                "mode": mode,
                "error": None,
            }
        except Exception as exc:
            return {
                "success": False,
                "mode": mode,
                "error": f"SDK flush failed: {exc}",
            }

    # REST and local modes have no buffering to flush
    return {
        "success": True,
        "mode": mode,
        "error": None,
    }


async def get_trace(trace_id: str) -> dict[str, Any]:
    """Retrieve details for a specific trace.

    Attempts to fetch from the Langfuse server first, falls back to the
    local in-memory store.

    Args:
        trace_id: The trace identifier.

    Returns:
        dict with keys:
            success (bool):       True if the trace was found.
            trace_id (str):       The trace ID.
            name (str):           Trace name.
            status (str):         Current status.
            started_at (str):     Start timestamp.
            ended_at (str|None):  End timestamp if completed.
            spans (list):         List of span records.
            generations (list):   List of generation records.
            tool_calls (list):    List of tool call records.
            metadata (dict):      Trace metadata.
            error (str):          Error message if not found, else None.
    """
    if not _initialized:
        init()

    # Try REST API first for fresh data
    if _AIOHTTP_AVAILABLE and PUBLIC_KEY and SECRET_KEY:
        result = await _rest_request("GET", f"/api/public/traces/{trace_id}")
        if result["success"]:
            data = result.get("data", {})
            return {
                "success": True,
                "trace_id": trace_id,
                "name": data.get("name", ""),
                "status": data.get("metadata", {}).get("status", "unknown"),
                "started_at": data.get("timestamp", ""),
                "ended_at": data.get("metadata", {}).get("ended_at"),
                "spans": data.get("observations", []),
                "generations": [],
                "tool_calls": [],
                "metadata": data.get("metadata", {}),
                "error": None,
            }

    # Fall back to local store
    record = _trace_store.get(trace_id)
    if record is None:
        return {
            "success": False,
            "trace_id": trace_id,
            "error": f"Trace {trace_id} not found",
        }

    return {
        "success": True,
        "trace_id": record.trace_id,
        "name": record.name,
        "status": record.status,
        "started_at": record.started_at,
        "ended_at": record.ended_at,
        "spans": record.spans,
        "generations": record.generations,
        "tool_calls": record.tool_calls,
        "metadata": record.metadata,
        "error": None,
    }


async def list_traces(limit: int = 20) -> dict[str, Any]:
    """List recent traces.

    Attempts to fetch from the Langfuse server first, falls back to the
    local in-memory store.

    Args:
        limit: Maximum number of traces to return (default 20).

    Returns:
        dict with keys:
            success (bool):  True if traces were retrieved.
            count (int):     Number of traces returned.
            traces (list):   List of trace summary dicts.
            error (str):     Error message if failed, else None.
    """
    if not _initialized:
        init()

    # Try REST API first
    if _AIOHTTP_AVAILABLE and PUBLIC_KEY and SECRET_KEY:
        result = await _rest_request(
            "GET",
            "/api/public/traces",
            params={"limit": str(limit)},
        )
        if result["success"]:
            data = result.get("data", {})
            traces_list = data.get("data", []) if isinstance(data, dict) else []
            summaries = []
            for t in traces_list[:limit]:
                summaries.append({
                    "trace_id": t.get("id", ""),
                    "name": t.get("name", ""),
                    "timestamp": t.get("timestamp", ""),
                    "metadata": t.get("metadata", {}),
                })
            return {
                "success": True,
                "count": len(summaries),
                "traces": summaries,
                "error": None,
            }

    # Local store fallback
    all_traces = list(_trace_store.values())
    # Sort by started_at descending (most recent first)
    all_traces.sort(key=lambda r: r.started_at, reverse=True)
    limited = all_traces[:limit]

    summaries = []
    for record in limited:
        summaries.append({
            "trace_id": record.trace_id,
            "name": record.name,
            "status": record.status,
            "started_at": record.started_at,
            "ended_at": record.ended_at,
            "span_count": len(record.spans),
            "generation_count": len(record.generations),
            "tool_call_count": len(record.tool_calls),
        })

    return {
        "success": True,
        "count": len(summaries),
        "traces": summaries,
        "error": None,
    }


async def get_metrics(time_range: str = "24h") -> dict[str, Any]:
    """Get aggregate metrics over a time range.

    Computes totals for tokens, cost, latency, and trace counts from
    either the Langfuse server or local trace data.

    Args:
        time_range: Time range string. Supported values:
            ``"1h"``, ``"6h"``, ``"24h"``, ``"7d"``, ``"30d"``.

    Returns:
        dict with keys:
            success (bool):         True if metrics were computed.
            time_range (str):       The requested time range.
            total_traces (int):     Number of traces in the period.
            total_spans (int):      Number of spans in the period.
            total_generations (int): Number of LLM generations.
            total_input_tokens (int):  Aggregate input tokens.
            total_output_tokens (int): Aggregate output tokens.
            total_tokens (int):     Aggregate total tokens.
            total_cost_usd (float): Aggregate cost in USD.
            avg_latency_ms (float): Average generation latency.
            total_tool_calls (int): Number of tool calls.
            error (str):            Error message if failed, else None.
    """
    if not _initialized:
        init()

    # Parse time range to seconds
    range_map = {
        "1h": 3600,
        "6h": 21600,
        "24h": 86400,
        "7d": 604800,
        "30d": 2592000,
    }
    range_seconds = range_map.get(time_range, 86400)

    # Compute from local store
    now = datetime.now(timezone.utc)
    total_traces = 0
    total_spans = 0
    total_generations = 0
    total_input_tokens = 0
    total_output_tokens = 0
    total_cost = 0.0
    total_latency = 0.0
    latency_count = 0
    total_tool_calls = 0

    for record in _trace_store.values():
        try:
            trace_time = datetime.fromisoformat(record.started_at)
            age_seconds = (now - trace_time).total_seconds()
            if age_seconds > range_seconds:
                continue
        except (ValueError, TypeError):
            continue

        total_traces += 1
        total_spans += len(record.spans)
        total_generations += len(record.generations)
        total_tool_calls += len(record.tool_calls)

        for gen in record.generations:
            total_input_tokens += gen.get("input_tokens", 0)
            total_output_tokens += gen.get("output_tokens", 0)
            if gen.get("cost_usd") is not None:
                total_cost += gen["cost_usd"]
            if gen.get("latency_ms") is not None:
                total_latency += gen["latency_ms"]
                latency_count += 1

    avg_latency = round(total_latency / latency_count, 2) if latency_count > 0 else 0.0

    return {
        "success": True,
        "time_range": time_range,
        "total_traces": total_traces,
        "total_spans": total_spans,
        "total_generations": total_generations,
        "total_input_tokens": total_input_tokens,
        "total_output_tokens": total_output_tokens,
        "total_tokens": total_input_tokens + total_output_tokens,
        "total_cost_usd": round(total_cost, 6),
        "avg_latency_ms": avg_latency,
        "total_tool_calls": total_tool_calls,
        "error": None,
    }


async def health_check() -> dict[str, Any]:
    """Check if the Langfuse server is reachable.

    Attempts to reach the Langfuse server at the configured host URL.

    Returns:
        dict with keys:
            success (bool):     True if the server responded.
            host (str):         The Langfuse server URL.
            reachable (bool):   True if server is reachable.
            status_code (int):  HTTP status code from the server.
            mode (str):         Current bridge mode (sdk/rest/local).
            error (str):        Error message if unreachable, else None.
    """
    if not _initialized:
        init()

    mode = "sdk" if _client else ("rest" if _AIOHTTP_AVAILABLE else "local")

    # SDK health check via flush
    if _client is not None:
        try:
            _client.flush()
            return {
                "success": True,
                "host": DEFAULT_HOST,
                "reachable": True,
                "status_code": 200,
                "mode": mode,
                "error": None,
            }
        except Exception as exc:
            logger.warning("SDK health check failed: %s", exc)

    # REST health check
    if _AIOHTTP_AVAILABLE:
        try:
            timeout_obj = aiohttp.ClientTimeout(total=HEALTH_TIMEOUT)
            async with aiohttp.ClientSession(timeout=timeout_obj) as session:
                async with session.get(f"{DEFAULT_HOST}/api/public/health") as resp:
                    return {
                        "success": resp.status < 500,
                        "host": DEFAULT_HOST,
                        "reachable": True,
                        "status_code": resp.status,
                        "mode": mode,
                        "error": None if resp.status < 400 else f"HTTP {resp.status}",
                    }
        except asyncio.TimeoutError:
            return {
                "success": False,
                "host": DEFAULT_HOST,
                "reachable": False,
                "status_code": None,
                "mode": mode,
                "error": f"Connection to {DEFAULT_HOST} timed out after {HEALTH_TIMEOUT}s",
            }
        except Exception as exc:
            return {
                "success": False,
                "host": DEFAULT_HOST,
                "reachable": False,
                "status_code": None,
                "mode": mode,
                "error": f"Connection failed: {exc}",
            }

    return {
        "success": False,
        "host": DEFAULT_HOST,
        "reachable": False,
        "status_code": None,
        "mode": mode,
        "error": "No HTTP client available (install aiohttp or langfuse SDK)",
    }


# ---------------------------------------------------------------------------
# Registry dispatch
# ---------------------------------------------------------------------------

async def execute(operation: str, params: dict[str, Any]) -> dict[str, Any]:
    """Dispatch an operation from the ToolRegistry.

    This is the unified entry point called by
    ``ToolRegistry.execute("langfuse", operation, params)``.

    Args:
        operation: The operation name to perform.
        params: Keyword arguments forwarded to the operation function.

    Returns:
        Operation result dictionary.  Always includes a ``success`` key.

    Supported operations:
        - ``"init"``            -- initialise the bridge
        - ``"status"``          -- get bridge health status
        - ``"capabilities"``    -- list capabilities
        - ``"create_trace"``    -- create trace with deterministic ID from run_id
        - ``"start_trace"``     -- begin a new trace (random ID)
        - ``"end_trace"``       -- close a trace
        - ``"add_span"``        -- add a span to a trace
        - ``"log_span"``        -- add a span with duration tracking
        - ``"add_generation"``  -- record an LLM generation
        - ``"log_generation"``  -- record an LLM generation (Stage 6 API)
        - ``"log_tool_call"``   -- log a tool invocation
        - ``"get_trace"``       -- retrieve trace details
        - ``"list_traces"``     -- list recent traces
        - ``"get_metrics"``     -- aggregate metrics
        - ``"flush"``           -- force flush pending events
        - ``"health_check"``    -- check server reachability
    """
    coordinator = get_coordinator() if get_coordinator is not None else None
    if coordinator is not None:
        try:
            async with coordinator.acquire("langfuse", "trace"):
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
        "create_trace": create_trace,
        "start_trace": start_trace,
        "end_trace": end_trace,
        "add_span": add_span,
        "log_span": log_span,
        "add_generation": add_generation,
        "log_generation": log_generation,
        "log_tool_call": log_tool_call,
        "get_trace": get_trace,
        "list_traces": list_traces,
        "get_metrics": get_metrics,
        "flush": flush,
        "health_check": health_check,
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
            if "success" not in result:
                result["success"] = True
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
# Helpers
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
# CLI test entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="Langfuse Bridge - Super-Goose")
    parser.add_argument(
        "--test", "--selftest", action="store_true",
        help="Run a quick self-test of bridge functionality",
    )
    parser.add_argument(
        "--health", action="store_true",
        help="Check Langfuse server health",
    )
    parser.add_argument(
        "--status", action="store_true",
        help="Show bridge status",
    )
    args = parser.parse_args()

    async def _run_test() -> None:
        """Execute the self-test sequence."""
        print("=" * 60)
        print("Langfuse Bridge Self-Test")
        print("=" * 60)

        # Init
        result = init()
        print(f"\n[init] mode={result['mode']}, success={result['success']}")

        # Status
        s = status()
        print(f"[status] available={s.available}, healthy={s.healthy}, version={s.version}")

        # Capabilities
        caps = capabilities()
        print(f"[capabilities] {caps}")

        # create_trace (deterministic ID from run_id)
        ct_result = await create_trace(
            run_id="test-run-001",
            name="selftest_trace",
            tags=["test", "selftest"],
            metadata={"env": "local"},
        )
        ct_id = ct_result["trace_id"]
        print(f"\n[create_trace] trace_id={ct_id}, run_id={ct_result['run_id']}")

        # Verify deterministic ID
        ct_result2 = await create_trace(
            run_id="test-run-001",
            name="selftest_trace_dup",
        )
        assert ct_result2["trace_id"] == ct_id, "Deterministic trace ID mismatch!"
        print(f"[create_trace] deterministic ID verified (same run_id -> same trace_id)")

        # start_trace (random ID)
        trace_result = await start_trace("test_trace", metadata={"test": True})
        trace_id = trace_result["trace_id"]
        print(f"\n[start_trace] trace_id={trace_id}")

        # log_span (Stage 6 API)
        ls_result = await log_span(
            trace_id, "preprocessing",
            input_data={"text": "hello world"},
            output_data={"tokens": 2},
            metadata={"step": 1},
            duration_ms=42.5,
        )
        print(f"[log_span] span_id={ls_result['span_id']}, duration_ms={ls_result['duration_ms']}")

        # add_span (original API)
        span_result = await add_span(
            trace_id, "postprocessing",
            input_data={"text": "hello world"},
            output_data={"tokens": 2},
        )
        print(f"[add_span] span_id={span_result['span_id']}")

        # log_generation (Stage 6 API)
        lg_result = await log_generation(
            trace_id,
            name="main_completion",
            model="claude-sonnet-4-20250514",
            input_data={"prompt": "Hello"},
            output_data={"text": "Hi there!"},
            tokens={"input": 100, "output": 50},
            cost_usd=0.003,
        )
        print(f"[log_generation] gen_id={lg_result['generation_id']}, "
              f"tokens={lg_result['total_tokens']}, cost=${lg_result['cost_usd']}")

        # add_generation (original API)
        gen_result = await add_generation(
            trace_id,
            model="claude-sonnet-4-20250514",
            input_tokens=100,
            output_tokens=50,
            latency_ms=1234.5,
            cost=0.003,
        )
        print(f"[add_generation] gen_id={gen_result['generation_id']}, "
              f"tokens={gen_result['total_tokens']}")

        # Log tool call
        tool_result = await log_tool_call(
            trace_id,
            tool_name="web_search",
            input_params={"query": "test"},
            output={"results": 5},
            duration_ms=456.7,
        )
        print(f"[log_tool_call] span_id={tool_result['span_id']}")

        # End trace
        end_result = await end_trace(trace_id, trace_status="success")
        print(f"[end_trace] duration_ms={end_result['duration_ms']}")

        # Get trace
        get_result = await get_trace(trace_id)
        print(f"\n[get_trace] name={get_result.get('name')}, "
              f"spans={len(get_result.get('spans', []))}, "
              f"generations={len(get_result.get('generations', []))}")

        # List traces
        list_result = await list_traces(limit=5)
        print(f"[list_traces] count={list_result['count']}")

        # Metrics
        metrics = await get_metrics("24h")
        print(f"[get_metrics] traces={metrics['total_traces']}, "
              f"tokens={metrics['total_tokens']}, "
              f"cost=${metrics['total_cost_usd']}")

        # Flush
        flush_result = await flush()
        print(f"\n[flush] mode={flush_result['mode']}, success={flush_result['success']}")

        # Health check
        health = await health_check()
        print(f"[health_check] reachable={health['reachable']}, mode={health['mode']}")

        print("\n" + "=" * 60)
        print("Self-test complete.")
        print("=" * 60)

    async def _run_health() -> None:
        """Run health check only."""
        init()
        result = await health_check()
        print(json.dumps(result, indent=2))
        sys.exit(0 if result["success"] else 1)

    if args.test:
        asyncio.run(_run_test())
    elif args.health:
        asyncio.run(_run_health())
    elif args.status:
        init()
        s = status()
        print(f"Name:      {s.name}")
        print(f"Available: {s.available}")
        print(f"Healthy:   {s.healthy}")
        print(f"Version:   {s.version}")
        print(f"Error:     {s.error}")
    else:
        parser.print_help()
