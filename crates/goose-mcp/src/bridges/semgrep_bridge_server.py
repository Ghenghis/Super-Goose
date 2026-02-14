#!/usr/bin/env python3
"""
Semgrep MCP Bridge Server for Super-Goose.

Wraps Semgrep static analysis for code scanning, vulnerability detection,
and custom rule matching via MCP stdio protocol.

Install: pip install mcp semgrep
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

BRIDGE_NAME = "semgrep_bridge"
BRIDGE_DESCRIPTION = "Semgrep static analysis for vulnerability detection and code scanning"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    result = subprocess.run(["semgrep", "--version"], capture_output=True, text=True, timeout=10)
    if result.returncode == 0:
        _LIB_AVAILABLE = True
        _SEMGREP_VERSION = result.stdout.strip()
except (FileNotFoundError, subprocess.TimeoutExpired):
    logger.warning("semgrep not installed. Install: pip install semgrep")
    _SEMGREP_VERSION = "unknown"

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="semgrep_scan",
            description="Run Semgrep static analysis scan on a directory or file",
            inputSchema={
                "type": "object",
                "properties": {
                    "target": {
                        "type": "string",
                        "description": "Path to file or directory to scan",
                    },
                    "config": {
                        "type": "string",
                        "description": "Semgrep rule config (e.g., 'auto', 'p/security-audit', 'p/owasp-top-ten', or path to rules)",
                        "default": "auto",
                    },
                    "severity": {
                        "type": "string",
                        "description": "Minimum severity: INFO, WARNING, ERROR",
                        "default": "WARNING",
                    },
                    "max_findings": {
                        "type": "integer",
                        "description": "Maximum number of findings to return",
                        "default": 50,
                    },
                },
                "required": ["target"],
            },
        ),
        Tool(
            name="semgrep_scan_pattern",
            description="Run Semgrep with a custom pattern to find code matching a specific structure",
            inputSchema={
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Semgrep pattern (e.g., 'eval($X)', 'os.system(...)', '$X == None')",
                    },
                    "target": {
                        "type": "string",
                        "description": "Path to file or directory to search",
                    },
                    "language": {
                        "type": "string",
                        "description": "Language to scan (python, javascript, java, go, rust, etc.)",
                        "default": "python",
                    },
                },
                "required": ["pattern", "target"],
            },
        ),
        Tool(
            name="semgrep_status",
            description="Check Semgrep installation and version",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "semgrep_scan":
            result = await _scan(arguments)
        elif name == "semgrep_scan_pattern":
            result = await _scan_pattern(arguments)
        elif name == "semgrep_status":
            result = await _handle_status()
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _scan(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "semgrep not installed"}

    target = args["target"]
    config = args.get("config", "auto")
    severity = args.get("severity", "WARNING")
    max_findings = args.get("max_findings", 50)

    try:
        cmd = [
            "semgrep", "scan",
            "--config", config,
            "--json",
            "--severity", severity,
            target,
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
        output = json.loads(stdout.decode()) if stdout else {}

        findings = output.get("results", [])[:max_findings]
        summary = []
        for f in findings:
            summary.append({
                "rule": f.get("check_id", ""),
                "severity": f.get("extra", {}).get("severity", ""),
                "message": f.get("extra", {}).get("message", ""),
                "file": f.get("path", ""),
                "line": f.get("start", {}).get("line", 0),
            })

        return {
            "status": "success",
            "target": target,
            "config": config,
            "total_findings": len(output.get("results", [])),
            "findings_returned": len(summary),
            "findings": summary,
        }
    except asyncio.TimeoutError:
        return {"status": "error", "message": "Scan timed out after 120s"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _scan_pattern(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "semgrep not installed"}

    pattern = args["pattern"]
    target = args["target"]
    lang = args.get("language", "python")

    try:
        cmd = [
            "semgrep", "scan",
            "--pattern", pattern,
            "--lang", lang,
            "--json",
            target,
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=60)
        output = json.loads(stdout.decode()) if stdout else {}

        matches = []
        for r in output.get("results", []):
            matches.append({
                "file": r.get("path", ""),
                "line": r.get("start", {}).get("line", 0),
                "code": r.get("extra", {}).get("lines", ""),
            })

        return {
            "status": "success",
            "pattern": pattern,
            "language": lang,
            "target": target,
            "match_count": len(matches),
            "matches": matches,
        }
    except asyncio.TimeoutError:
        return {"status": "error", "message": "Pattern scan timed out"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _handle_status() -> dict[str, Any]:
    return {
        "bridge": BRIDGE_NAME,
        "version": BRIDGE_VERSION,
        "description": BRIDGE_DESCRIPTION,
        "library_available": _LIB_AVAILABLE,
        "semgrep_version": _SEMGREP_VERSION if _LIB_AVAILABLE else None,
        "status": "ready" if _LIB_AVAILABLE else "library_missing",
    }


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
