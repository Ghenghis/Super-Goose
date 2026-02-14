#!/usr/bin/env python3
"""
Pydantic AI MCP Bridge Server for Super-Goose.

Wraps PydanticAI for structured LLM output generation with type-safe
validation, enabling reliable extraction of typed data from LLMs.

Install: pip install mcp pydantic-ai
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

BRIDGE_NAME = "pydantic_ai_bridge"
BRIDGE_DESCRIPTION = "PydanticAI structured LLM output with type-safe validation"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    from pydantic_ai import Agent as PydanticAgent
    from pydantic import BaseModel, create_model
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("pydantic-ai not installed. Install: pip install pydantic-ai")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="pydantic_ai_extract",
            description="Extract structured data from text using an LLM with Pydantic type validation",
            inputSchema={
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "Text or prompt to extract structured data from",
                    },
                    "schema": {
                        "type": "object",
                        "description": "JSON Schema describing the output structure (field names -> types)",
                        "additionalProperties": True,
                    },
                    "model": {
                        "type": "string",
                        "description": "LLM model to use (e.g., 'openai:gpt-4', 'anthropic:claude-3-opus')",
                        "default": "openai:gpt-4",
                    },
                    "system_prompt": {
                        "type": "string",
                        "description": "System prompt for the extraction agent",
                        "default": "Extract the requested information accurately.",
                    },
                },
                "required": ["prompt", "schema"],
            },
        ),
        Tool(
            name="pydantic_ai_generate",
            description="Generate structured output from a prompt with Pydantic validation",
            inputSchema={
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "Prompt to generate structured output from",
                    },
                    "result_type": {
                        "type": "string",
                        "description": "Expected output type: str, int, float, bool, list, dict",
                        "default": "str",
                    },
                    "model": {
                        "type": "string",
                        "description": "LLM model to use",
                        "default": "openai:gpt-4",
                    },
                },
                "required": ["prompt"],
            },
        ),
        Tool(
            name="pydantic_ai_status",
            description="Check PydanticAI availability and supported models",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "pydantic_ai_extract":
            result = await _extract(arguments)
        elif name == "pydantic_ai_generate":
            result = await _generate(arguments)
        elif name == "pydantic_ai_status":
            result = await _handle_status()
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


def _build_model_from_schema(schema: dict) -> type:
    """Build a Pydantic model from a simple JSON schema dict."""
    type_map = {
        "string": (str, ...),
        "integer": (int, ...),
        "number": (float, ...),
        "boolean": (bool, ...),
        "array": (list, ...),
    }
    fields = {}
    props = schema.get("properties", schema)
    for name, spec in props.items():
        if isinstance(spec, dict):
            t = spec.get("type", "string")
            fields[name] = type_map.get(t, (str, ...))
        else:
            fields[name] = (str, ...)
    return create_model("DynamicOutput", **fields)


async def _extract(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "pydantic-ai not installed"}

    prompt = args["prompt"]
    schema = args["schema"]
    model = args.get("model", "openai:gpt-4")
    system = args.get("system_prompt", "Extract the requested information accurately.")

    try:
        OutputModel = _build_model_from_schema(schema)
        agent = PydanticAgent(model, result_type=OutputModel, system_prompt=system)
        result = await agent.run(prompt)

        return {
            "status": "success",
            "model": model,
            "extracted": result.data.model_dump() if hasattr(result.data, "model_dump") else str(result.data),
            "usage": {
                "request_tokens": result.usage().request_tokens if hasattr(result, "usage") else None,
                "response_tokens": result.usage().response_tokens if hasattr(result, "usage") else None,
            },
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _generate(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "pydantic-ai not installed"}

    prompt = args["prompt"]
    result_type = args.get("result_type", "str")
    model = args.get("model", "openai:gpt-4")

    type_map = {"str": str, "int": int, "float": float, "bool": bool, "list": list, "dict": dict}
    py_type = type_map.get(result_type, str)

    try:
        agent = PydanticAgent(model, result_type=py_type)
        result = await agent.run(prompt)

        return {
            "status": "success",
            "model": model,
            "result_type": result_type,
            "result": result.data if not isinstance(result.data, (dict, list)) else json.loads(json.dumps(result.data, default=str)),
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
        "supported_types": ["str", "int", "float", "bool", "list", "dict", "custom_schema"]
        if _LIB_AVAILABLE else [],
    }


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
