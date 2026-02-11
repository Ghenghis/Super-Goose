#!/usr/bin/env python3
"""
MCP Server Bridge Template for Super-Goose Stage 6 Tools.

This template provides the scaffolding for creating MCP-compliant bridge
servers that wrap third-party Python libraries and expose them as stdio
extensions to the Super-Goose agent.

Usage:
  1. Copy this file as `{tool_name}_bridge_server.py`
  2. Replace BRIDGE_NAME, BRIDGE_DESCRIPTION, and tool implementations
  3. Install dependencies: pip install mcp {required_package}
  4. Register in config.yaml as a stdio extension
  5. Run: python {tool_name}_bridge_server.py

Protocol: MCP over stdio (stdin/stdout JSON-RPC)
Transport: stdio (stdin for requests, stdout for responses)

Config.yaml example:
  extensions:
    your_bridge:
      type: stdio
      cmd: python
      args: ["/path/to/your_bridge_server.py"]
      timeout: 300
      enabled: true
"""

import asyncio
import json
import logging
import sys
from typing import Any

# --- MCP SDK Import ---
try:
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp.types import Tool, TextContent
except ImportError:
    print(
        "Error: MCP SDK not installed. Run: pip install mcp",
        file=sys.stderr,
    )
    sys.exit(1)

# --- Bridge Configuration (REPLACE THESE) ---

BRIDGE_NAME = "template_bridge"
BRIDGE_DESCRIPTION = "Template MCP bridge -- replace with actual tool description"
BRIDGE_VERSION = "0.1.0"

# --- Logging ---

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,  # MCP uses stdout for protocol; logs go to stderr
)
logger = logging.getLogger(BRIDGE_NAME)

# --- Library Import (REPLACE WITH YOUR LIBRARY) ---

_LIB_AVAILABLE = False
try:
    # import your_library
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning(
        "Optional library not installed. Some tools will return stub responses."
    )

# --- Server Instance ---

server = Server(BRIDGE_NAME)


# --- Tool Registration ---

@server.list_tools()
async def list_tools() -> list[Tool]:
    """Return the list of tools this bridge provides."""
    return [
        Tool(
            name=f"{BRIDGE_NAME}_execute",
            description=f"Execute a task using {BRIDGE_NAME}",
            inputSchema={
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "The task or prompt to execute",
                    },
                    "context": {
                        "type": "string",
                        "description": "Additional context or configuration (JSON string)",
                        "default": "",
                    },
                },
                "required": ["task"],
            },
        ),
        Tool(
            name=f"{BRIDGE_NAME}_status",
            description=f"Check {BRIDGE_NAME} availability and configuration",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    """Route tool invocations to the correct handler."""
    try:
        if name == f"{BRIDGE_NAME}_execute":
            result = await _handle_execute(arguments)
        elif name == f"{BRIDGE_NAME}_status":
            result = await _handle_status()
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [
            TextContent(
                type="text",
                text=json.dumps({"error": str(exc), "tool": name}),
            )
        ]


# --- Tool Handlers (REPLACE WITH YOUR LOGIC) ---

async def _handle_execute(arguments: dict[str, Any]) -> dict[str, Any]:
    """Execute the primary bridge task."""
    task = arguments.get("task", "")
    context = arguments.get("context", "")

    if not _LIB_AVAILABLE:
        return {
            "status": "unavailable",
            "bridge": BRIDGE_NAME,
            "message": "Required library not installed",
        }

    # TODO: Replace with actual bridge implementation
    return {
        "status": "success",
        "bridge": BRIDGE_NAME,
        "task": task,
        "result": "Template result -- implement actual logic here",
    }


async def _handle_status() -> dict[str, Any]:
    """Return bridge status and configuration."""
    return {
        "bridge": BRIDGE_NAME,
        "version": BRIDGE_VERSION,
        "description": BRIDGE_DESCRIPTION,
        "library_available": _LIB_AVAILABLE,
        "status": "ready" if _LIB_AVAILABLE else "library_missing",
    }


# --- Entry Point ---

async def main():
    """Start the MCP stdio server."""
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )


if __name__ == "__main__":
    asyncio.run(main())
