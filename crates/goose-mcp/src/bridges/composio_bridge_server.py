#!/usr/bin/env python3
"""
Composio MCP Bridge Server for Super-Goose.

Wraps the Composio platform for tool/action execution, exposing action
listing and execution via MCP stdio protocol.

Install: pip install mcp composio-core
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

BRIDGE_NAME = "composio_bridge"
BRIDGE_DESCRIPTION = "Composio tool/action orchestration platform"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    from composio import ComposioToolSet, Action
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("composio not installed. Install: pip install composio-core")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="composio_execute_action",
            description="Execute a Composio action (e.g., GitHub create issue, Slack send message)",
            inputSchema={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "description": "Action name (e.g., 'GITHUB_CREATE_ISSUE', 'SLACK_SEND_MESSAGE')",
                    },
                    "params": {
                        "type": "object",
                        "description": "Action parameters as key-value pairs",
                        "default": {},
                    },
                    "entity_id": {
                        "type": "string",
                        "description": "Entity ID for the connected account",
                        "default": "default",
                    },
                },
                "required": ["action"],
            },
        ),
        Tool(
            name="composio_list_actions",
            description="List available Composio actions, optionally filtered by app",
            inputSchema={
                "type": "object",
                "properties": {
                    "app": {
                        "type": "string",
                        "description": "Filter by app name (e.g., 'github', 'slack', 'gmail')",
                        "default": "",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of actions to return",
                        "default": 20,
                    },
                },
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "composio_execute_action":
            result = await _execute_action(arguments)
        elif name == "composio_list_actions":
            result = await _list_actions(arguments)
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _execute_action(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "composio-core not installed"}

    action_name = args["action"]
    params = args.get("params", {})
    entity_id = args.get("entity_id", "default")

    try:
        toolset = ComposioToolSet(entity_id=entity_id)
        result = toolset.execute_action(
            action=Action(action_name),
            params=params,
        )
        return {
            "status": "success",
            "action": action_name,
            "result": result if isinstance(result, dict) else str(result),
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _list_actions(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "composio-core not installed"}

    app_filter = args.get("app", "")
    limit = args.get("limit", 20)

    try:
        toolset = ComposioToolSet()
        if app_filter:
            actions = toolset.get_actions(apps=[app_filter])
        else:
            actions = toolset.get_actions()
        action_list = [
            {"name": str(a.name) if hasattr(a, "name") else str(a), "description": getattr(a, "description", "")}
            for a in actions[:limit]
        ]
        return {
            "status": "success",
            "app_filter": app_filter,
            "count": len(action_list),
            "actions": action_list,
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
