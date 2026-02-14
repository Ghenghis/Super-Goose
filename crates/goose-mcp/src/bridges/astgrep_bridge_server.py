#!/usr/bin/env python3
"""
ast-grep MCP Bridge Server for Super-Goose.

Wraps ast-grep for structural code search and rewriting using AST
pattern matching. Find and transform code by structure, not text.

Install: pip install mcp ast-grep-py
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

BRIDGE_NAME = "astgrep_bridge"
BRIDGE_DESCRIPTION = "ast-grep AST pattern matching for structural code search and rewrite"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    from ast_grep_py import SgRoot
    _LIB_AVAILABLE = True
except ImportError:
    # Fallback: check if sg CLI is available
    try:
        r = subprocess.run(["sg", "--version"], capture_output=True, text=True, timeout=5)
        _LIB_AVAILABLE = r.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        logger.warning("ast-grep not installed. Install: pip install ast-grep-py")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="astgrep_search",
            description="Search code using AST pattern matching (structural, not text-based)",
            inputSchema={
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "AST pattern to search for (e.g., 'console.log($$$)', 'if ($COND) { $$$ }')",
                    },
                    "language": {
                        "type": "string",
                        "description": "Language: python, javascript, typescript, rust, go, java, c, cpp",
                    },
                    "code": {
                        "type": "string",
                        "description": "Source code to search in (inline)",
                        "default": "",
                    },
                    "file_path": {
                        "type": "string",
                        "description": "File path to search in (alternative to inline code)",
                        "default": "",
                    },
                },
                "required": ["pattern", "language"],
            },
        ),
        Tool(
            name="astgrep_rewrite",
            description="Rewrite code using AST pattern matching — find and replace structurally",
            inputSchema={
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "AST pattern to find (e.g., 'console.log($MSG)')",
                    },
                    "rewrite": {
                        "type": "string",
                        "description": "Replacement pattern (e.g., 'logger.info($MSG)')",
                    },
                    "language": {
                        "type": "string",
                        "description": "Language of the source code",
                    },
                    "code": {
                        "type": "string",
                        "description": "Source code to transform",
                    },
                },
                "required": ["pattern", "rewrite", "language", "code"],
            },
        ),
        Tool(
            name="astgrep_status",
            description="Check ast-grep availability",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "astgrep_search":
            result = await _search(arguments)
        elif name == "astgrep_rewrite":
            result = await _rewrite(arguments)
        elif name == "astgrep_status":
            result = await _handle_status()
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _search(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "ast-grep-py not installed"}

    pattern = args["pattern"]
    language = args["language"]
    code = args.get("code", "")
    file_path = args.get("file_path", "")

    try:
        if not code and file_path:
            with open(file_path, "r", encoding="utf-8") as f:
                code = f.read()
        if not code:
            return {"status": "error", "message": "Provide either 'code' or 'file_path'"}

        root = SgRoot(code, language)
        node = root.root()
        matches = node.find_all(pattern)

        results = []
        for m in matches:
            results.append({
                "text": m.text(),
                "start": {"line": m.range().start.line, "col": m.range().start.column},
                "end": {"line": m.range().end.line, "col": m.range().end.column},
            })

        return {
            "status": "success",
            "pattern": pattern,
            "language": language,
            "match_count": len(results),
            "matches": results[:50],
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _rewrite(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "ast-grep-py not installed"}

    pattern = args["pattern"]
    rewrite = args["rewrite"]
    language = args["language"]
    code = args["code"]

    try:
        root = SgRoot(code, language)
        node = root.root()
        edits = node.replace_all(pattern, rewrite)

        new_code = root.commit_edits(edits) if edits else code
        return {
            "status": "success",
            "pattern": pattern,
            "rewrite": rewrite,
            "language": language,
            "edits_applied": len(edits),
            "original_length": len(code),
            "new_length": len(new_code),
            "transformed_code": new_code,
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
