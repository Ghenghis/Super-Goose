#!/usr/bin/env python3
"""
SCIP Code Intelligence MCP Bridge Server for Super-Goose.

Wraps SCIP (Sourcegraph Code Intelligence Protocol) for precise code
navigation, cross-references, and symbol lookup via MCP stdio protocol.

Install: pip install mcp scip-python
"""

import asyncio
import json
import logging
import subprocess
import sys
from typing import Any

try:
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp.types import Tool, TextContent
except ImportError:
    print("Error: MCP SDK not installed. Run: pip install mcp", file=sys.stderr)
    sys.exit(1)

BRIDGE_NAME = "scip_bridge"
BRIDGE_DESCRIPTION = "SCIP code intelligence for precise navigation, cross-refs, and symbols"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    from scip_python import index as scip_index
    _LIB_AVAILABLE = True
except ImportError:
    try:
        result = subprocess.run(
            ["scip-python", "--version"], capture_output=True, text=True, timeout=5
        )
        _LIB_AVAILABLE = result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        logger.warning("scip-python not installed. Install: pip install scip-python")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="scip_index_project",
            description="Index a project to generate a SCIP index for code intelligence",
            inputSchema={
                "type": "object",
                "properties": {
                    "project_path": {
                        "type": "string",
                        "description": "Path to the project root to index",
                    },
                    "language": {
                        "type": "string",
                        "description": "Language: python, typescript, java, go",
                        "default": "python",
                    },
                    "output_path": {
                        "type": "string",
                        "description": "Output path for the SCIP index file",
                        "default": "index.scip",
                    },
                },
                "required": ["project_path"],
            },
        ),
        Tool(
            name="scip_find_symbol",
            description="Find symbol definitions across the indexed codebase",
            inputSchema={
                "type": "object",
                "properties": {
                    "symbol": {
                        "type": "string",
                        "description": "Symbol name to look up (function, class, variable)",
                    },
                    "index_path": {
                        "type": "string",
                        "description": "Path to SCIP index file",
                        "default": "index.scip",
                    },
                },
                "required": ["symbol"],
            },
        ),
        Tool(
            name="scip_status",
            description="Check SCIP code intelligence availability",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "scip_index_project":
            result = await _index_project(arguments)
        elif name == "scip_find_symbol":
            result = await _find_symbol(arguments)
        elif name == "scip_status":
            result = await _handle_status()
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _index_project(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "scip-python not installed"}

    project_path = args["project_path"]
    language = args.get("language", "python")
    output_path = args.get("output_path", "index.scip")

    try:
        cmd = ["scip-python", "index", project_path, "--output", output_path]
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)

        return {
            "status": "success" if proc.returncode == 0 else "error",
            "project": project_path,
            "language": language,
            "index_file": output_path,
            "output": stdout.decode()[:500] if stdout else "",
            "errors": stderr.decode()[:500] if stderr and proc.returncode != 0 else "",
        }
    except asyncio.TimeoutError:
        return {"status": "error", "message": "Indexing timed out after 120s"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _find_symbol(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "scip-python not installed"}

    symbol = args["symbol"]
    index_path = args.get("index_path", "index.scip")

    try:
        import os
        if not os.path.exists(index_path):
            return {"status": "error", "message": f"Index file not found: {index_path}. Run scip_index_project first."}

        cmd = ["scip", "print", "--json", index_path]
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30)

        if not stdout:
            return {"status": "error", "message": "No output from scip print"}

        matches = []
        for line in stdout.decode().splitlines():
            if symbol.lower() in line.lower():
                matches.append(line.strip())
                if len(matches) >= 20:
                    break

        return {
            "status": "success",
            "symbol": symbol,
            "match_count": len(matches),
            "matches": matches,
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _handle_status() -> dict[str, Any]:
    return {
        "bridge": BRIDGE_NAME,
        "version": BRIDGE_VERSION,
        "description": BRIDGE_DESCRIPTION,
        "library_available": _LIB_AVAILABLE,
        "status": "ready" if _LIB_AVAILABLE else "library_missing",
    }


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
