#!/usr/bin/env python3
"""
SWE-Agent MCP Bridge Server for Super-Goose.

Wraps SWE-Agent for automated software engineering — bug fixing,
issue resolution, and code repair via MCP stdio protocol.

Install: pip install mcp sweagent
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

BRIDGE_NAME = "swe_agent_bridge"
BRIDGE_DESCRIPTION = "SWE-Agent for automated bug fixing and software engineering"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    import sweagent
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("sweagent not installed. Install: pip install sweagent")

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="swe_agent_fix_issue",
            description="Use SWE-Agent to fix a GitHub issue or bug description",
            inputSchema={
                "type": "object",
                "properties": {
                    "issue": {
                        "type": "string",
                        "description": "Issue description or GitHub issue URL",
                    },
                    "repo": {
                        "type": "string",
                        "description": "Repository path or GitHub URL (e.g., 'owner/repo')",
                    },
                    "model": {
                        "type": "string",
                        "description": "LLM model to use",
                        "default": "gpt-4",
                    },
                    "max_cost": {
                        "type": "number",
                        "description": "Maximum cost budget in USD",
                        "default": 2.0,
                    },
                },
                "required": ["issue", "repo"],
            },
        ),
        Tool(
            name="swe_agent_run_command",
            description="Run SWE-Agent with a custom prompt on a repo",
            inputSchema={
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "Custom prompt/instruction for SWE-Agent",
                    },
                    "repo": {
                        "type": "string",
                        "description": "Repository path or URL",
                    },
                    "config": {
                        "type": "string",
                        "description": "SWE-Agent config name or path",
                        "default": "default",
                    },
                },
                "required": ["prompt", "repo"],
            },
        ),
        Tool(
            name="swe_agent_status",
            description="Check SWE-Agent availability and configuration",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "swe_agent_fix_issue":
            result = await _fix_issue(arguments)
        elif name == "swe_agent_run_command":
            result = await _run_command(arguments)
        elif name == "swe_agent_status":
            result = await _handle_status()
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _fix_issue(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "sweagent not installed"}

    issue = args["issue"]
    repo = args["repo"]
    model = args.get("model", "gpt-4")
    max_cost = args.get("max_cost", 2.0)

    try:
        from sweagent.agent.agents import Agent, AgentConfig
        from sweagent.environment.swe_env import SWEEnv, EnvironmentArguments

        env_args = EnvironmentArguments(
            data_path=issue if issue.startswith("http") else f"text://{issue}",
            repo_path=repo,
        )
        env = SWEEnv(env_args)
        agent_config = AgentConfig(model_name=model, max_cost=max_cost)
        agent = Agent(agent_config)

        info = agent.run(env=env)
        return {
            "status": "success",
            "issue": issue[:100],
            "repo": repo,
            "model": model,
            "patch": info.get("submission", ""),
            "exit_status": info.get("exit_status", "unknown"),
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _run_command(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "sweagent not installed"}

    prompt = args["prompt"]
    repo = args["repo"]

    try:
        cmd = ["sweagent", "run", "--repo", repo, "--prompt", prompt, "--json"]
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)

        return {
            "status": "success" if proc.returncode == 0 else "error",
            "prompt": prompt[:100],
            "repo": repo,
            "output": stdout.decode()[:2000] if stdout else "",
            "errors": stderr.decode()[:500] if stderr and proc.returncode != 0 else "",
        }
    except asyncio.TimeoutError:
        return {"status": "error", "message": "SWE-Agent run timed out after 300s"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _handle_status() -> dict[str, Any]:
    return {
        "bridge": BRIDGE_NAME,
        "version": BRIDGE_VERSION,
        "description": BRIDGE_DESCRIPTION,
        "library_available": _LIB_AVAILABLE,
        "status": "ready" if _LIB_AVAILABLE else "library_missing",
    }


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
