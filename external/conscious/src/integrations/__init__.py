"""
Super-Goose External Tool Integrations

Bridge modules that wrap each external tool's functionality for use
by Goose agents via the Conscious bridge layer.

Each bridge module exposes a consistent interface:
  - init()        : Initialize the tool (lazy loading)
  - status()      : Check if tool is available and healthy
  - capabilities() : Return list of supported operations
  - execute()     : Run a specific operation with parameters

Tools are registered in config/external_tools.toml and discovered
at startup by the ToolRegistry.
"""

from pathlib import Path

INTEGRATIONS_DIR = Path(__file__).parent
CONFIG_DIR = INTEGRATIONS_DIR.parent.parent / "config"
EXTERNAL_DIR = INTEGRATIONS_DIR.parent.parent.parent  # G:\goose\external\

__all__ = [
    # Stage 5.5 — Wired
    "aider_bridge",
    "conscious_bridge",
    "langgraph_bridge",
    "openhands_bridge",
    "praisonai_bridge",
    "pydantic_ai_bridge",
    "registry",
    # Stage 6 — Resource Coordination
    "resource_coordinator",
    # Stage 6-7 — New Bridges
    "dspy_bridge",
    "inspect_bridge",
    "mem0_bridge",
    "overnight_gym",
    "microsandbox_bridge",
    "arrakis_bridge",
    "langfuse_bridge",
    "astgrep_bridge",
    "semgrep_bridge",
    "crosshair_bridge",
    "pr_agent_bridge",
]
