#!/usr/bin/env python3
"""
GOAT MCP Bridge Server for Super-Goose.

Wraps the GOAT (Great On-chain Agent Toolkit) for blockchain/web3 agent
tasks, exposing task execution and tool listing via MCP stdio protocol.

Install: pip install mcp goat-sdk
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

BRIDGE_NAME = "goat_bridge"
BRIDGE_DESCRIPTION = "GOAT on-chain agent toolkit for web3 tasks"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    from goat import GoatToolkit
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("goat-sdk not installed. Install: pip install goat-sdk")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="goat_execute_task",
            description="Execute a web3/blockchain task using GOAT toolkit",
            inputSchema={
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "Task description (e.g., 'Check ETH balance', 'Send token')",
                    },
                    "chain": {
                        "type": "string",
                        "description": "Blockchain network (e.g., 'ethereum', 'polygon', 'base')",
                        "default": "ethereum",
                    },
                    "params": {
                        "type": "object",
                        "description": "Task-specific parameters",
                        "default": {},
                    },
                },
                "required": ["task"],
            },
        ),
        Tool(
            name="goat_get_tools",
            description="List available GOAT tools and plugins for a given chain",
            inputSchema={
                "type": "object",
                "properties": {
                    "chain": {
                        "type": "string",
                        "description": "Blockchain network to list tools for",
                        "default": "ethereum",
                    },
                },
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "goat_execute_task":
            result = await _execute_task(arguments)
        elif name == "goat_get_tools":
            result = await _get_tools(arguments)
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _execute_task(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "goat-sdk not installed"}

    task = args["task"]
    chain = args.get("chain", "ethereum")
    params = args.get("params", {})

    try:
        toolkit = GoatToolkit(chain=chain)
        result = toolkit.execute(task=task, **params)
        return {
            "status": "success",
            "task": task,
            "chain": chain,
            "result": result if isinstance(result, dict) else str(result),
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _get_tools(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "goat-sdk not installed"}

    chain = args.get("chain", "ethereum")

    try:
        toolkit = GoatToolkit(chain=chain)
        tools = toolkit.get_tools()
        tool_list = [{"name": str(t), "chain": chain} for t in tools]
        return {
            "status": "success",
            "chain": chain,
            "tools": tool_list,
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
