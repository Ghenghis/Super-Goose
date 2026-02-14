#!/usr/bin/env python3
"""
Overnight Gym MCP Bridge Server for Super-Goose.

Implements an automated testing gymnasium that runs comprehensive test
suites, benchmarks, and stress tests overnight. Collects results,
tracks regressions, and generates reports.

Install: pip install mcp pytest
"""

import asyncio
import json
import logging
import os
import sys
import time
from typing import Any

try:
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp.types import Tool, TextContent
except ImportError:
    print("Error: MCP SDK not installed. Run: pip install mcp", file=sys.stderr)
    sys.exit(1)

BRIDGE_NAME = "overnight_gym_bridge"
BRIDGE_DESCRIPTION = "Automated overnight testing gymnasium for test suites and benchmarks"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    import pytest
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("pytest not installed. Install: pip install pytest")

server = Server(BRIDGE_NAME)

# Track running test suites
_test_runs: dict[str, dict] = {}
_run_counter = 0


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="gym_run_suite",
            description="Run a test suite and collect results with timing and coverage",
            inputSchema={
                "type": "object",
                "properties": {
                    "test_path": {
                        "type": "string",
                        "description": "Path to test file or directory",
                    },
                    "runner": {
                        "type": "string",
                        "description": "Test runner: pytest, unittest, vitest, jest, cargo",
                        "default": "pytest",
                    },
                    "args": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Additional arguments for the test runner",
                        "default": [],
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "Total timeout in seconds",
                        "default": 600,
                    },
                    "collect_coverage": {
                        "type": "boolean",
                        "description": "Collect code coverage data",
                        "default": False,
                    },
                },
                "required": ["test_path"],
            },
        ),
        Tool(
            name="gym_benchmark",
            description="Run performance benchmarks and track results over time",
            inputSchema={
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "Benchmark command to execute",
                    },
                    "iterations": {
                        "type": "integer",
                        "description": "Number of iterations to run",
                        "default": 5,
                    },
                    "warmup": {
                        "type": "integer",
                        "description": "Number of warmup iterations (not measured)",
                        "default": 1,
                    },
                    "label": {
                        "type": "string",
                        "description": "Label for this benchmark run",
                        "default": "benchmark",
                    },
                },
                "required": ["command"],
            },
        ),
        Tool(
            name="gym_results",
            description="Get results from completed and running test runs",
            inputSchema={
                "type": "object",
                "properties": {
                    "run_id": {
                        "type": "string",
                        "description": "Specific run ID to check, or empty for all",
                        "default": "",
                    },
                },
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "gym_run_suite":
            result = await _run_suite(arguments)
        elif name == "gym_benchmark":
            result = await _benchmark(arguments)
        elif name == "gym_results":
            result = await _get_results(arguments)
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


def _build_test_command(runner: str, test_path: str, extra_args: list, coverage: bool) -> list[str]:
    """Build the test command based on runner type."""
    if runner == "pytest":
        cmd = [sys.executable, "-m", "pytest", test_path, "--tb=short", "-q"]
        if coverage:
            cmd.extend(["--cov", "--cov-report=json"])
        cmd.extend(extra_args)
    elif runner == "vitest":
        cmd = ["npx", "vitest", "run", test_path, "--reporter=json"]
        cmd.extend(extra_args)
    elif runner == "jest":
        cmd = ["npx", "jest", test_path, "--json"]
        cmd.extend(extra_args)
    elif runner == "cargo":
        cmd = ["cargo", "test"]
        if test_path != ".":
            cmd.extend(["--", test_path])
        cmd.extend(extra_args)
    else:
        cmd = [runner, test_path] + extra_args
    return cmd


async def _run_suite(args: dict[str, Any]) -> dict[str, Any]:
    test_path = args["test_path"]
    runner = args.get("runner", "pytest")
    extra_args = args.get("args", [])
    timeout = args.get("timeout", 600)
    coverage = args.get("collect_coverage", False)

    if runner == "pytest" and not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "pytest not installed"}

    global _run_counter
    _run_counter += 1
    run_id = f"gym-{_run_counter:04d}"
    start_time = time.time()

    try:
        cmd = _build_test_command(runner, test_path, extra_args, coverage)
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)

        elapsed = round(time.time() - start_time, 2)
        output = stdout.decode()[:10000] if stdout else ""
        errors = stderr.decode()[:5000] if stderr else ""

        run_data = {
            "run_id": run_id,
            "runner": runner,
            "test_path": test_path,
            "exit_code": proc.returncode,
            "elapsed_seconds": elapsed,
            "started_at": start_time,
            "status": "passed" if proc.returncode == 0 else "failed",
        }
        _test_runs[run_id] = run_data

        return {
            "status": "success",
            "run_id": run_id,
            "runner": runner,
            "test_path": test_path,
            "exit_code": proc.returncode,
            "passed": proc.returncode == 0,
            "elapsed_seconds": elapsed,
            "output": output,
            "errors": errors if proc.returncode != 0 else "",
        }
    except asyncio.TimeoutError:
        elapsed = round(time.time() - start_time, 2)
        _test_runs[run_id] = {
            "run_id": run_id, "runner": runner, "test_path": test_path,
            "status": "timeout", "elapsed_seconds": elapsed,
        }
        return {"status": "timeout", "run_id": run_id, "elapsed_seconds": elapsed}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _benchmark(args: dict[str, Any]) -> dict[str, Any]:
    command = args["command"]
    iterations = args.get("iterations", 5)
    warmup = args.get("warmup", 1)
    label = args.get("label", "benchmark")

    try:
        timings = []
        # Warmup
        for _ in range(warmup):
            proc = await asyncio.create_subprocess_shell(
                command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )
            await asyncio.wait_for(proc.communicate(), timeout=120)

        # Measured runs
        for i in range(iterations):
            start = time.time()
            proc = await asyncio.create_subprocess_shell(
                command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )
            await asyncio.wait_for(proc.communicate(), timeout=120)
            elapsed = time.time() - start
            timings.append(round(elapsed, 4))

        avg = sum(timings) / len(timings)
        sorted_t = sorted(timings)
        p50 = sorted_t[len(sorted_t) // 2]
        p95 = sorted_t[int(len(sorted_t) * 0.95)] if len(sorted_t) >= 2 else sorted_t[-1]

        return {
            "status": "success",
            "label": label,
            "command": command[:200],
            "iterations": iterations,
            "warmup": warmup,
            "timings_seconds": timings,
            "stats": {
                "mean": round(avg, 4),
                "min": min(timings),
                "max": max(timings),
                "p50": p50,
                "p95": p95,
            },
        }
    except asyncio.TimeoutError:
        return {"status": "error", "message": "Benchmark iteration timed out"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _get_results(args: dict[str, Any]) -> dict[str, Any]:
    run_id = args.get("run_id", "")

    if run_id:
        run = _test_runs.get(run_id)
        if not run:
            return {"status": "not_found", "run_id": run_id}
        return {"status": "success", "run": run}

    return {
        "status": "success",
        "total_runs": len(_test_runs),
        "passed": sum(1 for r in _test_runs.values() if r.get("status") == "passed"),
        "failed": sum(1 for r in _test_runs.values() if r.get("status") == "failed"),
        "timeout": sum(1 for r in _test_runs.values() if r.get("status") == "timeout"),
        "runs": list(_test_runs.values())[-20:],
    }


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
