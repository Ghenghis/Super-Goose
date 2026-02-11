#!/usr/bin/env python3
"""
CrewAI MCP Bridge Server for Super-Goose.

Wraps CrewAI for multi-agent task orchestration, exposing crew creation
and task kickoff via MCP stdio protocol.

Install: pip install mcp crewai
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

BRIDGE_NAME = "crewai_bridge"
BRIDGE_DESCRIPTION = "CrewAI multi-agent task orchestration"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    from crewai import Agent, Task, Crew, Process
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("crewai not installed. Install: pip install crewai")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="crewai_create_crew",
            description="Create a CrewAI crew with agents and tasks for collaborative work",
            inputSchema={
                "type": "object",
                "properties": {
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
                        "description": "Agent definitions with role, goal, and optional backstory",
                    },
                    "task_description": {
                        "type": "string",
                        "description": "Main task for the crew to accomplish",
                    },
                    "process": {
                        "type": "string",
                        "description": "Process type: sequential or hierarchical",
                        "default": "sequential",
                    },
                },
                "required": ["agents", "task_description"],
            },
        ),
        Tool(
            name="crewai_kickoff",
            description="Kickoff a quick single-agent CrewAI task",
            inputSchema={
                "type": "object",
                "properties": {
                    "role": {
                        "type": "string",
                        "description": "Agent role (e.g., 'Senior Developer')",
                    },
                    "goal": {
                        "type": "string",
                        "description": "Agent goal",
                    },
                    "task": {
                        "type": "string",
                        "description": "Task description to execute",
                    },
                },
                "required": ["role", "goal", "task"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "crewai_create_crew":
            result = await _create_crew(arguments)
        elif name == "crewai_kickoff":
            result = await _kickoff(arguments)
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _create_crew(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "crewai not installed"}

    agent_defs = args["agents"]
    task_desc = args["task_description"]
    process_type = args.get("process", "sequential")

    try:
        agents = []
        for ad in agent_defs:
            agent = Agent(
                role=ad["role"],
                goal=ad["goal"],
                backstory=ad.get("backstory", f"Expert {ad['role']}"),
                verbose=False,
            )
            agents.append(agent)

        task = Task(description=task_desc, agent=agents[0], expected_output="Detailed result")
        crew = Crew(
            agents=agents,
            tasks=[task],
            process=Process.sequential if process_type == "sequential" else Process.hierarchical,
            verbose=False,
        )
        output = crew.kickoff()
        return {
            "status": "success",
            "agents": [a["role"] for a in agent_defs],
            "process": process_type,
            "result": str(output),
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _kickoff(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "crewai not installed"}

    role = args["role"]
    goal = args["goal"]
    task_desc = args["task"]

    try:
        agent = Agent(role=role, goal=goal, backstory=f"Expert {role}", verbose=False)
        task = Task(description=task_desc, agent=agent, expected_output="Detailed result")
        crew = Crew(agents=[agent], tasks=[task], verbose=False)
        output = crew.kickoff()
        return {
            "status": "success",
            "role": role,
            "task": task_desc,
            "result": str(output),
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
