#!/usr/bin/env python3
"""
Arrakis MCP Bridge Server for Super-Goose.

Wraps Arrakis distributed compute framework for distributing tasks across
worker nodes, managing job queues, and aggregating results via MCP stdio protocol.

Install: pip install mcp arrakis-compute
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

BRIDGE_NAME = "arrakis_bridge"
BRIDGE_DESCRIPTION = "Arrakis distributed compute for parallel task execution"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    import arrakis
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("arrakis not installed. Install: pip install arrakis-compute")

server = Server(BRIDGE_NAME)

# In-memory job tracking
_jobs: dict[str, dict] = {}
_job_counter = 0


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="arrakis_submit_job",
            description="Submit a distributed compute job to the Arrakis cluster",
            inputSchema={
                "type": "object",
                "properties": {
                    "task_type": {
                        "type": "string",
                        "description": "Type of compute task: map_reduce, scatter_gather, pipeline, batch",
                    },
                    "payload": {
                        "type": "string",
                        "description": "JSON payload for the compute task",
                    },
                    "workers": {
                        "type": "integer",
                        "description": "Number of worker nodes to use",
                        "default": 4,
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "Job timeout in seconds",
                        "default": 300,
                    },
                },
                "required": ["task_type", "payload"],
            },
        ),
        Tool(
            name="arrakis_job_status",
            description="Check the status of a submitted job",
            inputSchema={
                "type": "object",
                "properties": {
                    "job_id": {
                        "type": "string",
                        "description": "Job ID to check",
                    },
                },
                "required": ["job_id"],
            },
        ),
        Tool(
            name="arrakis_cluster_info",
            description="Get Arrakis cluster status, available nodes, and capacity",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "arrakis_submit_job":
            result = await _submit_job(arguments)
        elif name == "arrakis_job_status":
            result = await _job_status(arguments)
        elif name == "arrakis_cluster_info":
            result = await _cluster_info()
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _submit_job(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "arrakis-compute not installed"}

    task_type = args["task_type"]
    payload = args["payload"]
    workers = args.get("workers", 4)
    timeout = args.get("timeout", 300)

    try:
        cluster = arrakis.Cluster()
        job = await cluster.submit(
            task_type=task_type,
            payload=json.loads(payload) if isinstance(payload, str) else payload,
            num_workers=workers,
            timeout=timeout,
        )
        global _job_counter
        _job_counter += 1
        job_id = f"arrakis-{_job_counter:04d}"
        _jobs[job_id] = {
            "task_type": task_type,
            "workers": workers,
            "submitted_at": time.time(),
            "status": "running",
            "job_ref": job,
        }
        return {
            "status": "submitted",
            "job_id": job_id,
            "task_type": task_type,
            "workers": workers,
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _job_status(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "arrakis-compute not installed"}

    job_id = args["job_id"]
    job = _jobs.get(job_id)
    if not job:
        return {"status": "not_found", "job_id": job_id}

    try:
        job_ref = job.get("job_ref")
        if job_ref and hasattr(job_ref, "status"):
            actual_status = job_ref.status()
            return {
                "status": "success",
                "job_id": job_id,
                "job_status": actual_status,
                "task_type": job["task_type"],
                "elapsed_s": round(time.time() - job["submitted_at"], 1),
            }
        return {
            "status": "success",
            "job_id": job_id,
            "job_status": job["status"],
            "task_type": job["task_type"],
            "elapsed_s": round(time.time() - job["submitted_at"], 1),
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _cluster_info() -> dict[str, Any]:
    info = {
        "bridge": BRIDGE_NAME,
        "version": BRIDGE_VERSION,
        "description": BRIDGE_DESCRIPTION,
        "library_available": _LIB_AVAILABLE,
        "status": "ready" if _LIB_AVAILABLE else "library_missing",
        "active_jobs": len(_jobs),
    }
    if _LIB_AVAILABLE:
        try:
            cluster = arrakis.Cluster()
            nodes = cluster.list_nodes()
            info["nodes"] = len(nodes)
            info["total_capacity"] = sum(n.capacity for n in nodes if hasattr(n, "capacity"))
        except Exception:
            info["nodes"] = 0
            info["total_capacity"] = 0
    return info


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
