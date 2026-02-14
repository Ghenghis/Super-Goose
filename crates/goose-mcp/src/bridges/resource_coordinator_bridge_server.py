#!/usr/bin/env python3
"""
Resource Coordinator MCP Bridge Server for Super-Goose.

Coordinates resource allocation across multiple agents, managing memory
budgets, token limits, and concurrent task slots via MCP stdio protocol.

Install: pip install mcp
"""

import asyncio
import json
import logging
import sys
import time
from typing import Any

try:
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp.types import Tool, TextContent
except ImportError:
    print("Error: MCP SDK not installed. Run: pip install mcp", file=sys.stderr)
    sys.exit(1)

BRIDGE_NAME = "resource_coordinator_bridge"
BRIDGE_DESCRIPTION = "Resource allocation coordinator for multi-agent workloads"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

# Resource coordinator is a built-in — no external library needed
_LIB_AVAILABLE = True

server = Server(BRIDGE_NAME)

# In-memory resource pool
_resource_pool: dict[str, Any] = {
    "max_tokens": 1_000_000,
    "used_tokens": 0,
    "max_concurrent": 10,
    "active_tasks": 0,
    "allocations": {},
}


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="resource_allocate",
            description="Allocate resources (tokens, task slots) for an agent or task",
            inputSchema={
                "type": "object",
                "properties": {
                    "agent_id": {
                        "type": "string",
                        "description": "Unique identifier for the agent requesting resources",
                    },
                    "token_budget": {
                        "type": "integer",
                        "description": "Number of tokens to allocate",
                        "default": 50000,
                    },
                    "priority": {
                        "type": "string",
                        "description": "Priority level: low, normal, high, critical",
                        "default": "normal",
                    },
                },
                "required": ["agent_id"],
            },
        ),
        Tool(
            name="resource_release",
            description="Release resources previously allocated to an agent",
            inputSchema={
                "type": "object",
                "properties": {
                    "agent_id": {
                        "type": "string",
                        "description": "Agent ID whose resources to release",
                    },
                },
                "required": ["agent_id"],
            },
        ),
        Tool(
            name="resource_status",
            description="Check current resource pool status and active allocations",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "resource_allocate":
            result = await _allocate(arguments)
        elif name == "resource_release":
            result = await _release(arguments)
        elif name == "resource_status":
            result = await _status()
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _allocate(args: dict[str, Any]) -> dict[str, Any]:
    agent_id = args["agent_id"]
    token_budget = args.get("token_budget", 50000)
    priority = args.get("priority", "normal")

    remaining = _resource_pool["max_tokens"] - _resource_pool["used_tokens"]
    if token_budget > remaining:
        return {
            "status": "denied",
            "reason": "insufficient_tokens",
            "requested": token_budget,
            "available": remaining,
        }
    if _resource_pool["active_tasks"] >= _resource_pool["max_concurrent"]:
        return {
            "status": "denied",
            "reason": "max_concurrent_reached",
            "active": _resource_pool["active_tasks"],
            "max": _resource_pool["max_concurrent"],
        }

    _resource_pool["used_tokens"] += token_budget
    _resource_pool["active_tasks"] += 1
    _resource_pool["allocations"][agent_id] = {
        "tokens": token_budget,
        "priority": priority,
        "allocated_at": time.time(),
    }

    return {
        "status": "allocated",
        "agent_id": agent_id,
        "tokens": token_budget,
        "priority": priority,
        "pool_remaining": _resource_pool["max_tokens"] - _resource_pool["used_tokens"],
    }


async def _release(args: dict[str, Any]) -> dict[str, Any]:
    agent_id = args["agent_id"]
    alloc = _resource_pool["allocations"].pop(agent_id, None)
    if not alloc:
        return {"status": "not_found", "agent_id": agent_id}

    _resource_pool["used_tokens"] -= alloc["tokens"]
    _resource_pool["active_tasks"] -= 1
    return {
        "status": "released",
        "agent_id": agent_id,
        "tokens_freed": alloc["tokens"],
        "pool_remaining": _resource_pool["max_tokens"] - _resource_pool["used_tokens"],
    }


async def _status() -> dict[str, Any]:
    return {
        "status": "ready",
        "bridge": BRIDGE_NAME,
        "version": BRIDGE_VERSION,
        "pool": {
            "max_tokens": _resource_pool["max_tokens"],
            "used_tokens": _resource_pool["used_tokens"],
            "available_tokens": _resource_pool["max_tokens"] - _resource_pool["used_tokens"],
            "max_concurrent": _resource_pool["max_concurrent"],
            "active_tasks": _resource_pool["active_tasks"],
            "allocations": list(_resource_pool["allocations"].keys()),
        },
    }


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
