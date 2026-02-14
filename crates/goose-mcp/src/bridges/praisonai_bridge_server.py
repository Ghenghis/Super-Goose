#!/usr/bin/env python3
"""
PraisonAI MCP Bridge Server for Super-Goose.

Wraps PraisonAI for multi-agent automation — orchestrates crews of AI
agents with defined roles, goals, and tasks via MCP stdio protocol.

Install: pip install mcp praisonai
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

BRIDGE_NAME = "praisonai_bridge"
BRIDGE_DESCRIPTION = "PraisonAI multi-agent automation and orchestration"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    from praisonai import PraisonAI
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("praisonai not installed. Install: pip install praisonai")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="praisonai_run_agents",
            description="Run a PraisonAI multi-agent task with role-based agents",
            inputSchema={
                "type": "object",
                "properties": {
                    "topic": {
                        "type": "string",
                        "description": "Main topic or goal for the agent crew",
                    },
                    "agents": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "role": {"type": "string"},
                                "goal": {"type": "string"},
                                "backstory": {"type": "string"},
                            },
                            "required": ["role", "goal"],
                        },
                        "description": "Agent definitions with roles and goals",
                        "default": [],
                    },
                    "framework": {
                        "type": "string",
                        "description": "Framework: crewai, autogen",
                        "default": "crewai",
                    },
                },
                "required": ["topic"],
            },
        ),
        Tool(
            name="praisonai_auto",
            description="Auto-generate and run a PraisonAI agent crew from a topic description",
            inputSchema={
                "type": "object",
                "properties": {
                    "topic": {
                        "type": "string",
                        "description": "Topic description — PraisonAI will auto-create agents and tasks",
                    },
                    "num_agents": {
                        "type": "integer",
                        "description": "Number of agents to auto-generate",
                        "default": 3,
                    },
                },
                "required": ["topic"],
            },
        ),
        Tool(
            name="praisonai_status",
            description="Check PraisonAI availability",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "praisonai_run_agents":
            result = await _run_agents(arguments)
        elif name == "praisonai_auto":
            result = await _auto(arguments)
        elif name == "praisonai_status":
            result = await _handle_status()
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _run_agents(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "praisonai not installed"}

    topic = args["topic"]
    agents = args.get("agents", [])
    framework = args.get("framework", "crewai")

    try:
        # Build YAML config from agent definitions
        agent_config = {}
        for i, a in enumerate(agents):
            agent_config[f"agent_{i+1}"] = {
                "role": a["role"],
                "goal": a["goal"],
                "backstory": a.get("backstory", f"Expert {a['role']}"),
            }

        praison = PraisonAI(
            auto=topic if not agents else None,
            agents_yaml=json.dumps(agent_config) if agents else None,
            framework=framework,
        )
        output = praison.run()
        return {
            "status": "success",
            "topic": topic,
            "framework": framework,
            "agent_count": len(agents) if agents else "auto",
            "result": str(output)[:5000],
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _auto(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "praisonai not installed"}

    topic = args["topic"]
    num_agents = args.get("num_agents", 3)

    try:
        praison = PraisonAI(auto=topic)
        output = praison.run()
        return {
            "status": "success",
            "topic": topic,
            "mode": "auto",
            "requested_agents": num_agents,
            "result": str(output)[:5000],
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
