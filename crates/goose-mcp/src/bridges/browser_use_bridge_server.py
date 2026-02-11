#!/usr/bin/env python3
"""
Browser-Use MCP Bridge Server for Super-Goose.

Wraps the browser-use library for AI-driven web browsing, exposing URL
navigation and data extraction via MCP stdio protocol.

Install: pip install mcp browser-use
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

BRIDGE_NAME = "browser_use_bridge"
BRIDGE_DESCRIPTION = "Browser-Use AI web browsing -- navigation and data extraction"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    from browser_use import Agent as BrowserAgent
    from langchain_openai import ChatOpenAI
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("browser-use not installed. Install: pip install browser-use langchain-openai")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="browser_browse_url",
            description="Navigate to a URL and interact with the page using AI",
            inputSchema={
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "Task to perform on the webpage (e.g., 'Find the pricing page')",
                    },
                    "url": {
                        "type": "string",
                        "description": "Starting URL to navigate to",
                    },
                    "max_steps": {
                        "type": "integer",
                        "description": "Maximum browsing steps",
                        "default": 10,
                    },
                },
                "required": ["task"],
            },
        ),
        Tool(
            name="browser_extract_data",
            description="Extract structured data from a webpage",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "URL to extract data from",
                    },
                    "extraction_prompt": {
                        "type": "string",
                        "description": "What data to extract (e.g., 'Extract all product names and prices')",
                    },
                },
                "required": ["url", "extraction_prompt"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "browser_browse_url":
            result = await _browse_url(arguments)
        elif name == "browser_extract_data":
            result = await _extract_data(arguments)
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _browse_url(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "browser-use not installed"}

    task = args["task"]
    url = args.get("url", "")
    max_steps = args.get("max_steps", 10)
    full_task = f"Go to {url} and {task}" if url else task

    try:
        llm = ChatOpenAI(model="gpt-4o")
        agent = BrowserAgent(task=full_task, llm=llm)
        result = await agent.run(max_steps=max_steps)
        return {
            "status": "success",
            "task": task,
            "url": url,
            "result": str(result),
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _extract_data(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "browser-use not installed"}

    url = args["url"]
    prompt = args["extraction_prompt"]
    task = f"Go to {url} and extract the following data: {prompt}"

    try:
        llm = ChatOpenAI(model="gpt-4o")
        agent = BrowserAgent(task=task, llm=llm)
        result = await agent.run(max_steps=5)
        return {
            "status": "success",
            "url": url,
            "extraction_prompt": prompt,
            "extracted_data": str(result),
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
