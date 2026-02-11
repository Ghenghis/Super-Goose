#!/usr/bin/env python3
"""
Mem0 MCP Bridge Server for Super-Goose.

Wraps Mem0 for persistent memory management, exposing memory addition
and semantic search via MCP stdio protocol.

Install: pip install mcp mem0ai
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

BRIDGE_NAME = "mem0_bridge"
BRIDGE_DESCRIPTION = "Mem0 persistent memory management"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
_memory_client = None
try:
    from mem0 import Memory
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("mem0ai not installed. Install: pip install mem0ai")

server = Server(BRIDGE_NAME)


def _get_memory():
    """Lazily initialize Mem0 memory client."""
    global _memory_client
    if _memory_client is None and _LIB_AVAILABLE:
        _memory_client = Memory()
    return _memory_client


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="mem0_add_memory",
            description="Add a memory entry to Mem0 persistent storage",
            inputSchema={
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "Memory content to store",
                    },
                    "user_id": {
                        "type": "string",
                        "description": "User identifier for memory scoping",
                        "default": "default",
                    },
                    "metadata": {
                        "type": "object",
                        "description": "Optional metadata tags",
                        "default": {},
                    },
                },
                "required": ["content"],
            },
        ),
        Tool(
            name="mem0_search_memory",
            description="Search memories semantically using natural language",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query",
                    },
                    "user_id": {
                        "type": "string",
                        "description": "User identifier to scope search",
                        "default": "default",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum results to return",
                        "default": 5,
                    },
                },
                "required": ["query"],
            },
        ),
        Tool(
            name="mem0_get_all",
            description="Retrieve all memories for a user",
            inputSchema={
                "type": "object",
                "properties": {
                    "user_id": {
                        "type": "string",
                        "description": "User identifier",
                        "default": "default",
                    },
                },
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "mem0_add_memory":
            result = await _add_memory(arguments)
        elif name == "mem0_search_memory":
            result = await _search_memory(arguments)
        elif name == "mem0_get_all":
            result = await _get_all(arguments)
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _add_memory(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "mem0ai not installed"}

    content = args["content"]
    user_id = args.get("user_id", "default")
    metadata = args.get("metadata", {})

    try:
        m = _get_memory()
        result = m.add(content, user_id=user_id, metadata=metadata)
        return {
            "status": "success",
            "user_id": user_id,
            "memory_id": str(result) if result else "stored",
            "content_preview": content[:100],
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _search_memory(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "mem0ai not installed"}

    query = args["query"]
    user_id = args.get("user_id", "default")
    limit = args.get("limit", 5)

    try:
        m = _get_memory()
        results = m.search(query, user_id=user_id, limit=limit)
        memories = []
        if isinstance(results, list):
            memories = [
                {"content": r.get("memory", r.get("text", str(r))), "score": r.get("score")}
                for r in results
            ]
        return {
            "status": "success",
            "query": query,
            "count": len(memories),
            "memories": memories,
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _get_all(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "mem0ai not installed"}

    user_id = args.get("user_id", "default")

    try:
        m = _get_memory()
        results = m.get_all(user_id=user_id)
        memories = []
        if isinstance(results, list):
            memories = [r.get("memory", r.get("text", str(r))) for r in results]
        return {
            "status": "success",
            "user_id": user_id,
            "count": len(memories),
            "memories": memories,
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
