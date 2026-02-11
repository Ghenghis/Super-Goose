#!/usr/bin/env python3
"""
AutoGen MCP Bridge Server for Super-Goose.

Wraps Microsoft AutoGen for multi-agent conversational AI, exposing
agent creation and conversation orchestration via MCP stdio protocol.

Install: pip install mcp pyautogen
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

BRIDGE_NAME = "autogen_bridge"
BRIDGE_DESCRIPTION = "AutoGen conversational AI agents -- multi-agent orchestration"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    import autogen
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("pyautogen not installed. Install: pip install pyautogen")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="autogen_create_agent",
            description="Create an AutoGen conversational agent with a specific role",
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Agent name",
                    },
                    "system_message": {
                        "type": "string",
                        "description": "System message defining agent role and behavior",
                    },
                    "llm_config": {
                        "type": "object",
                        "description": "LLM configuration (model, temperature, etc.)",
                        "default": {},
                    },
                },
                "required": ["name", "system_message"],
            },
        ),
        Tool(
            name="autogen_run_conversation",
            description="Run a conversation between AutoGen agents to solve a task",
            inputSchema={
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "The task or question for agents to discuss",
                    },
                    "agent_roles": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of agent roles (e.g., ['coder', 'reviewer'])",
                        "default": ["assistant"],
                    },
                    "max_turns": {
                        "type": "integer",
                        "description": "Maximum conversation turns",
                        "default": 5,
                    },
                },
                "required": ["task"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "autogen_create_agent":
            result = await _create_agent(arguments)
        elif name == "autogen_run_conversation":
            result = await _run_conversation(arguments)
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _create_agent(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "pyautogen not installed"}

    name = args["name"]
    system_message = args["system_message"]
    llm_config = args.get("llm_config", {"model": "gpt-4", "temperature": 0})

    try:
        agent = autogen.AssistantAgent(
            name=name,
            system_message=system_message,
            llm_config={"config_list": [llm_config]},
        )
        return {
            "status": "success",
            "agent_name": name,
            "system_message": system_message[:100] + "..." if len(system_message) > 100 else system_message,
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _run_conversation(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "pyautogen not installed"}

    task = args["task"]
    roles = args.get("agent_roles", ["assistant"])
    max_turns = args.get("max_turns", 5)

    try:
        config_list = [{"model": "gpt-4", "temperature": 0}]
        agents = []
        for role in roles:
            agent = autogen.AssistantAgent(
                name=role,
                system_message=f"You are a {role}. Help with the given task.",
                llm_config={"config_list": config_list},
            )
            agents.append(agent)

        user_proxy = autogen.UserProxyAgent(
            name="user_proxy",
            human_input_mode="NEVER",
            max_consecutive_auto_reply=max_turns,
        )

        chat_result = user_proxy.initiate_chat(agents[0], message=task)
        return {
            "status": "success",
            "task": task,
            "turns": max_turns,
            "summary": str(chat_result.summary) if hasattr(chat_result, "summary") else "Conversation completed",
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
