#!/usr/bin/env python3
"""
TaskWeaver MCP Bridge Server for Super-Goose.

Wraps TaskWeaver for code-first agent task planning and execution,
exposing task planning and plan execution via MCP stdio protocol.

Install: pip install mcp taskweaver
"""

import asyncio
import json
import logging
import sys
from typing import Any

try:
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp.types import Tool, TextContent
except ImportError:
    print("Error: MCP SDK not installed. Run: pip install mcp", file=sys.stderr)
    sys.exit(1)

BRIDGE_NAME = "taskweaver_bridge"
BRIDGE_DESCRIPTION = "TaskWeaver code-first agent task planning and execution"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    from taskweaver.app.app import TaskWeaverApp
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("taskweaver not installed. Install: pip install taskweaver")

_app_instance = None

server = Server(BRIDGE_NAME)


def _get_app(app_dir: str = "") -> Any:
    """Lazily initialize TaskWeaver app."""
    global _app_instance
    if _app_instance is None and _LIB_AVAILABLE:
        _app_instance = TaskWeaverApp(app_dir=app_dir or ".")
    return _app_instance


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="taskweaver_plan_task",
            description="Create a step-by-step execution plan for a complex task",
            inputSchema={
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "Task description to plan",
                    },
                    "constraints": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Constraints or requirements for the plan",
                        "default": [],
                    },
                    "app_dir": {
                        "type": "string",
                        "description": "TaskWeaver app directory with config",
                        "default": "",
                    },
                },
                "required": ["task"],
            },
        ),
        Tool(
            name="taskweaver_execute_plan",
            description="Execute a TaskWeaver plan, generating and running code for each step",
            inputSchema={
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "Task to plan and execute end-to-end",
                    },
                    "app_dir": {
                        "type": "string",
                        "description": "TaskWeaver app directory with config",
                        "default": "",
                    },
                    "max_rounds": {
                        "type": "integer",
                        "description": "Maximum conversation rounds",
                        "default": 5,
                    },
                },
                "required": ["task"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "taskweaver_plan_task":
            result = await _plan_task(arguments)
        elif name == "taskweaver_execute_plan":
            result = await _execute_plan(arguments)
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _plan_task(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "taskweaver not installed"}

    task = args["task"]
    constraints = args.get("constraints", [])
    app_dir = args.get("app_dir", "")

    try:
        app = _get_app(app_dir)
        session = app.get_session()
        prompt = task
        if constraints:
            prompt += "\nConstraints: " + "; ".join(constraints)

        response = session.send_message(prompt)
        return {
            "status": "success",
            "task": task,
            "constraints": constraints,
            "plan": str(response),
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _execute_plan(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "taskweaver not installed"}

    task = args["task"]
    app_dir = args.get("app_dir", "")
    max_rounds = args.get("max_rounds", 5)

    try:
        app = _get_app(app_dir)
        session = app.get_session()
        response = session.send_message(task)

        rounds = [str(response)]
        for _ in range(max_rounds - 1):
            if hasattr(response, "is_complete") and response.is_complete:
                break
            response = session.send_message("continue")
            rounds.append(str(response))

        return {
            "status": "success",
            "task": task,
            "rounds": len(rounds),
            "result": rounds[-1] if rounds else "No output",
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
