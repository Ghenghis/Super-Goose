#!/usr/bin/env python3
"""
PR-Agent MCP Bridge Server for Super-Goose.

Wraps CodiumAI's PR-Agent for automated pull request analysis, review,
code suggestions, and changelog generation via MCP stdio protocol.

Install: pip install mcp pr-agent
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

BRIDGE_NAME = "pr_agent_bridge"
BRIDGE_DESCRIPTION = "PR-Agent for automated pull request analysis and code review"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    from pr_agent.agent.pr_agent import PRAgent
    from pr_agent.config_loader import get_settings
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("pr-agent not installed. Install: pip install pr-agent")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="pr_agent_review",
            description="Run AI-powered code review on a pull request",
            inputSchema={
                "type": "object",
                "properties": {
                    "pr_url": {
                        "type": "string",
                        "description": "Pull request URL (GitHub, GitLab, or Bitbucket)",
                    },
                    "review_type": {
                        "type": "string",
                        "description": "Review type: review, describe, improve, ask",
                        "default": "review",
                    },
                    "extra_instructions": {
                        "type": "string",
                        "description": "Additional instructions for the review",
                        "default": "",
                    },
                },
                "required": ["pr_url"],
            },
        ),
        Tool(
            name="pr_agent_describe",
            description="Generate an AI description/summary for a pull request",
            inputSchema={
                "type": "object",
                "properties": {
                    "pr_url": {
                        "type": "string",
                        "description": "Pull request URL",
                    },
                    "add_labels": {
                        "type": "boolean",
                        "description": "Automatically add labels to the PR",
                        "default": False,
                    },
                },
                "required": ["pr_url"],
            },
        ),
        Tool(
            name="pr_agent_improve",
            description="Get AI code improvement suggestions for a pull request",
            inputSchema={
                "type": "object",
                "properties": {
                    "pr_url": {
                        "type": "string",
                        "description": "Pull request URL",
                    },
                    "num_suggestions": {
                        "type": "integer",
                        "description": "Maximum number of suggestions",
                        "default": 5,
                    },
                },
                "required": ["pr_url"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "pr_agent_review":
            result = await _review(arguments)
        elif name == "pr_agent_describe":
            result = await _describe(arguments)
        elif name == "pr_agent_improve":
            result = await _improve(arguments)
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _review(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "pr-agent not installed"}

    pr_url = args["pr_url"]
    review_type = args.get("review_type", "review")
    extra = args.get("extra_instructions", "")

    try:
        agent = PRAgent()
        command = f"/{review_type}"
        if extra:
            command += f" {extra}"

        result = await agent.handle_request(pr_url, command)
        return {
            "status": "success",
            "pr_url": pr_url,
            "review_type": review_type,
            "result": str(result)[:5000],
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _describe(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "pr-agent not installed"}

    pr_url = args["pr_url"]

    try:
        agent = PRAgent()
        result = await agent.handle_request(pr_url, "/describe")
        return {
            "status": "success",
            "pr_url": pr_url,
            "action": "describe",
            "result": str(result)[:5000],
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _improve(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "pr-agent not installed"}

    pr_url = args["pr_url"]
    num_suggestions = args.get("num_suggestions", 5)

    try:
        agent = PRAgent()
        result = await agent.handle_request(
            pr_url,
            f"/improve --num_code_suggestions={num_suggestions}",
        )
        return {
            "status": "success",
            "pr_url": pr_url,
            "action": "improve",
            "max_suggestions": num_suggestions,
            "result": str(result)[:5000],
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
