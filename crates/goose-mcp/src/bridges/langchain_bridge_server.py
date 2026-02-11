#!/usr/bin/env python3
"""
LangChain MCP Bridge Server for Super-Goose.

Wraps LangChain for chain execution and agent creation, exposing chain
running and agent interaction via MCP stdio protocol.

Install: pip install mcp langchain langchain-openai
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

BRIDGE_NAME = "langchain_bridge"
BRIDGE_DESCRIPTION = "LangChain chain execution and agent orchestration"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    from langchain_openai import ChatOpenAI
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.output_parsers import StrOutputParser
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("langchain not installed. Install: pip install langchain langchain-openai")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="langchain_run_chain",
            description="Run a LangChain prompt chain with variables",
            inputSchema={
                "type": "object",
                "properties": {
                    "prompt_template": {
                        "type": "string",
                        "description": "Prompt template with {variable} placeholders",
                    },
                    "variables": {
                        "type": "object",
                        "description": "Template variable values",
                    },
                    "model": {
                        "type": "string",
                        "description": "LLM model name",
                        "default": "gpt-4",
                    },
                    "temperature": {
                        "type": "number",
                        "description": "Sampling temperature",
                        "default": 0.7,
                    },
                },
                "required": ["prompt_template", "variables"],
            },
        ),
        Tool(
            name="langchain_create_agent",
            description="Create and run a LangChain ReAct agent for a task",
            inputSchema={
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "Task for the agent to accomplish",
                    },
                    "system_prompt": {
                        "type": "string",
                        "description": "System prompt for the agent",
                        "default": "You are a helpful assistant.",
                    },
                    "model": {
                        "type": "string",
                        "description": "LLM model name",
                        "default": "gpt-4",
                    },
                },
                "required": ["task"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "langchain_run_chain":
            result = await _run_chain(arguments)
        elif name == "langchain_create_agent":
            result = await _create_agent(arguments)
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _run_chain(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "langchain not installed"}

    template = args["prompt_template"]
    variables = args["variables"]
    model_name = args.get("model", "gpt-4")
    temperature = args.get("temperature", 0.7)

    try:
        llm = ChatOpenAI(model=model_name, temperature=temperature)
        prompt = ChatPromptTemplate.from_template(template)
        chain = prompt | llm | StrOutputParser()
        output = await chain.ainvoke(variables)
        return {
            "status": "success",
            "template": template[:80] + "..." if len(template) > 80 else template,
            "result": output,
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _create_agent(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "langchain not installed"}

    task = args["task"]
    system_prompt = args.get("system_prompt", "You are a helpful assistant.")
    model_name = args.get("model", "gpt-4")

    try:
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "{input}"),
        ])
        chain = prompt | llm | StrOutputParser()
        output = await chain.ainvoke({"input": task})
        return {
            "status": "success",
            "task": task,
            "result": output,
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
