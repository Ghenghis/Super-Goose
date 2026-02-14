#!/usr/bin/env python3
"""
CrossHair MCP Bridge Server for Super-Goose.

Wraps CrossHair for symbolic execution and contract-based testing of
Python code. Finds counterexamples to function contracts and type hints.

Install: pip install mcp crosshair-tool
"""

import asyncio
import json
import logging
import sys
import tempfile
import os
from typing import Any

try:
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp.types import Tool, TextContent
except ImportError:
    print("Error: MCP SDK not installed. Run: pip install mcp", file=sys.stderr)
    sys.exit(1)

BRIDGE_NAME = "crosshair_bridge"
BRIDGE_DESCRIPTION = "CrossHair symbolic testing for Python contract verification"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    from crosshair.core_and_libs import analyze_function
    from crosshair.options import AnalysisOptionSet
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("crosshair not installed. Install: pip install crosshair-tool")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="crosshair_check",
            description="Check Python function contracts using symbolic execution to find counterexamples",
            inputSchema={
                "type": "object",
                "properties": {
                    "code": {
                        "type": "string",
                        "description": "Python code with type hints and pre/postconditions to verify",
                    },
                    "function_name": {
                        "type": "string",
                        "description": "Name of the function to check",
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "Analysis timeout in seconds per condition",
                        "default": 30,
                    },
                },
                "required": ["code", "function_name"],
            },
        ),
        Tool(
            name="crosshair_check_file",
            description="Check all contracts in a Python file",
            inputSchema={
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Path to Python file to analyze",
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "Per-condition timeout in seconds",
                        "default": 30,
                    },
                },
                "required": ["file_path"],
            },
        ),
        Tool(
            name="crosshair_status",
            description="Check CrossHair availability and supported features",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "crosshair_check":
            result = await _check(arguments)
        elif name == "crosshair_check_file":
            result = await _check_file(arguments)
        elif name == "crosshair_status":
            result = await _handle_status()
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _check(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "crosshair-tool not installed"}

    code = args["code"]
    func_name = args["function_name"]
    timeout = args.get("timeout", 30)

    try:
        # Write code to temp file, import and analyze
        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
            f.write(code)
            tmp_path = f.name

        import importlib.util
        spec = importlib.util.spec_from_file_location("_ch_module", tmp_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        fn = getattr(mod, func_name, None)
        if fn is None:
            os.unlink(tmp_path)
            return {"status": "error", "message": f"Function '{func_name}' not found in code"}

        options = AnalysisOptionSet(per_condition_timeout=timeout)
        messages = list(analyze_function(fn, options))
        os.unlink(tmp_path)

        issues = []
        for msg in messages:
            issues.append({
                "message": str(msg),
                "state": msg.state.name if hasattr(msg, "state") else "unknown",
            })

        return {
            "status": "success",
            "function": func_name,
            "verified": len(issues) == 0,
            "issue_count": len(issues),
            "issues": issues,
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _check_file(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "crosshair-tool not installed"}

    file_path = args["file_path"]
    timeout = args.get("timeout", 30)

    try:
        if not os.path.exists(file_path):
            return {"status": "error", "message": f"File not found: {file_path}"}

        # Use CLI for file-level analysis
        cmd = ["crosshair", "check", "--per_condition_timeout", str(timeout), file_path]
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout * 5)

        output = stdout.decode().strip() if stdout else ""
        errors = stderr.decode().strip() if stderr else ""

        issues = [line for line in output.splitlines() if line.strip()] if output else []

        return {
            "status": "success",
            "file": file_path,
            "verified": len(issues) == 0,
            "issue_count": len(issues),
            "issues": issues[:20],
            "errors": errors[:500] if errors else "",
        }
    except asyncio.TimeoutError:
        return {"status": "error", "message": f"Analysis timed out after {timeout * 5}s"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _handle_status() -> dict[str, Any]:
    return {
        "bridge": BRIDGE_NAME,
        "version": BRIDGE_VERSION,
        "description": BRIDGE_DESCRIPTION,
        "library_available": _LIB_AVAILABLE,
        "status": "ready" if _LIB_AVAILABLE else "library_missing",
        "features": ["contract_checking", "symbolic_execution", "counterexample_generation"]
        if _LIB_AVAILABLE else [],
    }


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
