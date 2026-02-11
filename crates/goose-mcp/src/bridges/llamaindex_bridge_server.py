#!/usr/bin/env python3
"""
LlamaIndex MCP Bridge Server for Super-Goose.

Wraps LlamaIndex for RAG (Retrieval Augmented Generation), exposing
index creation and querying via MCP stdio protocol.

Install: pip install mcp llama-index
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

BRIDGE_NAME = "llamaindex_bridge"
BRIDGE_DESCRIPTION = "LlamaIndex RAG -- index creation and document querying"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    from llama_index.core import VectorStoreIndex, Document, Settings
    from llama_index.llms.openai import OpenAI as LlamaOpenAI
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("llama-index not installed. Install: pip install llama-index")

# In-memory index store for the session
_indices: dict[str, Any] = {}

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="llamaindex_create_index",
            description="Create a vector index from documents for RAG querying",
            inputSchema={
                "type": "object",
                "properties": {
                    "index_name": {
                        "type": "string",
                        "description": "Name for this index",
                    },
                    "documents": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of document texts to index",
                    },
                    "directory": {
                        "type": "string",
                        "description": "Directory path to load documents from (alternative to documents)",
                        "default": "",
                    },
                },
                "required": ["index_name"],
            },
        ),
        Tool(
            name="llamaindex_query_index",
            description="Query an existing vector index with natural language",
            inputSchema={
                "type": "object",
                "properties": {
                    "index_name": {
                        "type": "string",
                        "description": "Name of the index to query",
                    },
                    "query": {
                        "type": "string",
                        "description": "Natural language query",
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "Number of top results to retrieve",
                        "default": 3,
                    },
                },
                "required": ["index_name", "query"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "llamaindex_create_index":
            result = await _create_index(arguments)
        elif name == "llamaindex_query_index":
            result = await _query_index(arguments)
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _create_index(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "llama-index not installed"}

    index_name = args["index_name"]
    doc_texts = args.get("documents", [])
    directory = args.get("directory", "")

    try:
        documents = []
        if doc_texts:
            documents = [Document(text=t) for t in doc_texts]
        elif directory:
            from llama_index.core import SimpleDirectoryReader
            documents = SimpleDirectoryReader(directory).load_data()

        if not documents:
            return {"status": "error", "message": "No documents provided"}

        index = VectorStoreIndex.from_documents(documents)
        _indices[index_name] = index
        return {
            "status": "success",
            "index_name": index_name,
            "document_count": len(documents),
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _query_index(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "llama-index not installed"}

    index_name = args["index_name"]
    query = args["query"]
    top_k = args.get("top_k", 3)

    if index_name not in _indices:
        return {
            "status": "error",
            "message": f"Index '{index_name}' not found. Available: {list(_indices.keys())}",
        }

    try:
        index = _indices[index_name]
        query_engine = index.as_query_engine(similarity_top_k=top_k)
        response = query_engine.query(query)
        sources = []
        if hasattr(response, "source_nodes"):
            sources = [
                {"text": node.text[:200], "score": getattr(node, "score", None)}
                for node in response.source_nodes
            ]
        return {
            "status": "success",
            "query": query,
            "answer": str(response),
            "sources": sources,
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
