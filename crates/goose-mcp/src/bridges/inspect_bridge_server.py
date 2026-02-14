#!/usr/bin/env python3
"""
AI Inspect MCP Bridge Server for Super-Goose.

Wraps the Inspect AI evaluation framework for running LLM benchmarks,
eval suites, and scoring via MCP stdio protocol.

Install: pip install mcp inspect-ai
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

BRIDGE_NAME = "inspect_bridge"
BRIDGE_DESCRIPTION = "AI Inspect evaluation framework for LLM benchmarks and scoring"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    from inspect_ai import eval as inspect_eval, Task
    from inspect_ai.dataset import Sample
    from inspect_ai.scorer import model_graded_fact
    from inspect_ai.solver import generate
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("inspect-ai not installed. Install: pip install inspect-ai")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="inspect_run_eval",
            description="Run an Inspect AI evaluation task with samples and scoring",
            inputSchema={
                "type": "object",
                "properties": {
                    "samples": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "input": {"type": "string"},
                                "target": {"type": "string"},
                            },
                            "required": ["input", "target"],
                        },
                        "description": "Evaluation samples with input prompts and expected targets",
                    },
                    "model": {
                        "type": "string",
                        "description": "Model to evaluate (e.g., 'openai/gpt-4')",
                        "default": "openai/gpt-4",
                    },
                    "scorer": {
                        "type": "string",
                        "description": "Scoring method: model_graded_fact, exact_match, includes",
                        "default": "model_graded_fact",
                    },
                },
                "required": ["samples"],
            },
        ),
        Tool(
            name="inspect_list_tasks",
            description="List available Inspect evaluation tasks from a directory",
            inputSchema={
                "type": "object",
                "properties": {
                    "directory": {
                        "type": "string",
                        "description": "Directory containing .py eval task files",
                        "default": ".",
                    },
                },
            },
        ),
        Tool(
            name="inspect_status",
            description="Check Inspect AI bridge availability and version",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "inspect_run_eval":
            result = await _run_eval(arguments)
        elif name == "inspect_list_tasks":
            result = await _list_tasks(arguments)
        elif name == "inspect_status":
            result = await _handle_status()
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _run_eval(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "inspect-ai not installed"}

    samples_data = args["samples"]
    model = args.get("model", "openai/gpt-4")

    try:
        samples = [
            Sample(input=s["input"], target=s["target"])
            for s in samples_data
        ]
        task = Task(
            dataset=samples,
            plan=[generate()],
            scorer=model_graded_fact(),
        )
        logs = inspect_eval(task, model=model)
        log = logs[0]
        return {
            "status": "success",
            "model": model,
            "samples": len(samples_data),
            "results": {
                "status": str(log.status),
                "eval_id": log.eval.run_id if log.eval else None,
            },
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _list_tasks(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "inspect-ai not installed"}

    import os
    directory = args.get("directory", ".")
    try:
        py_files = [f for f in os.listdir(directory) if f.endswith(".py")]
        return {
            "status": "success",
            "directory": directory,
            "task_files": py_files,
            "count": len(py_files),
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _handle_status() -> dict[str, Any]:
    return {
        "bridge": BRIDGE_NAME,
        "version": BRIDGE_VERSION,
        "description": BRIDGE_DESCRIPTION,
        "library_available": _LIB_AVAILABLE,
        "status": "ready" if _LIB_AVAILABLE else "library_missing",
    }


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
