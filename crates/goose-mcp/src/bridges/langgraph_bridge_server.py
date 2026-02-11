#!/usr/bin/env python3
"""
LangGraph MCP Bridge Server for Super-Goose.

Wraps LangGraph for stateful agent workflows, exposing graph creation
and execution via MCP stdio protocol.

Install: pip install mcp langgraph langchain-openai
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

BRIDGE_NAME = "langgraph_bridge"
BRIDGE_DESCRIPTION = "LangGraph stateful agent workflows"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    from langgraph.graph import StateGraph, END
    from langchain_openai import ChatOpenAI
    from langchain_core.messages import HumanMessage
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("langgraph not installed. Install: pip install langgraph langchain-openai")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="langgraph_run_graph",
            description="Run a LangGraph stateful workflow with a task",
            inputSchema={
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "Task to process through the graph workflow",
                    },
                    "nodes": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Named workflow steps/nodes (e.g., ['research', 'draft', 'review'])",
                        "default": ["process"],
                    },
                    "model": {
                        "type": "string",
                        "description": "LLM model name",
                        "default": "gpt-4",
                    },
                },
                "required": ["task"],
            },
        ),
        Tool(
            name="langgraph_create_graph",
            description="Create and describe a LangGraph workflow structure",
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Workflow name",
                    },
                    "nodes": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "description": {"type": "string"},
                            },
                            "required": ["name"],
                        },
                        "description": "Node definitions for the graph",
                    },
                    "edges": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "from": {"type": "string"},
                                "to": {"type": "string"},
                            },
                        },
                        "description": "Edge connections between nodes",
                    },
                },
                "required": ["name", "nodes"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "langgraph_run_graph":
            result = await _run_graph(arguments)
        elif name == "langgraph_create_graph":
            result = await _create_graph(arguments)
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _run_graph(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "langgraph not installed"}

    task = args["task"]
    node_names = args.get("nodes", ["process"])
    model_name = args.get("model", "gpt-4")

    try:
        from typing import TypedDict
        class GraphState(TypedDict):
            messages: list
            result: str

        llm = ChatOpenAI(model=model_name, temperature=0)

        def process_node(state: GraphState) -> GraphState:
            msgs = state.get("messages", [])
            response = llm.invoke(msgs)
            return {"messages": msgs + [response], "result": response.content}

        builder = StateGraph(GraphState)
        prev_node = None
        for node_name in node_names:
            builder.add_node(node_name, process_node)
            if prev_node:
                builder.add_edge(prev_node, node_name)
            prev_node = node_name

        builder.set_entry_point(node_names[0])
        builder.add_edge(node_names[-1], END)
        graph = builder.compile()

        result = await graph.ainvoke({
            "messages": [HumanMessage(content=task)],
            "result": "",
        })
        return {
            "status": "success",
            "task": task,
            "nodes": node_names,
            "result": result.get("result", ""),
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _create_graph(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "langgraph not installed"}

    name = args["name"]
    nodes = args["nodes"]
    edges = args.get("edges", [])

    return {
        "status": "success",
        "graph_name": name,
        "node_count": len(nodes),
        "edge_count": len(edges),
        "nodes": [n["name"] for n in nodes],
        "edges": [f"{e['from']} -> {e['to']}" for e in edges],
        "message": "Graph structure defined. Use langgraph_run_graph to execute.",
    }


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
