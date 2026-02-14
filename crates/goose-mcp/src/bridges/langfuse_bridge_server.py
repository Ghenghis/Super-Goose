#!/usr/bin/env python3
"""
Langfuse MCP Bridge Server for Super-Goose.

Wraps Langfuse for LLM observability, tracing, and prompt management,
exposing trace creation and scoring via MCP stdio protocol.

Install: pip install mcp langfuse
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

BRIDGE_NAME = "langfuse_bridge"
BRIDGE_DESCRIPTION = "Langfuse LLM observability, tracing, and prompt management"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    from langfuse import Langfuse
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("langfuse not installed. Install: pip install langfuse")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="langfuse_create_trace",
            description="Create a Langfuse trace to track an LLM interaction",
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Name for this trace (e.g., 'code-review', 'chat-completion')",
                    },
                    "input": {
                        "type": "string",
                        "description": "Input text/prompt being traced",
                    },
                    "output": {
                        "type": "string",
                        "description": "Output/response text to record",
                        "default": "",
                    },
                    "metadata": {
                        "type": "object",
                        "description": "Additional metadata (model, tokens, latency, etc.)",
                        "default": {},
                    },
                    "user_id": {
                        "type": "string",
                        "description": "User identifier for the trace",
                        "default": "",
                    },
                },
                "required": ["name", "input"],
            },
        ),
        Tool(
            name="langfuse_score_trace",
            description="Add a score to an existing Langfuse trace for quality tracking",
            inputSchema={
                "type": "object",
                "properties": {
                    "trace_id": {
                        "type": "string",
                        "description": "Trace ID to score",
                    },
                    "name": {
                        "type": "string",
                        "description": "Score name (e.g., 'accuracy', 'relevance', 'helpfulness')",
                    },
                    "value": {
                        "type": "number",
                        "description": "Score value (0.0 to 1.0)",
                    },
                    "comment": {
                        "type": "string",
                        "description": "Optional comment explaining the score",
                        "default": "",
                    },
                },
                "required": ["trace_id", "name", "value"],
            },
        ),
        Tool(
            name="langfuse_status",
            description="Check Langfuse connection status and configuration",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "langfuse_create_trace":
            result = await _create_trace(arguments)
        elif name == "langfuse_score_trace":
            result = await _score_trace(arguments)
        elif name == "langfuse_status":
            result = await _handle_status()
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _create_trace(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "langfuse not installed"}

    try:
        lf = Langfuse()
        trace = lf.trace(
            name=args["name"],
            input=args["input"],
            output=args.get("output", ""),
            metadata=args.get("metadata", {}),
            user_id=args.get("user_id") or None,
        )
        lf.flush()
        return {
            "status": "success",
            "trace_id": trace.id,
            "name": args["name"],
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _score_trace(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "langfuse not installed"}

    try:
        lf = Langfuse()
        lf.score(
            trace_id=args["trace_id"],
            name=args["name"],
            value=args["value"],
            comment=args.get("comment", ""),
        )
        lf.flush()
        return {
            "status": "success",
            "trace_id": args["trace_id"],
            "score_name": args["name"],
            "score_value": args["value"],
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _handle_status() -> dict[str, Any]:
    info = {
        "bridge": BRIDGE_NAME,
        "version": BRIDGE_VERSION,
        "description": BRIDGE_DESCRIPTION,
        "library_available": _LIB_AVAILABLE,
        "status": "ready" if _LIB_AVAILABLE else "library_missing",
    }
    if _LIB_AVAILABLE:
        import os
        info["configured"] = bool(
            os.environ.get("LANGFUSE_PUBLIC_KEY") and os.environ.get("LANGFUSE_SECRET_KEY")
        )
    return info


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
