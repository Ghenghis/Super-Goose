#!/usr/bin/env python3
"""
Swarm MCP Bridge Server for Super-Goose.

Wraps OpenAI's Swarm framework for lightweight multi-agent orchestration,
exposing swarm execution and agent creation via MCP stdio protocol.

Install: pip install mcp openai git+https://github.com/openai/swarm.git
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

BRIDGE_NAME = "swarm_bridge"
BRIDGE_DESCRIPTION = "OpenAI Swarm lightweight multi-agent orchestration"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    from swarm import Swarm, Agent
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("swarm not installed. Install: pip install git+https://github.com/openai/swarm.git")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="swarm_run_swarm",
            description="Run a Swarm multi-agent conversation with handoffs",
            inputSchema={
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "Initial task or message for the swarm",
                    },
                    "agent_name": {
                        "type": "string",
                        "description": "Starting agent name",
                        "default": "Assistant",
                    },
                    "agent_instructions": {
                        "type": "string",
                        "description": "Instructions for the starting agent",
                        "default": "You are a helpful assistant.",
                    },
                },
                "required": ["task"],
            },
        ),
        Tool(
            name="swarm_create_agent",
            description="Create a Swarm agent with specific instructions and optional handoff targets",
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Agent name",
                    },
                    "instructions": {
                        "type": "string",
                        "description": "Agent system instructions",
                    },
                    "handoff_to": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Names of agents this agent can hand off to",
                        "default": [],
                    },
                },
                "required": ["name", "instructions"],
            },
        ),
        Tool(
            name="swarm_multi_agent",
            description="Run a multi-agent swarm with multiple defined agents",
            inputSchema={
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "Task for the swarm to accomplish",
                    },
                    "agents": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "instructions": {"type": "string"},
                            },
                            "required": ["name", "instructions"],
                        },
                        "description": "List of agents with name and instructions",
                    },
                },
                "required": ["task", "agents"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "swarm_run_swarm":
            result = await _run_swarm(arguments)
        elif name == "swarm_create_agent":
            result = await _create_agent(arguments)
        elif name == "swarm_multi_agent":
            result = await _multi_agent(arguments)
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _run_swarm(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "swarm not installed"}

    task = args["task"]
    agent_name = args.get("agent_name", "Assistant")
    instructions = args.get("agent_instructions", "You are a helpful assistant.")

    try:
        client = Swarm()
        agent = Agent(name=agent_name, instructions=instructions)
        response = client.run(
            agent=agent,
            messages=[{"role": "user", "content": task}],
        )
        last_message = response.messages[-1]["content"] if response.messages else "No response"
        return {
            "status": "success",
            "task": task,
            "agent": agent_name,
            "response": last_message,
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _create_agent(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "swarm not installed"}

    name = args["name"]
    instructions = args["instructions"]
    handoffs = args.get("handoff_to", [])

    return {
        "status": "success",
        "agent_name": name,
        "instructions": instructions[:100] + "..." if len(instructions) > 100 else instructions,
        "handoff_targets": handoffs,
        "message": "Agent definition created. Use swarm_run_swarm or swarm_multi_agent to execute.",
    }


async def _multi_agent(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "swarm not installed"}

    task = args["task"]
    agent_defs = args["agents"]

    try:
        client = Swarm()
        agents = {}
        for ad in agent_defs:
            agents[ad["name"]] = Agent(name=ad["name"], instructions=ad["instructions"])

        first_agent = agents[agent_defs[0]["name"]]
        response = client.run(
            agent=first_agent,
            messages=[{"role": "user", "content": task}],
        )
        last_message = response.messages[-1]["content"] if response.messages else "No response"
        return {
            "status": "success",
            "task": task,
            "agents": [a["name"] for a in agent_defs],
            "response": last_message,
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
