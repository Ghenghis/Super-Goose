#!/usr/bin/env python3
"""
CAMEL MCP Bridge Server for Super-Goose.

Wraps the CAMEL-AI framework for multi-agent role-playing societies,
exposing society creation and task execution via MCP stdio protocol.

Install: pip install mcp camel-ai
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

BRIDGE_NAME = "camel_bridge"
BRIDGE_DESCRIPTION = "CAMEL-AI multi-agent role-playing societies"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    from camel.agents import ChatAgent
    from camel.messages import BaseMessage
    from camel.types import ModelType, RoleType
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("camel-ai not installed. Install: pip install camel-ai")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="camel_create_society",
            description="Create a CAMEL role-playing society of agents for collaborative task solving",
            inputSchema={
                "type": "object",
                "properties": {
                    "assistant_role": {
                        "type": "string",
                        "description": "Role of the assistant agent (e.g., 'Python Programmer')",
                    },
                    "user_role": {
                        "type": "string",
                        "description": "Role of the user agent (e.g., 'Project Manager')",
                    },
                    "task": {
                        "type": "string",
                        "description": "Task for the society to accomplish",
                    },
                },
                "required": ["assistant_role", "user_role", "task"],
            },
        ),
        Tool(
            name="camel_run_task",
            description="Run a single-agent task using CAMEL ChatAgent",
            inputSchema={
                "type": "object",
                "properties": {
                    "role": {
                        "type": "string",
                        "description": "Agent role or persona",
                    },
                    "task": {
                        "type": "string",
                        "description": "Task to execute",
                    },
                },
                "required": ["task"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "camel_create_society":
            result = await _create_society(arguments)
        elif name == "camel_run_task":
            result = await _run_task(arguments)
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _create_society(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "camel-ai not installed"}

    assistant_role = args["assistant_role"]
    user_role = args["user_role"]
    task = args["task"]

    try:
        assistant_msg = BaseMessage.make_assistant_message(
            role_name=assistant_role,
            content=f"You are a {assistant_role}. Help accomplish the task.",
        )
        assistant_agent = ChatAgent(assistant_msg)

        user_msg = BaseMessage.make_user_message(
            role_name=user_role,
            content=task,
        )
        response = assistant_agent.step(user_msg)
        return {
            "status": "success",
            "assistant_role": assistant_role,
            "user_role": user_role,
            "task": task,
            "response": str(response.msg.content) if response.msg else "No response",
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _run_task(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "camel-ai not installed"}

    role = args.get("role", "assistant")
    task = args["task"]

    try:
        sys_msg = BaseMessage.make_assistant_message(
            role_name=role,
            content=f"You are a helpful {role}.",
        )
        agent = ChatAgent(sys_msg)
        user_msg = BaseMessage.make_user_message(role_name="user", content=task)
        response = agent.step(user_msg)
        return {
            "status": "success",
            "role": role,
            "task": task,
            "result": str(response.msg.content) if response.msg else "No response",
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
