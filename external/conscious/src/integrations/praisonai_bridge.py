"""PraisonAI Bridge — Async wrapper for PraisonAI multi-agent framework.

Provides Super-Goose agents with access to PraisonAI's capabilities:
  - Single agent creation with role/goal/tools
  - Auto-agent generation from natural language goals
  - Multi-agent orchestration (sequential, hierarchical, parallel)
  - Workflow engine with route/parallel/loop/repeat primitives
  - RAG knowledge base (search, add, chunking)
  - Built-in tool discovery (100+ tools)
  - Planning mode for codebase analysis

Architecture:
  1. Direct import of praisonaiagents package (preferred, zero overhead)
  2. Subprocess fallback if direct import fails (isolated execution)

The bridge is registered in config/external_tools.toml under [tools.praisonai]
and discovered by the ToolRegistry at startup.

Usage via ToolRegistry:
    result = await registry.execute("praisonai", "create_agent", {
        "role": "Data Analyst",
        "goal": "Analyze CSV data and produce summary statistics",
        "tools": ["internet_search"]
    })

Direct usage:
    from integrations.praisonai_bridge import create_agent, run_agents

    agent_cfg = await create_agent(
        role="Researcher",
        goal="Find latest AI papers",
    )
    result = await run_agents(
        agents_config=[agent_cfg],
        process="sequential",
    )
"""

import asyncio
import json
import logging
import os
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PRAISONAI_PATH = Path(__file__).parent.parent.parent.parent / "PraisonAI"
PRAISONAI_AGENTS_PATH = PRAISONAI_PATH / "src" / "praisonai-agents"
PRAISONAI_PACKAGE = "praisonaiagents"
_VERSION = "1.0.0"

# Supported multi-agent process types
PROCESS_TYPES = ("sequential", "hierarchical", "parallel")

# Supported workflow primitives
WORKFLOW_PRIMITIVES = ("route", "parallel", "loop", "repeat")

# ---------------------------------------------------------------------------
# Module-level state (lazy init)
# ---------------------------------------------------------------------------

_initialized: bool = False
_init_lock = threading.Lock()
_import_available: bool = False
_import_error: Optional[str] = None
_cached_version: Optional[str] = None


# ---------------------------------------------------------------------------
# ToolStatus (matches registry.ToolStatus)
# ---------------------------------------------------------------------------

@dataclass
class ToolStatus:
    """Runtime status of the PraisonAI tool."""
    name: str = "PraisonAI"
    available: bool = False
    healthy: bool = False
    error: Optional[str] = None
    version: Optional[str] = None


# ---------------------------------------------------------------------------
# Result container
# ---------------------------------------------------------------------------

@dataclass
class BridgeResult:
    """Standard result from any bridge operation."""
    success: bool
    data: Any = None
    error: Optional[str] = None
    elapsed_s: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------

def init() -> ToolStatus:
    """Initialize the PraisonAI bridge with lazy dependency loading.

    Attempts to import praisonaiagents directly. If the package is not on
    sys.path, it temporarily adds the local checkout path and retries.
    Falls back to subprocess mode if all import attempts fail.

    Returns:
        ToolStatus reflecting whether PraisonAI is available and healthy.
    """
    global _initialized, _import_available, _import_error, _cached_version

    with _init_lock:
        if _initialized:
            return status()

        # Attempt 1: direct import (installed or already on sys.path)
        try:
            import praisonaiagents  # noqa: F401
            _import_available = True
            _cached_version = getattr(praisonaiagents, "__version__", _VERSION)
            logger.info("PraisonAI bridge: direct import succeeded (v%s)", _cached_version)
        except ImportError:
            # Attempt 2: add local checkout to sys.path
            agents_src = str(PRAISONAI_AGENTS_PATH)
            if agents_src not in sys.path:
                sys.path.insert(0, agents_src)
                logger.debug("PraisonAI bridge: added %s to sys.path", agents_src)

            try:
                import praisonaiagents  # noqa: F401
                _import_available = True
                _cached_version = getattr(praisonaiagents, "__version__", _VERSION)
                logger.info(
                    "PraisonAI bridge: import succeeded via local path (v%s)",
                    _cached_version,
                )
            except ImportError as exc:
                _import_available = False
                _import_error = str(exc)
                logger.warning(
                    "PraisonAI bridge: import failed (%s), will use subprocess fallback",
                    _import_error,
                )

        _initialized = True
        return status()


def status() -> ToolStatus:
    """Return the current health status of PraisonAI.

    Returns:
        ToolStatus with availability, health, and version info.
    """
    if not _initialized:
        return ToolStatus(
            available=False,
            healthy=False,
            error="Not initialized — call init() first",
        )

    # Even without direct import, subprocess fallback may be available
    path_exists = PRAISONAI_PATH.exists()

    if _import_available:
        return ToolStatus(
            available=True,
            healthy=True,
            version=_cached_version,
        )
    elif path_exists:
        return ToolStatus(
            available=True,
            healthy=True,
            version=_cached_version or "subprocess",
            error=f"Direct import unavailable ({_import_error}); using subprocess fallback",
        )
    else:
        return ToolStatus(
            available=False,
            healthy=False,
            error=f"PraisonAI not found at {PRAISONAI_PATH} and import failed: {_import_error}",
        )


def capabilities() -> List[str]:
    """Return the list of operations this bridge supports.

    Returns:
        List of operation name strings that can be passed to execute().
    """
    return [
        "create_agent",
        "create_auto_agents",
        "run_agents",
        "run_workflow",
        "search_knowledge",
        "add_knowledge",
        "list_tools",
        "plan_task",
    ]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _ensure_initialized() -> None:
    """Auto-initialize if not yet done."""
    if not _initialized:
        init()


def _run_in_subprocess(script: str, timeout: float = 120.0) -> Dict[str, Any]:
    """Execute a Python script in a subprocess and return parsed JSON output.

    This is the fallback execution path when direct import is not available.
    The script must print a single JSON object to stdout as its last output.

    Args:
        script: Python source code to execute.
        timeout: Maximum execution time in seconds.

    Returns:
        Parsed JSON dict from the subprocess stdout.

    Raises:
        RuntimeError: If the subprocess fails or produces invalid output.
    """
    env = os.environ.copy()

    # Ensure praisonaiagents is importable in the subprocess
    python_path = env.get("PYTHONPATH", "")
    agents_src = str(PRAISONAI_AGENTS_PATH)
    if agents_src not in python_path:
        env["PYTHONPATH"] = f"{agents_src}{os.pathsep}{python_path}" if python_path else agents_src

    try:
        proc = subprocess.run(
            [sys.executable, "-c", script],
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
            cwd=str(PRAISONAI_PATH),
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"PraisonAI subprocess timed out after {timeout}s") from exc

    if proc.returncode != 0:
        stderr_snippet = (proc.stderr or "")[:1000]
        raise RuntimeError(
            f"PraisonAI subprocess exited with code {proc.returncode}: {stderr_snippet}"
        )

    stdout = proc.stdout.strip()
    if not stdout:
        raise RuntimeError("PraisonAI subprocess produced no output")

    # Extract the last JSON object from stdout (skip any logging/warnings)
    lines = stdout.split("\n")
    for line in reversed(lines):
        line = line.strip()
        if line.startswith("{") or line.startswith("["):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue

    raise RuntimeError(f"Could not parse JSON from subprocess output: {stdout[:500]}")


async def _run_in_subprocess_async(script: str, timeout: float = 120.0) -> Dict[str, Any]:
    """Async wrapper around _run_in_subprocess using asyncio executor.

    Args:
        script: Python source code to execute.
        timeout: Maximum execution time in seconds.

    Returns:
        Parsed JSON dict from subprocess stdout.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _run_in_subprocess, script, timeout)


def _serialize_agent_config(
    role: str,
    goal: str,
    backstory: Optional[str] = None,
    tools: Optional[List[str]] = None,
    llm: Optional[str] = None,
    name: Optional[str] = None,
    instructions: Optional[str] = None,
) -> Dict[str, Any]:
    """Build a serializable agent configuration dict.

    Args:
        role: Agent role/job title.
        goal: Primary objective.
        backstory: Background context.
        tools: List of tool names.
        llm: LLM model string.
        name: Agent display name.
        instructions: Direct instructions (overrides role/goal/backstory).

    Returns:
        Dict suitable for JSON serialization and Agent() construction.
    """
    config: Dict[str, Any] = {
        "role": role,
        "goal": goal,
    }
    if name:
        config["name"] = name
    if backstory:
        config["backstory"] = backstory
    if tools:
        config["tools"] = tools
    if llm:
        config["llm"] = llm
    if instructions:
        config["instructions"] = instructions
    return config


# ---------------------------------------------------------------------------
# Bridge operations — async API
# ---------------------------------------------------------------------------

async def create_agent(
    role: str,
    goal: str,
    backstory: Optional[str] = None,
    tools: Optional[List[str]] = None,
    llm: Optional[str] = None,
    name: Optional[str] = None,
    instructions: Optional[str] = None,
) -> BridgeResult:
    """Create a single PraisonAI agent configuration.

    Does not execute the agent — returns a serializable config dict
    that can be passed to run_agents() or used directly.

    Args:
        role: Agent role defining expertise (e.g., "Data Analyst").
        goal: Primary objective the agent aims to achieve.
        backstory: Optional background context shaping personality.
        tools: Optional list of tool names to make available.
        llm: Optional LLM model string (e.g., "gpt-4o", "anthropic/claude-3-sonnet").
        name: Optional display name for the agent.
        instructions: Optional direct instructions (overrides role/goal/backstory).

    Returns:
        BridgeResult with agent config dict in .data on success.

    Example:
        result = await create_agent(
            role="Researcher",
            goal="Find and summarize the latest AI safety papers",
            tools=["internet_search"],
        )
        # result.data == {"role": "Researcher", "goal": "...", "tools": [...]}
    """
    _ensure_initialized()
    start = time.time()

    try:
        config = _serialize_agent_config(
            role=role,
            goal=goal,
            backstory=backstory,
            tools=tools,
            llm=llm,
            name=name,
            instructions=instructions,
        )
        return BridgeResult(
            success=True,
            data=config,
            elapsed_s=time.time() - start,
            metadata={"operation": "create_agent"},
        )
    except Exception as exc:
        logger.error("create_agent failed: %s", exc, exc_info=True)
        return BridgeResult(
            success=False,
            error=str(exc),
            elapsed_s=time.time() - start,
        )


async def create_auto_agents(
    goal_description: str,
    max_agents: int = 3,
    process: str = "sequential",
    llm: Optional[str] = None,
    tools: Optional[List[str]] = None,
) -> BridgeResult:
    """Auto-create agents and tasks from a natural language goal description.

    Uses PraisonAI's AutoAgents to analyze the goal and automatically
    generate appropriate agents with roles, backstories, and tasks.

    Args:
        goal_description: Natural language description of the goal.
        max_agents: Maximum number of agents to create (1-10, default 3).
        process: Execution process type ("sequential" or "hierarchical").
        llm: Optional LLM model for agent generation.
        tools: Optional list of tool names to make available to all agents.

    Returns:
        BridgeResult with auto-generated agent configs in .data on success.
        The .data dict has keys: "agents", "tasks", "process".

    Example:
        result = await create_auto_agents(
            goal_description="Research AI trends and write a blog post about them",
            max_agents=2,
        )
    """
    _ensure_initialized()
    start = time.time()

    if _import_available:
        try:
            result = await _create_auto_agents_direct(
                goal_description, max_agents, process, llm, tools
            )
            result.elapsed_s = time.time() - start
            return result
        except Exception as exc:
            logger.warning(
                "create_auto_agents direct failed (%s), trying subprocess", exc
            )

    # Subprocess fallback
    try:
        result = await _create_auto_agents_subprocess(
            goal_description, max_agents, process, llm, tools
        )
        result.elapsed_s = time.time() - start
        return result
    except Exception as exc:
        logger.error("create_auto_agents failed: %s", exc, exc_info=True)
        return BridgeResult(
            success=False,
            error=str(exc),
            elapsed_s=time.time() - start,
        )


async def _create_auto_agents_direct(
    goal_description: str,
    max_agents: int,
    process: str,
    llm: Optional[str],
    tools: Optional[List[str]],
) -> BridgeResult:
    """Direct-import path for auto agent creation."""
    from praisonaiagents import AutoAgents

    kwargs: Dict[str, Any] = {
        "instructions": goal_description,
        "process": process,
        "max_agents": max_agents,
    }
    if llm:
        kwargs["llm"] = llm

    # AutoAgents generates agents/tasks on construction
    loop = asyncio.get_running_loop()
    auto = await loop.run_in_executor(None, lambda: AutoAgents(**kwargs))

    # Extract agent configs for serialization
    agents_data = []
    for agent in getattr(auto, "agents", []):
        agents_data.append({
            "name": getattr(agent, "name", "Agent"),
            "role": getattr(agent, "role", ""),
            "goal": getattr(agent, "goal", ""),
            "backstory": getattr(agent, "backstory", ""),
        })

    tasks_data = []
    for task in getattr(auto, "tasks", []):
        tasks_data.append({
            "description": getattr(task, "description", ""),
            "expected_output": getattr(task, "expected_output", ""),
        })

    return BridgeResult(
        success=True,
        data={
            "agents": agents_data,
            "tasks": tasks_data,
            "process": process,
            "goal": goal_description,
        },
        metadata={"operation": "create_auto_agents", "method": "direct"},
    )


async def _create_auto_agents_subprocess(
    goal_description: str,
    max_agents: int,
    process: str,
    llm: Optional[str],
    tools: Optional[List[str]],
) -> BridgeResult:
    """Subprocess fallback for auto agent creation."""
    llm_arg = f', llm="{llm}"' if llm else ""
    script = f"""
import json
from praisonaiagents import AutoAgents

auto = AutoAgents(
    instructions={json.dumps(goal_description)},
    process={json.dumps(process)},
    max_agents={max_agents}{llm_arg},
)

agents_data = []
for agent in getattr(auto, "agents", []):
    agents_data.append({{
        "name": getattr(agent, "name", "Agent"),
        "role": getattr(agent, "role", ""),
        "goal": getattr(agent, "goal", ""),
        "backstory": getattr(agent, "backstory", ""),
    }})

tasks_data = []
for task in getattr(auto, "tasks", []):
    tasks_data.append({{
        "description": getattr(task, "description", ""),
        "expected_output": getattr(task, "expected_output", ""),
    }})

print(json.dumps({{
    "agents": agents_data,
    "tasks": tasks_data,
    "process": {json.dumps(process)},
    "goal": {json.dumps(goal_description)},
}}))
"""
    data = await _run_in_subprocess_async(script)
    return BridgeResult(
        success=True,
        data=data,
        metadata={"operation": "create_auto_agents", "method": "subprocess"},
    )


async def run_agents(
    agents_config: List[Dict[str, Any]],
    tasks_config: Optional[List[Dict[str, Any]]] = None,
    process: str = "sequential",
    manager_llm: Optional[str] = None,
    input_text: Optional[str] = None,
) -> BridgeResult:
    """Run a multi-agent workflow with the given agent and task configurations.

    Constructs Agent and Task objects from config dicts, creates an
    AgentManager, and executes the workflow.

    Args:
        agents_config: List of agent config dicts, each with at least
            "role" and "goal" keys. Optional: "name", "backstory",
            "tools", "llm", "instructions".
        tasks_config: Optional list of task config dicts, each with at least
            "description". Optional: "expected_output", "agent_index" (int
            referencing the agents_config list).
        process: Execution strategy — "sequential", "hierarchical", or "parallel".
        manager_llm: Optional LLM model for the manager agent (hierarchical mode).
        input_text: Optional initial input text to pass to the workflow.

    Returns:
        BridgeResult with execution output in .data on success.

    Example:
        result = await run_agents(
            agents_config=[
                {"role": "Researcher", "goal": "Research AI trends"},
                {"role": "Writer", "goal": "Write a blog post"},
            ],
            tasks_config=[
                {"description": "Research the latest AI trends", "agent_index": 0},
                {"description": "Write an article about the findings", "agent_index": 1},
            ],
            process="sequential",
        )
    """
    _ensure_initialized()
    start = time.time()

    if process not in PROCESS_TYPES:
        return BridgeResult(
            success=False,
            error=f"Invalid process type '{process}'. Must be one of: {PROCESS_TYPES}",
            elapsed_s=time.time() - start,
        )

    if _import_available:
        try:
            result = await _run_agents_direct(
                agents_config, tasks_config, process, manager_llm, input_text
            )
            result.elapsed_s = time.time() - start
            return result
        except Exception as exc:
            logger.warning("run_agents direct failed (%s), trying subprocess", exc)

    # Subprocess fallback
    try:
        result = await _run_agents_subprocess(
            agents_config, tasks_config, process, manager_llm, input_text
        )
        result.elapsed_s = time.time() - start
        return result
    except Exception as exc:
        logger.error("run_agents failed: %s", exc, exc_info=True)
        return BridgeResult(
            success=False,
            error=str(exc),
            elapsed_s=time.time() - start,
        )


async def _run_agents_direct(
    agents_config: List[Dict[str, Any]],
    tasks_config: Optional[List[Dict[str, Any]]],
    process: str,
    manager_llm: Optional[str],
    input_text: Optional[str],
) -> BridgeResult:
    """Direct-import execution of a multi-agent workflow."""
    from praisonaiagents import Agent, AgentManager, Task

    # Build Agent objects
    agents = []
    for cfg in agents_config:
        agent_kwargs: Dict[str, Any] = {}
        for key in ("name", "role", "goal", "backstory", "instructions", "llm"):
            if key in cfg and cfg[key] is not None:
                agent_kwargs[key] = cfg[key]
        # Tools are passed as a list of callables/names; for now pass names
        # and let PraisonAI resolve them via its tool registry
        if "tools" in cfg and cfg["tools"]:
            agent_kwargs["tools"] = cfg["tools"]
        agents.append(Agent(**agent_kwargs))

    # Build Task objects
    tasks = []
    if tasks_config:
        for tcfg in tasks_config:
            task_kwargs: Dict[str, Any] = {
                "description": tcfg.get("description", ""),
            }
            if "expected_output" in tcfg:
                task_kwargs["expected_output"] = tcfg["expected_output"]
            # Link task to agent by index
            agent_idx = tcfg.get("agent_index")
            if agent_idx is not None and 0 <= agent_idx < len(agents):
                task_kwargs["agent"] = agents[agent_idx]
            tasks.append(Task(**task_kwargs))

    # Build AgentManager
    manager_kwargs: Dict[str, Any] = {
        "agents": agents,
        "process": process,
    }
    if tasks:
        manager_kwargs["tasks"] = tasks
    if manager_llm:
        manager_kwargs["manager_llm"] = manager_llm

    manager = AgentManager(**manager_kwargs)

    # Execute in a thread to avoid blocking the event loop
    loop = asyncio.get_running_loop()

    def _execute():
        if input_text:
            return manager.start(content=input_text)
        return manager.start()

    output = await loop.run_in_executor(None, _execute)

    # Normalize output to a serializable form
    if isinstance(output, dict):
        data = output
    elif isinstance(output, str):
        data = {"result": output}
    else:
        data = {"result": str(output)}

    return BridgeResult(
        success=True,
        data=data,
        metadata={
            "operation": "run_agents",
            "method": "direct",
            "process": process,
            "num_agents": len(agents),
            "num_tasks": len(tasks),
        },
    )


async def _run_agents_subprocess(
    agents_config: List[Dict[str, Any]],
    tasks_config: Optional[List[Dict[str, Any]]],
    process: str,
    manager_llm: Optional[str],
    input_text: Optional[str],
) -> BridgeResult:
    """Subprocess fallback for multi-agent execution."""
    manager_llm_arg = f', manager_llm="{manager_llm}"' if manager_llm else ""
    input_arg = f", content={json.dumps(input_text)}" if input_text else ""
    script = f"""
import json
from praisonaiagents import Agent, AgentManager, Task

agents_config = {json.dumps(agents_config)}
tasks_config = {json.dumps(tasks_config or [])}

agents = []
for cfg in agents_config:
    kwargs = {{}}
    for key in ("name", "role", "goal", "backstory", "instructions", "llm"):
        if key in cfg and cfg[key] is not None:
            kwargs[key] = cfg[key]
    if "tools" in cfg and cfg["tools"]:
        kwargs["tools"] = cfg["tools"]
    agents.append(Agent(**kwargs))

tasks = []
for tcfg in tasks_config:
    task_kwargs = {{"description": tcfg.get("description", "")}}
    if "expected_output" in tcfg:
        task_kwargs["expected_output"] = tcfg["expected_output"]
    agent_idx = tcfg.get("agent_index")
    if agent_idx is not None and 0 <= agent_idx < len(agents):
        task_kwargs["agent"] = agents[agent_idx]
    tasks.append(Task(**task_kwargs))

manager_kwargs = {{"agents": agents, "process": {json.dumps(process)}}}
if tasks:
    manager_kwargs["tasks"] = tasks
{f'manager_kwargs["manager_llm"] = "{manager_llm}"' if manager_llm else ""}

manager = AgentManager(**manager_kwargs)
output = manager.start({input_arg.lstrip(", ")})

if isinstance(output, dict):
    print(json.dumps(output, default=str))
else:
    print(json.dumps({{"result": str(output)}}))
"""
    data = await _run_in_subprocess_async(script, timeout=300.0)
    return BridgeResult(
        success=True,
        data=data,
        metadata={
            "operation": "run_agents",
            "method": "subprocess",
            "process": process,
        },
    )


async def run_workflow(
    steps: List[Dict[str, Any]],
    input_text: str = "",
    variables: Optional[Dict[str, Any]] = None,
    process: str = "sequential",
) -> BridgeResult:
    """Run a PraisonAI workflow with route/parallel/loop/repeat primitives.

    Steps are specified as dicts with a "type" key indicating the step kind:
      - {"type": "agent", "instructions": "...", "role": "...", "goal": "..."}
      - {"type": "route", "routes": {"approve": [...], "reject": [...]}}
      - {"type": "parallel", "steps": [...]}
      - {"type": "loop", "steps": [...], "condition": "...", "max_iterations": 5}
      - {"type": "repeat", "steps": [...], "times": 3}

    Args:
        steps: List of step configuration dicts.
        input_text: Initial input for the workflow.
        variables: Optional dict of workflow-level variables.
        process: Process type — "sequential" or "hierarchical".

    Returns:
        BridgeResult with workflow execution results in .data.

    Example:
        result = await run_workflow(
            steps=[
                {"type": "agent", "instructions": "Classify the request"},
                {"type": "route", "routes": {
                    "technical": [{"type": "agent", "instructions": "Answer technically"}],
                    "default": [{"type": "agent", "instructions": "Give general answer"}],
                }},
            ],
            input_text="How does gradient descent work?",
        )
    """
    _ensure_initialized()
    start = time.time()

    if _import_available:
        try:
            result = await _run_workflow_direct(steps, input_text, variables, process)
            result.elapsed_s = time.time() - start
            return result
        except Exception as exc:
            logger.warning("run_workflow direct failed (%s), trying subprocess", exc)

    try:
        result = await _run_workflow_subprocess(steps, input_text, variables, process)
        result.elapsed_s = time.time() - start
        return result
    except Exception as exc:
        logger.error("run_workflow failed: %s", exc, exc_info=True)
        return BridgeResult(
            success=False,
            error=str(exc),
            elapsed_s=time.time() - start,
        )


def _build_workflow_step(step_config: Dict[str, Any]) -> Any:
    """Recursively build a PraisonAI workflow step from a config dict.

    Converts serialized step dicts into actual Agent, Route, Parallel,
    Loop, and Repeat objects for use with the Workflow engine.

    Args:
        step_config: Dict with "type" key and type-specific parameters.

    Returns:
        A PraisonAI step object (Agent, Route, Parallel, Loop, or Repeat).

    Raises:
        ValueError: If the step type is unrecognized.
    """
    from praisonaiagents import Agent
    from praisonaiagents.workflows import Route, Parallel, Loop, Repeat

    step_type = step_config.get("type", "agent")

    if step_type == "agent":
        agent_kwargs = {}
        for key in ("name", "role", "goal", "backstory", "instructions", "llm"):
            if key in step_config and step_config[key] is not None:
                agent_kwargs[key] = step_config[key]
        if "tools" in step_config and step_config["tools"]:
            agent_kwargs["tools"] = step_config["tools"]
        return Agent(**agent_kwargs)

    elif step_type == "route":
        routes_raw = step_config.get("routes", {})
        routes = {}
        for key, sub_steps in routes_raw.items():
            routes[key] = [_build_workflow_step(s) for s in sub_steps]
        default = step_config.get("default")
        if default:
            default = [_build_workflow_step(s) for s in default]
        return Route(routes=routes, default=default)

    elif step_type == "parallel":
        sub_steps = [_build_workflow_step(s) for s in step_config.get("steps", [])]
        return Parallel(steps=sub_steps)

    elif step_type == "loop":
        sub_steps = [_build_workflow_step(s) for s in step_config.get("steps", [])]
        return Loop(
            steps=sub_steps,
            condition=step_config.get("condition"),
            max_iterations=step_config.get("max_iterations", 10),
        )

    elif step_type == "repeat":
        sub_steps = [_build_workflow_step(s) for s in step_config.get("steps", [])]
        return Repeat(
            steps=sub_steps,
            times=step_config.get("times", 1),
        )

    else:
        raise ValueError(f"Unknown workflow step type: '{step_type}'")


async def _run_workflow_direct(
    steps: List[Dict[str, Any]],
    input_text: str,
    variables: Optional[Dict[str, Any]],
    process: str,
) -> BridgeResult:
    """Direct-import execution of a workflow."""
    from praisonaiagents import Workflow

    built_steps = [_build_workflow_step(s) for s in steps]

    workflow_kwargs: Dict[str, Any] = {
        "steps": built_steps,
        "process": process,
    }
    if variables:
        workflow_kwargs["variables"] = variables

    workflow = Workflow(**workflow_kwargs)

    loop = asyncio.get_running_loop()
    output = await loop.run_in_executor(None, lambda: workflow.start(input=input_text))

    # Normalize output
    if isinstance(output, dict):
        data = output
    else:
        data = {"result": str(output)}

    return BridgeResult(
        success=True,
        data=data,
        metadata={
            "operation": "run_workflow",
            "method": "direct",
            "num_steps": len(steps),
        },
    )


async def _run_workflow_subprocess(
    steps: List[Dict[str, Any]],
    input_text: str,
    variables: Optional[Dict[str, Any]],
    process: str,
) -> BridgeResult:
    """Subprocess fallback for workflow execution."""
    script = f"""
import json
from praisonaiagents import Agent, Workflow
from praisonaiagents.workflows import Route, Parallel, Loop, Repeat

def build_step(cfg):
    step_type = cfg.get("type", "agent")
    if step_type == "agent":
        kwargs = {{}}
        for key in ("name", "role", "goal", "backstory", "instructions", "llm"):
            if key in cfg and cfg[key] is not None:
                kwargs[key] = cfg[key]
        if "tools" in cfg and cfg["tools"]:
            kwargs["tools"] = cfg["tools"]
        return Agent(**kwargs)
    elif step_type == "route":
        routes = {{}}
        for k, v in cfg.get("routes", {{}}).items():
            routes[k] = [build_step(s) for s in v]
        default = cfg.get("default")
        if default:
            default = [build_step(s) for s in default]
        return Route(routes=routes, default=default)
    elif step_type == "parallel":
        return Parallel(steps=[build_step(s) for s in cfg.get("steps", [])])
    elif step_type == "loop":
        return Loop(
            steps=[build_step(s) for s in cfg.get("steps", [])],
            condition=cfg.get("condition"),
            max_iterations=cfg.get("max_iterations", 10),
        )
    elif step_type == "repeat":
        return Repeat(
            steps=[build_step(s) for s in cfg.get("steps", [])],
            times=cfg.get("times", 1),
        )
    else:
        raise ValueError(f"Unknown step type: {{step_type}}")

steps_cfg = {json.dumps(steps)}
built_steps = [build_step(s) for s in steps_cfg]

workflow_kwargs = {{"steps": built_steps, "process": {json.dumps(process)}}}
variables = {json.dumps(variables or {})}
if variables:
    workflow_kwargs["variables"] = variables

workflow = Workflow(**workflow_kwargs)
output = workflow.start(input={json.dumps(input_text)})

if isinstance(output, dict):
    print(json.dumps(output, default=str))
else:
    print(json.dumps({{"result": str(output)}}))
"""
    data = await _run_in_subprocess_async(script, timeout=300.0)
    return BridgeResult(
        success=True,
        data=data,
        metadata={"operation": "run_workflow", "method": "subprocess"},
    )


async def search_knowledge(
    query: str,
    collection: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = 10,
) -> BridgeResult:
    """Search the PraisonAI knowledge base using RAG.

    Performs vector similarity search over stored knowledge using
    PraisonAI's Knowledge class backed by ChromaDB, Mem0, or MongoDB.

    Args:
        query: Natural language search query.
        collection: Optional collection name to search within.
        user_id: Optional user ID to scope the search.
        limit: Maximum number of results to return (default 10).

    Returns:
        BridgeResult with search results list in .data.

    Example:
        result = await search_knowledge(
            query="How to implement authentication in FastAPI?",
            limit=5,
        )
    """
    _ensure_initialized()
    start = time.time()

    if _import_available:
        try:
            result = await _search_knowledge_direct(query, collection, user_id, limit)
            result.elapsed_s = time.time() - start
            return result
        except Exception as exc:
            logger.warning("search_knowledge direct failed (%s), trying subprocess", exc)

    try:
        result = await _search_knowledge_subprocess(query, collection, user_id, limit)
        result.elapsed_s = time.time() - start
        return result
    except Exception as exc:
        logger.error("search_knowledge failed: %s", exc, exc_info=True)
        return BridgeResult(
            success=False,
            error=str(exc),
            elapsed_s=time.time() - start,
        )


async def _search_knowledge_direct(
    query: str,
    collection: Optional[str],
    user_id: Optional[str],
    limit: int,
) -> BridgeResult:
    """Direct-import knowledge search."""
    from praisonaiagents import Knowledge

    config = None
    if collection:
        config = {
            "vector_store": {
                "provider": "chroma",
                "config": {
                    "collection_name": collection,
                    "path": ".praison",
                },
            }
        }

    knowledge = Knowledge(config=config)

    loop = asyncio.get_running_loop()
    search_kwargs: Dict[str, Any] = {"query": query, "limit": limit}
    if user_id:
        search_kwargs["user_id"] = user_id

    results = await loop.run_in_executor(None, lambda: knowledge.search(**search_kwargs))

    # Normalize results to serializable form
    if isinstance(results, list):
        data = results
    elif isinstance(results, dict):
        data = results.get("results", results)
    else:
        data = [str(results)]

    return BridgeResult(
        success=True,
        data={"results": data, "query": query, "count": len(data) if isinstance(data, list) else 1},
        metadata={"operation": "search_knowledge", "method": "direct"},
    )


async def _search_knowledge_subprocess(
    query: str,
    collection: Optional[str],
    user_id: Optional[str],
    limit: int,
) -> BridgeResult:
    """Subprocess fallback for knowledge search."""
    config_str = "None"
    if collection:
        config_str = json.dumps({
            "vector_store": {
                "provider": "chroma",
                "config": {
                    "collection_name": collection,
                    "path": ".praison",
                },
            }
        })

    user_id_arg = f', user_id="{user_id}"' if user_id else ""
    script = f"""
import json
from praisonaiagents import Knowledge

config = {config_str}
knowledge = Knowledge(config=config)
results = knowledge.search(
    query={json.dumps(query)},
    limit={limit}{user_id_arg}
)

if isinstance(results, list):
    data = results
elif isinstance(results, dict):
    data = results.get("results", results)
else:
    data = [str(results)]

print(json.dumps({{"results": data, "query": {json.dumps(query)}, "count": len(data) if isinstance(data, list) else 1}}, default=str))
"""
    data = await _run_in_subprocess_async(script)
    return BridgeResult(
        success=True,
        data=data,
        metadata={"operation": "search_knowledge", "method": "subprocess"},
    )


async def add_knowledge(
    content: Union[str, List[str]],
    metadata: Optional[Dict[str, Any]] = None,
    collection: Optional[str] = None,
    user_id: Optional[str] = None,
) -> BridgeResult:
    """Add content to the PraisonAI knowledge base.

    Accepts text strings, file paths, or URLs. Content is chunked,
    embedded, and indexed for later retrieval via search_knowledge().

    Args:
        content: Text content, file path, URL, or list thereof.
        metadata: Optional metadata dict to attach to the knowledge entries.
        collection: Optional collection name (creates new if needed).
        user_id: Optional user ID to scope the knowledge.

    Returns:
        BridgeResult with storage confirmation in .data.

    Example:
        result = await add_knowledge(
            content="FastAPI uses Python type hints for automatic validation.",
            metadata={"source": "documentation", "topic": "fastapi"},
        )
    """
    _ensure_initialized()
    start = time.time()

    if _import_available:
        try:
            result = await _add_knowledge_direct(content, metadata, collection, user_id)
            result.elapsed_s = time.time() - start
            return result
        except Exception as exc:
            logger.warning("add_knowledge direct failed (%s), trying subprocess", exc)

    try:
        result = await _add_knowledge_subprocess(content, metadata, collection, user_id)
        result.elapsed_s = time.time() - start
        return result
    except Exception as exc:
        logger.error("add_knowledge failed: %s", exc, exc_info=True)
        return BridgeResult(
            success=False,
            error=str(exc),
            elapsed_s=time.time() - start,
        )


async def _add_knowledge_direct(
    content: Union[str, List[str]],
    metadata: Optional[Dict[str, Any]],
    collection: Optional[str],
    user_id: Optional[str],
) -> BridgeResult:
    """Direct-import knowledge addition."""
    from praisonaiagents import Knowledge

    config = None
    if collection:
        config = {
            "vector_store": {
                "provider": "chroma",
                "config": {
                    "collection_name": collection,
                    "path": ".praison",
                },
            }
        }

    knowledge = Knowledge(config=config)

    loop = asyncio.get_running_loop()

    # Determine if content looks like file paths or raw text
    if isinstance(content, list):
        # Multiple items — could be file paths or text strings
        result_data = await loop.run_in_executor(
            None,
            lambda: knowledge.add(content, user_id=user_id, metadata=metadata),
        )
    elif isinstance(content, str) and (
        content.startswith("http") or Path(content).suffix in (".pdf", ".doc", ".docx", ".txt", ".md")
    ):
        # File path or URL
        result_data = await loop.run_in_executor(
            None,
            lambda: knowledge.add(content, user_id=user_id, metadata=metadata),
        )
    else:
        # Raw text content
        result_data = await loop.run_in_executor(
            None,
            lambda: knowledge.store(content, user_id=user_id, metadata=metadata),
        )

    return BridgeResult(
        success=True,
        data={"stored": True, "details": result_data if isinstance(result_data, (dict, list)) else str(result_data)},
        metadata={"operation": "add_knowledge", "method": "direct"},
    )


async def _add_knowledge_subprocess(
    content: Union[str, List[str]],
    metadata: Optional[Dict[str, Any]],
    collection: Optional[str],
    user_id: Optional[str],
) -> BridgeResult:
    """Subprocess fallback for knowledge addition."""
    config_str = "None"
    if collection:
        config_str = json.dumps({
            "vector_store": {
                "provider": "chroma",
                "config": {
                    "collection_name": collection,
                    "path": ".praison",
                },
            }
        })

    user_id_arg = f', user_id="{user_id}"' if user_id else ""
    metadata_arg = f", metadata={json.dumps(metadata)}" if metadata else ""

    is_file = False
    if isinstance(content, str) and (
        content.startswith("http") or Path(content).suffix in (".pdf", ".doc", ".docx", ".txt", ".md")
    ):
        is_file = True

    if is_file or isinstance(content, list):
        method = "add"
    else:
        method = "store"

    script = f"""
import json
from praisonaiagents import Knowledge

config = {config_str}
knowledge = Knowledge(config=config)

content = {json.dumps(content)}
result = knowledge.{method}(content{user_id_arg}{metadata_arg})
print(json.dumps({{"stored": True, "details": str(result)}}))
"""
    data = await _run_in_subprocess_async(script)
    return BridgeResult(
        success=True,
        data=data,
        metadata={"operation": "add_knowledge", "method": "subprocess"},
    )


async def list_tools() -> BridgeResult:
    """List all available built-in PraisonAI tools.

    Returns the names and descriptions of the 100+ built-in tools
    available in PraisonAI, including internet search, file operations,
    shell execution, web crawling, and specialized domain tools.

    Returns:
        BridgeResult with a list of tool info dicts in .data.

    Example:
        result = await list_tools()
        for tool in result.data["tools"]:
            print(f"{tool['name']}: {tool['source']}")
    """
    _ensure_initialized()
    start = time.time()

    # Built-in tool modules that ship with praisonaiagents
    builtin_tools = [
        {"name": "internet_search", "source": "duckduckgo_tools", "description": "Web search via DuckDuckGo"},
        {"name": "tavily_search", "source": "tavily_tools", "description": "Web search via Tavily API"},
        {"name": "exa_search", "source": "exa_tools", "description": "Neural search via Exa API"},
        {"name": "searxng_search", "source": "searxng_tools", "description": "Privacy-focused meta-search via SearXNG"},
        {"name": "youdotcom_search", "source": "youdotcom_tools", "description": "Web search via You.com API"},
        {"name": "web_search", "source": "web_search", "description": "General web search dispatcher"},
        {"name": "web_crawl", "source": "web_crawl", "description": "Web page crawling and content extraction"},
        {"name": "crawl4ai", "source": "crawl4ai_tools", "description": "Advanced web crawling with AI extraction"},
        {"name": "spider_crawl", "source": "spider_tools", "description": "Spider-based web crawling"},
        {"name": "file_read", "source": "file_tools", "description": "Read file contents"},
        {"name": "file_write", "source": "file_tools", "description": "Write file contents"},
        {"name": "file_list", "source": "file_tools", "description": "List directory contents"},
        {"name": "shell_exec", "source": "shell_tools", "description": "Execute shell commands"},
        {"name": "python_exec", "source": "python_tools", "description": "Execute Python code safely"},
        {"name": "rules_tools", "source": "rules_tools", "description": "Rule-based tool execution"},
        {"name": "skill_tools", "source": "skill_tools", "description": "Skill-based tool execution"},
        {"name": "subagent", "source": "subagent_tool", "description": "Delegate to sub-agents"},
    ]

    # If direct import is available, also check the tool registry
    if _import_available:
        try:
            from praisonaiagents.tools.registry import get_registry
            registry = get_registry()
            registered = registry.list_all() if hasattr(registry, "list_all") else []
            for tool_entry in registered:
                name = getattr(tool_entry, "name", str(tool_entry))
                if not any(t["name"] == name for t in builtin_tools):
                    builtin_tools.append({
                        "name": name,
                        "source": "registry",
                        "description": getattr(tool_entry, "description", "Registered tool"),
                    })
        except Exception as exc:
            logger.debug("Could not query tool registry: %s", exc)

    return BridgeResult(
        success=True,
        data={"tools": builtin_tools, "count": len(builtin_tools)},
        elapsed_s=time.time() - start,
        metadata={"operation": "list_tools"},
    )


async def plan_task(
    goal: str,
    codebase_path: Optional[str] = None,
    llm: Optional[str] = None,
    read_only: bool = True,
) -> BridgeResult:
    """Run PraisonAI's planning mode to analyze a goal and produce an action plan.

    Uses PlanningAgent to research the codebase (if provided), analyze
    the goal, and produce a structured step-by-step implementation plan
    without actually executing any changes.

    Args:
        goal: Natural language description of what needs to be accomplished.
        codebase_path: Optional path to the codebase for context-aware planning.
        llm: Optional LLM model for the planning agent.
        read_only: Whether to restrict to read-only tools (default True).

    Returns:
        BridgeResult with the plan in .data containing "steps", "summary",
        and "analysis" keys.

    Example:
        result = await plan_task(
            goal="Add rate limiting to the FastAPI application",
            codebase_path="/path/to/project",
        )
        for step in result.data["steps"]:
            print(f"- {step['description']}")
    """
    _ensure_initialized()
    start = time.time()

    if _import_available:
        try:
            result = await _plan_task_direct(goal, codebase_path, llm, read_only)
            result.elapsed_s = time.time() - start
            return result
        except Exception as exc:
            logger.warning("plan_task direct failed (%s), trying subprocess", exc)

    try:
        result = await _plan_task_subprocess(goal, codebase_path, llm, read_only)
        result.elapsed_s = time.time() - start
        return result
    except Exception as exc:
        logger.error("plan_task failed: %s", exc, exc_info=True)
        return BridgeResult(
            success=False,
            error=str(exc),
            elapsed_s=time.time() - start,
        )


async def _plan_task_direct(
    goal: str,
    codebase_path: Optional[str],
    llm: Optional[str],
    read_only: bool,
) -> BridgeResult:
    """Direct-import planning execution."""
    from praisonaiagents import Agent, AgentManager, Task

    # Create a planning-focused agent
    planner_kwargs: Dict[str, Any] = {
        "name": "Planner",
        "role": "Implementation Planner",
        "goal": f"Create a detailed implementation plan for: {goal}",
        "backstory": (
            "You are an expert software architect and planner. You analyze goals, "
            "research codebases, and produce detailed, actionable step-by-step "
            "implementation plans. You do NOT execute changes — only plan them."
        ),
        "planning": True,
    }
    if llm:
        planner_kwargs["llm"] = llm

    planner = Agent(**planner_kwargs)

    task_description = f"Analyze the following goal and create a detailed implementation plan:\n\n{goal}"
    if codebase_path:
        task_description += f"\n\nCodebase location: {codebase_path}"

    task = Task(
        description=task_description,
        expected_output=(
            "A structured implementation plan with: "
            "1) Analysis of the goal, "
            "2) Step-by-step plan with descriptions, "
            "3) Estimated complexity for each step, "
            "4) Dependencies between steps, "
            "5) Potential risks or considerations."
        ),
        agent=planner,
    )

    manager = AgentManager(
        agents=[planner],
        tasks=[task],
        process="sequential",
    )

    loop = asyncio.get_running_loop()
    output = await loop.run_in_executor(None, manager.start)

    # Parse output into structured plan
    if isinstance(output, dict):
        plan_data = output
    elif isinstance(output, str):
        plan_data = {
            "plan": output,
            "goal": goal,
        }
    else:
        plan_data = {"plan": str(output), "goal": goal}

    if codebase_path:
        plan_data["codebase_path"] = codebase_path

    return BridgeResult(
        success=True,
        data=plan_data,
        metadata={"operation": "plan_task", "method": "direct", "read_only": read_only},
    )


async def _plan_task_subprocess(
    goal: str,
    codebase_path: Optional[str],
    llm: Optional[str],
    read_only: bool,
) -> BridgeResult:
    """Subprocess fallback for planning."""
    llm_arg = f', llm="{llm}"' if llm else ""
    codebase_line = f'\n\nCodebase location: {codebase_path}' if codebase_path else ""

    script = f"""
import json
from praisonaiagents import Agent, AgentManager, Task

planner = Agent(
    name="Planner",
    role="Implementation Planner",
    goal="Create a detailed implementation plan for: " + {json.dumps(goal)},
    backstory="You are an expert software architect and planner. You analyze goals and produce detailed step-by-step implementation plans. You do NOT execute changes.",
    planning=True{llm_arg},
)

task = Task(
    description={json.dumps(f"Analyze the following goal and create a detailed implementation plan:\\n\\n{goal}{codebase_line}")},
    expected_output="A structured implementation plan with analysis, steps, complexity, dependencies, and risks.",
    agent=planner,
)

manager = AgentManager(
    agents=[planner],
    tasks=[task],
    process="sequential",
)
output = manager.start()

if isinstance(output, dict):
    output["goal"] = {json.dumps(goal)}
    print(json.dumps(output, default=str))
else:
    print(json.dumps({{"plan": str(output), "goal": {json.dumps(goal)}}}))
"""
    data = await _run_in_subprocess_async(script, timeout=180.0)
    return BridgeResult(
        success=True,
        data=data,
        metadata={"operation": "plan_task", "method": "subprocess", "read_only": read_only},
    )


# ---------------------------------------------------------------------------
# Unified execute() dispatcher (for ToolRegistry.execute())
# ---------------------------------------------------------------------------

async def execute(operation: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Dispatch an operation by name — called by ToolRegistry.execute().

    This is the unified entry point used by the registry to route
    requests to the appropriate bridge function.

    Args:
        operation: Name of the operation (e.g., "create_agent", "run_workflow").
        params: Dict of keyword arguments to pass to the operation function.

    Returns:
        Dict with "success", "data"/"error", and "elapsed_s" keys.
    """
    _ensure_initialized()

    dispatch: Dict[str, Any] = {
        "create_agent": create_agent,
        "create_auto_agents": create_auto_agents,
        "run_agents": run_agents,
        "run_workflow": run_workflow,
        "search_knowledge": search_knowledge,
        "add_knowledge": add_knowledge,
        "list_tools": list_tools,
        "plan_task": plan_task,
    }

    func = dispatch.get(operation)
    if func is None:
        return {
            "success": False,
            "error": f"Unknown operation '{operation}'. Available: {list(dispatch.keys())}",
        }

    try:
        # list_tools takes no params
        if operation == "list_tools":
            result = await func()
        else:
            result = await func(**params)

        return {
            "success": result.success,
            "data": result.data,
            "error": result.error,
            "elapsed_s": result.elapsed_s,
            "metadata": result.metadata,
        }
    except TypeError as exc:
        return {
            "success": False,
            "error": f"Invalid parameters for '{operation}': {exc}",
        }
    except Exception as exc:
        logger.error("execute(%s) failed: %s", operation, exc, exc_info=True)
        return {
            "success": False,
            "error": str(exc),
        }
