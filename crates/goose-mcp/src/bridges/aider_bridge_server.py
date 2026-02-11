#!/usr/bin/env python3
"""
Aider MCP Bridge Server for Super-Goose.

Wraps the Aider AI pair-programming tool, exposing code editing and
review capabilities via MCP stdio protocol.

Install: pip install mcp aider-chat
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

BRIDGE_NAME = "aider_bridge"
BRIDGE_DESCRIPTION = "Aider AI pair programming -- code editing and review"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    from aider.coders import Coder
    from aider.models import Model
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("aider-chat not installed. Install: pip install aider-chat")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="aider_edit_code",
            description="Edit code files using Aider AI pair programming",
            inputSchema={
                "type": "object",
                "properties": {
                    "instruction": {
                        "type": "string",
                        "description": "Natural language instruction for the code edit",
                    },
                    "files": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of file paths to edit",
                    },
                    "model": {
                        "type": "string",
                        "description": "LLM model to use (default: gpt-4)",
                        "default": "gpt-4",
                    },
                },
                "required": ["instruction", "files"],
            },
        ),
        Tool(
            name="aider_review_code",
            description="Review code for issues, bugs, and improvements using Aider",
            inputSchema={
                "type": "object",
                "properties": {
                    "files": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of file paths to review",
                    },
                    "focus": {
                        "type": "string",
                        "description": "Review focus: bugs, security, performance, style",
                        "default": "bugs",
                    },
                },
                "required": ["files"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "aider_edit_code":
            result = await _edit_code(arguments)
        elif name == "aider_review_code":
            result = await _review_code(arguments)
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _edit_code(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "aider-chat not installed"}

    instruction = args["instruction"]
    files = args["files"]
    model_name = args.get("model", "gpt-4")

    try:
        model = Model(model_name)
        coder = Coder.create(main_model=model, fnames=files)
        response = coder.run(instruction)
        return {
            "status": "success",
            "instruction": instruction,
            "files_modified": files,
            "response": str(response),
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _review_code(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "aider-chat not installed"}

    files = args["files"]
    focus = args.get("focus", "bugs")
    prompt = f"Review the following files for {focus}. List issues found."

    try:
        model = Model("gpt-4")
        coder = Coder.create(main_model=model, fnames=files)
        response = coder.run(prompt)
        return {
            "status": "success",
            "files_reviewed": files,
            "focus": focus,
            "findings": str(response),
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
