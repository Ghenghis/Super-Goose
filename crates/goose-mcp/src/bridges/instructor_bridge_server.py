#!/usr/bin/env python3
"""
Instructor MCP Bridge Server for Super-Goose.

Wraps the Instructor library for structured LLM output extraction using
Pydantic models, exposing extraction and validation via MCP stdio.

Install: pip install mcp instructor
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

BRIDGE_NAME = "instructor_bridge"
BRIDGE_DESCRIPTION = "Instructor structured LLM output extraction"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    import instructor
    from openai import OpenAI
    from pydantic import BaseModel, create_model
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("instructor not installed. Install: pip install instructor openai")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="instructor_extract_structured",
            description="Extract structured data from text using LLM with Pydantic schema validation",
            inputSchema={
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "Input text to extract structured data from",
                    },
                    "schema": {
                        "type": "object",
                        "description": "JSON Schema describing the output structure (field_name: field_type pairs)",
                    },
                    "instruction": {
                        "type": "string",
                        "description": "Additional extraction instruction",
                        "default": "Extract the requested information from the text.",
                    },
                    "model": {
                        "type": "string",
                        "description": "LLM model to use",
                        "default": "gpt-4",
                    },
                },
                "required": ["text", "schema"],
            },
        ),
        Tool(
            name="instructor_validate",
            description="Validate and correct data against a schema using LLM",
            inputSchema={
                "type": "object",
                "properties": {
                    "data": {
                        "type": "object",
                        "description": "Data to validate",
                    },
                    "schema": {
                        "type": "object",
                        "description": "Expected JSON Schema",
                    },
                    "fix_errors": {
                        "type": "boolean",
                        "description": "Attempt to fix validation errors using LLM",
                        "default": True,
                    },
                },
                "required": ["data", "schema"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "instructor_extract_structured":
            result = await _extract_structured(arguments)
        elif name == "instructor_validate":
            result = await _validate(arguments)
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


def _build_pydantic_model(schema: dict[str, Any]) -> type:
    """Build a dynamic Pydantic model from a simple field:type schema."""
    type_map = {"string": str, "integer": int, "number": float, "boolean": bool}
    fields = {}
    for field_name, field_type in schema.items():
        py_type = type_map.get(str(field_type), str)
        fields[field_name] = (py_type, ...)
    return create_model("DynamicModel", **fields)


async def _extract_structured(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "instructor not installed"}

    text = args["text"]
    schema = args["schema"]
    instruction = args.get("instruction", "Extract the requested information.")
    model_name = args.get("model", "gpt-4")

    try:
        DynModel = _build_pydantic_model(schema)
        client = instructor.from_openai(OpenAI())
        result = client.chat.completions.create(
            model=model_name,
            response_model=DynModel,
            messages=[
                {"role": "system", "content": instruction},
                {"role": "user", "content": text},
            ],
        )
        return {
            "status": "success",
            "extracted": result.model_dump(),
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _validate(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "instructor not installed"}

    data = args["data"]
    schema = args["schema"]
    fix_errors = args.get("fix_errors", True)

    try:
        DynModel = _build_pydantic_model(schema)
        try:
            validated = DynModel(**data)
            return {
                "status": "valid",
                "data": validated.model_dump(),
            }
        except Exception as val_err:
            if not fix_errors:
                return {"status": "invalid", "errors": str(val_err)}

            client = instructor.from_openai(OpenAI())
            fixed = client.chat.completions.create(
                model="gpt-4",
                response_model=DynModel,
                messages=[
                    {"role": "system", "content": "Fix the data to match the schema."},
                    {"role": "user", "content": json.dumps(data)},
                ],
            )
            return {
                "status": "fixed",
                "original_errors": str(val_err),
                "fixed_data": fixed.model_dump(),
            }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
