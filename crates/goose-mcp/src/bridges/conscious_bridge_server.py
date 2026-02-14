#!/usr/bin/env python3
"""
Conscious Meta-Cognitive MCP Bridge Server for Super-Goose.

Implements a meta-cognitive framework for self-reflection, reasoning
transparency, and confidence calibration. Tracks reasoning chains,
identifies cognitive biases, and provides introspection tools.

Install: pip install mcp
"""

import asyncio
import json
import logging
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

BRIDGE_NAME = "conscious_bridge"
BRIDGE_DESCRIPTION = "Meta-cognitive framework for self-reflection and reasoning transparency"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

# Built-in framework — no external library needed
_LIB_AVAILABLE = True

server = Server(BRIDGE_NAME)

# In-memory reasoning trace store
_reasoning_traces: list[dict] = []
_reflection_log: list[dict] = []


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="conscious_reflect",
            description="Perform structured self-reflection on a reasoning chain or decision",
            inputSchema={
                "type": "object",
                "properties": {
                    "thought": {
                        "type": "string",
                        "description": "The reasoning step or decision to reflect on",
                    },
                    "confidence": {
                        "type": "number",
                        "description": "Confidence level (0.0 to 1.0) in this reasoning step",
                        "default": 0.5,
                    },
                    "assumptions": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of assumptions underlying this reasoning",
                        "default": [],
                    },
                    "alternatives": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Alternative approaches considered",
                        "default": [],
                    },
                },
                "required": ["thought"],
            },
        ),
        Tool(
            name="conscious_bias_check",
            description="Check for cognitive biases in a reasoning chain",
            inputSchema={
                "type": "object",
                "properties": {
                    "reasoning": {
                        "type": "string",
                        "description": "The reasoning chain to check for biases",
                    },
                    "context": {
                        "type": "string",
                        "description": "Context or domain of the reasoning",
                        "default": "",
                    },
                },
                "required": ["reasoning"],
            },
        ),
        Tool(
            name="conscious_introspect",
            description="Get introspection summary of reasoning traces and reflections",
            inputSchema={
                "type": "object",
                "properties": {
                    "last_n": {
                        "type": "integer",
                        "description": "Number of recent traces to include",
                        "default": 10,
                    },
                },
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "conscious_reflect":
            result = await _reflect(arguments)
        elif name == "conscious_bias_check":
            result = await _bias_check(arguments)
        elif name == "conscious_introspect":
            result = await _introspect(arguments)
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


_BIAS_PATTERNS = {
    "confirmation_bias": [
        "confirms", "validates", "supports my", "as expected", "proves that",
    ],
    "anchoring_bias": [
        "first", "initial", "originally", "started with", "based on the first",
    ],
    "availability_bias": [
        "recently", "saw that", "remember when", "familiar", "common",
    ],
    "sunk_cost_fallacy": [
        "already invested", "too far to", "can't give up", "already spent",
    ],
    "overconfidence": [
        "definitely", "certainly", "no doubt", "impossible that", "guaranteed",
    ],
    "recency_bias": [
        "just happened", "latest", "most recent", "new trend",
    ],
}


async def _reflect(args: dict[str, Any]) -> dict[str, Any]:
    thought = args["thought"]
    confidence = args.get("confidence", 0.5)
    assumptions = args.get("assumptions", [])
    alternatives = args.get("alternatives", [])

    # Calibration warnings
    warnings = []
    if confidence > 0.9 and not alternatives:
        warnings.append("High confidence with no alternatives considered — possible overconfidence")
    if confidence < 0.3 and not assumptions:
        warnings.append("Low confidence with no explicit assumptions — consider listing unknowns")
    if len(assumptions) == 0:
        warnings.append("No assumptions listed — all reasoning has hidden assumptions")

    trace = {
        "timestamp": time.time(),
        "thought": thought,
        "confidence": confidence,
        "assumptions": assumptions,
        "alternatives": alternatives,
        "warnings": warnings,
    }
    _reasoning_traces.append(trace)

    return {
        "status": "success",
        "trace_id": len(_reasoning_traces) - 1,
        "confidence": confidence,
        "confidence_label": (
            "very_low" if confidence < 0.2 else
            "low" if confidence < 0.4 else
            "moderate" if confidence < 0.6 else
            "high" if confidence < 0.8 else
            "very_high"
        ),
        "assumption_count": len(assumptions),
        "alternatives_count": len(alternatives),
        "warnings": warnings,
    }


async def _bias_check(args: dict[str, Any]) -> dict[str, Any]:
    reasoning = args["reasoning"].lower()
    context = args.get("context", "")

    detected_biases = []
    for bias_name, indicators in _BIAS_PATTERNS.items():
        matches = [ind for ind in indicators if ind in reasoning]
        if matches:
            detected_biases.append({
                "bias": bias_name,
                "confidence": min(0.3 + 0.2 * len(matches), 0.9),
                "indicators": matches,
                "mitigation": _get_mitigation(bias_name),
            })

    _reflection_log.append({
        "timestamp": time.time(),
        "type": "bias_check",
        "reasoning_preview": reasoning[:100],
        "biases_found": len(detected_biases),
    })

    return {
        "status": "success",
        "reasoning_length": len(reasoning),
        "biases_detected": len(detected_biases),
        "risk_level": (
            "low" if len(detected_biases) == 0 else
            "moderate" if len(detected_biases) <= 2 else
            "high"
        ),
        "biases": detected_biases,
    }


def _get_mitigation(bias_name: str) -> str:
    mitigations = {
        "confirmation_bias": "Actively seek disconfirming evidence; argue the opposite position",
        "anchoring_bias": "Re-evaluate from scratch without reference to initial values",
        "availability_bias": "Use base rates and statistics instead of memorable examples",
        "sunk_cost_fallacy": "Evaluate decision based only on future costs and benefits",
        "overconfidence": "Assign explicit probabilities; consider what would change your mind",
        "recency_bias": "Look at historical data over longer time periods",
    }
    return mitigations.get(bias_name, "Consider multiple perspectives and evidence sources")


async def _introspect(args: dict[str, Any]) -> dict[str, Any]:
    last_n = args.get("last_n", 10)
    recent_traces = _reasoning_traces[-last_n:]
    recent_reflections = _reflection_log[-last_n:]

    avg_confidence = 0.0
    if recent_traces:
        avg_confidence = sum(t["confidence"] for t in recent_traces) / len(recent_traces)

    total_warnings = sum(len(t.get("warnings", [])) for t in recent_traces)
    total_biases = sum(r.get("biases_found", 0) for r in recent_reflections)

    return {
        "status": "success",
        "total_traces": len(_reasoning_traces),
        "total_reflections": len(_reflection_log),
        "recent_window": last_n,
        "average_confidence": round(avg_confidence, 3),
        "total_warnings": total_warnings,
        "total_biases_flagged": total_biases,
        "metacognitive_health": (
            "good" if total_warnings <= 2 and total_biases <= 1 else
            "moderate" if total_warnings <= 5 and total_biases <= 3 else
            "needs_attention"
        ),
        "recent_traces": [
            {"thought": t["thought"][:80], "confidence": t["confidence"]}
            for t in recent_traces
        ],
    }


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
