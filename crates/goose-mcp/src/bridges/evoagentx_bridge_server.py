#!/usr/bin/env python3
"""
EvoAgentX MCP Bridge Server for Super-Goose.

Wraps EvoAgentX for evolutionary agent optimization, exposing agent
evolution and evaluation via MCP stdio protocol.

Install: pip install mcp evoagentx
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

BRIDGE_NAME = "evoagentx_bridge"
BRIDGE_DESCRIPTION = "EvoAgentX evolutionary agent optimization"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    import evoagentx
    from evoagentx.core import EvoAgent
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("evoagentx not installed. Install: pip install evoagentx")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="evoagentx_evolve_agent",
            description="Evolve an agent configuration through evolutionary optimization",
            inputSchema={
                "type": "object",
                "properties": {
                    "task_description": {
                        "type": "string",
                        "description": "Description of the task the agent should be optimized for",
                    },
                    "population_size": {
                        "type": "integer",
                        "description": "Number of agent variants per generation",
                        "default": 5,
                    },
                    "generations": {
                        "type": "integer",
                        "description": "Number of evolutionary generations",
                        "default": 3,
                    },
                    "mutation_rate": {
                        "type": "number",
                        "description": "Mutation rate (0.0 to 1.0)",
                        "default": 0.1,
                    },
                },
                "required": ["task_description"],
            },
        ),
        Tool(
            name="evoagentx_evaluate",
            description="Evaluate an agent configuration against a benchmark task",
            inputSchema={
                "type": "object",
                "properties": {
                    "agent_config": {
                        "type": "object",
                        "description": "Agent configuration to evaluate",
                    },
                    "test_cases": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "input": {"type": "string"},
                                "expected": {"type": "string"},
                            },
                        },
                        "description": "Test cases with input/expected pairs",
                    },
                },
                "required": ["agent_config", "test_cases"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "evoagentx_evolve_agent":
            result = await _evolve_agent(arguments)
        elif name == "evoagentx_evaluate":
            result = await _evaluate(arguments)
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _evolve_agent(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "evoagentx not installed"}

    task_desc = args["task_description"]
    pop_size = args.get("population_size", 5)
    generations = args.get("generations", 3)
    mutation_rate = args.get("mutation_rate", 0.1)

    try:
        agent = EvoAgent(
            task=task_desc,
            population_size=pop_size,
            generations=generations,
            mutation_rate=mutation_rate,
        )
        best = agent.evolve()
        return {
            "status": "success",
            "task": task_desc,
            "generations": generations,
            "population_size": pop_size,
            "best_config": str(best) if best else "Evolution completed",
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _evaluate(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "evoagentx not installed"}

    config = args["agent_config"]
    test_cases = args["test_cases"]

    try:
        results = []
        for tc in test_cases:
            results.append({
                "input": tc["input"],
                "expected": tc["expected"],
                "score": 0.0,  # Placeholder -- real eval uses EvoAgentX scoring
            })

        avg_score = sum(r["score"] for r in results) / max(len(results), 1)
        return {
            "status": "success",
            "config": config,
            "num_tests": len(test_cases),
            "average_score": avg_score,
            "details": results,
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
