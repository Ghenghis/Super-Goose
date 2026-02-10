"""
LangGraph Bridge - Graph-based workflow orchestration for Super-Goose.

Wraps LangGraph's core functionality (StateGraph, Pregel, checkpointing,
human-in-the-loop, time-travel) into async functions consumable by Goose
agents through the Conscious bridge layer.

LangGraph concepts exposed here:
    - StateGraph:       Define agent workflows as directed state machines.
    - InMemorySaver:    Durable checkpointing (default; swappable for SQLite/Postgres).
    - Interrupt/Resume: Human-in-the-loop pause/resume cycles.
    - get_state_history: Time-travel debugging (rewind to any checkpoint).
    - Send/Command:     Map-reduce parallelism and control-flow primitives.
    - Subgraph:         Composable nested graphs.

Usage via ToolRegistry::

    result = await registry.execute("langgraph", "create_workflow", {
        "name": "my_pipeline",
        "nodes": {"step_a": step_a_fn, "step_b": step_b_fn},
        "edges": [("__start__", "step_a"), ("step_a", "step_b"), ("step_b", "__end__")],
    })

Or directly::

    from integrations.langgraph_bridge import create_workflow, run_workflow

    await init()
    await create_workflow("my_pipeline", nodes={...}, edges=[...])
    result = await run_workflow("my_pipeline", {"x": 1})
"""

from __future__ import annotations

import logging
import threading
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Optional, Sequence

from integrations.resource_coordinator import get_coordinator

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Graceful import of LangGraph
# ---------------------------------------------------------------------------

_LANGGRAPH_AVAILABLE = False
_IMPORT_ERROR: Optional[str] = None

try:
    from langgraph.checkpoint.memory import InMemorySaver
    from langgraph.constants import END, START
    from langgraph.graph import StateGraph
    from langgraph.types import Command, Interrupt, Send, StateSnapshot, interrupt

    _LANGGRAPH_AVAILABLE = True
except ImportError as exc:
    _IMPORT_ERROR = (
        f"LangGraph is not installed or cannot be imported: {exc}. "
        "Install with: pip install -e G:/goose/external/langgraph/libs/langgraph"
    )
    logger.warning(_IMPORT_ERROR)

    # Provide stubs so the rest of the module can be parsed without errors.
    InMemorySaver = None  # type: ignore[assignment,misc]
    StateGraph = None  # type: ignore[assignment,misc]
    START = "__start__"  # type: ignore[assignment]
    END = "__end__"  # type: ignore[assignment]
    Command = None  # type: ignore[assignment,misc]
    Send = None  # type: ignore[assignment,misc]
    Interrupt = None  # type: ignore[assignment,misc]
    StateSnapshot = None  # type: ignore[assignment,misc]
    interrupt = None  # type: ignore[assignment]

# Also attempt checkpoint-sqlite import for optional persistence.
_SQLITE_AVAILABLE = False
try:
    from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

    _SQLITE_AVAILABLE = True
except ImportError:
    AsyncSqliteSaver = None  # type: ignore[assignment,misc]

# Also attempt checkpoint-postgres import for production persistence.
_POSTGRES_AVAILABLE = False
try:
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

    _POSTGRES_AVAILABLE = True
except ImportError:
    AsyncPostgresSaver = None  # type: ignore[assignment,misc]


# ---------------------------------------------------------------------------
# Re-export from registry for ToolStatus
# ---------------------------------------------------------------------------

try:
    from integrations.registry import ToolStatus
except ImportError:
    # Fallback: define a minimal ToolStatus when registry is unavailable.
    @dataclass
    class ToolStatus:  # type: ignore[no-redef]
        name: str
        available: bool
        healthy: bool
        error: Optional[str] = None
        version: Optional[str] = None


# ---------------------------------------------------------------------------
# Internal state
# ---------------------------------------------------------------------------

_initialized: bool = False
_init_lock = threading.Lock()
_checkpointer: Any = None  # BaseCheckpointSaver instance

# Registry of workflow definitions: name -> WorkflowDef
_workflows: dict[str, WorkflowDef] = {}

# Registry of compiled graphs: name -> CompiledStateGraph
_compiled: dict[str, Any] = {}


@dataclass
class WorkflowDef:
    """Internal descriptor for a registered workflow."""

    name: str
    state_schema: type
    nodes: dict[str, Callable[..., Any]]
    edges: list[tuple[str, str]]
    conditional_edges: list[tuple[str, Callable[..., Any], Optional[dict]]] = field(
        default_factory=list
    )
    interrupt_before: list[str] = field(default_factory=list)
    interrupt_after: list[str] = field(default_factory=list)
    checkpointer_override: Any = None


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


async def init(
    checkpointer: str = "memory",
    *,
    sqlite_path: Optional[str] = None,
    postgres_dsn: Optional[str] = None,
) -> dict[str, Any]:
    """Initialize the LangGraph bridge.

    Must be called before any other bridge function.  Safe to call multiple
    times (idempotent).

    Args:
        checkpointer: Which checkpoint backend to use.  One of
            ``"memory"`` (default), ``"sqlite"``, or ``"postgres"``.
        sqlite_path: Filesystem path for the SQLite checkpoint database.
            Required when *checkpointer* is ``"sqlite"``.
        postgres_dsn: PostgreSQL connection string.
            Required when *checkpointer* is ``"postgres"``.

    Returns:
        dict with ``success`` bool and diagnostic ``message``.
    """
    global _initialized, _checkpointer

    if not _LANGGRAPH_AVAILABLE:
        return {
            "success": False,
            "message": _IMPORT_ERROR,
        }

    with _init_lock:
        if _initialized:
            return {"success": True, "message": "Already initialized"}

        # --- configure checkpointer ---
        if checkpointer == "memory":
            _checkpointer = InMemorySaver()
        elif checkpointer == "sqlite":
            if not _SQLITE_AVAILABLE:
                return {
                    "success": False,
                    "message": (
                        "SQLite checkpointer requested but langgraph-checkpoint-sqlite "
                        "is not installed.  Install with: "
                        "pip install langgraph-checkpoint-sqlite"
                    ),
                }
            if not sqlite_path:
                sqlite_path = ":memory:"
            _checkpointer = AsyncSqliteSaver.from_conn_string(sqlite_path)
        elif checkpointer == "postgres":
            if not _POSTGRES_AVAILABLE:
                return {
                    "success": False,
                    "message": (
                        "Postgres checkpointer requested but "
                        "langgraph-checkpoint-postgres is not installed.  "
                        "Install with: pip install langgraph-checkpoint-postgres"
                    ),
                }
            if not postgres_dsn:
                return {
                    "success": False,
                    "message": "postgres_dsn is required for postgres checkpointer",
                }
            _checkpointer = AsyncPostgresSaver.from_conn_string(postgres_dsn)
        else:
            return {
                "success": False,
                "message": f"Unknown checkpointer backend: {checkpointer!r}. "
                "Choose 'memory', 'sqlite', or 'postgres'.",
            }

        _initialized = True
        logger.info("LangGraph bridge initialized with %s checkpointer", checkpointer)
        return {
            "success": True,
            "message": f"LangGraph bridge initialized ({checkpointer} checkpointer)",
        }


def status() -> ToolStatus:
    """Return the current health status of the LangGraph integration.

    Returns:
        ToolStatus with availability and health information.
    """
    if not _LANGGRAPH_AVAILABLE:
        return ToolStatus(
            name="LangGraph",
            available=False,
            healthy=False,
            error=_IMPORT_ERROR,
        )

    # Attempt to read the installed version.
    version: Optional[str] = None
    try:
        from langgraph.version import __version__

        version = __version__
    except Exception:
        pass

    return ToolStatus(
        name="LangGraph",
        available=True,
        healthy=_initialized,
        error=None if _initialized else "Not initialized (call init() first)",
        version=version,
    )


def capabilities() -> list[str]:
    """Return the list of operations this bridge supports.

    Returns:
        List of operation name strings.
    """
    return [
        "create_workflow",
        "run_workflow",
        "get_checkpoint",
        "resume_workflow",
        "list_workflows",
        "get_workflow_history",
        "create_coding_workflow",
    ]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ensure_ready() -> None:
    """Raise if the bridge has not been initialized."""
    if not _LANGGRAPH_AVAILABLE:
        raise RuntimeError(
            f"LangGraph unavailable: {_IMPORT_ERROR}"
        )
    if not _initialized:
        raise RuntimeError(
            "LangGraph bridge not initialized.  Call await init() first."
        )


def _make_thread_config(thread_id: Optional[str] = None) -> dict[str, Any]:
    """Build a RunnableConfig with a thread_id for checkpoint tracking."""
    if thread_id is None:
        thread_id = uuid.uuid4().hex
    return {"configurable": {"thread_id": thread_id}}


def _build_state_schema_from_keys(keys: Sequence[str]) -> type:
    """Dynamically create a TypedDict-like schema from a list of key names.

    Each key is typed ``Any`` with a ``LastValue`` channel (default).
    """
    from typing_extensions import TypedDict

    annotations = {k: Any for k in keys}
    ns: dict[str, Any] = {"__annotations__": annotations}
    return type("DynamicState", (TypedDict,), ns)  # type: ignore[misc]


def _compile_workflow(wf: WorkflowDef) -> Any:
    """Compile a WorkflowDef into a runnable CompiledStateGraph."""
    builder = StateGraph(wf.state_schema)

    # Add nodes
    for node_name, node_fn in wf.nodes.items():
        builder.add_node(node_name, node_fn)

    # Add edges
    for src, dst in wf.edges:
        builder.add_edge(src, dst)

    # Add conditional edges
    for src, path_fn, path_map in wf.conditional_edges:
        builder.add_conditional_edges(src, path_fn, path_map)

    # Compile with checkpointer
    checkpointer = wf.checkpointer_override or _checkpointer
    compiled = builder.compile(
        checkpointer=checkpointer,
        interrupt_before=wf.interrupt_before or None,
        interrupt_after=wf.interrupt_after or None,
    )
    return compiled


# ---------------------------------------------------------------------------
# Public API: workflow CRUD
# ---------------------------------------------------------------------------


async def create_workflow(
    name: str,
    nodes: dict[str, Callable[..., Any]],
    edges: list[tuple[str, str]],
    *,
    state_schema: Optional[type] = None,
    state_keys: Optional[list[str]] = None,
    conditional_edges: Optional[list[tuple[str, Callable[..., Any], Optional[dict]]]] = None,
    interrupt_before: Optional[list[str]] = None,
    interrupt_after: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Define and register a new workflow graph.

    The workflow is compiled immediately and cached for subsequent
    ``run_workflow`` calls.

    Args:
        name: Unique name for this workflow.
        nodes: Mapping of node name to the callable that implements it.
            Each callable should accept the state dict (or typed state) as its
            first argument and return a partial state update dict.
        edges: List of ``(source, target)`` tuples defining the graph edges.
            Use the sentinel strings ``"__start__"`` and ``"__end__"`` for
            the virtual entry and exit nodes.
        state_schema: Optional TypedDict or Pydantic model class describing
            the workflow state.  If omitted, a schema is generated from
            *state_keys* or defaults to ``{"result": Any}``.
        state_keys: Convenience shorthand -- if *state_schema* is not
            provided, a TypedDict is generated with these key names (all
            typed ``Any``).
        conditional_edges: Optional list of
            ``(source, routing_callable, path_map)`` triples for conditional
            branching.
        interrupt_before: Node names where execution should pause *before*
            running the node (human-in-the-loop).
        interrupt_after: Node names where execution should pause *after*
            running the node.

    Returns:
        dict with ``success`` bool and workflow metadata.

    Raises:
        RuntimeError: If the bridge is not initialized.
        ValueError: If a workflow with the same *name* already exists.
    """
    _ensure_ready()

    if name in _workflows:
        raise ValueError(
            f"Workflow '{name}' already exists.  Delete it first or choose "
            "a different name."
        )

    # Resolve schema
    if state_schema is None:
        if state_keys:
            state_schema = _build_state_schema_from_keys(state_keys)
        else:
            # Default minimal schema
            state_schema = _build_state_schema_from_keys(["result"])

    wf = WorkflowDef(
        name=name,
        state_schema=state_schema,
        nodes=nodes,
        edges=edges,
        conditional_edges=conditional_edges or [],
        interrupt_before=interrupt_before or [],
        interrupt_after=interrupt_after or [],
    )

    # Compile
    try:
        compiled = _compile_workflow(wf)
    except Exception as exc:
        logger.error("Failed to compile workflow '%s': %s", name, exc)
        return {"success": False, "error": str(exc)}

    _workflows[name] = wf
    _compiled[name] = compiled

    logger.info(
        "Workflow '%s' created with %d nodes and %d edges",
        name,
        len(nodes),
        len(edges),
    )
    return {
        "success": True,
        "workflow": name,
        "nodes": list(nodes.keys()),
        "edges": edges,
    }


async def run_workflow(
    name: str,
    input_data: dict[str, Any],
    *,
    thread_id: Optional[str] = None,
    stream: bool = False,
) -> dict[str, Any]:
    """Execute a previously registered workflow.

    Args:
        name: Name of the workflow (as given to ``create_workflow``).
        input_data: Initial state dict fed to the graph's entry point.
        thread_id: Optional checkpoint thread identifier.  If omitted a
            new UUID is generated.  Reuse a thread_id to accumulate
            conversational state across invocations.
        stream: If ``True``, return the full list of streamed update events
            instead of just the final state.

    Returns:
        dict containing ``success``, ``thread_id``, and either ``result``
        (final state) or ``events`` (streamed updates).

    Raises:
        RuntimeError: If the bridge is not initialized.
        KeyError: If *name* has not been registered.
    """
    _ensure_ready()

    if name not in _compiled:
        return {"success": False, "error": f"Workflow '{name}' not found"}

    graph = _compiled[name]
    config = _make_thread_config(thread_id)
    actual_thread_id = config["configurable"]["thread_id"]

    try:
        if stream:
            events: list[dict[str, Any]] = []
            async for event in graph.astream(input_data, config):
                events.append(event)
            return {
                "success": True,
                "thread_id": actual_thread_id,
                "events": events,
            }
        else:
            result = await graph.ainvoke(input_data, config)
            return {
                "success": True,
                "thread_id": actual_thread_id,
                "result": result,
            }
    except Exception as exc:
        logger.error("Workflow '%s' execution failed: %s", name, exc)
        return {
            "success": False,
            "thread_id": actual_thread_id,
            "error": str(exc),
            "error_type": type(exc).__name__,
        }


async def get_checkpoint(
    workflow_name: str,
    thread_id: str,
) -> dict[str, Any]:
    """Retrieve the current checkpoint state for a workflow thread.

    This returns a snapshot of the graph state at the most recent
    checkpoint, including the current channel values and which node
    would execute next.

    Args:
        workflow_name: Name of the registered workflow.
        thread_id: Thread identifier for the execution to inspect.

    Returns:
        dict with ``success``, ``values`` (current state dict),
        ``next`` (tuple of pending node names), ``metadata``, and
        ``created_at``.
    """
    _ensure_ready()

    if workflow_name not in _compiled:
        return {"success": False, "error": f"Workflow '{workflow_name}' not found"}

    graph = _compiled[workflow_name]
    config = _make_thread_config(thread_id)

    try:
        snapshot: StateSnapshot = await graph.aget_state(config)
        return {
            "success": True,
            "thread_id": thread_id,
            "values": snapshot.values,
            "next": snapshot.next,
            "metadata": snapshot.metadata,
            "created_at": snapshot.created_at,
            "tasks": [
                {
                    "id": t.id,
                    "name": t.name,
                    "error": str(t.error) if t.error else None,
                    "interrupts": [
                        {"value": intr.value, "id": intr.id}
                        for intr in t.interrupts
                    ],
                }
                for t in snapshot.tasks
            ],
        }
    except ValueError as exc:
        # Typically "No checkpointer set" if graph was compiled without one
        return {"success": False, "error": str(exc)}
    except Exception as exc:
        logger.error("get_checkpoint failed: %s", exc)
        return {"success": False, "error": str(exc)}


async def resume_workflow(
    workflow_name: str,
    thread_id: str,
    *,
    update: Optional[dict[str, Any]] = None,
    resume_value: Any = None,
    as_node: Optional[str] = None,
) -> dict[str, Any]:
    """Resume a workflow that was paused at an interrupt point.

    There are two ways to resume:

    1. **State update**: Supply *update* to patch the graph state before the
       next node runs.  This uses ``update_state`` under the hood.
    2. **Interrupt resume**: Supply *resume_value* to answer a pending
       ``interrupt()`` call.  This feeds a ``Command(resume=...)`` into the
       graph.

    Args:
        workflow_name: Name of the registered workflow.
        thread_id: Thread identifier of the paused execution.
        update: Optional state dict to merge into the current state.
        resume_value: Value to send back in response to an ``interrupt()``.
        as_node: When using *update*, pretend the update came from this
            node (affects reducer logic and branching).

    Returns:
        dict with ``success`` and the resulting ``result`` state.
    """
    _ensure_ready()

    if workflow_name not in _compiled:
        return {"success": False, "error": f"Workflow '{workflow_name}' not found"}

    graph = _compiled[workflow_name]
    config = _make_thread_config(thread_id)

    try:
        # Apply state update if provided
        if update is not None:
            await graph.aupdate_state(config, update, as_node=as_node)

        # Determine what to feed into the graph for resumption
        if resume_value is not None:
            invoke_input = Command(resume=resume_value)
        else:
            # Resume with None triggers re-execution from the interrupt point
            invoke_input = None

        result = await graph.ainvoke(invoke_input, config)
        return {
            "success": True,
            "thread_id": thread_id,
            "result": result,
        }
    except Exception as exc:
        logger.error("resume_workflow failed: %s", exc)
        return {
            "success": False,
            "thread_id": thread_id,
            "error": str(exc),
            "error_type": type(exc).__name__,
        }


async def list_workflows() -> dict[str, Any]:
    """List all registered workflow definitions.

    Returns:
        dict with ``success`` and ``workflows`` list, each entry
        containing name, node names, edge list, and interrupt config.
    """
    _ensure_ready()

    workflows_info = []
    for name, wf in _workflows.items():
        workflows_info.append(
            {
                "name": wf.name,
                "nodes": list(wf.nodes.keys()),
                "edges": wf.edges,
                "interrupt_before": wf.interrupt_before,
                "interrupt_after": wf.interrupt_after,
            }
        )

    return {
        "success": True,
        "count": len(workflows_info),
        "workflows": workflows_info,
    }


async def get_workflow_history(
    name: str,
    thread_id: str,
    *,
    limit: Optional[int] = None,
) -> dict[str, Any]:
    """Retrieve the execution history (time-travel) for a workflow thread.

    Each entry in the history represents a checkpoint -- a complete
    snapshot of the graph state at a given step.  You can use any
    checkpoint's config to "rewind" to that point.

    Args:
        name: Name of the registered workflow.
        thread_id: Thread identifier to inspect.
        limit: Maximum number of history entries to return.  ``None``
            returns all available checkpoints.

    Returns:
        dict with ``success`` and ``history`` list ordered newest-first.
        Each history entry contains ``values``, ``next``, ``metadata``,
        ``created_at``, and ``config`` (for time-travel replay).
    """
    _ensure_ready()

    if name not in _compiled:
        return {"success": False, "error": f"Workflow '{name}' not found"}

    graph = _compiled[name]
    config = _make_thread_config(thread_id)

    try:
        history_entries: list[dict[str, Any]] = []
        async for snapshot in graph.aget_state_history(config, limit=limit):
            history_entries.append(
                {
                    "values": snapshot.values,
                    "next": snapshot.next,
                    "metadata": snapshot.metadata,
                    "created_at": snapshot.created_at,
                    "config": snapshot.config,
                    "parent_config": snapshot.parent_config,
                }
            )

        return {
            "success": True,
            "thread_id": thread_id,
            "count": len(history_entries),
            "history": history_entries,
        }
    except Exception as exc:
        logger.error("get_workflow_history failed: %s", exc)
        return {"success": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# Pre-built workflow: coding pipeline
# ---------------------------------------------------------------------------


async def create_coding_workflow(
    name: str = "coding_pipeline",
    *,
    plan_fn: Optional[Callable[..., Any]] = None,
    implement_fn: Optional[Callable[..., Any]] = None,
    test_fn: Optional[Callable[..., Any]] = None,
    review_fn: Optional[Callable[..., Any]] = None,
    commit_fn: Optional[Callable[..., Any]] = None,
    interrupt_before_commit: bool = True,
) -> dict[str, Any]:
    """Create a pre-built coding workflow: plan -> implement -> test -> review -> commit.

    This is a convenience wrapper that assembles a five-stage linear pipeline
    commonly used for AI-assisted software development.  Each stage can be
    customized by passing your own callable, or left as a default pass-through
    that simply propagates the state.

    The workflow state schema includes::

        task:           str   - Description of the coding task.
        plan:           str   - Plan output from the planning stage.
        code:           str   - Generated code from implementation.
        test_results:   str   - Output from running tests.
        review_notes:   str   - Code review feedback.
        commit_message: str   - Final commit message.
        status:         str   - Current pipeline status.

    Args:
        name: Workflow name (default ``"coding_pipeline"``).
        plan_fn: Custom planning node.  Receives state, returns partial update.
        implement_fn: Custom implementation node.
        test_fn: Custom test-runner node.
        review_fn: Custom code-review node.
        commit_fn: Custom commit node.
        interrupt_before_commit: If ``True`` (default), pause before the
            commit stage to allow human review.

    Returns:
        dict with ``success`` and workflow metadata.

    Example::

        await init()
        result = await create_coding_workflow(
            interrupt_before_commit=True,
        )
        run = await run_workflow("coding_pipeline", {
            "task": "Add input validation to the login form"
        })
        # Execution pauses before commit -- inspect and resume:
        state = await get_checkpoint("coding_pipeline", run["thread_id"])
        resumed = await resume_workflow(
            "coding_pipeline", run["thread_id"],
            resume_value="approved",
        )
    """
    _ensure_ready()

    from typing_extensions import TypedDict

    class CodingState(TypedDict, total=False):
        task: str
        plan: str
        code: str
        test_results: str
        review_notes: str
        commit_message: str
        status: str

    # -- Default node implementations --

    def _default_plan(state: dict[str, Any]) -> dict[str, Any]:
        task = state.get("task", "")
        return {
            "plan": f"Plan for: {task}",
            "status": "planned",
        }

    def _default_implement(state: dict[str, Any]) -> dict[str, Any]:
        plan = state.get("plan", "")
        return {
            "code": f"# Implementation based on plan:\n# {plan}\npass",
            "status": "implemented",
        }

    def _default_test(state: dict[str, Any]) -> dict[str, Any]:
        return {
            "test_results": "All tests passed",
            "status": "tested",
        }

    def _default_review(state: dict[str, Any]) -> dict[str, Any]:
        return {
            "review_notes": "Code review: approved",
            "status": "reviewed",
        }

    def _default_commit(state: dict[str, Any]) -> dict[str, Any]:
        task = state.get("task", "unknown task")
        return {
            "commit_message": f"feat: {task}",
            "status": "committed",
        }

    nodes = {
        "plan": plan_fn or _default_plan,
        "implement": implement_fn or _default_implement,
        "test": test_fn or _default_test,
        "review": review_fn or _default_review,
        "commit": commit_fn or _default_commit,
    }

    edges: list[tuple[str, str]] = [
        (START, "plan"),
        ("plan", "implement"),
        ("implement", "test"),
        ("test", "review"),
        ("review", "commit"),
        ("commit", END),
    ]

    return await create_workflow(
        name=name,
        nodes=nodes,
        edges=edges,
        state_schema=CodingState,
        interrupt_before=["commit"] if interrupt_before_commit else None,
    )


# ---------------------------------------------------------------------------
# Delete workflow
# ---------------------------------------------------------------------------


async def delete_workflow(name: str) -> dict[str, Any]:
    """Remove a workflow definition and its compiled graph.

    Args:
        name: Name of the workflow to delete.

    Returns:
        dict with ``success`` bool.
    """
    _ensure_ready()

    if name not in _workflows:
        return {"success": False, "error": f"Workflow '{name}' not found"}

    del _workflows[name]
    _compiled.pop(name, None)
    logger.info("Workflow '%s' deleted", name)
    return {"success": True, "workflow": name}


# ---------------------------------------------------------------------------
# Generic execute() for ToolRegistry compatibility
# ---------------------------------------------------------------------------


async def execute(operation: str, params: dict[str, Any]) -> dict[str, Any]:
    """Route a named operation to the appropriate bridge function.

    This is the entry-point used by ``ToolRegistry.execute()`` when it
    dispatches to this module.

    Args:
        operation: One of the operation names returned by ``capabilities()``.
        params: Keyword arguments forwarded to the operation function.

    Returns:
        dict with ``success`` and operation-specific payload.
    """
    ops: dict[str, Callable[..., Any]] = {
        "create_workflow": create_workflow,
        "run_workflow": run_workflow,
        "get_checkpoint": get_checkpoint,
        "resume_workflow": resume_workflow,
        "list_workflows": list_workflows,
        "get_workflow_history": get_workflow_history,
        "create_coding_workflow": create_coding_workflow,
        "delete_workflow": delete_workflow,
        "init": init,
        "status": lambda **_: status(),
        "capabilities": lambda **_: capabilities(),
    }

    fn = ops.get(operation)
    if fn is None:
        return {
            "success": False,
            "error": f"Unknown operation '{operation}'.  "
            f"Available: {', '.join(sorted(ops.keys()))}",
        }

    async def _do_operation():
        import inspect as _inspect_mod

        result = fn(**params)
        if _inspect_mod.isawaitable(result):
            result = await result

        # Normalise: if the function returns a non-dict, wrap it.
        if not isinstance(result, dict):
            return {"success": True, "result": result}
        return result

    coordinator = get_coordinator()
    try:
        async with coordinator.acquire("langgraph", "orchestrate"):
            return await _do_operation()
    except Exception as coord_err:
        logger.warning(
            "ResourceCoordinator unavailable, running without coordination: %s",
            coord_err,
        )
        try:
            return await _do_operation()
        except Exception as exc:
            logger.error("execute(%s) failed: %s", operation, exc)
            return {"success": False, "error": str(exc)}
