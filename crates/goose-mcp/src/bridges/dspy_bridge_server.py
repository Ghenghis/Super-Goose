#!/usr/bin/env python3
"""
DSPy MCP Bridge Server for Super-Goose.

Wraps the DSPy framework for programmatic prompt optimization and
few-shot learning, exposing compilation and prediction via MCP stdio.

Install: pip install mcp dspy-ai
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

BRIDGE_NAME = "dspy_bridge"
BRIDGE_DESCRIPTION = "DSPy prompt optimization and few-shot learning"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    import dspy
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("dspy-ai not installed. Install: pip install dspy-ai")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="dspy_compile_program",
            description="Compile a DSPy program with optimized prompts using training examples",
            inputSchema={
                "type": "object",
                "properties": {
                    "signature": {
                        "type": "string",
                        "description": "DSPy signature string (e.g., 'question -> answer')",
                    },
                    "examples": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "description": "Training example with input/output fields",
                        },
                        "description": "Training examples for optimization",
                        "default": [],
                    },
                    "optimizer": {
                        "type": "string",
                        "description": "Optimizer: bootstrap_fewshot, mipro, copro",
                        "default": "bootstrap_fewshot",
                    },
                },
                "required": ["signature"],
            },
        ),
        Tool(
            name="dspy_predict",
            description="Run a DSPy prediction with a given signature and input",
            inputSchema={
                "type": "object",
                "properties": {
                    "signature": {
                        "type": "string",
                        "description": "DSPy signature (e.g., 'question -> answer')",
                    },
                    "inputs": {
                        "type": "object",
                        "description": "Input fields matching the signature",
                    },
                    "model": {
                        "type": "string",
                        "description": "LLM model to use",
                        "default": "openai/gpt-4",
                    },
                },
                "required": ["signature", "inputs"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "dspy_compile_program":
            result = await _compile_program(arguments)
        elif name == "dspy_predict":
            result = await _predict(arguments)
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _compile_program(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "dspy-ai not installed"}

    signature = args["signature"]
    examples = args.get("examples", [])
    optimizer = args.get("optimizer", "bootstrap_fewshot")

    try:
        lm = dspy.LM("openai/gpt-4")
        dspy.configure(lm=lm)
        module = dspy.ChainOfThought(signature)

        if examples:
            trainset = [dspy.Example(**ex).with_inputs(*list(ex.keys())[:1]) for ex in examples]
            if optimizer == "bootstrap_fewshot":
                teleprompter = dspy.BootstrapFewShot(max_bootstrapped_demos=len(trainset))
                compiled = teleprompter.compile(module, trainset=trainset)
                return {
                    "status": "success",
                    "signature": signature,
                    "optimizer": optimizer,
                    "num_examples": len(trainset),
                    "compiled": True,
                }
        return {
            "status": "success",
            "signature": signature,
            "message": "Module created (no examples provided for compilation)",
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _predict(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "dspy-ai not installed"}

    signature = args["signature"]
    inputs = args["inputs"]
    model = args.get("model", "openai/gpt-4")

    try:
        lm = dspy.LM(model)
        dspy.configure(lm=lm)
        predictor = dspy.ChainOfThought(signature)
        prediction = predictor(**inputs)
        result_fields = {k: str(v) for k, v in prediction.items() if not k.startswith("_")}
        return {
            "status": "success",
            "signature": signature,
            "inputs": inputs,
            "outputs": result_fields,
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
