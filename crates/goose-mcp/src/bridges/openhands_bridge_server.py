#!/usr/bin/env python3
"""
OpenHands MCP Bridge Server for Super-Goose.

Wraps OpenHands (formerly OpenDevin) AI coding agent for autonomous
code editing, bug fixing, and feature implementation via MCP stdio protocol.

Install: pip install mcp openhands-ai
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

BRIDGE_NAME = "openhands_bridge"
BRIDGE_DESCRIPTION = "OpenHands AI coding agent for autonomous code editing"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    import openhands
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("openhands not installed. Install: pip install openhands-ai")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="openhands_solve_issue",
            description="Use OpenHands agent to autonomously solve a coding issue",
            inputSchema={
                "type": "object",
                "properties": {
                    "issue_description": {
                        "type": "string",
                        "description": "Description of the coding issue or bug to fix",
                    },
                    "repo_path": {
                        "type": "string",
                        "description": "Path to the repository to work on",
                    },
                    "model": {
                        "type": "string",
                        "description": "LLM model to use for the agent",
                        "default": "gpt-4",
                    },
                    "max_iterations": {
                        "type": "integer",
                        "description": "Maximum number of agent iterations",
                        "default": 30,
                    },
                },
                "required": ["issue_description", "repo_path"],
            },
        ),
        Tool(
            name="openhands_implement_feature",
            description="Use OpenHands agent to implement a new feature",
            inputSchema={
                "type": "object",
                "properties": {
                    "feature_spec": {
                        "type": "string",
                        "description": "Specification of the feature to implement",
                    },
                    "repo_path": {
                        "type": "string",
                        "description": "Path to the repository",
                    },
                    "files_to_modify": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional list of files to focus on",
                        "default": [],
                    },
                },
                "required": ["feature_spec", "repo_path"],
            },
        ),
        Tool(
            name="openhands_status",
            description="Check OpenHands bridge availability",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "openhands_solve_issue":
            result = await _solve_issue(arguments)
        elif name == "openhands_implement_feature":
            result = await _implement_feature(arguments)
        elif name == "openhands_status":
            result = await _handle_status()
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _solve_issue(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "openhands-ai not installed"}

    issue = args["issue_description"]
    repo_path = args["repo_path"]
    model = args.get("model", "gpt-4")
    max_iter = args.get("max_iterations", 30)

    try:
        from openhands.core.config import AppConfig
        from openhands.core.main import create_runtime, run_controller

        config = AppConfig()
        config.workspace_base = repo_path
        config.max_iterations = max_iter

        runtime = create_runtime(config)
        state = await run_controller(
            config=config,
            initial_user_action=issue,
            runtime=runtime,
        )
        return {
            "status": "success",
            "issue": issue[:100],
            "repo": repo_path,
            "iterations": state.iteration if state else 0,
            "result": str(state.outputs) if state and hasattr(state, "outputs") else "completed",
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _implement_feature(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "openhands-ai not installed"}

    spec = args["feature_spec"]
    repo_path = args["repo_path"]
    files = args.get("files_to_modify", [])

    try:
        from openhands.core.config import AppConfig
        from openhands.core.main import create_runtime, run_controller

        config = AppConfig()
        config.workspace_base = repo_path

        prompt = f"Implement the following feature:\n{spec}"
        if files:
            prompt += f"\n\nFocus on these files: {', '.join(files)}"

        runtime = create_runtime(config)
        state = await run_controller(
            config=config,
            initial_user_action=prompt,
            runtime=runtime,
        )
        return {
            "status": "success",
            "feature": spec[:100],
            "repo": repo_path,
            "files_targeted": files,
            "result": str(state.outputs) if state and hasattr(state, "outputs") else "completed",
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
