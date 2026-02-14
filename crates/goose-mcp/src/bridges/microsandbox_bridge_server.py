#!/usr/bin/env python3
"""
MicroSandbox MCP Bridge Server for Super-Goose.

Wraps microsandbox for secure container-based code execution, providing
isolated sandbox environments for running untrusted code via MCP stdio protocol.

Install: pip install mcp microsandbox
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

BRIDGE_NAME = "microsandbox_bridge"
BRIDGE_DESCRIPTION = "MicroSandbox container-based secure code execution"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    import microsandbox
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("microsandbox not installed. Install: pip install microsandbox")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="sandbox_execute",
            description="Execute code in an isolated container sandbox",
            inputSchema={
                "type": "object",
                "properties": {
                    "code": {
                        "type": "string",
                        "description": "Code to execute in the sandbox",
                    },
                    "language": {
                        "type": "string",
                        "description": "Language: python, javascript, bash, ruby",
                        "default": "python",
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "Execution timeout in seconds",
                        "default": 30,
                    },
                    "memory_limit_mb": {
                        "type": "integer",
                        "description": "Memory limit in megabytes",
                        "default": 256,
                    },
                    "network": {
                        "type": "boolean",
                        "description": "Allow network access in the sandbox",
                        "default": False,
                    },
                },
                "required": ["code"],
            },
        ),
        Tool(
            name="sandbox_execute_file",
            description="Execute a file in an isolated container sandbox",
            inputSchema={
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Path to file to execute",
                    },
                    "args": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Command-line arguments to pass",
                        "default": [],
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "Execution timeout in seconds",
                        "default": 60,
                    },
                },
                "required": ["file_path"],
            },
        ),
        Tool(
            name="sandbox_status",
            description="Check microsandbox availability and container runtime status",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "sandbox_execute":
            result = await _execute(arguments)
        elif name == "sandbox_execute_file":
            result = await _execute_file(arguments)
        elif name == "sandbox_status":
            result = await _handle_status()
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _execute(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "microsandbox not installed"}

    code = args["code"]
    language = args.get("language", "python")
    timeout = args.get("timeout", 30)
    memory_mb = args.get("memory_limit_mb", 256)
    network = args.get("network", False)

    try:
        sandbox = microsandbox.Sandbox(
            language=language,
            memory_limit=f"{memory_mb}m",
            timeout=timeout,
            network=network,
        )
        result = await sandbox.run(code)
        return {
            "status": "success",
            "language": language,
            "stdout": result.stdout[:5000] if hasattr(result, "stdout") else "",
            "stderr": result.stderr[:2000] if hasattr(result, "stderr") else "",
            "exit_code": result.exit_code if hasattr(result, "exit_code") else 0,
            "execution_time_ms": result.duration_ms if hasattr(result, "duration_ms") else None,
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _execute_file(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "microsandbox not installed"}

    file_path = args["file_path"]
    cmd_args = args.get("args", [])
    timeout = args.get("timeout", 60)

    try:
        import os
        if not os.path.exists(file_path):
            return {"status": "error", "message": f"File not found: {file_path}"}

        ext = os.path.splitext(file_path)[1]
        lang_map = {".py": "python", ".js": "javascript", ".sh": "bash", ".rb": "ruby"}
        language = lang_map.get(ext, "python")

        with open(file_path, "r") as f:
            code = f.read()

        sandbox = microsandbox.Sandbox(language=language, timeout=timeout)
        result = await sandbox.run(code, args=cmd_args)
        return {
            "status": "success",
            "file": file_path,
            "language": language,
            "stdout": result.stdout[:5000] if hasattr(result, "stdout") else "",
            "stderr": result.stderr[:2000] if hasattr(result, "stderr") else "",
            "exit_code": result.exit_code if hasattr(result, "exit_code") else 0,
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
        info["supported_languages"] = ["python", "javascript", "bash", "ruby"]
    return info


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
